import React, { useEffect, useState } from 'react';
import {
  Building2,
  Edit,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { db } from '../../db/db';
import { supabaseService } from '../../services/supabase';
import { Customer, Supplier, User } from '../../types';
import { formatRupiah } from '../../utils/format';
import { ConfirmModal } from '../common/ConfirmModal';

interface ContactsScreenProps {
  currentUser: User;
}

export const ContactsScreen: React.FC<ContactsScreenProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'suppliers' | 'customers'>('suppliers');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'supplier' | 'customer';
    id: string;
    name: string;
  }>({
    isOpen: false,
    type: 'supplier',
    id: '',
    name: '',
  });

  // Supplier Modal
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supForm, setSupForm] = useState({
    name: '',
    phone: '',
    whatsapp: '',
    address: '',
    email: '',
    notes: '',
  });

  // Customer Modal
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [custForm, setCustForm] = useState({
    name: '',
    phone: '',
    address: '',
    email: '',
  });

  const loadData = async () => {
    const s = await db.suppliers.toArray();
    const c = await db.customers.toArray();
    setSuppliers(s);
    setCustomers(c);
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || table === 'customers' || table === 'suppliers' || table === 'all') {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  // Supplier Actions
  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setSupForm({ name: '', phone: '', whatsapp: '', address: '', email: '', notes: '' });
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupForm({
      name: s.name,
      phone: s.phone,
      whatsapp: s.whatsapp || '',
      address: s.address || '',
      email: s.email || '',
      notes: s.notes || '',
    });
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supForm.name.trim() || !supForm.phone.trim()) {
      alert('Nama dan nomor telepon supplier wajib diisi.');
      return;
    }

    if (editingSupplier) {
      const updatedSup: Supplier = {
        id: editingSupplier.id,
        ...supForm,
        createdAt: editingSupplier.createdAt,
      };
      await db.suppliers.update(editingSupplier.id, supForm);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushSupplier(updatedSup);
      }
    } else {
      const newSup: Supplier = {
        id: `sup-${Date.now()}`,
        ...supForm,
        createdAt: new Date().toISOString(),
      };
      await db.suppliers.add(newSup);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushSupplier(newSup);
      }
    }

    setIsSupplierModalOpen(false);
    await loadData();
  };

  const handleDeleteSupplier = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, type: 'supplier', id, name });
  };

  // Customer Actions
  const handleOpenAddCustomer = () => {
    setEditingCustomer(null);
    setCustForm({ name: '', phone: '', address: '', email: '' });
    setIsCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = (c: Customer) => {
    setEditingCustomer(c);
    setCustForm({
      name: c.name,
      phone: c.phone,
      address: c.address || '',
      email: c.email || '',
    });
    setIsCustomerModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custForm.name.trim() || !custForm.phone.trim()) {
      alert('Nama dan nomor telepon pelanggan wajib diisi.');
      return;
    }

    if (editingCustomer) {
      const updatedCust: Customer = {
        id: editingCustomer.id,
        ...custForm,
        totalTransactions: editingCustomer.totalTransactions || 0,
        totalSpent: editingCustomer.totalSpent || 0,
        createdAt: editingCustomer.createdAt,
      };
      await db.customers.update(editingCustomer.id, custForm);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushCustomer(updatedCust);
      }
    } else {
      const newCust: Customer = {
        id: `cust-${Date.now()}`,
        ...custForm,
        totalTransactions: 0,
        totalSpent: 0,
        createdAt: new Date().toISOString(),
      };
      await db.customers.add(newCust);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushCustomer(newCust);
      }
    }

    setIsCustomerModalOpen(false);
    await loadData();
  };

  const handleDeleteCustomer = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, type: 'customer', id, name });
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirm.type === 'supplier') {
      await db.suppliers.delete(deleteConfirm.id);
      if (supabaseService.isConfigured()) {
        await supabaseService.deleteSupplier(deleteConfirm.id);
      }
    } else {
      await db.customers.delete(deleteConfirm.id);
      if (supabaseService.isConfigured()) {
        await supabaseService.deleteCustomer(deleteConfirm.id);
      }
    }
    setDeleteConfirm({ isOpen: false, type: 'supplier', id: '', name: '' });
    await loadData();
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
            Supplier &amp; Pelanggan
          </h2>
          <p className="text-xs text-slate-400">
            Daftar distributor penyedia barang toko dan kontak pelanggan setia.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl gap-1">
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'suppliers'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Supplier ({suppliers.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'customers'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Pelanggan ({customers.length})</span>
            </button>
          </div>

          <button
            onClick={activeTab === 'suppliers' ? handleOpenAddSupplier : handleOpenAddCustomer}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{activeTab === 'suppliers' ? '+ Supplier' : '+ Pelanggan'}</span>
          </button>
        </div>
      </div>

      {/* SUPPLIERS TAB */}
      {activeTab === 'suppliers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-200">
          {suppliers.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
              <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
              <p className="font-semibold text-slate-600">Belum ada supplier terdaftar</p>
            </div>
          ) : (
            suppliers.map((sup) => (
              <div
                key={sup.id}
                className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-900">{sup.name}</h4>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditSupplier(sup)}
                        className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-slate-50"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{sup.phone}</span>
                    </div>
                    {sup.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{sup.address}</span>
                      </div>
                    )}
                    {sup.notes && (
                      <p className="text-[11px] text-slate-400 italic pt-1">{sup.notes}</p>
                    )}
                  </div>
                </div>

                {sup.whatsapp && (
                  <a
                    href={`https://wa.me/${sup.whatsapp.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2 bg-green-50 hover:bg-green-100 text-green-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Hubungi WhatsApp</span>
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* CUSTOMERS TAB */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3.5 px-4">Nama Pelanggan</th>
                  <th className="py-3.5 px-3">No. HP / WA</th>
                  <th className="py-3.5 px-3">Alamat</th>
                  <th className="py-3.5 px-3 text-center">Total Transaksi</th>
                  <th className="py-3.5 px-3 text-right">Total Belanja</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Users className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                      <p className="font-semibold text-slate-600">Belum ada pelanggan terdaftar</p>
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                      <td className="py-3 px-3 font-mono">{c.phone}</td>
                      <td className="py-3 px-3 text-slate-500">{c.address || '-'}</td>
                      <td className="py-3 px-3 text-center font-bold text-slate-700">
                        {c.totalTransactions || 0}x
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-black text-emerald-700">
                        {formatRupiah(c.totalSpent || 0)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditCustomer(c)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCustomer(c.id, c.name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
      )}

      {/* Supplier Modal */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingSupplier ? 'Edit Supplier' : 'Tambah Supplier Baru'}
              </h3>
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-800 text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Supplier *</label>
                <input
                  type="text"
                  required
                  value={supForm.name}
                  onChange={(e) => setSupForm({ ...supForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telepon *</label>
                  <input
                    type="text"
                    required
                    value={supForm.phone}
                    onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    placeholder="6281234..."
                    value={supForm.whatsapp}
                    onChange={(e) => setSupForm({ ...supForm, whatsapp: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Gudang</label>
                <input
                  type="text"
                  value={supForm.address}
                  onChange={(e) => setSupForm({ ...supForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan Tambahan</label>
                <textarea
                  rows={2}
                  value={supForm.notes}
                  onChange={(e) => setSupForm({ ...supForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Simpan Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {editingCustomer ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}
              </h3>
              <button
                onClick={() => setIsCustomerModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-800 text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  value={custForm.name}
                  onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nomor HP / WA *</label>
                <input
                  type="text"
                  required
                  value={custForm.phone}
                  onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alamat</label>
                <input
                  type="text"
                  value={custForm.address}
                  onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md"
                >
                  Simpan Pelanggan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title={
          deleteConfirm.type === 'supplier'
            ? `Hapus Supplier "${deleteConfirm.name}"?`
            : `Hapus Pelanggan "${deleteConfirm.name}"?`
        }
        message={
          deleteConfirm.type === 'supplier'
            ? 'Kontak supplier ini akan dihapus dari daftar distributor.'
            : 'Data kontak member pelanggan ini akan dihapus.'
        }
        confirmLabel="Ya, Hapus Sekarang"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'supplier', id: '', name: '' })}
      />
    </div>
  );
};
