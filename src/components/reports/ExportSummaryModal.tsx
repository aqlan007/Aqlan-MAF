import React from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  PieChart,
  Printer,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { PrinterSettings, StoreSettings } from '../../types';
import { formatNumber, formatRupiah } from '../../utils/format';

export interface ExportSummaryData {
  title: string;
  periodLabel: string;
  totalSales: number;
  totalHpp: number;
  grossProfit: number;
  grossMarginPercent: number;
  totalExpenses: number;
  netProfit: number;
  netMarginPercent: number;
  txCount: number;
  aov: number;
  totalDiscount: number;
  totalTax: number;
  methods: Record<string, number>;
  orderTypes?: Record<string, number>;
  expensesCat?: Record<string, number>;
  topProducts?: { name: string; qty: number; total: number }[];
}

interface ExportSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExportSummaryData;
  store: StoreSettings;
  printer: PrinterSettings;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onPrintThermal?: () => void;
}

export const ExportSummaryModal: React.FC<ExportSummaryModalProps> = ({
  isOpen,
  onClose,
  data,
  store,
  printer,
  onExportCsv,
  onExportPdf,
  onPrintThermal,
}) => {
  if (!isOpen) return null;

  // Business Performance Evaluation Logic
  const isProfitable = data.netProfit > 0;
  const isHealthyMargin = data.grossMarginPercent >= 50;
  const expenseRatio = data.totalSales > 0 ? ((data.totalExpenses / data.totalSales) * 100).toFixed(1) : '0';

  let statusBadge = '🟢 Kinerja Sangat Sehat';
  let statusColor = 'bg-emerald-50 text-emerald-800 border-emerald-300';
  let summaryText = 'Usaha membukukan laba bersih positif dengan margin kotor di atas standar industri cafe & resto (50%). Beban operasional terkontrol dengan baik.';

  if (!isProfitable) {
    statusBadge = '🔴 Evaluasi Pengeluaran';
    statusColor = 'bg-rose-50 text-rose-800 border-rose-300';
    summaryText = 'Usaha mengalami defisit bersih pada periode ini. Disarankan untuk meninjau efisiensi beban operasional dan meningkatkan volume transaksi atau upselling.';
  } else if (!isHealthyMargin) {
    statusBadge = '🟡 Optimalkan HPP';
    statusColor = 'bg-amber-50 text-amber-800 border-amber-300';
    summaryText = 'Laba bersih positif, namun margin kotor di bawah 50%. Disarankan untuk mengevaluasi resep, porsi, atau menegosiasikan harga beli bahan baku.';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base leading-tight">Data Kesimpulan Laporan Keuangan</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Siap Diekspor
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {store.storeName} &bull; Periode: <strong className="text-slate-200">{data.periodLabel}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Executive Performance Badge */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3.5 ${statusColor}`}>
            <div className="p-2 rounded-xl bg-white shadow-xs shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm">{statusBadge}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 border">
                  Margin Bersih: {data.netMarginPercent}%
                </span>
              </div>
              <p className="leading-relaxed opacity-90">{summaryText}</p>
            </div>
          </div>

          {/* 4 KPI Grid Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">Total Omzet Penjualan</span>
              <span className="text-base font-black text-slate-900 block truncate">{formatRupiah(data.totalSales)}</span>
              <span className="text-[10px] text-slate-400 block">{data.txCount} Transaksi Selesai</span>
            </div>

            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-amber-800 block">Modal HPP (COGS)</span>
              <span className="text-base font-black text-amber-950 block truncate">{formatRupiah(data.totalHpp)}</span>
              <span className="text-[10px] text-amber-700 block">
                Food Cost: {data.totalSales > 0 ? ((data.totalHpp / data.totalSales) * 100).toFixed(1) : 0}%
              </span>
            </div>

            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-1">
              <span className="text-[11px] font-bold text-emerald-800 block">Laba Kotor Usaha</span>
              <span className="text-base font-black text-emerald-950 block truncate">{formatRupiah(data.grossProfit)}</span>
              <span className="text-[10px] text-emerald-700 block font-bold">
                Margin Kotor: {data.grossMarginPercent}%
              </span>
            </div>

            <div
              className={`p-4 border rounded-2xl space-y-1 ${
                data.netProfit >= 0
                  ? 'bg-blue-50/70 border-blue-200 text-blue-950'
                  : 'bg-rose-50/70 border-rose-200 text-rose-950'
              }`}
            >
              <span className="text-[11px] font-bold opacity-80 block">Laba Bersih Operasional</span>
              <span className="text-base font-black block truncate">{formatRupiah(data.netProfit)}</span>
              <span className="text-[10px] font-bold opacity-80 block">
                Net Margin: {data.netMarginPercent}%
              </span>
            </div>
          </div>

          {/* Detailed Summary Table */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <span className="font-extrabold text-xs text-slate-800 flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-emerald-600" />
                <span>Rincian Indikator Keuangan Lengkap</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                Waktu Cetak: {new Date().toLocaleTimeString('id-ID')}
              </span>
            </div>

            <div className="divide-y divide-slate-200 text-xs">
              <div className="px-4 py-2.5 flex justify-between items-center">
                <span className="text-slate-600">Total Nilai Penjualan (Bruto)</span>
                <span className="font-bold text-slate-800">{formatRupiah(data.totalSales + data.totalDiscount)}</span>
              </div>

              {data.totalDiscount > 0 && (
                <div className="px-4 py-2.5 flex justify-between items-center text-rose-600">
                  <span>Potongan Harga / Diskon Transaksi</span>
                  <span className="font-semibold">- {formatRupiah(data.totalDiscount)}</span>
                </div>
              )}

              <div className="px-4 py-2.5 flex justify-between items-center bg-white font-semibold">
                <span className="text-slate-700">Penjualan Bersih (Net Sales)</span>
                <span className="text-slate-900 font-black">{formatRupiah(data.totalSales)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between items-center text-amber-700">
                <span>Beban Pokok Penjualan (HPP Bahan F&B)</span>
                <span className="font-semibold">- {formatRupiah(data.totalHpp)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between items-center bg-emerald-50/50 font-bold text-emerald-900">
                <span>Laba Kotor (Gross Profit)</span>
                <span>{formatRupiah(data.grossProfit)}</span>
              </div>

              <div className="px-4 py-2.5 flex justify-between items-center text-rose-700">
                <span>Beban Operasional Cafe (Gaji, Listrik, Sewa, dll.)</span>
                <span className="font-semibold">- {formatRupiah(data.totalExpenses)}</span>
              </div>

              <div className="px-4 py-3 flex justify-between items-center bg-slate-900 text-white font-black text-sm">
                <span>LABA BERSIH OPERASIONAL</span>
                <span className={data.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {formatRupiah(data.netProfit)}
                </span>
              </div>

              <div className="px-4 py-2.5 flex justify-between items-center text-[11px] text-slate-500 bg-slate-100">
                <span>Rata-rata Nilai Belanja per Tamu (AOV)</span>
                <span className="font-bold text-slate-700 font-mono">{formatRupiah(data.aov)}</span>
              </div>

              {data.totalTax > 0 && (
                <div className="px-4 py-2.5 flex justify-between items-center text-[11px] text-slate-500">
                  <span>Pajak Restoran Terkumpul (PB1)</span>
                  <span className="font-bold text-slate-700 font-mono">{formatRupiah(data.totalTax)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          {data.methods && Object.keys(data.methods).length > 0 && (
            <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Rincian Penerimaan Kasir:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(data.methods).map(([method, amount]) => (
                  <div key={method} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">{method}</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">{formatRupiah(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with 3 Export Options */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 font-medium">Pilih format ekspor laporan:</span>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {onPrintThermal && (
              <button
                type="button"
                onClick={onPrintThermal}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Cetak Thermal</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportPdf}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>

            <button
              type="button"
              onClick={onExportCsv}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Excel / CSV Lengkap</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
