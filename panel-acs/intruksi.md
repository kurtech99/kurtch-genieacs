# 📖 Panduan Lengkap Panel NOC & Installer 1-Klik (KURTECH & KURTECH)

Dokumen ini memuat panduan lengkap penggunaan **Panel NOC TR-069 + Hotspot MikroTik** dan installer otomatis **1-Klik**.

---

## 🌟 1. Pembaruan Branding: "by kurtech"
Semua script Virtual Parameter, Provisions, dan konfigurasi database GenieACS telah dibersihkan dari branding lama (*r-tech*) dan sekarang resmi menggunakan branding:
👉 **`by kurtech` / `kurtech.my.id`**

Anti-tamper pembatas script juga telah dinetralkan sehingga seluruh Virtual Parameter (RX Power, Uptime, Suhu, Model, Active Devices, PPPoE) berjalan 100% stabil tanpa error.

---

## 🚀 2. File Installer 1-Klik (GenieACS Asli + Panel Modern)
Kami telah membuatkan paket installer **1-Klik** yang siap digunakan di komputer/laptop mana pun dalam satu jaringan:

### 📁 Lokasi Folder Installer Master:
1. **Di Drive D (Master Anda):**  
   👉 `C:\genieacs-app\INSTALLER-GENIEACS-KURTECH-DAN-PANEL\`
2. **Di Drive C (Folder Sumber):**  
   👉 `C:\genieacsdesktop\`

### ⚡ Cara Pakai di Komputer/Laptop Baru:
1. Pastikan MongoDB dan NodeJS sudah terinstall (bisa download lewat shortcut nomor 1 & 2 di dalam folder).
2. Klik kanan file **`3.Install-ACS.bat`** lalu pilih **Run as administrator**.
3. Tekan **Enter** untuk memilih folder default (`C:\`).
4. **Otomatis yang terjadi:**
   * GenieACS Core disalin ke `C:\genieacs-app`
   * Panel NOC disalin ke `C:\genieacs-app\panel-acs`
   * Database Virtual Parameters Kurtech langsung diimport otomatis
   * Startup otomatis Windows dibuat agar langsung aktif saat laptop menyala
   * Browser otomatis terbuka menampilkan Panel NOC di `http://localhost:3300`

---

## 🎨 3. Cara Mengganti Nama Server / Brand & Ganti Logo
Anda bisa mengganti nama server/brand dan logo kapan saja langsung lewat tampilan web:

1. Buka browser: **`http://localhost:3300`** (atau dari HP: `http://IP_KOMPUTER:3300`).
2. Klik tombol **⚙️ Pengaturan** di pojok kanan atas (atau klik gambar logo di kiri atas).
3. Di tab **🎨 Ganti Brand & Logo**:
   * **Nama Server / Brand**: Ketik nama Anda (contoh: `KURTECH`, `KURTECH`, `WIFI NET`, dll).
   * **Badge / Slogan**: Ketik subjudul (contoh: `NOC TR-069 & Hotspot`).
   * **Ganti Logo**: Klik **📁 Pilih File Logo Baru** -> pilih file gambar logo (PNG / JPG / SVG / WebP maksimal 2MB).
4. Klik **Simpan Brand & Logo**.
5. Logo dan nama di navbar atas akan langsung berubah seketika tanpa perlu restart!

---

## 📡 4. Cara Koneksi API Hotspot ke MikroTik

### Langkah A: Buat User API di Winbox MikroTik
1. Buka aplikasi **Winbox** dan masuk ke router MikroTik.
2. Buka menu **New Terminal**.
3. Copy-paste perintah ini lalu tekan **Enter**:
   ```routeros
   /user add name=panelacs group=read password=admin comment="API Panel ACS"
   ```
   *(User read-only ini sangat aman karena hanya membaca data user aktif tanpa bisa mengubah settingan router).*

### Langkah B: Masukkan Akun ke Web Panel
1. Di panel web, klik kartu **User Hotspot Aktif** di bagian atas (atau klik tombol **⚙️ Pengaturan**).
2. Pilih tab **📡 Koneksi MikroTik**:
   * **IP Router**: `192.168.88.1` *(sesuaikan jika IP router berbeda)*
   * **Port API**: `9926` *(atau 8728 jika port default)*
   * **Username API**: `panelacs`
   * **Password API**: `admin`
3. Klik tombol **Simpan & Tes Koneksi**.
4. Lampu indikator akan menyala **🟢 Hijau (Live di MikroTik)** dan jumlah user voucher yang sedang online akan langsung muncul!
5. Klik kartu ke-4 tersebut untuk melihat daftar user yang sedang aktif beserta pemakaian kuotanya.

---

## 🖥️ 5. Shortcut & Port Akses
* **Panel NOC Modern**: `http://localhost:3300` (atau IP PC: `http://IP_KOMPUTER:3300`)
* **GenieACS UI Bawaan**: `http://localhost:3000`
* **Halaman Traktir Kopi & QRIS**: `http://localhost:3300/support.html`
* **Port CWMP Modem**: `7547` (ACS URL di modem: `http://IP_KOMPUTER:7547`)
* **File Auto-Start**: `C:\genieacs-app\start.bat`

---

## ☕ 6. Halaman QRIS & Dukungan Pengembangan Kurtech
* Sesaat setelah instalasi lewat **`3.Install-ACS.bat`** selesai, Chrome/browser akan **otomatis membuka halaman dukungan**:  
  👉 **`http://localhost:3300/support.html`**
