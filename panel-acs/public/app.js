let allDevices = [];
let currentFilter = 'all';
let searchQuery = '';
let autoRefreshInterval = null;
let rebootTargetId = null;
const rebootingDevices = new Map(); // id -> { name, startTime, initialUptime }
let rebootWatcherInterval = null;

// Wi-Fi Password Visibility State
let showAllPasswords = false;
const revealedPasswordIds = new Set();


// DOM Elements
const devicesTableBody = document.getElementById('devicesTableBody');
const searchInput = document.getElementById('searchInput');
const filterPills = document.querySelectorAll('.filter-pills .pill');
const btnReload = document.getElementById('btnReload');
const liveClock = document.getElementById('liveClock');

// Stats Elements
const statTotal = document.getElementById('statTotal');
const statOnline = document.getElementById('statOnline');
const statOffline = document.getElementById('statOffline');
const statHotspot = document.getElementById('statHotspot');
const hotspotDot = document.getElementById('hotspotDot');
const hotspotSubtext = document.getElementById('hotspotSubtext');

const countAll = document.getElementById('countAll');
const countOnline = document.getElementById('countOnline');
const countOffline = document.getElementById('countOffline');
const countWarning = document.getElementById('countWarning');

// Hotspot State
let hotspotData = { count: 0, connected: false, users: [], error: '' };
let hotspotSearchQuery = '';

// =============================================
// Theme Switcher (Dark Mode & Light Mode)
// =============================================
function initTheme() {
  const savedTheme = localStorage.getItem('kurtech_theme') || 'dark';
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('kurtech_theme', theme);
  const icon = document.getElementById('themeIcon');
  const text = document.getElementById('themeText');
  if (theme === 'light') {
    if (icon) icon.textContent = '🌙';
    if (text) text.textContent = 'Gelap';
  } else {
    if (icon) icon.textContent = '☀️';
    if (text) text.textContent = 'Terang';
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  checkAuth();
  fetchBrandConfig();
  fetchDevices();
  fetchHotspotData();
  refreshMikrotikProfiles(false);
  startLiveClock();

  // Auto refresh every 20 seconds
  autoRefreshInterval = setInterval(() => {
    fetchDevices(false);
    fetchHotspotData(false);
  }, 20000);

  // Search Listener
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderDevices();
  });

  // Filter Pill Listeners
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderDevices();
    });
  });

  // Reload Button
  btnReload.addEventListener('click', () => {
    btnReload.classList.add('loading');
    fetchDevices(true);
  });

  // Modal backdrop click to close
  document.addEventListener('click', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('open');
      e.target.classList.remove('active');
    }
  });

  // Escape key to close any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach(m => {
        m.classList.remove('open');
        m.classList.remove('active');
      });
    }
  });
});

