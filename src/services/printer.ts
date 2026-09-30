import { PrinterSettings, Sale, StoreSettings } from '../types';
import { formatDate, formatDateTime, formatNumber, formatRupiah } from '../utils/format';

export interface BluetoothDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
}

export type BluetoothListener = (status: {
  connected: boolean;
  deviceName?: string | null;
  error?: string | null;
}) => void;

// Broad list of 16-bit and 128-bit UUIDs used by thermal ESC/POS printers (Panda, Eppos, Iware, Zywell, Goojprt, MPT-II, RPP02N, ZJiang, etc.)
const KNOWN_PRINTER_SERVICES = [
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 BLE (very common in cheap thermal printers)
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard ESC/POS Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Common Chinese Portable Printer
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  '0000ae00-0000-1000-8000-00805f9b34fb', // AE00 Thermal Printer
  '0000ff00-0000-1000-8000-00805f9b34fb', // FF00 Thermal Printer
  '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / Ali Printer Protocol
  '0000af30-0000-1000-8000-00805f9b34fb', // AF30 Printer
  '0000fff0-0000-1000-8000-00805f9b34fb', // FFF0 Generic UART
  '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
  '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
  '00001101-0000-1000-8000-00805f9b34fb', // Serial Port Profile (SPP)
];

class BluetoothPrinterService {
  private device: any = null;
  private server: any = null;
  private characteristic: any = null;
  private isConnecting = false;
  private listeners: Set<BluetoothListener> = new Set();
  private lastKnownDeviceName: string | null = null;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public addListener(listener: BluetoothListener): () => void {
    this.listeners.add(listener);
    // Initial call
    listener({
      connected: this.isConnected(),
      deviceName: this.getConnectedDeviceName(),
    });
    return () => this.listeners.delete(listener);
  }

