const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, 'wa-session');

let sock = null;
let currentQrDataUrl = null;
let currentPairingCode = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
let connectedUser = null;
let reconnectTimer = null;
let isExplicitLogout = false;

// Format standard Indonesian / international phone number to WhatsApp JID
function formatToJid(phone) {
  if (!phone) return null;
  let cleaned = String(phone).trim().replace(/[\s\-\+\(\)]/g, '');
  if (cleaned.includes('@s.whatsapp.net') || cleaned.includes('@g.us')) {
    return cleaned;
  }
  // Convert 08xxx to 628xxx
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (!cleaned.startsWith('62') && cleaned.length >= 9 && cleaned.length <= 13) {
    cleaned = '62' + cleaned;
  }
  return `${cleaned}@s.whatsapp.net`;
}

function cleanSessionFolder() {
  try {
    if (fs.existsSync(SESSION_DIR)) {
      fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  } catch (e) {
    console.error('[WhatsApp] Gagal bersihkan session folder:', e.message);
  }
}

async function initWhatsApp(options = {}) {
  const { onUpdate, mode = 'qr', phone = null } = options;

  if (sock && connectionStatus === 'connected') {
    return { status: connectionStatus, connected: true, user: connectedUser };
  }

  isExplicitLogout = false;
  connectionStatus = 'connecting';
  currentQrDataUrl = null;
  currentPairingCode = null;

  // If restoring after 515 (restartRequired), do not wipe session
  const isRestore = mode === 'restore';

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      Browsers,
      fetchLatestBaileysVersion
    } = await import('@whiskeysockets/baileys');
    const QRCode = (await import('qrcode')).default || await import('qrcode');
    const pino = (await import('pino')).default || await import('pino');

    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    // If starting a fresh connection (not restoring) and no registered creds, clean session to avoid corrupted keys
    if (!isRestore) {
      const credsPath = path.join(SESSION_DIR, 'creds.json');
      let isRegistered = false;
      if (fs.existsSync(credsPath)) {
        try {
          const credsData = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
          if (credsData && credsData.registered) {
            isRegistered = true;
          }
        } catch (e) {}
      }
      if (!isRegistered) {
        cleanSessionFolder();
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    let version = [2, 3000, 1043857760];
    try {
      const vData = await fetchLatestBaileysVersion();
      if (vData && vData.version) version = vData.version;
    } catch (ve) {
      console.warn('[WhatsApp] Gagal fetch version terbaru, pakai default:', ve.message);
    }

    // Close any previous socket cleanly
    if (sock) {
      try { sock.ev.removeAllListeners('connection.update'); } catch (e) {}
      try { sock.end(); } catch (e) {}
      sock = null;
    }

    const mySock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: true,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 15000
    });
    sock = mySock;

    mySock.ev.on('creds.update', saveCreds);

    // If Pairing Code mode is requested
    if (mode === 'code' && phone && !mySock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          if (sock !== mySock) return;
          let cleaned = String(phone).trim().replace(/[\s\-\+\(\)]/g, '');
          if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
          if (!cleaned.startsWith('62')) cleaned = '62' + cleaned;

          const rawCode = await mySock.requestPairingCode(cleaned);
          currentPairingCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
          console.log('[WhatsApp] Berhasil generate Kode Pasangkan:', currentPairingCode, 'untuk:', cleaned);
          if (onUpdate) onUpdate({ status: connectionStatus, qr: null, pairingCode: currentPairingCode, user: null });
        } catch (pairErr) {
          console.error('[WhatsApp] Gagal requestPairingCode:', pairErr.message);
          if (onUpdate) onUpdate({ status: 'disconnected', error: pairErr.message });
        }
      }, 1500);
    }

    mySock.ev.on('connection.update', async (update) => {
      if (sock !== mySock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr && mode !== 'code') {
        try {
          currentQrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
          currentPairingCode = null;
          connectionStatus = 'connecting';
          console.log('[WhatsApp] Barcode QR baru siap di-scan.');
          if (onUpdate) onUpdate({ status: connectionStatus, qr: currentQrDataUrl, pairingCode: null, user: null });
        } catch (qrErr) {
          console.error('[WhatsApp] Gagal membuat QR Code:', qrErr.message);
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        currentQrDataUrl = null;
        currentPairingCode = null;
        connectedUser = mySock.user || { id: 'unknown', name: 'Admin NOC (by Kurtech)' };
        console.log('[WhatsApp] Bot WhatsApp berhasil terhubung! Akun:', connectedUser.id);
        if (onUpdate) onUpdate({ status: connectionStatus, connected: true, qr: null, pairingCode: null, user: connectedUser });
      }

      if (connection === 'close') {
        if (sock !== mySock) return;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log('[WhatsApp] Koneksi terputus. Status code:', statusCode);

        // DisconnectReason 515 = restartRequired (normal saat handshaking selesai)
        if (statusCode === 515) {
          console.log('[WhatsApp] Status 515 (restartRequired): Menyambungkan ulang dengan sesi baru...');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            initWhatsApp({ mode: 'restore', onUpdate }).catch(() => {});
          }, 1500);
          return;
        }

        if (statusCode === DisconnectReason.loggedOut || isExplicitLogout) {
          console.log('[WhatsApp] Sesi logout/dibatalkan.');
          connectionStatus = 'disconnected';
          connectedUser = null;
          currentQrDataUrl = null;
          currentPairingCode = null;
          sock = null;
          cleanSessionFolder();
          if (onUpdate) onUpdate({ status: connectionStatus, qr: null, pairingCode: null, user: null });
        } else if (statusCode === 408) {
          console.log('[WhatsApp] Barcode QR kedaluwarsa (408).');
          connectionStatus = 'disconnected';
          currentQrDataUrl = null;
          currentPairingCode = null;
          sock = null;
          if (onUpdate) onUpdate({ status: connectionStatus, qr: null, pairingCode: null, user: null, message: 'Barcode kedaluwarsa. Silakan klik Tampilkan Barcode lagi.' });
        } else {
          // Jika terputus karena jaringan / server WA (misal kode 428, 500, dll) dan bukan logout resmi, sambungkan ulang otomatis
          const credsFile = path.join(SESSION_DIR, 'creds.json');
          const hasCreds = fs.existsSync(credsFile);
          console.log(`[WhatsApp] Koneksi terputus (status code: ${statusCode}). Mencoba menyambungkan ulang otomatis...`);
          connectionStatus = 'connecting';
          sock = null;
          if (hasCreds) {
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
              initWhatsApp({ mode: 'restore', onUpdate }).catch(() => {});
            }, 3000);
          } else {
            connectionStatus = 'disconnected';
            if (onUpdate) onUpdate({ status: connectionStatus, qr: null, pairingCode: null, user: null });
          }
        }
      }
    });

    return { status: connectionStatus, qr: currentQrDataUrl, pairingCode: currentPairingCode, user: connectedUser };
  } catch (err) {
    console.error('[WhatsApp] Error inisialisasi Baileys:', err.message);
    connectionStatus = 'disconnected';
    currentQrDataUrl = null;
    currentPairingCode = null;
    sock = null;
    return { status: 'disconnected', error: err.message };
  }
}

