import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Coffee,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Lightbulb,
  Package,
  PieChart,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Utensils,
  Wallet,
  X,
  Zap,
  Scale,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { db } from '../../db/db';
import { supabaseService } from '../../services/supabase';
import {
  Category,
  Expense,
  ExpenseCategory,
  Ingredient,
  OrderType,
  PaymentMethod,
  PrinterSettings,
  Product,
  Purchase,
  Sale,
  SaleItem,
  StoreSettings,
  User,
} from '../../types';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRupiah,
  getTodayDateString,
} from '../../utils/format';
import { ConfirmModal } from '../common/ConfirmModal';
import { ReceiptModal } from '../pos/ReceiptModal';
import { ReportPrintData, ReportPrintModal } from './ReportPrintModal';
import { BalanceSheetView } from './BalanceSheetView';

interface ReportsScreenProps {
  currentUser: User;
  storeSettings: StoreSettings;
  printerSettings: PrinterSettings;
}

export const ReportsScreen: React.FC<ReportsScreenProps> = ({
  currentUser,
  storeSettings,
  printerSettings,
}) => {
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly' | 'custom' | 'yearly' | 'balance_sheet' | 'insights' | 'transactions'>('daily');

  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  // Selected date for daily report
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());

  // Selected date anchor for weekly report
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>(getTodayDateString());

  // Selected month and year for monthly report
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1 - 12
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Custom date range state ("Atur Tanggal")
  const todayStr = getTodayDateString();
  const firstOfMonthStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const [customStartDate, setCustomStartDate] = useState<string>(firstOfMonthStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  // Filter for all transactions tab
  const [txSearch, setTxSearch] = useState('');
  const [txFilterMethod, setTxFilterMethod] = useState('all');
  const [txDateRange, setTxDateRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');

  // Detail / Reprint Modal
  const [selectedSaleForDetail, setSelectedSaleForDetail] = useState<Sale | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [voidConfirmSale, setVoidConfirmSale] = useState<Sale | null>(null);

  // Financial Report Print Modal State
  const [isReportPrintOpen, setIsReportPrintOpen] = useState(false);
  const [currentPrintReport, setCurrentPrintReport] = useState<ReportPrintData | null>(null);

  const loadData = async () => {
    const s = await db.sales.reverse().sortBy('createdAt');
    const si = await db.sale_items.toArray();
    const exp = await db.expenses.toArray();
    const p = await db.products.toArray();
    const c = await db.categories.toArray();
    const ing = await db.ingredients.toArray();
    const pur = await db.purchases.toArray();

    // Attach items to sales
    const salesWithItems = s.map((sale) => ({
      ...sale,
      items: si.filter((item) => item.saleId === sale.id),
    }));

    setSales(salesWithItems);
    setSaleItems(si);
    setExpenses(exp);
    setProducts(p);
    setCategories(c);
    setIngredients(ing);
    setPurchases(pur);
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || ['sales', 'expenses', 'products', 'categories', 'ingredients', 'purchases', 'all'].includes(table)) {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  const openReportPrintModal = (reportData: ReportPrintData) => {
    setCurrentPrintReport(reportData);
    setIsReportPrintOpen(true);
  };

  // Helper to get top products from a list of sales
  const getTopProductsFromSales = (targetSales: Sale[], limit = 5) => {
    const saleIds = new Set(targetSales.map((s) => s.id));
    const targetItems = saleItems.filter((i) => saleIds.has(i.saleId));
    const map: Record<string, { name: string; qty: number; total: number; profit: number }> = {};

    targetItems.forEach((item) => {
      const key = item.productId || item.productName;
      if (!map[key]) {
        map[key] = { name: item.productName, qty: 0, total: 0, profit: 0 };
      }
      map[key].qty += item.quantity || 1;
      map[key].total += item.total || 0;
      map[key].profit += item.profit || 0;
    });

    return Object.values(map)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, limit);
  };

  // Helper to calculate payment methods breakdown from a list of sales
  const getPaymentMethodsFromSales = (targetSales: Sale[]) => {
    const methods: Record<string, number> = {
      cash: 0,
      qris: 0,
      transfer: 0,
      debit: 0,
      credit: 0,
      ewallet: 0,
    };
    targetSales.forEach((s) => {
      methods[s.paymentMethod] = (methods[s.paymentMethod] || 0) + s.total;
    });
    return methods;
  };

  // Helper to calculate order types breakdown (Dine In, Take Away, Delivery)
  const getOrderTypesFromSales = (targetSales: Sale[]) => {
    const counts = {
      dine_in: { count: 0, total: 0 },
      take_away: { count: 0, total: 0 },
      delivery: { count: 0, total: 0 },
    };
    targetSales.forEach((s) => {
      const ot = s.orderType || 'dine_in';
      if (counts[ot]) {
        counts[ot].count += 1;
        counts[ot].total += s.total;
      } else {
        counts.dine_in.count += 1;
        counts.dine_in.total += s.total;
      }
    });
    return counts;
  };

  // Helper to group expenses by category
  const getExpensesByCategory = (targetExpenses: Expense[]) => {
    const catMap: Record<string, number> = {};
    targetExpenses.forEach((e) => {
      const key = e.category || 'operasional';
      catMap[key] = (catMap[key] || 0) + e.amount;
    });
    return catMap;
  };

  // Helper to export CSV / Excel compatible file WITH COMPREHENSIVE DATA KESIMPULAN
  const exportCsvReport = (
    filename: string,
    salesList: Sale[],
    options?: {
      title?: string;
      periodLabel?: string;
      totalExpenses?: number;
      topProducts?: { name: string; qty: number; total: number }[];
    }
  ) => {
    const completedSales = salesList.filter((s) => s.status === 'completed');
    const totalSales = completedSales.reduce((acc, s) => acc + s.total, 0);
    const totalHpp = completedSales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const grossProfit = totalSales - totalHpp;
    const totalExpenses = options?.totalExpenses ?? 0;
    const netProfit = grossProfit - totalExpenses;
    const txCount = completedSales.length;
    const aov = txCount > 0 ? Math.round(totalSales / txCount) : 0;
    const grossMarginPercent = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) + '%' : '0%';
    const netMarginPercent = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) + '%' : '0%';
    const methods = getPaymentMethodsFromSales(completedSales);
    const topProducts = options?.topProducts ?? getTopProductsFromSales(completedSales, 5);

    const healthStatus =
      netProfit > 0
        ? grossProfit / (totalSales || 1) >= 0.4
          ? 'SANGAT SEHAT & PROFITABEL TINGGI'
          : 'SEHAT & PROFITABEL'
        : netProfit === 0
        ? 'IMPAS (BREAK EVEN)'
        : 'PERLU EVALUASI PENGELUARAN';

    const periodStr = options?.periodLabel || filename.replace(/^[^-]+-/, '');

    const summaryBlock = [
      `=== LAPORAN KEUANGAN & DATA KESIMPULAN BISNIS ===`,
      `Nama Usaha,${storeSettings.storeName}`,
      `Laporan,${options?.title || 'Laporan Penjualan & Keuangan Toko'}`,
      `Periode,${periodStr}`,
      `Waktu Ekspor,${formatDateTime(new Date().toISOString())}`,
      `Diekspor Oleh,${currentUser.name} (${currentUser.role})`,
      `Status Finansial,${healthStatus}`,
      ``,
      `--- DATA KESIMPULAN & RINGKASAN EKSEKUTIF KEUANGAN ---`,
      `Parameter Indikator,Nominal (Rp) / Nilai,Analisis & Interpretasi Kinerja`,
      `Total Omzet Penjualan (Gross Sales),${Math.round(totalSales)},Total penerimaan dari ${txCount} transaksi kasir`,
      `Total Modal Pokok (HPP / COGS),${Math.round(totalHpp)},Total biaya modal bahan baku & produk terjual`,
      `Laba Kotor Usaha (Gross Profit),${Math.round(grossProfit)},Margin Laba Kotor: ${grossMarginPercent}`,
      `Total Biaya Operasional (Expenses),${Math.round(totalExpenses)},Pengeluaran operasional toko periode ini`,
      `Laba Bersih Usaha (Net Profit),${Math.round(netProfit)},Margin Laba Bersih: ${netMarginPercent}`,
      `Total Transaksi Selesai,${txCount} Transaksi,Volume transaksi berhasil`,
      `Rata-rata per Transaksi (AOV / Basket Size),${Math.round(aov)},Rata-rata nilai belanja per pelanggan`,
      `Rasio Efisiensi Beban Operasional,${totalSales > 0 ? ((totalExpenses / totalSales) * 100).toFixed(1) + '%' : '0%'},Persentase omzet yang terserap biaya operasional`,
      ``,
      `--- DATA KESIMPULAN METODE PEMBAYARAN ---`,
      `Metode Bayar,Total Diterima (Rp),Kontribusi Omzet (%)`,
      `Kas Tunai (Cash),${Math.round(methods.cash)},${totalSales > 0 ? ((methods.cash / totalSales) * 100).toFixed(1) + '%' : '0%'}`,
      `QRIS,${Math.round(methods.qris)},${totalSales > 0 ? ((methods.qris / totalSales) * 100).toFixed(1) + '%' : '0%'}`,
      `Transfer Bank,${Math.round(methods.transfer)},${totalSales > 0 ? ((methods.transfer / totalSales) * 100).toFixed(1) + '%' : '0%'}`,
      `Debit / Kartu Kredit / E-Wallet,${Math.round((methods.debit || 0) + (methods.credit || 0) + (methods.ewallet || 0))},${totalSales > 0 ? (((methods.debit + methods.credit + methods.ewallet) / totalSales) * 100).toFixed(1) + '%' : '0%'}`,
      ``,
      `--- KESIMPULAN PRODUK TERLARIS (TOP CONTRIBUTOR) ---`,
      `Peringkat,Nama Menu / Produk,Jumlah Terjual (Qty),Total Omzet (Rp)`,
      ...topProducts.map((p, idx) => `${idx + 1},"${p.name.replace(/"/g, '""')}",${p.qty},${Math.round(p.total)}`),
      ``,
      `--- KESIMPULAN & REKOMENDASI STRATEGIS BISNIS ---`,
      `Evaluasi Keuntungan,"Usaha menghasilkan Laba Bersih sebesar ${formatRupiah(netProfit)} dengan tingkat margin bersih ${netMarginPercent}."`,
      `Rekomendasi Operasional,"Pertahankan efisiensi HPP dan prioritaskan stok pada ${topProducts[0]?.name ? `menu terlaris (${topProducts[0].name})` : 'menu-menu unggulan'}."`,
      ``,
      `========================================================================`,
      `DAFTAR RINCIAN TRANSAKSI PENJUALAN`,
    ];

    const headers = [
      'No. Invoice',
      'Tanggal',
      'Jam',
      'Kasir',
      'Tipe Pesanan',
      'Meja',
      'Pelanggan',
      'Metode Bayar',
      'Subtotal (Rp)',
      'Diskon (Rp)',
      'Pajak (Rp)',
      'Total Akhir (Rp)',
      'Modal HPP (Rp)',
      'Laba Bersih (Rp)',
      'Status',
    ];

    const rows = salesList.map((s) => [
      s.invoiceNumber,
      s.date,
      s.time || '',
      `"${(s.cashierName || '').replace(/"/g, '""')}"`,
      s.orderType || 'dine_in',
      `"${(s.tableNumber || '-').replace(/"/g, '""')}"`,
      `"${(s.customerName || '-').replace(/"/g, '""')}"`,
      s.paymentMethod,
      s.subtotal || s.total,
      s.discount || 0,
      s.tax || 0,
      s.total,
      s.totalHpp || 0,
      s.totalProfit || 0,
      s.status === 'completed' ? 'Selesai' : 'Batal (Void)',
    ]);

    const csvContent =
      '\uFEFF' +
      [
        ...summaryBlock,
        headers.join(','),
        ...rows.map((r) => r.join(',')),
      ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generic PDF Exporter helper WITH DATA KESIMPULAN
  const exportPdfReport = (
    title: string,
    periodLabel: string,
    data: {
      totalSales: number;
      totalHpp: number;
      grossProfit: number;
      totalExpenses: number;
      netProfit: number;
      txCount: number;
      methods: Record<string, number>;
      topProducts?: { name: string; qty: number; total: number }[];
    }
  ) => {
    try {
      const doc = new jsPDF();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(storeSettings.storeName, 14, 18);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${title} - ${periodLabel}`, 14, 25);
      doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, 14, 30);
      doc.line(14, 33, 196, 33);

      let y = 40;

      // Key Metrics Calculations for Kesimpulan
      const grossMargin = data.totalSales > 0 ? ((data.grossProfit / data.totalSales) * 100).toFixed(1) + '%' : '0%';
      const netMargin = data.totalSales > 0 ? ((data.netProfit / data.totalSales) * 100).toFixed(1) + '%' : '0%';
      const aov = data.txCount > 0 ? Math.round(data.totalSales / data.txCount) : 0;
      const healthStatus = data.netProfit > 0 ? (data.grossProfit / (data.totalSales || 1) >= 0.4 ? 'SANGAT SEHAT & PROFITABEL' : 'PROFITABEL') : 'PERLU EVALUASI';

      // DATA KESIMPULAN EKSEKUTIF BOX
      doc.setFillColor(240, 253, 244);
      doc.rect(14, y, 182, 28, 'F');
      doc.setDrawColor(16, 185, 129);
      doc.rect(14, y, 182, 28, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(16, 185, 129);
      doc.text('DATA KESIMPULAN & ANALISIS EKSEKUTIF KEUANGAN:', 18, y + 6);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(`• Status Kesehatan Finansial: ${healthStatus}`, 18, y + 12);
      doc.text(`• Rata-rata Belanja per Transaksi (AOV): ${formatRupiah(aov)}  |  Total Transaksi: ${data.txCount}`, 18, y + 17);
      doc.text(`• Margin Laba Kotor: ${grossMargin}  |  Margin Laba Bersih: ${netMargin}`, 18, y + 22);

      y += 35;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text('RINCIAN LABA RUGI & FINANSIAL:', 14, y);
      y += 7;

      const printRow = (label: string, value: string, isBold = false) => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(label, 14, y);
        doc.text(value, 180, y, { align: 'right' });
        y += 6;
      };

      printRow('Total Penjualan (Omzet Bruto):', formatRupiah(data.totalSales), true);
      printRow('Total Modal (HPP / COGS):', formatRupiah(data.totalHpp));
      printRow('Laba Kotor (Gross Profit):', formatRupiah(data.grossProfit), true);
      printRow('Total Biaya Operasional:', formatRupiah(data.totalExpenses));
      doc.setDrawColor(200);
      doc.line(14, y - 2, 180, y - 2);
      y += 2;
      printRow('LABA BERSIH OPERASIONAL:', formatRupiah(data.netProfit), true);

      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('RINCIAN METODE PEMBAYARAN:', 14, y);
      y += 7;

      Object.entries(data.methods).forEach(([method, amt]) => {
        if (amt > 0) {
          printRow(`• ${method.toUpperCase()}:`, formatRupiah(amt));
        }
      });

      if (data.topProducts && data.topProducts.length > 0) {
        y += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('5 MENU TERLARIS:', 14, y);
        y += 7;
        data.topProducts.forEach((p, idx) => {
          printRow(`${idx + 1}. ${p.name} (${p.qty}x):`, formatRupiah(p.total));
        });
      }

      doc.save(`${title.replace(/\s+/g, '-')}-${periodLabel.replace(/\s+/g, '-')}.pdf`);
    } catch (err: any) {
      console.error('Export PDF error:', err);
    }
  };

  // 1. DAILY REPORT DATA
  const dailyData = useMemo(() => {
    const daySales = sales.filter((s) => s.date === selectedDate && s.status === 'completed');
    const dayExpenses = expenses.filter((e) => e.date === selectedDate);

    const totalSales = daySales.reduce((acc, s) => acc + s.total, 0);
    const totalHpp = daySales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const grossProfit = totalSales - totalHpp;
    const totalExpenses = dayExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;
    const totalDiscount = daySales.reduce((acc, s) => acc + (s.discount || 0), 0);
    const totalTax = daySales.reduce((acc, s) => acc + (s.tax || 0), 0);
    const aov = daySales.length > 0 ? Math.round(totalSales / daySales.length) : 0;
    const grossMarginPercent = totalSales > 0 ? Number(((grossProfit / totalSales) * 100).toFixed(1)) : 0;
    const netMarginPercent = totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(1)) : 0;

    const methods = getPaymentMethodsFromSales(daySales);
    const orderTypes = getOrderTypesFromSales(daySales);
    const expensesCat = getExpensesByCategory(dayExpenses);
    const topProducts = getTopProductsFromSales(daySales, 5);

    // Hourly Breakdown (08:00 - 22:00)
    const hourlyBuckets = Array.from({ length: 15 }, (_, i) => {
      const hour = i + 8;
      const hourStr = String(hour).padStart(2, '0');
      const count = daySales.filter((s) => s.time?.startsWith(hourStr)).length;
      const total = daySales
        .filter((s) => s.time?.startsWith(hourStr))
        .reduce((acc, s) => acc + s.total, 0);
      return { hour: `${hourStr}:00`, count, total };
    });

    const maxHourlyTotal = Math.max(...hourlyBuckets.map((b) => b.total), 10000);

    return {
      date: selectedDate,
      txCount: daySales.length,
      totalSales,
      totalHpp,
      grossProfit,
      totalExpenses,
      netProfit,
      totalDiscount,
      totalTax,
      aov,
      grossMarginPercent,
      netMarginPercent,
      methods,
      orderTypes,
      expensesCat,
      topProducts,
      hourlyBuckets,
      maxHourlyTotal,
      rawSales: daySales,
      rawExpenses: dayExpenses,
    };
  }, [sales, expenses, selectedDate, saleItems]);

  // 2. WEEKLY REPORT DATA
  const weeklyData = useMemo(() => {
    const anchor = new Date(selectedWeekDate + 'T12:00:00');
    const currentDay = anchor.getDay() === 0 ? 7 : anchor.getDay(); // Monday = 1
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - (currentDay - 1));

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startDateStr = monday.toISOString().slice(0, 10);
    const endDateStr = sunday.toISOString().slice(0, 10);

    const weekSales = sales.filter(
      (s) => s.date >= startDateStr && s.date <= endDateStr && s.status === 'completed'
    );
    const weekExpenses = expenses.filter(
      (e) => e.date >= startDateStr && e.date <= endDateStr
    );

    const totalSales = weekSales.reduce((acc, s) => acc + s.total, 0);
    const totalHpp = weekSales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const grossProfit = totalSales - totalHpp;
    const totalExpenses = weekExpenses.reduce((acc, e) => acc + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;
    const totalDiscount = weekSales.reduce((acc, s) => acc + (s.discount || 0), 0);
    const totalTax = weekSales.reduce((acc, s) => acc + (s.tax || 0), 0);
    const aov = weekSales.length > 0 ? Math.round(totalSales / weekSales.length) : 0;
    const grossMarginPercent = totalSales > 0 ? Number(((grossProfit / totalSales) * 100).toFixed(1)) : 0;
    const netMarginPercent = totalSales > 0 ? Number(((netProfit / totalSales) * 100).toFixed(1)) : 0;

    const days: { label: string; date: string; total: number; profit: number; count: number }[] = [];
    const dayNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = d.toISOString().slice(0, 10);
      const daySales = weekSales.filter((s) => s.date === dStr);
      const total = daySales.reduce((acc, s) => acc + s.total, 0);
      const profit = daySales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);

      days.push({
        label: `${dayNames[i]} (${d.getDate()})`,
        date: dStr,
        total,
        profit,
        count: daySales.length,
      });
    }

    const maxVal = Math.max(...days.map((d) => d.total), 50000);
    const methods = getPaymentMethodsFromSales(weekSales);
    const orderTypes = getOrderTypesFromSales(weekSales);
    const expensesCat = getExpensesByCategory(weekExpenses);
    const topProducts = getTopProductsFromSales(weekSales, 5);

    const periodLabel = `${formatDate(startDateStr)} - ${formatDate(endDateStr)}`;

    return {
      startDate: startDateStr,
      endDate: endDateStr,
      periodLabel,
      days,
      txCount: weekSales.length,
      totalSales,
      totalHpp,
      grossProfit,
      totalExpenses,
      netProfit,
      totalDiscount,
      totalTax,
      aov,
      grossMarginPercent,
      netMarginPercent,
      maxVal,
      methods,
      orderTypes,
      expensesCat,
      topProducts,
      rawSales: weekSales,
      avgPerDay: Math.round(totalSales / 7),
    };
  }, [sales, expenses, selectedWeekDate, saleItems]);

  // 3. MONTHLY REPORT DATA
  const monthlyData = useMemo(() => {
    const monthStr = String(selectedMonth).padStart(2, '0');
    const monthPrefix = `${selectedYear}-${monthStr}`;

    const monthSales = sales.filter((s) => s.date.startsWith(monthPrefix) && s.status === 'completed');
    const monthExpenses = expenses.filter((e) => e.date.startsWith(monthPrefix));

    const totalOmzet = monthSales.reduce((acc, s) => acc + s.total, 0);
    const totalHpp = monthSales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const labaKotor = totalOmzet - totalHpp;
    const totalPengeluaran = monthExpenses.reduce((acc, e) => acc + e.amount, 0);
    const labaBersih = labaKotor - totalPengeluaran;
    const totalDiscount = monthSales.reduce((acc, s) => acc + (s.discount || 0), 0);
    const totalTax = monthSales.reduce((acc, s) => acc + (s.tax || 0), 0);
    const aov = monthSales.length > 0 ? Math.round(totalOmzet / monthSales.length) : 0;
    const grossMarginPercent = totalOmzet > 0 ? Number(((labaKotor / totalOmzet) * 100).toFixed(1)) : 0;
    const netMarginPercent = totalOmzet > 0 ? Number(((labaBersih / totalOmzet) * 100).toFixed(1)) : 0;

    // Breakdown per 4-5 weeks of the month
    const weeksBreakdown: { label: string; range: string; omzet: number; txCount: number }[] = [
      { label: 'Minggu 1 (Tgl 1-7)', range: `${monthPrefix}-01 s/d ${monthPrefix}-07`, omzet: 0, txCount: 0 },
      { label: 'Minggu 2 (Tgl 8-14)', range: `${monthPrefix}-08 s/d ${monthPrefix}-14`, omzet: 0, txCount: 0 },
      { label: 'Minggu 3 (Tgl 15-21)', range: `${monthPrefix}-15 s/d ${monthPrefix}-21`, omzet: 0, txCount: 0 },
      { label: 'Minggu 4 (Tgl 22-28)', range: `${monthPrefix}-22 s/d ${monthPrefix}-28`, omzet: 0, txCount: 0 },
      { label: 'Minggu 5 (Tgl 29-Akhir)', range: `${monthPrefix}-29 s/d Akhir`, omzet: 0, txCount: 0 },
    ];

    monthSales.forEach((s) => {
      const dayNum = parseInt(s.date.slice(8, 10), 10);
      if (dayNum <= 7) {
        weeksBreakdown[0].omzet += s.total;
        weeksBreakdown[0].txCount += 1;
      } else if (dayNum <= 14) {
        weeksBreakdown[1].omzet += s.total;
        weeksBreakdown[1].txCount += 1;
      } else if (dayNum <= 21) {
        weeksBreakdown[2].omzet += s.total;
        weeksBreakdown[2].txCount += 1;
      } else if (dayNum <= 28) {
        weeksBreakdown[3].omzet += s.total;
        weeksBreakdown[3].txCount += 1;
      } else {
        weeksBreakdown[4].omzet += s.total;
        weeksBreakdown[4].txCount += 1;
      }
    });

    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const monthName = `${monthNames[selectedMonth - 1]} ${selectedYear}`;

    const methods = getPaymentMethodsFromSales(monthSales);
    const orderTypes = getOrderTypesFromSales(monthSales);
    const expensesCat = getExpensesByCategory(monthExpenses);
    const topProducts = getTopProductsFromSales(monthSales, 6);

    return {
      monthPrefix,
      monthName,
      txCount: monthSales.length,
      totalOmzet,
      totalHpp,
      labaKotor,
      totalPengeluaran,
      labaBersih,
      totalDiscount,
      totalTax,
      grossMarginPercent,
      netMarginPercent,
      aov,
      weeksBreakdown,
      methods,
      orderTypes,
      expensesCat,
      topProducts,
      rawSales: monthSales,
      rawExpenses: monthExpenses,
    };
  }, [sales, expenses, selectedMonth, selectedYear, saleItems]);

  // 4. CUSTOM DATE RANGE REPORT DATA ("Atur Tanggal")
  const customRangeData = useMemo(() => {
    const start = customStartDate;
    const end = customEndDate;

    const rangeSales = sales.filter((s) => s.date >= start && s.date <= end && s.status === 'completed');
    const rangeExpenses = expenses.filter((e) => e.date >= start && e.date <= end);

    const totalOmzet = rangeSales.reduce((acc, s) => acc + s.total, 0);
    const totalHpp = rangeSales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const labaKotor = totalOmzet - totalHpp;
    const totalPengeluaran = rangeExpenses.reduce((acc, e) => acc + e.amount, 0);
    const labaBersih = labaKotor - totalPengeluaran;
    const totalDiscount = rangeSales.reduce((acc, s) => acc + (s.discount || 0), 0);
    const totalTax = rangeSales.reduce((acc, s) => acc + (s.tax || 0), 0);

    const methods = getPaymentMethodsFromSales(rangeSales);
    const orderTypes = getOrderTypesFromSales(rangeSales);
    const expensesCat = getExpensesByCategory(rangeExpenses);
    const topProducts = getTopProductsFromSales(rangeSales, 6);
    const aov = rangeSales.length > 0 ? Math.round(totalOmzet / rangeSales.length) : 0;
    const grossMarginPercent = totalOmzet > 0 ? Number(((labaKotor / totalOmzet) * 100).toFixed(1)) : 0;
    const netMarginPercent = totalOmzet > 0 ? Number(((labaBersih / totalOmzet) * 100).toFixed(1)) : 0;
    const periodLabel = `${formatDate(start)} s/d ${formatDate(end)}`;

    return {
      start,
      end,
      periodLabel,
      txCount: rangeSales.length,
      totalOmzet,
      totalHpp,
      labaKotor,
      totalPengeluaran,
      labaBersih,
      totalDiscount,
      totalTax,
      aov,
      grossMarginPercent,
      netMarginPercent,
      methods,
      orderTypes,
      expensesCat,
      topProducts,
      rawSales: rangeSales,
      rawExpenses: rangeExpenses,
    };
  }, [sales, expenses, customStartDate, customEndDate, saleItems]);

  // 5. YEARLY REPORT DATA (Jan - Dec)
  const yearlyData = useMemo(() => {
    const year = selectedYear;
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];

    const monthlyBreakdown = months.map((mName, idx) => {
      const mStr = `${year}-${String(idx + 1).padStart(2, '0')}`;
      const mSales = sales.filter((s) => s.date.startsWith(mStr) && s.status === 'completed');
      const omzet = mSales.reduce((acc, s) => acc + s.total, 0);
      const profit = mSales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);
      return { monthName: mName, omzet, profit, txCount: mSales.length };
    });

    const totalOmzet = monthlyBreakdown.reduce((acc, m) => acc + m.omzet, 0);
    const totalProfit = monthlyBreakdown.reduce((acc, m) => acc + m.profit, 0);
    const maxOmzet = Math.max(...monthlyBreakdown.map((m) => m.omzet), 100000);

    return { year, totalOmzet, totalProfit, monthlyBreakdown, maxOmzet };
  }, [sales, selectedYear]);

  // 6. SALES INSIGHTS & STRATEGY
  const salesInsights = useMemo(() => {
    const completedSales = sales.filter((s) => s.status === 'completed');
    const totalRevenue = completedSales.reduce((acc, s) => acc + s.total, 0);
    const totalProfit = completedSales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);
    const totalHpp = completedSales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const txCount = completedSales.length;
    const aov = txCount > 0 ? Math.round(totalRevenue / txCount) : 0;
    const grossMarginPercent = totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(1)) : 0;

    // Peak Hours Calculation
    const hourMap: Record<number, { count: number; total: number }> = {};
    completedSales.forEach((s) => {
      if (s.time) {
        const hour = parseInt(s.time.slice(0, 2), 10);
        if (!isNaN(hour)) {
          if (!hourMap[hour]) hourMap[hour] = { count: 0, total: 0 };
          hourMap[hour].count += 1;
          hourMap[hour].total += s.total;
        }
      }
    });

    const hourEntries = Object.entries(hourMap).map(([h, data]) => ({
      hour: parseInt(h, 10),
      count: data.count,
      total: data.total,
    }));
    hourEntries.sort((a, b) => b.count - a.count);

    const peakHour1 = hourEntries[0]
      ? `${String(hourEntries[0].hour).padStart(2, '0')}:00 - ${String(hourEntries[0].hour + 1).padStart(2, '0')}:00`
      : '12:00 - 14:00 (Makan Siang)';
    const peakHour2 = hourEntries[1]
      ? `${String(hourEntries[1].hour).padStart(2, '0')}:00 - ${String(hourEntries[1].hour + 1).padStart(2, '0')}:00`
      : '19:00 - 21:00 (Nongkrong Malam)';

    // Day of Week Performance
    const dayMap: Record<string, { count: number; total: number }> = {
      Senin: { count: 0, total: 0 },
      Selasa: { count: 0, total: 0 },
      Rabu: { count: 0, total: 0 },
      Kamis: { count: 0, total: 0 },
      Jumat: { count: 0, total: 0 },
      Sabtu: { count: 0, total: 0 },
      Minggu: { count: 0, total: 0 },
    };

    completedSales.forEach((s) => {
      try {
        const d = new Date(s.date + 'T12:00:00');
        const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d);
        if (dayMap[dayName]) {
          dayMap[dayName].count += 1;
          dayMap[dayName].total += s.total;
        }
      } catch (e) {}
    });

    const dayEntries = Object.entries(dayMap).sort((a, b) => b[1].total - a[1].total);
    const bestDayName = dayEntries[0] && dayEntries[0][1].total > 0 ? dayEntries[0][0] : 'Sabtu & Minggu';

    // Product Quantity & Profit Analysis
    const productStats: Record<string, { product: Product; qty: number; totalSales: number; totalProfit: number }> = {};
    saleItems.forEach((item) => {
      const p = products.find((prod) => prod.id === item.productId);
      if (!p) return;
      if (!productStats[item.productId]) {
        productStats[item.productId] = { product: p, qty: 0, totalSales: 0, totalProfit: 0 };
      }
      productStats[item.productId].qty += item.quantity;
      productStats[item.productId].totalSales += item.total;
      productStats[item.productId].totalProfit += item.profit;
    });

    const statList = Object.values(productStats);
    const avgQty = statList.length > 0 ? statList.reduce((acc, s) => acc + s.qty, 0) / statList.length : 1;

    const stars = statList.filter((s) => s.qty >= avgQty && s.product.margin >= 60);
    const plowhorses = statList.filter((s) => s.qty >= avgQty && s.product.margin < 60);
    const puzzles = statList.filter((s) => s.qty < avgQty && s.product.margin >= 60);
    const dogs = statList.filter((s) => s.qty < avgQty && s.product.margin < 60);

    const topSellingProducts = [...statList].sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topProfitProducts = [...statList].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 5);

    let healthScore = 88;
    let healthLabel = 'Performa Sangat Bagus & Margin Sehat';
    let healthColor = 'text-emerald-700 bg-emerald-100 border-emerald-300';
    if (grossMarginPercent < 50 && grossMarginPercent > 0) {
      healthScore = 68;
      healthLabel = 'Perlu Efisiensi HPP & Penyesuaian Harga';
      healthColor = 'text-amber-700 bg-amber-100 border-amber-300';
    } else if (txCount < 5) {
      healthScore = 72;
      healthLabel = 'Pertumbuhan Baru Dimulai';
      healthColor = 'text-blue-700 bg-blue-100 border-blue-300';
    }

    return {
      totalRevenue,
      totalProfit,
      totalHpp,
      txCount,
      aov,
      grossMarginPercent,
      peakHour1,
      peakHour2,
      bestDayName,
      stars,
      plowhorses,
      puzzles,
      dogs,
      topSellingProducts,
      topProfitProducts,
      healthScore,
      healthLabel,
      healthColor,
    };
  }, [sales, saleItems, products]);

  // FILTERED TRANSACTIONS
  const filteredSales = useMemo(() => {
    let result = sales;

    const today = getTodayDateString();
    const yest = new Date();
    yest.setDate(yest.getDate() - 1);
    const yesterday = yest.toISOString().slice(0, 10);

    if (txDateRange === 'today') {
      result = result.filter((s) => s.date === today);
    } else if (txDateRange === 'yesterday') {
      result = result.filter((s) => s.date === yesterday);
    } else if (txDateRange === 'week') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekStr = sevenDaysAgo.toISOString().slice(0, 10);
      result = result.filter((s) => s.date >= weekStr);
    } else if (txDateRange === 'month') {
      const startOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
      result = result.filter((s) => s.date >= startOfMonth);
    }

    if (txFilterMethod !== 'all') {
      result = result.filter((s) => s.paymentMethod === txFilterMethod);
    }

    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      result = result.filter(
        (s) =>
          s.invoiceNumber.toLowerCase().includes(q) ||
          s.cashierName.toLowerCase().includes(q) ||
          s.customerName?.toLowerCase().includes(q) ||
          s.tableNumber?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [sales, txDateRange, txFilterMethod, txSearch]);

  // Void / Cancel Transaction with Restock
  const handleVoidSale = (sale: Sale) => {
    if (currentUser.role !== 'admin') {
      alert('Hanya Akun Admin/Owner yang berhak membatalkan (void) transaksi.');
      return;
    }
    setVoidConfirmSale(sale);
  };

  const executeVoidSale = async () => {
    if (!voidConfirmSale) return;
    const sale = voidConfirmSale;

    try {
      const now = new Date().toISOString();
      await db.sales.update(sale.id, { status: 'voided' });

      for (const item of sale.items || []) {
        const prod = await db.products.get(item.productId);
        if (prod) {
          const restoredStock = prod.stock + item.quantity;
          await db.products.update(prod.id, {
            stock: restoredStock,
            updatedAt: now,
          });

          await db.stock_movements.add({
            id: `sm-void-${Date.now()}-${item.productId}`,
            date: now,
            productId: prod.id,
            productName: prod.name,
            type: 'adjustment',
            referenceNumber: `VOID-${sale.invoiceNumber}`,
            quantity: item.quantity,
            initialStock: prod.stock,
            finalStock: restoredStock,
            notes: `Pembatalan transaksi ${sale.invoiceNumber}`,
            createdAt: now,
          });
        }
      }

      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: now,
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'VOID_TRANSACTION',
        details: `Membatalkan transaksi ${sale.invoiceNumber} senilai ${formatRupiah(sale.total)}`,
      });

      if (supabaseService.isConfigured()) {
        await supabaseService.voidSale(sale.id);
      }

      setVoidConfirmSale(null);
      await loadData();
    } catch (err: any) {
      alert('Gagal membatalkan transaksi: ' + err.message);
    }
  };

  // Quick preset dates for custom date range
  const handleQuickPreset = (preset: 'last7' | 'last30' | 'thisMonth' | 'lastMonth') => {
    const today = new Date();
    const todayYMD = today.toISOString().slice(0, 10);

    if (preset === 'last7') {
      const d7 = new Date(today);
      d7.setDate(today.getDate() - 6);
      setCustomStartDate(d7.toISOString().slice(0, 10));
      setCustomEndDate(todayYMD);
    } else if (preset === 'last30') {
      const d30 = new Date(today);
      d30.setDate(today.getDate() - 29);
      setCustomStartDate(d30.toISOString().slice(0, 10));
      setCustomEndDate(todayYMD);
    } else if (preset === 'thisMonth') {
      const start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      setCustomStartDate(start);
      setCustomEndDate(todayYMD);
    } else if (preset === 'lastMonth') {
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setCustomStartDate(prevMonth.toISOString().slice(0, 10));
      setCustomEndDate(lastDayPrevMonth.toISOString().slice(0, 10));
    }
  };

  // Reusable Component: Financial Accounting Income Statement (Laporan Laba Rugi)
  const renderIncomeStatement = (data: {
    totalSales: number;
    totalDiscount: number;
    totalHpp: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    totalTax: number;
    expensesCat: Record<string, number>;
  }) => {
    const netSales = data.totalSales; // totalSales is already net of discounts in POS
    const grossSales = netSales + data.totalDiscount;

    return (
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">
                Laporan Laba Rugi Operasional (P&amp;L Statement)
              </h3>
              <p className="text-xs text-slate-400">
                Format standar akuntansi: Omzet kotor, potongan diskon, HPP produk, dan beban usaha
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            Standar F&amp;B
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              <tr className="bg-slate-50/50 font-bold text-slate-800">
                <td className="py-2.5 px-3">Pendapatan Penjualan Bruto (Gross Sales)</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                  {formatRupiah(grossSales)}
                </td>
              </tr>
              {data.totalDiscount > 0 && (
                <tr className="text-rose-600">
                  <td className="py-2 px-3 pl-6">(-) Potongan Diskon Promosi &amp; Voucher</td>
                  <td className="py-2 px-3 text-right font-mono font-medium">
                    -{formatRupiah(data.totalDiscount)}
                  </td>
                </tr>
              )}
              <tr className="font-bold text-emerald-800 bg-emerald-50/40">
                <td className="py-2.5 px-3">(=) Penjualan Bersih (Net Revenue)</td>
                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-700">
                  {formatRupiah(netSales)}
                </td>
              </tr>
              <tr className="text-blue-700">
                <td className="py-2.5 px-3 pl-6">
                  (-) Beban Pokok Penjualan (HPP / Biaya Bahan Baku &amp; Kemasan)
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold">
                  -{formatRupiah(data.totalHpp)}
                </td>
              </tr>
              <tr className="font-black text-slate-900 bg-slate-100/70 border-t-2 border-slate-300">
                <td className="py-3 px-3">
                  (=) LABA KOTOR (GROSS PROFIT)
                  <span className="ml-2 font-normal text-[11px] text-emerald-700 font-mono">
                    (Margin: {netSales > 0 ? ((data.grossProfit / netSales) * 100).toFixed(1) : 0}%)
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-mono font-black text-sm text-slate-900">
                  {formatRupiah(data.grossProfit)}
                </td>
              </tr>

              {/* Rincian Beban Operasional */}
              <tr className="text-slate-500 font-bold text-[11px] uppercase tracking-wider bg-slate-50/30">
                <td colSpan={2} className="pt-3 pb-1 px-3">
                  (-) Beban &amp; Pengeluaran Operasional Toko:
                </td>
              </tr>
              {Object.keys(data.expensesCat).length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-2 px-6 text-slate-400 italic text-[11px]">
                    Belum ada pencatatan biaya operasional pada periode ini.
                  </td>
                </tr>
              ) : (
                Object.entries(data.expensesCat).map(([cat, amt]) => (
                  <tr key={cat} className="text-slate-600">
                    <td className="py-1.5 px-3 pl-8 capitalize">
                      • Beban {cat}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-rose-600">
                      -{formatRupiah(amt)}
                    </td>
                  </tr>
                ))
              )}
              <tr className="text-rose-700 font-bold bg-rose-50/30">
                <td className="py-2 px-3 pl-6">Total Beban Operasional</td>
                <td className="py-2 px-3 text-right font-mono font-bold">
                  -{formatRupiah(data.totalExpenses)}
                </td>
              </tr>

              {/* Laba Bersih Akhir */}
              <tr className="font-black bg-gradient-to-r from-emerald-100 via-emerald-50 to-teal-100 border-t-2 border-emerald-400 text-slate-900">
                <td className="py-3.5 px-3 text-sm">
                  (=) LABA BERSIH OPERASIONAL (NET PROFIT)
                  <span className="ml-2 font-normal text-xs text-emerald-800 font-mono">
                    (Net Margin: {netSales > 0 ? ((data.netProfit / netSales) * 100).toFixed(1) : 0}%)
                  </span>
                </td>
                <td className="py-3.5 px-3 text-right font-mono font-black text-base text-emerald-800">
                  {formatRupiah(data.netProfit)}
                </td>
              </tr>

              {data.totalTax > 0 && (
                <tr className="text-[11px] text-slate-500 bg-slate-50/50">
                  <td className="py-2 px-3">
                    ℹ️ Pajak Penjualan (PB1 / Restoran) yang dipungut untuk setoran kas daerah
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                    {formatRupiah(data.totalTax)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Reusable Component: Multi-Dimension Breakdown (Payment Methods & Order Types)
  const renderBreakdownCards = (methods: Record<string, number>, orderTypes: any, totalSales: number) => {
    const methodList = [
      { key: 'cash', label: 'Tunai (Cash)', color: 'bg-emerald-500', amt: methods.cash || 0 },
      { key: 'qris', label: 'QRIS', color: 'bg-blue-500', amt: methods.qris || 0 },
      { key: 'transfer', label: 'Transfer Bank', color: 'bg-purple-500', amt: methods.transfer || 0 },
      { key: 'debit', label: 'Debit & Kartu', color: 'bg-indigo-500', amt: (methods.debit || 0) + (methods.credit || 0) },
      { key: 'ewallet', label: 'E-Wallet', color: 'bg-amber-500', amt: methods.ewallet || 0 },
    ].filter((m) => m.amt > 0);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Payment Methods */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-600" />
              <span>Komposisi Metode Pembayaran</span>
            </h4>
            <span className="text-xs text-slate-400 font-mono">
              Total {formatRupiah(totalSales)}
            </span>
          </div>

          <div className="space-y-3">
            {methodList.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Belum ada transaksi.</p>
            ) : (
              methodList.map((m) => {
                const pct = totalSales > 0 ? Math.round((m.amt / totalSales) * 100) : 0;
                return (
                  <div key={m.key} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-slate-700">{m.label}</span>
                      <span className="font-mono text-slate-900">
                        {formatRupiah(m.amt)} <span className="text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.color} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Order Types */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Utensils className="w-4 h-4 text-amber-600" />
              <span>Distribusi Tipe Pesanan</span>
            </h4>
            <span className="text-xs text-slate-400">Dine In vs Take Away</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100 text-center">
              <span className="text-[11px] font-bold text-amber-900 block">Dine In</span>
              <div className="text-lg font-black text-amber-950 mt-1">
                {orderTypes.dine_in.count} <span className="text-xs font-medium">Nota</span>
              </div>
              <span className="text-[10px] text-amber-700 font-mono mt-0.5 block">
                {formatRupiah(orderTypes.dine_in.total)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-100 text-center">
              <span className="text-[11px] font-bold text-emerald-900 block">Take Away</span>
              <div className="text-lg font-black text-emerald-950 mt-1">
                {orderTypes.take_away.count} <span className="text-xs font-medium">Nota</span>
              </div>
              <span className="text-[10px] text-emerald-700 font-mono mt-0.5 block">
                {formatRupiah(orderTypes.take_away.total)}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-100 text-center">
              <span className="text-[11px] font-bold text-blue-900 block">Delivery</span>
              <div className="text-lg font-black text-blue-950 mt-1">
                {orderTypes.delivery.count} <span className="text-xs font-medium">Nota</span>
              </div>
              <span className="text-[10px] text-blue-700 font-mono mt-0.5 block">
                {formatRupiah(orderTypes.delivery.total)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Reusable Component: Detailed Transactions Table inside reports
  const renderTransactionsTable = (targetSales: Sale[], periodName: string) => {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-2">
        <div className="p-4 sm:p-5 pb-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900">
              Daftar Transaksi Rinci ({targetSales.length} Transaksi)
            </h4>
            <p className="text-xs text-slate-400">
              Seluruh riwayat pembayaran, nama tamu, kasir, modal HPP, dan laba transaksi
            </p>
          </div>
          <button
            onClick={() => exportCsvReport(`Transaksi-${periodName.replace(/\s+/g, '-')}`, targetSales)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV (Excel)</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Invoice</th>
                <th className="py-3 px-3">Waktu</th>
                <th className="py-3 px-3">Kasir</th>
                <th className="py-3 px-3">Tipe / Meja</th>
                <th className="py-3 px-3">Rincian Item</th>
                <th className="py-3 px-3">Metode</th>
                <th className="py-3 px-3 text-right">Total Bayar</th>
                <th className="py-3 px-3 text-right">HPP</th>
                <th className="py-3 px-3 text-right">Laba Bersih</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {targetSales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    Belum ada transaksi pada periode ini.
                  </td>
                </tr>
              ) : (
                targetSales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                      {s.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {s.date} {s.time}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{s.cashierName}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800 block text-[11px]">
                        {s.orderType === 'dine_in' ? 'Dine In' : s.orderType === 'take_away' ? 'Take Away' : 'Delivery'}
                      </span>
                      {s.tableNumber && (
                        <span className="text-[10px] text-slate-400">{s.tableNumber}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 max-w-[200px]">
                      <div className="truncate text-slate-700 font-medium">
                        {(s.items || []).map((it) => `${it.quantity}x ${it.productName}`).join(', ') || '-'}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded uppercase font-bold text-[10px] bg-slate-100 text-slate-700">
                        {s.paymentMethod}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(s.total)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                      {formatRupiah(s.totalHpp || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                      +{formatRupiah(s.totalProfit || 0)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedSaleForDetail(s);
                          setIsReceiptModalOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                        title="Lihat Nota Struk"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-4 select-none">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
            Laporan &amp; Analisis Finansial
          </h2>
          <p className="text-xs text-slate-400">
            Laporan laba rugi, omzet, HPP pokok, rincian transaksi, dan cetak slip kasir.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl gap-1 overflow-x-auto max-w-full shadow-2xs">
          {[
            { id: 'daily', label: 'Harian' },
            { id: 'weekly', label: 'Mingguan' },
            { id: 'monthly', label: 'Bulanan' },
            { id: 'custom', label: '📅 Atur Tanggal' },
            { id: 'yearly', label: 'Tahunan' },
            { id: 'balance_sheet', label: '⚖️ Neraca Keuangan' },
            { id: 'insights', label: '💡 Kesimpulan Omzet' },
            { id: 'transactions', label: 'Semua Transaksi' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. LAPORAN HARIAN */}
      {tab === 'daily' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Date Picker & Action Buttons */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-700">Pilih Tanggal:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setSelectedDate(getTodayDateString())}
                className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer"
              >
                Hari Ini
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportCsvReport(`Laporan-Harian-${dailyData.date}`, dailyData.rawSales, {
                    title: 'Laporan Penjualan Harian',
                    periodLabel: formatDate(dailyData.date),
                    totalExpenses: dailyData.totalExpenses,
                    topProducts: dailyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportPdfReport('Laporan Penjualan Harian', formatDate(dailyData.date), {
                    totalSales: dailyData.totalSales,
                    totalHpp: dailyData.totalHpp,
                    grossProfit: dailyData.grossProfit,
                    totalExpenses: dailyData.totalExpenses,
                    netProfit: dailyData.netProfit,
                    txCount: dailyData.txCount,
                    methods: dailyData.methods,
                    topProducts: dailyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openReportPrintModal({
                    title: 'LAPORAN PENJUALAN HARIAN',
                    periodLabel: formatDate(dailyData.date),
                    startDate: dailyData.date,
                    endDate: dailyData.date,
                    totalSales: dailyData.totalSales,
                    txCount: dailyData.txCount,
                    totalHpp: dailyData.totalHpp,
                    grossProfit: dailyData.grossProfit,
                    totalExpenses: dailyData.totalExpenses,
                    netProfit: dailyData.netProfit,
                    paymentMethods: dailyData.methods,
                    topProducts: dailyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Slip Thermal</span>
              </button>
            </div>
          </div>

          {/* Daily Metrics 4-Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Omzet Penjualan</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatRupiah(dailyData.totalSales)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  {dailyData.txCount} Transaksi Selesai (AOV {formatRupiah(dailyData.aov)})
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Modal / HPP</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-blue-700">
                  {formatRupiah(dailyData.totalHpp)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Food Cost: {dailyData.totalSales > 0 ? ((dailyData.totalHpp / dailyData.totalSales) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Kotor (Gross)</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">
                  {formatRupiah(dailyData.grossProfit)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  Margin Kotor: {dailyData.grossMarginPercent}%
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Bersih Riil</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-amber-600">
                  {formatRupiah(dailyData.netProfit)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Biaya: -{formatRupiah(dailyData.totalExpenses)}
                </div>
              </div>
            </div>
          </div>

          {/* Income Statement (Laporan Laba Rugi Akuntansi) */}
          {renderIncomeStatement({
            totalSales: dailyData.totalSales,
            totalDiscount: dailyData.totalDiscount,
            totalHpp: dailyData.totalHpp,
            grossProfit: dailyData.grossProfit,
            totalExpenses: dailyData.totalExpenses,
            netProfit: dailyData.netProfit,
            totalTax: dailyData.totalTax,
            expensesCat: dailyData.expensesCat,
          })}

          {/* Breakdown Cards: Payment Methods & Order Types */}
          {renderBreakdownCards(dailyData.methods, dailyData.orderTypes, dailyData.totalSales)}

          {/* Hourly Sales Bar Chart */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-600" />
                <span>Distribusi Penjualan per Jam (08:00 - 22:00)</span>
              </h4>
              <span className="text-xs text-slate-400 font-mono">Volume Jam Sibuk</span>
            </div>
            <div className="h-44 flex items-end gap-1.5 border-b border-slate-200 pb-1">
              {dailyData.hourlyBuckets.map((bucket, idx) => {
                const heightPct = Math.max(8, Math.round((bucket.total / dailyData.maxHourlyTotal) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[24px] bg-emerald-500 group-hover:bg-emerald-600 rounded-t transition-all relative"
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold py-0.5 px-1.5 rounded pointer-events-none whitespace-nowrap z-10 shadow">
                        {formatRupiah(bucket.total)} ({bucket.count} tx)
                      </div>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono mt-1">
                      {bucket.hour.slice(0, 2)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Transaction List */}
          {renderTransactionsTable(dailyData.rawSales, `Harian-${dailyData.date}`)}
        </div>
      )}

      {/* 2. LAPORAN MINGGUAN */}
      {tab === 'weekly' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Week Selector & Action Header */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Pilih Minggu:</span>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedWeekDate);
                    d.setDate(d.getDate() - 7);
                    setSelectedWeekDate(d.toISOString().slice(0, 10));
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 transition cursor-pointer"
                >
                  ◀ Minggu Lalu
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedWeekDate(getTodayDateString())}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-white text-emerald-800 shadow-2xs cursor-pointer"
                >
                  Minggu Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedWeekDate);
                    d.setDate(d.getDate() + 7);
                    setSelectedWeekDate(d.toISOString().slice(0, 10));
                  }}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg text-slate-600 hover:bg-white hover:text-slate-900 transition cursor-pointer"
                >
                  Minggu Depan ▶
                </button>
              </div>

              <div className="flex items-center gap-1.5 pl-2 text-xs font-bold text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>{weeklyData.periodLabel}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportCsvReport(`Laporan-Mingguan-${weeklyData.startDate}`, weeklyData.rawSales, {
                    title: 'Laporan Penjualan Mingguan',
                    periodLabel: weeklyData.periodLabel,
                    totalExpenses: weeklyData.totalExpenses,
                    topProducts: weeklyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  exportPdfReport('Laporan Penjualan Mingguan', weeklyData.periodLabel, {
                    totalSales: weeklyData.totalSales,
                    totalHpp: weeklyData.totalHpp,
                    grossProfit: weeklyData.grossProfit,
                    totalExpenses: weeklyData.totalExpenses,
                    netProfit: weeklyData.netProfit,
                    txCount: weeklyData.txCount,
                    methods: weeklyData.methods,
                    topProducts: weeklyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openReportPrintModal({
                    title: 'LAPORAN PENJUALAN MINGGUAN',
                    periodLabel: weeklyData.periodLabel,
                    startDate: weeklyData.startDate,
                    endDate: weeklyData.endDate,
                    totalSales: weeklyData.totalSales,
                    txCount: weeklyData.txCount,
                    totalHpp: weeklyData.totalHpp,
                    grossProfit: weeklyData.grossProfit,
                    totalExpenses: weeklyData.totalExpenses,
                    netProfit: weeklyData.netProfit,
                    paymentMethods: weeklyData.methods,
                    topProducts: weeklyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Laporan Mingguan</span>
              </button>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Omzet Minggu Ini</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatRupiah(weeklyData.totalSales)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  {weeklyData.txCount} Nota (Rata-rata {formatRupiah(weeklyData.avgPerDay)}/hari)
                </div>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Modal (HPP)</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-blue-700">
                  {formatRupiah(weeklyData.totalHpp)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Bahan &amp; Pokok Barang</div>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Kotor Mingguan</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">
                  {formatRupiah(weeklyData.grossProfit)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Margin: {weeklyData.grossMarginPercent}%
                </div>
              </div>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Bersih Mingguan</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-amber-600">
                  {formatRupiah(weeklyData.netProfit)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Biaya: -{formatRupiah(weeklyData.totalExpenses)}
                </div>
              </div>
            </div>
          </div>

          {/* Income Statement */}
          {renderIncomeStatement({
            totalSales: weeklyData.totalSales,
            totalDiscount: weeklyData.totalDiscount,
            totalHpp: weeklyData.totalHpp,
            grossProfit: weeklyData.grossProfit,
            totalExpenses: weeklyData.totalExpenses,
            netProfit: weeklyData.netProfit,
            totalTax: weeklyData.totalTax,
            expensesCat: weeklyData.expensesCat,
          })}

          {/* Monday to Sunday Chart & Daily Breakdown */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-800">
                Tren Penjualan Harian (Senin s/d Minggu)
              </h4>
              <span className="text-xs text-slate-400 font-mono">Perbandingan Hari</span>
            </div>

            <div className="h-44 flex items-end gap-2 border-b border-slate-200 pb-1">
              {weeklyData.days.map((item, idx) => {
                const heightPct = Math.max(10, Math.round((item.total / weeklyData.maxVal) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[36px] bg-emerald-500 group-hover:bg-emerald-600 rounded-t transition-all relative flex items-start justify-center"
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[9px] font-bold py-0.5 px-1.5 rounded pointer-events-none whitespace-nowrap z-10 shadow">
                        {formatRupiah(item.total)} ({item.count} tx)
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold mt-1.5 truncate max-w-full">
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Breakdown Cards */}
          {renderBreakdownCards(weeklyData.methods, weeklyData.orderTypes, weeklyData.totalSales)}

          {/* Transactions list */}
          {renderTransactionsTable(weeklyData.rawSales, weeklyData.periodLabel)}
        </div>
      )}

      {/* 3. LAPORAN BULANAN */}
      {tab === 'monthly' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Month Selector */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Pilih Bulan &amp; Tahun:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                {[
                  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
                  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
                ].map((m, idx) => (
                  <option key={idx} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  exportCsvReport(`Laporan-Bulanan-${monthlyData.monthPrefix}`, monthlyData.rawSales, {
                    title: 'Laporan Penjualan Bulanan',
                    periodLabel: monthlyData.monthName,
                    totalExpenses: monthlyData.totalPengeluaran,
                    topProducts: monthlyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openReportPrintModal({
                    title: 'LAPORAN KEUANGAN BULANAN',
                    periodLabel: monthlyData.monthName,
                    startDate: `${monthlyData.monthPrefix}-01`,
                    endDate: `${monthlyData.monthPrefix}-31`,
                    totalSales: monthlyData.totalOmzet,
                    txCount: monthlyData.txCount,
                    totalHpp: monthlyData.totalHpp,
                    grossProfit: monthlyData.labaKotor,
                    totalExpenses: monthlyData.totalPengeluaran,
                    netProfit: monthlyData.labaBersih,
                    paymentMethods: monthlyData.methods,
                    topProducts: monthlyData.topProducts,
                  })
                }
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Laporan Bulanan</span>
              </button>
            </div>
          </div>

          {/* Monthly Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Omzet Bulan Ini</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatRupiah(monthlyData.totalOmzet)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  {monthlyData.txCount} Transaksi (AOV {formatRupiah(monthlyData.aov)})
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Modal / HPP</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-blue-700">
                  {formatRupiah(monthlyData.totalHpp)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Bahan Pokok F&amp;B</div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Kotor (Gross)</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">
                  {formatRupiah(monthlyData.labaKotor)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  Margin: {monthlyData.grossMarginPercent}%
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Bersih Akhir</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-amber-600">
                  {formatRupiah(monthlyData.labaBersih)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Biaya: -{formatRupiah(monthlyData.totalPengeluaran)}
                </div>
              </div>
            </div>
          </div>

          {/* Income Statement */}
          {renderIncomeStatement({
            totalSales: monthlyData.totalOmzet,
            totalDiscount: monthlyData.totalDiscount,
            totalHpp: monthlyData.totalHpp,
            grossProfit: monthlyData.labaKotor,
            totalExpenses: monthlyData.totalPengeluaran,
            netProfit: monthlyData.labaBersih,
            totalTax: monthlyData.totalTax,
            expensesCat: monthlyData.expensesCat,
          })}

          {/* Breakdown per Pekan di Bulan Tersebut */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h4 className="font-bold text-sm text-slate-800">
              Rincian Omzet per Pekan di Bulan {monthlyData.monthName}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {monthlyData.weeksBreakdown.map((w, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="text-xs font-bold text-slate-700">{w.label}</div>
                  <div className="text-base font-black text-slate-900">{formatRupiah(w.omzet)}</div>
                  <div className="text-[11px] text-slate-400">{w.txCount} transaksi berhasil</div>
                </div>
              ))}
            </div>
          </div>

          {/* Breakdown Cards */}
          {renderBreakdownCards(monthlyData.methods, monthlyData.orderTypes, monthlyData.totalOmzet)}

          {/* Transactions list */}
          {renderTransactionsTable(monthlyData.rawSales, monthlyData.monthName)}
        </div>
      )}

      {/* 4. ATUR TANGGAL (CUSTOM DATE RANGE REPORT) */}
      {tab === 'custom' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Date Range Picker Bar */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700">Dari:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700">Sampai:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    exportCsvReport(`Laporan-Kustom-${customStartDate}-sd-${customEndDate}`, customRangeData.rawSales, {
                      title: 'Laporan Penjualan Rentang Tanggal',
                      periodLabel: customRangeData.periodLabel,
                      totalExpenses: customRangeData.totalPengeluaran,
                      topProducts: customRangeData.topProducts,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openReportPrintModal({
                      title: 'LAPORAN KEUANGAN PERIODE',
                      periodLabel: customRangeData.periodLabel,
                      startDate: customStartDate,
                      endDate: customEndDate,
                      totalSales: customRangeData.totalOmzet,
                      txCount: customRangeData.txCount,
                      totalHpp: customRangeData.totalHpp,
                      grossProfit: customRangeData.labaKotor,
                      totalExpenses: customRangeData.totalPengeluaran,
                      netProfit: customRangeData.labaBersih,
                      paymentMethods: customRangeData.methods,
                      topProducts: customRangeData.topProducts,
                    })
                  }
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Laporan Periode</span>
                </button>
              </div>
            </div>

            {/* Quick Filter Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-medium mr-1">Preset Cepat:</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('last7')}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                7 Hari Terakhir
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('last30')}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                30 Hari Terakhir
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('thisMonth')}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('lastMonth')}
                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
              >
                Bulan Lalu
              </button>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Omzet Periode</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatRupiah(customRangeData.totalOmzet)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  {customRangeData.txCount} Transaksi (AOV {formatRupiah(customRangeData.aov)})
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Total Modal / HPP</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-blue-700">
                  {formatRupiah(customRangeData.totalHpp)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Modal Bahan &amp; Kemasan</div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Kotor (Gross)</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">
                  {formatRupiah(customRangeData.labaKotor)}
                </div>
                <div className="text-[11px] text-emerald-600 font-bold mt-1">
                  Margin: {customRangeData.grossMarginPercent}%
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-semibold text-slate-400">Laba Bersih Akhir</span>
              <div className="mt-1">
                <div className="text-xl sm:text-2xl font-black text-amber-600">
                  {formatRupiah(customRangeData.labaBersih)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Biaya: -{formatRupiah(customRangeData.totalPengeluaran)}
                </div>
              </div>
            </div>
          </div>

          {/* Income Statement */}
          {renderIncomeStatement({
            totalSales: customRangeData.totalOmzet,
            totalDiscount: customRangeData.totalDiscount,
            totalHpp: customRangeData.totalHpp,
            grossProfit: customRangeData.labaKotor,
            totalExpenses: customRangeData.totalPengeluaran,
            netProfit: customRangeData.labaBersih,
            totalTax: customRangeData.totalTax,
            expensesCat: customRangeData.expensesCat,
          })}

          {/* Breakdown Cards */}
          {renderBreakdownCards(customRangeData.methods, customRangeData.orderTypes, customRangeData.totalOmzet)}

          {/* Transactions list */}
          {renderTransactionsTable(customRangeData.rawSales, customRangeData.periodLabel)}
        </div>
      )}

      {/* 5. LAPORAN TAHUNAN */}
      {tab === 'yearly' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
            <h4 className="font-bold text-sm text-slate-800">
              Laporan Akumulasi Tahunan (Tahun {yearlyData.year})
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl">
                Total Omzet: {formatRupiah(yearlyData.totalOmzet)}
              </span>
            </div>
          </div>

          {/* 12-Month Bar Chart */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h4 className="font-bold text-sm text-slate-800">Grafik Penjualan Jan - Des</h4>
            <div className="h-56 flex items-end gap-1.5 sm:gap-3 border-b border-slate-200 pb-1">
              {yearlyData.monthlyBreakdown.map((m, idx) => {
                const heightPct = Math.max(8, Math.round((m.omzet / yearlyData.maxOmzet) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full max-w-[28px] bg-emerald-500 group-hover:bg-emerald-600 rounded-t transition-all relative flex items-start justify-center"
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[9px] font-bold py-0.5 px-1.5 rounded pointer-events-none whitespace-nowrap z-10 shadow">
                        {formatRupiah(m.omzet)}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium mt-1 truncate max-w-full">
                      {m.monthName.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly Table Summary */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Bulan</th>
                  <th className="py-3 px-3 text-right">Jumlah Transaksi</th>
                  <th className="py-3 px-3 text-right">Omzet Penjualan</th>
                  <th className="py-3 px-4 text-right">Laba Kotor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearlyData.monthlyBreakdown.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-bold text-slate-800">{m.monthName}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{m.txCount} tx</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(m.omzet)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-semibold text-emerald-700">
                      +{formatRupiah(m.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5b. NERACA KEUANGAN (LAPORAN POSISI KEUANGAN SAK EMKM) */}
      {tab === 'balance_sheet' && (
        <BalanceSheetView
          sales={sales}
          expenses={expenses}
          products={products}
          ingredients={ingredients}
          purchases={purchases}
          storeSettings={storeSettings}
          printerSettings={printerSettings}
          onOpenPrintModal={openReportPrintModal}
        />
      )}

      {/* 6. TAB ANALISIS & KESIMPULAN STRATEGI OMZET */}
      {tab === 'insights' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-3xl p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-1">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Executive AI &amp; Financial Analysis</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black">
                Kesimpulan Bisnis &amp; Rekomendasi Peningkatan Omzet
              </h3>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl leading-relaxed">
                Analisis otomatis berbasis matriks BCG (Stars, Plowhorses, Puzzles, Dogs), jam ramai pengunjung, dan efisiensi margin keuntungan.
              </p>
            </div>
            <button
              onClick={() => {
                const doc = new jsPDF();
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(16);
                doc.text(storeSettings.storeName, 14, 18);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text('Laporan Kesimpulan & Strategi Bisnis', 14, 25);
                doc.text(`Waktu Cetak: ${new Date().toLocaleString('id-ID')}`, 14, 30);
                doc.line(14, 33, 196, 33);
                doc.text(`Total Omzet: ${formatRupiah(salesInsights.totalRevenue)}`, 14, 45);
                doc.text(`Total Laba Bersih: ${formatRupiah(salesInsights.totalProfit)}`, 14, 52);
                doc.text(`Rata-rata Nilai Struk (AOV): ${formatRupiah(salesInsights.aov)}`, 14, 59);
                doc.text(`Jam Sibuk Utama: ${salesInsights.peakHour1}`, 14, 66);
                doc.save(`Strategi-Bisnis-${getTodayDateString()}.pdf`);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-emerald-900 text-xs font-bold shadow-md hover:bg-emerald-50 transition cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF Strategi</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Omzet Penjualan</span>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatRupiah(salesInsights.totalRevenue)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Dari {salesInsights.txCount} transaksi berhasil
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Laba Bersih</span>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-black text-emerald-700">
                  {formatRupiah(salesInsights.totalProfit)}
                </div>
                <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                  Margin kotor {salesInsights.grossMarginPercent}%
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rata-Rata Belanja (AOV)</span>
              <div className="mt-2">
                <div className="text-xl sm:text-2xl font-black text-slate-900">
                  {formatRupiah(salesInsights.aov)}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 font-medium">
                  Nilai rata-rata per struk belanja
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Skor Kesehatan Finansial</span>
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl font-black text-slate-900">
                    {salesInsights.healthScore}/100
                  </span>
                  <Award className="w-5 h-5 text-amber-500" />
                </div>
                <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full mt-1 border ${salesInsights.healthColor}`}>
                  {salesInsights.healthLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Operational Recommendations */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-4">
            <h4 className="font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              <span>5 Rekomendasi Utama Peningkatan Profitabilitas</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-1">
                <span className="font-bold text-amber-950 block">1. Paket Bundling Minuman &amp; Pastry</span>
                <p className="text-amber-800 leading-relaxed">
                  Gabungkan menu minuman terlaris dengan croissant atau snack untuk mendongkrak AOV hingga 25%.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1">
                <span className="font-bold text-blue-950 block">2. Manfaatkan Jam Sibuk: {salesInsights.peakHour1}</span>
                <p className="text-blue-800 leading-relaxed">
                  Pastikan stok bahan baku siap seduh dan barista/kasir siaga penuh saat jam sibuk utama.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-1">
                <span className="font-bold text-emerald-950 block">3. Upselling Add-On &amp; Extra Shot</span>
                <p className="text-emerald-800 leading-relaxed">
                  Latih kasir untuk menawarkan tambahan topping / double shot ristretto pada setiap pesanan kopi.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-1">
                <span className="font-bold text-purple-950 block">4. Hari Teramai: {salesInsights.bestDayName}</span>
                <p className="text-purple-800 leading-relaxed">
                  Fokuskan program event akustik atau promosi akhir pekan untuk memaksimalkan okupansi meja cafe.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB SEMUA TRANSAKSI */}
      {tab === 'transactions' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                placeholder="Cari nomor nota / kasir / meja / pelanggan..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={txDateRange}
              onChange={(e) => setTxDateRange(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              <option value="today">Hari Ini</option>
              <option value="yesterday">Kemarin</option>
              <option value="week">7 Hari Terakhir</option>
              <option value="month">Bulan Ini</option>
              <option value="all">Semua Waktu</option>
            </select>

            <select
              value={txFilterMethod}
              onChange={(e) => setTxFilterMethod(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700"
            >
              <option value="all">Semua Metode Bayar</option>
              <option value="cash">Tunai</option>
              <option value="qris">QRIS</option>
              <option value="transfer">Transfer</option>
              <option value="debit">Debit</option>
              <option value="ewallet">E-Wallet</option>
            </select>

            <button
              onClick={() => exportCsvReport(`Semua-Transaksi-${getTodayDateString()}`, filteredSales)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">No. Transaksi</th>
                    <th className="py-3.5 px-3">Tanggal &amp; Waktu</th>
                    <th className="py-3.5 px-3">Kasir</th>
                    <th className="py-3.5 px-3">Tipe / Meja</th>
                    <th className="py-3.5 px-3">Pesanan</th>
                    <th className="py-3.5 px-3">Metode</th>
                    <th className="py-3.5 px-3 text-right">Total Tagihan</th>
                    <th className="py-3.5 px-3 text-right">Laba</th>
                    <th className="py-3.5 px-3 text-center">Status</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                        <p className="font-semibold text-slate-600">Tidak ada transaksi ditemukan</p>
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {sale.invoiceNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
                          {formatDate(sale.date)} {sale.time}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700">{sale.cashierName}</td>
                        <td className="py-3 px-3">
                          <span className="font-bold text-slate-800 block text-[11px]">
                            {sale.orderType === 'dine_in' ? 'Dine In' : sale.orderType === 'take_away' ? 'Take Away' : 'Delivery'}
                          </span>
                          {sale.tableNumber && (
                            <span className="text-[10px] text-slate-400">{sale.tableNumber}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[200px]">
                          <div className="truncate text-slate-700 font-medium">
                            {(sale.items || []).map((it) => `${it.quantity}x ${it.productName}`).join(', ') || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded uppercase font-bold text-[10px] bg-slate-100 text-slate-700">
                            {sale.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-black text-slate-900">
                          {formatRupiah(sale.total)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-emerald-700">
                          +{formatRupiah(sale.totalProfit)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              sale.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {sale.status === 'completed' ? 'Selesai' : 'Batal (Void)'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                setSelectedSaleForDetail(sale);
                                setIsReceiptModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                              title="Lihat / Cetak Ulang Nota"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {sale.status === 'completed' && (
                              <button
                                onClick={() => handleVoidSale(sale)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                title="Batalkan Transaksi (Void & Restock)"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Financial Report Print Modal for Daily, Weekly, Monthly, and Custom Range */}
      {currentPrintReport && (
        <ReportPrintModal
          isOpen={isReportPrintOpen}
          onClose={() => {
            setIsReportPrintOpen(false);
            setCurrentPrintReport(null);
          }}
          report={currentPrintReport}
          store={storeSettings}
          printer={printerSettings}
        />
      )}

      {/* Receipt Modal for Reprint / View */}
      {selectedSaleForDetail && (
        <ReceiptModal
          sale={selectedSaleForDetail}
          store={storeSettings}
          printer={printerSettings}
          isOpen={isReceiptModalOpen}
          onClose={() => {
            setIsReceiptModalOpen(false);
            setSelectedSaleForDetail(null);
          }}
        />
      )}

      {/* CONFIRM VOID MODAL */}
      <ConfirmModal
        isOpen={!!voidConfirmSale}
        title={`Batalkan Transaksi #${voidConfirmSale?.invoiceNumber}?`}
        message={`Transaksi senilai ${formatRupiah(voidConfirmSale?.total || 0)} akan dibatalkan (void). Stok seluruh produk terkait akan otomatis dikembalikan ke inventaris.`}
        confirmLabel="Ya, Batalkan Transaksi"
        cancelLabel="Kembali"
        variant="danger"
        onConfirm={executeVoidSale}
        onCancel={() => setVoidConfirmSale(null)}
      />
    </div>
  );
};