  private notify(data: { connected: boolean; deviceName?: string | null; error?: string | null }) {
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (e) {
        console.error('Error in printer listener:', e);
      }
    });
  }

  /**
   * Request Bluetooth device via Web Bluetooth picker and connect GATT
   */
  public async requestAndConnect(): Promise<BluetoothDeviceInfo> {
    if (!this.isSupported()) {
      const err =
        'Web Bluetooth tidak didukung pada browser ini. Pastikan Anda menggunakan Google Chrome pada Android, Chrome OS, atau Windows/Mac dengan Bluetooth aktif.';
      this.notify({ connected: false, error: err });
      throw new Error(err);
    }

    try {
      this.isConnecting = true;
      this.notify({ connected: false, deviceName: 'Menghubungkan...' });

      // Request device with all potential thermal printer services
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: KNOWN_PRINTER_SERVICES,
      });

      this.device = device;
      this.lastKnownDeviceName = device.name || 'Printer Thermal';

      // Connect GATT server
      return await this.connectGatt(device);
    } catch (err: any) {
      this.characteristic = null;
      this.server = null;
      const errMsg = err?.name === 'NotFoundError' ? 'Pemilihan printer dibatalkan' : err.message || 'Gagal koneksi Bluetooth';
      this.notify({ connected: false, error: errMsg });
      throw new Error(errMsg);
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Connect to GATT and discover write characteristic
   */
  private async connectGatt(device: any): Promise<BluetoothDeviceInfo> {
    device.addEventListener('gattserverdisconnected', () => {
      console.warn('Bluetooth printer disconnected event received.');
      this.characteristic = null;
      this.server = null;
      this.notify({
        connected: false,
        deviceName: this.lastKnownDeviceName,
        error: 'Koneksi printer terputus',
      });
    });

    // Connect with 1 retry if busy
    let server: any = null;
    try {
      server = await device.gatt.connect();
    } catch {
      // Small pause then retry once
      await new Promise((r) => setTimeout(r, 500));
      server = await device.gatt.connect();
    }
    this.server = server;

    // Discover writable characteristic
    let foundChar: any = null;

    // Method 1: Try getPrimaryServices()
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              foundChar = char;
              break;
            }
          }
        } catch {
          // ignore characteristic fetch errors on restricted services
        }
        if (foundChar) break;
      }
    } catch {
      // If getPrimaryServices() failed, fallback to querying known services individually
    }

    // Method 2: If not found, iterate explicitly through KNOWN_PRINTER_SERVICES
    if (!foundChar) {
      for (const uuid of KNOWN_PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(uuid);
          if (service) {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
              if (char.properties.write || char.properties.writeWithoutResponse) {
                foundChar = char;
                break;
              }
            }
          }
        } catch {
          // service not offered by this device, proceed to next
        }
        if (foundChar) break;
      }
    }

    if (!foundChar) {
      await device.gatt.disconnect();
      this.server = null;
      this.characteristic = null;
      const err =
        'Printer terhubung, namun jalur transfer data (write characteristic) tidak ditemukan. Pastikan perangkat adalah Printer Thermal ESC/POS dan Bluetooth telah aktif.';
      this.notify({ connected: false, error: err });
      throw new Error(err);
    }

    this.characteristic = foundChar;
    const devName = device.name || this.lastKnownDeviceName || 'Thermal BT Printer';

    this.notify({
      connected: true,
      deviceName: devName,
    });

    return {
      id: device.id,
      name: devName,
      connected: true,
    };
  }

  /**
   * Try reconnecting to the previously selected Bluetooth device without opening the browser picker
   */
  public async reconnect(): Promise<BluetoothDeviceInfo> {
    if (this.isConnected()) {
      return {
        id: this.device.id,
        name: this.getConnectedDeviceName() || 'Thermal Printer',
        connected: true,
      };
    }

    if (this.device) {
      return await this.connectGatt(this.device);
    }

    // Check if navigator.bluetooth.getDevices is supported (Chrome 85+)
    if (this.isSupported() && (navigator as any).bluetooth.getDevices) {
      try {
        const devices = await (navigator as any).bluetooth.getDevices();
        if (devices && devices.length > 0) {
          const lastDevice = devices[0];
          this.device = lastDevice;
          this.lastKnownDeviceName = lastDevice.name || 'Thermal BT Printer';
          return await this.connectGatt(lastDevice);
        }
      } catch (e) {
        console.warn('getDevices reconnect failed:', e);
      }
    }

    // Otherwise prompt the user to connect
    return await this.requestAndConnect();
  }

  public async disconnect(): Promise<void> {
    if (this.device && this.device.gatt?.connected) {
      try {
        await this.device.gatt.disconnect();
      } catch (e) {
        console.warn('Disconnect error:', e);
      }
    }
    this.server = null;
    this.characteristic = null;
    this.notify({
      connected: false,
      deviceName: this.lastKnownDeviceName,
    });
  }

  public isConnected(): boolean {
    return !!(this.server && this.server.connected && this.characteristic);
  }

  public getConnectedDeviceName(): string | null {
    return this.device?.name || this.lastKnownDeviceName || null;
  }

  /**
   * Send raw byte buffer to Bluetooth thermal printer in optimized chunks
   */
  public async sendRawBytes(bytes: Uint8Array): Promise<void> {
    if (!this.isConnected() || !this.characteristic) {
      // Try auto-reconnect once if device handle exists
      if (this.device) {
        try {
          await this.connectGatt(this.device);
        } catch {
          throw new Error('Printer Bluetooth belum terhubung. Silakan hubungkan kembali.');
        }
      } else {
        throw new Error('Printer Bluetooth belum terhubung. Silakan hubungkan printer.');
      }
    }

    if (!this.characteristic) {
      throw new Error('Jalur data printer Bluetooth tidak tersedia.');
    }

    // Thermal printers have small FIFO buffers (usually 64-128 bytes).
    // Using 64 bytes with 25ms delay ensures no corrupted or dropped bytes.
    const CHUNK_SIZE = 64;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      try {
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.characteristic.writeValue(chunk);
        }
      } catch (err: any) {
        // Retry once if buffer was busy
        await new Promise((r) => setTimeout(r, 60));
        if (this.characteristic.properties.writeWithoutResponse) {
          await this.characteristic.writeValueWithoutResponse(chunk);
        } else {
          await this.characteristic.writeValue(chunk);
        }
      }
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  /**
   * Convert image to ESC/POS monochrome raster bitmap
   * Automatically crops top and bottom whitespace for tight spacing with the header
   */
  public async convertImageToEscPosRaster(
    imageSrc: string,
    paperSize: '58mm' | '80mm',
    logoSize: 'small' | 'medium' | 'large' = 'medium'
  ): Promise<number[]> {
    if (typeof document === 'undefined') return [];
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
          try {
            const baseDots = paperSize === '80mm' ? 384 : 288;
            let targetWidth =
              logoSize === 'small'
                ? Math.round(baseDots * 0.35)
                : logoSize === 'large'
                ? Math.round(baseDots * 0.58)
                : Math.round(baseDots * 0.45);

            // Width in dots must be a multiple of 8
            const widthBytes = Math.ceil(targetWidth / 8);
            targetWidth = widthBytes * 8;
            const scale = targetWidth / img.width;
            let targetHeight = Math.round(img.height * scale);
            if (targetHeight <= 0) targetHeight = 1;

            // Constrain maximum logo height so it does not create a giant gap above the header
            const maxHeight = paperSize === '80mm' ? 84 : 54;
            if (targetHeight > maxHeight) {
              const hScale = maxHeight / targetHeight;
              const scaledWidth = Math.ceil((targetWidth * hScale) / 8) * 8;
              targetWidth = Math.max(8, scaledWidth);
              targetHeight = maxHeight;
            }

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve([]);
              return;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, targetWidth, targetHeight);
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            const data = imgData.data;

            // Find top and bottom boundaries that actually have dark pixels
            // (eliminates empty vertical margins above & below the logo)
            let minY = -1;
            let maxY = -1;
            for (let y = 0; y < targetHeight; y++) {
              let hasDark = false;
              for (let x = 0; x < targetWidth; x++) {
                const idx = (y * targetWidth + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const bVal = data[idx + 2];
                const alpha = data[idx + 3];
                if (alpha > 40) {
                  const lum = 0.299 * r + 0.587 * g + 0.114 * bVal;
                  if (lum < 185) {
                    hasDark = true;
                    break;
                  }
                }
              }
              if (hasDark) {
                if (minY === -1) minY = y;
                maxY = y;
              }
            }

            if (minY === -1 || maxY === -1 || maxY < minY) {
              resolve([]);
              return;
            }

            const croppedHeight = maxY - minY + 1;

            const ESC = 0x1b;
            const GS = 0x1d;
            const rasterBytes: number[] = [];

            // Align Center
            rasterBytes.push(ESC, 0x61, 1);

            // GS v 0 0
            rasterBytes.push(GS, 0x76, 0x30, 0x00);
            rasterBytes.push((targetWidth / 8) & 0xff);
            rasterBytes.push(((targetWidth / 8) >> 8) & 0xff);
            rasterBytes.push(croppedHeight & 0xff);
            rasterBytes.push((croppedHeight >> 8) & 0xff);

            const wBytes = targetWidth / 8;
            for (let y = minY; y <= maxY; y++) {
              for (let x = 0; x < wBytes; x++) {
                let byteVal = 0;
                for (let b = 0; b < 8; b++) {
                  const pixelX = x * 8 + b;
                  if (pixelX < targetWidth) {
                    const idx = (y * targetWidth + pixelX) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const bVal = data[idx + 2];
                    const alpha = data[idx + 3];

                    if (alpha > 40) {
                      const lum = 0.299 * r + 0.587 * g + 0.114 * bVal;
                      if (lum < 185) {
                        byteVal |= 1 << (7 - b);
                      }
                    }
                  }
                }
                rasterBytes.push(byteVal);
              }
            }

            // Do not add 0x0a here: GS v 0 already advances print head to next line.
            resolve(rasterBytes);
          } catch {
            resolve([]);
          }
        };
        img.onerror = () => resolve([]);
        img.src = imageSrc;
      } catch {
        resolve([]);
      }
    });
  }

  /**
   * Generates ESC/POS byte sequence for thermal receipt
   */
  public async generateEscPosReceipt(
    sale: Sale,
    store: StoreSettings,
    printer: PrinterSettings
  ): Promise<Uint8Array> {
    const is80mm = printer.paperSize === '80mm';
    // 31 columns for 58mm ensures 100% safety against line overflow and number cutoff
    const lineWidth = is80mm ? 48 : 31;

    const ESC = 0x1b;
    const GS = 0x1d;

    const bytes: number[] = [];

    // Initialize printer & set code page 0 (PC437 Standard ASCII) to prevent Katakana/Chinese 'ta' characters
    bytes.push(ESC, 0x40); // ESC @ (Reset)
    bytes.push(ESC, 0x74, 0x00); // ESC t 0 (Character code table 0 = PC437)

    // Set compact line spacing for header (16 dots = ~2mm)
    bytes.push(ESC, 0x33, 16);

    // 1. Thermal Logo Raster (if enabled and present)
    if (printer.showLogo && store.logo) {
      try {
        const logoBytes = await this.convertImageToEscPosRaster(
          store.logo,
          printer.paperSize,
          printer.logoSize
        );
        for (const b of logoBytes) bytes.push(b);
      } catch (err) {
        console.warn('Could not render logo for Bluetooth thermal printer:', err);
      }
    }

    // Pure ASCII sanitizer: converts Unicode non-breaking spaces and removes characters that cause 'ta' or symbols
    const sanitizeText = (str: string): string => {
      return str
        .replace(/[\u00A0\u202F\u2007\u200B]/g, ' ')
        .replace(/[—–]/g, '-')
        .replace(/[“”""]/g, '"')
        .replace(/[‘’'']/g, "'")
        .replace(/[•·]/g, '*')
        .replace(/[^\x20-\x7E\n\r]/g, '');
    };

    const encoder = new TextEncoder();
    const writeText = (text: string) => {
      const clean = sanitizeText(text);
      const encoded = encoder.encode(clean);
      for (const b of encoded) bytes.push(b);
    };

    const writeLine = (text = '') => {
      writeText(text + '\n');
    };

    const alignCenter = () => bytes.push(ESC, 0x61, 1);
    const alignLeft = () => bytes.push(ESC, 0x61, 0);
    const boldOn = () => bytes.push(ESC, 0x45, 1);
    const boldOff = () => bytes.push(ESC, 0x45, 0);
    const doubleHeight = () => bytes.push(GS, 0x21, 0x01); // Double height only (compact & readable without massive jump)
    const normalSize = () => bytes.push(GS, 0x21, 0x00);

    // Header Store Name - tight spacing with logo
    alignCenter();
    boldOn();
    doubleHeight();
    writeLine(store.storeName || 'KASIRKU POS');
    normalSize();
    boldOff();

    // Restore standard readable line spacing for receipt body
    bytes.push(ESC, 0x32); // ESC 2 (1/6 inch)

    if (store.slogan) {
      writeLine(store.slogan);
    }
    if (printer.showAddress && store.address) {
      writeLine(store.address);
      if (store.city) writeLine(store.city + (store.province ? `, ${store.province}` : ''));
    }
    if (printer.showPhone && store.phone) {
      writeLine(`Telp: ${store.phone}`);
    }

    const separator = '='.repeat(lineWidth);
    const dashSeparator = '-'.repeat(lineWidth);

    writeLine(separator);

    // Metadata
    alignLeft();
    writeLine(`No. Nota : ${sale.invoiceNumber}`);
    writeLine(`Waktu    : ${formatDate(sale.date)} ${sale.time || ''}`);
    writeLine(`Kasir    : ${sale.cashierName}`);
    if (sale.orderType) {
      const orderLabel =
        sale.orderType === 'dine_in'
          ? 'DINE IN (Makan di Tempat)'
          : sale.orderType === 'take_away'
          ? 'TAKE AWAY (Bungkus)'
          : 'DELIVERY (Ojol/Kurir)';
      writeLine(`Pesanan  : ${orderLabel}`);
    }
    if (sale.tableNumber) {
      boldOn();
      writeLine(`Meja     : ${sale.tableNumber}`);
      boldOff();
    }
    // FITUR NAMA PELANGGAN PADA NOTA
    if (printer.showCustomerName !== false && sale.customerName) {
      boldOn();
      writeLine(`Pelanggan: ${sale.customerName}`);
      boldOff();
    }
    if (sale.isTester) {
      boldOn();
      writeLine(`*** TESTER / SAMPLE GRATIS ***`);
      if (sale.testerReason) writeLine(`Alasan   : ${sale.testerReason}`);
      boldOff();
    }
    writeLine(`Bayar    : ${sale.isTester ? 'TESTER / GRATIS' : sale.paymentMethod.toUpperCase()}`);

    writeLine(dashSeparator);

    // Items
    sale.items?.forEach((item) => {
      const itemTitle = item.isTester ? `[TESTER] ${item.productName}` : item.productName;
      writeLine(itemTitle);
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        item.selectedAddons.forEach((ad) => {
          writeLine(`   + ${ad.name} (${formatRupiah(ad.price)})`);
        });
      }
      // Unit price formatted without extra 'Rp' prefix to keep line within 31 chars safely
      const qtyPrice = `  ${item.quantity} x ${formatNumber(item.unitSellPrice)}`;
      const totalStr = formatRupiah(item.total);
      const spaces = Math.max(1, lineWidth - qtyPrice.length - totalStr.length);
      writeLine(qtyPrice + ' '.repeat(spaces) + totalStr);
      if (item.discount > 0) {
        writeLine(`   (Diskon Item: -${formatRupiah(item.discount)})`);
      }
      if (item.notes) {
        writeLine(`   * Catatan: ${item.notes}`);
      }
    });

    writeLine(dashSeparator);

    // Totals - Using compact standard labels ('TOTAL', 'Bayar', 'Kembalian') so amounts are never cut off
    const printRow = (label: string, value: string, bold = false) => {
      if (bold) boldOn();
      const spaces = Math.max(1, lineWidth - label.length - value.length);
      writeLine(label + ' '.repeat(spaces) + value);
      if (bold) boldOff();
    };

    printRow('Subtotal', formatRupiah(sale.subtotal));
    if (sale.discount > 0) printRow('Diskon', `-${formatRupiah(sale.discount)}`);
    if (sale.tax > 0) printRow(`Pajak (${sale.taxRate ?? store.taxRate}%)`, formatRupiah(sale.tax));
    if (sale.rounding !== 0) printRow('Pembulatan', formatRupiah(sale.rounding));

    writeLine(dashSeparator);
    printRow('TOTAL', formatRupiah(sale.total), true);
    printRow('Bayar', formatRupiah(sale.cashReceived));
    printRow('Kembalian', formatRupiah(sale.changeAmount), true);

    if (printer.showHpp && sale.totalHpp) {
      writeLine(dashSeparator);
      printRow('Total HPP', formatRupiah(sale.totalHpp));
      printRow('Estimasi Margin', `${sale.profitMargin}%`);
    }

    // FITUR PASSWORD WIFI PADA NOTA
    if (printer.showWifi !== false && (store.wifiName || store.wifiPassword)) {
      writeLine(dashSeparator);
      alignCenter();
      boldOn();
      writeLine('*** WIFI GRATIS PENGUNJUNG ***');
      boldOff();
      if (store.wifiName) {
        writeLine(`WiFi SSID: ${store.wifiName}`);
      }
      if (store.wifiPassword) {
        boldOn();
        writeLine(`Password : ${store.wifiPassword}`);
        boldOff();
      }
    }

    writeLine(separator);

    // Footer
    alignCenter();
    if (printer.showThankYou) {
      boldOn();
      writeLine('TERIMA KASIH ATAS KUNJUNGANNYA');
      boldOff();
      writeLine('Silakan Datang Kembali');
    }
    if (printer.showFooter && store.receiptFooter) {
      writeLine(store.receiptFooter);
    }

    writeLine('\n\n\n');

    // Auto Cut Paper if enabled
    if (printer.autoCut) {
      bytes.push(GS, 0x56, 0x41, 0x00);
    }

    return new Uint8Array(bytes);
  }

  /**
   * Generates ESC/POS byte sequence specifically for Kitchen Order Ticket (KOT / Bar Tiket)
   */
  public generateKitchenOrderTicketEscPos(
    sale: Sale,
    store: StoreSettings,
    printer: PrinterSettings
  ): Uint8Array {
    const is80mm = printer.paperSize === '80mm';
    const lineWidth = is80mm ? 48 : 31;

    const ESC = 0x1b;
    const GS = 0x1d;
    const bytes: number[] = [];

    bytes.push(ESC, 0x40);
    bytes.push(ESC, 0x74, 0x00);

    const sanitizeText = (str: string): string => {
      return str
        .replace(/[\u00A0\u202F\u2007\u200B]/g, ' ')
        .replace(/[—–]/g, '-')
        .replace(/[“”""]/g, '"')
        .replace(/[‘’'']/g, "'")
        .replace(/[•·]/g, '*')
        .replace(/[^\x20-\x7E\n\r]/g, '');
    };

    const encoder = new TextEncoder();
    const writeText = (text: string) => {
      const clean = sanitizeText(text);
      const encoded = encoder.encode(clean);
      for (const b of encoded) bytes.push(b);
    };

    const writeLine = (text = '') => {
      writeText(text + '\n');
    };

    const alignCenter = () => bytes.push(ESC, 0x61, 1);
    const alignLeft = () => bytes.push(ESC, 0x61, 0);
    const boldOn = () => bytes.push(ESC, 0x45, 1);
    const boldOff = () => bytes.push(ESC, 0x45, 0);
    const doubleSize = () => bytes.push(GS, 0x21, 0x11);
    const normalSize = () => bytes.push(GS, 0x21, 0x00);

    // KOT Header
    alignCenter();
    boldOn();
    doubleSize();
    writeLine('*** TIKET DAPUR / BAR ***');
    normalSize();
    boldOff();
    writeLine(store.storeName || 'CAFE & KITCHEN');

    const dashSeparator = '-'.repeat(lineWidth);
    writeLine(dashSeparator);

    alignLeft();
    boldOn();
    if (sale.tableNumber) {
      writeLine(`>>> MEJA : ${sale.tableNumber} <<<`);
    } else {
      writeLine(`>>> TIPE : ${sale.orderType?.toUpperCase() || 'TAKE AWAY'} <<<`);
    }
    boldOff();

    writeLine(`No. Nota  : ${sale.invoiceNumber}`);
    writeLine(`Waktu     : ${sale.time || ''} (${formatDate(sale.date)})`);
    writeLine(`Kasir     : ${sale.cashierName}`);
    if (sale.customerName) {
      boldOn();
      writeLine(`Pelanggan : ${sale.customerName}`);
      boldOff();
    }

    writeLine(dashSeparator);

    // Items with large bold text for kitchen
    sale.items?.forEach((item) => {
      boldOn();
      writeLine(`[ ] ${item.quantity}x ${item.productName}`);
      boldOff();
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        item.selectedAddons.forEach((ad) => {
          writeLine(`    + ${ad.name}`);
        });
      }
      if (item.notes) {
        boldOn();
        writeLine(`    >> CATATAN: ${item.notes}`);
        boldOff();
      }
      writeLine('');
    });

    writeLine(dashSeparator);
    alignCenter();
    writeLine('-- HARAP SELESAIKAN TEPAT WAKTU --');
    writeLine('\n\n\n');

    if (printer.autoCut) {
      bytes.push(GS, 0x56, 0x41, 0x00);
    }

    return new Uint8Array(bytes);
  }

  /**
   * Run a test print on the connected printer
   */
  public async testPrint(store: StoreSettings, printer: PrinterSettings): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Printer belum terhubung. Silakan hubungkan printer terlebih dahulu.');
    }

    const testSale: Sale = {
      id: 'test-sale',
      invoiceNumber: 'TEST-PRINT-001',
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 8),
      cashierId: 'test',
      cashierName: 'Admin POS',
      customerName: 'Bpk. Budi Santoso (Test)',
      subtotal: 35000,
      discount: 0,
      tax: 0,
      serviceFee: 0,
      rounding: 0,
      total: 35000,
      paymentMethod: 'cash',
      cashReceived: 50000,
      changeAmount: 15000,
      totalHpp: 25000,
      totalProfit: 10000,
      profitMargin: 28.5,
      status: 'completed',
      createdAt: new Date().toISOString(),
      items: [
        {
          id: 'item-1',
          saleId: 'test-sale',
          productId: 'p1',
          productName: 'Kopi Susu Gula Aren 250ml',
          barcode: '123456',
          unit: 'cup',
          quantity: 2,
          unitBuyPrice: 8000,
          unitHpp: 8500,
          unitSellPrice: 15000,
          subtotal: 30000,
          discount: 0,
          total: 30000,
          profit: 13000,
        },
        {
          id: 'item-2',
          saleId: 'test-sale',
          productId: 'p2',
          productName: 'Donat Cokelat Meses',
          barcode: '123457',
          unit: 'pcs',
          quantity: 1,
          unitBuyPrice: 3500,
          unitHpp: 4000,
          unitSellPrice: 5000,
          subtotal: 5000,
          discount: 0,
          total: 5000,
          profit: 1000,
        },
      ],
    };

    const bytes = await this.generateEscPosReceipt(testSale, store, printer);
    await this.sendRawBytes(bytes);
  }

  /**
   * Generate ESC/POS commands for printing daily, weekly, monthly, or custom date financial reports
   */
  public async generateEscPosFinancialReport(
    report: {
      title: string;
      periodLabel: string;
      totalSales: number;
      txCount: number;
      totalHpp: number;
      grossProfit: number;
      totalExpenses: number;
      netProfit: number;
      paymentMethods: Record<string, number>;
      topProducts?: { name: string; qty: number; total: number }[];
    },
    store: StoreSettings,
    printer: PrinterSettings
  ): Promise<Uint8Array> {
    const is80 = printer.paperSize === '80mm';
    const lineWidth = is80 ? 42 : 31;
    const divider = '-'.repeat(lineWidth);
    const doubleDivider = '='.repeat(lineWidth);

    const buffer: number[] = [];
    const encoder = new TextEncoder();

    const write = (...bytes: number[]) => {
      buffer.push(...bytes);
    };

    const sanitizeText = (txt: string) => {
      return (txt || '')
        .replace(/[\u00a0\u202f]/g, ' ')
        .replace(/[^\x20-\x7E\n\r]/g, '')
        .trim();
    };

    const writeText = (txt: string) => {
      const sanitized = sanitizeText(txt);
      const encoded = encoder.encode(sanitized);
      for (let i = 0; i < encoded.length; i++) {
        buffer.push(encoded[i]);
      }
    };

    const writeLine = (txt = '') => {
      writeText(txt);
      write(0x0a);
    };

    const printRow = (label: string, value: string) => {
      const cleanLabel = sanitizeText(label);
      const cleanVal = sanitizeText(value);
      const spaceCount = Math.max(1, lineWidth - cleanLabel.length - cleanVal.length);
      writeLine(cleanLabel + ' '.repeat(spaceCount) + cleanVal);
    };

    // ESC @ - Initialize
    write(0x1b, 0x40);

    // ESC t 0 - Select CP437
    write(0x1b, 0x74, 0x00);

    // Header Center
    write(0x1b, 0x61, 0x01);
    write(0x1b, 0x45, 0x01); // Bold ON
    writeLine(store.storeName.toUpperCase());
    write(0x1b, 0x45, 0x00); // Bold OFF

    if (store.address) {
      writeLine(store.address);
    }
    if (store.phone) {
      writeLine(`Telp: ${store.phone}`);
    }

    writeLine(doubleDivider);

    // Report Title
    write(0x1b, 0x45, 0x01); // Bold ON
    writeLine(report.title.toUpperCase());
    write(0x1b, 0x45, 0x00); // Bold OFF
    writeLine(`Periode: ${report.periodLabel}`);
    writeLine(`Waktu Cetak: ${formatDateTime(new Date().toISOString())}`);
    writeLine(divider);

    // Left Align for Financials
    write(0x1b, 0x61, 0x00);

    printRow('Total Transaksi', `${report.txCount} Nota`);
    write(0x1b, 0x45, 0x01);
    printRow('TOTAL OMZET', formatRupiah(report.totalSales));
    write(0x1b, 0x45, 0x00);
    printRow('Modal (HPP)', formatRupiah(report.totalHpp));
    printRow('Laba Kotor', formatRupiah(report.grossProfit));
    printRow('Biaya Operasional', formatRupiah(report.totalExpenses));
    writeLine(divider);

    write(0x1b, 0x45, 0x01);
    printRow('LABA BERSIH', formatRupiah(report.netProfit));
    write(0x1b, 0x45, 0x00);
    writeLine(divider);

    // Payment Methods
    write(0x1b, 0x45, 0x01);
    writeLine('METODE PEMBAYARAN:');
    write(0x1b, 0x45, 0x00);
    if (report.paymentMethods.cash) printRow('  Tunai (Cash)', formatRupiah(report.paymentMethods.cash));
    if (report.paymentMethods.qris) printRow('  QRIS', formatRupiah(report.paymentMethods.qris));
    if (report.paymentMethods.transfer) printRow('  Transfer Bank', formatRupiah(report.paymentMethods.transfer));
    const cardAmt = (report.paymentMethods.debit || 0) + (report.paymentMethods.credit || 0);
    if (cardAmt) printRow('  Debit / Kredit', formatRupiah(cardAmt));
    if (report.paymentMethods.ewallet) printRow('  E-Wallet', formatRupiah(report.paymentMethods.ewallet));

    // Top Products
    if (report.topProducts && report.topProducts.length > 0) {
      writeLine(divider);
      write(0x1b, 0x45, 0x01);
      writeLine('PRODUK TERLARIS:');
      write(0x1b, 0x45, 0x00);
      report.topProducts.slice(0, 5).forEach((p, idx) => {
        printRow(`${idx + 1}. ${p.name.slice(0, 18)}`, `${p.qty}x`);
      });
    }

    // Data Kesimpulan Bisnis
    writeLine(divider);
    write(0x1b, 0x45, 0x01);
    writeLine('DATA KESIMPULAN:');
    write(0x1b, 0x45, 0x00);
    const grossMargin = report.totalSales > 0 ? ((report.grossProfit / report.totalSales) * 100).toFixed(1) + '%' : '0%';
    const netMargin = report.totalSales > 0 ? ((report.netProfit / report.totalSales) * 100).toFixed(1) + '%' : '0%';
    const aov = report.txCount > 0 ? Math.round(report.totalSales / report.txCount) : 0;
    printRow('  Margin Kotor', grossMargin);
    printRow('  Margin Bersih', netMargin);
    printRow('  Rata-rata (AOV)', formatRupiah(aov));
    printRow('  Status Finansial', report.netProfit > 0 ? 'PROFITABEL' : 'EVALUASI');

    writeLine(doubleDivider);

    // Center Footer
    write(0x1b, 0x61, 0x01);
    writeLine('--- AKHIR LAPORAN ---');
    writeLine('KasirKu POS System');

    // Feed lines & optional cut
    const feedLines = (printer as any).feedLines || 4;
    for (let i = 0; i < feedLines; i++) {
      write(0x0a);
    }
    if (printer.autoCut) {
      write(0x1d, 0x56, 0x41, 0x10);
    }

    return new Uint8Array(buffer);
  }
}

export const printerService = new BluetoothPrinterService();
