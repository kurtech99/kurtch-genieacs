const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const os = require('os');
const { getHotspotActive, getHotspotProfiles, createOrUpdateHotspotUser, loadConfig, saveConfig } = require('./mikrotik');
const wa = require('./whatsapp');
const { generateDevicesExcel } = require('./excel-export');

function getServerIp() {
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return '127.0.0.1';
}

const PORT = 3300;
const NBI_URL = 'http://127.0.0.1:7557';
const PUBLIC_DIR = path.join(__dirname, 'public');
const WIFI_DB_PATH = path.join(__dirname, 'wifi-passwords.json');

// Persistent Wi-Fi Password Database Helpers
function loadWifiPasswords() {
  try {
    if (fs.existsSync(WIFI_DB_PATH)) {
      const content = fs.readFileSync(WIFI_DB_PATH, 'utf8');
      return JSON.parse(content || '{}');
    }
  } catch (e) {
    console.error('Error reading wifi-passwords.json:', e.message);
  }
  return {};
}

function saveWifiPasswords(data) {
  try {
    fs.writeFileSync(WIFI_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Error writing wifi-passwords.json:', e.message);
    return false;
  }
}

// Telegram Bot Message Sender Helper
function sendTelegramMessage(botToken, chatId, text) {
  return new Promise((resolve) => {
    if (!botToken || !chatId || !text) return resolve({ success: false, message: 'Parameter botToken/chatId/text kosong' });
    const postData = JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    });

    const req = https.request({
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ success: json.ok === true, data: json });
        } catch (e) {
          resolve({ success: false, error: data });
        }
      });
    });
    req.on('error', e => resolve({ success: false, error: e.message }));
    req.write(postData);
    req.end();
  });
}


const SESSIONS_FILE = path.join(__dirname, 'sessions.json');
const SESSION_TTL_MS = 60 * 60 * 1000; // Tepat 1 Jam (3600 detik)

function loadSessionsFromDisk() {
  const map = new Map();
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const content = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const data = JSON.parse(content || '{}');
      const now = Date.now();
      for (const [token, sess] of Object.entries(data)) {
        if (sess && sess.expiresAt && sess.expiresAt > now) {
          map.set(token, sess);
        }
      }
    }
  } catch (e) {
    console.error('Error loading sessions.json:', e.message);
  }
  return map;
}

const sessions = loadSessionsFromDisk();
let sessionSaveTimeout = null;

function saveSessionsToDisk() {
  if (sessionSaveTimeout) clearTimeout(sessionSaveTimeout);
  sessionSaveTimeout = setTimeout(() => {
    try {
      const obj = {};
      const now = Date.now();
      for (const [token, sess] of sessions.entries()) {
        if (sess.expiresAt > now) {
          obj[token] = sess;
        }
      }
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing sessions.json:', e.message);
    }
  }, 500);
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)acs_session=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function isValidSession(req) {
  const cfg = loadConfig();
  if (cfg.auth && cfg.auth.enabled === false) return true;
  const token = getSessionToken(req);
  if (!token) return false;
  const sess = sessions.get(token);
  if (!sess) return false;
  if (Date.now() > sess.expiresAt) {
    sessions.delete(token);
    saveSessionsToDisk();
    return false;
  }
  return true;
}

function getSessionUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;
  return sessions.get(token) || null;
}

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, {
    username,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS // Tepat 1 jam aktif sejak login
  });
  saveSessionsToDisk();
  return token;
}

function destroySession(req) {
  const token = getSessionToken(req);
  if (token) {
    sessions.delete(token);
    saveSessionsToDisk();
  }
}

// Helper to query NBI
function nbiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(`${NBI_URL}${endpoint}`);
    const postData = body ? JSON.stringify(body) : null;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

// Safely extract parameter value
function getVal(obj, ...paths) {
  for (const p of paths) {
    const parts = p.split('.');
    let curr = obj;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        curr = null;
        break;
      }
    }
    if (curr !== null && curr !== undefined) {
      if (typeof curr === 'object' && '_value' in curr) {
        return curr._value;
      }
      return curr;
    }
  }
  return '';
}

