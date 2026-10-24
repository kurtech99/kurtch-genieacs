#!/usr/bin/env bash
# ==============================================================================
#   🔄 SCRIPT UPDATE KURTECH NOC WEB PANEL (LINUX)
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "[ERROR] Wajib dijalankan sebagai ROOT! (sudo bash $0)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/panel-acs"

echo "========================================================="
echo "   🔄 MEMPERBARUI KURTECH NOC WEB PANEL..."
echo "========================================================="

systemctl stop panel-acs || true

# Salin file terbaru kecuali file database sandi & session WA
if [ -d "$SCRIPT_DIR/panel-acs" ]; then
  rsync -av --exclude 'wifi-passwords.json' --exclude 'wa-session' --exclude 'config.json' "$SCRIPT_DIR/panel-acs/" "$INSTALL_DIR/" || cp -rf "$SCRIPT_DIR/panel-acs/"* "$INSTALL_DIR/"
else
  rsync -av --exclude 'wifi-passwords.json' --exclude 'wa-session' --exclude 'config.json' "$SCRIPT_DIR/" "$INSTALL_DIR/" || true
fi

cd "$INSTALL_DIR"
npm install --production --unsafe-perm=true || true

systemctl start panel-acs
echo "========================================================="
echo "   ✅ UPDATE BERHASIL! Panel telah aktif kembali."
echo "========================================================="
systemctl status panel-acs --no-pager