// Live Clock
function startLiveClock() {
  function updateClock() {
    const now = new Date();
    liveClock.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// Fetch Devices API
async function fetchDevices(showToastOnManual = false) {
  try {
    const res = await fetch('/api/devices');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();

    if (data.success) {
      allDevices = data.devices || [];
      updateStats();
      renderDevices();
      if (showToastOnManual) {
        showToast('Data modem berhasil dimuat ulang!', 'success');
      }
    } else {
      showToast('Gagal memuat data: ' + (data.error || 'Server error'), 'error');
    }
  } catch (err) {
    console.error('Fetch error:', err);
    devicesTableBody.innerHTML = `
      <tr>
        <td colspan="10" class="loading-state color-red">
          <p>⚠️ Gagal terhubung ke server GenieACS.</p>
          <p style="font-size:0.8rem; margin-top:4px;">Pastikan GenieACS-Services aktif di Windows.</p>
        </td>
      </tr>
    `;
  } finally {
    btnReload.classList.remove('loading');
  }
}

// Update Top KPI Cards
function updateStats() {
  const total = allDevices.length;
  const onlineCount = allDevices.filter(d => d.online).length;
  const offlineCount = total - onlineCount;
  const warningCount = allDevices.filter(d => d.rx !== null && d.rx <= -27).length;

  statTotal.textContent = total;
  statOnline.textContent = onlineCount;
  statOffline.textContent = offlineCount;

  countAll.textContent = total;
  countOnline.textContent = onlineCount;
  countOffline.textContent = offlineCount;
  countWarning.textContent = warningCount;
}

// Render Table
function renderDevices() {
  // Filter
  let filtered = allDevices.filter(d => {
    if (currentFilter === 'online') return d.online;
    if (currentFilter === 'offline') return !d.online;
    if (currentFilter === 'warning') return d.rx !== null && d.rx <= -27;
    return true;
  });

  // Search (Mendukung Nama, PPPoE User, No WhatsApp, SSID WiFi, Serial Number, & IP)
  if (searchQuery) {
    filtered = filtered.filter(d => {
      const name = (d.name || '').toLowerCase();
      const pppoe = (d.pppoeUser || '').toLowerCase();
      const phone = (d.phone || '').toLowerCase();
      const ssid = (d.ssid || '').toLowerCase();
      const sn = (d.sn || '').toLowerCase();
      const ip = (d.pppoeIp || '').toLowerCase();
      return name.includes(searchQuery) ||
             pppoe.includes(searchQuery) ||
             phone.includes(searchQuery) ||
             ssid.includes(searchQuery) ||
             sn.includes(searchQuery) ||
             ip.includes(searchQuery);
    });
  }

  if (filtered.length === 0) {
    devicesTableBody.innerHTML = `
      <tr>
        <td colspan="10" class="loading-state">
          <p>Tidak ada perangkat yang cocok dengan pencarian.</p>
        </td>
      </tr>
    `;
    return;
  }

  devicesTableBody.innerHTML = filtered.map(d => {
    const isRebooting = rebootingDevices.has(d.id);
    let statusBadge;
    let uptimeHtml;
    let actionButtons;

    if (isRebooting) {
      const info = rebootingDevices.get(d.id);
      const elapsed = Math.max(1, Math.floor((Date.now() - info.startTime) / 1000));
      statusBadge = `<span class="status-badge rebooting" title="Modem sedang dalam proses reboot fisik (~1-2 menit)"><span class="spin-icon">🔄</span> RESTART (${elapsed}s)</span>`;
      uptimeHtml = `
        <div style="font-size:0.85rem;">
          <div style="color:#fbbf24; font-weight:700;"><span class="spin-icon">⏳</span> Proses Boot...</div>
          <div style="color:var(--text-dim); font-size:0.75rem;">Berjalan ${elapsed} detik</div>
        </div>
      `;
      actionButtons = `
        <button class="btn btn-secondary" disabled style="opacity:0.65; cursor:not-allowed;" title="Modem sedang dalam proses restart fisik, harap tunggu...">
          <span class="spin-icon">🔄</span> Sedang Restart...
        </button>
      `;
    } else {
      statusBadge = d.online
        ? `<span class="status-badge online"><span class="dot-live"></span> ONLINE</span>`
        : `<span class="status-badge offline">OFFLINE</span>`;
      uptimeHtml = `
        <div style="font-size:0.85rem;">
          <div>🌡️ ${d.temp !== null ? d.temp + '°C' : '-'}</div>
          <div style="color:var(--text-dim); font-size:0.75rem;">⏱️ ${escapeHtml(d.uptime)}</div>
        </div>
      `;
      actionButtons = `
        <button class="btn btn-primary" onclick="openWifiModal('${escapeHtml(d.id)}')" title="Ganti SSID & Password WiFi">
          <span>📶 WiFi</span>
        </button>
        <button class="btn btn-secondary" onclick="openPppoeModal('${escapeHtml(d.id)}')" title="Ganti Akun PPPoE">
          <span>🔑 PPPoE</span>
        </button>
        <button class="btn btn-icon-only" onclick="openPingModal('${escapeHtml(d.pppoeIp)}', '${escapeHtml(d.name)}')" title="Uji Ping & Latensi Modem">
          ⚡
        </button>
        <button class="btn btn-icon-only" onclick="openRebootModal('${escapeHtml(d.id)}', '${escapeHtml(d.name)}')" title="Restart Modem">
          🔄
        </button>
        <button class="btn btn-icon-only" id="btnSummon_${escapeHtml(d.id)}" onclick="refreshDevice('${escapeHtml(d.id)}')" title="Summon / Refresh Data">
          📡
        </button>
      `;
    }

    const rxText = d.rx !== null ? `${d.rx} dBm` : '-';
    const rxBadgeClass = `rx-${d.rxColor}`;

    return `
      <tr class="${isRebooting ? 'row-rebooting' : ''}">
        <td>${statusBadge}</td>
        <td>
          <div class="user-cell">
            <span class="user-name">${escapeHtml(d.name)}</span>
            <span class="user-sn">SN: ${escapeHtml(d.sn)}</span>
            ${d.phone ? `
              <span class="badge-wa-client" onclick="openPhoneModal('${escapeHtml(d.id)}', '${escapeHtml(d.name)}', '${escapeHtml(d.phone)}')" title="Klik untuk ubah nomor WhatsApp pelanggan">
                📱 ${escapeHtml(d.phone)}
              </span>
            ` : `
              <button type="button" class="btn-add-phone" onclick="openPhoneModal('${escapeHtml(d.id)}', '${escapeHtml(d.name)}', '')" title="Tambahkan nomor WhatsApp pelanggan">
                ➕ No WA
              </button>
            `}
            ${d.hotspotUser ? `
              <span class="badge-hotspot-client" style="display:inline-flex; align-items:center; gap:3px; font-size:0.7rem; color:#34d399; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.25); padding:1px 6px; border-radius:4px; margin-top:2px; width:fit-content; font-weight:600;" title="Akun Hotspot MikroTik: ${escapeHtml(d.hotspotUser)} | Sandi: ${escapeHtml(d.hotspotPass || '-')} | Profile: ${escapeHtml(d.hotspotProfile || 'FREE Member')}">
                🎁 Free Hotspot: ${escapeHtml(d.hotspotUser)}
              </span>
            ` : ''}
          </div>
        </td>
        <td>
          <div class="wifi-cell">
            <span class="wifi-ssid">📶 ${escapeHtml(d.ssid)}</span>
          </div>
        </td>
        <td>
          ${renderWifiPasswordCell(d)}
        </td>
        <td>
          <span class="rx-badge ${rxBadgeClass}">
            ${rxText} (${d.rxStatus})
          </span>
        </td>
        <td>
          ${uptimeHtml}
        </td>
        <td>
          <code style="font-family:var(--font-mono); color:#93c5fd;">${escapeHtml(d.pppoeIp)}</code>
        </td>
        <td>
          <span style="font-size:0.82rem; color:var(--text-muted);">${escapeHtml(d.model)}</span>
        </td>
        <td>
          <button type="button" class="badge-hp-btn" onclick="openConnectedClientsModal('${escapeHtml(d.id)}', '${escapeHtml(d.name)}')" title="Klik untuk lihat daftar HP / Laptop yang terhubung">
            <span>📱</span> <span>${d.activeClients} HP</span>
          </button>
        </td>
        <td>
          <div class="action-buttons">
            ${actionButtons}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Wi-Fi Password Cell with Eye Toggle & Copy Button
function renderWifiPasswordCell(d) {
  const isPassKnown = Boolean(d.passwordKnown || (d.password && d.password !== '******'));
  const isRevealed = isPassKnown && (showAllPasswords || revealedPasswordIds.has(d.id));

  if (isPassKnown) {
    return `
      <div class="wifi-pass-wrap">
        <span class="wifi-pass-text ${isRevealed ? 'revealed' : 'masked'}" title="${isRevealed ? 'Password: ' + escapeHtml(d.password) : 'Password tersembunyi (klik 👁️ untuk lihat)'}">
          ${isRevealed ? escapeHtml(d.password) : '••••••••'}
        </span>
        <div class="wifi-pass-btns">
          <button type="button" class="btn-pass-action" onclick="togglePasswordRow('${escapeHtml(d.id)}')" title="${isRevealed ? 'Sembunyikan Sandi' : 'Tampilkan Sandi'}">
            ${isRevealed ? '🙈' : '👁️'}
          </button>
          <button type="button" class="btn-pass-action btn-copy-pass" onclick="copyPassword('${escapeHtml(d.password)}', this)" title="Salin Sandi">
            📋
          </button>
        </div>
      </div>
    `;
  } else {
    return `
      <div class="wifi-pass-wrap unknown">
        <span class="wifi-pass-text masked" title="Password belum tercatat di sistem (Modem Huawei menyembunyikan sandi bawaan TR-069)">••••••••</span>
        <div class="wifi-pass-btns">
          <button type="button" class="btn-pass-action btn-edit" onclick="openWifiModal('${escapeHtml(d.id)}')" title="Ganti atau Catat Sandi Baru">
            ✏️
          </button>
        </div>
      </div>
    `;
  }
}

// Toggle individual password visibility in table
function togglePasswordRow(deviceId) {
  if (revealedPasswordIds.has(deviceId)) {
    revealedPasswordIds.delete(deviceId);
  } else {
    revealedPasswordIds.add(deviceId);
  }
  renderDevices();
}

// Global Toggle All Passwords in Table
function toggleAllPasswords() {
  showAllPasswords = !showAllPasswords;
  if (!showAllPasswords) {
    revealedPasswordIds.clear();
  }
  const btn = document.getElementById('btnToggleAllPass');
  const icon = document.getElementById('toggleAllPassIcon');
  const text = document.getElementById('toggleAllPassText');
  if (btn && icon && text) {
    if (showAllPasswords) {
      icon.textContent = '🙈';
      text.textContent = 'Sembunyikan Sandi';
      btn.classList.add('active');
    } else {
      icon.textContent = '👁️';
      text.textContent = 'Tampilkan Sandi';
      btn.classList.remove('active');
    }
  }
  renderDevices();
}

// Copy password to clipboard with visual feedback
async function copyPassword(pass, btn) {
  if (!pass || pass === '******') {
    showToast('Sandi belum tersedia untuk disalin', 'error');
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(pass);
    } else {
      const tempInput = document.createElement('input');
      tempInput.value = pass;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
    }
    const origHtml = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.classList.add('copied');
    showToast(`Password "${pass}" berhasil disalin!`, 'success');
    setTimeout(() => {
      btn.innerHTML = origHtml;
      btn.classList.remove('copied');
    }, 1500);
  } catch (err) {
    showToast(`Password: ${pass}`, 'info');
  }
}

// Open Wi-Fi Modal
function openWifiModal(deviceId) {
  const device = allDevices.find(d => d.id === deviceId);
  if (!device) return;

  document.getElementById('wifiDeviceId').value = device.id;
  document.getElementById('wifiModalTarget').textContent = `Target: ${device.name} (SN: ${device.sn})`;
  document.getElementById('wifiSsidInput').value = (device.ssid && device.ssid !== '-') ? device.ssid : '';
  
  const passInput = document.getElementById('wifiPasswordInput');
  const isKnown = Boolean(device.passwordKnown || (device.password && device.password !== '******'));
  passInput.value = isKnown ? device.password : '';

  const phoneInput = document.getElementById('wifiCustomerPhoneInput');
  if (phoneInput) phoneInput.value = device.phone || '';

  // Show clear text in modal so user sees current or newly typed password
  passInput.type = 'text';
  const toggleBtn = document.querySelector('#wifiModal .btn-toggle-eye');
  if (toggleBtn) toggleBtn.textContent = '🙈';

  // Inisialisasi data Akun Free Hotspot (Bonus Member)
  const chk = document.getElementById('chkFreeHotspot');
  const userField = document.getElementById('wifiHotspotUser');
  const passField = document.getElementById('wifiHotspotPass');
  const noteField = document.getElementById('wifiHotspotNote');
  const profileToSelect = device.hotspotProfile || 'FREE Member';

  renderHotspotProfilesDropdown(profileToSelect);
  refreshMikrotikProfiles(false);

  if (device.includeHotspot || device.hotspotUser) {
    if (chk) chk.checked = true;
    if (userField) userField.value = device.hotspotUser || '';
    if (passField) passField.value = device.hotspotPass || '';
    if (noteField) noteField.value = device.hotspotNote || 'Bisa digunakan di seluruh titik Hotspot WiFi kami';
  } else {
    if (chk) chk.checked = false;
    // Sarankan default username dari PPPoE username atau nama pelanggan
    const rawUser = (device.pppoeUser && device.pppoeUser !== '-') ? device.pppoeUser : (device.name || '');
    const cleanUser = rawUser.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    if (userField) userField.value = cleanUser || 'member';
    if (passField) passField.value = Math.floor(1000 + Math.random() * 9000).toString();
    if (noteField) noteField.value = 'Bisa digunakan di seluruh titik Hotspot WiFi kami';
  }
  toggleHotspotFields();

  document.getElementById('wifiModal').classList.add('open');
}

// ---------------------------------------------
// MikroTik Hotspot Profiles Cache & Dropdown
// ---------------------------------------------
let mikrotikHotspotProfiles = [];

async function refreshMikrotikProfiles(force = false) {
  try {
    const res = await fetch(`/api/mikrotik/profiles?fresh=${force ? '1' : '0'}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.profiles) && data.profiles.length > 0) {
      mikrotikHotspotProfiles = data.profiles;
      const currentSelected = document.getElementById('wifiHotspotProfile')?.value || 'FREE Member';
      renderHotspotProfilesDropdown(currentSelected);
      if (force) showToast('✅ Daftar profile Hotspot MikroTik berhasil diperbarui!', 'success');
    }
  } catch (e) {
    console.error('Error fetching mikrotik profiles:', e);
  }
}

function renderHotspotProfilesDropdown(selectedProfile = 'FREE Member') {
  const sel = document.getElementById('wifiHotspotProfile');
  if (!sel) return;

  if (!mikrotikHotspotProfiles || mikrotikHotspotProfiles.length === 0) {
    mikrotikHotspotProfiles = [
      { name: 'FREE Member', sharedUsers: '1', rateLimit: '1024k/1024k' },
      { name: 'FREE 2 HP', sharedUsers: '2', rateLimit: '5120k/5120k' },
      { name: 'FREE 4 HP', sharedUsers: '4', rateLimit: '5120k/5120k' },
      { name: 'default', sharedUsers: '1', rateLimit: '-' }
    ];
  }

  sel.innerHTML = mikrotikHotspotProfiles.map(p => {
    const rateText = (p.rateLimit && p.rateLimit !== '-') ? ` (${p.rateLimit.split(' ')[0]} - ${p.sharedUsers} HP)` : ` (${p.sharedUsers || 1} HP)`;
    const isSel = p.name === selectedProfile ? 'selected' : '';
    return `<option value="${escapeHtml(p.name)}" ${isSel}>${escapeHtml(p.name)}${rateText}</option>`;
  }).join('');

  if (selectedProfile && !mikrotikHotspotProfiles.some(p => p.name === selectedProfile)) {
    sel.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(selectedProfile)}" selected>${escapeHtml(selectedProfile)}</option>`);
  }
}