// Parse raw device JSON into clean client object
function formatDevice(d) {
  const vp = d.VirtualParameters || {};
  const did = d.DeviceID || {};
  const wlan = d.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'] || {};

  // Check last inform from _lastInform (GenieACS standard root timestamp)
  const lastInformRaw = d._lastInform || d._timestamp || (d.Events && d.Events.Inform) || null;
  const informTime = lastInformRaw ? new Date(lastInformRaw).getTime() : 0;
  const diffSec = informTime > 0 ? Math.round((Date.now() - informTime) / 1000) : 999999;
  
  // ONT sends inform every ~300s (5m). Consider online if inform within 6 minutes (360s)
  const isOnline = diffSec <= 360;

  let lastSeenText = '-';
  if (informTime > 0) {
    if (diffSec < 60) {
      lastSeenText = `${diffSec} dtk lalu`;
    } else if (diffSec < 3600) {
      lastSeenText = `${Math.floor(diffSec / 60)} mnt lalu`;
    } else if (diffSec < 86400) {
      lastSeenText = `${Math.floor(diffSec / 3600)} jam lalu`;
    } else {
      lastSeenText = `${Math.floor(diffSec / 86400)} hari lalu`;
    }
  }

  const rxRaw = getVal(vp, 'RXPower');
  const rxNum = parseFloat(rxRaw) || null;
  let rxStatus = 'Bagus';
  let rxColor = 'green';
  if (rxNum !== null) {
    if (rxNum <= -27) {
      rxStatus = 'Bahaya';
      rxColor = 'red';
    } else if (rxNum <= -24) {
      rxStatus = 'Sedang';
      rxColor = 'yellow';
    }
  }

  // Check persistent Wi-Fi database by device ID, SN, or PPPoE username
  const wifiDb = loadWifiPasswords();
  const snVal = getVal(vp, 'getSerialNumber') || did.SerialNumber?._value || '';
  const pppoeVal = getVal(vp, 'pppoeUsername') || '';

  let storedWifi = wifiDb[d._id] || null;
  if (!storedWifi && snVal) {
    storedWifi = Object.values(wifiDb).find(x => x.sn && x.sn.toUpperCase() === snVal.toUpperCase()) || null;
  }
  if (!storedWifi && pppoeVal && pppoeVal !== '-') {
    storedWifi = Object.values(wifiDb).find(x => x.pppoeUser && x.pppoeUser.toLowerCase() === pppoeVal.toLowerCase()) || null;
  }

  const ontPsk = wlan.PreSharedKey?.['1']?.KeyPassphrase?._value ||
                 wlan.KeyPassphrase?._value ||
                 '';

  let psk = '******';
  let passwordKnown = false;

  if (ontPsk && ontPsk !== '******' && ontPsk.trim() !== '') {
    psk = ontPsk;
    passwordKnown = true;
  } else if (storedWifi && storedWifi.password && storedWifi.password.trim() !== '') {
    psk = storedWifi.password;
    passwordKnown = true;
  }

  const productModel = d._deviceId?._ProductClass || did.ProductClass?._value || did.ModelName?._value || 'Huawei ONT';

  return {
    id: d._id,
    name: getVal(vp, 'pppoeUsername') || did.ID?._value || d._id,
    pppoeUser: getVal(vp, 'pppoeUsername') || '-',
    pppoePass: getVal(vp, 'pppoePassword') || '******',
    pppoeIp: getVal(vp, 'AddressWanPPP') || '-',
    wanIp: getVal(vp, 'AddressWanIP') || '-',
    mac: getVal(vp, 'MacDevice') || '-',
    sn: snVal || '-',
    model: productModel,
    manufacturer: did.Manufacturer?._value || 'Huawei',
    ponMode: getVal(vp, 'getponmode') || 'GPON',
    rx: rxNum,
    rxStatus: rxStatus,
    rxColor: rxColor,
    temp: parseFloat(getVal(vp, 'gettemp')) || null,
    uptime: getVal(vp, 'getdeviceuptime') || '-',
    activeClients: parseInt(getVal(vp, 'activedevices')) || 0,
    lastSeen: lastSeenText,
    online: isOnline,
    ssid: (storedWifi && storedWifi.ssid) || wlan.SSID?._value || '-',
    password: psk,
    passwordKnown: passwordKnown,
    phone: (storedWifi && storedWifi.phone) || '',
    includeHotspot: Boolean(storedWifi?.includeHotspot || storedWifi?.hotspotUser),
    hotspotUser: (storedWifi && storedWifi.hotspotUser) || '',
    hotspotPass: (storedWifi && storedWifi.hotspotPass) || '',
    hotspotProfile: (storedWifi && storedWifi.hotspotProfile) || 'FREE Member',
    hotspotNote: (storedWifi && storedWifi.hotspotNote) || ''
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Parse Body helper available for all endpoints
  function readBody() {
    return new Promise(resolve => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({}); }
      });
    });
  }

  // Auth Redirections for HTML Pages
  if (pathname === '/' || pathname === '/index.html') {
    if (!isValidSession(req)) {
      res.writeHead(302, { 'Location': '/login.html' });
      return res.end();
    }
  }

  if (pathname === '/login.html') {
    if (isValidSession(req)) {
      res.writeHead(302, { 'Location': '/' });
      return res.end();
    }
  }

  // API: Login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const { username, password } = await readBody();
    const cfg = loadConfig();
    const authCfg = cfg.auth || { enabled: true, username: 'admin', password: 'admin' };

    const validUser = authCfg.username || 'admin';
    const validPass = authCfg.password || 'admin';

    if (username === validUser && password === validPass) {
      const token = createSession(username);
      const cookieVal = `acs_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieVal
      });
      return res.end(JSON.stringify({
        success: true,
        message: 'Login berhasil!',
        user: { username }
      }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        message: 'Username atau password salah!'
      }));
    }
  }

  // API: Logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    destroySession(req);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'acs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    });
    return res.end(JSON.stringify({ success: true, message: 'Logout berhasil' }));
  }

  // API: Auth Check (Current User)
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (isValidSession(req)) {
      const sess = getSessionUser(req);
      const cfg = loadConfig();
      const remainingSeconds = sess ? Math.max(0, Math.floor((sess.expiresAt - Date.now()) / 1000)) : 3600;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        authenticated: true,
        user: { username: sess?.username || cfg.auth?.username || 'admin' },
        remainingSeconds
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ authenticated: false }));
    }
  }

  // API: Change Admin Password
  if (pathname === '/api/auth/change-password' && req.method === 'POST') {
    if (!isValidSession(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Silakan login terlebih dahulu!' }));
    }

    const { currentPassword, newUsername, newPassword } = await readBody();
    const cfg = loadConfig();
    const authCfg = cfg.auth || { enabled: true, username: 'admin', password: 'admin' };

    if (currentPassword !== (authCfg.password || 'admin')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Password lama salah!' }));
    }

    if (!newPassword || newPassword.length < 4) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Password baru minimal 4 karakter!' }));
    }

    cfg.auth = {
      enabled: true,
      username: (newUsername && newUsername.trim()) || authCfg.username || 'admin',
      password: newPassword
    };
    saveConfig(cfg);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      message: 'Kredensial admin berhasil diperbarui!',
      user: { username: cfg.auth.username }
    }));
  }

  // API Authentication Guard for other /api/* endpoints
  if (pathname.startsWith('/api/')) {
    // Allow public access to brand identity config and system network (needed for login page & discovery)
    if ((pathname === '/api/brand/config' || pathname === '/api/system/network') && req.method === 'GET') {
      // Allowed
    } else if (!isValidSession(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        authenticated: false,
        message: 'Akses ditolak. Sesi login telah berakhir atau belum login.'
      }));
    }
  }

  // API: Get All Devices
  if (pathname === '/api/devices' && req.method === 'GET') {
    try {
      const response = await nbiRequest('GET', '/devices');
      const devices = Array.isArray(response.data) ? response.data.map(formatDevice) : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, count: devices.length, devices }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
  }

  // API: Export All Devices to Formatted Excel (.xlsx)
  if (pathname === '/api/export/excel' && req.method === 'GET') {
    try {
      const response = await nbiRequest('GET', '/devices');
      const devices = Array.isArray(response.data) ? response.data.map(formatDevice) : [];
      const cfg = loadConfig();
      const brandName = (cfg.brand && cfg.brand.name) || 'NOC PANEL';
      const buffer = await generateDevicesExcel(devices, brandName);

      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
      const cleanBrand = brandName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Data_ONT_${cleanBrand}_${dateStr}_${timeStr}.xlsx`;

      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length
      });
      return res.end(buffer);
    } catch (e) {
      console.error('Error generating Excel export:', e.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: e.message }));
    }
  }

  // API: Get Hotspot Active Users (MikroTik)
  if (pathname === '/api/hotspot/active' && req.method === 'GET') {
    try {
      const force = parsed.query && parsed.query.fresh === '1';
      const result = await getHotspotActive(force);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, count: 0, error: e.message }));
    }
  }

  // API: MikroTik Configuration (Get & Update)
  if (pathname === '/api/mikrotik/config') {
    if (req.method === 'GET') {
      const cfg = loadConfig();
      const mt = cfg.mikrotik || {};
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        config: {
          host: mt.host || '192.168.88.1',
          port: mt.port || 8728,
          user: mt.user || 'admin',
          password: mt.password || ''
        }
      }));
    }
    if (req.method === 'POST') {
      const body = await readBody();
      const curCfg = loadConfig();
      curCfg.mikrotik = {
        host: body.host || '192.168.88.1',
        port: parseInt(body.port) || 8728,
        user: body.user || 'admin',
        password: body.password !== undefined ? body.password : (curCfg.mikrotik?.password || ''),
        timeout: 4000
      };
      saveConfig(curCfg);
      const testRes = await getHotspotActive(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: testRes.connected ? 'Koneksi MikroTik Berhasil!' : 'Konfigurasi disimpan. MikroTik merespons: ' + (testRes.error || 'Gagal konek'),
        test: testRes
      }));
    }
  }

  // API: System Network Info (Dynamic DHCP IP)
  if (pathname === '/api/system/network' && req.method === 'GET') {
    const ip = getServerIp();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      success: true,
      serverIp: ip,
      cwmpUrl: `http://${ip}:7547`,
      panelUrl: `http://${ip}:${PORT}`,
      acsUrl: `http://${ip}:3000`
    }));
  }

  // API: MikroTik Hotspot User Profiles
  if (pathname === '/api/mikrotik/profiles' && req.method === 'GET') {
    try {
      const force = parsed.query && parsed.query.fresh === '1';
      const profiles = await getHotspotProfiles(force);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, profiles }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, profiles: [], error: e.message }));
    }
  }

  // API: Brand Identity (Get & Update)
  if (pathname === '/api/brand/config') {
    const curCfg = loadConfig();
    const serverIp = getServerIp();
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        brand: curCfg.brand || { name: 'NOC PANEL', badge: 'TR-069 & Hotspot • by Kurtech', logo: 'logo.png' },
        serverIp: serverIp,
        cwmpPort: 7547,
        acsPort: 3000,
        panelPort: PORT
      }));
    }
    if (req.method === 'POST') {
      const body = await readBody();
      curCfg.brand = {
        name: body.name || curCfg.brand?.name || 'NOC PANEL',
        badge: body.badge || curCfg.brand?.badge || 'TR-069 & Hotspot • by Kurtech',
        logo: body.logo || curCfg.brand?.logo || 'logo.png'
      };
      saveConfig(curCfg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Identitas brand berhasil disimpan!', brand: curCfg.brand, serverIp }));
    }
  }

  // API: Upload Brand Logo
  if (pathname === '/api/brand/upload-logo' && req.method === 'POST') {
    try {
      const { base64Data, filename } = await readBody();
      if (!base64Data) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Data gambar tidak ditemukan!' }));
      }

      const ext = path.extname(filename || 'logo.png').toLowerCase() || '.png';
      const safeFilename = 'custom-logo' + ext;
      const targetPath = path.join(PUBLIC_DIR, safeFilename);

      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(targetPath, Buffer.from(cleanBase64, 'base64'));

      const curCfg = loadConfig();
      curCfg.brand = curCfg.brand || {};
      curCfg.brand.logo = safeFilename;
      saveConfig(curCfg);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Logo baru berhasil diupload dan disimpan!',
        logo: safeFilename + '?t=' + Date.now()
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }



  // API: Change Wi-Fi SSID & Password & Customer Data
  if (pathname === '/api/device/wifi' && req.method === 'POST') {
    const { id, ssid, password, phone, includeHotspot, hotspotUser, hotspotPass, hotspotProfile, hotspotNote } = await readBody();
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID device wajib disertakan!' }));
    }

    const paramValues = [];
    if (ssid && ssid.trim()) {
      paramValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", ssid.trim(), "xsd:string"]);
    }
    if (password && password.trim()) {
      // NOTE: Send ONLY PreSharedKey.1.KeyPassphrase.
      // Standard TR-098 compatible across Huawei (HG8245H5, EG8141H5) & Fiberhome (HG6145D2).
      // DO NOT send PreSharedKey.1.PreSharedKey (causes Huawei SOAP Fault cwmp.9002 Internal error).
      paramValues.push(["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase", password.trim(), "xsd:string"]);
    }

    try {
      const encodedId = encodeURIComponent(id);

      // Hanya kirim perintah TR-069 jika ada SSID baru atau Password baru
      if (paramValues.length > 0) {
        // 1. Bersihkan task atau fault lama yang macet untuk device ini agar perintah baru langsung dieksekusi
        try {
          const tasksRes = await nbiRequest('GET', `/tasks?query=${encodeURIComponent(JSON.stringify({ device: id }))}`);
          if (Array.isArray(tasksRes.data)) {
            for (const t of tasksRes.data) {
              await nbiRequest('DELETE', `/tasks/${t._id}`).catch(() => {});
            }
          }
          const faultsRes = await nbiRequest('GET', `/faults?query=${encodeURIComponent(JSON.stringify({ device: id }))}`);
          if (Array.isArray(faultsRes.data)) {
            for (const f of faultsRes.data) {
              await nbiRequest('DELETE', `/faults/${encodeURIComponent(f._id)}`).catch(() => {});
            }
          }
        } catch (cleanErr) {
          console.error('Pembersihan antrean task lama:', cleanErr.message);
        }

        // 2. Kirim perintah setParameterValues ke GenieACS dengan connection_request
        await nbiRequest('POST', `/devices/${encodedId}/tasks?connection_request`, {
          name: 'setParameterValues',
          parameterValues: paramValues
        });
      }

      // 3. Simpan langsung ke database persisten wifi-passwords.json agar selalu terlihat di panel
      let dbRecord = null;
      let mtHotspotResult = null;

      try {
        const db = loadWifiPasswords();
        const devRes = await nbiRequest('GET', `/devices?query=${encodeURIComponent(JSON.stringify({ _id: id }))}`);
        let sn = '';
        let pppoe = '';
        if (Array.isArray(devRes.data) && devRes.data[0]) {
          const dObj = devRes.data[0];
          sn = dObj.DeviceID?.SerialNumber?._value || dObj.VirtualParameters?.getSerialNumber?._value || '';
          pppoe = dObj.VirtualParameters?.pppoeUsername?._value || '';
        }

        const selectedProfile = (hotspotProfile && hotspotProfile.trim()) || (db[id]?.hotspotProfile || 'FREE Member');

        // Otomatis masukkan / update ke MikroTik Hotspot User jika Free Hotspot dicentang
        if (includeHotspot && hotspotUser && String(hotspotUser).trim()) {
          try {
            const commentStr = 'by genieacs';
            mtHotspotResult = await createOrUpdateHotspotUser(
              String(hotspotUser).trim(),
              hotspotPass ? String(hotspotPass).trim() : '',
              selectedProfile,
              commentStr
            );
          } catch (mtErr) {
            console.error('Gagal sinkron user Free Hotspot ke MikroTik:', mtErr.message);
            mtHotspotResult = { success: false, error: mtErr.message };
          }
        }

        db[id] = {
          ssid: (ssid && ssid.trim()) || (db[id] ? db[id].ssid : ''),
          password: (password && password.trim()) || (db[id] ? db[id].password : ''),
          phone: (phone !== undefined ? String(phone).trim() : (db[id] ? db[id].phone : '')) || '',
          sn: sn || (db[id] ? db[id].sn : ''),
          pppoeUser: pppoe || (db[id] ? db[id].pppoeUser : ''),
          includeHotspot: Boolean(includeHotspot),
          hotspotUser: (hotspotUser !== undefined ? String(hotspotUser).trim() : (db[id]?.hotspotUser || '')),
          hotspotPass: (hotspotPass !== undefined ? String(hotspotPass).trim() : (db[id]?.hotspotPass || '')),
          hotspotProfile: selectedProfile,
          hotspotNote: (hotspotNote !== undefined ? String(hotspotNote).trim() : (db[id]?.hotspotNote || '')),
          updatedAt: new Date().toISOString()
        };
        saveWifiPasswords(db);
        dbRecord = db[id];
      } catch (saveErr) {
        console.error('Gagal menyimpan ke database sandi wifi:', saveErr.message);
      }

      let returnMsg = (paramValues.length > 0)
        ? 'Berhasil! Data Wi-Fi telah dikirim dan diterapkan ke modem.'
        : 'Berhasil! Data pelanggan & Akun Free Hotspot telah disimpan.';

      if (mtHotspotResult && mtHotspotResult.success) {
        returnMsg += ` User Hotspot (${hotspotUser}) otomatis ${mtHotspotResult.action === 'created' ? 'terdaftar' : 'diperbarui'} di Winbox MikroTik (Profile: ${mtHotspotResult.profile}).`;
      } else if (mtHotspotResult && !mtHotspotResult.success) {
        returnMsg += ` (Catatan MikroTik: ${mtHotspotResult.error})`;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: returnMsg,
        data: dbRecord,
        hotspotMikrotik: mtHotspotResult
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // API: Catat / Simpan Sandi Wi-Fi ke Panel tanpa kirim perintah TR-069
  if (pathname === '/api/device/save-password' && req.method === 'POST') {
    const { id, password, ssid } = await readBody();
    if (!id || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID dan Password wajib diisi!' }));
    }

    try {
      const db = loadWifiPasswords();
      const devRes = await nbiRequest('GET', `/devices?query=${encodeURIComponent(JSON.stringify({ _id: id }))}`);
      let sn = '';
      let pppoe = '';
      if (Array.isArray(devRes.data) && devRes.data[0]) {
        const dObj = devRes.data[0];
        sn = dObj.DeviceID?.SerialNumber?._value || dObj.VirtualParameters?.getSerialNumber?._value || '';
        pppoe = dObj.VirtualParameters?.pppoeUsername?._value || '';
      }
      db[id] = {
        ssid: (ssid && ssid.trim()) || (db[id] ? db[id].ssid : ''),
        password: password.trim(),
        sn: sn || (db[id] ? db[id].sn : ''),
        pppoeUser: pppoe || (db[id] ? db[id].pppoeUser : ''),
        updatedAt: new Date().toISOString()
      };
      saveWifiPasswords(db);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Sandi Wi-Fi berhasil dicatat ke panel!',
        data: db[id]
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // API: Simpan / Perbarui Nomor WhatsApp Pelanggan
  if (pathname === '/api/device/phone' && req.method === 'POST') {
    const { id, phone } = await readBody();
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID device wajib disertakan!' }));
    }

    try {
      const db = loadWifiPasswords();
      if (!db[id]) db[id] = {};
      db[id].phone = (phone || '').trim();
      db[id].updatedAt = new Date().toISOString();
      saveWifiPasswords(db);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Nomor WhatsApp pelanggan berhasil disimpan!',
        phone: db[id].phone
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // API: Change PPPoE Credentials
  if (pathname === '/api/device/pppoe' && req.method === 'POST') {
    const { id, username, password } = await readBody();
    if (!id || (!username && !password)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID dan minimal Username/Password wajib diisi!' }));
    }

    const paramValues = [];
    if (username) {
      paramValues.push(["InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username", username, "xsd:string"]);
    }
    if (password) {
      paramValues.push(["InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Password", password, "xsd:string"]);
    }

    try {
      const encodedId = encodeURIComponent(id);
      const result = await nbiRequest('POST', `/devices/${encodedId}/tasks?connection_request`, {
        name: 'setParameterValues',
        parameterValues: paramValues
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, message: 'Berhasil! Akun PPPoE dikirim ke Modem.', data: result.data }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // API: Reboot Device
  if (pathname === '/api/device/reboot' && req.method === 'POST') {
    const { id } = await readBody();
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID Device wajib disertakan!' }));
    }

    try {
      const encodedId = encodeURIComponent(id);
      const result = await nbiRequest('POST', `/devices/${encodedId}/tasks?connection_request`, {
        name: 'reboot'
      });

      if (result.status === 200 || result.status === 202) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          status: result.status,
          message: 'Berhasil! Perintah Restart telah diterima modem dan sedang diproses.',
          data: result.data
        }));
      } else if (result.status === 504) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          status: 504,
          message: 'Modem tidak merespons Connection Request (504 Gateway Timeout). Pastikan IP WAN/TR-069 modem dapat dijangkau server.'
        }));
      } else if (result.status === 401) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          status: 401,
          message: 'Autentikasi Connection Request ditolak oleh modem (401 Unauthorized). Periksa kredensial TR-069 di modem.'
        }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          status: result.status,
          message: `Gagal mengirim reboot: Status ${result.status} (${result.raw || result.data?.message || 'Error'})`
        }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Kesalahan internal server: ' + e.message }));
    }
  }

  // API: Refresh / Summon Device
  if (pathname === '/api/device/refresh' && req.method === 'POST') {
    const { id } = await readBody();
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID Device wajib disertakan!' }));
    }

    try {
      const encodedId = encodeURIComponent(id);
      const result = await nbiRequest('POST', `/devices/${encodedId}/tasks?connection_request`, {
        name: 'getParameterValues',
        parameterNames: [
          'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
          'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'
        ]
      });

      if (result.status === 200 || result.status === 202) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          status: result.status,
          message: 'Berhasil! Data live modem sedang diperbarui.',
          data: result.data
        }));
      } else if (result.status === 504) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          status: 504,
          message: 'Modem tidak merespons Summon (504 Gateway Timeout). Pastikan IP WAN/TR-069 modem aktif.'
        }));
      } else if (result.status === 401) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          status: 401,
          message: 'Summon ditolak oleh modem (401 Unauthorized). Kredensial Connection Request tidak cocok.'
        }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          status: result.status,
          message: `GenieACS error: Status ${result.status} (${result.raw || result.data?.message || 'Error'})`
        }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // API: Get Connected Clients (Associated Devices & Hosts)
  if (pathname === '/api/device/clients' && req.method === 'GET') {
    const id = parsed.query && parsed.query.id;
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'ID device wajib disertakan!' }));
    }

    try {
      const devRes = await nbiRequest('GET', `/devices?query=${encodeURIComponent(JSON.stringify({ _id: id }))}`);
      if (!Array.isArray(devRes.data) || !devRes.data[0]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Perangkat tidak ditemukan' }));
      }

      const d = devRes.data[0];
      const wlan = d.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'] || {};
      const assoc = wlan.AssociatedDevice || {};
      const hosts = d.InternetGatewayDevice?.LANDevice?.['1']?.Hosts?.Host || {};

      const clients = [];

      // Loop Wi-Fi Associated Devices
      for (const [key, dev] of Object.entries(assoc)) {
        if (key.startsWith('_') || typeof dev !== 'object') continue;
        const mac = (dev.AssociatedDeviceMACAddress?._value || '').toUpperCase();
        if (!mac) continue;

        let hostname = dev.X_HW_AssociatedDevicedescriptions?._value || '';
        let ip = dev.AssociatedDeviceIPAddress?._value || '';

        // If not in Huawei X_HW field, search in Hosts
        for (const [hKey, hVal] of Object.entries(hosts)) {
          if (hKey.startsWith('_') || typeof hVal !== 'object') continue;
          const hMac = (hVal.MACAddress?._value || '').toUpperCase();
          if (hMac === mac) {
            if (!hostname && hVal.HostName?._value) hostname = hVal.HostName._value;
            if (!ip && hVal.IPAddress?._value) ip = hVal.IPAddress._value;
            break;
          }
        }

        const rssi = dev.X_HW_RSSI?._value || null;
        const snr = dev.X_HW_SNR?._value || null;
        const quality = dev.X_HW_SingalQuality?._value || null;

        clients.push({
          mac: mac,
          ip: ip || '-',
          hostname: hostname || 'Perangkat Wi-Fi',
          rssi: rssi ? `${rssi} dBm` : '-',
          snr: snr ? `${snr} dB` : '-',
          quality: quality ? `${quality}%` : '-',
          type: 'Wi-Fi'
        });
      }

      // Also check Hosts for any active wired/LAN devices
      for (const [hKey, hVal] of Object.entries(hosts)) {
        if (hKey.startsWith('_') || typeof hVal !== 'object') continue;
        if (!hVal.Active?._value) continue;
        const hMac = (hVal.MACAddress?._value || '').toUpperCase();
        if (!hMac) continue;
        const already = clients.find(c => c.mac === hMac);
        if (!already) {
          clients.push({
            mac: hMac,
            ip: hVal.IPAddress?._value || '-',
            hostname: hVal.HostName?._value || 'Perangkat LAN/Kabel',
            rssi: 'LAN (Kabel)',
            snr: '-',
            quality: '100%',
            type: 'LAN'
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        count: clients.length,
        clients: clients
      }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: e.message }));
    }
  }

  // API: Ping Diagnostic Test
  if (pathname === '/api/device/ping' && req.method === 'POST') {
    const { ip } = await readBody();
    if (!ip || ip === '-') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'IP target tidak valid!' }));
    }

    const isWin = process.platform === 'win32';
    const pingCmd = isWin ? `ping -n 3 -w 1000 ${ip}` : `ping -c 3 -W 1 ${ip}`;

    exec(pingCmd, (error, stdout) => {
      let min = null, max = null, avg = null, loss = 100;
      const outText = stdout || '';
      
      if (isWin) {
        const lossMatch = outText.match(/Lost = \d+ \((\d+)% loss\)/i);
        if (lossMatch) loss = parseInt(lossMatch[1]);

        const timeMatch = outText.match(/Minimum = (\d+)ms, Maximum = (\d+)ms, Average = (\d+)ms/i);
        if (timeMatch) {
          min = parseInt(timeMatch[1]);
          max = parseInt(timeMatch[2]);
          avg = parseInt(timeMatch[3]);
        }
      } else {
        // Linux / Unix output
        const lossMatch = outText.match(/(\d+)% packet loss/i);
        if (lossMatch) loss = parseInt(lossMatch[1]);

        const rttMatch = outText.match(/(?:rtt|round-trip) min\/avg\/max\/(?:mdev|stddev) = ([\d.]+)\/([\d.]+)\/([\d.]+)/i);
        if (rttMatch) {
          min = Math.round(parseFloat(rttMatch[1]));
          avg = Math.round(parseFloat(rttMatch[2]));
          max = Math.round(parseFloat(rttMatch[3]));
        }
      }

      const isConnected = loss < 100;
      let statusText = 'Normal';
      let statusColor = 'green';
      if (loss > 0 && loss < 100) {
        statusText = `Ada RTO (${loss}% packet loss)`;
        statusColor = 'yellow';
      } else if (loss === 100) {
        statusText = 'RTO Total (100% loss)';
        statusColor = 'red';
      } else if (avg !== null && avg > 100) {
        statusText = `Ping Tinggi (${avg}ms)`;
        statusColor = 'yellow';
      } else {
        statusText = `Sangat Bagus (${avg}ms)`;
        statusColor = 'green';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        connected: isConnected,
        ip: ip,
        loss: loss,
        min: min,
        max: max,
        avg: avg,
        statusText: statusText,
        statusColor: statusColor,
        raw: stdout
      }));
    });
    return;
  }

  // API: Telegram Test Notification
  // API: Telegram Test Notification
  if (pathname === '/api/telegram/test' && req.method === 'POST') {
    const { botToken, chatId } = await readBody();
    const cfg = loadConfig();
    const token = botToken || cfg.telegram?.botToken || cfg.notifications?.telegram?.botToken;
    const chat = chatId || cfg.telegram?.chatId || cfg.notifications?.telegram?.chatId;

    if (!token || !chat) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Bot Token dan Chat ID wajib diisi!' }));
    }

    const brandName = cfg.brand?.name || 'NOC PANEL';
    const testMsg = `🚀 <b>TEST NOTIFIKASI NOC ${brandName}</b>\n\n✅ Bot Telegram berhasil terhubung ke Panel TR-069!\nNotifikasi otomatis siap memantau kabel putus (LOS) dan redaman kritis.\n\n⏱️ <i>Waktu: ${new Date().toLocaleString('id-ID')}</i>`;

    const tgRes = await sendTelegramMessage(token, chat, testMsg);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(tgRes));
  }

  // API: WhatsApp Status
  if (pathname === '/api/whatsapp/status' && req.method === 'GET') {
    const st = wa.getWhatsAppStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, ...st }));
  }

  // API: WhatsApp Connect / Get QR or Pairing Code
  if (pathname === '/api/whatsapp/connect' && req.method === 'POST') {
    try {
      const body = await readBody();
      const mode = (body && body.mode) || 'qr';
      const phone = (body && body.phone) || null;
      const result = await wa.initWhatsApp({ mode, phone });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, ...result }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // API: WhatsApp Logout
  if (pathname === '/api/whatsapp/logout' && req.method === 'POST') {
    try {
      const result = await wa.logoutWhatsApp();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // API: WhatsApp Test Notification
  if (pathname === '/api/whatsapp/test' && req.method === 'POST') {
    const { phone } = await readBody();
    const cfg = loadConfig();
    const target = (phone && phone.trim()) || cfg.notifications?.adminPhone || cfg.telegram?.adminPhone;

    if (!target) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Nomor WhatsApp admin tujuan wajib diisi!' }));
    }

    const brandName = cfg.brand?.name || 'NOC PANEL';
    const testMsg = `🚀 *TEST NOTIFIKASI BOT WHATSAPP ${brandName}*\n\n✅ Bot WhatsApp berhasil terhubung ke Panel ACS!\nSistem siap mengirim notifikasi otomatis kabel putus (LOS) dan info Wi-Fi ke pelanggan.\n\n⏱️ _Waktu: ${new Date().toLocaleString('id-ID')}_`;

    const waRes = await wa.sendWhatsAppMessage(target, testMsg);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(waRes));
  }

  // API: Send Wi-Fi info directly to customer WhatsApp via bot
  if (pathname === '/api/whatsapp/send-wifi' && req.method === 'POST') {
    const { id, phone, ssid, password, includeHotspot, hotspotUser, hotspotPass, hotspotProfile, hotspotNote } = await readBody();
    if (!phone || !phone.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, message: 'Nomor WhatsApp pelanggan wajib diisi!' }));
    }

    const cfg = loadConfig();
    const brandName = cfg.brand?.name || 'NOC PANEL';

    let clientName = 'Pelanggan';
    let pppoeUser = '';
    let snStr = '';
    try {
      const devRes = await nbiRequest('GET', `/devices?query=${encodeURIComponent(JSON.stringify({ _id: id }))}`);
      if (Array.isArray(devRes.data) && devRes.data[0]) {
        clientName = devRes.data[0].VirtualParameters?.pppoeUsername?._value || clientName;
        pppoeUser = devRes.data[0].VirtualParameters?.pppoeUsername?._value || '';
        snStr = devRes.data[0].DeviceID?.SerialNumber?._value || '';
      }
    } catch (e) {}

    const selectedProfile = (hotspotProfile && hotspotProfile.trim()) || 'FREE Member';

    // Otomatis sinkron ke MikroTik Hotspot jika Free Hotspot dicentang
    let mtHotspotResult = null;
    if (includeHotspot && hotspotUser && String(hotspotUser).trim()) {
      try {
        const commentStr = 'by genieacs';
        mtHotspotResult = await createOrUpdateHotspotUser(
          String(hotspotUser).trim(),
          hotspotPass ? String(hotspotPass).trim() : '',
          selectedProfile,
          commentStr
        );
      } catch (mtErr) {
        console.error('Gagal sinkron Hotspot User via WhatsApp handler:', mtErr.message);
        mtHotspotResult = { success: false, error: mtErr.message };
      }
    }

    // Save phone and hotspot data to local database
    if (id) {
      try {
        const db = loadWifiPasswords();
        if (!db[id]) db[id] = {};
        db[id].phone = phone.trim();
        if (password && password.trim()) db[id].password = password.trim();
        if (ssid && ssid.trim()) db[id].ssid = ssid.trim();
        db[id].includeHotspot = Boolean(includeHotspot);
        if (hotspotUser !== undefined) db[id].hotspotUser = String(hotspotUser).trim();
        if (hotspotPass !== undefined) db[id].hotspotPass = String(hotspotPass).trim();
        db[id].hotspotProfile = selectedProfile;
        if (hotspotNote !== undefined) db[id].hotspotNote = String(hotspotNote).trim();
        db[id].updatedAt = new Date().toISOString();
        saveWifiPasswords(db);
      } catch (e) {}
    }

    const passText = (password && password.trim()) ? password.trim() : '(Tetap sesuai sandi lama yang terpasang di modem Anda)';
    const catatanSandiLama = (!password || !password.trim()) ? `\n_(Catatan: Sandi Wi-Fi tetap memakai sandi lama di modem Anda. Jika ingin mengganti sandi baru, silakan hubungi admin kami)._` : '';

    const defaultTpl = `Halo Bapak/Ibu *{nama}*,\n\nBerikut adalah rincian informasi koneksi internet dan Wi-Fi Anda:\n\n📶 *Nama Wi-Fi (SSID):* {ssid}\n🔑 *Password Wi-Fi:* {password}\n{catatan}\n\nSilakan sambungkan kembali HP atau laptop Anda dengan password di atas.\n\nTerima kasih telah berlangganan layanan *{brand}*!`;
    const cfgNow = loadConfig();
    const rawTemplate = cfgNow.notifications?.wifiMsgTemplate || cfgNow.wifiMsgTemplate || defaultTpl;

    let text = rawTemplate
      .replace(/{nama}|{name}/gi, clientName)
      .replace(/{ssid}/gi, ssid || '-')
      .replace(/{password}|{pass}/gi, passText)
      .replace(/{brand}/gi, brandName)
      .replace(/{catatan}/gi, catatanSandiLama);

    // Bersihkan baris kosong berlebih
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    const sendRes = await wa.sendWhatsAppMessage(phone.trim(), text);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ...sendRes, hotspotMikrotik: mtHotspotResult }));
  }

  // API: Notification Config (Get & Update - supports Telegram, WhatsApp, or Both)
  if ((pathname === '/api/telegram/config' || pathname === '/api/notifications/config')) {
    const cfg = loadConfig();
    const notif = cfg.notifications || {};
    const tg = cfg.telegram || notif.telegram || {};
    if (req.method === 'GET') {
      const defaultTpl = `Halo Bapak/Ibu *{nama}*,\n\nBerikut adalah rincian informasi koneksi internet dan Wi-Fi Anda:\n\n📶 *Nama Wi-Fi (SSID):* {ssid}\n🔑 *Password Wi-Fi:* {password}\n{catatan}\n\nSilakan sambungkan kembali HP atau laptop Anda dengan password di atas.\n\nTerima kasih telah berlangganan layanan *{brand}*!`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        channel: notif.channel || 'telegram', // 'telegram' | 'whatsapp' | 'both'
        adminPhone: notif.adminPhone || '',
        wifiMsgTemplate: notif.wifiMsgTemplate || cfg.wifiMsgTemplate || defaultTpl,
        telegram: {
          enabled: Boolean(tg.enabled),
          botToken: tg.botToken || '',
          chatId: tg.chatId || '',
          alertLos: tg.alertLos !== false,
          alertRedaman: tg.alertRedaman !== false
        },
        whatsapp: {
          enabled: Boolean(waCfg.enabled ?? true),
          alertLos: waCfg.alertLos !== false,
          alertRedaman: waCfg.alertRedaman !== false,
          notifyCustomerLos: waCfg.notifyCustomerLos !== false
        },
        // Backwards compatibility for frontend
        config: {
          channel: notif.channel || 'telegram',
          adminPhone: notif.adminPhone || '',
          enabled: Boolean(tg.enabled),
          botToken: tg.botToken || '',
          chatId: tg.chatId || '',
          alertLos: tg.alertLos !== false,
          alertRedaman: tg.alertRedaman !== false
        }
      }));
    }

    if (req.method === 'POST') {
      const body = await readBody();

      const channel = body.channel || 'telegram';
      const adminPhone = (body.adminPhone && body.adminPhone.trim()) || '';
      const wifiMsgTemplate = (typeof body.wifiMsgTemplate === 'string') ? body.wifiMsgTemplate : undefined;

      const tgData = {
        enabled: Boolean(body.telegram?.enabled ?? body.enabled),
        botToken: (body.telegram?.botToken || body.botToken || '').trim(),
        chatId: (body.telegram?.chatId || body.chatId || '').trim(),
        alertLos: body.telegram?.alertLos ?? (body.alertLos !== false),
        alertRedaman: body.telegram?.alertRedaman ?? (body.alertRedaman !== false)
      };

      const waData = {
        enabled: Boolean(body.whatsapp?.enabled ?? true),
        alertLos: body.whatsapp?.alertLos ?? (body.alertLos !== false),
        alertRedaman: body.whatsapp?.alertRedaman ?? (body.alertRedaman !== false),
        notifyCustomerLos: body.whatsapp?.notifyCustomerLos ?? (body.notifyCustomerLos !== false)
      };

      cfg.notifications = {
        channel,
        adminPhone,
        wifiMsgTemplate: wifiMsgTemplate !== undefined ? wifiMsgTemplate : (cfg.notifications?.wifiMsgTemplate || cfg.wifiMsgTemplate),
        telegram: tgData,
        whatsapp: waData
      };
      if (wifiMsgTemplate !== undefined) cfg.wifiMsgTemplate = wifiMsgTemplate;
      cfg.telegram = tgData;

      saveConfig(cfg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        message: 'Pengaturan notifikasi berhasil disimpan!',
        notifications: cfg.notifications
      }));
    }
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(content);
  });
});

