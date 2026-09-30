import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CreditCard,
  DollarSign,
  Edit,
  Plus,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '../../db/db';
import { supabaseService } from '../../services/supabase';
import { Expense, ExpenseCategory, User } from '../../types';
import { formatDate, formatRupiah, getTodayDateString } from '../../utils/format';
import { ConfirmModal } from '../common/ConfirmModal';

interface ExpensesScreenProps {
  currentUser: User;
}

export const ExpensesScreen: React.FC<ExpensesScreenProps> = ({ currentUser }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
  }>({ isOpen: false, id: '', name: '' });

  // Form State
  const [date, setDate] = useState(getTodayDateString());
  const [category, setCategory] = useState<ExpenseCategory>('operasional');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const loadData = async () => {
    const list = await db.expenses.reverse().sortBy('date');
    setExpenses(list);
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || table === 'expenses' || table === 'all') {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  const totalExpense = useMemo(() => {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const handleOpenAdd = () => {
    setEditingExpense(null);
    setDate(getTodayDateString());
    setCategory('operasional');
    setTitle('');
    setAmount(0);
    setNotes('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setDate(exp.date);
    setCategory(exp.category);
    setTitle(exp.title);
    setAmount(exp.amount);
    setNotes(exp.notes || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) {
      alert('Nama pengeluaran dan nominal wajib diisi.');
      return;
    }

    const now = new Date().toISOString();

    if (editingExpense) {
      const updatedExp: Expense = {
        id: editingExpense.id,
        date,
        category,
        title: title.trim(),
        amount,
        notes: notes.trim(),
        createdAt: editingExpense.createdAt,
      };
      await db.expenses.update(editingExpense.id, {
        date,
        category,
        title: title.trim(),
        amount,
        notes: notes.trim(),
      });
      if (supabaseService.isConfigured()) {
        await supabaseService.pushExpense(updatedExp);
      }
    } else {
      const newExp: Expense = {
        id: `exp-${Date.now()}`,
        date,
        category,
        title: title.trim(),
        amount,
        notes: notes.trim(),
        createdAt: now,
      };
      await db.expenses.add(newExp);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushExpense(newExp);
      }
    }

    setIsModalOpen(false);
    await loadData();
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const handleConfirmDelete = async () => {
    await db.expenses.delete(deleteConfirm.id);
    if (supabaseService.isConfigured()) {
      await supabaseService.deleteExpense(deleteConfirm.id);
    }
    setDeleteConfirm({ isOpen: false, id: '', name: '' });
    await loadData();
  };

  const categoryNames: Record<ExpenseCategory, string> = {
    listrik: 'Listrik & Air (PLN/PAM)',
    sewa: 'Sewa Tempat / Kios',
    gaji: 'Gaji Karyawan',
    transport: 'Transport & Bensin',
    internet: 'Internet & Komunikasi',
    operasional: 'Operasional Toko / ATK',
    lainnya: 'Biaya Lain-lain',
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
            Biaya Operasional &amp; Pengeluaran
          </h2>
          <p className="text-xs text-slate-400">
            Catat semua pengeluaran usaha untuk menghitung Laba Bersih yang akurat pada laporan keuangan.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Catat Pengeluaran</span>
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-3xl text-white shadow-lg flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Total Seluruh Pengeluaran Terdaftar
          </span>
          <div className="text-3xl font-black text-rose-400 mt-1">{formatRupiah(totalExpense)}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-rose-300">
          <Receipt className="w-6 h-6" />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">Tanggal</th>
                <th className="py-3.5 px-3">Kategori</th>
                <th className="py-3.5 px-3">Keterangan Biaya</th>
                <th className="py-3.5 px-3 text-right">Nominal (Rp)</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-600">Belum ada catatan pengeluaran</p>
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {formatDate(exp.date)}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-700">
                        {categoryNames[exp.category]}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">{exp.title}</div>
                      {exp.notes && <div className="text-[11px] text-slate-400 mt-0.5">{exp.notes}</div>}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-black text-rose-600">
                      {formatRupiah(exp.amount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(exp)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(exp.id, exp.title)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Expense */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingExpense ? 'Edit Pengeluaran' : 'Catat Pengeluaran Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-800 text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kategori Biaya</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  {Object.entries(categoryNames).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Pengeluaran *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Token Listrik 2200VA"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={amount || ''}
                  onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-sm font-bold font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Catatan / Nomor Bukti (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="No. kuitansi atau memo"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
                >
                  Simpan Biaya
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title={`Hapus Biaya "${deleteConfirm.name}"?`}
        message="Catatan pengeluaran operasional ini akan dihapus permanen dari laporan keuangan."
        confirmLabel="Ya, Hapus Sekarang"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: '', name: '' })}
      />
    </div>
  );
};
