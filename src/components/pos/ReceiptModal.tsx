import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  CheckCircle2,
  Copy,
  Download,
  MessageSquare,
  Printer,
  Share2,
  Wifi,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { printerService } from '../../services/printer';
import { PrinterSettings, Sale, StoreSettings } from '../../types';
import { formatDate, formatDateTime, formatNumber, formatRupiah } from '../../utils/format';

interface ReceiptModalProps {
  sale: Sale;
  store: StoreSettings;
  printer: PrinterSettings;
  isOpen: boolean;
  onClose: () => void;
  onNewTransaction?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  store,
  printer,
  isOpen,
  onClose,
  onNewTransaction,
}) => {
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [btConnected, setBtConnected] = useState(printerService.isConnected());
  const [btDeviceName, setBtDeviceName] = useState<string | null>(printerService.getConnectedDeviceName());
  const [isConnectingBt, setIsConnectingBt] = useState(false);

  useEffect(() => {
    const unsubscribe = printerService.addListener((status) => {
      setBtConnected(status.connected);
      if (status.deviceName) setBtDeviceName(status.deviceName);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const is80mm = printer.paperSize === '80mm';

  const handleConnectBt = async () => {
    try {
      setIsConnectingBt(true);
      setPrintStatus('Mencari printer Bluetooth...');
      const dev = await printerService.requestAndConnect();
      setBtConnected(true);
      setBtDeviceName(dev.name);
      setPrintStatus(`Terhubung ke ${dev.name}!`);
      setTimeout(() => setPrintStatus(null), 3000);
    } catch (err: any) {
      setPrintStatus(`Koneksi Bluetooth gagal: ${err.message || 'Dibatalkan'}`);
      setTimeout(() => setPrintStatus(null), 4000);
    } finally {
      setIsConnectingBt(false);
    }
  };

  const handlePrint = async () => {
    try {
      if (printerService.isConnected()) {
        setPrintStatus('Mengirim data ke Printer Bluetooth...');
        const bytes = await printerService.generateEscPosReceipt(sale, store, printer);
        await printerService.sendRawBytes(bytes);
        setPrintStatus('Berhasil dicetak via Bluetooth!');
        setTimeout(() => setPrintStatus(null), 3000);
      } else {
        // Fallback to browser print which prints the #thermal-receipt-printable
        window.print();
      }
    } catch (err: any) {
      console.error(err);
      setPrintStatus('Gagal cetak Bluetooth (' + (err.message || 'Error') + '), membuka dialog cetak browser...');
      setTimeout(() => {
        setPrintStatus(null);
        window.print();
      }, 1000);
    }
  };

  const handlePrintKitchenTicket = async () => {
    try {
      if (printerService.isConnected()) {
        setPrintStatus('Mengirim Tiket Dapur/Bar ke Printer Bluetooth...');
        const bytes = printerService.generateKitchenOrderTicketEscPos(sale, store, printer);
        await printerService.sendRawBytes(bytes);
        setPrintStatus('Tiket Dapur/Bar berhasil dicetak!');
        setTimeout(() => setPrintStatus(null), 3000);
      } else {
        window.print();
      }
    } catch (err: any) {
      console.error(err);
      setPrintStatus('Gagal cetak tiket: ' + (err.message || 'Error'));
    }
  };

  const generateReceiptText = (): string => {
    let txt = `*${store.storeName.toUpperCase()}*\n`;
    if (store.slogan) txt += `${store.slogan}\n`;
    if (store.address) txt += `${store.address}\n`;
    if (store.phone) txt += `WA/Telp: ${store.phone}\n`;
    txt += `--------------------------------\n`;
    txt += `No. Nota : ${sale.invoiceNumber}\n`;
    txt += `Tanggal  : ${formatDate(sale.date)} ${sale.time || ''}\n`;
    txt += `Kasir    : ${sale.cashierName}\n`;
    if (sale.orderType) {
      const orderLabel =
        sale.orderType === 'dine_in'
          ? 'DINE IN (Makan di Tempat)'
          : sale.orderType === 'take_away'
          ? 'TAKE AWAY (Bungkus)'
          : 'DELIVERY (Ojol/Kurir)';
      txt += `Pesanan  : ${orderLabel}\n`;
    }
    if (sale.tableNumber) {
      txt += `Meja     : ${sale.tableNumber}\n`;
    }
    if (sale.customerName) {
      txt += `Pelanggan: ${sale.customerName}\n`;
    }
    if (sale.isTester) {
      txt += `*** TESTER / SAMPLE GRATIS ***\n`;
      if (sale.testerReason) txt += `Alasan   : ${sale.testerReason}\n`;
    }
    txt += `Metode   : ${sale.isTester ? 'TESTER / GRATIS' : sale.paymentMethod.toUpperCase()}\n`;
    txt += `--------------------------------\n`;

    sale.items?.forEach((item) => {
      const itemTitle = item.isTester ? `[TESTER] ${item.productName}` : item.productName;
      txt += `${itemTitle}\n`;
      txt += `  ${item.quantity} x ${formatRupiah(item.unitSellPrice)} = ${formatRupiah(item.total)}\n`;
      if (item.selectedAddons && item.selectedAddons.length > 0) {
        item.selectedAddons.forEach((ad) => {
          txt += `   + ${ad.name} (${formatRupiah(ad.price)})\n`;
        });
      }
      if (item.discount > 0) {
        txt += `   (Diskon Item: -${formatRupiah(item.discount)})\n`;
      }
      if (item.notes) {
        txt += `  * Catatan: ${item.notes}\n`;
      }
    });

    txt += `--------------------------------\n`;
    txt += `Subtotal : ${formatRupiah(sale.subtotal)}\n`;
    if (sale.discount > 0) txt += `Diskon   : -${formatRupiah(sale.discount)}\n`;
    if (sale.tax > 0) txt += `Pajak (${sale.taxRate ?? store.taxRate}%) : ${formatRupiah(sale.tax)}\n`;
    if (sale.rounding !== 0) txt += `Bulat    : ${formatRupiah(sale.rounding)}\n`;
    txt += `*TOTAL    : ${formatRupiah(sale.total)}*\n`;
    txt += `Bayar    : ${formatRupiah(sale.cashReceived)}\n`;
    txt += `Kembalian: ${formatRupiah(sale.changeAmount)}\n`;

    // WIFI CAFE PADA NOTA WHATSAPP
    if (printer.showWifi !== false && (store.wifiName || store.wifiPassword)) {
      txt += `--------------------------------\n`;
      txt += `📶 *WIFI GRATIS PENGUNJUNG*\n`;
      if (store.wifiName) txt += `WiFi SSID : ${store.wifiName}\n`;
      if (store.wifiPassword) txt += `Password  : ${store.wifiPassword}\n`;
    }

    txt += `--------------------------------\n`;
    txt += `Terima kasih atas kunjungan Anda!\n`;
    if (store.receiptFooter) txt += `${store.receiptFooter}\n`;

    return txt;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateReceiptText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateReceiptText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: is80mm ? [80, 210] : [58, 190],
    });

    const receiptWidth = is80mm ? 80 : 58;
    const margin = 4;
    let y = 8;

    // Render Store Logo in PDF if enabled
    if (printer.showLogo && store.logo) {
      try {
        const logoW = is80mm ? 24 : 18;
        const logoH = is80mm ? 14 : 11;
        doc.addImage(store.logo, 'PNG', (receiptWidth - logoW) / 2, y, logoW, logoH);
        y += logoH + 2;
      } catch (e) {
        console.warn('PDF logo render skipped:', e);
      }
    }

    doc.setFont('courier', 'bold');
    doc.setFontSize(12);
    doc.text(store.storeName, receiptWidth / 2, y, { align: 'center' });
    y += 5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    if (store.slogan) {
      doc.text(store.slogan, receiptWidth / 2, y, { align: 'center' });
      y += 4;
    }
    if (store.address) {
      doc.text(store.address, receiptWidth / 2, y, { align: 'center' });
      y += 4;
    }
    if (store.phone) {
      doc.text(`Telp: ${store.phone}`, receiptWidth / 2, y, { align: 'center' });
      y += 4;
    }

    doc.text('-'.repeat(is80mm ? 42 : 30), receiptWidth / 2, y, { align: 'center' });
    y += 4;

    doc.text(`No: ${sale.invoiceNumber}`, margin, y);
    y += 3.5;
    doc.text(`Tgl: ${formatDate(sale.date)} ${sale.time || ''}`, margin, y);
    y += 3.5;
    doc.text(`Kasir: ${sale.cashierName}`, margin, y);
    y += 3.5;
    if (sale.customerName) {
      doc.setFont('courier', 'bold');
      doc.text(`Pelanggan: ${sale.customerName}`, margin, y);
      doc.setFont('courier', 'normal');
      y += 3.5;
    }
    doc.text(`Bayar: ${sale.paymentMethod.toUpperCase()}`, margin, y);
    y += 4;

    doc.text('-'.repeat(is80mm ? 42 : 30), receiptWidth / 2, y, { align: 'center' });
    y += 4;

    sale.items?.forEach((item) => {
      doc.text(item.productName.slice(0, is80mm ? 36 : 24), margin, y);
      y += 3.5;
      const detail = ` ${item.quantity}x${formatRupiah(item.unitSellPrice)}`;
      const totalStr = formatRupiah(item.total);
      doc.text(detail, margin, y);
      doc.text(totalStr, receiptWidth - margin, y, { align: 'right' });
      y += 4;
    });

    doc.text('-'.repeat(is80mm ? 42 : 30), receiptWidth / 2, y, { align: 'center' });
    y += 4;

    doc.text('Subtotal:', margin, y);
    doc.text(formatRupiah(sale.subtotal), receiptWidth - margin, y, { align: 'right' });
    y += 3.5;

    if (sale.discount > 0) {
      doc.text('Diskon:', margin, y);
      doc.text(`-${formatRupiah(sale.discount)}`, receiptWidth - margin, y, { align: 'right' });
      y += 3.5;
    }

    doc.setFont('courier', 'bold');
    doc.text('TOTAL:', margin, y);
    doc.text(formatRupiah(sale.total), receiptWidth - margin, y, { align: 'right' });
    y += 4;

    doc.setFont('courier', 'normal');
    doc.text('Bayar:', margin, y);
    doc.text(formatRupiah(sale.cashReceived), receiptWidth - margin, y, { align: 'right' });
    y += 3.5;

    doc.setFont('courier', 'bold');
    doc.text('Kembali:', margin, y);
    doc.text(formatRupiah(sale.changeAmount), receiptWidth - margin, y, { align: 'right' });
    y += 5;

    // WIFI CAFE PADA PDF
    if (printer.showWifi !== false && (store.wifiName || store.wifiPassword)) {
      doc.setFont('courier', 'bold');
      doc.text('*** WIFI GRATIS ***', receiptWidth / 2, y, { align: 'center' });
      y += 3.5;
      doc.setFont('courier', 'normal');
      if (store.wifiName) {
        doc.text(`SSID: ${store.wifiName}`, receiptWidth / 2, y, { align: 'center' });
        y += 3.5;
      }
      if (store.wifiPassword) {
        doc.text(`Password: ${store.wifiPassword}`, receiptWidth / 2, y, { align: 'center' });
        y += 4;
      }
    }

    doc.setFont('courier', 'normal');
    doc.text('Terima Kasih', receiptWidth / 2, y, { align: 'center' });
    y += 4;
    doc.text('Silakan Datang Kembali', receiptWidth / 2, y, { align: 'center' });

    doc.save(`Nota-${sale.invoiceNumber}.pdf`);
  };

  return (
    <>
      {/* Hidden printable receipt for standard print & thermal paper */}
      <div
        id="thermal-receipt-printable"
        className={`hidden print:block font-mono text-[10px] leading-tight text-black ${
          is80mm ? 'w-[72mm] max-w-[72mm]' : 'w-[48mm] max-w-[48mm]'
        }`}
      >
        {printer.showLogo && store.logo && (
          <div className="text-center mb-0.5 flex justify-center">
            <img
              src={store.logo}
              alt="Logo Toko"
              className="max-h-11 max-w-[110px] object-contain filter grayscale contrast-200 block mx-auto"
            />
          </div>
        )}
        <div className="text-center font-bold text-xs tracking-tight leading-tight mt-0 mb-0.5">{store.storeName}</div>
        {store.slogan && <div className="text-center text-[9px] mb-0.5">{store.slogan}</div>}
        {printer.showAddress && store.address && (
          <div className="text-center text-[9px] leading-tight">
            {store.address} {store.city ? `, ${store.city}` : ''}
          </div>
        )}
        {printer.showPhone && store.phone && <div className="text-center text-[9px]">Telp: {store.phone}</div>}
        <div className="border-b border-dashed border-black my-1" />
        <div className="flex justify-between text-[9px]">
          <span className="whitespace-nowrap">No: {sale.invoiceNumber}</span>
          <span className="whitespace-nowrap">{formatDate(sale.date)}</span>
        </div>
        <div className="flex justify-between text-[9px]">
          <span className="whitespace-nowrap">Kasir: {sale.cashierName}</span>
          <span className="whitespace-nowrap">{sale.time}</span>
        </div>
        {sale.orderType && (
          <div className="text-[9px]">
            Tipe: {sale.orderType === 'dine_in' ? 'DINE IN' : sale.orderType === 'take_away' ? 'TAKE AWAY' : 'DELIVERY'}
            {sale.tableNumber ? ` (${sale.tableNumber})` : ''}
          </div>
        )}
        {/* NAMA PELANGGAN PADA PRINTABLE NOTA */}
        {sale.customerName && (
          <div className="text-[9px] font-bold">
            Pelanggan: {sale.customerName}
          </div>
        )}
        <div className="text-[9px]">Bayar: {sale.paymentMethod.toUpperCase()}</div>
        <div className="border-b border-dashed border-black my-1" />

        {sale.items?.map((item) => (
          <div key={item.id} className="mb-1 text-[10px]">
            <div className="font-semibold text-black break-words leading-tight">{item.productName}</div>
            <div className="flex justify-between items-baseline pl-1 text-[9.5px]">
              <span className="whitespace-nowrap">{item.quantity} x {formatNumber(item.unitSellPrice)}</span>
              <span className="font-semibold whitespace-nowrap">{formatRupiah(item.total)}</span>
            </div>
            {item.selectedAddons && item.selectedAddons.length > 0 && (
              <div className="pl-1 text-[8.5px]">
                {item.selectedAddons.map((ad, i) => (
                  <span key={i} className="block">+ {ad.name}</span>
                ))}
              </div>
            )}
            {item.notes && <div className="pl-1 text-[8.5px] italic">* {item.notes}</div>}
          </div>
        ))}

        <div className="border-b border-dashed border-black my-1" />
        <div className="flex justify-between text-[10px]">
          <span className="whitespace-nowrap">Subtotal</span>
          <span className="whitespace-nowrap font-mono">{formatRupiah(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-[10px]">
            <span className="whitespace-nowrap">Diskon</span>
            <span className="whitespace-nowrap font-mono">-{formatRupiah(sale.discount)}</span>
          </div>
        )}
        {sale.tax > 0 && (
          <div className="flex justify-between text-[10px]">
            <span className="whitespace-nowrap">Pajak</span>
            <span className="whitespace-nowrap font-mono">{formatRupiah(sale.tax)}</span>
          </div>
        )}
        {sale.rounding !== 0 && (
          <div className="flex justify-between text-[10px]">
            <span className="whitespace-nowrap">Pembulatan</span>
            <span className="whitespace-nowrap font-mono">{formatRupiah(sale.rounding)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-xs mt-1 pt-1 border-t border-black">
          <span className="whitespace-nowrap">TOTAL</span>
          <span className="whitespace-nowrap font-mono">{formatRupiah(sale.total)}</span>
        </div>
        <div className="flex justify-between text-[10px] mt-0.5">
          <span className="whitespace-nowrap">Bayar</span>
          <span className="whitespace-nowrap font-mono">{formatRupiah(sale.cashReceived)}</span>
        </div>
        <div className="flex justify-between font-bold text-[10px]">
          <span className="whitespace-nowrap">Kembali</span>
          <span className="whitespace-nowrap font-mono">{formatRupiah(sale.changeAmount)}</span>
        </div>

        {/* WIFI CAFE PADA PRINTABLE NOTA */}
        {printer.showWifi !== false && (store.wifiName || store.wifiPassword) && (
          <>
            <div className="border-b border-dashed border-black my-1.5" />
            <div className="text-center font-bold text-[9.5px]">WIFI GRATIS</div>
            {store.wifiName && <div className="text-center text-[9px]">SSID: {store.wifiName}</div>}
            {store.wifiPassword && <div className="text-center text-[9px]">Password: {store.wifiPassword}</div>}
          </>
        )}

        {printer.showHpp && (
          <div className="text-[9px] text-gray-600 mt-1 pt-1 border-t border-dotted border-black">
            <div>HPP: {formatRupiah(sale.totalHpp)} | Margin: {sale.profitMargin}%</div>
          </div>
        )}

        <div className="border-b border-dashed border-black my-2" />
        {printer.showThankYou && (
          <div className="text-center font-bold text-[10px]">TERIMA KASIH ATAS KUNJUNGAN ANDA</div>
        )}
        {printer.showFooter && store.receiptFooter && (
          <div className="text-center text-[9px] mt-1">{store.receiptFooter}</div>
        )}
      </div>

      {/* Screen Modal Preview */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto print:hidden">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-emerald-600 px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-200" />
              <div>
                <h3 className="font-bold text-base">Transaksi Berhasil!</h3>
                <p className="text-xs text-emerald-100">Nota #{sale.invoiceNumber}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-emerald-700 text-white/80 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Bluetooth Connection Status Pill */}
          <div className="bg-slate-900 px-4 py-2 text-white flex items-center justify-between text-xs border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${btConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <Bluetooth className={`w-3.5 h-3.5 ${btConnected ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="truncate max-w-[200px]">
                {btConnected ? `Printer: ${btDeviceName || 'Terhubung'}` : 'Printer Bluetooth belum terhubung'}
              </span>
            </div>
            {!btConnected && (
              <button
                onClick={handleConnectBt}
                disabled={isConnectingBt}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isConnectingBt ? 'Menghubungkan...' : 'Hubungkan'}
              </button>
            )}
          </div>

          {/* Thermal Receipt Visual Preview */}
          <div className="p-6 bg-slate-100 flex-1 overflow-y-auto max-h-[50vh]">
            <div
              className={`mx-auto bg-white p-5 rounded-xl shadow-md border border-slate-200 font-mono text-xs text-slate-800 transition-all ${
                is80mm ? 'w-full max-w-[340px]' : 'w-full max-w-[280px]'
              }`}
            >
              {/* Paper Top Texture */}
              <div className="text-center mb-3">
                {/* Logo Struk */}
                {printer.showLogo && store.logo && (
                  <div className="flex flex-col items-center justify-center mb-1">
                    <img
                      src={store.logo}
                      alt="Logo Toko"
                      className={`object-contain ${
                        printer.logoSize === 'small'
                          ? 'h-8 max-w-[80px]'
                          : printer.logoSize === 'large'
                          ? 'h-13 max-w-[130px]'
                          : 'h-10 max-w-[100px]'
                      } ${printer.logoGrayscale !== false ? 'filter grayscale contrast-150' : ''} transition-all`}
                    />
                  </div>
                )}
                <h4 className="font-bold text-sm tracking-tight text-slate-900 mt-0.5">{store.storeName}</h4>
                {store.slogan && <p className="text-[10px] text-slate-500 mt-0.5">{store.slogan}</p>}
                {printer.showAddress && store.address && (
                  <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                    {store.address}, {store.city}
                  </p>
                )}
                {printer.showPhone && store.phone && (
                  <p className="text-[10px] text-slate-500">Telp: {store.phone}</p>
                )}
              </div>

              <div className="border-b border-dashed border-slate-300 my-2" />

              <div className="text-[11px] space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nota:</span>
                  <span className="font-semibold">{sale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal:</span>
                  <span>{formatDate(sale.date)} {sale.time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kasir:</span>
                  <span>{sale.cashierName}</span>
                </div>
                {sale.orderType && (
                  <div className="flex justify-between font-bold text-amber-700">
                    <span className="text-slate-500 font-normal">Pesanan:</span>
                    <span>
                      {sale.orderType === 'dine_in'
                        ? '🍽️ Dine In'
                        : sale.orderType === 'take_away'
                        ? '🛍️ Take Away'
                        : '🛵 Delivery'}
                    </span>
                  </div>
                )}
                {sale.tableNumber && (
                  <div className="flex justify-between font-extrabold text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">
                    <span>Meja / Area:</span>
                    <span>{sale.tableNumber}</span>
                  </div>
                )}
                {/* FITUR NAMA PELANGGAN PADA STRUK PREVIEW */}
                {sale.customerName && (
                  <div className="flex justify-between font-bold text-slate-900 bg-slate-50 px-1 py-0.5 rounded">
                    <span className="text-slate-500 font-normal">Pelanggan:</span>
                    <span>{sale.customerName}</span>
                  </div>
                )}
                {sale.isTester && (
                  <div className="bg-amber-100 text-amber-950 p-1.5 rounded text-center font-black text-xs border border-amber-300">
                    *** TESTER / SAMPLE GRATIS ***
                    {sale.testerReason && (
                      <div className="text-[10px] font-semibold text-amber-800">{sale.testerReason}</div>
                    )}
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Metode:</span>
                  <span className="uppercase font-semibold text-emerald-700">
                    {sale.isTester ? 'TESTER / GRATIS' : sale.paymentMethod}
                  </span>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-300 my-2" />

              {/* Items */}
              <div className="space-y-1.5">
                {sale.items?.map((item) => (
                  <div key={item.id}>
                    <div className="font-bold text-slate-900 truncate">
                      {item.isTester ? `[TESTER] ${item.productName}` : item.productName}
                    </div>
                    {item.selectedAddons && item.selectedAddons.length > 0 && (
                      <div className="text-[10px] text-purple-700 pl-2">
                        {item.selectedAddons.map((ad, idx) => (
                          <div key={idx}>+ {ad.name} ({formatRupiah(ad.price)})</div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600 pl-2">
                      <span>{item.quantity} x {formatRupiah(item.unitSellPrice)}</span>
                      <span className="font-semibold text-slate-800 font-mono">{formatRupiah(item.total)}</span>
                    </div>
                    {item.discount > 0 && (
                      <div className="text-[10px] text-amber-600 pl-2">
                        Diskon Item: -{formatRupiah(item.discount)}
                      </div>
                    )}
                    {item.notes && (
                      <div className="text-[10px] text-amber-700 pl-2 italic">
                        * {item.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-b border-dashed border-slate-300 my-2" />

              {/* Totals */}
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatRupiah(sale.subtotal)}</span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between text-amber-600">
                    <span>Diskon</span>
                    <span className="font-mono">-{formatRupiah(sale.discount)}</span>
                  </div>
                )}
                {sale.tax > 0 && (
                  <div className="flex justify-between">
                    <span>Pajak ({sale.taxRate ?? store.taxRate}%)</span>
                    <span className="font-mono">{formatRupiah(sale.tax)}</span>
                  </div>
                )}
                {sale.rounding !== 0 && (
                  <div className="flex justify-between">
                    <span>Pembulatan</span>
                    <span className="font-mono">{formatRupiah(sale.rounding)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-400 text-slate-900">
                  <span>TOTAL</span>
                  <span>{formatRupiah(sale.total)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>Bayar</span>
                  <span>{formatRupiah(sale.cashReceived)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-700">
                  <span>Kembalian</span>
                  <span>{formatRupiah(sale.changeAmount)}</span>
                </div>
              </div>

              {/* FITUR PASSWORD WIFI CAFE PADA PREVIEW NOTA */}
              {printer.showWifi !== false && (store.wifiName || store.wifiPassword) && (
                <div className="my-2.5 p-2 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center">
                  <div className="flex items-center justify-center gap-1.5 font-black text-[11px] text-slate-800">
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WIFI GRATIS PENGUNJUNG</span>
                  </div>
                  {store.wifiName && (
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      WiFi SSID: <strong className="text-slate-900 font-mono">{store.wifiName}</strong>
                    </div>
                  )}
                  {store.wifiPassword && (
                    <div className="text-[10px] text-slate-600">
                      Password: <strong className="text-slate-900 font-mono bg-emerald-100/60 px-1 py-0.2 rounded text-emerald-950">{store.wifiPassword}</strong>
                    </div>
                  )}
                </div>
              )}

              {/* HPP & Profit for owner if enabled */}
              {printer.showHpp && (
                <div className="mt-2 pt-2 border-t border-dotted border-slate-300 text-[10px] text-slate-500">
                  <div className="flex justify-between">
                    <span>Total Modal / HPP:</span>
                    <span>{formatRupiah(sale.totalHpp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Est. Keuntungan:</span>
                    <span>{formatRupiah(sale.totalProfit)} ({sale.profitMargin}%)</span>
                  </div>
                </div>
              )}

              <div className="border-b border-dashed border-slate-300 my-2" />

              <div className="text-center space-y-1 pt-1">
                {printer.showThankYou && (
                  <p className="font-bold text-[10px] text-slate-700 uppercase">
                    Terima Kasih atas Kunjungan Anda
                  </p>
                )}
                {printer.showFooter && store.receiptFooter && (
                  <p className="text-[9px] text-slate-400 italic leading-snug">
                    {store.receiptFooter}
                  </p>
                )}
                <p className="text-[8px] text-slate-300 pt-1">
                  Dicetak via KasirKu POS ({printer.paperSize})
                </p>
              </div>
            </div>
          </div>

          {/* Status Message */}
          {printStatus && (
            <div className="px-6 py-2 bg-emerald-50 border-t border-emerald-100 text-xs text-emerald-800 text-center font-medium animate-pulse">
              {printStatus}
            </div>
          )}

          {/* Action Buttons */}
          <div className="p-4 bg-white border-t border-slate-100 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{btConnected ? 'Cetak Thermal BT' : 'Cetak Struk'}</span>
              </button>

              <button
                onClick={handlePrintKitchenTicket}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md shadow-amber-600/20 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Tiket Dapur (KOT)</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                onClick={handleShareWhatsApp}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-800 font-bold border border-green-200 transition-all cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                <span>Kirim WA</span>
              </button>

              <button
                onClick={handleDownloadPdf}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>PDF</span>
              </button>

              <button
                onClick={handleCopyText}
                className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span>{copied ? 'Tersalin!' : 'Salin Teks'}</span>
              </button>
            </div>

            {onNewTransaction && (
              <button
                onClick={() => {
                  onClose();
                  onNewTransaction();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer mt-1"
              >
                + Transaksi Baru
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