function toggleHotspotFields() {
  const chk = document.getElementById('chkFreeHotspot');
  const wrap = document.getElementById('hotspotFieldsWrap');
  if (!wrap) return;
  wrap.style.display = (chk && chk.checked) ? 'block' : 'none';
}

function generateHotspotPass() {
  const passField = document.getElementById('wifiHotspotPass');
  if (passField) {
    passField.value = Math.floor(1000 + Math.random() * 9000).toString();
  }
}

// Submit Wi-Fi Change
async function submitWifiChange(e) {
  e.preventDefault();
  const id = document.getElementById('wifiDeviceId').value;
  const ssid = document.getElementById('wifiSsidInput')?.value.trim();
  const password = document.getElementById('wifiPasswordInput')?.value.trim();
  const phone = document.getElementById('wifiCustomerPhoneInput')?.value.trim() || '';
  const includeHotspot = document.getElementById('chkFreeHotspot')?.checked || false;
  const hotspotUser = document.getElementById('wifiHotspotUser')?.value.trim() || '';
  const hotspotPass = document.getElementById('wifiHotspotPass')?.value.trim() || '';
  const hotspotProfile = document.getElementById('wifiHotspotProfile')?.value || 'FREE Member';
  const hotspotNote = document.getElementById('wifiHotspotNote')?.value.trim() || '';
  const btn = document.getElementById('btnSaveWifi');

  if (password && password.length < 8) {
    showToast('Jika diisi, sandi baru Wi-Fi minimal 8 karakter!', 'warning');
    document.getElementById('wifiPasswordInput')?.focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;margin:0 6px 0 0;border-width:2px;display:inline-block;vertical-align:middle;"></div> Menyimpan...`;

  try {
    const res = await fetch('/api/device/wifi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        ssid,
        password,
        phone,
        includeHotspot,
        hotspotUser,
        hotspotPass,
        hotspotProfile,
        hotspotNote
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast(data.message || 'Berhasil disimpan!', 'success');
      closeModal('wifiModal');
      // Update local object immediately for smooth UI
      const target = allDevices.find(d => d.id === id);
      if (target) {
        if (ssid) target.ssid = ssid;
        if (password) {
          target.password = password;
          target.passwordKnown = true;
          revealedPasswordIds.add(id); // auto reveal this row
        }
        if (phone !== undefined) target.phone = phone;
        target.includeHotspot = includeHotspot;
        target.hotspotUser = hotspotUser;
        target.hotspotPass = hotspotPass;
        target.hotspotProfile = hotspotProfile;
        target.hotspotNote = hotspotNote;
        renderDevices();
      }
    } else {
      showToast('Gagal: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan!', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span class="btn-text-content">Simpan & Kirim ke Modem</span>`;
  }
}

// Kirim info Wi-Fi otomatis via Bot WhatsApp
async function sendWifiViaBotWa() {
  const id = document.getElementById('wifiDeviceId').value;
  const phone = document.getElementById('wifiCustomerPhoneInput')?.value.trim();
  const ssid = document.getElementById('wifiSsidInput')?.value.trim();
  const password = document.getElementById('wifiPasswordInput')?.value.trim();
  const includeHotspot = document.getElementById('chkFreeHotspot')?.checked || false;
  const hotspotUser = document.getElementById('wifiHotspotUser')?.value.trim() || '';
  const hotspotPass = document.getElementById('wifiHotspotPass')?.value.trim() || '';
  const hotspotProfile = document.getElementById('wifiHotspotProfile')?.value || 'FREE Member';
  const hotspotNote = document.getElementById('wifiHotspotNote')?.value.trim() || '';
  const btn = document.getElementById('btnSendBotWa');

  if (!phone) {
    showToast('Masukkan nomor WhatsApp pelanggan terlebih dahulu!', 'warning');
    document.getElementById('wifiCustomerPhoneInput')?.focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<span class="spin-icon">🔄</span> Mengirim...`;

  try {
    const res = await fetch('/api/whatsapp/send-wifi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        phone,
        ssid,
        password,
        includeHotspot,
        hotspotUser,
        hotspotPass,
        hotspotProfile,
        hotspotNote
      })
    });
    const data = await res.json();
    if (data.success) {
      let toastMsg = `✅ Pesan Wi-Fi & Hotspot berhasil dikirim ke ${phone} via Bot WA!`;
      if (data.hotspotMikrotik?.success) {
        toastMsg += ` (User ${hotspotUser} terdaftar di MikroTik)`;
      }
      showToast(toastMsg, 'success');
      const target = allDevices.find(d => d.id === id);
      if (target) {
        target.phone = phone;
        if (password) {
          target.password = password;
          target.passwordKnown = true;
        }
        target.includeHotspot = includeHotspot;
        target.hotspotUser = hotspotUser;
        target.hotspotPass = hotspotPass;
        target.hotspotProfile = hotspotProfile;
        target.hotspotNote = hotspotNote;
        renderDevices();
      }
    } else {
      showToast('Gagal kirim via Bot: ' + (data.message || 'Periksa status WA'), 'error');
    }
  } catch (err) {
    showToast('Error kirim pesan WA: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🤖</span> <span>Kirim via Bot WA</span>`;
  }
}

// Modal Tambah / Edit Nomor HP Pelanggan
function openPhoneModal(deviceId, clientName, currentPhone) {
  document.getElementById('phoneDeviceId').value = deviceId;
  document.getElementById('phoneModalTarget').textContent = `Target: ${clientName}`;
  document.getElementById('phoneInput').value = currentPhone || '';
  document.getElementById('phoneModal').classList.add('open');
}

async function submitPhoneChange(e) {
  e.preventDefault();
  const id = document.getElementById('phoneDeviceId').value;
  const phone = document.getElementById('phoneInput').value.trim();
  const btn = document.getElementById('btnSavePhone');

  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const res = await fetch('/api/device/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, phone })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Nomor WhatsApp pelanggan berhasil disimpan!', 'success');
      closeModal('phoneModal');
      const target = allDevices.find(d => d.id === id);
      if (target) {
        target.phone = phone;
        renderDevices();
      }
    } else {
      showToast('Gagal simpan nomor: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    showToast('Error simpan nomor: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan Nomor';
  }
}

// Open PPPoE Modal
function openPppoeModal(deviceId) {
  const device = allDevices.find(d => d.id === deviceId);
  if (!device) return;

  document.getElementById('pppoeDeviceId').value = device.id;
  document.getElementById('pppoeModalTarget').textContent = `Target: ${device.name}`;
  document.getElementById('pppoeUserInput').value = device.pppoeUser !== '-' ? device.pppoeUser : '';
  document.getElementById('pppoePassInput').value = '';

  document.getElementById('pppoeModal').classList.add('open');
}

// Submit PPPoE Change
async function submitPppoeChange(e) {
  e.preventDefault();
  const id = document.getElementById('pppoeDeviceId').value;
  const username = document.getElementById('pppoeUserInput').value.trim();
  const password = document.getElementById('pppoePassInput').value.trim();
  const btn = document.getElementById('btnSavePppoe');

  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const res = await fetch('/api/device/pppoe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, username, password })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Akun PPPoE berhasil dikirim ke Modem!', 'success');
      closeModal('pppoeModal');
    } else {
      showToast('Gagal: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan!', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Simpan ke Modem';
  }
}

// Open Reboot Modal
function openRebootModal(deviceId, clientName) {
  rebootTargetId = deviceId;
  document.getElementById('rebootTargetName').textContent = clientName;
  document.getElementById('rebootModal').classList.add('open');
}

// Confirm Reboot Action
async function confirmRebootAction() {
  if (!rebootTargetId) return;
  const targetId = rebootTargetId;
  const targetDev = allDevices.find(d => d.id === targetId);
  const clientName = targetDev ? targetDev.name : (document.getElementById('rebootTargetName')?.textContent || 'Modem');
  const btn = document.getElementById('btnConfirmReboot');

  btn.disabled = true;
  btn.innerHTML = '<span class="spin-icon">🔄</span> Mengirim Perintah...';

  try {
    const res = await fetch('/api/device/reboot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: targetId })
    });
    const data = await res.json();

    if (data.success) {
      closeModal('rebootModal');
      rebootTargetId = null;

      // Register device as currently rebooting
      rebootingDevices.set(targetId, {
        name: clientName,
        startTime: Date.now(),
        initialUptime: targetDev ? targetDev.uptime : null
      });

      showToast(`🔄 Perintah Restart diterima modem ${clientName}! Modem sedang proses shutdown dan boot ulang (~1–2 menit).`, 'info');
      
      // Update table immediately to show reboot status
      renderDevices();
      startRebootWatcher();
    } else {
      showToast('Gagal me-restart modem: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan!', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Ya, Restart Modem</span>';
  }
}

// Watcher to track rebooting status & auto-detect when back online
function startRebootWatcher() {
  if (rebootWatcherInterval) return;
  rebootWatcherInterval = setInterval(async () => {
    if (rebootingDevices.size === 0) {
      clearInterval(rebootWatcherInterval);
      rebootWatcherInterval = null;
      return;
    }

    // Refresh UI timer seconds
    renderDevices();

    // Poll latest device status from server
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      if (data.success && Array.isArray(data.devices)) {
        allDevices = data.devices;
        updateStats();

        const now = Date.now();
        for (const [devId, info] of rebootingDevices.entries()) {
          const elapsed = Math.floor((now - info.startTime) / 1000);
          const dev = allDevices.find(d => d.id === devId);

          if (!dev) continue;

          // Check if modem rebooted: elapsed >= 20s and (uptime reset or changed from initial)
          const isUptimeFresh = dev.uptime && (
            dev.uptime.includes('0d 00:00:') || 
            dev.uptime.includes('0d 00:01:') || 
            dev.uptime.includes('0d 00:02:') || 
            (info.initialUptime && dev.uptime !== info.initialUptime)
          );

          if (elapsed >= 20 && dev.online && isUptimeFresh) {
            rebootingDevices.delete(devId);
            showToast(`✅ Modem ${info.name} berhasil restart dan kembali ONLINE! (Uptime: ${dev.uptime})`, 'success');
            renderDevices();
          } else if (elapsed > 180) {
            rebootingDevices.delete(devId);
            showToast(`⚠️ Modem ${info.name} belum terdeteksi online setelah 3 menit. Silakan periksa koneksi fisik.`, 'warning');
            renderDevices();
          }
        }
      }
    } catch (e) {
      // Ignore background network errors
    }
  }, 3000);
}

// Refresh / Summon single device
async function refreshDevice(deviceId) {
  const btn = document.getElementById(`btnSummon_${deviceId}`);
  if (btn) {
    btn.disabled = true;
    btn.classList.add('spin-icon');
  }
  showToast('📡 Mengirim sinyal Summon (Connection Request) ke modem...', 'info');

  try {
    const res = await fetch('/api/device/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deviceId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Berhasil! Data live modem diperbarui.', 'success');
      setTimeout(() => fetchDevices(false), 1500);
    } else {
      showToast('⚠️ Gagal: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan saat Summon!', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('spin-icon');
    }
  }
}

// Helpers
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
    modal.classList.remove('active');
  }
  if (id === 'rebootModal') {
    rebootTargetId = null;
  }
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🔒';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

function generateRandomPass(inputId) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  document.getElementById(inputId).value = pass;
  document.getElementById(inputId).type = 'text';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------
// Hotspot Active & MikroTik Integration
// ---------------------------------------------

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function fetchHotspotData(isManual = false) {
  try {
    const res = await fetch('/api/hotspot/active' + (isManual ? '?fresh=1' : ''));
    const data = await res.json();
    hotspotData = data;

    if (data.connected) {
      if (statHotspot) statHotspot.textContent = data.count || 0;
      if (hotspotDot) {
        hotspotDot.className = 'badge-status-dot dot-green';
        hotspotDot.title = 'Terhubung ke MikroTik';
      }
      if (hotspotSubtext) hotspotSubtext.textContent = 'Live di MikroTik';
    } else {
      if (statHotspot) statHotspot.textContent = '0';
      if (hotspotDot) {
        hotspotDot.className = 'badge-status-dot dot-yellow';
        hotspotDot.title = data.error || 'Belum Terhubung';
      }
      if (hotspotSubtext) hotspotSubtext.textContent = 'Klik hubungkan';
    }

    // Update modal if open
    const modalCount = document.getElementById('modalHotspotCount');
    if (modalCount) modalCount.textContent = data.count || 0;
    renderHotspotUsers();

    if (isManual) {
      if (data.connected) {
        showToast(`Data Hotspot dimuat! ${data.count} user aktif.`, 'success');
      } else {
        showToast(`MikroTik: ${data.error || 'Belum terhubung'}`, 'error');
      }
    }
  } catch (err) {
    console.error('Fetch hotspot error:', err);
    if (hotspotDot) hotspotDot.className = 'badge-status-dot dot-red';
    if (hotspotSubtext) hotspotSubtext.textContent = 'Gagal memuat';
  }
}

function openHotspotModal(tab = 'brand') {
  const modal = document.getElementById('hotspotModal');
  if (modal) {
    modal.classList.add('open');
    modal.classList.add('active');
  }
  switchHotspotTab(tab);
  if (tab === 'users') fetchHotspotData(true);
}

function switchHotspotTab(tab) {
  const tabBtnBrand = document.getElementById('tabBtnBrand');
  const tabBtnAdmin = document.getElementById('tabBtnAdmin');
  const tabBtnTelegram = document.getElementById('tabBtnTelegram');
  const tabBtnSettings = document.getElementById('tabBtnSettings');
  const tabBtnUsers = document.getElementById('tabBtnUsers');

  const tabContentBrand = document.getElementById('tabContentBrand');
  const tabContentAdmin = document.getElementById('tabContentAdmin');
  const tabContentTelegram = document.getElementById('tabContentTelegram');
  const tabContentSettings = document.getElementById('tabContentSettings');
  const tabContentUsers = document.getElementById('tabContentUsers');

  // Remove active from all tabs
  [tabBtnBrand, tabBtnAdmin, tabBtnTelegram, tabBtnSettings, tabBtnUsers].forEach(b => b?.classList.remove('active'));
  [tabContentBrand, tabContentAdmin, tabContentTelegram, tabContentSettings, tabContentUsers].forEach(c => c?.classList.remove('active'));

  if (tab === 'brand') {
    tabBtnBrand?.classList.add('active');
    tabContentBrand?.classList.add('active');
    loadBrandSettings();
  } else if (tab === 'admin') {
    tabBtnAdmin?.classList.add('active');
    tabContentAdmin?.classList.add('active');
    loadAdminAccountSettings();
  } else if (tab === 'telegram') {
    tabBtnTelegram?.classList.add('active');
    tabContentTelegram?.classList.add('active');
    loadNotificationSettings();
  } else if (tab === 'settings') {
    tabBtnSettings?.classList.add('active');
    tabContentSettings?.classList.add('active');
    loadMikrotikSettings();
  } else {
    tabBtnUsers?.classList.add('active');
    tabContentUsers?.classList.add('active');
    fetchHotspotData();
  }
}

// ---------------------------------------------
// Authentication & Admin Management
// ---------------------------------------------
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated === false) {
        window.location.href = '/login.html';
        return;
      }
      const adminNameEl = document.getElementById('currentAdminName');
      if (adminNameEl && data.user && data.user.username) {
        adminNameEl.textContent = data.user.username;
      }
    }
  } catch (e) {
    console.warn('Cek auth tertunda (server sedang memuat ulang):', e.message);
  }
}

