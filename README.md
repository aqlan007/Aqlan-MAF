# KasirKu POS — Modern, Professional, Responsive & Offline-First POS

**KasirKu POS** adalah aplikasi Kasir / Point of Sale (POS) modern, cepat, responsif, dan 100% offline-first yang dirancang khusus untuk toko retail, UMKM, minimarket, toko sembako, fashion, dan bisnis lainnya.

---

## 🚀 Fitur Utama

1. **Arsitektur 100% Offline-First (IndexedDB)**:
   - Data produk, kategori, pelanggan, supplier, mutasi stok, dan transaksi penjualan tersimpan aman di browser/perangkat pengguna menggunakan database lokal IndexedDB (Dexie.js).
   - Beroperasi penuh tanpa ketergantungan koneksi internet.

2. **Dukungan Printer Thermal Bluetooth (58mm & 80mm)**:
   - Integrasi langsung Web Bluetooth API (`navigator.bluetooth`).
   - Generator kode ESC/POS native untuk printer kasir portable maupun desktop.
   - Opsi cetak browser (`window.print()`) otomatis untuk printer USB/kabel/driver Windows/Android.
   - Pengaturan format nota struk (Logo, Footer, Ucapan terima kasih, Alamat, QR Code, dan opsi HPP/Laba internal).

3. **Perhitungan HPP (Harga Pokok Penjualan) & Margin Akurat**:
   - Formula: $\text{HPP per unit} = \frac{\text{Harga Beli} + \text{Ongkir} + \text{Biaya Tambahan}}{\text{Jumlah Unit}}$.
   - Menghitung keuntungan bersih aktual transaksi berdasarkan HPP riil barang saat pembelian.

4. **Terminal Kasir Cepat & Intuitif**:
   - Pencarian instan (nama produk, barcode, SKU).
   - Scanner barcode kamera dan scanner fisik USB barcode scanner (keyboard wedge auto-enter).
   - Quick Cash Button (Uang Pas, Rp 10.000, 20.000, 50.000, 100.000, 200.000, 500.000).
   - Berbagai metode pembayaran: Tunai, QRIS, Transfer Bank, Debit, Kredit, E-Wallet.
   - Struk nota instan: Cetak nota, Kirim nota ke WhatsApp, dan Unduh format PDF.

5. **Manajemen Stok & Mutasi Inventory**:
   - Stok Masuk (Pembelian dari supplier dengan kalkulator HPP otomatis).
   - Stok Keluar (Barang rusak, hilang, pemakaian internal toko, dan penyesuaian opname).
   - Riwayat mutasi stok lengkap dengan tracking stok awal, perubahan, dan stok akhir.
   - Peringatan stok menipis dan stok habis.

6. **Laporan & Analisis Keuangan Komprehensif**:
   - Laporan Harian (Grafik per jam, total omzet, HPP, diskon, laba kotor, dan laba bersih).
   - Laporan Mingguan & Bulanan (Tren Senin-Minggu, perbandingan minggu lalu).
   - Laporan Tahunan (Tren 12 bulan dari Januari sampai Desember).
   - Seluruh transaksi dapat dicetak ulang atau dibatalkan (*Void Transaction* dengan restock otomatis).
   - Modul Pengeluaran Biaya Toko (Listrik, sewa, gaji, internet) untuk menghitung Laba Bersih yang presisi.

7. **PWA (Progressive Web App)**:
   - Dapat di-install langsung ke homescreen Android / iOS / Desktop.
   - Dilengkapi tombol instalasi in-app prompt dan panduan iOS.
   - Indikator status jaringan offline.

8. **Keamanan & Manajemen Pengguna**:
   - Kunci layar (Lock Session) dengan PIN numerik.
   - Role Kasir vs Owner/Admin (membatasi hak void transaksi, HPP, dan reset database).
   - Backup database dalam format file `.json` dan Restore database dengan konfirmasi aman.

---

## 📂 Struktur Folder Project