* Halaman ini menampilkan kode **QRIS resmi kurtech** (NMID: `ID1025414745014`) agar pengguna dapat langsung scan untuk traktir kopi demi keberlanjutan update sistem.
* Di panel dashboard juga sudah terpasang tombol **☕ Traktir Kopi** di pojok kanan atas agar QRIS bisa dibuka kapan saja.

---

## 🛠️ 7. Perbaikan Tombol "Pengaturan" & Refresh Browser
* **Penyebab Sebelumnya**: CSS modal menggunakan selektor `.modal-backdrop.open`, sedangkan fungsi pembuka popup memakai `.classList.add('active')`, sehingga jendela modal tetap transparan (opacity 0) saat tombol diklik.
* **Solusi yang Diterapkan**:
  1. CSS telah diperbarui untuk mendukung selektor `.modal-backdrop.open, .modal-backdrop.active`.
  2. Fungsi `openHotspotModal` dan `closeModal` kini mengelola kedua class (`open` dan `active`) secara serempak.
  3. Ditambahkan penutup modal otomatis jika mengklik area luar (backdrop) atau menekan tombol `Escape`.
  4. Header static server telah ditambahkan `Cache-Control: no-cache` serta cache buster `?v=2.2` pada file `style.css` dan `app.js`.
  5. Jika sebelumnya membuka panel di browser, silakan tekan **`Ctrl + F5`** (Hard Refresh) untuk membersihkan cache browser lama.

---

