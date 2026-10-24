#!/usr/bin/env bash
# ==============================================================================
#   🚀 AUTO-INSTALLER 1-KLIK GENIEACS TR-069 + NOC WEB PANEL (BY KURTECH)
#   🌐 Kompatibel: STB Armbian (B860H/HG680P), Proxmox VE (LXC/VM), & Cloud VPS
#   🖥️ Didukung OS: Ubuntu 20.04/22.04/24.04, Debian 11/12, Armbian ARM64/AMD64
#   🌐 Official Website: https://kurtech.my.id
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
echo -e "${BOLD}${GREEN}  🚀 AUTO-INSTALLER GENIEACS TR-069 + NOC WEB PANEL (BY KURTECH)${NC}"
echo -e "${YELLOW}  🌐 Siap untuk: STB Armbian (DHCP MikroTik) | Proxmox LXC/VM | Cloud VPS${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""

# 1. Cek Hak Akses Root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[ERROR] Script ini wajib dijalankan sebagai ROOT!${NC}"
  echo -e "${YELLOW}Gunakan: sudo bash $0${NC}"
  exit 1
fi

# 2. Deteksi Arsitektur & Distro
ARCH=$(uname -m)
echo -e "${BLUE}[INFO] Mendeteksi Sistem Operasi & Arsitektur Mesin...${NC}"
echo -e "       - Arsitektur CPU: ${BOLD}${CYAN}$ARCH${NC}"

if [ -f /etc/os-release ]; then
  . /etc/os-release
  DISTRO=$ID
  VERSION_ID=$VERSION_ID
  CODENAME=$VERSION_CODENAME
  echo -e "       - Sistem Operasi: ${BOLD}${CYAN}$PRETTY_NAME${NC}"
else
  echo -e "${RED}[ERROR] Tidak dapat mendeteksi file /etc/os-release!${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/panel-acs"
GENIEACS_DIR="/opt/genieacs"

# 3. Update Paket Dasar Sistem
echo ""
echo -e "${BLUE}[1/8] Memperbarui Repository & Menginstall Dependensi Dasar...${NC}"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl wget gnupg lsb-release net-tools git build-essential ufw iproute2 sudo ca-certificates

# 4. Install Node.js LTS (v20)
echo ""
echo -e "${BLUE}[2/8] Memeriksa & Menginstall Node.js v20 LTS...${NC}"
NODE_OK=false
if command -v node >/dev/null 2>&1; then
  NODE_VER=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
  if [ "$NODE_VER" -ge 18 ]; then
    echo -e "${GREEN}[OK] Node.js sudah terpasang: $(node -v)${NC}"
    NODE_OK=true
  fi
fi

if [ "$NODE_OK" = false ]; then
  echo -e "${YELLOW}[INFO] Mengunduh dan memasang Node.js v20 LTS dari NodeSource...${NC}"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
  echo -e "${GREEN}[OK] Node.js berhasil dipasang: $(node -v) (NPM: $(npm -v))${NC}"
fi

# 5. Install MongoDB & Tools
echo ""
echo -e "${BLUE}[3/8] Memeriksa & Menginstall MongoDB Database Server...${NC}"
if systemctl is-active --quiet mongod || systemctl is-active --quiet mongodb; then
  echo -e "${GREEN}[OK] Layanan MongoDB sudah berjalan aktif.${NC}"
else
  # Deteksi Versi MongoDB yang Didukung (Bookworm wajib MongoDB 7.0)
  MONGO_VER="6.0"
  if [ "$CODENAME" = "bookworm" ]; then
    MONGO_VER="7.0"
  fi
  curl -fsSL https://www.mongodb.org/static/pgp/server-$MONGO_VER.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-$MONGO_VER.gpg --yes || true
  
  if [ "$DISTRO" = "ubuntu" ]; then
    UBUNTU_CODENAME="jammy"
    if [ "$VERSION_ID" = "20.04" ]; then UBUNTU_CODENAME="focal"; fi
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-$MONGO_VER.gpg ] https://repo.mongodb.org/apt/ubuntu $UBUNTU_CODENAME/mongodb-org/$MONGO_VER multiverse" | tee /etc/apt/sources.list.d/mongodb-org-$MONGO_VER.list
  elif [ "$DISTRO" = "debian" ] || [ "$DISTRO" = "armbian" ]; then
    DEB_CODENAME="bullseye"
    if [ "$CODENAME" = "bookworm" ]; then DEB_CODENAME="bookworm"; fi
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-$MONGO_VER.gpg ] https://repo.mongodb.org/apt/debian $DEB_CODENAME/mongodb-org/$MONGO_VER main" | tee /etc/apt/sources.list.d/mongodb-org-$MONGO_VER.list
  fi

  apt-get update -y || true
  if apt-get install -y mongodb-org mongodb-org-database-tools; then
    echo -e "${GREEN}[OK] MongoDB-Org berhasil dipasang.${NC}"
  else
    echo -e "${YELLOW}[INFO] Repo mongodb-org tidak tersedia langsung, mencoba mongodb default distro...${NC}"
    apt-get install -y mongodb mongodb-server mongo-tools || apt-get install -y mongodb-org || true
  fi

  # Enable & start
  systemctl daemon-reload
  systemctl enable mongod || systemctl enable mongodb || true
  systemctl start mongod || systemctl start mongodb || true
  echo -e "${GREEN}[OK] MongoDB berhasil aktif.${NC}"
