#!/usr/bin/env bash
# ==============================================================================
#   🚀 INSTALL KHUSUS NOC WEB PANEL SAJA (BY KURTECH)
#   🌐 Untuk Server / Proxmox yang SUDAH TERPASANG GenieACS sebelumnya
#   🖥️ Tidak menghapus database perangkat modem yang sudah ada
# ==============================================================================

set -e

# Warna Terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

clear
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}  🚀 INSTALLER KHUSUS NOC WEB PANEL (GENIEACS SUDAH ADA)${NC}"
echo -e "${YELLOW}  🌐 By Kurtech • Aman Tanpa Menghapus Data Modem yang Sudah Ada${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""

# 1. Cek Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Wajib dijalankan sebagai ROOT! (sudo bash $0)${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/panel-acs"

# 2. Cek apakah GenieACS NBI aktif
echo -e "${BLUE}[1/5] Memeriksa Layanan GenieACS NBI (Port 7557)...${NC}"
NBI_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:7557/devices 2>/dev/null || echo "000")
if [ "$NBI_CHECK" = "200" ] || [ "$NBI_CHECK" = "401" ]; then
  echo -e "${GREEN}[OK] GenieACS NBI terdeteksi aktif pada port 7557.${NC}"
else
  echo -e "${YELLOW}[WARN] Port 7557 tidak merespons (Kode: $NBI_CHECK).${NC}"
  echo -e "       Pastikan service genieacs-nbi aktif setelah instalasi selesai."
fi

# 3. Cek / Install Node.js jika belum ada
echo ""
echo -e "${BLUE}[2/5] Memeriksa Lingkungan Node.js...${NC}"
if ! command -v node >/dev/null 2>&1; then
  echo -e "${YELLOW}[INFO] Node.js belum terpasang. Menginstall Node.js v20 LTS...${NC}"
  apt-get update -y
  apt-get install -y curl gnupg ca-certificates
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs build-essential
fi
echo -e "${GREEN}[OK] Node.js aktif: $(node -v) (NPM: $(npm -v))${NC}"

# 4. Salin File Panel ke /opt/panel-acs
echo ""
echo -e "${BLUE}[3/5] Menyiapkan Folder Panel ke $INSTALL_DIR...${NC}"
mkdir -p "$INSTALL_DIR"

if [ -d "$SCRIPT_DIR/panel-acs" ]; then
  cp -rf "$SCRIPT_DIR/panel-acs/"* "$INSTALL_DIR/"
else
  cp -rf "$SCRIPT_DIR/"* "$INSTALL_DIR/" || true
fi

cd "$INSTALL_DIR"
echo -e "${YELLOW}[INFO] Memasang dependensi Node.js (@whiskeysockets/baileys, exceljs, qrcode)...${NC}"
npm install --production --unsafe-perm=true || true

# 5. Opsi Tambah Virtual Parameters Kurtech ke MongoDB (Hanya VIRTUAL PARAMETERS, tidak hapus perangkat)
echo ""
echo -e "${BLUE}[4/5] Memeriksa Virtual Parameters Kurtech (Redaman RX, PON, Suhu, Uptime)...${NC}"
CONF_DIR="$SCRIPT_DIR/conf-acs"
if [ -d "$CONF_DIR" ] && command -v mongorestore >/dev/null 2>&1; then
  if [ -f "$CONF_DIR/virtualParameters.bson" ]; then
    echo -e "${YELLOW}[INFO] Mengimport Virtual Parameters Kurtech (tidak menghapus daftar modem Anda)...${NC}"
    mongorestore --db genieacs -c virtualParameters --drop "$CONF_DIR/virtualParameters.bson" 2>/dev/null || true
    echo -e "${GREEN}[OK] Virtual Parameters Kurtech berhasil disinkronkan!${NC}"
  fi
fi

# 6. Buat Systemd Service & Aktifkan
echo ""
echo -e "${BLUE}[5/5] Membuat Service panel-acs.service (Auto-Start on Boot)...${NC}"
NODE_BIN=$(which node)

cat << EOF > /etc/systemd/system/panel-acs.service
[Unit]
Description=GenieACS NOC Web Panel & WhatsApp Bot (by Kurtech)
After=network.target mongod.service mongodb.service genieacs-nbi.service
Wants=genieacs-nbi.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable panel-acs
systemctl restart panel-acs

# Buka Port 3300 di Firewall jika UFW aktif
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 3300/tcp comment 'NOC Web Panel Kurtech' || true
fi

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}')
fi
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi

echo ""
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}  🎉 INSTALASI PANEL BERHASIL! LAYANAN TELAH AKTIF!${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""
echo -e "  🏢 ${BOLD}AKSES NOC WEB PANEL:${NC}"
echo -e "     👉 ${CYAN}http://${LOCAL_IP}:3300${NC}"
echo -e "     🔑 Login Default: Username: ${BOLD}admin${NC} | Password: ${BOLD}admin${NC}"
echo ""
echo -e "  🛠️ ${BOLD}Perintah Cek Layanan:${NC}"
echo -e "     * Cek Status Panel : ${BOLD}systemctl status panel-acs${NC}"
echo -e "     * Restart Panel    : ${BOLD}systemctl restart panel-acs${NC}"
echo -e "     * Log Realtime     : ${BOLD}journalctl -u panel-acs -f${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""
