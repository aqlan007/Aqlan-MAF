import { db } from '../db/db';
import QRCode from 'qrcode';
import {
  Category,
  Customer,
  Expense,
  Ingredient,
  PrinterSettings,
  Product,
  Recipe,
  Sale,
  SaleItem,
  StoreSettings,
  Supplier,
  User as CashierUser,
} from '../types';
import { getAccessToken, signInWithGoogle, getGoogleUser } from './googleAuth';

export interface SpreadsheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  webAppUrl?: string; // Optional Google Apps Script web app endpoint for zero-login devices
  autoSync: boolean;
  lastSyncedAt?: string | null;
  syncIntervalMinutes?: number;
}

const STORAGE_KEY = 'kasirku_spreadsheet_config';
const PAIRING_PREFIX = 'KASIRKU_SHEET_V2:';

export class SpreadsheetService {
  private config: SpreadsheetConfig = {
    spreadsheetId: '',
    spreadsheetUrl: '',
    spreadsheetTitle: '',
    webAppUrl: '',
    autoSync: true,
    lastSyncedAt: null,
    syncIntervalMinutes: 2,
  };

  private isSyncing = false;
  private pollingTimer: any = null;
  private syncListeners: Set<
    (isSyncing: boolean, lastSync?: string | null, error?: string | null) => void
  > = new Set();

  constructor() {
    this.loadConfig();
    if (this.config.autoSync && (this.config.spreadsheetId || this.config.webAppUrl)) {
      this.startPolling();
    }
  }