async function handleLogout() {
  if (!confirm('Apakah Anda yakin ingin keluar / logout dari Panel ACS?')) return;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  window.location.href = '/login.html';
}

function loadAdminAccountSettings() {
  const adminName = document.getElementById('currentAdminName')?.textContent || 'admin';
  const usernameInput = document.getElementById('adminUsernameInput');
  if (usernameInput) usernameInput.value = adminName;
  document.getElementById('adminOldPasswordInput').value = '';
  document.getElementById('adminNewPasswordInput').value = '';
  document.getElementById('adminConfirmPasswordInput').value = '';
}

async function saveAdminCredentials(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveAdminCreds');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Menyimpan...';

  const newUsername = document.getElementById('adminUsernameInput').value.trim();
  const currentPassword = document.getElementById('adminOldPasswordInput').value;
  const newPassword = document.getElementById('adminNewPasswordInput').value;
  const confirmPassword = document.getElementById('adminConfirmPasswordInput').value;

  if (newPassword !== confirmPassword) {
    showToast('Konfirmasi password baru tidak cocok!', 'error');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Simpan Password Baru';
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newUsername, newPassword })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Kredensial admin berhasil diperbarui!', 'success');
      const adminNameEl = document.getElementById('currentAdminName');
      if (adminNameEl && newUsername) adminNameEl.textContent = newUsername;
      document.getElementById('adminOldPasswordInput').value = '';
      document.getElementById('adminNewPasswordInput').value = '';
      document.getElementById('adminConfirmPasswordInput').value = '';
    } else {
      showToast('Gagal: ' + (data.message || 'Error simpan password'), 'error');
    }
  } catch (err) {
    showToast('Terjadi kesalahan jaringan saat simpan password!', 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Simpan Password Baru';
  }
}