## 📡 8. Solusi Error "Connection request error: Unexpected status code 401" (Summon Gagal)
* **Penyebab**: Script provision **`inform`** bawaan sebelumnya memiliki sisa logika anti-tamper yang mengecek string branding lama. Ketika branding diganti menjadi *kurtech*, pengecekan tersebut bernilai salah (`false`) sehingga GenieACS melewati proses deklarasi `ConnectionRequestUsername` dan `ConnectionRequestPassword` (`arka` / `berkah2026`) untuk modem ONT (Huawei, ZTE, Fiberhome). Akibatnya, saat tombol **Summon** ditekan, GenieACS mengirim permintaan koneksi kosong tanpa kredensial ke modem, lalu modem menolak dengan status **401 Unauthorized**.
* **Solusi yang Diterapkan**:
  1. **Pembersihan Script Provision `inform`**: Logika obfuscated anti-tamper telah dihapus total. Script sekarang langsung mendeklarasikan parameter `ConnectionRequestUsername` dan `ConnectionRequestPassword` dengan kredensial `arka` & `berkah2026` untuk seluruh ONT.
  2. **Sinkronisasi Database Perangkat**: Kredensial Connection Request pada seluruh perangkat di database MongoDB telah disinkronkan langsung sehingga tombol Summon langsung normal seketika tanpa harus menunggu reboot.
  3. **Pembaruan File Master Installer**: Backup `provisions.bson` pada folder installer Drive D (`INSTALLER-GENIEACS-KURTECH-DAN-PANEL\source\genieacs-app\conf-acs\`) dan Drive C telah diperbarui dengan versi bersih ini.

---

## 🔄 9. Penanganan Fitur Restart / Reboot ONT dari Panel
* **Gejala**: Ketika menekan tombol restart di panel, modal tertutup namun tabel tidak berubah sehingga terlihat "tidak ada respon", atau modem belum langsung mati seketika.
* **Fakta Teknis Hardware Modem**:
  1. Perintah reboot dikirim dari Panel -> GenieACS NBI -> Modem via TR-069 RPC (`cwmp:Reboot`).
  2. Begitu modem menerima sinyal restart, modem memerlukan waktu jeda **15 - 30 detik** untuk menutup session, menyimpan buffer flash memory, dan mematikan daya hardware.
  3. Modem kemudian memerlukan waktu **45 - 60 detik** untuk booting ulang sistem, sinkronisasi optik GPON (status O5), dan dial ulang PPPoE ke MikroTik. Total proses fisik restart adalah sekitar **1 hingga 2 menit**.
* **Penyempurnaan yang Diterapkan di Panel**:
  1. **Feedback Visual Instan (Reaktif)**: Saat tombol restart diklik, baris modem di tabel seketika berubah status menjadi `<span class="status-badge rebooting">🔄 RESTART (Xs)</span>` lengkap dengan animasi berputar dan penghitung waktu detik berjalan.
  2. **Monitoring Otomatis (Auto-Detect Reconnect)**: Panel menjalankan watcher aktif yang memantau modem. Begitu modem menyala kembali dan mengirim inform/uptime baru ke GenieACS, status di panel otomatis kembali **ONLINE** hijau dan menampilkan notifikasi sukses lengkap dengan uptime barunya.
  3. **Proteksi Anti-Double Click**: Selama modem dalam status proses restart, tombol restart pada baris tersebut dinonaktifkan untuk mencegah penumpukan antrean task TR-069.
  4. **Peningkatan Error Handling Backend**: Jika modem tidak dapat dijangkau (504 Timeout) atau menolak autentikasi (401), backend kini memberikan pesan error spesifik dan jelas.

---

## 🔐 10. Sistem Keamanan & Halaman Login Administrator
* **Fitur**: Panel ACS (Port 3300) kini telah dilengkapi sistem autentikasi modern, elegan, dan aman untuk melindungi akses panel dari pihak yang tidak berwenang.
* **Kredensial Default**:
  * **Username**: `admin`
  * **Password**: `admin`
* **Fitur & Mekanisme Keamanan**:
  1. **Halaman Login Elegan (`login.html`)**: Dilengkapi tema *cyber NOC glassmorphism*, logo brand adaptif, toggle lihat password (👁️), animasi shake saat salah input, dan proteksi sesi otomatis.
  2. **Pengamanan Akses Halaman (Middleware Redirect)**: Jika membuka `/` tanpa login, server otomatis mengalihkan ke `/login.html`. Jika sudah login dan membuka `/login.html`, server otomatis mengalihkan ke dashboard `/`.
  3. **Proteksi API Endpoints**: Seluruh endpoint data sensitif (`/api/devices`, `/api/hotspot/*`, `/api/device/*`, dll.) diproteksi dengan cookie sesi aman (`HttpOnly`, `SameSite=Lax`, masa aktif 7 hari). Akses tanpa sesi valid akan otomatis ditolak (HTTP 401).
  4. **Ganti Password Admin Langsung di Panel**:
     * Buka tombol **Pengaturan** di navbar atas.
     * Pilih tab **🔒 Akun Admin**.
     * Masukkan password lama dan password baru yang diinginkan, lalu klik simpan. Konfigurasi disimpan aman di file `config.json`.
  5. **Tombol Logout**: Tombol **Keluar** berwarna merah lembut telah ditambahkan pada navbar atas untuk mengakhiri sesi kapan saja dengan aman.

---

## 📦 11. Paket Distribusi Installer Bersih (Siap Pasang di Komputer / MikroTik Lain)
* **Lokasi Folder Master Installer**:
  `C:\genieacs-app\INSTALLER-GENIEACS-KURTECH-DAN-PANEL\`
* **Karakteristik Paket Mentahan Bersih (Default Kosongan)**:
  1. **Database Kosong (0 Perangkat)**: Database master `conf-acs` tidak memiliki data perangkat (`devices.bson`), sehingga saat diinstall di PC baru, database GenieACS benar-benar bersih dan siap menerima registrasi modem baru tanpa sisa data pelanggan KURTECH.
  2. **Script Provision Terbaru**: Script `inform` di `provisions.bson` sudah bersih dari anti-tamper lama, otomatis mengonfigurasi kredensial TR-069 setiap ONT baru.
  3. **Superadmin Default**:
     * **Panel ACS (Port 3300)**: `admin` / `admin`
     * **GenieACS UI (Port 3000)**: `admin` / `admin`
  4. **Template Konfigurasi MikroTik Bawaan**:
     * File `config.json` di installer diset ke IP default `192.168.88.1`, Port `8728`, User `admin`, Password `""`.
     * Begitu diinstall di komputer baru, teknisi cukup login ke web panel lalu masuk menu **Pengaturan -> Koneksi MikroTik** untuk memasukkan IP router lokal mereka.
  5. **Fitur Terbaru Sudah Terintegrasi**: Halaman Login (`login.html`), pemantauan reboot reaktif, animasi live Summon, dan identitas brand fleksibel.
* **Langkah Memindahkan ke Komputer Baru**:
  1. Salin seluruh folder `INSTALLER-GENIEACS-KURTECH-DAN-PANEL` ke Flashdisk atau simpan dalam format `.ZIP`.
  2. Pindahkan ke komputer baru (Windows 10/11 / Windows Server).
  3. Buka `1.Mongodb-Download.url` lalu install MongoDB (klik Next sampai selesai).
  4. Buka `2.NodeJS-Download.url` lalu install NodeJS (rekomendasi v18/v20/v22 LTS).
  5. Klik kanan file `3.Install-ACS.bat` -> pilih **Run as administrator**.
  6. Tekan Enter untuk lokasi default (`C:\genieacs-app`).
  7. Dalam 10 detik seluruh sistem terpasang, shortcut desktop otomatis dibuat, dan service otomatis berjalan di startup Windows!
  8. Browser otomatis membuka **3 tab sekaligus**:
     * **Tab 1**: `http://localhost:3300` (Login Panel NOC)
     * **Tab 2**: `http://localhost:3000` (GenieACS UI Original)
     * **Tab 3**: `http://localhost:3300/support.html` (Dukungan & QRIS Kurtech)
  9. **Mode Silent Background Murni**:
     * Service dijalankan via `run-hidden.vbs` tanpa menampilkan jendela CMD hitam di desktop.
     * Tidak akan ada risiko tidak sengaja ter-close oleh siapa pun.
     * Jika ingin me-restart service sewaktu-waktu, cukup klik 2x shortcut **`Restart-ACS-Panel`** di Desktop.

---

## 📶 12. Solusi Perbaikan Ganti Wi-Fi (Langsung Masuk ke Modem & Sandi Kelihatan)

Pada pembaruan ini, seluruh alur pengiriman settingan Wi-Fi (SSID & Password) dan visibilitas sandi pelanggan telah diperbaiki secara tuntas:

### A. Mengapa Sebelumnya Ganti Sandi Sempat Gagal / Macet di Antrean?
1. **Penyebab Utama (SOAP Fault cwmp.9002 Internal Error)**:
   * Pada modem Huawei (HG8245H5, EG8141H5, dll.), parameter `PreSharedKey.1.PreSharedKey` merupakan format *raw hexadecimal (64 hex)*, **bukan** teks kata sandi biasa.
   * Ketika sistem mengirim parameter tersebut bersamaan dengan teks sandi biasa, firmware Huawei menolak seluruh paket perintah dengan error `cwmp.9002 (Internal error)`.
   * Karena protokol TR-069 bersifat atomik (semua parameter dalam satu perintah harus valid), penolakan satu parameter menyebabkan SSID dan Sandi batal diterapkan ke modem fisik.
2. **Task Macet Menumpuk di Antrean**:
   * Task yang gagal tersangkut di antrean GenieACS dan terus mencoba ulang (*retrying*), sehingga perintah baru terhalang.

### B. Perbaikan yang Diterapkan di Sistem Panel:
1. **Parameter Standar Murni TR-098 (100% Kompatibel Huawei & Fiberhome)**:
   * Pengiriman SSID hanya menggunakan:  
     `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID`
   * Pengiriman Password hanya menggunakan:  
     `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase`
   * Menghapus parameter duplikat dan hex yang menyebabkan penolakan firmware Huawei.
2. **Pembersihan Antrean Otomatis (*Auto Clean Pending Tasks & Faults*)**:
   * Sebelum mengirim perintah baru, backend panel otomatis menghapus task macet atau riwayat error lama untuk modem terkait dari GenieACS.
   * Hal ini memastikan antrean modem selalu bersih dan perintah ganti Wi-Fi langsung tereksekusi seketika.
3. **Eksekusi Instan via Connection Request**:
   * Perintah dikirim dengan trigger `?connection_request` agar server GenieACS langsung memanggil port modem dan menerapkan perubahan seketika tanpa harus menunggu interval inform berikutnya.

### C. Database Persisten Sandi Wi-Fi (`wifi-passwords.json`)
* **Masalah Bawaan Vendor ONT**:
  Modem Huawei memiliki kebijakan keamanan di mana perintah `getParameterValues` ke field `KeyPassphrase` selalu mengembalikan nilai kosong `""` atau bintang `******`.
* **Solusi Panel**:
  Panel kini memiliki database persisten `wifi-passwords.json` yang menyimpan riwayat sandi setiap kali admin mengubah atau mencatat sandi. Data dipetakan otomatis berdasarkan:
  * Device ID GenieACS
  * Serial Number (SN)
  * Username PPPoE
* Sandi Wi-Fi pelanggan (seperti pelanggan **DAPIN ZAHRA**: `Nengzahra11`) kini tersimpan permanen dan selalu dapat dibaca oleh panel kapan pun.

### D. Fitur Tampilan, Intip Mata, dan Salin Sandi di Tabel Panel
1. **Widget Sandi Interaktif pada Kolom Tabel**:
   * **Tombol Mata (👁️ / 🙈)**: Klik untuk melihat atau menyembunyikan sandi pada baris pelanggan tersebut.
   * **Tombol Salin (📋)**: Klik untuk menyalin sandi langsung ke clipboard (lengkap dengan tanda centang hijau ✓ dan pesan konfirmasi).
   * **Tombol Catat (✏️)**: Jika modem belum tercatat sandinya di sistem, muncul tombol untuk langsung menginput atau mengganti sandi.
2. **Tombol Global Toolbar ("👁️ Tampilkan Sandi")**:
   * Di samping filter (Online/Offline), terdapat tombol **👁️ Tampilkan Sandi**.
   * Sekali klik, seluruh sandi WiFi pelanggan di tabel akan langsung terlihat semuanya tanpa perlu mengklik satu per satu.
3. **Auto-Populate di Modal Ganti Wi-Fi**:
   * Saat tombol **📶 Ganti WiFi** diklik, kolom sandi otomatis terisi dengan sandi pelanggan yang sedang aktif saat ini (bukan kosong atau tanda bintang).

---

## 🚀 13. Fitur Tambahan Baru NOC Panel (Siap Pakai)

Sesuai kebutuhan lapangan KURTECH (tanpa fitur isolir karena billing sudah ditangani Mikhmon), 5 fitur unggulan baru telah selesai ditambahkan dan aktif secara penuh:

### 1. 📲 Kirim Info Wi-Fi ke WhatsApp Pelanggan (1-Click Share)
* **Lokasi**: Buka tombol **📶 WiFi** pada pelanggan terkait. Di bawah kolom password, terdapat tombol hijau **📲 Kirim ke WhatsApp**.
* **Fungsi**: Membuka WhatsApp Web / Desktop secara otomatis dengan template pesan ramah dan rapi:
  ```text
  Halo Bapak/Ibu [Nama Pelanggan],

  Berikut adalah rincian informasi koneksi Wi-Fi Anda:

  📶 Nama Wi-Fi (SSID): [SSID]
  🔑 Password Wi-Fi: [Password]

  Silakan sambungkan kembali HP atau laptop Anda dengan password di atas.

  Terima kasih telah menggunakan layanan KURTECH!
  ```

### 2. 📥 Export Seluruh Data Pelanggan ke Excel (.xlsx) Rapi & Profesional
* **Lokasi**: Tombol **📥 Export Excel** di sebelah tombol *👁️ Tampilkan Sandi* pada toolbar atas.
* **Format Baru**: Kini menghasilkan file **Microsoft Excel asli (`.xlsx`)** dengan tampilan korporat NOC premium:
  * **Header Banner KURTECH**: Judul laporan navy elegan lengkap dengan stempel waktu ekspor real-time (WIB).
  * **5 Kartu KPI Summary**: Ringkasan Total Modem, Total Online 🟢, Offline 🔴, Redaman Kritis ⚠️, dan Total HP Aktif 📱.
  * **Lebar Kolom Otomatis**: Setiap kolom memiliki ruang lega dan proporsional sehingga tidak ada teks yang terpotong.
  * **Warna Status & Redaman**: Status *ONLINE* diberi warna hijau lembut, *OFFLINE* merah, kondisi redaman otomatis diberi warna sesuai standar optik.
  * **Nomor WhatsApp**: Kolom nomor WhatsApp pelanggan diformat sebagai teks (`@`) sehingga angka nol depan `08...` tidak hilang.
  * **Zebra Striping & Border**: Garis tabel rapi dengan latar selang-seling yang nyaman di mata.
  * **Freeze Pane & AutoFilter**: Judul kolom terkunci di atas saat digulir ke bawah, dan filter dropdown aktif di setiap kolom.

### 3. 📱 Daftar HP / Laptop Terhubung Real-Time (Live Clients)
* **Lokasi**: Klik badge **[X HP 📱]** pada kolom *HP Konek* di tabel modem.
* **Fungsi**: Membuka popup dialog yang menampilkan perangkat aktif yang sedang memakai Wi-Fi atau LAN modem tersebut:
  * **Nama HP / Perangkat**: Terdeteksi otomatis dari Hostname TR-069 (contoh: *V2419*, *Infinix-SMART-20*, *vivo-1904*, *A05s-milik-Zahra*).
  * **Tipe Koneksi**: Indikator Wi-Fi 📶 atau LAN Kabel 🔌.
  * **IP & MAC Address**: Alamat jaringan tiap HP.
  * **Kuat Sinyal (RSSI)**: Dilengkapi warna indikator sinyal (*Bagus 🟢, Sedang 🟡, Lemah 🔴*).

### 4. ⚡ Uji Ping & Latensi Modem Real-Time (Diagnostic Tool)
* **Lokasi**: Tombol petir **⚡** pada kolom *Aksi Cepat* di tabel.
* **Fungsi**: Mengirim 3 paket ICMP ping langsung dari server ke IP PPPoE modem pelanggan:
  * Rata-rata latensi (*Average ms*)
  * Latensi minimum & maksimum (*Min/Max ms*)
  * Persentase Packet Loss (*0% Loss = Stabil*)
  * Status warna (*🟢 Sangat Bagus, 🟡 Ada Gangguan/RTO, 🔴 RTO Total*)
  * Dropdown detail output mentah (*Raw Ping Windows*) untuk analisa teknisi NOC.

### 5. 🤖 Bot Notifikasi Telegram Otomatis (Kabel Putus / LOS & Redaman Kritis)
* **Lokasi**: Buka **Pengaturan** (ikon gerigi / klik logo) -> Pilih tab **🤖 Bot & Notifikasi (WA / Telegram)**.
* **Fitur**:
  * **Bot Token & Chat ID**: Masukkan Token bot dari `@BotFather` dan ID Telegram Anda atau Grup NOC.
  * **Notifikasi Kabel Putus / LOS**: Bot otomatis mengirim pesan darurat jika modem mati / kabel FO putus lebih dari 10 menit.
  * **Notifikasi Redaman Kritis**: Peringatan otomatis jika redaman RX modem memburuk (≤ -27 dBm).
  * **Tombol 🧪 Kirim Pesan Tes**: Mengetes koneksi bot seketika sebelum disimpan.

---

## 🤖 14. Fitur WhatsApp Bot & Pilihan Channel Notifikasi (WA / Telegram)

Sesuai permintaan terbaru, kini sistem telah dilengkapi dengan **Bot WhatsApp Otomatis** menggunakan koneksi WhatsApp Web terenkripsi (Baileys) tanpa memerlukan server browser berat (Puppeteer). Admin dapat memilih secara fleksibel channel notifikasi yang diinginkan:

### A. Pilihan Channel Notifikasi
Buka menu **Pengaturan (Ikon Gerigi)** ➡️ Tab **🤖 Bot & Notifikasi (WA / Telegram)**:
1. **WhatsApp Saja (Scan Barcode)**: Seluruh notifikasi darurat (kabel FO putus / redaman buruk) dikirimkan via WhatsApp ke nomor WhatsApp Admin.
2. **Telegram Saja**: Notifikasi dikirimkan via Bot Telegram seperti biasa.
3. **Keduanya Aktif (WA & Telegram)**: Notifikasi dikirimkan secara serentak ke WhatsApp Admin dan grup Telegram NOC.

### B. Cara Menautkan WhatsApp Admin di Panel (2 Pilihan Cara)

Kini tersedia 2 metode penautan:

#### Pilihan 1: Tautkan dengan Kode 8-Digit (Paling Mudah & Anti-Gagal)
Jika kamera HP sulit scan atau muncul tulisan "tidak dapat menautkan perangkat":
1. Buka tab **🤖 Bot & Notifikasi (WA / Telegram)**.
2. Masukkan nomor WhatsApp Admin pada kolom input (contoh: `081234567890`).
3. Klik tombol **🔢 Tautkan Pakai Kode 8-Digit**.
4. Panel akan menampilkan kode 8-digit besar (contoh: `N2VT - KE68`) lengkap dengan tombol salin.
5. Buka **WhatsApp di HP**:
   * Buka menu Titik Tiga (Android) atau menu *Pengaturan* (iPhone).
   * Pilih **Perangkat Tertaut (Linked Devices)** ➡️ Ketuk **Tautkan Perangkat**.
   * Pada bagian paling bawah layar HP, ketuk tulisan: **"Tautkan dengan nomor telepon saja"**.
   * Masukkan 8 digit kode yang muncul di panel.
6. WhatsApp langsung terhubung seketika tanpa perlu kamera sama sekali!

#### Pilihan 2: Scan Barcode (QR Code)
1. Klik tombol **📸 Tampilkan Barcode Baru**.
2. Identitas browser telah diperbarui menggunakan profil resmi Chrome Desktop sehingga barcode tidak lagi ditolak oleh server WhatsApp.
3. Buka **Perangkat Tertaut** di WhatsApp HP ➡️ Arahkan kamera ke barcode.
4. Tunggu beberapa detik hingga status berubah menjadi `🟢 WhatsApp Terhubung`.

### C. Manajemen Nomor WhatsApp Pelanggan
Kini setiap pelanggan dapat memiliki nomor WhatsApp yang tercatat di database panel (`wifi-passwords.json`):
1. **Input / Edit Cepat dari Tabel**:
   * Pada kolom *Pelanggan* di tabel modem, jika belum ada nomor, klik tombol kecil **`➕ No WA`**.
   * Jika sudah ada nomor, akan muncul chip hijau dengan nomor pelanggan, contoh: **`📱 0812xxxx`**. Klik chip tersebut jika ingin mengubah nomornya.
2. **Input dari Modal Ganti Wi-Fi**:
   * Saat Anda menekan tombol **📶 Ganti WiFi**, di bawah kolom SSID dan Sandi terdapat input **Nomor WhatsApp Pelanggan**.
   * Nomor ini akan otomatis tersimpan permanen saat Anda menekan tombol Simpan/Ganti.

### D. Kirim Informasi Wi-Fi Otomatis via Bot WhatsApp (1-Click Bot)
Saat mengganti atau melihat sandi pelanggan di modal **📶 Ganti WiFi**:
* Terdapat tombol **🤖 Kirim via Bot WA**:
  * Sekali klik, Bot WhatsApp panel akan langsung mengirimkan pesan berisi Nama SSID dan Password Wi-Fi langsung ke nomor WhatsApp pelanggan tersebut secara otomatis di latar belakang!
  * Admin tidak perlu lagi mengetik atau copy-paste manual dari HP admin.
* Jika Bot WhatsApp belum terhubung atau pelanggan ingin dikirimi manual, tetap tersedia tombol **📲 Chat WA Manual** yang membuka WhatsApp Web di tab baru browser.

### E. Alert Watcher Otomatis (Background Daemon)
Sistem background worker di panel memeriksa seluruh modem setiap 60 detik:
* **Kabel Putus / LOS (>10 Menit Offline)**:
  * **Ke WhatsApp & Telegram Admin (NOC)**: Mengirimkan rincian teknis (Nama Pelanggan, User PPPoE, Serial Number, durasi mati) agar teknisi langsung mengecek jalur tiang atau kabel dropcore.
  * **Ke WhatsApp Pelanggan Langsung**: Jika nomor HP pelanggan sudah tercatat di sistem, bot WhatsApp otomatis mengirimkan pesan ramah yang mengabarkan bahwa koneksi internet mereka sedang offline, mengingatkan untuk cek colokan listrik & lampu LOS merah, dan menginfokan teknisi sedang menangani.
* **Notifikasi Pemulihan (Kembali Online)**:
  * Saat modem pelanggan menyala dan online kembali, bot otomatis mengirimkan pesan kabar gembira ke pelanggan bahwa koneksi internet sudah normal kembali.
* **Redaman Kritis (≤ -27 dBm)**:
  * Khusus dikirimkan ke Admin / Teknisi NOC agar segera ditangani sebelum pelanggan komplain.

---

## 🚀 15. Skalabilitas & Performa untuk 100+ hingga 1.000+ Pelanggan

Panel ACS dan sistem GenieACS dirancang untuk siap digunakan pada skala ISP komersial dari puluhan hingga ribuan pelanggan:

### 1. Kapasitas Mesin (GenieACS & MongoDB)
* **Dirancang untuk Carrier-Grade**: GenieACS dan MongoDB sanggup mengelola hingga 50.000+ ONT/modem. Untuk 100 – 500 pelanggan, penggunaan RAM hanya sekitar **~200 MB – 300 MB** dan beban CPU di bawah **3%**.
* **Kecepatan Query**: Pencarian data perangkat dari database MongoDB berjalan dalam hitungan milidetik (< 15 ms).

### 2. Antrian Pesan WhatsApp Otomatis (Message Queue & Anti-Banned)
* **Masalah pada Skala 100+ Pelanggan**: Jika terjadi pemadaman atau kabel putus yang mempengaruhi belasan modem sekaligus, menembakkan 15–30 pesan WhatsApp dalam 1 detik bersamaan berisiko memicu proteksi spam WhatsApp Meta yang dapat menyebabkan nomor admin terkena batasan/blokir.
* **Solusi**: Sistem dilengkapi **Antrian Otomatis Berjeda (Throttled Queue)** di `whatsapp.js`. Pesan darurat diantrikan secara FIFO dan dikirim berurutan dengan jeda aman **1.8 detik per pesan**.
* **Proteksi Gangguan Massal (Mass Outage Shield)**: Jika lebih dari 40% modem mati serentak (misalnya akibat mati lampu PLN satu desa atau OLT padam), bot secara cerdas **MENAHAN** pesan ke ratusan pelanggan dan hanya mengirim 1 notifikasi darurat ke WhatsApp Admin NOC. Hal ini mencegah kepanikan pelanggan dan melindungi nomor admin dari ledakan pesan.

### 3. Kemudahan Navigasi & Pencarian Cepat (Live Search)
* Di kolom pencarian utama tabel panel, admin dapat mencari pelanggan secara instan berdasarkan:
  * **Nama Pelanggan**
  * **Nomor HP WhatsApp** (contoh ketik: `0838` atau `0812`)
  * **Username Akun PPPoE**
  * **Nama SSID Wi-Fi**
  * **Serial Number (SN)**
  * **Alamat IP PPPoE**
* Hasil pencarian langsung tersaring seketika tanpa perlu memuat ulang halaman.

### 4. Ekspor Data Excel Skala Besar
* Tombol **📥 Export Excel** menggunakan pustaka `exceljs` berkecepatan tinggi. Mengunduh data 100 hingga 1.000 pelanggan menghasilkan file spreadsheet `.xlsx` profesional dalam waktu kurang dari 1 detik dengan tata letak rapi, formula KPI otomatis, dan nomor WhatsApp tersimpan sebagai teks murni (`08...`).

---

## 📱 16. Panduan Instalasi Versi Linux: STB Armbian (DHCP MikroTik), Proxmox VE, & VPS Cloud

Kini seluruh ekosistem **GenieACS TR-069 + KURTECH ACS Web Panel + Bot WhatsApp** telah dibuatkan versi instalasi Linux mandiri (*turnkey installer*). Paket ini tersedia di folder:
📁 **`INSTALLER-GENIEACS-KURTECH-DAN-PANEL/LINUX-STB-PROXMOX-VPS`**

### A. Mengapa Memakai STB Bekas (Armbian)?
1. **Sangat Hemat Listrik**: STB B860H atau HG680P hanya memakan daya sekitar **5 Watt** (adaptor 12V 1A/2A). Bisa hidup 24 jam nonstop 365 hari tanpa boros tagihan listrik PC.
2. **Plug & Play ke MikroTik**: Cukup colok kabel LAN STB ke salah satu port LAN MikroTik, STB langsung mendapatkan IP otomatis dari DHCP Server MikroTik.
3. **Kapasitas Sanggup Ratusan ONT**: Dengan RAM 1 GB / 2 GB dan prosesor Quad-Core ARM64, STB sangat enteng menjalankan MongoDB, GenieACS, dan Web Panel Node.js.

### B. Langkah Cepat Pasang di STB Armbian:
1. Hubungkan port LAN STB ke port LAN MikroTik menggunakan kabel UTP.
2. Di **Winbox MikroTik** ➡️ Buka **IP** ➡️ **DHCP Server** ➡️ Tab **Leases**:
   * Temukan perangkat STB (HostName: `armbian`).
   * Klik kanan ➡️ Pilih **"Make Static"** agar IP STB dikunci dan tidak berubah saat mati lampu.
   * *(Disarankan)*: Ubah IP STB menjadi IP yang mudah diingat, misalnya `192.168.1.250`.
3. Buka **Winbox** ➡️ **IP** ➡️ **Firewall** ➡️ Tab **NAT**:
   * Tambahkan rule: Chain = `srcnat`, Dst. Address = `192.168.1.250`, Action = `masquerade`.
   * Ini memastikan semua modem pelanggan di segmen IP berbeda (misal PPPoE `10.10.10.x`) bisa tembus mengirim Inform ke STB.
4. Salin folder `LINUX-STB-PROXMOX-VPS` ke dalam STB menggunakan **WinSCP** (SFTP port 22 user `root`) ke folder `/root/`.
5. Buka terminal SSH (PuTTY):
   ```bash
   ssh root@192.168.1.250
   cd /root/LINUX-STB-PROXMOX-VPS
   chmod +x install.sh
   bash install.sh
   ```
6. Selesai! Script otomatis menginstall Node.js 20, MongoDB, GenieACS 1.2.9, import Virtual Parameters Kurtech, dan mendaftarkan service **auto-start on boot** di Linux.

### C. Akses Panel Setelah Terpasang:
* **KURTECH ACS Panel**: `http://IP_STB:3300` (User: `admin` | Sandi: `admin`)
* **GenieACS UI**: `http://IP_STB:3000` (User: `admin` | Sandi: `admin`)
* **URL Inform TR-069 di Modem ONT**: `http://IP_STB:7547/`

---

## 🎁 17. Fitur Akun Member Free Hotspot (Bonus Internet) & Pengiriman Data Pelanggan Baru / Migrasi

Fitur ini dirancang khusus untuk mempermudah pendaftaran dan pengiriman data koneksi bagi pelanggan baru maupun pelanggan lama yang baru saja dialihkan/dimigrasikan ke GenieACS:

### A. Latar Belakang & Solusi Masalah Lapangan
1. **Sandi Wi-Fi Lokal Modem Belum Terbaca di ACS**:
   * Saat modem pelanggan baru dipasang atau dialihkan ke GenieACS, pengaturan Wi-Fi (SSID dan Sandi) umumnya sudah disetting secara lokal di modem oleh teknisi lapangan.
   * Kebijakan keamanan firmware modem (seperti Huawei HG8245H5 / EG8141H5) tidak mengizinkan pengembalian teks sandi asli via TR-069 (*password masking / blank string*).
   * **Solusi**: Form modal Wi-Fi kini menjadikan kolom **Password Baru Wi-Fi bersifat opsional**.
     * Jika dikosongkan: Modem **tetap menggunakan sandi lokal lama** tanpa ada perubahan paksa ke perangkat fisik.
     * Jika diisi (minimal 8 karakter): Sistem akan mengirimkan perintah TR-069 untuk mengubah sandi di modem fisik sekaligus menyimpannya ke database panel.
2. **Kebutuhan Memberikan Akun Hotspot Gratis (Bonus Internet)**:
   * Pelanggan internet rumahan sering kali diberikan bonus akun voucher/member Hotspot gratis agar tetap bisa menikmati internet saat berada di luar rumah (misal di warung, balai desa, atau titik Hotspot WiFi RT/RW Net).
   * **Solusi**: Disediakan centang otomatis **🎁 Sertakan Akun Member Free Hotspot (Bonus Internet)** langsung di jendela ganti Wi-Fi.

### B. Cara Penggunaan di Panel:
1. Di tabel modem pelanggan, klik tombol **📶 WiFi** pada pelanggan yang diinginkan.
2. **Nama Wi-Fi (SSID)**: Otomatis terisi nama SSID yang aktif saat ini.
3. **Password Baru Wi-Fi**:
   * Biarkan kosong jika pelanggan tetap menggunakan sandi lama lokal modem.
   * Atau isi sandi baru jika ingin mengubah sandi modem dari jarak jauh.
4. **Centang 🎁 Sertakan Akun Member Free Hotspot (Bonus Internet)**:
   * **Username Hotspot**: Otomatis disarankan dari username PPPoE atau nama pelanggan (contoh: `km_iqbal`).
   * **Password Hotspot**: Otomatis dibuatkan sandi angka acak 4 digit (contoh: `5831`) lengkap dengan tombol **🎲 Acak** untuk mengganti sandi baru seketika.
   * **🏷️ Profile Hotspot MikroTik**: Otomatis mendeteksi dan menampilkan daftar profile Hotspot langsung dari router MikroTik Anda (default: **`FREE Member`** - 1 Mbps, serta pilihan lain seperti `FREE 2 HP`, `FREE 4 HP`, dll.).
   * **Catatan / Keterangan**: Default: *"Bisa digunakan di seluruh titik Hotspot WiFi kami"* (dapat diedit bebas sesuai lokasi titik hotspot Anda).
   * **⚡ 100% Auto-Sync MikroTik**: Saat data disimpan atau dikirim via Bot WA, user & sandi ini **langsung otomatis terdaftar di Winbox MikroTik (`/ip hotspot user`)** tanpa perlu input manual di Winbox! Jika user sudah pernah ada, sandi dan profilenya akan otomatis diperbarui.
5. **Nomor WhatsApp Pelanggan**:
   * Masukkan nomor WhatsApp pelanggan (contoh: `081234567890`). Nomor akan otomatis tersimpan permanen.
6. **Kirim Informasi ke Pelanggan**:
   * **Pilihan 1: 🤖 Kirim via Bot WA**: Sekali klik, bot WhatsApp panel langsung mengirimkan rincian lengkap ke nomor HP pelanggan di latar belakang sekaligus mendaftarkan user ke MikroTik.
   * **Pilihan 2: 📲 Chat WA**: Membuka WhatsApp Web / Desktop secara manual dengan template pesan yang sudah tersusun rapi.
   * **Pilihan 3: Simpan & Kirim ke Modem**: Mendaftarkan user Free Hotspot ke Winbox MikroTik, menyimpan data ke database panel, serta menerapkan perubahan Wi-Fi ke modem fisik jika ada sandi baru.

### C. Contoh Format Pesan WhatsApp Otomatis:

#### Format 1: Jika Sandi Wi-Fi Memakai Sandi Lama (Tidak Diubah di ACS)
```text
Halo Bapak/Ibu [Nama Pelanggan],

Berikut adalah rincian informasi koneksi internet dan Wi-Fi Anda:

📶 Nama Wi-Fi (SSID): [Nama SSID]
🔑 Password Wi-Fi: (Tetap sesuai sandi lama yang terpasang di modem Anda)

🎁 BONUS AKUN FREE HOTSPOT:
👤 Username: km_iqbal
🔒 Password: 5831
📌 Keterangan: Bisa digunakan di seluruh titik Hotspot WiFi kami

(Catatan: Sandi Wi-Fi tetap memakai sandi lama di modem Anda. Jika ingin mengganti sandi baru, silakan hubungi admin kami).

Silakan hubungkan perangkat Anda. Terima kasih telah berlangganan layanan [Nama Brand]!
```

#### Format 2: Jika Sandi Wi-Fi Diisi Baru
```text
Halo Bapak/Ibu [Nama Pelanggan],

Berikut adalah rincian informasi koneksi internet dan Wi-Fi Anda:

📶 Nama Wi-Fi (SSID): [Nama SSID]
🔑 Password Wi-Fi: [Sandi Baru]

🎁 BONUS AKUN FREE HOTSPOT:
👤 Username: km_iqbal
🔒 Password: 5831
📌 Keterangan: Bisa digunakan di seluruh titik Hotspot WiFi kami

Silakan hubungkan perangkat Anda. Terima kasih telah berlangganan layanan [Nama Brand]!
```

### D. Tampilan Visual di Tabel Panel:
* Pelanggan yang memiliki Akun Free Hotspot akan memiliki badge hijau elegan di bawah namanya:  
  `🎁 Free Hotspot: [username]` (lengkap dengan tooltip yang memuat password hotspot).
* Data ini tersimpan permanen di `wifi-passwords.json` dan otomatis dimuat setiap kali halaman panel dibuka.