// Background Watcher: Multi-Channel Alerts (Telegram & WhatsApp)
const SERVER_BOOT_TIME = Date.now();
const BOOT_GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 menit pertama masa pemanasan setelah komputer/server nyala
const alertStates = new Map(); // id -> { losAlerted: bool, rxAlerted: bool, firstOfflineTime: number|null }
let lastMassOutageNoticeTime = 0;

setInterval(async () => {
  try {
    const cfg = loadConfig();
    const notif = cfg.notifications || {};
    const channel = notif.channel || (cfg.telegram?.enabled ? 'telegram' : 'none');

    const tg = cfg.telegram || notif.telegram || {};
    const tgActive = (channel === 'telegram' || channel === 'both') && tg.enabled && tg.botToken && tg.chatId;

    const waCfg = notif.whatsapp || {};
    const waStatus = wa.getWhatsAppStatus();
    const waActive = (channel === 'whatsapp' || channel === 'both') && waCfg.enabled && notif.adminPhone && waStatus.connected;

    if (!tgActive && !waActive) return;

    const res = await nbiRequest('GET', '/devices');
    if (!Array.isArray(res.data) || res.data.length === 0) return;

    const brandName = cfg.brand?.name || 'NOC PANEL';
    const now = Date.now();
    const wifiDb = loadWifiPasswords();

    // 1. Cek Masa Pemanasan Komputer/Server (Grace Period 10 Menit saat PC Baru Menyala)
    const serverUptimeMs = now - SERVER_BOOT_TIME;
    const isWarmingUp = serverUptimeMs < BOOT_GRACE_PERIOD_MS;

    // 2. Proteksi Gangguan Massal (Mati Lampu PLN / OLT Mati / Komputer Sempat Mati)
    const totalDevices = res.data.length;
    let offlineCount = 0;
    for (const d of res.data) {
      const lastInform = d._lastInform ? new Date(d._lastInform).getTime() : 0;
      const diffSec = lastInform > 0 ? Math.round((now - lastInform) / 1000) : 999999;
      if (diffSec > 360) offlineCount++;
    }
    const isMassOutage = totalDevices >= 4 && (offlineCount / totalDevices) >= 0.4;

    // Jika terjadi mati lampu massal atau server baru nyala dengan banyak modem offline,
    // jangan spam pesan ke nomor pelanggan! Cukup kirim 1 info ke WhatsApp Admin.
    if (isMassOutage && !isWarmingUp && (now - lastMassOutageNoticeTime > 30 * 60 * 1000)) {
      lastMassOutageNoticeTime = now;
      const massMsg = `⚠️ *[INFO NOC ${brandName}: TERDETEKSI GANGGUAN MASSAL]*\n\nTerdeteksi *${offlineCount} dari ${totalDevices}* modem offline secara bersamaan.\nKemungkinan: Pemadaman listrik PLN area, jalur OLT utama, atau server baru menyala.\n\n_Pesan otomatis ke WhatsApp masing-masing pelanggan DITAHAN agar tidak menimbulkan kepanikan._`;
      if (waActive) wa.sendWhatsAppMessage(notif.adminPhone, massMsg).catch(() => {});
      if (tgActive) sendTelegramMessage(tg.botToken, tg.chatId, `⚠️ <b>[INFO NOC: GANGGUAN MASSAL]</b>\n${offlineCount} dari ${totalDevices} modem offline serentak. Notif pelanggan ditahan.`).catch(() => {});
    }

    for (const d of res.data) {
      const id = d._id;
      if (!alertStates.has(id)) {
        alertStates.set(id, { losAlerted: false, rxAlerted: false, firstOfflineTime: null });
      }
      const state = alertStates.get(id);

      const pppoe = d.VirtualParameters?.pppoeUsername?._value || d._id;
      const sn = d.DeviceID?.SerialNumber?._value || d.VirtualParameters?.getSerialNumber?._value || '-';
      const lastInform = d._lastInform ? new Date(d._lastInform).getTime() : 0;
      const diffSec = lastInform > 0 ? Math.round((now - lastInform) / 1000) : 999999;
      const isOnline = diffSec <= 360;

      // Customer Phone Lookup
      let storedWifi = wifiDb[id] || null;
      if (!storedWifi && sn && sn !== '-') {
        storedWifi = Object.values(wifiDb).find(x => x.sn && x.sn.toUpperCase() === sn.toUpperCase()) || null;
      }
      if (!storedWifi && pppoe && pppoe !== '-') {
        storedWifi = Object.values(wifiDb).find(x => x.pppoeUser && x.pppoeUser.toLowerCase() === pppoe.toLowerCase()) || null;
      }
      const customerPhone = (storedWifi && storedWifi.phone) ? String(storedWifi.phone).trim() : null;
      const customerName = (storedWifi && storedWifi.pppoeUser) || pppoe || 'Pelanggan';

      // Track berapa lama modem ini terdeteksi offline SEJAK server aktif berjalan
      if (isOnline) {
        state.firstOfflineTime = null;
      } else if (!state.firstOfflineTime) {
        state.firstOfflineTime = now;
      }
      const continuousOfflineMs = state.firstOfflineTime ? (now - state.firstOfflineTime) : 0;

      const rxVal = parseFloat(d.VirtualParameters?.RXPower?._value) || null;

      // 1. Alert LOS / Offline
      // Syarat kirim alert:
      // a) Bukan masa pemanasan server (isWarmingUp === false)
      // b) Bukan mati lampu massal (isMassOutage === false)
      // c) Modem terbukti offline terus-menerus selama >= 10 menit sejak server berjalan
      const wantLos = (tgActive && tg.alertLos) || (waActive && waCfg.alertLos);
      if (wantLos && !isWarmingUp) {
        const isConfirmedLos = !isOnline && diffSec > 600 && continuousOfflineMs >= 600000;

        if (isConfirmedLos && !state.losAlerted && !isMassOutage) {
          state.losAlerted = true;

          // Kirim ke Telegram Admin NOC
          if (tgActive && tg.alertLos) {
            const msg = `⚠️ <b>[ALERT: MODEM OFFLINE / KABEL PUTUS]</b>\n\n🏢 <b>Server:</b> ${brandName}\n👤 <b>Pelanggan:</b> ${pppoe}\n📟 <b>SN:</b> <code>${sn}</code>\n⏱️ <b>Status:</b> Tidak ada sinyal sejak ${Math.round(diffSec / 60)} menit lalu.\n\n<i>Mohon teknisi melakukan pengecekan jalur/tiang.</i>`;
            sendTelegramMessage(tg.botToken, tg.chatId, msg).catch(() => {});
          }

          // Kirim ke WhatsApp Admin NOC
          if (waActive && waCfg.alertLos) {
            const waMsg = `⚠️ *[ALERT NOC ${brandName}: MODEM OFFLINE / KABEL PUTUS]*\n\n👤 *Pelanggan:* ${pppoe}\n📟 *SN:* \`${sn}\`\n⏱️ *Status:* Tidak ada sinyal sejak ${Math.round(diffSec / 60)} menit lalu.\n\n_Mohon teknisi segera melakukan pengecekan jalur/kabel dropcore._`;
            wa.sendWhatsAppMessage(notif.adminPhone, waMsg).catch(() => {});
          }

          // Kirim Otomatis ke WhatsApp Pelanggan (hanya jika gangguan kabel individual)
          if (waStatus.connected && waCfg.notifyCustomerLos !== false && customerPhone) {
            const custMsg = `Halo Bapak/Ibu *${customerName}*,\n\nPemberitahuan dari layanan internet *${brandName}*:\nModem Wi-Fi Anda saat ini terdeteksi *OFFLINE / Tidak Terhubung* sejak 10 menit yang lalu.\n\nMohon lakukan pengecekan berikut:\n1. Pastikan adaptor listrik modem tetap menyala.\n2. Pastikan kabel optik terpasang baik dan lampu merah (LOS) tidak menyala/berkedip.\n\nJika colokan listrik menyala dan lampu LOS menyala merah, kemungkinan terjadi gangguan pada jalur kabel optik dan tim teknisi kami sedang melakukan pengecekan.\n\nTerima kasih atas pengertiannya.\n*Layanan Pelanggan ${brandName}*`;
            wa.sendWhatsAppMessage(customerPhone, custMsg).catch((e) => {
              console.error(`[WhatsApp] Gagal kirim notif LOS ke pelanggan ${customerPhone}:`, e.message);
            });
          }
        } else if (isOnline && state.losAlerted) {
          state.losAlerted = false;

          // Kirim Pemulihan ke Telegram Admin NOC
          if (tgActive && tg.alertLos) {
            const msg = `✅ <b>[RESOLVED: MODEM KEMBALI ONLINE]</b>\n\n🏢 <b>Server:</b> ${brandName}\n👤 <b>Pelanggan:</b> ${pppoe}\n📟 <b>SN:</b> <code>${sn}</code>\n🟢 <b>Status:</b> Sudah kembali ONLINE normal.`;
            sendTelegramMessage(tg.botToken, tg.chatId, msg).catch(() => {});
          }

          // Kirim Pemulihan ke WhatsApp Admin NOC
          if (waActive && waCfg.alertLos) {
            const waMsg = `✅ *[RESOLVED NOC ${brandName}: MODEM KEMBALI ONLINE]*\n\n👤 *Pelanggan:* ${pppoe}\n📟 *SN:* \`${sn}\`\n🟢 *Status:* Sudah kembali ONLINE normal.`;
            wa.sendWhatsAppMessage(notif.adminPhone, waMsg).catch(() => {});
          }

          // Kirim Pemulihan Otomatis ke WhatsApp Pelanggan
          if (waStatus.connected && waCfg.notifyCustomerLos !== false && customerPhone) {
            const custResolvedMsg = `Halo Bapak/Ibu *${customerName}*,\n\nKabar baik! Koneksi internet Wi-Fi *${brandName}* Anda saat ini sudah kembali *ONLINE* dan normal.\n\nSelamat beraktivitas kembali bersama kami! Jika masih ada kendala, silakan hubungi tim kami.\n\nTerima kasih.\n*Layanan Pelanggan ${brandName}*`;
            wa.sendWhatsAppMessage(customerPhone, custResolvedMsg).catch((e) => {
              console.error(`[WhatsApp] Gagal kirim notif online ke pelanggan ${customerPhone}:`, e.message);
            });
          }
        }
      }

      // 2. Alert Redaman Bahaya (<= -27 dBm)
      const wantRx = (tgActive && tg.alertRedaman) || (waActive && waCfg.alertRedaman);
      if (wantRx && rxVal !== null) {
        if (rxVal <= -27 && !state.rxAlerted) {
          state.rxAlerted = true;
          if (tgActive && tg.alertRedaman) {
            const msg = `🔴 <b>[ALERT: REDAMAN FIBER KRITIS]</b>\n\n🏢 <b>Server:</b> ${brandName}\n👤 <b>Pelanggan:</b> ${pppoe}\n📟 <b>SN:</b> <code>${sn}</code>\n⚡ <b>Redaman RX:</b> <b>${rxVal} dBm (BAHAYA)</b>\n\n<i>Kabel optik mengalami bending/loss tinggi. Harap periksa konektor/tiang.</i>`;
            sendTelegramMessage(tg.botToken, tg.chatId, msg).catch(() => {});
          }
          if (waActive && waCfg.alertRedaman) {
            const waMsg = `🔴 *[ALERT NOC ${brandName}: REDAMAN FIBER KRITIS]*\n\n👤 *Pelanggan:* ${pppoe}\n📟 *SN:* \`${sn}\`\n⚡ *Redaman RX:* *${rxVal} dBm (BAHAYA)*\n\n_Kabel optik mengalami bending/loss tinggi. Harap periksa konektor/tiang._`;
            wa.sendWhatsAppMessage(notif.adminPhone, waMsg).catch(() => {});
          }
        } else if (rxVal > -27 && state.rxAlerted) {
          state.rxAlerted = false;
          if (tgActive && tg.alertRedaman) {
            const msg = `🟢 <b>[RESOLVED: REDAMAN KEMBALI NORMAL]</b>\n\n🏢 <b>Server:</b> ${brandName}\n👤 <b>Pelanggan:</b> ${pppoe}\n📟 <b>SN:</b> <code>${sn}</code>\n⚡ <b>Redaman RX:</b> <b>${rxVal} dBm (Bagus)</b>`;
            sendTelegramMessage(tg.botToken, tg.chatId, msg).catch(() => {});
          }
          if (waActive && waCfg.alertRedaman) {
            const waMsg = `🟢 *[RESOLVED NOC ${brandName}: REDAMAN KEMBALI NORMAL]*\n\n👤 *Pelanggan:* ${pppoe}\n📟 *SN:* \`${sn}\`\n⚡ *Redaman RX:* *${rxVal} dBm (Bagus)*`;
            wa.sendWhatsAppMessage(notif.adminPhone, waMsg).catch(() => {});
          }
        }
      }
    }
  } catch (err) {}
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getServerIp();
  console.log(`===============================================`);
  console.log(`🚀 GENIEACS TR-069 + NOC PANEL (BY KURTECH)`);
  console.log(`🌐 Official: https://kurtech.my.id`);
  console.log(`📡 Akses Lokal:   http://localhost:${PORT}`);
  console.log(`🌐 Akses Jaringan (DHCP): http://${localIp}:${PORT}`);
  console.log(`📡 URL CWMP ONT:  http://${localIp}:7547`);
  console.log(`☕ Traktir Kopi:  http://localhost:${PORT}/support.html`);
  console.log(`===============================================`);
});
