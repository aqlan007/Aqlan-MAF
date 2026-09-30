import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  FileSpreadsheet,
  History,
  MinusCircle,
  Package,
  PlusCircle,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { db } from '../../db/db';
import { supabaseService } from '../../services/supabase';
import {
  Product,
  Purchase,
  PurchaseItem,
  StockMovement,
  StockMovementType,
  Supplier,
  User,
} from '../../types';
import {
  formatDate,
  formatDateTime,
  formatRupiah,
  generateInvoiceNumber,
  getTodayDateString,
} from '../../utils/format';
import { calculateHpp, calculateProfitAndMargin } from '../../utils/hpp';

interface InventoryScreenProps {
  currentUser: User;
}

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'history' | 'stock_in' | 'stock_out'>('history');

  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  // Filter for movements history
  const [searchQuery, setSearchQuery] = useState('');
  const [movementFilter, setMovementFilter] = useState<string>('all');

  // Stock In (Purchase) Form
  const [stockInSupplierId, setStockInSupplierId] = useState('');
  const [stockInInvoice, setStockInInvoice] = useState(generateInvoiceNumber('PO'));
  const [stockInDate, setStockInDate] = useState(getTodayDateString());
  const [stockInProductId, setStockInProductId] = useState('');
  const [stockInQty, setStockInQty] = useState<number>(10);
  const [stockInBuyPrice, setStockInBuyPrice] = useState<number>(0);
  const [stockInTransportCost, setStockInTransportCost] = useState<number>(0);
  const [stockInOtherCost, setStockInOtherCost] = useState<number>(0);
  const [stockInNotes, setStockInNotes] = useState('');

  // Stock Out Form
  const [stockOutProductId, setStockOutProductId] = useState('');
  const [stockOutType, setStockOutType] = useState<StockMovementType>('out_damaged');
  const [stockOutQty, setStockOutQty] = useState<number>(1);
  const [stockOutNotes, setStockOutNotes] = useState('');

  const loadData = async () => {
    const p = await db.products.toArray();
    const s = await db.suppliers.toArray();
    const m = await db.stock_movements.reverse().sortBy('createdAt');
    setProducts(p);
    setSuppliers(s);
    setMovements(m);

    if (p.length > 0 && !stockInProductId) {
      setStockInProductId(p[0].id);
      setStockInBuyPrice(p[0].buyPrice);
    }
    if (p.length > 0 && !stockOutProductId) {
      setStockOutProductId(p[0].id);
    }
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || table === 'products' || table === 'all') {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  // When selected product in Stock In changes, update buyPrice
  const handleStockInProductChange = (prodId: string) => {
    setStockInProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setStockInBuyPrice(prod.buyPrice);
    }
  };

  // Live HPP calculation for stock in
  const calculatedHpp = useMemo(() => {
    const totalPurchasePrice = stockInBuyPrice * Math.max(1, stockInQty);
    return calculateHpp({
      purchaseAmount: totalPurchasePrice,
      quantity: stockInQty,
      transportCost: stockInTransportCost,
      additionalCost: 0,
      otherCost: stockInOtherCost,
    });
  }, [stockInBuyPrice, stockInQty, stockInTransportCost, stockInOtherCost]);

  // Submit Stock In
  const handleStockInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find((p) => p.id === stockInProductId);
    if (!product) {
      alert('Pilih produk terlebih dahulu.');
      return;
    }

    if (stockInQty <= 0) {
      alert('Jumlah masuk harus lebih besar dari 0.');
      return;
    }

    const supplier = suppliers.find((s) => s.id === stockInSupplierId);
    const now = new Date().toISOString();
    const purchaseId = `po-${Date.now()}`;
    const newStock = product.stock + stockInQty;

    // Calculate new margin based on updated HPP
    const { marginPercent } = calculateProfitAndMargin(product.sellPrice, calculatedHpp.hppPerUnit);

    // 1. Record purchase
    const purchase: Purchase = {
      id: purchaseId,
      invoiceNumber: stockInInvoice,
      supplierId: supplier?.id || '',
      supplierName: supplier?.name || 'Supplier Umum',
      date: stockInDate,
      totalAmount: stockInBuyPrice * stockInQty,
      additionalCost: 0,
      transportCost: stockInTransportCost,
      otherCost: stockInOtherCost,
      totalCost: calculatedHpp.totalCost,
      notes: stockInNotes,
      createdAt: now,
      items: [
        {
          id: `poi-${Date.now()}`,
          purchaseId,
          productId: product.id,
          productName: product.name,
          quantity: stockInQty,
          unitBuyPrice: stockInBuyPrice,
          allocatedExtraCost: stockInTransportCost + stockInOtherCost,
          unitHpp: calculatedHpp.hppPerUnit,
          total: calculatedHpp.totalCost,
        },
      ],
    };

    // 2. Record stock movement
    const movement: StockMovement = {
      id: `sm-in-${Date.now()}`,
      date: `${stockInDate}T${new Date().toTimeString().slice(0, 8)}`,
      productId: product.id,
      productName: product.name,
      type: 'in_purchase',
      referenceId: purchaseId,
      referenceNumber: stockInInvoice,
      quantity: stockInQty,
      initialStock: product.stock,
      finalStock: newStock,
      unitCost: calculatedHpp.hppPerUnit,
      notes: `Pembelian dari ${supplier?.name || 'Supplier'}. Catatan: ${stockInNotes || '-'}`,
      createdAt: now,
    };

    // 3. Update Product stock and HPP
    await db.products.update(product.id, {
      stock: newStock,
      buyPrice: stockInBuyPrice,
      hpp: calculatedHpp.hppPerUnit,
      margin: marginPercent,
      updatedAt: now,
    });

    await db.purchases.add(purchase);
    await db.stock_movements.add(movement);

    if (supabaseService.isConfigured()) {
      const freshProd = await db.products.get(product.id);
      if (freshProd) await supabaseService.pushProduct(freshProd);
    }

    await db.audit_logs.add({
      id: `log-${Date.now()}`,
      timestamp: now,
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'STOCK_IN',
      details: `Stok Masuk: +${stockInQty} ${product.unit} ${product.name} (HPP: ${formatRupiah(
        calculatedHpp.hppPerUnit
      )})`,
    });

    alert(`Stok masuk berhasil disimpan! HPP produk telah diperbarui menjadi ${formatRupiah(calculatedHpp.hppPerUnit)}.`);
    setStockInInvoice(generateInvoiceNumber('PO'));
    setStockInQty(10);
    setStockInTransportCost(0);
    setStockInOtherCost(0);
    setStockInNotes('');
    setActiveTab('history');
    await loadData();
  };

  // Submit Stock Out
  const handleStockOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const product = products.find((p) => p.id === stockOutProductId);
    if (!product) {
      alert('Pilih produk terlebih dahulu.');
      return;
    }

    if (stockOutQty <= 0) {
      alert('Jumlah keluar harus lebih besar dari 0.');
      return;
    }

    const now = new Date().toISOString();
    const newStock = product.stock - stockOutQty;

    const typeLabels: Record<StockMovementType, string> = {
      out_damaged: 'Barang Rusak / Cacat',
      out_lost: 'Barang Hilang / Selisih',
      out_internal: 'Pemakaian Toko Internal',
      adjustment: 'Penyesuaian Stok Opname',
      in_purchase: 'Pembelian',
      out_sale: 'Penjualan',
      return_sale: 'Retur',
    };

    const movement: StockMovement = {
      id: `sm-out-${Date.now()}`,
      date: now,
      productId: product.id,
      productName: product.name,
      type: stockOutType,
      referenceNumber: `OUT-${Date.now().toString().slice(-6)}`,
      quantity: -stockOutQty,
      initialStock: product.stock,
      finalStock: newStock,
      unitCost: product.hpp,
      notes: `${typeLabels[stockOutType]}. Alasan: ${stockOutNotes || '-'}`,
      createdAt: now,
    };

    await db.products.update(product.id, {
      stock: newStock,
      updatedAt: now,
    });

    await db.stock_movements.add(movement);

    if (supabaseService.isConfigured()) {
      const freshProd = await db.products.get(product.id);
      if (freshProd) await supabaseService.pushProduct(freshProd);
    }

    await db.audit_logs.add({
      id: `log-${Date.now()}`,
      timestamp: now,
      userId: currentUser.id,
      userName: currentUser.name,
      action: 'STOCK_OUT',
      details: `Stok Keluar: -${stockOutQty} ${product.unit} ${product.name} (${typeLabels[stockOutType]})`,
    });

    alert(`Stok keluar berhasil dicatat. Sisa stok: ${newStock} ${product.unit}.`);
    setStockOutQty(1);
    setStockOutNotes('');
    setActiveTab('history');
    await loadData();
  };

  // Filtered movements
  const filteredMovements = useMemo(() => {
    let result = movements;
    if (movementFilter !== 'all') {
      result = result.filter((m) => m.type === movementFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.productName.toLowerCase().includes(q) ||
          m.referenceNumber?.toLowerCase().includes(q) ||
          m.notes?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [movements, movementFilter, searchQuery]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-4">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
            Manajemen Stok &amp; HPP
          </h2>
          <p className="text-xs text-slate-400">
            Pencatatan barang masuk, barang rusak/hilang, penyesuaian opname, dan riwayat mutasi stok.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl gap-1">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Riwayat Mutasi</span>
          </button>

          <button
            onClick={() => setActiveTab('stock_in')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'stock_in'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>+ Stok Masuk (HPP)</span>
          </button>

          <button
            onClick={() => setActiveTab('stock_out')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'stock_out'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-rose-700'
            }`}
          >
            <MinusCircle className="w-3.5 h-3.5" />
            <span>- Stok Keluar</span>
          </button>
        </div>
      </div>

      {/* TAB 1: RIWAYAT MUTASI STOK */}
      {activeTab === 'history' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Search & Filter Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari produk, no. referensi, catatan mutasi..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Semua Jenis Pergerakan</option>
              <option value="in_purchase">Masuk: Pembelian Barang</option>
              <option value="out_sale">Keluar: Penjualan Kasir</option>
              <option value="out_damaged">Keluar: Barang Rusak</option>
              <option value="out_lost">Keluar: Barang Hilang</option>
              <option value="out_internal">Keluar: Internal Toko</option>
              <option value="adjustment">Penyesuaian Opname</option>
              <option value="return_sale">Retur Penjualan</option>
            </select>
          </div>

          {/* Movements Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3.5 px-4">Waktu</th>
                    <th className="py-3.5 px-3">Produk</th>
                    <th className="py-3.5 px-3">Tipe Mutasi</th>
                    <th className="py-3.5 px-3 text-center">Stok Awal</th>
                    <th className="py-3.5 px-3 text-center">Perubahan</th>
                    <th className="py-3.5 px-3 text-center">Stok Akhir</th>
                    <th className="py-3.5 px-4">Keterangan / No. Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <History className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                        <p className="font-semibold text-slate-600">Belum ada riwayat mutasi stok</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                            {formatDateTime(m.date)}
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {m.productName}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                m.type === 'in_purchase'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : m.type === 'out_sale'
                                  ? 'bg-blue-100 text-blue-800'
                                  : m.type === 'return_sale'
                                  ? 'bg-teal-100 text-teal-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {m.type.toUpperCase().replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-medium text-slate-500">
                            {m.initialStock}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold">
                            <span
                              className={`px-2 py-0.5 rounded ${
                                isPositive
                                  ? 'text-emerald-700 bg-emerald-50'
                                  : 'text-rose-700 bg-rose-50'
                              }`}
                            >
                              {isPositive ? `+${m.quantity}` : m.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-slate-900">
                            {m.finalStock}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                            <span className="font-medium text-slate-700 font-mono mr-1">
                              {m.referenceNumber || '-'}
                            </span>
                            {m.notes && <span>({m.notes})</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FORM STOK MASUK DENGAN KALKULASI HPP */}
      {activeTab === 'stock_in' && (
        <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-md p-6 animate-in fade-in duration-200 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Input Stok Masuk &amp; Hitung HPP</h3>
              <p className="text-xs text-slate-400">
                HPP dihitung otomatis: (Total Beli + Transport + Biaya Lain) &divide; Jumlah Unit.
              </p>
            </div>
          </div>

          <form onSubmit={handleStockInSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Faktur / PO</label>
                <input
                  type="text"
                  required
                  value={stockInInvoice}
                  onChange={(e) => setStockInInvoice(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Masuk</label>
                <input
                  type="date"
                  required
                  value={stockInDate}
                  onChange={(e) => setStockInDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier</label>
                <select
                  value={stockInSupplierId}
                  onChange={(e) => setStockInSupplierId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Supplier Umum</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Produk *</label>
                <select
                  required
                  value={stockInProductId}
                  onChange={(e) => handleStockInProductChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-semibold focus:ring-2 focus:ring-emerald-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stok: {p.stock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Masuk (Unit) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={stockInQty}
                  onChange={(e) => setStockInQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono font-bold focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Harga Beli Satuan (Rp) *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={stockInBuyPrice}
                  onChange={(e) => setStockInBuyPrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Additional Cost for HPP */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center justify-between">
                <span>Biaya Pengadaan &amp; Distribusi</span>
                <span className="text-[10px] text-slate-400 font-normal">Dialokasikan ke HPP</span>
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Ongkir / Transport (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stockInTransportCost}
                    onChange={(e) => setStockInTransportCost(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Biaya Lainnya (Handling/Dus)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={stockInOtherCost}
                    onChange={(e) => setStockInOtherCost(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* HPP Live Result Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-blue-900 uppercase">
                    Hasil Perhitungan HPP per Unit:
                  </span>
                  <div className="text-xl font-black text-blue-700 font-mono">
                    {formatRupiah(calculatedHpp.hppPerUnit)}
                  </div>
                </div>
                <div className="text-right text-xs text-blue-800">
                  <div>Total Modal: {formatRupiah(calculatedHpp.totalCost)}</div>
                  <div className="text-[10px] text-blue-600">({calculatedHpp.quantity} unit)</div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan Tambahan</label>
              <textarea
                rows={2}
                value={stockInNotes}
                onChange={(e) => setStockInNotes(e.target.value)}
                placeholder="Contoh: Barang datang via ekspedisi J&T Cargo, kondisi mulus."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Check className="w-5 h-5" />
              <span>Simpan Stok Masuk &amp; Update HPP</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: FORM STOK KELUAR */}
      {activeTab === 'stock_out' && (
        <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-md p-6 animate-in fade-in duration-200 space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <MinusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Catat Stok Keluar / Penyesuaian</h3>
              <p className="text-xs text-slate-400">
                Gunakan untuk barang rusak, hilang, kadaluarsa, pemakaian pribadi, atau selisih opname.
              </p>
            </div>
          </div>

          <form onSubmit={handleStockOutSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pilih Produk *</label>
              <select
                required
                value={stockOutProductId}
                onChange={(e) => setStockOutProductId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-semibold focus:ring-2 focus:ring-rose-500"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (Stok Saat Ini: {p.stock} {p.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alasan / Tipe Keluar *</label>
                <select
                  value={stockOutType}
                  onChange={(e) => setStockOutType(e.target.value as StockMovementType)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium focus:ring-2 focus:ring-rose-500"
                >
                  <option value="out_damaged">Barang Rusak / Pecah / Cacat</option>
                  <option value="out_lost">Barang Hilang / Selisih</option>
                  <option value="out_internal">Pemakaian Internal Toko</option>
                  <option value="adjustment">Penyesuaian Stok Opname</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Keluar (Unit) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={stockOutQty}
                  onChange={(e) => setStockOutQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-mono font-bold focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Keterangan Detail</label>
              <textarea
                rows={2}
                value={stockOutNotes}
                onChange={(e) => setStockOutNotes(e.target.value)}
                placeholder="Contoh: Kemasan sobek saat bongkar muat / botol bocor."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-sm shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <MinusCircle className="w-5 h-5" />
              <span>Simpan Pengurangan Stok</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
