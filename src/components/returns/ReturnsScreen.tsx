import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Package,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { db } from '../../db/db';
import { ReturnItem, Sale, SaleItem, SaleReturn, User } from '../../types';
import { formatDate, formatDateTime, formatRupiah, generateInvoiceNumber } from '../../utils/format';

interface ReturnsScreenProps {
  currentUser: User;
}

export const ReturnsScreen: React.FC<ReturnsScreenProps> = ({ currentUser }) => {
  const [returnsList, setReturnsList] = useState<SaleReturn[]>([]);
  const [salesList, setSalesList] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);

  // Search invoice
  const [searchInvoice, setSearchInvoice] = useState('');
  const [foundSale, setFoundSale] = useState<Sale | null>(null);

  // Return form state
  const [selectedItemsToReturn, setSelectedItemsToReturn] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('Barang Cacat / Rusak Pabrik');
  const [returnNotes, setReturnNotes] = useState('');

  const loadData = async () => {
    const ret = await db.returns.reverse().sortBy('createdAt');
    const s = await db.sales.where('status').equals('completed').toArray();
    const si = await db.sale_items.toArray();
    setReturnsList(ret);
    setSalesList(s);
    setSaleItems(si);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSearchSale = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInvoice.trim().toLowerCase();
    if (!q) return;

    const matched = salesList.find((s) => s.invoiceNumber.toLowerCase() === q);
    if (matched) {
      const items = saleItems.filter((item) => item.saleId === matched.id);
      setFoundSale({ ...matched, items });
      // Reset return selection
      const initialSelection: Record<string, number> = {};
      items.forEach((item) => {
        initialSelection[item.id] = 0;
      });
      setSelectedItemsToReturn(initialSelection);
    } else {
      alert(`Transaksi #${searchInvoice} tidak ditemukan atau status bukan 'completed'.`);
      setFoundSale(null);
    }
  };

  const handleItemQtyChange = (itemId: string, maxQty: number, val: number) => {
    const safeVal = Math.max(0, Math.min(maxQty, val));
    setSelectedItemsToReturn((prev) => ({ ...prev, [itemId]: safeVal }));
  };

  const handleProcessReturn = async () => {
    if (!foundSale) return;

    const itemsToReturn: ReturnItem[] = [];
    let totalRefund = 0;

    foundSale.items?.forEach((item) => {
      const qty = selectedItemsToReturn[item.id] || 0;
      if (qty > 0) {
        const itemRefundPrice = item.unitSellPrice * qty;
        totalRefund += itemRefundPrice;
        itemsToReturn.push({
          id: `ri-${Date.now()}-${item.productId}`,
          returnId: '',
          productId: item.productId,
          productName: item.productName,
          quantity: qty,
          refundPrice: itemRefundPrice,
          returnHpp: item.unitHpp * qty,
        });
      }
    });

    if (itemsToReturn.length === 0) {
      alert('Pilih minimal 1 barang dan jumlah yang ingin diretur.');
      return;
    }

    try {
      const returnNumber = generateInvoiceNumber('RET');
      const returnId = `ret-${Date.now()}`;
      const now = new Date().toISOString();

      itemsToReturn.forEach((ri) => {
        ri.returnId = returnId;
      });

      // 1. Create return record
      const returnRecord: SaleReturn = {
        id: returnId,
        returnNumber,
        saleId: foundSale.id,
        invoiceNumber: foundSale.invoiceNumber,
        date: now.slice(0, 10),
        cashierName: currentUser.name,
        totalRefund,
        reason: returnReason,
        notes: returnNotes,
        createdAt: now,
        items: itemsToReturn,
      };

      await db.returns.add(returnRecord);
      await db.return_items.bulkAdd(itemsToReturn);

      // 2. Restock products & log stock movements
      for (const item of itemsToReturn) {
        const prod = await db.products.get(item.productId);
        if (prod) {
          const newStock = prod.stock + item.quantity;
          await db.products.update(prod.id, {
            stock: newStock,
            updatedAt: now,
          });

          await db.stock_movements.add({
            id: `sm-ret-${Date.now()}-${item.productId}`,
            date: now,
            productId: prod.id,
            productName: prod.name,
            type: 'return_sale',
            referenceNumber: returnNumber,
            quantity: item.quantity,
            initialStock: prod.stock,
            finalStock: newStock,
            notes: `Retur dari nota #${foundSale.invoiceNumber}. Alasan: ${returnReason}`,
            createdAt: now,
          });
        }
      }

      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: now,
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'PROCESS_RETURN',
        details: `Retur penjualan #${foundSale.invoiceNumber} bernilai ${formatRupiah(totalRefund)}`,
      });

      alert(`Retur #${returnNumber} berhasil diproses. Stok barang telah dikembalikan.`);
      setFoundSale(null);
      setSearchInvoice('');
      setReturnNotes('');
      await loadData();
    } catch (err: any) {
      alert('Gagal memproses retur: ' + err.message);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
          Retur Penjualan Produk
        </h2>
        <p className="text-xs text-slate-400">
          Proses pengembalian barang dari pelanggan, otomatis kembalikan stok fisik &amp; catat riwayat retur.
        </p>
      </div>

      {/* Search Invoice Card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-slate-800">Cari Nota Transaksi</h3>
        <form onSubmit={handleSearchSale} className="flex gap-2 max-w-lg">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              required
              placeholder="Contoh: INV-260924-1001"
              value={searchInvoice}
              onChange={(e) => setSearchInvoice(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 uppercase"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Cari Transaksi
          </button>
        </form>

        {/* Found Sale Details & Return Picker */}
        {foundSale && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-4 animate-in fade-in duration-200">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-900 text-sm">
                  Nota #{foundSale.invoiceNumber}
                </span>
                <div className="text-slate-500">
                  Tanggal: {formatDate(foundSale.date)} • Kasir: {foundSale.cashierName}
                </div>
              </div>
              <div className="text-right">
                <span className="text-slate-500">Total Transaksi:</span>
                <div className="text-base font-black text-slate-900 font-mono">
                  {formatRupiah(foundSale.total)}
                </div>
              </div>
            </div>

            {/* Items selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Pilih Barang yang Diretur &amp; Jumlah Unit:
              </label>

              <div className="space-y-2">
                {foundSale.items?.map((item) => {
                  const currentReturnQty = selectedItemsToReturn[item.id] || 0;
                  return (
                    <div
                      key={item.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-xs text-slate-900">{item.productName}</div>
                        <div className="text-[11px] text-slate-400">
                          Beli: {item.quantity} {item.unit} @ {formatRupiah(item.unitSellPrice)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-medium">Qty Retur:</span>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          value={currentReturnQty}
                          onChange={(e) =>
                            handleItemQtyChange(
                              item.id,
                              item.quantity,
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-center font-mono focus:ring-1 focus:ring-emerald-500"
                        />
                        <span className="text-xs text-slate-400">{item.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reason & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Retur</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Barang Cacat / Rusak Pabrik">Barang Cacat / Rusak Pabrik</option>
                  <option value="Kadaluarsa / Expired">Kadaluarsa / Expired</option>
                  <option value="Salah Beli / Salah Varian">Salah Beli / Salah Varian</option>
                  <option value="Kemasan Rusak / Bocor">Kemasan Rusak / Bocor</option>
                  <option value="Alasan Lainnya">Alasan Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  placeholder="Keterangan singkat..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              onClick={handleProcessReturn}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Konfirmasi &amp; Proses Retur Barang</span>
            </button>
          </div>
        )}
      </div>

      {/* Returns History Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="font-bold text-sm text-slate-800">Riwayat Retur Penjualan</h4>
          <span className="text-xs text-slate-400">{returnsList.length} Transaksi Retur</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">No. Retur</th>
                <th className="py-3.5 px-3">No. Nota Penjualan</th>
                <th className="py-3.5 px-3">Tanggal</th>
                <th className="py-3.5 px-3">Kasir</th>
                <th className="py-3.5 px-3 text-right">Nilai Retur</th>
                <th className="py-3.5 px-4">Alasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {returnsList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Belum ada riwayat retur barang.
                  </td>
                </tr>
              ) : (
                returnsList.map((ret) => (
                  <tr key={ret.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-rose-700">{ret.returnNumber}</td>
                    <td className="py-3 px-3 font-mono font-semibold text-slate-800">{ret.invoiceNumber}</td>
                    <td className="py-3 px-3 text-slate-500">{formatDate(ret.date)}</td>
                    <td className="py-3 px-3">{ret.cashierName}</td>
                    <td className="py-3 px-3 text-right font-mono font-black text-rose-600">
                      -{formatRupiah(ret.totalRefund)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{ret.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
