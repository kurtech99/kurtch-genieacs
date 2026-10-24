# 🚀 PANDUAN LENGKAP INSTALASI GENIEACS & NOC WEB PANEL (BY KURTECH)
## Versi Linux: STB Armbian (DHCP MikroTik), Proxmox VE (LXC/VM), dan Cloud VPS

Dokumen ini berisi panduan langkah demi langkah cara memasang **GenieACS TR-069 Server** dan **NOC Web Panel (dengan WhatsApp Bot & Telegram by Kurtech)** pada perangkat berbasis Linux:
1. **STB Android Bekas (B860H / HG680P / X96)** dengan OS **Armbian** (Sangat hemat listrik ~5 Watt, 24 jam nonstop).
2. **Proxmox VE** (Sebagai LXC Container Debian 12 / Ubuntu 22.04 yang sangat ringan < 500MB RAM).
3. **Cloud VPS** (Ubuntu 20.04 / 22.04 / 24.04 atau Debian 11/12 dengan IP Publik Statis).

---

## 📋 DAFTAR ISI
1. [Keunggulan Memakai STB / Proxmox / VPS](#1-keunggulan-memakai-stb--proxmox--vps)
2. [Panduan Khusus STB Armbian (DHCP dari MikroTik)](#2-panduan-khusus-stb-armbian-dhcp-dari-mikrotik)
   - [Langkah 1: Siapkan STB Armbian](#langkah-1-siapkan-stb-armbian)
   - [Langkah 2: Hubungkan STB ke Port LAN MikroTik](#langkah-2-hubungkan-stb-ke-port-lan-mikrotik)
   - [Langkah 3: Kunci IP STB di MikroTik (Make Static Lease)](#langkah-3-kunci-ip-stb-di-mikrotik-make-static-lease)
   - [Langkah 4: Setting Routing / NAT di MikroTik](#langkah-4-setting-routing--nat-di-mikrotik)
   - [Langkah 5: Upload File Installer ke STB](#langkah-5-upload-file-installer-ke-stb)
   - [Langkah 6: Jalankan Auto-Installer (1 Perintah)](#langkah-6-jalankan-auto-installer-1-perintah)
3. [Panduan Instalasi di Proxmox VE (LXC Container)](#3-panduan-instalasi-di-proxmox-ve-lxc-container)
4. [Panduan Instalasi di Cloud VPS (IP Publik)](#4-panduan-instalasi-di-cloud-vps-ip-publik)
5. [Setting TR-069 di Modem ONT Pelanggan](#5-setting-tr-069-di-modem-ont-pelanggan)
6. [Perintah Manajemen di Terminal Linux](#6-perintah-manajemen-di-terminal-linux)

---

## 1. Keunggulan Memakai STB / Proxmox / VPS

| Platform | Keunggulan Utama | Penggunaan Listrik & Resource |
| :--- | :--- | :--- |
| **STB (B860H / HG680P)** | Solusi paling murah & efisien untuk RT/RW Net. Tidak perlu komputer menyala terus-menerus. Dicolok ke port LAN MikroTik langsung dapat IP DHCP. | **Hemat Listrik Luar Biasa (Hanya 5 Watt)**, adaptor 12V 1A/2A. |
| **Proxmox VE (LXC)** | Sangat stabil untuk PC Server / Mini PC di kantor NOC. Terintegrasi dengan backup otomatis Proxmox. | **Sangat Ringan**: Cukup 512 MB – 1 GB RAM & 1 Core vCPU. |
| **Cloud VPS** | Memiliki IP Publik Statis. Modem ONT di rumah pelanggan dapat terhubung langsung lewat internet publik tanpa perlu VPN. | Akses dari mana saja 24/7 dengan uptime 99.9%. |

---

## 2. Panduan Khusus STB Armbian (DHCP dari MikroTik)

### Langkah 1: Siapkan STB Armbian
Pastikan STB Anda (contoh: ZTE B860H v1/v2/v5, Fiberhome HG680P, atau Amlogic s905x) sudah terpasang OS **Armbian** (versi Debian 11/12 atau Ubuntu 22.04 Jammy berbasis arsitektur **ARM64 / aarch64**).

### Langkah 2: Hubungkan STB ke Port LAN MikroTik
1. Hubungkan kabel LAN (UTP) dari port Ethernet STB ke salah satu port LAN MikroTik Anda (misal port `ether2`, `ether3`, atau switch LAN lokal).
2. Nyalakan adaptor listrik STB.
3. Secara default, Armbian akan langsung meminta IP Address otomatis (**DHCP Client**) dari MikroTik.

---

### Langkah 3: Kunci IP STB di MikroTik (Make Static Lease)
Agar IP STB tidak berubah-ubah saat STB atau MikroTik mati lampu, kunci IP-nya di MikroTik:
1. Buka **Winbox** MikroTik.
2. Masuk ke menu **IP** ➡️ **DHCP Server** ➡️ Tab **Leases**.
3. Cari perangkat STB Anda (biasanya pada kolom *Host Name* tertulis `armbian` atau periksa MAC Address STB).
4. Klik kanan pada baris tersebut ➡️ Pilih **"Make Static"**.
5. *(Opsional tapi disarankan)*: Dobel-klik baris tersebut, ubah kolom **Address** menjadi IP yang mudah diingat, misalnya:
   * Contoh: `192.168.1.250` atau `192.168.50.250`.
   * Klik **Apply** lalu **OK**.

---

### Langkah 4: Setting Routing / NAT di MikroTik
Jika modem ONT pelanggan Anda berada di segmen IP berbeda (misalnya pelanggan PPPoE mendapatkan IP `10.10.10.x` sedangkan STB berada di `192.168.1.x`), pastikan MikroTik mengizinkan komunikasi antar IP:
1. Di Winbox, buka **IP** ➡️ **Firewall** ➡️ Tab **NAT**.
2. Klik tombol **`+`** (Tambah):
   * **Chain**: `srcnat`
   * **Dst. Address**: Masukkan IP STB Anda (contoh: `192.168.1.250`)
   * **Action**: `masquerade`
3. Klik **Apply** dan **OK**.
> Dengan aturan NAT ini, seluruh modem ONT pelanggan PPPoE maupun Hotspot dapat mengirim sinyal Inform ke STB tanpa terhalang firewall!

---

### Langkah 5: Upload File Installer ke STB
Ada 2 cara mudah menyalin folder installer ke STB:

#### Cara A: Menggunakan WinSCP (Paling Mudah via Komputer / Laptop)
1. Unduh dan buka aplikasi **WinSCP** di komputer Windows Anda.
2. Masukkan rincian koneksi:
   * **File Protocol**: `SFTP` (atau `SCP`)
   * **Host name**: Masukkan IP STB dari MikroTik (misal `192.168.1.250`)
   * **Port**: `22`
   * **User name**: `root`
   * **Password**: Sandi root Armbian Anda (biasanya `1234` atau sesuai yang Anda atur saat pertama kali install).
3. Setelah terhubung, buka folder `/root/` di panel kanan (STB).
4. Salin folder **`LINUX-STB-PROXMOX-VPS`** dari komputer ke `/root/`.

#### Cara B: Menggunakan Flashdisk
1. Salin folder `LINUX-STB-PROXMOX-VPS` ke Flashdisk (format FAT32 atau NTFS).
2. Tancapkan flashdisk ke port USB STB.
3. Di terminal STB, mount flashdisk dan salin foldernya ke `/root/`.

---

### Langkah 6: Jalankan Auto-Installer (1 Perintah)
1. Buka aplikasi **PuTTY** atau terminal Windows CMD / PowerShell.
2. Login ke STB via SSH:
   ```bash
   ssh root@192.168.1.250
   ```
   *(Ganti `192.168.1.250` dengan IP STB Anda)*.
3. Masuk ke folder installer:
   ```bash
   cd /root/LINUX-STB-PROXMOX-VPS
   ```
4. Berikan izin eksekusi pada script:
   ```bash
   chmod +x install.sh
   ```
5. Jalankan script instalasi:
   ```bash
   bash install.sh
   ```

Script otomatis melakukan semuanya dari awal hingga akhir:
* ✅ Memasang Node.js v20 LTS.
* ✅ Memasang MongoDB Database Server & Tools.
* ✅ Memasang GenieACS Core v1.2.9.
* ✅ Mengimport konfigurasi Kurtech (Virtual Parameters, Redaman RX, PON Mode, Suhu, Uptime).
* ✅ Memasang KURTECH NOC Web Panel & WhatsApp Bot.
* ✅ Mendaftarkan seluruh layanan ke **systemd** sehingga **otomatis hidup sendiri saat STB dinyalakan**.
* ✅ Membuka port di firewall jika UFW aktif.

Setelah selesai (sekitar 3–5 menit tergantung kecepatan internet), terminal akan menampilkan pesan sukses berwarna hijau lengkap dengan alamat URL panel!

---

## 3. Panduan Instalasi di Proxmox VE (LXC Container)

Menjalankan GenieACS di Proxmox via LXC Container jauh lebih hemat sumber daya dibandingkan Virtual Machine penuh:

1. Di dashboard Proxmox Web UI, klik **Create CT** (kanan atas):
   * **CT ID**: Bebas (misal `150`)
   * **Hostname**: `acs-panel`
   * **Password**: Tentukan sandi root Anda.
2. **Template**: Pilih template **Debian 12 (Bookworm)** atau **Ubuntu 22.04 (Jammy)**.
3. **Disks**: Berikan ruang disk minimal **8 GB** (disarankan 16 GB).
4. **CPU**: 1 atau 2 Cores.
5. **Memory**: **1024 MB** (1 GB) atau minimal **512 MB**, Swap **512 MB**.
6. **Network**:
   * **Bridge**: `vmbr0`
   * **IPv4**: Pilih **DHCP** (agar dapat IP otomatis dari MikroTik) atau isi IP Statis dalam satu subnet MikroTik.
7. Selesai dan nyalakan Container (**Start**).
8. Buka tab **Console** di Proxmox, lalu login sebagai `root`.
9. Salin atau unduh folder installer, lalu jalankan:
   ```bash
   chmod +x install.sh
   bash install.sh
   ```

### 💡 Khusus Proxmox / Linux yang SUDAH TERPASANG GenieACS Sebelumnya:
Jika di Container Proxmox atau server Linux Anda **sudah berjalan GenieACS** dan Anda **hanya ingin menambahkan Web Panel NOC & Bot WhatsApp saja** (tanpa menghapus modem/data yang sudah ada):

1. Upload folder `LINUX-STB-PROXMOX-VPS` ke server Anda.
2. Masuk ke folder installer:
   ```bash
   cd /root/LINUX-STB-PROXMOX-VPS
   chmod +x install-panel-only.sh
   bash install-panel-only.sh
   ```
3. Script otomatis:
   * Menghubungkan panel ke GenieACS NBI port 7557 lokal yang sudah aktif.
   * Mengimport Virtual Parameters Kurtech (Redaman RX, PON, Suhu, Uptime) ke MongoDB **tanpa menghapus data perangkat modem Anda**.
   * Memasang service `panel-acs.service` auto-start di port 3300.
4. Buka browser: `http://IP_PROXMOX:3300` *(Login: `admin` / `admin`)*.

---

## 4. Panduan Instalasi di Cloud VPS (IP Publik)

Jika Anda menyewa VPS di Cloud Provider (DigitalOcean, IDCloudHost, Contabo, Linode, dll):

1. Pilih OS **Ubuntu 22.04 LTS** atau **Debian 12**.
2. Login ke VPS via SSH:
   ```bash
   ssh root@IP_PUBLIK_VPS
   ```
3. Upload folder `LINUX-STB-PROXMOX-VPS` menggunakan WinSCP.
4. Masuk ke folder dan jalankan installer:
   ```bash
   cd /root/LINUX-STB-PROXMOX-VPS
   chmod +x install.sh
   bash install.sh
   ```
5. Buka port firewall di dashboard VPS (Security Groups / Firewall):
   * Port `3300` (KURTECH Web Panel)
   * Port `3000` (GenieACS UI)
   * Port `7547` (CWMP TR-069 untuk Inform modem pelanggan)

---

## 5. Setting TR-069 di Modem ONT Pelanggan

Setelah instalasi selesai, arahkan modem ONT pelanggan (Huawei, ZTE, Fiberhome) ke server baru Anda:

1. Masuk ke Web GUI Modem Pelanggan (biasanya `192.168.1.1` atau `192.168.100.1` dengan user admin).
2. Masuk ke menu **Network** / **Management** ➡️ **TR-069** (atau **CWMP**):
3. Atur parameter berikut:
   * **Enable CWMP**: Centang `Enable` (Aktif)
   * **ACS URL / Inform URL**:
     * Jika di STB / Proxmox lokal: `http://192.168.1.250:7547/` *(sesuaikan dengan IP STB Anda)*
     * Jika di VPS Cloud: `http://IP_PUBLIK_VPS:7547/`
   * **User Name**: `admin`
   * **Password**: `admin`
   * **Periodic Inform**: Centang `Enable`
   * **Periodic Inform Interval**: Isi `60` detik (atau `300` detik)
4. Klik **Apply / Save**.
5. Dalam waktu 1 menit, modem pelanggan akan otomatis muncul di tabel **NOC Web Panel (`http://IP_STB:3300`)**!

---

## 6. Perintah Manajemen di Terminal Linux

Kami telah menyertakan perintah praktis yang dapat diketik langsung di terminal Linux:

| Perintah | Fungsi |
| :--- | :--- |
| `acs-status` | Memeriksa status hidup/matinya semua service (MongoDB, CWMP, NBI, UI, & Panel Web). |
| `acs-restart` | Me-restart seluruh service GenieACS dan Panel secara otomatis. |
| `systemctl restart panel-acs` | Me-restart khusus Web Panel & Bot WhatsApp. |
| `journalctl -u panel-acs -f` | Memantau log pesan WhatsApp, status modem, dan error secara real-time. |
| `journalctl -u genieacs-cwmp -f` | Memantau lalu lintas TR-069 modem ONT secara live. |

### Informasi Login Default:
* **NOC Web Panel (by Kurtech)**: `http://IP_STB:3300`
  * Username: **`admin`**
  * Password: **`admin`**
* **GenieACS UI Resmi**: `http://IP_STB:3000`
  * Username: **`admin`**
  * Password: **`admin`**
* **URL TR-069 ONT**: `http://IP_STB:7547/`