function getWhatsAppStatus() {
  return {
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    qr: currentQrDataUrl,
    pairingCode: currentPairingCode,
    user: connectedUser
  };
}

// Antrian Pesan WhatsApp Otomatis (Message Queue with Throttling)
// Sangat penting untuk 100+ pelanggan agar akun WhatsApp Admin tidak dianggap spam / diblokir oleh Meta saat mengirim banyak notifikasi
const waMessageQueue = [];
let isProcessingQueue = false;

async function processMessageQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (waMessageQueue.length > 0) {
    const item = waMessageQueue.shift();
    try {
      if (connectionStatus === 'connected' && sock) {
        const res = await sock.sendMessage(item.jid, { text: item.text });
        item.resolve({ success: true, messageId: res?.key?.id, jid: item.jid });
        if (waMessageQueue.length > 0) {
          console.log(`[WhatsApp Queue] Pesan terkirim ke ${item.jid}. Sisa antrian: ${waMessageQueue.length} pesan.`);
        }
      } else {
        item.resolve({ success: false, message: 'Bot WhatsApp terputus saat giliran pengiriman antrian.' });
      }
    } catch (err) {
      console.error(`[WhatsApp Queue] Gagal kirim pesan ke ${item.jid}:`, err.message);
      item.resolve({ success: false, message: err.message });
    }

    // Beri jeda aman 1.8 detik antar pesan jika masih ada antrian berikutnya
    if (waMessageQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1800));
    }
  }

  isProcessingQueue = false;
}

async function sendWhatsAppMessage(toPhone, text) {
  if (connectionStatus !== 'connected' || !sock) {
    return { success: false, message: 'Bot WhatsApp belum terhubung. Silakan tautkan di Pengaturan terlebih dahulu.' };
  }

  const jid = formatToJid(toPhone);
  if (!jid) {
    return { success: false, message: 'Nomor WhatsApp tujuan tidak valid!' };
  }

  return new Promise((resolve) => {
    waMessageQueue.push({
      jid,
      text: String(text).trim(),
      resolve
    });
    processMessageQueue();
  });
}

async function logoutWhatsApp() {
  isExplicitLogout = true;
  connectionStatus = 'disconnected';
  currentQrDataUrl = null;
  currentPairingCode = null;
  connectedUser = null;

  if (sock) {
    try {
      await sock.logout();
    } catch (e) {
      try { sock.end(); } catch (err) {}
    }
    sock = null;
  }

  cleanSessionFolder();

  return { success: true, message: 'WhatsApp berhasil diputuskan.' };
}

// Auto init if valid registered session exists
if (fs.existsSync(SESSION_DIR)) {
  const credsFile = path.join(SESSION_DIR, 'creds.json');
  if (fs.existsSync(credsFile)) {
    try {
      const cData = JSON.parse(fs.readFileSync(credsFile, 'utf8'));
      if (cData && cData.registered) {
        setTimeout(() => {
          console.log('[WhatsApp] Sesi terdaftar ditemukan, menghubungkan otomatis...');
          initWhatsApp({ mode: 'restore' }).catch(err => console.error('[WhatsApp] Auto-init failed:', err.message));
        }, 2000);
      }
    } catch (e) {}
  }
}

module.exports = {
  initWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
  logoutWhatsApp,
  formatToJid
};
