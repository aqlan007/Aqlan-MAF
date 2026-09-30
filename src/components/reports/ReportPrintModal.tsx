import React, { useState } from 'react';
import {
  Bluetooth,
  Check,
  ChevronDown,
  Download,
  FileText,
  Printer,
  Sparkles,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { printerService } from '../../services/printer';
import { PrinterSettings, StoreSettings } from '../../types';
import { formatDate, formatDateTime, formatRupiah } from '../../utils/format';

export interface ReportPrintData {
  title: string;
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  totalSales: number;
  txCount: number;
  totalHpp: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
  paymentMethods: {
    cash?: number;
    qris?: number;
    transfer?: number;
    debit?: number;
    credit?: number;
    ewallet?: number;
  };
  topProducts?: { name: string; qty: number; total: number }[];
  dailyBreakdown?: { label: string; total: number; count: number }[];
}

interface ReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReportPrintData;
  store: StoreSettings;
  printer: PrinterSettings;
}

export const ReportPrintModal: React.FC<ReportPrintModalProps> = ({
  isOpen,
  onClose,
  report,
  store,
  printer,
}) => {
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btStatus, setBtStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePrintBluetooth = async () => {
    setIsPrintingBt(true);
    setBtStatus(null);
    try {
      if (!printerService.isConnected()) {
        await printerService.requestAndConnect();
      }
      const bytes = await printerService.generateEscPosFinancialReport(
        {
          title: report.title,
          periodLabel: report.periodLabel,
          totalSales: report.totalSales,
          txCount: report.txCount,
          totalHpp: report.totalHpp,
          grossProfit: report.grossProfit,
          totalExpenses: report.totalExpenses,
          netProfit: report.netProfit,
          paymentMethods: report.paymentMethods as Record<string, number>,
          topProducts: report.topProducts,
        },
        store,
        printer
      );
      await printerService.sendRawBytes(bytes);
      setBtStatus('Struk laporan berhasil dikirim ke printer!');
      setTimeout(() => setBtStatus(null), 3000);
    } catch (err: any) {
      console.error('Bluetooth print report error:', err);
      setBtStatus(err.message || 'Gagal mencetak ke printer Bluetooth.');
    } finally {
      setIsPrintingBt(false);
    }
  };

  const handleDownloadPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFont('helvetica');

      // Header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(store.storeName, 14, 18);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      if (store.address) doc.text(store.address, 14, 24);
      doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, 14, 30);

      // Title
      doc.setDrawColor(200);
      doc.line(14, 34, 196, 34);

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text(report.title.toUpperCase(), 14, 42);

      doc.setFontSize(10);
      doc.setTextColor(60);
      doc.text(`Periode: ${report.periodLabel}`, 14, 48);

      let y = 56;

      // DATA KESIMPULAN BOX IN PDF
      const grossMargin = report.totalSales > 0 ? ((report.grossProfit / report.totalSales) * 100).toFixed(1) + '%' : '0%';
      const netMargin = report.totalSales > 0 ? ((report.netProfit / report.totalSales) * 100).toFixed(1) + '%' : '0%';
      const aov = report.txCount > 0 ? Math.round(report.totalSales / report.txCount) : 0;
      const healthStatus = report.netProfit > 0 ? (report.grossProfit / (report.totalSales || 1) >= 0.4 ? 'SANGAT SEHAT & PROFITABEL' : 'PROFITABEL') : 'PERLU EVALUASI';

      doc.setFillColor(240, 253, 244);
      doc.rect(14, y, 182, 25, 'F');
      doc.setDrawColor(16, 185, 129);
      doc.rect(14, y, 182, 25, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(16, 185, 129);
      doc.text('DATA KESIMPULAN & ANALISIS KEUANGAN:', 18, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`• Status Finansial: ${healthStatus}  |  Rata-rata/Transaksi (AOV): ${formatRupiah(aov)}`, 18, y + 12);
      doc.text(`• Margin Laba Kotor: ${grossMargin}  |  Margin Laba Bersih: ${netMargin}`, 18, y + 17);
      doc.text(`• Kesimpulan: Operasional menghasilkan laba bersih ${formatRupiah(report.netProfit)}.`, 18, y + 22);

      y += 33;
      const printRow = (label: string, val: string, isBold = false) => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(isBold ? 0 : 70);
        doc.text(label, 14, y);
        doc.text(val, 196, y, { align: 'right' });
        y += 7;
      };

      printRow('Total Transaksi:', `${report.txCount} Transaksi`);
      printRow('Total Omzet (Penjualan):', formatRupiah(report.totalSales), true);
      printRow('Total Modal (HPP):', formatRupiah(report.totalHpp));
      printRow('Laba Kotor:', formatRupiah(report.grossProfit), true);
      printRow('Biaya Operasional:', formatRupiah(report.totalExpenses));
      doc.setDrawColor(220);
      doc.line(14, y - 2, 196, y - 2);
      printRow('LABA BERSIH:', formatRupiah(report.netProfit), true);

      y += 5;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text('METODE PEMBAYARAN', 14, y);
      y += 6;

      if (report.paymentMethods.cash) printRow('Tunai (Cash):', formatRupiah(report.paymentMethods.cash));
      if (report.paymentMethods.qris) printRow('QRIS:', formatRupiah(report.paymentMethods.qris));
      if (report.paymentMethods.transfer) printRow('Transfer Bank:', formatRupiah(report.paymentMethods.transfer));
      const card = (report.paymentMethods.debit || 0) + (report.paymentMethods.credit || 0);
      if (card) printRow('Debit / Kredit:', formatRupiah(card));
      if (report.paymentMethods.ewallet) printRow('E-Wallet:', formatRupiah(report.paymentMethods.ewallet));

      if (report.topProducts && report.topProducts.length > 0) {
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text('PRODUK TERLARIS', 14, y);
        y += 6;
        report.topProducts.slice(0, 5).forEach((p, idx) => {
          printRow(`${idx + 1}. ${p.name}`, `${p.qty} pcs (${formatRupiah(p.total)})`);
        });
      }

      doc.save(`Laporan_${report.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('PDF error:', e);
    }
  };

  const handlePrintBrowser = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">Cetak Ringkasan Laporan</h3>
              <p className="text-[11px] text-slate-400">Pilih cetak thermal Bluetooth, kertas, atau PDF</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status notification */}
        {btStatus && (
          <div className={`px-4 py-2 text-xs font-semibold text-center ${
            btStatus.includes('berhasil') ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
          }`}>
            {btStatus}
          </div>
        )}

        {/* Printable Thermal Receipt Mockup */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          <div
            id="report-printable-area"
            className="mx-auto bg-white p-5 rounded-2xl shadow-sm border border-slate-200 font-mono text-xs text-slate-800 space-y-3 max-w-xs"
          >
            {/* Store details */}
            <div className="text-center border-b border-dashed border-slate-300 pb-2.5">
              <h4 className="font-bold text-sm text-slate-900">{store.storeName}</h4>
              {store.address && <p className="text-[10px] text-slate-500 mt-0.5">{store.address}</p>}
              {store.phone && <p className="text-[10px] text-slate-500">Telp: {store.phone}</p>}
            </div>

            {/* Title & Period */}
            <div className="text-center py-1 border-b border-dashed border-slate-300">
              <div className="font-extrabold text-xs text-slate-900 tracking-wide uppercase">
                {report.title}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Periode: {report.periodLabel}
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">
                Cetak: {formatDateTime(new Date().toISOString())}
              </div>
            </div>

            {/* Financial Rows */}
            <div className="space-y-1.5 py-1 text-[11px]">
              <div className="flex justify-between">
                <span>Total Transaksi</span>
                <span className="font-bold">{report.txCount} Nota</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                <span>TOTAL OMZET</span>
                <span>{formatRupiah(report.totalSales)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Modal (HPP)</span>
                <span>{formatRupiah(report.totalHpp)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Laba Kotor</span>
                <span>{formatRupiah(report.grossProfit)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Biaya Operasional</span>
                <span>-{formatRupiah(report.totalExpenses)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-emerald-700 border-t border-b border-slate-300 py-1 text-xs">
                <span>LABA BERSIH</span>
                <span>{formatRupiah(report.netProfit)}</span>
              </div>
            </div>

            {/* Methods */}
            <div className="pt-1 text-[10px] space-y-1 border-b border-dashed border-slate-300 pb-2">
              <div className="font-bold text-slate-700">METODE PEMBAYARAN:</div>
              {report.paymentMethods.cash ? (
                <div className="flex justify-between">
                  <span>Tunai (Cash)</span>
                  <span>{formatRupiah(report.paymentMethods.cash)}</span>
                </div>
              ) : null}
              {report.paymentMethods.qris ? (
                <div className="flex justify-between">
                  <span>QRIS</span>
                  <span>{formatRupiah(report.paymentMethods.qris)}</span>
                </div>
              ) : null}
              {report.paymentMethods.transfer ? (
                <div className="flex justify-between">
                  <span>Transfer Bank</span>
                  <span>{formatRupiah(report.paymentMethods.transfer)}</span>
                </div>
              ) : null}
              {(report.paymentMethods.debit || 0) + (report.paymentMethods.credit || 0) ? (
                <div className="flex justify-between">
                  <span>Debit / Kredit</span>
                  <span>{formatRupiah((report.paymentMethods.debit || 0) + (report.paymentMethods.credit || 0))}</span>
                </div>
              ) : null}
            </div>

            {/* Top Products */}
            {report.topProducts && report.topProducts.length > 0 && (
              <div className="pt-1 text-[10px] space-y-1 border-b border-dashed border-slate-300 pb-2">
                <div className="font-bold text-slate-700">PRODUK TERLARIS:</div>
                {report.topProducts.slice(0, 5).map((p, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span className="truncate max-w-[170px]">{idx + 1}. {p.name}</span>
                    <span className="font-bold">{p.qty}x</span>
                  </div>
                ))}
              </div>
            )}

            {/* Data Kesimpulan Finansial Slip */}
            <div className="pt-1 text-[10px] space-y-1 border-b border-dashed border-slate-300 pb-2 bg-emerald-50/60 p-2 rounded-lg">
              <div className="font-extrabold text-emerald-900 flex items-center gap-1 text-[10px]">
                <span>DATA KESIMPULAN KEUANGAN:</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Margin Laba Kotor:</span>
                <span className="font-bold">
                  {report.totalSales > 0 ? ((report.grossProfit / report.totalSales) * 100).toFixed(1) + '%' : '0%'}
                </span>
              </div>
              <div className="flex justify-between text-emerald-800">
                <span>Margin Laba Bersih:</span>
                <span className="font-bold">
                  {report.totalSales > 0 ? ((report.netProfit / report.totalSales) * 100).toFixed(1) + '%' : '0%'}
                </span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>Rata-rata/Nota (AOV):</span>
                <span className="font-bold">
                  {formatRupiah(report.txCount > 0 ? Math.round(report.totalSales / report.txCount) : 0)}
                </span>
              </div>
              <div className="pt-1 text-[9px] text-slate-600 border-t border-emerald-200">
                <span className="font-bold text-emerald-800">Status: </span>
                {report.netProfit > 0 ? 'Profitabel & Sehat' : 'Evaluasi Biaya'}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center pt-1 text-[9px] text-slate-400">
              <p>*** AKHIR LAPORAN ***</p>
              <p>KasirKu POS System</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap gap-2.5 justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintBluetooth}
              disabled={isPrintingBt}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
            >
              <Bluetooth className="w-4 h-4 text-blue-200" />
              <span>{isPrintingBt ? 'Mencetak...' : 'Cetak Thermal (Bluetooth)'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintBrowser}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Kertas</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