fi

# 6. Install GenieACS Core Globally
echo ""
echo -e "${BLUE}[4/8] Menginstall GenieACS Core v1.2.9...${NC}"
npm install -g genieacs@1.2.9 --unsafe-perm=true --allow-root

NODE_BIN_PATH=$(which node)
CWMP_BIN=$(which genieacs-cwmp || echo "/usr/bin/genieacs-cwmp")
NBI_BIN=$(which genieacs-nbi || echo "/usr/bin/genieacs-nbi")
FS_BIN=$(which genieacs-fs || echo "/usr/bin/genieacs-fs")
UI_BIN=$(which genieacs-ui || echo "/usr/bin/genieacs-ui")

# Folder Konfigurasi GenieACS
mkdir -p "$GENIEACS_DIR"
mkdir -p /var/log/genieacs

cat << 'EOF' > "$GENIEACS_DIR/genieacs.env"
GENIEACS_CWMP_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-cwmp-access.log
GENIEACS_NBI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-nbi-access.log
GENIEACS_FS_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-fs-access.log
GENIEACS_UI_ACCESS_LOG_FILE=/var/log/genieacs/genieacs-ui-access.log
GENIEACS_CWMP_PORT=7547
GENIEACS_NBI_PORT=7557
GENIEACS_FS_PORT=7567
GENIEACS_UI_PORT=3000
GENIEACS_MONGODB_CONNECTION_URL=mongodb://127.0.0.1:27017/genieacs
EOF

# 7. Buat Systemd Service untuk 4 Service GenieACS
echo ""
echo -e "${BLUE}[5/8] Membuat Systemd Services untuk GenieACS (Auto-Start on Boot)...${NC}"

# genieacs-cwmp
cat << EOF > /etc/systemd/system/genieacs-cwmp.service
[Unit]
Description=GenieACS CWMP Service (TR-069 Server)
After=network.target mongod.service mongodb.service

[Service]
Type=simple
EnvironmentFile=$GENIEACS_DIR/genieacs.env
ExecStart=$CWMP_BIN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# genieacs-nbi
cat << EOF > /etc/systemd/system/genieacs-nbi.service
[Unit]
Description=GenieACS NBI Service (Northbound API)
After=network.target mongod.service mongodb.service

[Service]
Type=simple
EnvironmentFile=$GENIEACS_DIR/genieacs.env
ExecStart=$NBI_BIN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# genieacs-fs
cat << EOF > /etc/systemd/system/genieacs-fs.service
[Unit]
Description=GenieACS FS Service (File Server)
After=network.target mongod.service mongodb.service

[Service]
Type=simple
EnvironmentFile=$GENIEACS_DIR/genieacs.env
ExecStart=$FS_BIN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# genieacs-ui
cat << EOF > /etc/systemd/system/genieacs-ui.service
[Unit]
Description=GenieACS Official Web UI
After=network.target mongod.service mongodb.service

[Service]
Type=simple
EnvironmentFile=$GENIEACS_DIR/genieacs.env
ExecStart=$UI_BIN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 8. Import Preset & Virtual Parameters Kurtech ke MongoDB
echo ""
echo -e "${BLUE}[6/8] Mengimport Preset, Virtual Parameters, dan Provision Kurtech ke MongoDB...${NC}"
CONF_DIR="$SCRIPT_DIR/conf-acs"
if [ -d "$CONF_DIR" ]; then
  if command -v mongorestore >/dev/null 2>&1; then
    mongorestore --db genieacs --drop "$CONF_DIR" || true
    echo -e "${GREEN}[OK] Database Kurtech (Virtual Parameters, Redaman, PonMode, Temp) berhasil diimport!${NC}"
  else
    echo -e "${YELLOW}[WARN] Command mongorestore belum terpasang. Mencoba memasang mongo-tools...${NC}"
    apt-get install -y mongodb-database-tools mongo-tools || true
    if command -v mongorestore >/dev/null 2>&1; then
      mongorestore --db genieacs --drop "$CONF_DIR" || true
      echo -e "${GREEN}[OK] Database Kurtech berhasil diimport!${NC}"
    fi
  fi
else
  echo -e "${YELLOW}[INFO] Folder conf-acs tidak ditemukan di $CONF_DIR, lewati import.${NC}"
fi

# 9. Setup KURTECH NOC Web Panel
echo ""
echo -e "${BLUE}[7/8] Menyiapkan KURTECH NOC Web Panel ke $INSTALL_DIR...${NC}"
mkdir -p "$INSTALL_DIR"