```
├── public/
│   ├── icon.svg                     # Vector POS icon
│   ├── pwa-192x192.png              # PWA Android icon
│   ├── pwa-512x512.png              # PWA splash icon
│   ├── pwa-maskable-512x512.png     # Maskable safe-zone icon
│   └── apple-touch-icon.png         # iOS Safari icon
├── src/
│   ├── components/
│   │   ├── auth/                    # Kunci PIN & User Login
│   │   ├── common/                  # PWA Install Button & Offline Indicator
│   │   ├── contacts/                # Supplier & Pelanggan
│   │   ├── dashboard/               # Dashboard Utama & KPI
│   │   ├── expenses/                # Biaya Operasional Toko
│   │   ├── inventory/               # Stok Masuk, Keluar & Mutasi
│   │   ├── onboarding/              # Wizard setup toko pertama kali
│   │   ├── pos/                     # Terminal Kasir, Scanner, Modal Nota
│   │   ├── products/                # CRUD Produk & Kategori
│   │   ├── reports/                 # Laporan Harian, Mingguan, Bulanan, Tahunan
│   │   └── settings/                # Profil Toko, Nota, Printer Bluetooth, Backup/Restore
│   ├── db/
│   │   ├── db.ts                    # IndexedDB client via Dexie.js
│   │   └── sampleData.ts            # 20 Produk sample, supplier, transaksi retail
│   ├── hooks/
│   │   ├── useOnlineStatus.ts       # Deteksi status koneksi offline/online
│   │   └── usePWAInstall.ts         # Hook instalasi PWA
│   ├── services/
│   │   └── printer.ts               # Web Bluetooth API & ESC/POS receipt engine
│   ├── types/
│   │   └── index.ts                 # Definisi tipe data TypeScript
│   ├── utils/
│   │   ├── format.ts                # Format mata uang Rupiah & tanggal
│   │   └── hpp.ts                   # Engine perhitungan HPP & margin
│   ├── App.tsx                      # Layout navigasi & routing modul
│   ├── index.css                    # Tailwind CSS 4 & styling cetak thermal
│   └── main.tsx                     # Entry point React
├── index.html                       # HTML metadata & PWA tags
├── metadata.json                    # AI Studio app metadata
├── package.json                     # Dependencies
├── tsconfig.json                    # Konfigurasi TypeScript
└── vite.config.ts                   # Vite build & VitePWA configuration
```

---

## 🛠️ Instalasi & Menjalankan Aplikasi

1. **Clone repository dan install dependencies**:
   ```bash
   npm install
   ```

2. **Jalankan development server**:
   ```bash
   npm run dev
   ```
   Aplikasi akan berjalan di `http://localhost:3000`.

3. **Build untuk production**:
   ```bash
   npm run build
   ```

---

## 🖨️ Panduan Konfigurasi Printer Bluetooth Thermal

Aplikasi mendukung 2 metode pencetakan:

### Metode 1: Web Bluetooth Langsung (Wireless Direct)
1. Nyalakan printer thermal Bluetooth (misal: ukuran 58mm atau 80mm).
2. Buka menu **Pengaturan Toko > Printer BT**.
3. Klik tombol **"Cari & Hubungkan Printer"**.
4. Pilih nama perangkat printer Bluetooth Anda dari dialog browser Chrome/Edge.
5. Klik **Test Print** untuk memverifikasi cetakan struk.
6. Saat transaksi selesai di kasir, nota dapat dicetak langsung tanpa membuka dialog sistem operasi.

### Metode 2: Driver Sistem / USB Print
Jika printer terhubung melalui kabel USB, Bluetooth OS Pair, atau virtual driver:
1. Saat kasir menekan tombol **"Cetak Nota"**, dialog print browser akan otomatis terbuka.
2. Template `@media print` telah dioptimasi khusus untuk kertas struk POS (tanpa margin, teks hitam kontras tinggi, monospace).

---

## 📱 Panduan Build Android (PWA / TWA / Capacitor)

Untuk mengemas KasirKu POS menjadi file `.apk` Android mandiri:

1. **Metode PWA (Termudah)**:
   - Buka aplikasi di Google Chrome Android.
   - Klik tombol **"Install App"** di bagian atas aplikasi atau opsi menu Chrome *"Install app / Tambahkan ke Layar Utama"*.
   - Aplikasi akan terpasang sebagai aplikasi mandiri (*standalone*) berlayar penuh dengan ikon resmi.

2. **Metode Bubblewrap / TWA (Trusted Web Activity)**:
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest=https://[DOMAIN_ANDA]/manifest.webmanifest
   bubblewrap build
   ```
   Akan menghasilkan file `app-release-signed.apk` siap upload ke Google Play Store.

3. **Metode Capacitor**:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init "KasirKu POS" "id.kasirku.pos"
   npm run build
   npx cap add android
   npx cap open android
   ```

---

## 🖥️ Panduan Build Desktop (Electron)

Untuk membungkus aplikasi menjadi installer Desktop Windows (`.exe`) atau macOS (`.dmg`):
1. Install Electron:
   ```bash
   npm install -D electron electron-builder concurrently
   ```
2. Buat file `electron/main.js` yang memuat URL lokal `dist/index.html`.
3. Jalankan `npm run build` dan `electron-builder`.