// ---------------------------------------------
// Brand & Logo Management
// ---------------------------------------------
let currentBrand = { name: 'NOC PANEL', badge: 'TR-069 & Hotspot • by Kurtech', logo: 'logo.png' };

let currentServerIp = '127.0.0.1';

async function fetchBrandConfig() {
  try {
    const res = await fetch('/api/brand/config');
    const data = await res.json();
    if (data.success && data.brand) {
      currentBrand = data.brand;
      applyBrandToUI(currentBrand);
    }
    if (data.serverIp) {
      currentServerIp = data.serverIp;
      const sub = document.getElementById('hotspotModalSub');
      if (sub && !sub.textContent.includes('IP Server:')) {
        sub.textContent = `Router MikroTik • IP Server: ${data.serverIp}`;
      }
    }
  } catch (err) {
    console.error('Fetch brand error:', err);
  }
}

function applyBrandToUI(brand) {
  const nameEl = document.getElementById('headerBrandName');
  const badgeEl = document.getElementById('headerBadge');
  const logoEl = document.getElementById('headerLogo');

  if (nameEl) nameEl.textContent = brand.name || 'NOC PANEL';
  if (badgeEl) badgeEl.textContent = brand.badge || 'TR-069 & Hotspot • by Kurtech';
  if (logoEl) logoEl.src = (brand.logo || 'logo.png') + '?t=' + Date.now();
  document.title = `${brand.name || 'NOC PANEL'} — by Kurtech`;
}

function loadBrandSettings() {
  const nameInput = document.getElementById('brandNameInput');
  const badgeInput = document.getElementById('brandBadgeInput');
  const logoPrev = document.getElementById('brandLogoPreview');

  if (nameInput) nameInput.value = currentBrand.name || 'NOC PANEL';
  if (badgeInput) badgeInput.value = currentBrand.badge || 'TR-069 & Hotspot • by Kurtech';
  if (logoPrev) logoPrev.src = (currentBrand.logo || 'logo.png') + '?t=' + Date.now();
  updateBrandPreview();
}

function updateBrandPreview() {
  const nameVal = document.getElementById('brandNameInput')?.value || currentBrand.name || 'NOC PANEL';
  const badgeVal = document.getElementById('brandBadgeInput')?.value || currentBrand.badge || 'TR-069 & Hotspot • by Kurtech';

  const prevTitle = document.getElementById('previewBrandTitle');
  const prevBadge = document.getElementById('previewBrandBadge');

  if (prevTitle) prevTitle.textContent = nameVal;
  if (prevBadge) prevBadge.textContent = badgeVal;
}

function handleLogoFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Pilih file gambar (PNG, JPG, SVG, WebP)!', 'error');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('Ukuran file maksimal 2 MB!', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    document.getElementById('brandLogoPreview').src = base64Data;

    try {
      showToast('Mengupload logo baru...', 'info');
      const res = await fetch('/api/brand/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, filename: file.name })
      });
      const data = await res.json();
      if (data.success) {
        currentBrand.logo = data.logo;
        applyBrandToUI(currentBrand);
        showToast('Logo baru berhasil dipasang!', 'success');
      } else {
        showToast('Gagal upload logo: ' + data.message, 'error');
      }
    } catch (err) {
      showToast('Error upload logo: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

async function resetLogoDefault() {
  try {
    currentBrand.logo = 'logo.png';
    const res = await fetch('/api/brand/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentBrand)
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('brandLogoPreview').src = 'logo.png';
      applyBrandToUI(currentBrand);
      showToast('Logo direset ke logo default!', 'success');
    }
  } catch (err) {
    showToast('Error reset logo: ' + err.message, 'error');
  }
}

async function saveBrandSettings(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveBrand');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Menyimpan...';

  const name = document.getElementById('brandNameInput').value.trim();
  const badge = document.getElementById('brandBadgeInput').value.trim();

  try {
    const res = await fetch('/api/brand/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, badge, logo: currentBrand.logo || 'logo.png' })
    });
    const data = await res.json();
    if (data.success) {
      currentBrand = data.brand;
      applyBrandToUI(currentBrand);
      showToast('Identitas brand berhasil disimpan!', 'success');
    } else {
      showToast('Gagal simpan brand: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    showToast('Error simpan brand: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Simpan Brand & Logo';
  }
}

function filterHotspotUsers() {
  hotspotSearchQuery = (document.getElementById('hotspotSearchInput')?.value || '').toLowerCase().trim();
  renderHotspotUsers();
}

function renderHotspotUsers() {
  const tbody = document.getElementById('hotspotUsersTableBody');
  if (!tbody) return;

  if (!hotspotData.connected) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="loading-state" style="padding: 40px 10px;">
          <p style="color: var(--accent-red); font-weight: 600;">⚠️ ${escapeHtml(hotspotData.error || 'Belum terhubung ke MikroTik')}</p>
          <p style="font-size: 0.82rem; margin-top: 6px; color: var(--text-muted);">
            Buka tab <strong>Pengaturan MikroTik</strong> untuk memasukkan user & password API.
          </p>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 12px;" onclick="switchHotspotTab('settings')">
            ⚙️ Buka Pengaturan Router
          </button>
        </td>
      </tr>
    `;
    return;
  }

  const users = hotspotData.users || [];
  let filtered = users;
  if (hotspotSearchQuery) {
    filtered = users.filter(u =>
      (u.user || '').toLowerCase().includes(hotspotSearchQuery) ||
      (u.ip || '').toLowerCase().includes(hotspotSearchQuery) ||
      (u.mac || '').toLowerCase().includes(hotspotSearchQuery)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="loading-state" style="padding: 35px 10px;">
          <p>Tidak ada user hotspot aktif ${hotspotSearchQuery ? 'yang cocok dengan pencarian' : 'saat ini'}.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((u, idx) => `
    <tr>
      <td style="color: var(--text-muted); font-size: 0.78rem;">${idx + 1}</td>
      <td style="font-weight: 600; color: var(--primary-cyan);">
        🎟️ ${escapeHtml(u.user)}
      </td>
      <td style="font-family: var(--font-mono); font-size: 0.82rem;">${escapeHtml(u.ip)}</td>
      <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(u.mac)}</td>
      <td><span class="badge badge-uptime">${escapeHtml(u.uptime)}</span></td>
      <td style="font-size: 0.8rem; font-family: var(--font-mono); color: var(--text-muted);">
        <span style="color: var(--accent-green);">↓ ${formatBytes(u.bytesOut)}</span> / 
        <span style="color: var(--primary-cyan);">↑ ${formatBytes(u.bytesIn)}</span>
      </td>
    </tr>
  `).join('');
}

async function loadMikrotikSettings() {
  try {
    const res = await fetch('/api/mikrotik/config');
    const data = await res.json();
    if (data.success && data.config) {
      document.getElementById('mtHostInput').value = data.config.host || '192.168.88.1';
      document.getElementById('mtPortInput').value = data.config.port || 8728;
      document.getElementById('mtUserInput').value = data.config.user || 'admin';
      document.getElementById('mtPassInput').value = data.config.password || '';
    }
  } catch (err) {
    console.error('Load mikrotik config err:', err);
  }
}

async function saveMikrotikSettings(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveMtConfig');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Menguji Koneksi...';

  const host = document.getElementById('mtHostInput').value.trim() || '192.168.88.1';
  const port = parseInt(document.getElementById('mtPortInput').value) || 8728;
  const user = document.getElementById('mtUserInput').value.trim() || 'admin';
  const password = document.getElementById('mtPassInput').value;

  try {
    const res = await fetch('/api/mikrotik/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password })
    });
    const data = await res.json();

    if (data.test && data.test.connected) {
      showToast('Koneksi MikroTik Berhasil! Data user hotspot aktif terhubung.', 'success');
      fetchHotspotData(true);
      switchHotspotTab('users');
    } else {
      showToast(data.message || 'Gagal terhubung ke MikroTik', 'error');
      fetchHotspotData(true);
    }
  } catch (err) {
    showToast('Error simpan pengaturan: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Simpan & Tes Koneksi';
  }
}

function copyWinboxCommand() {
  const cmd = '/user add name=panelacs group=read password=admin comment="API Panel ACS"';
  navigator.clipboard.writeText(cmd).then(() => {
    showToast('Perintah Winbox berhasil disalin!', 'success');
  }).catch(() => {
    prompt('Salin perintah ini (Ctrl+C):', cmd);
  });
}

// ---------------------------------------------
// Fitur 1: Export Data Pelanggan to Formatted Excel (.xlsx)
// ---------------------------------------------
async function exportDevicesCsv() {
  const btn = document.getElementById('btnExportCsv');
  const originalHtml = btn ? btn.innerHTML : '<span>📥</span> <span>Export Excel</span>';
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin-icon">🔄</span> <span>Menyiapkan Excel...</span>`;
  }
  showToast('📊 Menyiapkan file Excel (.xlsx) dengan format rapi...', 'info');

  try {
    const res = await fetch('/api/export/excel');
    if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal membuat file Excel`);

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');
    const brandName = (currentBrand && currentBrand.name ? currentBrand.name : 'NOC_PANEL').replace(/[^a-zA-Z0-9]/g, '_');

    link.setAttribute('href', url);
    link.setAttribute('download', `Data_ONT_${brandName}_${dateStr}_${timeStr}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('✅ File Excel (.xlsx) rapi & berwarna berhasil diunduh!', 'success');
  } catch (err) {
    console.error('Export Excel error:', err);
    showToast('Gagal export Excel: ' + err.message + '. Mencoba format cadangan...', 'warning');
    fallbackExportCsv();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

function fallbackExportCsv() {
  if (!allDevices || allDevices.length === 0) return;
  const headers = [
    'No', 'Status', 'Nama Pelanggan', 'No WhatsApp', 'Serial Number', 'SSID WiFi',
    'Password WiFi', 'Redaman RX', 'Kondisi RX', 'Suhu ONT (C)', 'Uptime',
    'IP PPPoE', 'User PPPoE', 'Tipe ONT', 'HP Terhubung (Live)'
  ];

  const rows = allDevices.map((d, idx) => [
    idx + 1,
    d.online ? 'ONLINE' : 'OFFLINE',
    `"${(d.name || '').replace(/"/g, '""')}"`,
    `"${(d.phone || '').replace(/"/g, '""')}"`,
    `"${(d.sn || '').replace(/"/g, '""')}"`,
    `"${(d.ssid || '').replace(/"/g, '""')}"`,
    `"${(d.password || '').replace(/"/g, '""')}"`,
    d.rx !== null ? d.rx : '-',
    `"${(d.rxStatus || '').replace(/"/g, '""')}"`,
    d.temp !== null ? d.temp : '-',
    `"${(d.uptime || '').replace(/"/g, '""')}"`,
    `"${(d.pppoeIp || '').replace(/"/g, '""')}"`,
    `"${(d.pppoeUser || '').replace(/"/g, '""')}"`,
    `"${(d.model || '').replace(/"/g, '""')}"`,
    d.activeClients || 0
  ].join(','));

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Data_ONT_Backup.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------
// Fitur 2: Kirim Info Wi-Fi ke WhatsApp (Chat Manual)
// ---------------------------------------------
function shareWifiToWhatsApp() {
  const id = document.getElementById('wifiDeviceId').value;
  const ssid = document.getElementById('wifiSsidInput')?.value.trim();
  const password = document.getElementById('wifiPasswordInput')?.value.trim();
  const phone = document.getElementById('wifiCustomerPhoneInput')?.value.trim() || '';
  const includeHotspot = document.getElementById('chkFreeHotspot')?.checked || false;
  const hotspotUser = document.getElementById('wifiHotspotUser')?.value.trim() || '';
  const hotspotPass = document.getElementById('wifiHotspotPass')?.value.trim() || '';
  const hotspotProfile = document.getElementById('wifiHotspotProfile')?.value || 'FREE Member';
  const hotspotNote = document.getElementById('wifiHotspotNote')?.value.trim() || '';

  const dev = allDevices.find(d => d.id === id);
  const clientName = dev ? dev.name : 'Pelanggan';
  const brandName = (currentBrand && currentBrand.name) ? currentBrand.name : 'NOC PANEL';

  const passText = (password && password.trim()) ? password.trim() : '(Tetap sesuai sandi lama yang terpasang di modem Anda)';
  const catatanSandiLama = (!password || !password.trim()) ? `\n_(Catatan: Sandi Wi-Fi tetap memakai sandi lama di modem Anda. Jika ingin mengganti sandi baru, silakan hubungi admin kami)._` : '';

  const defaultTpl = `Halo Bapak/Ibu *{nama}*,\n\nBerikut adalah rincian informasi koneksi internet dan Wi-Fi Anda:\n\n📶 *Nama Wi-Fi (SSID):* {ssid}\n🔑 *Password Wi-Fi:* {password}\n{catatan}\n\nSilakan sambungkan kembali HP atau laptop Anda dengan password di atas.\n\nTerima kasih telah berlangganan layanan *{brand}*!`;
  const tplInput = document.getElementById('wifiMsgTemplateInput')?.value.trim();
  const rawTemplate = cachedWifiMsgTemplate || tplInput || defaultTpl;

  let text = rawTemplate
    .replace(/{nama}|{name}/gi, clientName)
    .replace(/{ssid}/gi, ssid || '-')
    .replace(/{password}|{pass}/gi, passText)
    .replace(/{brand}/gi, brandName)
    .replace(/{catatan}/gi, catatanSandiLama);

  text = text.replace(/\n{3,}/g, '\n\n').trim();

  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.slice(1);
  const phoneParam = cleanPhone ? `phone=${cleanPhone}&` : '';
  const waUrl = `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(text)}`;

  window.open(waUrl, '_blank');
  showToast('Membuka WhatsApp untuk mengirim data pelanggan...', 'info');
}

// ---------------------------------------------
// Fitur 3: Daftar HP Terhubung (Live Clients)
// ---------------------------------------------
let currentClientsDeviceId = null;
let currentClientsDeviceName = '';

async function openConnectedClientsModal(deviceId, clientName) {
  currentClientsDeviceId = deviceId;
  currentClientsDeviceName = clientName;

  document.getElementById('clientsModalTarget').textContent = `Target: ${clientName}`;
  document.getElementById('clientsTotalCount').textContent = '...';
  document.getElementById('clientsTableBody').innerHTML = `
    <tr>
      <td colspan="6" class="loading-state" style="padding: 30px 10px;">
        <div class="spinner"></div>
        <p>Mengambil data perangkat terhubung dari modem...</p>
      </td>
    </tr>
  `;

  document.getElementById('connectedClientsModal').classList.add('open');
  await loadConnectedClientsData(deviceId);
}

async function refreshConnectedClients() {
  if (!currentClientsDeviceId) return;
  const btn = document.getElementById('btnRefreshClients');
  if (btn) btn.disabled = true;
  await loadConnectedClientsData(currentClientsDeviceId);
  if (btn) btn.disabled = false;
}

async function loadConnectedClientsData(deviceId) {
  const tbody = document.getElementById('clientsTableBody');
  const countEl = document.getElementById('clientsTotalCount');

  try {
    const res = await fetch(`/api/device/clients?id=${encodeURIComponent(deviceId)}`);
    const data = await res.json();

    if (data.success && Array.isArray(data.clients)) {
      countEl.textContent = data.clients.length;
      if (data.clients.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="loading-state" style="padding: 35px 10px;">
              <p>Tidak ada perangkat HP atau Laptop yang sedang terhubung saat ini.</p>
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = data.clients.map((c, idx) => {
        let rssiBadge;
        if (c.type === 'LAN') {
          rssiBadge = `<span class="rssi-badge rssi-lan">🔌 LAN (Kabel)</span>`;
        } else {
          const rssiVal = parseInt(c.rssi);
          if (isNaN(rssiVal)) {
            rssiBadge = `<span class="rssi-badge rssi-medium">${escapeHtml(c.rssi)}</span>`;
          } else if (rssiVal >= -65) {
            rssiBadge = `<span class="rssi-badge rssi-good">📶 ${c.rssi} (Bagus)</span>`;
          } else if (rssiVal >= -78) {
            rssiBadge = `<span class="rssi-badge rssi-medium">📶 ${c.rssi} (Sedang)</span>`;
          } else {
            rssiBadge = `<span class="rssi-badge rssi-bad">📶 ${c.rssi} (Lemah)</span>`;
          }
        }

        const typeIcon = c.type === 'LAN' ? '🔌 LAN' : '📶 Wi-Fi';

        return `
          <tr>
            <td style="color:var(--text-muted); font-size:0.8rem;">${idx + 1}</td>
            <td>
              <strong style="color:var(--text-main); font-size:0.9rem;">📱 ${escapeHtml(c.hostname)}</strong>
            </td>
            <td><span style="font-size:0.8rem; color:var(--text-muted);">${typeIcon}</span></td>
            <td><code style="font-family:var(--font-mono); color:#93c5fd; font-size:0.85rem;">${escapeHtml(c.ip)}</code></td>
            <td><code style="font-family:var(--font-mono); color:var(--text-muted); font-size:0.8rem;">${escapeHtml(c.mac)}</code></td>
            <td>${rssiBadge}</td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="loading-state color-red" style="padding:30px 10px;">
            <p>⚠️ ${escapeHtml(data.message || 'Gagal memuat daftar perangkat')}</p>
          </td>
        </tr>
      `;
    }
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="loading-state color-red" style="padding:30px 10px;">
          <p>Terjadi kesalahan: ${escapeHtml(err.message)}</p>
        </td>
      </tr>
    `;
  }
}

// ---------------------------------------------
// Fitur 4: Ping & Latency Diagnostic Test
// ---------------------------------------------
let currentPingIp = '';
let currentPingName = '';

async function openPingModal(ip, clientName) {
  if (!ip || ip === '-' || ip === '0.0.0.0') {
    showToast('Modem belum mendapatkan IP PPPoE (modem sedang offline)', 'warning');
    return;
  }

  currentPingIp = ip;
  currentPingName = clientName;

  document.getElementById('pingModalTarget').textContent = `Target: ${clientName} (${ip})`;
  document.getElementById('pingLoadingBox').style.display = 'block';
  document.getElementById('pingResultBox').style.display = 'none';
  document.getElementById('btnRepeatPing').disabled = true;

  document.getElementById('pingModal').classList.add('open');
  await runPingTest(ip);
}

async function repeatCurrentPing() {
  if (!currentPingIp) return;
  document.getElementById('pingLoadingBox').style.display = 'block';
  document.getElementById('pingResultBox').style.display = 'none';
  document.getElementById('btnRepeatPing').disabled = true;
  await runPingTest(currentPingIp);
}

async function runPingTest(ip) {
  const loadBox = document.getElementById('pingLoadingBox');
  const resBox = document.getElementById('pingResultBox');
  const btnRepeat = document.getElementById('btnRepeatPing');

  try {
    const res = await fetch('/api/device/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    const data = await res.json();

    loadBox.style.display = 'none';
    resBox.style.display = 'block';
    btnRepeat.disabled = false;

    if (data.success) {
      document.getElementById('pingAvgVal').textContent = data.avg !== null ? `${data.avg} ms` : '-';
      document.getElementById('pingMinVal').textContent = data.min !== null ? `${data.min} ms` : '-';
      document.getElementById('pingMaxVal').textContent = data.max !== null ? `${data.max} ms` : '-';
      document.getElementById('pingLossVal').textContent = `${data.loss}%`;

      const banner = document.getElementById('pingStatusBanner');
      const icon = document.getElementById('pingStatusIcon');
      const title = document.getElementById('pingStatusTitle');
      const desc = document.getElementById('pingStatusDesc');

      if (data.statusColor === 'green') {
        banner.style.background = 'rgba(0, 230, 118, 0.12)';
        banner.style.borderColor = 'rgba(0, 230, 118, 0.3)';
        icon.textContent = '🟢';
        title.style.color = '#00e676';
        title.textContent = data.statusText;
        desc.textContent = 'Koneksi ke modem stabil dan latensi sangat baik.';
      } else if (data.statusColor === 'yellow') {
        banner.style.background = 'rgba(255, 179, 0, 0.12)';
        banner.style.borderColor = 'rgba(255, 179, 0, 0.3)';
        icon.textContent = '🟡';
        title.style.color = '#ffb300';
        title.textContent = data.statusText;
        desc.textContent = 'Ada sedikit gangguan paket loss atau latensi tinggi.';
      } else {
        banner.style.background = 'rgba(255, 51, 102, 0.12)';
        banner.style.borderColor = 'rgba(255, 51, 102, 0.3)';
        icon.textContent = '🔴';
        title.style.color = '#ff3366';
        title.textContent = data.statusText;
        desc.textContent = 'Modem tidak merespons ping sama sekali (RTO).';
      }

      document.getElementById('pingRawOutput').textContent = data.raw || 'Tidak ada detail output';
    } else {
      showToast('Ping gagal: ' + (data.message || 'Error'), 'error');
    }
  } catch (err) {
    loadBox.style.display = 'none';
    showToast('Gagal menghubungi API ping: ' + err.message, 'error');
    btnRepeat.disabled = false;
  }
}

// ---------------------------------------------
// Fitur 5: Bot WhatsApp (Scan Barcode) & Telegram
// ---------------------------------------------
let waPollInterval = null;

async function checkWhatsAppStatus(isManual = false) {
  try {
    const res = await fetch('/api/whatsapp/status');
    const data = await res.json();
    renderWhatsAppStatus(data);
    if (isManual) {
      if (data.connected) {
        const phone = data.user?.id ? `+${data.user.id.split(':')[0].split('@')[0]}` : 'Aktif';
        showToast(`✅ Bot WhatsApp Terhubung! Akun: ${phone}`, 'success');
      } else if (data.qr) {
        showToast('Silakan scan barcode WhatsApp yang tampil di layar.', 'info');
      } else {
        showToast('Bot WhatsApp belum terhubung. Klik "Scan Barcode Baru".', 'info');
      }
    }
  } catch (e) {
    console.error('Check WA status err:', e);
  }
}

function renderWhatsAppStatus(data) {
  const badge = document.getElementById('waStatusBadge');
  const qrBox = document.getElementById('waQrBox');
  const qrImg = document.getElementById('waQrImage');
  const pairingBox = document.getElementById('waPairingBox');
  const pairingDisplay = document.getElementById('waPairingCodeDisplay');
  const connBox = document.getElementById('waConnectedBox');
  const connPhone = document.getElementById('waConnectedPhone');

  if (!badge) return;

  if (data.connected) {
    badge.innerHTML = `<span class="status-badge online"><span class="dot-live"></span> ONLINE</span>`;
    if (qrBox) qrBox.style.display = 'none';
    if (pairingBox) pairingBox.style.display = 'none';
    if (connBox) connBox.style.display = 'block';
    if (connPhone) {
      connPhone.textContent = data.user?.id ? `+${data.user.id.split(':')[0].split('@')[0]}` : 'Terhubung';
    }
    clearInterval(waPollInterval);
    waPollInterval = null;
  } else if (data.pairingCode) {
    badge.innerHTML = `<span class="status-badge" style="background:rgba(0,242,254,0.15); color:var(--primary-cyan); border:1px solid rgba(0,242,254,0.3);"><span class="spin-icon">🔢</span> KODE AKTIF</span>`;
    if (qrBox) qrBox.style.display = 'none';
    if (pairingBox) pairingBox.style.display = 'block';
    if (pairingDisplay) pairingDisplay.textContent = data.pairingCode;
    if (connBox) connBox.style.display = 'none';
  } else if (data.qr) {
    badge.innerHTML = `<span class="status-badge" style="background:rgba(255,179,0,0.15); color:#ffb300; border:1px solid rgba(255,179,0,0.3);"><span class="spin-icon">⏳</span> SCAN BARCODE</span>`;
    if (qrBox) qrBox.style.display = 'block';
    if (qrImg) qrImg.src = data.qr;
    if (pairingBox) pairingBox.style.display = 'none';
    if (connBox) connBox.style.display = 'none';
  } else if (data.status === 'connecting') {
    badge.innerHTML = `<span class="status-badge" style="background:rgba(0,242,254,0.15); color:var(--primary-cyan); border:1px solid rgba(0,242,254,0.3);"><span class="spin-icon">🔄</span> MENGHUBUNGKAN...</span>`;
    if (qrBox) qrBox.style.display = 'none';
    if (pairingBox) pairingBox.style.display = 'none';
    if (connBox) connBox.style.display = 'none';
  } else {
    badge.innerHTML = `<span class="status-badge offline">🔴 Belum Terhubung</span>`;
    if (qrBox) qrBox.style.display = 'none';
    if (pairingBox) pairingBox.style.display = 'none';
    if (connBox) connBox.style.display = 'none';
    clearInterval(waPollInterval);
    waPollInterval = null;
  }
}

async function connectWhatsApp(mode = 'qr') {
  const btn = document.getElementById('btnTriggerWaConnect');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin-icon">🔄</span> Memuat Barcode...`;
  }
  showToast('Memulai sesi WhatsApp & membuat barcode baru...', 'info');

  try {
    const res = await fetch('/api/whatsapp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'qr' })
    });
    const data = await res.json();
    renderWhatsAppStatus(data);

    // Poll status every 2.5 seconds until connected or barcode scanned
    clearInterval(waPollInterval);
    waPollInterval = setInterval(async () => {
      await checkWhatsAppStatus(false);
    }, 2500);
  } catch (err) {
    showToast('Gagal inisialisasi WA: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>📸</span> <span>Tampilkan Barcode Baru</span>`;
    }
  }
}

async function requestWaPairingCode() {
  const phoneInput = document.getElementById('waAdminPhoneInput');
  let phone = phoneInput ? phoneInput.value.trim() : '';

  if (!phone) {
    phone = prompt('Masukkan Nomor WhatsApp Admin untuk ditautkan (contoh: 081234567890):');
    if (!phone) return;
    if (phoneInput) phoneInput.value = phone.trim();
  }

  const btn = document.getElementById('btnTriggerWaCode');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spin-icon">🔄</span> Mengambil Kode...`;
  }
  showToast(`Meminta kode tautan untuk ${phone}...`, 'info');

  try {
    const res = await fetch('/api/whatsapp/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'code', phone: phone })
    });
    const data = await res.json();
    renderWhatsAppStatus(data);

    // Poll status every 2.5 seconds
    clearInterval(waPollInterval);
    waPollInterval = setInterval(async () => {
      await checkWhatsAppStatus(false);
    }, 2500);
  } catch (err) {
    showToast('Gagal meminta kode pasangkan: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🔢</span> <span>Tautkan Pakai Kode 8-Digit</span>`;
    }
  }
}

function copyPairingCode() {
  const code = document.getElementById('waPairingCodeDisplay')?.textContent?.trim();
  if (code && !code.includes('--')) {
    navigator.clipboard.writeText(code.replace(/[\s\-]/g, '')).then(() => {
      showToast('✅ Kode pasangkan berhasil disalin ke clipboard!', 'success');
    }).catch(() => {
      showToast('Kode: ' + code, 'info');
    });
  }
}

async function disconnectWhatsApp() {
  if (!confirm('Apakah Anda yakin ingin memutuskan tautan bot WhatsApp ini?')) return;
  showToast('Memutuskan WhatsApp...', 'info');
  try {
    const res = await fetch('/api/whatsapp/logout', { method: 'POST' });
    const data = await res.json();
    showToast('WhatsApp berhasil diputuskan!', 'success');
    checkWhatsAppStatus(false);
  } catch (err) {
    showToast('Error logout WA: ' + err.message, 'error');
  }
}

async function testWhatsAppAlert() {
  const phone = document.getElementById('waAdminPhoneInput')?.value.trim();
  if (!phone) {
    showToast('Masukkan nomor WhatsApp admin terlebih dahulu!', 'warning');
    document.getElementById('waAdminPhoneInput')?.focus();
    return;
  }
  showToast(`Mengirim pesan tes ke ${phone}...`, 'info');
  try {
    const res = await fetch('/api/whatsapp/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Pesan tes WhatsApp berhasil terkirim ke ${phone}!`, 'success');
    } else {
      showToast(`❌ Gagal: ${data.message || 'Periksa status koneksi WA'}`, 'error');
    }
  } catch (err) {
    showToast('Error tes WA: ' + err.message, 'error');
  }
}

function updateChannelPanelsUI() {
  const channel = document.querySelector('input[name="notifChannel"]:checked')?.value || 'both';
  const waSubpanel = document.getElementById('waSubpanel');
  const tgSubpanel = document.getElementById('tgSubpanel');

  if (waSubpanel) {
    waSubpanel.style.display = (channel === 'whatsapp' || channel === 'both') ? 'block' : 'none';
  }
  if (tgSubpanel) {
    tgSubpanel.style.display = (channel === 'telegram' || channel === 'both') ? 'block' : 'none';
  }
}

const DEFAULT_WIFI_TEMPLATE = `Halo Bapak/Ibu *{nama}*,

Berikut adalah rincian informasi koneksi internet dan Wi-Fi Anda:

📶 *Nama Wi-Fi (SSID):* {ssid}
🔑 *Password Wi-Fi:* {password}
{catatan}

Silakan sambungkan kembali HP atau laptop Anda dengan password di atas.

Terima kasih telah berlangganan layanan *{brand}*!`;

let cachedWifiMsgTemplate = '';

function resetWifiMsgTemplate() {
  const input = document.getElementById('wifiMsgTemplateInput');
  if (input) {
    input.value = DEFAULT_WIFI_TEMPLATE;
    showToast('Template di-reset ke default. Klik "Simpan Pengaturan Notifikasi" untuk menyimpan!', 'info');
  }
}

async function loadNotificationSettings() {
  try {
    const res = await fetch('/api/notifications/config');
    const data = await res.json();
    if (data.success) {
      const ch = data.channel || 'both';
      const radio = document.querySelector(`input[name="notifChannel"][value="${ch}"]`);
      if (radio) radio.checked = true;

      cachedWifiMsgTemplate = data.wifiMsgTemplate || '';
      const tplInput = document.getElementById('wifiMsgTemplateInput');
      if (tplInput) {
        tplInput.value = data.wifiMsgTemplate || DEFAULT_WIFI_TEMPLATE;
      }

      document.getElementById('waAdminPhoneInput').value = data.adminPhone || '';
      document.getElementById('tgTokenInput').value = data.telegram?.botToken || '';
      document.getElementById('tgChatIdInput').value = data.telegram?.chatId || '';
      document.getElementById('alertLosInput').checked = (data.channel === 'telegram' ? data.telegram?.alertLos : data.whatsapp?.alertLos) !== false;
      const custLosInput = document.getElementById('alertCustomerLosInput');
      if (custLosInput) {
        custLosInput.checked = data.whatsapp?.notifyCustomerLos !== false;
      }
      document.getElementById('alertRxInput').checked = (data.channel === 'telegram' ? data.telegram?.alertRedaman : data.whatsapp?.alertRedaman) !== false;

      updateChannelPanelsUI();
    }
    await checkWhatsAppStatus(false);
  } catch (e) {
    console.error('Load notification settings err:', e);
  }
}

async function saveNotificationSettings(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveNotifications');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Menyimpan...';

  const channel = document.querySelector('input[name="notifChannel"]:checked')?.value || 'both';
  const adminPhone = document.getElementById('waAdminPhoneInput').value.trim();
  const wifiMsgTemplate = document.getElementById('wifiMsgTemplateInput')?.value || DEFAULT_WIFI_TEMPLATE;
  const botToken = document.getElementById('tgTokenInput').value.trim();
  const chatId = document.getElementById('tgChatIdInput').value.trim();
  const alertLos = document.getElementById('alertLosInput').checked;
  const alertCustomerLos = document.getElementById('alertCustomerLosInput')?.checked !== false;
  const alertRedaman = document.getElementById('alertRxInput').checked;

  try {
    const res = await fetch('/api/notifications/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        adminPhone,
        wifiMsgTemplate,
        telegram: { enabled: channel !== 'whatsapp', botToken, chatId, alertLos, alertRedaman },
        whatsapp: { enabled: channel !== 'telegram', alertLos, alertRedaman, notifyCustomerLos: alertCustomerLos }
      })
    });
    const data = await res.json();
    if (data.success) {
      cachedWifiMsgTemplate = wifiMsgTemplate;
      showToast('✅ Pengaturan notifikasi & template pesan berhasil disimpan!', 'success');
    } else {
      showToast('Gagal: ' + (data.message || 'Error simpan'), 'error');
    }
  } catch (err) {
    showToast('Error simpan notifikasi: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Simpan Pengaturan Notifikasi';
  }
}

async function testTelegramAlert() {
  const btn = document.getElementById('btnTestTg');
  const botToken = document.getElementById('tgTokenInput').value.trim();
  const chatId = document.getElementById('tgChatIdInput').value.trim();

  if (!botToken || !chatId) {
    showToast('Harap isi Bot Token dan Chat ID terlebih dahulu', 'warning');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Mengirim Tes...';

  try {
    const res = await fetch('/api/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken, chatId })
    });
    const data = await res.json();

    if (data.success) {
      showToast('✅ Berhasil! Pesan tes terkirim ke Telegram Anda.', 'success');
    } else {
      showToast('❌ Gagal: ' + (data.error?.description || data.error || data.message || 'Periksa token & chat ID'), 'error');
    }
  } catch (err) {
    showToast('Error kirim tes: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🧪 Tes Telegram';
  }
}