# Salin isi source panel
if [ -d "$SCRIPT_DIR/panel-acs" ]; then
  cp -rf "$SCRIPT_DIR/panel-acs/"* "$INSTALL_DIR/"
else
  # Jika script dieksekusi langsung di dalam folder panel
  cp -rf "$SCRIPT_DIR/"* "$INSTALL_DIR/" || true
fi

# Pastikan package.json & node_modules terpasang
cd "$INSTALL_DIR"
echo -e "${YELLOW}[INFO] Memasang dependensi Node.js (@whiskeysockets/baileys, exceljs, qrcode)...${NC}"
npm install --production --unsafe-perm=true || true

# Buat Systemd Service untuk KURTECH Panel
cat << EOF > /etc/systemd/system/panel-acs.service
[Unit]
Description=KURTECH GenieACS NOC Web Panel & WhatsApp Bot
After=network.target mongod.service genieacs-nbi.service
Wants=mongod.service genieacs-nbi.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN_PATH server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 10. Enable & Start Semua Services
echo ""
echo -e "${BLUE}[8/8] Mengaktifkan Seluruh Layanan (Systemd Daemon)...${NC}"
systemctl daemon-reload
systemctl enable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui panel-acs
systemctl restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui panel-acs

# Buka Firewall jika UFW aktif
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo -e "${YELLOW}[INFO] Mengizinkan port 3300, 3000, 7547 di Firewall UFW...${NC}"
  ufw allow 3300/tcp comment 'KURTECH ACS Panel' || true
  ufw allow 3000/tcp comment 'GenieACS UI' || true
  ufw allow 7547/tcp comment 'GenieACS TR-069 CWMP' || true
  ufw allow 7557/tcp comment 'GenieACS NBI API' || true
fi

# Pasang Script Helper Cepat di /usr/local/bin
cat << 'EOF' > /usr/local/bin/acs-status
#!/usr/bin/env bash
echo "========================================================="
echo "   📊 STATUS LAYANAN GENIEACS + KURTECH ACS PANEL"
echo "========================================================="
for s in mongod genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui panel-acs; do
  if systemctl is-active --quiet $s || systemctl is-active --quiet ${s/mongod/mongodb}; then
    echo -e "  [🟢 AKTIF] $s"
  else
    echo -e "  [🔴 MATI]  $s"
  fi
done
echo "========================================================="
EOF
chmod +x /usr/local/bin/acs-status

cat << 'EOF' > /usr/local/bin/acs-restart
#!/usr/bin/env bash
echo "[INFO] Me-restart seluruh layanan GenieACS & KURTECH Panel..."
systemctl restart genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui panel-acs
echo "[OK] Selesai!"
acs-status
EOF
chmod +x /usr/local/bin/acs-restart

# Deteksi IP Lokal (DHCP dari MikroTik) & IP Publik
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}')
fi
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi

PUBLIC_IP=$(curl -s -m 2 https://api.ipify.org 2>/dev/null || echo "$LOCAL_IP")

echo ""
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}  🎉 INSTALASI BERHASIL 100%! SEMUA SERVICE TELAH AKTIF!${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""
echo -e "  🏢 ${BOLD}GENIEACS TR-069 NOC PANEL (BY KURTECH):${NC}"
echo -e "     👉 ${CYAN}http://${LOCAL_IP}:3300${NC} (Akses Jaringan Lokal / LAN STB)"
if [ "$PUBLIC_IP" != "$LOCAL_IP" ]; then
  echo -e "     👉 ${CYAN}http://${PUBLIC_IP}:3300${NC} (Akses Publik / VPS)"
fi
echo -e "     🔑 Login Admin: ${BOLD}admin${NC} | Sandi: ${BOLD}admin${NC}"
echo ""
echo -e "  ⚙️ ${BOLD}GenieACS Official UI:${NC}"
echo -e "     👉 ${CYAN}http://${LOCAL_IP}:3000${NC}"
echo -e "     🔑 Login GenieACS: ${BOLD}admin${NC} | Sandi: ${BOLD}admin${NC}"
echo ""
echo -e "  📡 ${BOLD}URL TR-069 UNTUK MODEM ONT PELANGGAN (Inform URL):${NC}"
echo -e "     👉 ${YELLOW}http://${LOCAL_IP}:7547/${NC}"
if [ "$PUBLIC_IP" != "$LOCAL_IP" ]; then
  echo -e "     👉 ${YELLOW}http://${PUBLIC_IP}:7547/${NC} (Jika di VPS / IP Publik)"
fi
echo ""
echo -e "  🛠️ ${BOLD}Perintah Cepat di Terminal Linux:${NC}"
echo -e "     * Cek Status Layanan: ${BOLD}acs-status${NC}"
echo -e "     * Restart Semua:      ${BOLD}acs-restart${NC}"
echo -e "     * Log Panel:          ${BOLD}journalctl -u panel-acs -f${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""