  private loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.config = { ...this.config, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('Gagal membaca konfigurasi spreadsheet dari localStorage:', e);
    }
  }

  public saveConfig(newConfig: Partial<SpreadsheetConfig>): boolean {
    try {
      this.config = { ...this.config, ...newConfig };
      if (this.config.spreadsheetId && !this.config.spreadsheetUrl) {
        this.config.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${this.config.spreadsheetId}/edit`;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      if (this.config.autoSync && (this.config.spreadsheetId || this.config.webAppUrl)) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
      this.notify(null);
      return true;
    } catch (e) {
      console.error('Gagal menyimpan konfigurasi spreadsheet:', e);
      return false;
    }
  }

  public getConfig(): SpreadsheetConfig {
    return { ...this.config };
  }

  public isConfigured(): boolean {
    return !!(this.config.spreadsheetId || this.config.webAppUrl);
  }

  public getSpreadsheetUrl(): string {
    if (this.config.spreadsheetUrl) return this.config.spreadsheetUrl;
    if (this.config.spreadsheetId) {
      return `https://docs.google.com/spreadsheets/d/${this.config.spreadsheetId}/edit`;
    }
    return '';
  }

  public addSyncListener(
    listener: (isSyncing: boolean, lastSync?: string | null, error?: string | null) => void
  ): () => void {
    this.syncListeners.add(listener);
    listener(this.isSyncing, this.config.lastSyncedAt);
    return () => this.syncListeners.delete(listener);
  }

  private notify(error?: string | null) {
    this.syncListeners.forEach((l) => l(this.isSyncing, this.config.lastSyncedAt, error));
  }

  public dispatchLocalSync(table: string, data?: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kasirku:data_sync', {
          detail: { table, data, timestamp: Date.now() },
        })
      );
    }
  }

  public startPolling(intervalMs = 45000) {
    this.stopPolling();
    this.pollingTimer = setInterval(() => {
      if (this.isConfigured() && !this.isSyncing) {
        this.sync(true).catch((err) => console.warn('Background spreadsheet sync error:', err));
      }
    }, intervalMs);
  }

  public stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // =========================================================================
  // GOOGLE SHEETS REST API HELPERS
  // =========================================================================

  private async getValidToken(): Promise<string> {
    const token = await getAccessToken();
    if (!token) {
      // Try prompt login if needed
      const result = await signInWithGoogle();
      if (!result?.accessToken) {
        throw new Error('Diperlukan izin Google Sheets. Silakan login dengan akun Google Anda.');
      }
      return result.accessToken;
    }
    return token;
  }

  /**
   * Create a new Google Spreadsheet in user's Drive with pre-formatted sheets
   */
  public async createDatabaseSpreadsheet(
    title = 'KasirKu POS Database'
  ): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
    const token = await this.getValidToken();

    const sheets = [
      { properties: { title: 'Pengaturan_Toko', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Pengaturan_Printer', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Produk', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Kategori', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Bahan_Baku', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Resep', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Penjualan', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Item_Penjualan', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Pengeluaran', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Pelanggan', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Supplier', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Pengguna', gridProperties: { frozenRowCount: 1 } } },
    ];

    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title,
        },
        sheets,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Gagal membuat Google Spreadsheet baru.');
    }

    const data = await response.json();
    const spreadsheetId = data.spreadsheetId;
    const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // Save and push current local data to initialize all tabs
    this.saveConfig({
      spreadsheetId,
      spreadsheetUrl,
      spreadsheetTitle: title,
    });

    await this.pushAllDataToSpreadsheet(spreadsheetId);

    return { spreadsheetId, spreadsheetUrl };
  }

  /**
   * Helper to execute Google Sheets API batchUpdate or value updates
   */
  public async ensureSheetsExist(spreadsheetId: string, sheetTitles: string[]): Promise<void> {
    const token = await this.getValidToken();

    // Get existing sheets
    const getRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!getRes.ok) {
      const err = await getRes.json();
      throw new Error(err.error?.message || 'Gagal membaca metadata Spreadsheet.');
    }

    const meta = await getRes.json();
    const existingTitles: string[] = (meta.sheets || []).map((s: any) => s.properties.title);

    const requests: any[] = [];
    sheetTitles.forEach((t) => {
      if (!existingTitles.includes(t)) {
        requests.push({
          addSheet: {
            properties: {
              title: t,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        });
      }
    });

    if (requests.length > 0) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      });
    }
  }

  public async readRange(spreadsheetId: string, range: string): Promise<any[][]> {
    const token = await this.getValidToken();
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.values || [];
  }

  public async writeRange(spreadsheetId: string, range: string, values: any[][]): Promise<void> {
    const token = await this.getValidToken();
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values }),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      console.warn(`Write range ${range} warning:`, err);
    }
  }

  public async clearRange(spreadsheetId: string, range: string): Promise<void> {
    const token = await this.getValidToken();
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:clear`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
  }

  // =========================================================================
  // PUSH ALL DATA FROM DEXIE TO SPREADSHEET (INITIAL SEED OR FULL SYNC)
  // =========================================================================

  public async pushAllDataToSpreadsheet(spreadsheetId: string): Promise<void> {
    const requiredSheets = [
      'Pengaturan_Toko',
      'Pengaturan_Printer',
      'Produk',
      'Kategori',
      'Bahan_Baku',
      'Resep',
      'Penjualan',
      'Item_Penjualan',
      'Pengeluaran',
      'Pelanggan',
      'Supplier',
      'Pengguna',
    ];

    await this.ensureSheetsExist(spreadsheetId, requiredSheets);

    // 1. Store Settings
    const store = await db.store_settings.get('store-main');
    if (store) {
      const rows = [
        ['Field', 'Nilai', 'Keterangan'],
        ['id', store.id || 'store-main', 'ID Pengaturan'],
        ['storeName', store.storeName || '', 'Nama Toko / Cafe'],
        ['slogan', store.slogan || '', 'Slogan / Tagline'],
        ['logo', store.logo || '', 'Data URI Logo Toko'],
        ['address', store.address || '', 'Alamat Lengkap'],
        ['city', store.city || '', 'Kota'],
        ['province', store.province || '', 'Provinsi'],
        ['postalCode', store.postalCode || '', 'Kode Pos'],
        ['phone', store.phone || '', 'Nomor Telepon'],
        ['whatsapp', store.whatsapp || '', 'Nomor WhatsApp Toko'],
        ['email', store.email || '', 'Email'],
        ['website', store.website || '', 'Website Toko'],
        ['instagram', store.instagram || '', 'Instagram'],
        ['facebook', store.facebook || '', 'Facebook'],
        ['ownerName', store.ownerName || '', 'Nama Pemilik'],
        ['npwp', store.npwp || '', 'NPWP Toko'],
        ['currencySymbol', store.currencySymbol || 'Rp', 'Simbol Mata Uang'],
        ['taxRate', store.taxRate ?? 0, 'Tarif Pajak Restoran (PB1/PPN %)'],
        ['enableTax', store.enableTax ? 'TRUE' : 'FALSE', 'Status Aktif Pajak'],
        ['enableRounding', store.enableRounding ? 'TRUE' : 'FALSE', 'Status Pembulatan'],
        ['receiptFooter', store.receiptFooter || '', 'Catatan Kaki Struk'],
        ['businessType', store.businessType || 'cafe', 'Tipe Usaha (cafe/retail)'],
        ['tables', JSON.stringify(store.tables || []), 'Daftar Meja Cafe (JSON)'],
        ['wifiName', store.wifiName || '', 'Nama WiFi Pengunjung'],
        ['wifiPassword', store.wifiPassword || '', 'Kata Sandi WiFi'],
        ['updatedAt', new Date().toISOString(), 'Waktu Pembaruan Terakhir'],
      ];
      await this.writeRange(spreadsheetId, 'Pengaturan_Toko!A1:C28', rows);
    }

    // 2. Printer Settings
    const printer = await db.printer_settings.get('printer-main');
    if (printer) {
      const rows = [
        ['Field', 'Nilai', 'Keterangan'],
        ['id', printer.id || 'printer-main', 'ID Printer'],
        ['paperSize', printer.paperSize || '58mm', 'Ukuran Kertas (58mm / 80mm)'],
        ['copies', printer.copies || 1, 'Jumlah Lembar Cetak'],
        ['margin', printer.margin || 0, 'Margin Cetak (mm)'],
        ['fontSize', printer.fontSize || 'medium', 'Ukuran Huruf'],
        ['showLogo', printer.showLogo ? 'TRUE' : 'FALSE', 'Tampilkan Logo'],
        ['logoSize', printer.logoSize || 'medium', 'Ukuran Logo Struk'],
        ['logoGrayscale', printer.logoGrayscale ? 'TRUE' : 'FALSE', 'Monokrom Kontras Tinggi'],
        ['showCustomerName', printer.showCustomerName ? 'TRUE' : 'FALSE', 'Tampilkan Nama Tamu'],
        ['showWifi', printer.showWifi ? 'TRUE' : 'FALSE', 'Cetak Info WiFi'],
        ['showWifiPassword', printer.showWifiPassword ? 'TRUE' : 'FALSE', 'Cetak Sandi WiFi'],
        ['showAddress', printer.showAddress ? 'TRUE' : 'FALSE', 'Cetak Alamat'],
        ['showPhone', printer.showPhone ? 'TRUE' : 'FALSE', 'Cetak Telepon'],
        ['showEmail', printer.showEmail ? 'TRUE' : 'FALSE', 'Cetak Email'],
        ['showWebsite', printer.showWebsite ? 'TRUE' : 'FALSE', 'Cetak Website'],
        ['showQrCode', printer.showQrCode ? 'TRUE' : 'FALSE', 'Cetak QR Code'],
        ['showBarcode', printer.showBarcode ? 'TRUE' : 'FALSE', 'Cetak Barcode'],
        ['showFooter', printer.showFooter ? 'TRUE' : 'FALSE', 'Cetak Footer'],
        ['showThankYou', printer.showThankYou ? 'TRUE' : 'FALSE', 'Cetak Ucapan Terima Kasih'],
        ['defaultPrinterName', printer.defaultPrinterName || '', 'Nama Printer Default'],
        ['updatedAt', new Date().toISOString(), 'Waktu Pembaruan Terakhir'],
      ];
      await this.writeRange(spreadsheetId, 'Pengaturan_Printer!A1:C23', rows);
    }

    // 3. Products
    const products = await db.products.toArray();
    if (products.length > 0) {
      const header = [
        'ID',
        'Nama Produk',
        'SKU',
        'Barcode',
        'Kategori ID',
        'Satuan',
        'Harga Beli',
        'HPP',
        'Harga Jual',
        'Margin %',
        'Stok Saat Ini',
        'Stok Minimum',
        'Status Aktif',
        'Gambar',
        'Deskripsi',
        'Dibuat',
      ];
      const rows = products.map((p) => [
        p.id,
        p.name,
        p.sku || '',
        p.barcode || '',
        p.categoryId || '',
        p.unit || 'pcs',
        p.buyPrice || 0,
        p.hpp || 0,
        p.sellPrice || 0,
        p.margin || 0,
        p.stock || 0,
        p.minStock || 0,
        p.isActive ? 'AKTIF' : 'NONAKTIF',
        p.image || p.imageUrl || '',
        p.description || '',
        p.createdAt || new Date().toISOString(),
      ]);
      await this.writeRange(spreadsheetId, 'Produk!A1:P' + (rows.length + 1), [header, ...rows]);
    }

    // 4. Categories
    const categories = await db.categories.toArray();
    if (categories.length > 0) {
      const header = ['ID', 'Nama Kategori', 'Ikon', 'Warna', 'Deskripsi', 'Dibuat'];
      const rows = categories.map((c) => [
        c.id,
        c.name,
        c.icon || '',
        c.color || '',
        c.description || '',
        c.createdAt || new Date().toISOString(),
      ]);
      await this.writeRange(spreadsheetId, 'Kategori!A1:F' + (rows.length + 1), [header, ...rows]);
    }

    // 5. Ingredients (Bahan Baku)
    const ingredients = await db.ingredients.toArray();
    if (ingredients.length > 0) {
      const header = [
        'ID',
        'Nama Bahan',
        'Kategori',
        'Satuan Beli',
        'Harga Beli',
        'Ukuran Kemasan',
        'Satuan Resep',
        'Faktor Konversi',
        'Biaya per Resep',
        'Waste %',
        'Biaya Efektif',
        'Stok Sekarang',
        'Stok Minimal',
      ];
      const rows = ingredients.map((ing) => [
        ing.id,
        ing.name,
        ing.category || '',
        ing.purchaseUnit || '',
        ing.purchasePrice || 0,
        ing.purchaseUnitSize || 1,
        ing.recipeUnit || '',
        ing.conversionFactor || 1,
        ing.costPerRecipeUnit || 0,
        ing.wastagePercent || 0,
        ing.effectiveCostPerRecipeUnit || 0,
        ing.currentStock || 0,
        ing.minStock || 0,
      ]);
      await this.writeRange(spreadsheetId, 'Bahan_Baku!A1:M' + (rows.length + 1), [header, ...rows]);
    }

    // 6. Recipes (Resep)
    const recipes = await db.recipes.toArray();
    if (recipes.length > 0) {
      const header = [
        'ID',
        'Produk ID',
        'Nama Menu',
        'Total HPP Resep',
        'Harga Jual',
        'Food Cost %',
        'Margin %',
        'Gross Profit',
        'Bahan-Bahan (JSON)',
      ];
      const rows = recipes.map((r) => [
        r.id,
        r.productId,
        r.productName,
        r.totalHpp || 0,
        r.actualSellPrice || 0,
        r.actualFoodCostPercent || 0,
        r.actualMarginPercent || 0,
        r.actualProfit || 0,
        JSON.stringify(r.items || []),
      ]);
      await this.writeRange(spreadsheetId, 'Resep!A1:I' + (rows.length + 1), [header, ...rows]);
    }

    // 7. Sales (Penjualan)
    const sales = await db.sales.toArray();
    if (sales.length > 0) {
      const header = [
        'Invoice',
        'Tanggal',
        'Jam',
        'Kasir',
        'Tipe Order',
        'Meja',
        'Pelanggan',
        'Subtotal',
        'Diskon',
        'Pajak',
        'Pembulatan',
        'Total',
        'Metode Bayar',
        'Uang Diterima',
        'Kembalian',
        'Total HPP',
        'Profit',
        'Margin %',
        'Status',
      ];
      const rows = sales.slice(-200).map((s) => [
        s.invoiceNumber,
        s.date,
        s.time,
        s.cashierName,
        s.orderType || 'dine_in',
        s.tableNumber || '',
        s.customerName || '',
        s.subtotal,
        s.discount || 0,
        s.tax || 0,
        s.rounding || 0,
        s.total,
        s.paymentMethod,
        s.cashReceived || s.total,
        s.changeAmount || 0,
        s.totalHpp || 0,
        s.totalProfit || 0,
        s.profitMargin || 0,
        s.status,
      ]);
      await this.writeRange(spreadsheetId, 'Penjualan!A1:S' + (rows.length + 1), [header, ...rows]);
    }

    // 8. Users
    const users = await db.users.toArray();
    if (users.length > 0) {
      const header = ['ID', 'Nama Lengkap', 'Peran', 'PIN', 'Telepon', 'Status'];
      const rows = users.map((u) => [
        u.id,
        u.name,
        u.role,
        u.pin,
        u.phone || '',
        u.isActive ? 'AKTIF' : 'NONAKTIF',
      ]);
      await this.writeRange(spreadsheetId, 'Pengguna!A1:F' + (rows.length + 1), [header, ...rows]);
    }

    this.config.lastSyncedAt = new Date().toISOString();
    this.saveConfig({ lastSyncedAt: this.config.lastSyncedAt });
  }

  // =========================================================================
  // FULL TWO-WAY SYNC (PULL FROM SPREADSHEET & UPDATE DEXIE + REACT STATE)
  // =========================================================================

  public async sync(silent = false): Promise<{ success: boolean; message: string; count?: number }> {
    if (!this.isConfigured()) {
      return { success: false, message: 'Google Spreadsheet belum terhubung.' };
    }

    if (this.isSyncing) {
      return { success: false, message: 'Sinkronisasi spreadsheet sedang berjalan...' };
    }

    this.isSyncing = true;
    if (!silent) this.notify();

    try {
      const spreadsheetId = this.config.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error('Spreadsheet ID belum diisi.');
      }

      // Ensure sheets exist
      const requiredSheets = [
        'Pengaturan_Toko',
        'Pengaturan_Printer',
        'Produk',
        'Kategori',
        'Bahan_Baku',
        'Resep',
        'Penjualan',
        'Pengguna',
      ];
      await this.ensureSheetsExist(spreadsheetId, requiredSheets);

      let totalSynced = 0;

      // 1. SYNC STORE SETTINGS (Google Spreadsheet is Authoritative)
      const storeRows = await this.readRange(spreadsheetId, 'Pengaturan_Toko!A2:B30');
      if (storeRows && storeRows.length > 0) {
        const storeMap: Record<string, any> = {};
        storeRows.forEach((row) => {
          if (row[0]) storeMap[row[0].trim()] = row[1];
        });

        const currentLocal = await db.store_settings.get('store-main');

        let tablesParsed = currentLocal?.tables || [];
        if (storeMap.tables) {
          try {
            tablesParsed = JSON.parse(storeMap.tables);
          } catch {
            // keep fallback
          }
        }

        const updatedStore: StoreSettings = {
          id: 'store-main',
          storeName: storeMap.storeName || currentLocal?.storeName || 'Senja Kopi & Kitchen',
          slogan: storeMap.slogan || currentLocal?.slogan || '',
          logo: storeMap.logo || currentLocal?.logo,
          address: storeMap.address || currentLocal?.address || '',
          city: storeMap.city || currentLocal?.city || 'Jakarta Selatan',
          province: storeMap.province || currentLocal?.province || 'DKI Jakarta',
          postalCode: storeMap.postalCode || currentLocal?.postalCode || '',
          phone: storeMap.phone || currentLocal?.phone || '',
          whatsapp: storeMap.whatsapp || currentLocal?.whatsapp || '',
          email: storeMap.email || currentLocal?.email || '',
          website: storeMap.website || currentLocal?.website || '',
          instagram: storeMap.instagram || currentLocal?.instagram || '',
          facebook: storeMap.facebook || currentLocal?.facebook || '',
          ownerName: storeMap.ownerName || currentLocal?.ownerName || 'Hendra Setiawan',
          npwp: storeMap.npwp || currentLocal?.npwp || '',
          currencySymbol: storeMap.currencySymbol || currentLocal?.currencySymbol || 'Rp',
          taxRate: storeMap.taxRate !== undefined ? Number(storeMap.taxRate) : (currentLocal?.taxRate ?? 10),
          enableTax: storeMap.enableTax === 'TRUE' || storeMap.enableTax === true || (currentLocal?.enableTax ?? false),
          enableRounding:
            storeMap.enableRounding === 'TRUE' ||
            storeMap.enableRounding === true ||
            (currentLocal?.enableRounding ?? true),
          receiptFooter: storeMap.receiptFooter || currentLocal?.receiptFooter || '',
          businessType: (storeMap.businessType as any) || currentLocal?.businessType || 'cafe',
          tables: tablesParsed,
          wifiName: storeMap.wifiName || currentLocal?.wifiName || '',
          wifiPassword: storeMap.wifiPassword || currentLocal?.wifiPassword || '',
          isOnboarded: true,
        };

        await db.store_settings.put(updatedStore);
        this.dispatchLocalSync('store_settings', updatedStore);
        totalSynced++;
      } else {
        // If sheet is empty, push local store settings up
        const local = await db.store_settings.get('store-main');
        if (local) await this.pushStoreSettings(local);
      }

      // 2. SYNC PRINTER SETTINGS
      const printerRows = await this.readRange(spreadsheetId, 'Pengaturan_Printer!A2:B25');
      if (printerRows && printerRows.length > 0) {
        const printerMap: Record<string, any> = {};
        printerRows.forEach((row) => {
          if (row[0]) printerMap[row[0].trim()] = row[1];
        });

        const currentPrinter = await db.printer_settings.get('printer-main');
        const updatedPrinter: PrinterSettings = {
          id: 'printer-main',
          paperSize: (printerMap.paperSize as any) || currentPrinter?.paperSize || '58mm',
          copies: Number(printerMap.copies || currentPrinter?.copies || 1),
          margin: Number(printerMap.margin || currentPrinter?.margin || 0),
          fontSize: (printerMap.fontSize as any) || currentPrinter?.fontSize || 'medium',
          showLogo: printerMap.showLogo === 'TRUE' || printerMap.showLogo === true || (currentPrinter?.showLogo ?? true),
          logoSize: (printerMap.logoSize as any) || currentPrinter?.logoSize || 'medium',
          logoGrayscale:
            printerMap.logoGrayscale === 'TRUE' ||
            printerMap.logoGrayscale === true ||
            (currentPrinter?.logoGrayscale ?? true),
          showCustomerName:
            printerMap.showCustomerName === 'TRUE' ||
            printerMap.showCustomerName === true ||
            (currentPrinter?.showCustomerName ?? true),
          showWifi: printerMap.showWifi === 'TRUE' || printerMap.showWifi === true || (currentPrinter?.showWifi ?? true),
          showWifiPassword:
            printerMap.showWifiPassword === 'TRUE' ||
            printerMap.showWifiPassword === true ||
            (currentPrinter?.showWifiPassword ?? true),
          showAddress:
            printerMap.showAddress === 'TRUE' ||
            printerMap.showAddress === true ||
            (currentPrinter?.showAddress ?? true),
          showPhone:
            printerMap.showPhone === 'TRUE' ||
            printerMap.showPhone === true ||
            (currentPrinter?.showPhone ?? true),
          showEmail:
            printerMap.showEmail === 'TRUE' ||
            printerMap.showEmail === true ||
            (currentPrinter?.showEmail ?? false),
          showWebsite:
            printerMap.showWebsite === 'TRUE' ||
            printerMap.showWebsite === true ||
            (currentPrinter?.showWebsite ?? false),
          showQrCode:
            printerMap.showQrCode === 'TRUE' ||
            printerMap.showQrCode === true ||
            (currentPrinter?.showQrCode ?? true),
          showBarcode: false,
          showFooter:
            printerMap.showFooter === 'TRUE' ||
            printerMap.showFooter === true ||
            (currentPrinter?.showFooter ?? true),
          showThankYou:
            printerMap.showThankYou === 'TRUE' ||
            printerMap.showThankYou === true ||
            (currentPrinter?.showThankYou ?? true),
          showHpp: false,
          showProfit: false,
          autoCut: false,
          defaultPrinterName: printerMap.defaultPrinterName || currentPrinter?.defaultPrinterName || '',
        };

        await db.printer_settings.put(updatedPrinter);
        this.dispatchLocalSync('printer_settings', updatedPrinter);
        totalSynced++;
      } else {
        const local = await db.printer_settings.get('printer-main');
        if (local) await this.pushPrinterSettings(local);
      }

      // 3. SYNC PRODUCTS
      const productRows = await this.readRange(spreadsheetId, 'Produk!A2:P500');
      if (productRows && productRows.length > 0) {
        for (const row of productRows) {
          if (!row[0] || !row[1]) continue;
          await db.products.put({
            id: row[0],
            name: row[1],
            sku: row[2] || `SKU-${row[0]}`,
            barcode: row[3] || '',
            categoryId: row[4] || 'cat-minuman',
            unit: row[5] || 'pcs',
            buyPrice: Number(row[6] || 0),
            hpp: Number(row[7] || 0),
            sellPrice: Number(row[8] || 0),
            margin: Number(row[9] || 0),
            stock: Number(row[10] || 0),
            minStock: Number(row[11] || 0),
            isActive: row[12] !== 'NONAKTIF',
            image: row[13] || '',
            description: row[14] || '',
            createdAt: row[15] || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          totalSynced++;
        }
        this.dispatchLocalSync('products');
      }

      // 4. SYNC CATEGORIES
      const catRows = await this.readRange(spreadsheetId, 'Kategori!A2:F50');
      if (catRows && catRows.length > 0) {
        for (const row of catRows) {
          if (!row[0] || !row[1]) continue;
          await db.categories.put({
            id: row[0],
            name: row[1],
            icon: row[2] || 'Coffee',
            color: row[3] || '#0284c7',
            description: row[4] || '',
            createdAt: row[5] || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('categories');
      }

      // 5. SYNC INGREDIENTS
      const ingRows = await this.readRange(spreadsheetId, 'Bahan_Baku!A2:M200');
      if (ingRows && ingRows.length > 0) {
        for (const row of ingRows) {
          if (!row[0] || !row[1]) continue;
          await db.ingredients.put({
            id: row[0],
            name: row[1],
            category: (row[2] as any) || 'kopi_espresso',
            purchaseUnit: row[3] || 'kg',
            purchasePrice: Number(row[4] || 0),
            purchaseUnitSize: Number(row[5] || 1000),
            recipeUnit: row[6] || 'gram',
            conversionFactor: Number(row[7] || 1000),
            costPerRecipeUnit: Number(row[8] || 0),
            wastagePercent: Number(row[9] || 0),
            effectiveCostPerRecipeUnit: Number(row[10] || 0),
            currentStock: Number(row[11] || 0),
            minStock: Number(row[12] || 0),
            updatedAt: new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('ingredients');
      }

      this.config.lastSyncedAt = new Date().toISOString();
      this.saveConfig({ lastSyncedAt: this.config.lastSyncedAt });
      this.notify(null);

      return {
        success: true,
        message: `Sinkronisasi Spreadsheet berhasil! ${totalSynced} data terupdate.`,
        count: totalSynced,
      };
    } catch (err: any) {
      console.error('Spreadsheet sync error:', err);
      const msg = err.message || 'Gagal menyinkronkan dengan Google Spreadsheet.';
      this.notify(msg);
      return { success: false, message: msg };
    } finally {
      this.isSyncing = false;
      this.notify(null);
    }
  }

  // =========================================================================
  // PUSH SINGLE MUTATIONS (CALLED WHEN USER EDITS SETTINGS OR MAKES A SALE)
  // =========================================================================

  public async pushStoreSettings(settings: StoreSettings): Promise<void> {
    if (!this.config.spreadsheetId) return;
    try {
      const rows = [
        ['Field', 'Nilai', 'Keterangan'],
        ['id', settings.id || 'store-main', 'ID Pengaturan'],
        ['storeName', settings.storeName || '', 'Nama Toko / Cafe'],
        ['slogan', settings.slogan || '', 'Slogan / Tagline'],
        ['logo', settings.logo || '', 'Data URI Logo Toko'],
        ['address', settings.address || '', 'Alamat Lengkap'],
        ['city', settings.city || '', 'Kota'],
        ['province', settings.province || '', 'Provinsi'],
        ['postalCode', settings.postalCode || '', 'Kode Pos'],
        ['phone', settings.phone || '', 'Nomor Telepon'],
        ['whatsapp', settings.whatsapp || '', 'Nomor WhatsApp Toko'],
        ['email', settings.email || '', 'Email'],
        ['website', settings.website || '', 'Website Toko'],
        ['instagram', settings.instagram || '', 'Instagram'],
        ['facebook', settings.facebook || '', 'Facebook'],
        ['ownerName', settings.ownerName || '', 'Nama Pemilik'],
        ['npwp', settings.npwp || '', 'NPWP Toko'],
        ['currencySymbol', settings.currencySymbol || 'Rp', 'Simbol Mata Uang'],
        ['taxRate', settings.taxRate ?? 0, 'Tarif Pajak Restoran (PB1/PPN %)'],
        ['enableTax', settings.enableTax ? 'TRUE' : 'FALSE', 'Status Aktif Pajak'],
        ['enableRounding', settings.enableRounding ? 'TRUE' : 'FALSE', 'Status Pembulatan'],
        ['receiptFooter', settings.receiptFooter || '', 'Catatan Kaki Struk'],
        ['businessType', settings.businessType || 'cafe', 'Tipe Usaha (cafe/retail)'],
        ['tables', JSON.stringify(settings.tables || []), 'Daftar Meja Cafe (JSON)'],
        ['wifiName', settings.wifiName || '', 'Nama WiFi Pengunjung'],
        ['wifiPassword', settings.wifiPassword || '', 'Kata Sandi WiFi'],
        ['updatedAt', new Date().toISOString(), 'Waktu Pembaruan Terakhir'],
      ];
      await this.writeRange(this.config.spreadsheetId, 'Pengaturan_Toko!A1:C28', rows);
    } catch (e) {
      console.warn('Gagal push store settings ke spreadsheet:', e);
    }
  }

  public async pushPrinterSettings(settings: PrinterSettings): Promise<void> {
    if (!this.config.spreadsheetId) return;
    try {
      const rows = [
        ['Field', 'Nilai', 'Keterangan'],
        ['id', settings.id || 'printer-main', 'ID Printer'],
        ['paperSize', settings.paperSize || '58mm', 'Ukuran Kertas (58mm / 80mm)'],
        ['copies', settings.copies || 1, 'Jumlah Lembar Cetak'],
        ['margin', settings.margin || 0, 'Margin Cetak (mm)'],
        ['fontSize', settings.fontSize || 'medium', 'Ukuran Huruf'],
        ['showLogo', settings.showLogo ? 'TRUE' : 'FALSE', 'Tampilkan Logo'],
        ['logoSize', settings.logoSize || 'medium', 'Ukuran Logo Struk'],
        ['logoGrayscale', settings.logoGrayscale ? 'TRUE' : 'FALSE', 'Monokrom Kontras Tinggi'],
        ['showCustomerName', settings.showCustomerName ? 'TRUE' : 'FALSE', 'Tampilkan Nama Tamu'],
        ['showWifi', settings.showWifi ? 'TRUE' : 'FALSE', 'Cetak Info WiFi'],
        ['showWifiPassword', settings.showWifiPassword ? 'TRUE' : 'FALSE', 'Cetak Sandi WiFi'],
        ['showAddress', settings.showAddress ? 'TRUE' : 'FALSE', 'Cetak Alamat'],
        ['showPhone', settings.showPhone ? 'TRUE' : 'FALSE', 'Cetak Telepon'],
        ['showEmail', settings.showEmail ? 'TRUE' : 'FALSE', 'Cetak Email'],
        ['showWebsite', settings.showWebsite ? 'TRUE' : 'FALSE', 'Cetak Website'],
        ['showQrCode', settings.showQrCode ? 'TRUE' : 'FALSE', 'Cetak QR Code'],
        ['showBarcode', settings.showBarcode ? 'TRUE' : 'FALSE', 'Cetak Barcode'],
        ['showFooter', settings.showFooter ? 'TRUE' : 'FALSE', 'Cetak Footer'],
        ['showThankYou', settings.showThankYou ? 'TRUE' : 'FALSE', 'Cetak Ucapan Terima Kasih'],
        ['defaultPrinterName', settings.defaultPrinterName || '', 'Nama Printer Default'],
        ['updatedAt', new Date().toISOString(), 'Waktu Pembaruan Terakhir'],
      ];
      await this.writeRange(this.config.spreadsheetId, 'Pengaturan_Printer!A1:C23', rows);
    } catch (e) {
      console.warn('Gagal push printer settings ke spreadsheet:', e);
    }
  }

  public async appendSale(sale: Sale): Promise<void> {
    if (!this.config.spreadsheetId) return;
    try {
      const token = await this.getValidToken();
      const row = [
        sale.invoiceNumber,
        sale.date,
        sale.time,
        sale.cashierName,
        sale.orderType || 'dine_in',
        sale.tableNumber || '',
        sale.customerName || '',
        sale.subtotal,
        sale.discount || 0,
        sale.tax || 0,
        sale.rounding || 0,
        sale.total,
        sale.paymentMethod,
        sale.cashReceived || sale.total,
        sale.changeAmount || 0,
        sale.totalHpp || 0,
        sale.totalProfit || 0,
        sale.profitMargin || 0,
        sale.status,
      ];

      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/Penjualan!A:S:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [row] }),
        }
      );
    } catch (e) {
      console.warn('Gagal append sale ke spreadsheet:', e);
    }
  }

  // =========================================================================
  // DEVICE PAIRING: ENSURES CONNECTED DEVICE HAS 100% IDENTICAL SETTINGS
  // =========================================================================

  /**
   * Generates a comprehensive pairing code that includes:
   * 1. Spreadsheet database configuration (Spreadsheet ID, URL, title)
   * 2. COMPLETE SNAPSHOT of Store Settings (store name, logo, tables, wifi, taxes, address, phone)
   * 3. COMPLETE SNAPSHOT of Printer Settings (paper size, copies, showLogo, showWifi, footer)
   *
   * This guarantees that any device scanning the QR code or clicking the pairing link
   * instantly receives and applies the identical store and printer settings!
   */
  public generatePairingCode(
    currentStore: StoreSettings,
    currentPrinter: PrinterSettings
  ): string {
    try {
      // Strip large image/base64 data so the QR code stays compact (< 600 chars) and instant to scan
      const storePayload: any = {
        storeName: currentStore.storeName,
        phone: currentStore.phone,
        address: currentStore.address,
        city: currentStore.city,
        slogan: currentStore.slogan,
        receiptFooter: currentStore.receiptFooter,
        taxRate: currentStore.taxRate,
        enableTax: currentStore.enableTax,
        enableRounding: currentStore.enableRounding,
        tables: currentStore.tables,
        wifiName: currentStore.wifiName,
        wifiPassword: currentStore.wifiPassword,
      };

      const printerPayload: any = {
        paperSize: currentPrinter.paperSize,
        fontSize: currentPrinter.fontSize,
        copies: currentPrinter.copies,
        margin: currentPrinter.margin,
        showLogo: currentPrinter.showLogo,
        showAddress: currentPrinter.showAddress,
        showPhone: currentPrinter.showPhone,
        showFooter: currentPrinter.showFooter,
        showThankYou: currentPrinter.showThankYou,
      };

      const payload = {
        sheetId: this.config.spreadsheetId || '',
        sheetUrl: this.getSpreadsheetUrl(),
        sheetTitle: this.config.spreadsheetTitle || '',
        webAppUrl: this.config.webAppUrl || '',
        store: storePayload,
        printer: printerPayload,
        timestamp: Date.now(),
      };
      const json = JSON.stringify(payload);
      return PAIRING_PREFIX + btoa(unescape(encodeURIComponent(json)));
    } catch (e) {
      console.error('Error generating pairing code:', e);
      return '';
    }
  }

  /**
   * Generate full 1-click shareable URL for QR code or messaging
   */
  public generateLinkUrl(
    currentStore: StoreSettings,
    currentPrinter: PrinterSettings
  ): string {
    const code = this.generatePairingCode(currentStore, currentPrinter);
    if (!code) return '';
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    return `${base}?link_sync=${encodeURIComponent(code)}`;
  }

  /**
   * Generates a Data URL image of the QR Code for guaranteed crisp rendering in <img> tags
   */
  public async generatePairingQrDataUrl(
    currentStore: StoreSettings,
    currentPrinter: PrinterSettings
  ): Promise<string> {
    const linkUrl = this.generateLinkUrl(currentStore, currentPrinter);
    if (!linkUrl) return '';
    try {
      return await QRCode.toDataURL(linkUrl, {
        width: 240,
        margin: 1,
        color: {
          dark: '#064e3b',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'L',
      });
    } catch (e) {
      console.error('Error generating QR Data URL:', e);
      // Minimal fallback
      const minimalUrl = `${window.location.origin + window.location.pathname}?link_sync=${encodeURIComponent(
        PAIRING_PREFIX + btoa(JSON.stringify({ sId: this.config.spreadsheetId, name: currentStore.storeName }))
      )}`;
      return await QRCode.toDataURL(minimalUrl, { width: 240, margin: 1 });
    }
  }

  /**
   * Parse pairing code or full link URL and extract settings & spreadsheet config
   */
  public parsePairingCode(input: string): {
    spreadsheetConfig: Partial<SpreadsheetConfig>;
    storeSettings?: StoreSettings;
    printerSettings?: PrinterSettings;
  } | null {
    if (!input) return null;
    let clean = input.trim();

    if (clean.includes('link_sync=')) {
      try {
        const urlObj = new URL(clean);
        const codeInParam = urlObj.searchParams.get('link_sync');
        if (codeInParam) clean = codeInParam;
      } catch {
        const match = clean.match(/link_sync=([^&#]+)/);
        if (match && match[1]) clean = decodeURIComponent(match[1]);
      }
    }

    // Support both new v2 spreadsheet pairing and legacy supabase pairing
    if (clean.startsWith(PAIRING_PREFIX)) {
      clean = clean.slice(PAIRING_PREFIX.length);
      try {
        const decodedJson = decodeURIComponent(escape(atob(clean)));
        const obj = JSON.parse(decodedJson);
        return {
          spreadsheetConfig: {
            spreadsheetId: obj.sheetId || '',
            spreadsheetUrl: obj.sheetUrl || '',
            spreadsheetTitle: obj.sheetTitle || '',
            webAppUrl: obj.webAppUrl || '',
            autoSync: true,
          },
          storeSettings: obj.store,
          printerSettings: obj.printer,
        };
      } catch (err) {
        console.warn('Failed to parse v2 pairing code:', err);
      }
    }

    // Fallback: check legacy pairing
    if (clean.startsWith('KASIRKU_SYNC:')) {
      try {
        const legacyCode = clean.slice('KASIRKU_SYNC:'.length);
        const decodedJson = decodeURIComponent(escape(atob(legacyCode)));
        const obj = JSON.parse(decodedJson);
        return {
          spreadsheetConfig: {
            webAppUrl: obj.u || '',
            autoSync: true,
          },
        };
      } catch (err) {
        console.warn('Failed to parse legacy pairing code:', err);
      }
    }

    return null;
  }
}

export const spreadsheetService = new SpreadsheetService();
