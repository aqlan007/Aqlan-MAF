import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Coffee,
  CreditCard,
  DollarSign,
  Lock,
  Package,
  Receipt,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Wallet,
  Wheat,
  XCircle,
} from 'lucide-react';
import { db } from '../../db/db';
import { Category, Ingredient, Product, Sale, SaleItem, StoreSettings, User } from '../../types';
import { formatDate, formatNumber, formatRupiah, getTodayDateString } from '../../utils/format';

interface DashboardScreenProps {
  onNavigate: (tab: string) => void;
  storeSettings: StoreSettings;
  currentUser?: User;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigate,
  storeSettings,
  currentUser,
}) => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  const fetchData = async () => {
    try {
      const s = await db.sales.where('status').equals('completed').toArray();
      const si = await db.sale_items.toArray();
      const p = await db.products.toArray();
      const c = await db.categories.toArray();
      const ing = await db.ingredients.toArray();
      setSales(s);
      setSaleItems(si);
      setProducts(p);
      setCategories(c);
      setIngredients(ing);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Real-time synchronization listener for dashboard metrics
  useEffect(() => {
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || ['sales', 'ingredients', 'products', 'store_settings', 'all'].includes(table)) {
        fetchData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  const todayStr = getTodayDateString();

  // Metrics calculations
  const metrics = useMemo(() => {
    const todaySales = sales.filter((s) => s.date === todayStr);

    // Sales Today
    const salesTodayTotal = todaySales.reduce((acc, s) => acc + s.total, 0);
    const transactionsTodayCount = todaySales.length;
    const hppTodayTotal = todaySales.reduce((acc, s) => acc + (s.totalHpp || 0), 0);
    const profitTodayTotal = todaySales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);
    const marginTodayPercent =
      salesTodayTotal > 0 ? Number(((profitTodayTotal / salesTodayTotal) * 100).toFixed(1)) : 0;

    // Week, Month, Year
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfWeekStr = startOfWeek.toISOString().slice(0, 10);

    const startOfMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const startOfYearStr = `${now.getFullYear()}-01-01`;

    const weekSales = sales.filter((s) => s.date >= startOfWeekStr);
    const salesWeekTotal = weekSales.reduce((acc, s) => acc + s.total, 0);

    const monthSales = sales.filter((s) => s.date >= startOfMonthStr);
    const salesMonthTotal = monthSales.reduce((acc, s) => acc + s.total, 0);

    const yearSales = sales.filter((s) => s.date >= startOfYearStr);
    const salesYearTotal = yearSales.reduce((acc, s) => acc + s.total, 0);

    // Raw ingredient metrics (Bahan Baku)
    const outOfStockIngredients = ingredients.filter((ing) => (ing.currentStock || 0) <= 0);
    const lowStockIngredients = ingredients.filter(
      (ing) => (ing.currentStock || 0) > 0 && (ing.currentStock || 0) <= (ing.minStock || 0)
    );

    // Cashier shift metrics
    const mySalesToday = todaySales.filter(
      (s) =>
        s.cashierId === currentUser?.id ||
        s.cashierName === currentUser?.name ||
        currentUser?.role === 'admin' ||
        currentUser?.role === 'manager'
    );
    const mySalesTodayTotal = mySalesToday.reduce((acc, s) => acc + s.total, 0);
    const myTransactionsCount = mySalesToday.length;
    const myCashInDrawer = mySalesToday
      .filter((s) => s.paymentMethod === 'cash')
      .reduce((acc, s) => acc + s.total, 0);
    const myNonCashTotal = mySalesToday
      .filter((s) => s.paymentMethod !== 'cash')
      .reduce((acc, s) => acc + s.total, 0);

    return {
      salesTodayTotal,
      transactionsTodayCount,
      hppTodayTotal,
      profitTodayTotal,
      marginTodayPercent,
      salesWeekTotal,
      salesMonthTotal,
      salesYearTotal,
      totalProducts: products.length,
      totalIngredients: ingredients.length,
      outOfStockIngredients,
      lowStockIngredients,
      mySalesTodayTotal,
      myTransactionsCount,
      myCashInDrawer,
      myNonCashTotal,
    };
  }, [sales, products, ingredients, todayStr, currentUser]);

  // Top Selling Products
  const topProducts = useMemo(() => {
    const qtyMap: Record<string, { product: Product; qty: number; totalSales: number; profit: number }> = {};

    saleItems.forEach((item) => {
      const p = products.find((prod) => prod.id === item.productId);
      if (!p) return;
      if (!qtyMap[item.productId]) {
        qtyMap[item.productId] = { product: p, qty: 0, totalSales: 0, profit: 0 };
      }
      qtyMap[item.productId].qty += item.quantity;
      qtyMap[item.productId].totalSales += item.total;
      qtyMap[item.productId].profit += item.profit;
    });

    return Object.values(qtyMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  }, [saleItems, products]);

  // Weekly Chart Data Points (Mon - Sun or last 7 days)
  const chartData = useMemo(() => {
    const days: { label: string; date: string; total: number; profit: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      const daySales = sales.filter((s) => s.date === dStr);
      const dayTotal = daySales.reduce((acc, s) => acc + s.total, 0);
      const dayProfit = daySales.reduce((acc, s) => acc + (s.totalProfit || 0), 0);

      const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(d);
      days.push({
        label: `${dayName} (${d.getDate()})`,
        date: dStr,
        total: dayTotal,
        profit: dayProfit,
      });
    }

    const maxVal = Math.max(...days.map((d) => d.total), 100000);
    return { days, maxVal };
  }, [sales]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Top Welcome & Store Overview Header */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-emerald-200 text-xs font-semibold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Dashboard Operasional POS</span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight">{storeSettings.storeName}</h2>
          <p className="text-sm text-emerald-100 mt-1 max-w-xl">
            {storeSettings.slogan || 'Sistem Kasir & Manajemen Stok Retail Offline-First.'}
          </p>
        </div>

        {/* Quick action shortcuts */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('pos')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-emerald-800 font-extrabold text-sm shadow-md hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4 text-emerald-600" />
            <span>Buka Kasir</span>
          </button>
          <button
            onClick={() => onNavigate('recipes')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <Wheat className="w-4 h-4 text-slate-900" />
            <span>HPP &amp; Bahan Baku</span>
          </button>
          {currentUser?.role === 'admin' ? (
            <button
              onClick={() => onNavigate('reports')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600/80 hover:bg-emerald-600 text-white font-bold text-sm border border-emerald-400/40 transition-all cursor-pointer"
            >
              <TrendingUp className="w-4 h-4" />
              <span>Laporan Keuangan</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('reports')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-bold text-sm border border-slate-700 transition-all cursor-pointer"
              title="Akses Laporan Keuangan khusus Akun Admin / Owner"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Laporan Keuangan (Admin)</span>
            </button>
          )}
        </div>
      </div>

      {/* Cashier Mode Notice Banner */}
      {currentUser?.role === 'cashier' && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold">Mode Kasir Aktif:</span>
              <p className="text-[11px] text-amber-800">
                Menampilkan ringkasan shift kasir &amp; laci kas tunai Anda. Data rahasia HPP pokok dan laba bersih toko dibatasi khusus untuk Admin.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('pos')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold rounded-xl text-xs transition-colors shrink-0 shadow-xs cursor-pointer"
          >
            Masuk Kasir (POS)
          </button>
        </div>
      )}

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
        {currentUser?.role === 'cashier' ? (
          <>
            {/* 1. Penjualan Shift Saya */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Shift Penjualan</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                  {formatRupiah(metrics.mySalesTodayTotal)}
                </div>
                <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <Receipt className="w-3 h-3" />
                  <span>{metrics.myTransactionsCount} Transaksi Saya</span>
                </div>
              </div>
            </div>

            {/* 2. Kas / Tunai Laci Kasir */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Uang Tunai di Laci</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-blue-700 tracking-tight">
                  {formatRupiah(metrics.myCashInDrawer)}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  Total Kas Fisik Shift
                </div>
              </div>
            </div>

            {/* 3. Non-Tunai / QRIS */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Non-Tunai / QRIS</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-purple-700 tracking-tight">
                  {formatRupiah(metrics.myNonCashTotal)}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  QRIS, Transfer &amp; Debit
                </div>
              </div>
            </div>

            {/* 4. Menu & Produk Aktif */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Menu F&amp;B Siap Jual</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                  {metrics.totalProducts} <span className="text-xs font-normal text-slate-500">Item</span>
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  Tersedia di Kasir POS
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Penjualan Hari Ini (Admin) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Penjualan Hari Ini</span>
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                  {formatRupiah(metrics.salesTodayTotal)}
                </div>
                <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <Receipt className="w-3 h-3" />
                  <span>{metrics.transactionsTodayCount} Transaksi Selesai</span>
                </div>
              </div>
            </div>

            {/* Total Modal / HPP Hari Ini (Admin) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Modal / HPP Hari Ini</span>
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Boxes className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                  {formatRupiah(metrics.hppTodayTotal)}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  HPP Pokok Produk Terjual
                </div>
              </div>
            </div>

            {/* Keuntungan Hari Ini (Admin) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Laba Bersih Hari Ini</span>
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-amber-600 tracking-tight">
                  {formatRupiah(metrics.profitTodayTotal)}
                </div>
                <div className="text-xs text-slate-500 font-semibold mt-1 flex items-center gap-1">
                  <span>Margin:</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                    {metrics.marginTodayPercent}%
                  </span>
                </div>
              </div>
            </div>

            {/* Menu F&B Siap Jual (Admin) */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Total Menu Produk</span>
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                  {metrics.totalProducts} <span className="text-xs font-normal text-slate-500">Menu</span>
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  Menu F&amp;B Siap Jual di POS
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Interactive Sales & Profit Chart */}
      <div className="bg-white rounded-3xl p-5 lg:p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Grafik Tren Penjualan &amp; Laba</h3>
            <p className="text-xs text-slate-400">Ringkasan performa penjualan 7 hari terakhir</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500" />
              <span className="text-slate-600 font-medium">Omzet Penjualan</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-400" />
              <span className="text-slate-600 font-medium">Keuntungan Bersih</span>
            </div>
          </div>
        </div>

        {/* Bar Chart Visualization */}
        <div className="pt-4 pb-2">
          <div className="h-56 flex items-end gap-2 sm:gap-4 border-b border-slate-200 px-2">
            {chartData.days.map((item, idx) => {
              const salesHeight = Math.max(12, Math.round((item.total / chartData.maxVal) * 100));
              const profitHeight = Math.max(8, Math.round((item.profit / chartData.maxVal) * 100));

              return (
                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="w-full flex items-end justify-center gap-1 h-full pb-1">
                    {/* Sales Bar */}
                    <div
                      style={{ height: `${salesHeight}%` }}
                      className="w-full max-w-[28px] bg-emerald-500 rounded-t-lg group-hover:bg-emerald-600 transition-all relative flex flex-col justify-start items-center"
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 shadow-lg">
                        Omzet: {formatRupiah(item.total)}
                      </div>
                    </div>

                    {/* Profit Bar */}
                    <div
                      style={{ height: `${profitHeight}%` }}
                      className="w-full max-w-[20px] bg-amber-400 rounded-t-lg group-hover:bg-amber-500 transition-all relative flex flex-col justify-start items-center"
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-14 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10 shadow-lg">
                        Laba: {formatRupiah(item.profit)}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium pt-2 text-center truncate max-w-full">
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Two Column Section: Top Selling Products & Raw Ingredients Alert (Bahan Baku) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Selling Products */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Produk Paling Laris</h4>
              <p className="text-xs text-slate-400">Berdasarkan total unit terjual</p>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 cursor-pointer"
            >
              <span>Laporan</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-3">
            {topProducts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">Belum ada riwayat penjualan.</div>
            ) : (
              topProducts.map((item, index) => (
                <div
                  key={item.product.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div>
                      <h5 className="font-semibold text-xs text-slate-800 line-clamp-1">
                        {item.product.name}
                      </h5>
                      <div className="text-[11px] text-slate-400">
                        {item.qty} {item.product.unit} terjual
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-xs text-slate-900">
                      {formatRupiah(item.totalSales)}
                    </div>
                    <div className="text-[10px] text-emerald-600 font-medium">
                      Laba +{formatRupiah(item.profit)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PERINGATAN BAHAN BAKU (RAW INGREDIENTS ALERT) */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Wheat className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Peringatan Bahan Baku</h4>
                <p className="text-xs text-slate-400">Stok bahan baku kritis &amp; menipis untuk resep cafe</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('recipes')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 cursor-pointer"
            >
              <span>Kelola &amp; Restock</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 space-y-2.5">
            {metrics.outOfStockIngredients.length === 0 && metrics.lowStockIngredients.length === 0 ? (
              <div className="py-8 text-center text-emerald-600 text-xs flex flex-col items-center">
                <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-500" />
                <span className="font-bold text-emerald-800">Semua stok bahan baku dalam kondisi aman!</span>
                <span className="text-[11px] text-emerald-600 mt-0.5">
                  Total {metrics.totalIngredients} bahan baku siap digunakan untuk operasional dapur &amp; bar.
                </span>
              </div>
            ) : (
              <>
                {/* Out of Stock Ingredients */}
                {metrics.outOfStockIngredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-rose-50/80 border border-rose-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                      <div>
                        <div className="font-bold text-xs text-rose-950 line-clamp-1">{ing.name}</div>
                        <div className="text-[10px] text-rose-700">
                          Batas Min: {formatNumber(ing.minStock)} {ing.recipeUnit} • Kemasan: {ing.purchaseUnit}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-black text-xs shadow-2xs">
                        Habis (0 {ing.recipeUnit})
                      </span>
                    </div>
                  </div>
                ))}

                {/* Low Stock Ingredients */}
                {metrics.lowStockIngredients.map((ing) => (
                  <div
                    key={ing.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-amber-50/80 border border-amber-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                      <div>
                        <div className="font-bold text-xs text-amber-950 line-clamp-1">{ing.name}</div>
                        <div className="text-[10px] text-amber-700">
                          Min: {formatNumber(ing.minStock)} {ing.recipeUnit} • Biaya: {formatRupiah(ing.costPerRecipeUnit)}/{ing.recipeUnit}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-black text-xs shadow-2xs">
                        Sisa {formatNumber(ing.currentStock)} {ing.recipeUnit}
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
