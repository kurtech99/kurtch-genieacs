#!/usr/bin/env bash
# ==============================================================================
#   🗑️ UNINSTALLER GENIEACS & KURTECH PANEL (LINUX)
# ==============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
  echo "[ERROR] Wajib dijalankan sebagai ROOT! (sudo bash $0)"
  exit 1
fi

echo "========================================================="
echo "   ⚠️ UNINSTALL GENIEACS & KURTECH PANEL"
echo "========================================================="
read -p "Apakah Anda yakin ingin menghapus semua service GenieACS & Panel? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Dibatalkan."
  exit 0
fi

echo "[INFO] Menghentikan & menonaktifkan services..."
systemctl stop genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui panel-acs 2>/dev/null || true
systemctl disable genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui panel-acs 2>/dev/null || true

rm -f /etc/systemd/system/genieacs-*.service
rm -f /etc/systemd/system/panel-acs.service
rm -f /usr/local/bin/acs-status /usr/local/bin/acs-restart
systemctl daemon-reload

echo "[INFO] Menghapus folder aplikasi..."
rm -rf /opt/genieacs /opt/panel-acs /var/log/genieacs

echo "========================================================="
echo "   ✅ UNINSTALL BERHASIL! (Database MongoDB tetap tersimpan)"
echo "========================================================="
