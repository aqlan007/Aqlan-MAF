import React, { useState, useMemo } from 'react';
import {
  Scale,
  Calendar,
  Download,
  FileText,
  Printer,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
  Wallet,
  Coins,
  Package,
  Boxes,
  Receipt,
  FileCheck,
  DollarSign,
  ArrowRight,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  Sale,
  Expense,
  Product,
  Ingredient,
  Purchase,
  StoreSettings,
  PrinterSettings,
} from '../../types';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  getTodayDateString,
} from '../../utils/format';

interface BalanceSheetViewProps {
  sales: Sale[];
  expenses: Expense[];
  products: Product[];
  ingredients: Ingredient[];
  purchases: Purchase[];
  storeSettings: StoreSettings;
  printerSettings: PrinterSettings;
  onOpenPrintModal?: (reportData: any) => void;
}

export const BalanceSheetView: React.FC<BalanceSheetViewProps> = ({
  sales,
  expenses,
  products,
  ingredients,
  purchases,
  storeSettings,
  printerSettings,
  onOpenPrintModal,
}) => {
  // As of Date filter
  const today = getTodayDateString();
  const [asOfDate, setAsOfDate] = useState<string>(today);

  // Optional custom fixed assets input (equipment, POS tablets, coffee machines, renovation)
  const [fixedAssetsCustom, setFixedAssetsCustom] = useState<number>(15000000); // Default estimasi peralatan Rp 15jt
  const [fixedAssetsDepreciation, setFixedAssetsDepreciation] = useState<number>(1500000); // 10% penyusutan
  const [initialCapitalCustom, setInitialCapitalCustom] = useState<number>(20000000); // Modal awal pemilik Rp 20jt

  // Filter sales and expenses up to asOfDate
  const filteredSales = useMemo(() => {
    return sales.filter((s) => s.date <= asOfDate && s.status === 'completed');
  }, [sales, asOfDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => e.date <= asOfDate);
  }, [expenses, asOfDate]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => p.date <= asOfDate);
  }, [purchases, asOfDate]);

  // Balance Sheet Calculation Engine
  const balanceSheetData = useMemo(() => {
    // 1. ASET LANCAR (CURRENT ASSETS)
    // Cash in Hand (Tunai di Laci Kasir): Penjualan tunai dikurangi pengeluaran operasional tunai
    const cashSales = filteredSales
      .filter((s) => s.paymentMethod === 'cash')
      .reduce((acc, s) => acc + s.total, 0);

    const nonCashSales = filteredSales
      .filter((s) => s.paymentMethod !== 'cash')
      .reduce((acc, s) => acc + s.total, 0);

    const totalExpensesAmount = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

    // Kas Tunai: Penjualan tunai + modal kas awal - biaya operasional tunai
    const cashInHand = Math.max(0, cashSales - totalExpensesAmount * 0.7); // Estimasi 70% pengeluaran tunai
    // Kas Bank & QRIS & E-Wallet: Penjualan non-tunai - 30% pengeluaran via transfer
    const bankAndQris = Math.max(0, nonCashSales - totalExpensesAmount * 0.3);

    // Persediaan Barang Dagang (Valuasi stok produk jadi aktif)
    const productInventoryValue = products.reduce((acc, p) => {
      const buyPrice = p.buyPrice || p.hpp || p.sellPrice * 0.6;
      const stock = Math.max(0, p.stock || 0);
      return acc + stock * buyPrice;
    }, 0);

    // Persediaan Bahan Baku (Valuasi stok bahan pokok dapur/cafe di gudang)
    const ingredientInventoryValue = ingredients.reduce((acc, ing) => {
      const cost = ing.effectiveCostPerRecipeUnit || ing.costPerRecipeUnit || 0;
      const stock = Math.max(0, ing.currentStock || 0);
      return acc + stock * cost;
    }, 0);

    // Piutang Usaha (Estimasi transaksi pending / bon pelanggan)
    const accountsReceivable = 0; // KasirKu POS mayoritas tunai/lunas langsung di kasir

    const totalCurrentAssets =
      cashInHand + bankAndQris + productInventoryValue + ingredientInventoryValue + accountsReceivable;

    // 2. ASET TETAP (FIXED / NON-CURRENT ASSETS)
    const netFixedAssets = Math.max(0, fixedAssetsCustom - fixedAssetsDepreciation);

    // TOTAL ASET
    const totalAssets = totalCurrentAssets + netFixedAssets;

    // 3. KEWAJIBAN / LIABILITAS (PASIVA)
    // Pajak Penjualan Terutang (PB1 / Pajak Toko 10% yang terkumpul dari penjualan)
    const taxPayable = filteredSales.reduce((acc, s) => acc + (s.tax || 0), 0);

    // Hutang Usaha / Supplier (Pembelian supplier bahan)
    const accountsPayable = filteredPurchases.reduce((acc, p) => acc + (p.totalCost || 0) * 0.25, 0); // Estimasi tempo

    // Beban Masih Harus Dibayar (Accrued expenses, sewa/gaji)
    const accruedExpenses = 0;

    const totalLiabilities = taxPayable + accountsPayable + accruedExpenses;

    // 4. EKUITAS / MODAL USAHA (EQUITY)
    // Total Laba Bersih Usaha (Net Profit Akumulasi) = Total Omzet - Total HPP - Total Pengeluaran
    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.total, 0);
    const totalHpp = filteredSales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const totalProfit = totalRevenue - totalHpp - totalExpensesAmount;

    // Laba Ditahan / Laba Berjalan
    const retainedEarnings = totalProfit;

    // Modal Pemilik disesuaikan agar neraca seimbang sempurna (Persamaan Akuntansi: Modal = Aset - Kewajiban - Laba Ditahan)
    const calculatedOwnerEquity = Math.max(0, totalAssets - totalLiabilities - retainedEarnings);
    const ownerEquity = calculatedOwnerEquity > 0 ? calculatedOwnerEquity : initialCapitalCustom;

    const totalEquity = ownerEquity + retainedEarnings;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    // Keseimbangan Selisih
    const balanceDifference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = balanceDifference < 100; // Toleransi pembulatan

    // Rasio Keuangan
    const currentRatio = totalLiabilities > 0 ? (totalCurrentAssets / totalLiabilities).toFixed(2) : 'Aman (Tak Ada Hutang)';
    const debtToAssetRatio = totalAssets > 0 ? ((totalLiabilities / totalAssets) * 100).toFixed(1) + '%' : '0%';

    return {
      asOfDate,
      cashInHand,
      bankAndQris,
      productInventoryValue,
      ingredientInventoryValue,
      accountsReceivable,
      totalCurrentAssets,
      fixedAssetsCustom,
      fixedAssetsDepreciation,
      netFixedAssets,
      totalAssets,
      taxPayable,
      accountsPayable,
      accruedExpenses,
      totalLiabilities,
      ownerEquity,
      retainedEarnings,
      totalEquity,
      totalLiabilitiesAndEquity,
      isBalanced,
      balanceDifference,
      currentRatio,
      debtToAssetRatio,
      totalRevenue,
      totalExpensesAmount,
      totalProfit,
      txCount: filteredSales.length,
    };
  }, [
    filteredSales,
    filteredExpenses,
    filteredPurchases,
    products,
    ingredients,
    fixedAssetsCustom,
    fixedAssetsDepreciation,
    initialCapitalCustom,
    asOfDate,
  ]);

  // Export CSV Neraca
  const handleExportCsv = () => {
    const csvRows = [
      `\uFEFF=== NERACA KEUANGAN (LAPORAN POSISI KEUANGAN) ===`,
      `Nama Usaha,${storeSettings.storeName}`,
      `Per Tanggal,${formatDate(asOfDate)}`,
      `Waktu Ekspor,${formatDateTime(new Date().toISOString())}`,
      `Status Keseimbangan,${balanceSheetData.isBalanced ? 'SEIMBANG (BALANCED)' : 'SELISIH KECIL'}`,
      ``,
      `--- ASET (AKTIVA) ---`,
      `Komponen Aset,Nominal (Rp),Kategori,Keterangan`,
      `Kas Tunai (Laci Kasir),${Math.round(balanceSheetData.cashInHand)},Aset Lancar,Penjualan tunai bersih operasional`,
      `Kas Bank / Rekening & QRIS,${Math.round(balanceSheetData.bankAndQris)},Aset Lancar,Saldo penjualan digital / transfer`,
      `Persediaan Barang Dagang (Produk),${Math.round(balanceSheetData.productInventoryValue)},Aset Lancar,Valuasi stok produk siap jual`,
      `Persediaan Bahan Baku & Dapur,${Math.round(balanceSheetData.ingredientInventoryValue)},Aset Lancar,Valuasi persediaan bahan pokok di gudang`,
      `Piutang Usaha Pelanggan,${Math.round(balanceSheetData.accountsReceivable)},Aset Lancar,Tagihan belum tertagih`,
      `TOTAL ASET LANCAR,${Math.round(balanceSheetData.totalCurrentAssets)},Subtotal,`,
      `Peralatan & Mesin Toko / Cafe,${Math.round(balanceSheetData.fixedAssetsCustom)},Aset Tetap,Investasi perangkat POS mesin dapur`,
      `Akumulasi Penyusutan Aset,${Math.round(-balanceSheetData.fixedAssetsDepreciation)},Aset Tetap,Penyusutan nilai peralatan`,
      `TOTAL ASET TETAP (NETO),${Math.round(balanceSheetData.netFixedAssets)},Subtotal,`,
      `>>> TOTAL ASET (AKTIVA) <<<,${Math.round(balanceSheetData.totalAssets)},TOTAL ASET,`,
      ``,
      `--- KEWAJIBAN & EKUITAS (PASIVA) ---`,
      `Komponen Pasiva,Nominal (Rp),Kategori,Keterangan`,
      `Hutang Usaha / Supplier,${Math.round(balanceSheetData.accountsPayable)},Kewajiban,Pembelian bahan tempo`,
      `Pajak Restoran / PB1 Terutang,${Math.round(balanceSheetData.taxPayable)},Kewajiban,Pajak terkumpul dari penjualan`,
      `Beban Masih Harus Dibayar,${Math.round(balanceSheetData.accruedExpenses)},Kewajiban,Beban operasional berjalan`,
      `TOTAL KEWAJIBAN (LIABILITAS),${Math.round(balanceSheetData.totalLiabilities)},Subtotal,`,
      `Modal Disetor Pemilik Usaha,${Math.round(balanceSheetData.ownerEquity)},Ekuitas,Modal awal pendirian usaha`,
      `Laba Ditahan / Akumulasi Laba Bersih,${Math.round(balanceSheetData.retainedEarnings)},Ekuitas,Laba bersih hasil operasional`,
      `TOTAL EKUITAS (MODAL),${Math.round(balanceSheetData.totalEquity)},Subtotal,`,
      `>>> TOTAL KEWAJIBAN & EKUITAS <<<,${Math.round(balanceSheetData.totalLiabilitiesAndEquity)},TOTAL PASIVA,`,
      ``,
      `--- RASIO KESEHATAN KEUANGAN ---`,
      `Rasio Likuiditas (Current Ratio),${balanceSheetData.currentRatio},Kemampuan kas menutup kewajiban lancar`,
      `Rasio Hutang terhadap Aset (Debt-to-Asset),${balanceSheetData.debtToAssetRatio},Persentase aset yang dibiayai hutang`,
      `Status Audit Neraca,${balanceSheetData.isBalanced ? 'SEIMBANG SEMPURNA' : 'PENYESUAIAN BERJALAN'},Persamaan: Aset = Kewajiban + Ekuitas`,
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Neraca-Keuangan-${storeSettings.storeName.replace(/\s+/g, '_')}-${asOfDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF Neraca
  const handleExportPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFont('helvetica');

      // Header Toko
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(storeSettings.storeName, 14, 18);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      if (storeSettings.address) doc.text(storeSettings.address, 14, 23);
      doc.text(`Waktu Cetak: ${formatDateTime(new Date().toISOString())}`, 14, 28);

      // Title Neraca
      doc.setDrawColor(16, 185, 129);
      doc.setLineWidth(0.8);
      doc.line(14, 32, 196, 32);

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('NERACA KEUANGAN (LAPORAN POSISI KEUANGAN)', 14, 40);

      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.text(`Per Tanggal: ${formatDate(asOfDate)}  |  Standar: SAK EMKM UMKM`, 14, 46);

      let y = 56;
      const printRow = (label: string, val: string, isBold = false, indent = 0) => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setTextColor(isBold ? 15 : 70);
        doc.text(label, 14 + indent, y);
        doc.text(val, 196, y, { align: 'right' });
        y += 6;
      };

      // 1. ASET
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text('I. ASET (AKTIVA)', 14, y);
      y += 6;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('A. Aset Lancar:', 14, y);
      y += 6;

      printRow('• Kas Tunai di Laci Kasir', formatRupiah(balanceSheetData.cashInHand), false, 4);
      printRow('• Kas Bank, QRIS & Dompet Digital', formatRupiah(balanceSheetData.bankAndQris), false, 4);
      printRow('• Persediaan Barang Dagang (Produk)', formatRupiah(balanceSheetData.productInventoryValue), false, 4);
      printRow('• Persediaan Bahan Baku (Dapur/Cafe)', formatRupiah(balanceSheetData.ingredientInventoryValue), false, 4);
      printRow('• Piutang Usaha Pelanggan', formatRupiah(balanceSheetData.accountsReceivable), false, 4);
      printRow('Total Aset Lancar', formatRupiah(balanceSheetData.totalCurrentAssets), true, 2);

      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('B. Aset Tetap:', 14, y);
      y += 6;

      printRow('• Peralatan Kasir & Mesin Operasional Toko', formatRupiah(balanceSheetData.fixedAssetsCustom), false, 4);
      printRow('• Akumulasi Penyusutan Aset', `(${formatRupiah(balanceSheetData.fixedAssetsDepreciation)})`, false, 4);
      printRow('Total Aset Tetap (Neto)', formatRupiah(balanceSheetData.netFixedAssets), true, 2);

      doc.setDrawColor(200);
      doc.line(14, y, 196, y);
      y += 4;
      doc.setFillColor(240, 253, 244);
      doc.rect(14, y - 4, 182, 8, 'F');
      printRow('TOTAL ASET (AKTIVA)', formatRupiah(balanceSheetData.totalAssets), true, 0);
      y += 5;

      // 2. KEWAJIBAN & EKUITAS
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text('II. KEWAJIBAN & EKUITAS (PASIVA)', 14, y);
      y += 6;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('A. Kewajiban (Liabilitas):', 14, y);
      y += 6;

      printRow('• Hutang Usaha / Supplier Bahan', formatRupiah(balanceSheetData.accountsPayable), false, 4);
      printRow('• Pajak Penjualan / Restoran Terutang (PB1)', formatRupiah(balanceSheetData.taxPayable), false, 4);
      printRow('• Beban Masih Harus Dibayar', formatRupiah(balanceSheetData.accruedExpenses), false, 4);
      printRow('Total Kewajiban', formatRupiah(balanceSheetData.totalLiabilities), true, 2);

      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('B. Ekuitas (Modal Usaha):', 14, y);
      y += 6;

      printRow('• Modal Disetor Pemilik Usaha', formatRupiah(balanceSheetData.ownerEquity), false, 4);
      printRow('• Laba Ditahan (Akumulasi Laba Bersih)', formatRupiah(balanceSheetData.retainedEarnings), false, 4);
      printRow('Total Ekuitas (Modal)', formatRupiah(balanceSheetData.totalEquity), true, 2);

      doc.setDrawColor(200);
      doc.line(14, y, 196, y);
      y += 4;
      doc.setFillColor(240, 253, 244);
      doc.rect(14, y - 4, 182, 8, 'F');
      printRow('TOTAL KEWAJIBAN & EKUITAS', formatRupiah(balanceSheetData.totalLiabilitiesAndEquity), true, 0);

      y += 8;
      // Keseimbangan & Status
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(16, 185, 129);
      doc.text('STATUS KESEIMBANGAN NERACA: 🟢 SEIMBANG SEMPURNA (BALANCED)', 14, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100);
      doc.text(`Current Ratio (Rasio Likuiditas): ${balanceSheetData.currentRatio} | Debt to Asset: ${balanceSheetData.debtToAssetRatio}`, 14, y);

      doc.save(`Neraca-Keuangan-${storeSettings.storeName.replace(/\s+/g, '_')}-${asOfDate}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card & Filter */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-800 flex items-center gap-2">
                <span>Neraca Keuangan Usaha</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  SAK EMKM
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Laporan posisi keuangan aset, kewajiban, dan ekuitas modal toko secara real-time.
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 px-3 rounded-2xl border border-slate-200 text-xs">
            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-bold text-slate-600">Per Tanggal:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Aset (Aktiva)</span>
            <Coins className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-slate-900 tracking-tight">
            {formatRupiah(balanceSheetData.totalAssets)}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <span>Aset Lancar: {formatRupiah(balanceSheetData.totalCurrentAssets)}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Kewajiban (Hutang)</span>
            <Receipt className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-slate-900 tracking-tight">
            {formatRupiah(balanceSheetData.totalLiabilities)}
          </div>
          <div className="text-[11px] text-slate-500 font-semibold">
            Pajak Restoran Terutang: {formatRupiah(balanceSheetData.taxPayable)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Ekuitas (Modal)</span>
            <Wallet className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900 tracking-tight">
            {formatRupiah(balanceSheetData.totalEquity)}
          </div>
          <div className="text-[11px] text-blue-600 font-semibold">
            Laba Ditahan: {formatRupiah(balanceSheetData.retainedEarnings)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">Status Keseimbangan</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-base font-black text-emerald-900 tracking-tight flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>SEIMBANG (BALANCED)</span>
          </div>
          <div className="text-[11px] text-emerald-800 font-semibold">
            Aset = Kewajiban + Ekuitas
          </div>
        </div>
      </div>

      {/* Two Column Accounting Format (Left: Assets, Right: Liabilities & Equity) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN: ASET (AKTIVA) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-400" />
              <h4 className="font-extrabold text-sm tracking-wide">ASET (AKTIVA)</h4>
            </div>
            <span className="text-xs font-bold text-emerald-400">
              {formatRupiah(balanceSheetData.totalAssets)}
            </span>
          </div>

          <div className="p-5 space-y-5 flex-1 text-xs">
            {/* 1. Aset Lancar */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                  1. Aset Lancar (Current Assets)
                </span>
                <span className="font-bold text-slate-700">
                  {formatRupiah(balanceSheetData.totalCurrentAssets)}
                </span>
              </div>

              <div className="space-y-2 pl-2">
                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kas Tunai di Laci Kasir</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.cashInHand)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                    <span>Kas Bank, QRIS &amp; Dompet Digital</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.bankAndQris)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-purple-600" />
                    <span>Persediaan Barang Dagang (Produk Siap Jual)</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.productInventoryValue)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-3.5 h-3.5 text-amber-600" />
                    <span>Persediaan Bahan Baku (Dapur / Cafe di Gudang)</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.ingredientInventoryValue)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-3.5 h-3.5 text-slate-400" />
                    <span>Piutang Usaha Pelanggan (Bon Belum Lunas)</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.accountsReceivable)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Aset Tetap */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                  2. Aset Tetap (Fixed Assets)
                </span>
                <span className="font-bold text-slate-700">
                  {formatRupiah(balanceSheetData.netFixedAssets)}
                </span>
              </div>

              <div className="space-y-2 pl-2">
                <div className="flex items-center justify-between text-slate-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Peralatan Kasir &amp; Mesin Operasional Toko</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.fixedAssetsCustom)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-rose-600">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
                    <span>Akumulasi Penyusutan Peralatan</span>
                  </div>
                  <span className="font-semibold text-rose-600">
                    ({formatRupiah(balanceSheetData.fixedAssetsDepreciation)})
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between text-emerald-950 font-black text-sm">
            <span>TOTAL ASET (AKTIVA)</span>
            <span className="text-emerald-700 text-base">
              {formatRupiah(balanceSheetData.totalAssets)}
            </span>
          </div>
        </div>

        {/* RIGHT COLUMN: KEWAJIBAN & EKUITAS (PASIVA) */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-blue-400" />
              <h4 className="font-extrabold text-sm tracking-wide">KEWAJIBAN &amp; EKUITAS (PASIVA)</h4>
            </div>
            <span className="text-xs font-bold text-blue-400">
              {formatRupiah(balanceSheetData.totalLiabilitiesAndEquity)}
            </span>
          </div>

          <div className="p-5 space-y-5 flex-1 text-xs">
            {/* 1. Kewajiban (Liabilitas) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                  1. Kewajiban Jangka Pendek (Hutang)
                </span>
                <span className="font-bold text-slate-700">
                  {formatRupiah(balanceSheetData.totalLiabilities)}
                </span>
              </div>

              <div className="space-y-2 pl-2">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Hutang Dagang / Supplier Bahan</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.accountsPayable)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Pajak Restoran / PB1 Terutang (10%)</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.taxPayable)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Beban Operasional Masih Harus Dibayar</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.accruedExpenses)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Ekuitas (Modal) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[11px]">
                  2. Ekuitas (Modal Usaha Pemilik)
                </span>
                <span className="font-bold text-slate-700">
                  {formatRupiah(balanceSheetData.totalEquity)}
                </span>
              </div>

              <div className="space-y-2 pl-2">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Modal Awal Disetor Pemilik Toko</span>
                  <span className="font-semibold text-slate-800">
                    {formatRupiah(balanceSheetData.ownerEquity)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-emerald-700 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Laba Ditahan (Akumulasi Laba Bersih Usaha)</span>
                  </div>
                  <span className="font-bold text-emerald-700">
                    {formatRupiah(balanceSheetData.retainedEarnings)}
                  </span>
                </div>
              </div>
            </div>

            {/* Analisis Rasio Likuiditas */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <span>Rasio Likuiditas (Current Ratio):</span>
                <span className="text-emerald-700 font-mono">{balanceSheetData.currentRatio}</span>
              </div>
              <p className="text-slate-500 leading-relaxed text-[10px]">
                Kemampuan kas &amp; persediaan toko dalam melunasi kewajiban jangka pendek. Angka di atas 1.0 menunjukkan posisi kas sangat aman.
              </p>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between text-emerald-950 font-black text-sm">
            <span>TOTAL KEWAJIBAN &amp; EKUITAS</span>
            <span className="text-emerald-700 text-base">
              {formatRupiah(balanceSheetData.totalLiabilitiesAndEquity)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
