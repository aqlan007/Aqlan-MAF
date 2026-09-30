import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Camera,
  Check,
  Coffee,
  Download,
  Edit,
  FileText,
  Filter,
  Image as ImageIcon,
  Layers,
  Link as LinkIcon,
  Lock,
  Package,
  Percent,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Utensils,
  X,
} from 'lucide-react';
import { db } from '../../db/db';
import { PRESET_PRODUCT_IMAGES } from '../../db/sampleData';
import { supabaseService } from '../../services/supabase';
import { Category, Product, ProductAddon, Supplier, User } from '../../types';
import { formatNumber, formatRupiah, parseNumber } from '../../utils/format';
import { calculateProfitAndMargin } from '../../utils/hpp';
import { ConfirmModal } from '../common/ConfirmModal';

interface ProductsScreenProps {
  currentUser: User;
}

export const ProductsScreen: React.FC<ProductsScreenProps> = ({ currentUser }) => {
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'manager';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'updated'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Product Modal (Add / Edit)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State (Stock and BuyPrice removed per user request)
  const [formData, setFormData] = useState<{
    sku: string;
    barcode: string;
    name: string;
    image: string;
    categoryId: string;
    unit: string;
    hpp: number;
    sellPrice: number;
    wholesalePrice: number;
    supplierId: string;
    description: string;
    isActive: boolean;
    addons: ProductAddon[];
    // Diskon Produk
    isDiscountActive: boolean;
    discountType: 'percent' | 'fixed';
    discountValue: number;
    // Pajak Produk
    enableTax: boolean;
    taxRate: number;
  }>({
    sku: '',
    barcode: '',
    name: '',
    image: '',
    categoryId: '',
    unit: 'porsi',
    hpp: 0,
    sellPrice: 0,
    wholesalePrice: 0,
    supplierId: '',
    description: '',
    isActive: true,
    addons: [],
    isDiscountActive: false,
    discountType: 'percent',
    discountValue: 0,
    enableTax: true,
    taxRate: 11,
  });

  // Additional Menu (Addon) Draft in Form
  const [newAddonName, setNewAddonName] = useState('');
  const [newAddonPrice, setNewAddonPrice] = useState<number>(0);

  // Image upload options tab
  const [imageInputMode, setImageInputMode] = useState<'upload' | 'preset' | 'url'>('upload');
  const [customUrlInput, setCustomUrlInput] = useState('');

  // Confirmation Modal state for reliable delete
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    type: 'product' | 'category';
    id: string;
    name: string;
  }>({
    isOpen: false,
    type: 'product',
    id: '',
    name: '',
  });

  // Category Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  // Handle image upload from file / camera
  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Mohon pilih file gambar yang valid (JPG, PNG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setFormData((prev) => ({ ...prev, image: compressedDataUrl }));
        }
      };
      img.src = readerEvent.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const loadData = async () => {
    const p = await db.products.toArray();
    let c = await db.categories.toArray();
    const s = await db.suppliers.toArray();

    // Ensure standard categories (Minuman, Makanan, Snack) exist
    const standardCategories = [
      { id: 'cat-minuman', name: 'Minuman', icon: 'Coffee', color: '#0284c7', description: 'Kopi, teh, susu, jus, dan aneka minuman segar', createdAt: new Date().toISOString() },
      { id: 'cat-makanan', name: 'Makanan', icon: 'Utensils', color: '#ea580c', description: 'Nasi, mie, pasta, rice bowl, dan makanan utama', createdAt: new Date().toISOString() },
      { id: 'cat-snack', name: 'Snack', icon: 'Cookie', color: '#d97706', description: 'Camilan ringan, gorengan, french fries, pastry', createdAt: new Date().toISOString() },
    ];

    let hasAdded = false;
    for (const sc of standardCategories) {
      if (!c.some((cat) => cat.name.toLowerCase() === sc.name.toLowerCase())) {
        await db.categories.put(sc);
        hasAdded = true;
      }
    }
    if (hasAdded) {
      c = await db.categories.toArray();
    }

    setProducts(p);
    setCategories(c);
    setSuppliers(s);
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || table === 'products' || table === 'categories' || table === 'all') {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  // Filter & Sort
  const filteredProducts = useMemo(() => {
    let result = products;

    if (categoryFilter !== 'all') {
      result = result.filter((p) => p.categoryId === categoryFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'price') cmp = a.sellPrice - b.sellPrice;
      else if (sortBy === 'updated') cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [products, categoryFilter, search, sortBy, sortOrder]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    const randSku = 'SKU-' + Math.floor(1000 + Math.random() * 9000);
    const randBarcode = '899' + Math.floor(1000000000 + Math.random() * 9000000000);
    setFormData({
      sku: randSku,
      barcode: randBarcode,
      name: '',
      image: '',
      categoryId: categories[0]?.id || 'cat-minuman',
      unit: 'porsi',
      hpp: 0,
      sellPrice: 0,
      wholesalePrice: 0,
      supplierId: '',
      description: '',
      isActive: true,
      addons: [],
      isDiscountActive: false,
      discountType: 'percent',
      discountValue: 0,
      enableTax: true,
      taxRate: 11,
    });
    setNewAddonName('');
    setNewAddonPrice(0);
    setImageInputMode('upload');
    setCustomUrlInput('');
    setIsProductModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormData({
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      image: p.image || p.imageUrl || '',
      categoryId: p.categoryId,
      unit: p.unit || 'porsi',
      hpp: p.hpp || 0,
      sellPrice: p.sellPrice || 0,
      wholesalePrice: p.wholesalePrice || 0,
      supplierId: p.supplierId || '',
      description: p.description || '',
      isActive: p.isActive,
      addons: p.addons || [],
      isDiscountActive: !!p.isDiscountActive,
      discountType: p.discountType || 'percent',
      discountValue: p.discountValue || 0,
      enableTax: p.enableTax !== undefined ? p.enableTax : true,
      taxRate: p.taxRate !== undefined ? p.taxRate : 11,
    });
    setNewAddonName('');
    setNewAddonPrice(0);
    setImageInputMode('upload');
    setCustomUrlInput(p.image || p.imageUrl || '');
    setIsProductModalOpen(true);
  };

  // Addon management in form
  const handleAddAddon = () => {
    if (!newAddonName.trim()) return;
    const newAddon: ProductAddon = {
      id: `add-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newAddonName.trim(),
      price: Math.max(0, Number(newAddonPrice) || 0),
    };
    setFormData((prev) => ({
      ...prev,
      addons: [...prev.addons, newAddon],
    }));
    setNewAddonName('');
    setNewAddonPrice(0);
  };

  const handleRemoveAddon = (addonId: string) => {
    setFormData((prev) => ({
      ...prev,
      addons: prev.addons.filter((a) => a.id !== addonId),
    }));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Nama produk wajib diisi.');
      return;
    }

    const { profit, marginPercent } = calculateProfitAndMargin(
      formData.sellPrice,
      formData.hpp || 0
    );

    const now = new Date().toISOString();
    const finalImage = formData.image.trim();

    if (editingProduct) {
      await db.products.update(editingProduct.id, {
        sku: formData.sku,
        barcode: formData.barcode,
        name: formData.name,
        categoryId: formData.categoryId,
        unit: formData.unit,
        sellPrice: formData.sellPrice,
        wholesalePrice: formData.wholesalePrice,
        hpp: formData.hpp,
        supplierId: formData.supplierId,
        description: formData.description,
        isActive: formData.isActive,
        addons: formData.addons,
        // Diskon dan Pajak
        isDiscountActive: formData.isDiscountActive,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        enableTax: formData.enableTax,
        taxRate: formData.taxRate,
        image: finalImage,
        imageUrl: finalImage,
        margin: marginPercent,
        updatedAt: now,
      });
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: now,
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'UPDATE_PRODUCT',
        details: `Mengubah menu produk: ${formData.name} (${formData.sku})`,
      });
      const updated = await db.products.get(editingProduct.id);
      if (updated && supabaseService.isConfigured()) {
        await supabaseService.pushProduct(updated);
      }
    } else {
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        sku: formData.sku,
        barcode: formData.barcode,
        name: formData.name,
        categoryId: formData.categoryId,
        unit: formData.unit,
        buyPrice: 0,
        stock: 9999,
        minStock: 0,
        sellPrice: formData.sellPrice,
        wholesalePrice: formData.wholesalePrice,
        hpp: formData.hpp,
        supplierId: formData.supplierId,
        description: formData.description,
        isActive: formData.isActive,
        addons: formData.addons,
        // Diskon dan Pajak
        isDiscountActive: formData.isDiscountActive,
        discountType: formData.discountType,
        discountValue: formData.discountValue,
        enableTax: formData.enableTax,
        taxRate: formData.taxRate,
        image: finalImage,
        imageUrl: finalImage,
        margin: marginPercent,
        createdAt: now,
        updatedAt: now,
      };
      await db.products.add(newProd);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushProduct(newProd);
      }
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: now,
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'ADD_PRODUCT',
        details: `Menambah menu produk baru: ${formData.name} (${formData.sku})`,
      });
    }

    setIsProductModalOpen(false);
    await loadData();
  };

  // Safe delete handler using ConfirmModal
  const handleConfirmDelete = async () => {
    if (confirmDelete.type === 'product') {
      await db.products.delete(confirmDelete.id);
      if (supabaseService.isConfigured()) {
        await supabaseService.deleteProduct(confirmDelete.id);
      }
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'DELETE_PRODUCT',
        details: `Menghapus produk: ${confirmDelete.name}`,
      });
    } else if (confirmDelete.type === 'category') {
      await db.categories.delete(confirmDelete.id);
      if (supabaseService.isConfigured()) {
        await supabaseService.deleteCategory(confirmDelete.id);
      }
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'DELETE_CATEGORY',
        details: `Menghapus kategori: ${confirmDelete.name}`,
      });
    }
    setConfirmDelete({ isOpen: false, type: 'product', id: '', name: '' });
    await loadData();
  };

  // Add category
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    const newCat: Category = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      description: newCatDesc.trim(),
      createdAt: new Date().toISOString(),
    };

    await db.categories.add(newCat);
    setNewCatName('');
    setNewCatDesc('');
    await loadData();
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['SKU', 'Barcode', 'Nama Produk', 'Kategori', 'Harga Jual', 'Satuan', 'Additional Menu'];
    const rows = products.map((p) => {
      const cat = categories.find((c) => c.id === p.categoryId)?.name || '';
      const addonsCount = p.addons ? p.addons.length : 0;
      return [
        `"${p.sku}"`,
        `"${p.barcode}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${cat}"`,
        p.sellPrice,
        `"${p.unit}"`,
        addonsCount,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Daftar_Produk_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
            Menu &amp; Produk F&amp;B
          </h2>
          <p className="text-xs text-slate-400">
            Kelola menu makanan, minuman, snack, harga jual, dan additional menu (topping &amp; extra).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Kategori ({categories.length})</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          {isAdmin && (
            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Tambah Menu Produk</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Category Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
            categoryFilter === 'all'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Semua Menu ({products.length})
        </button>

        {/* Highlighted primary categories: Minuman, Makanan, Snack */}
        {categories.map((cat) => {
          const count = products.filter((p) => p.categoryId === cat.id).length;
          const isSelected = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{cat.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama menu, barcode, SKU..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Category Dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="name">Urut: Nama Menu</option>
            <option value="price">Urut: Harga Jual</option>
            <option value="updated">Urut: Terakhir Diupdate</option>
          </select>
          <button
            onClick={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
            title="Arah Urutan"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Cashier Mode Notice */}
      {!isAdmin && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold">Mode Kasir (Katalog Menu &amp; Additional):</span>
              <p className="text-[11px] text-amber-800">
                Kasir dapat melihat harga jual dan opsi additional menu. Pengeditan dan penambahan menu diproteksi khusus Admin.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Products Table (Stock and Buy Price removed) */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              {isAdmin ? (
                <tr>
                  <th className="py-3.5 px-4">Menu &amp; Produk</th>
                  <th className="py-3.5 px-3">Kategori</th>
                  <th className="py-3.5 px-3 text-right">Harga Jual</th>
                  <th className="py-3.5 px-3 text-center">Diskon &amp; Pajak</th>
                  <th className="py-3.5 px-3 text-right">HPP (Resep)</th>
                  <th className="py-3.5 px-3 text-right">Margin</th>
                  <th className="py-3.5 px-3 text-center">Additional Menu</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              ) : (
                <tr>
                  <th className="py-3.5 px-4">Menu &amp; Produk</th>
                  <th className="py-3.5 px-3">Kategori</th>
                  <th className="py-3.5 px-3 text-right">Harga Jual</th>
                  <th className="py-3.5 px-3 text-center">Diskon &amp; Pajak</th>
                  <th className="py-3.5 px-3 text-center">Additional Menu</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 5} className="py-12 text-center text-slate-400">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-600">Tidak ada produk ditemukan</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tambahkan produk baru atau ubah filter pencarian.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const cat = categories.find((c) => c.id === product.categoryId);
                  const addonCount = product.addons?.length || 0;
                  const hasDiscount = !!product.isDiscountActive && (product.discountValue || 0) > 0;
                  const discountDeduction = hasDiscount
                    ? product.discountType === 'percent'
                      ? Math.round((product.sellPrice * (product.discountValue || 0)) / 100)
                      : product.discountValue || 0
                    : 0;
                  const finalSellPrice = Math.max(0, product.sellPrice - discountDeduction);

                  if (!isAdmin) {
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 text-xs sm:text-sm">
                            {product.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span>SKU: {product.sku}</span>
                            <span>•</span>
                            <span>Barcode: {product.barcode}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-medium text-[11px]">
                            {cat?.name || '-'}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono">
                          {hasDiscount ? (
                            <div>
                              <span className="text-[10px] text-slate-400 line-through block">
                                {formatRupiah(product.sellPrice)}
                              </span>
                              <span className="font-bold text-emerald-700 text-sm">
                                {formatRupiah(finalSellPrice)}
                              </span>
                            </div>
                          ) : (
                            <span className="font-bold text-emerald-700 text-sm">
                              {formatRupiah(product.sellPrice)}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            /{product.unit}
                          </span>
                        </td>

                        {/* Diskon & Pajak Badge */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {hasDiscount ? (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-black text-[10px] border border-amber-300">
                                Diskon {product.discountType === 'percent' ? `${product.discountValue}%` : formatRupiah(product.discountValue || 0)}
                              </span>
                            ) : null}
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              product.enableTax !== false
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              {product.enableTax !== false ? `PPN ${product.taxRate || 11}%` : 'Bebas PPN'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center">
                          {addonCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-[11px] border border-emerald-200">
                              +{addonCount} Opsi Tambahan
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Product Name & Thumbnail */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                            {product.image || product.imageUrl ? (
                              <img
                                src={product.image || product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-400">
                                <Coffee className="w-5 h-5 stroke-1" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                              {product.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>SKU: {product.sku}</span>
                              <span>•</span>
                              <span>Barcode: {product.barcode}</span>
                              {product.hasRecipe && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[10px]">
                                  🌿 Resep ({product.foodCostPercent || 35}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                          {cat?.name || '-'}
                        </span>
                      </td>

                      {/* Sell Price */}
                      <td className="py-3 px-3 text-right font-mono">
                        {hasDiscount ? (
                          <div>
                            <span className="text-[10px] text-slate-400 line-through block">
                              {formatRupiah(product.sellPrice)}
                            </span>
                            <span className="font-black text-emerald-700 text-sm">
                              {formatRupiah(finalSellPrice)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-black text-emerald-700 text-sm">
                            {formatRupiah(product.sellPrice)}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-normal ml-1">
                          /{product.unit}
                        </span>
                      </td>

                      {/* Diskon & Pajak Column */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {hasDiscount ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-black text-[10px] border border-amber-300">
                              Diskon {product.discountType === 'percent' ? `${product.discountValue}%` : formatRupiah(product.discountValue || 0)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Tanpa Diskon</span>
                          )}
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            product.enableTax !== false
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {product.enableTax !== false ? `PPN ${product.taxRate || 11}%` : 'Bebas PPN'}
                          </span>
                        </div>
                      </td>

                      {/* HPP (Optional / Calculated from Recipe) */}
                      <td className="py-3 px-3 text-right font-mono">
                        {product.hpp > 0 ? (
                          <div className="font-bold text-amber-700">{formatRupiah(product.hpp)}</div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                        {product.hasRecipe && (
                          <div className="text-[9px] text-slate-400">Bahan Pokok</div>
                        )}
                      </td>

                      {/* Margin % */}
                      <td className="py-3 px-3 text-right font-bold">
                        {product.hpp > 0 ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              product.margin >= 30
                                ? 'bg-emerald-100 text-emerald-800'
                                : product.margin >= 15
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {product.margin}%
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">-</span>
                        )}
                      </td>

                      {/* Additional Menu count */}
                      <td className="py-3 px-3 text-center">
                        {addonCount > 0 ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 font-bold text-[11px] border border-purple-200">
                            <Layers className="w-3 h-3" />
                            <span>{addonCount} Tambahan</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-[11px]">Tanpa Tambahan</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEdit(product)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Edit Menu Produk"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                isOpen: true,
                                type: 'product',
                                id: product.id,
                                name: product.name,
                              })
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Hapus Menu Produk"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Package className="w-5 h-5" />
                <span>{editingProduct ? 'Edit Menu & Produk' : 'Tambah Menu & Produk Baru'}</span>
              </h3>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="p-1 rounded-full hover:bg-emerald-700 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* UPLOAD FOTO / GAMBAR PRODUK */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    <span>Upload Foto / Gambar Produk</span>
                  </label>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    {formData.image ? 'Foto Siap Pakai' : 'Opsional'}
                  </span>
                </div>

                {/* If image is already selected */}
                {formData.image ? (
                  <div className="flex items-center gap-3.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                    <div className="w-20 h-20 rounded-xl overflow-hidden border border-emerald-400 shadow-xs shrink-0 relative bg-slate-100">
                      <img
                        src={formData.image}
                        alt="Preview Produk"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 space-y-1.5 min-w-0">
                      <p className="text-xs font-bold text-slate-800">Foto menu produk aktif</p>
                      <p className="text-[11px] text-slate-500">
                        Foto ini akan tampil di katalog kasir POS.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <label className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold cursor-pointer transition-colors flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5" />
                          <span>Ganti Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageFileUpload}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, image: '' })}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-600">
                      <button
                        type="button"
                        onClick={() => setImageInputMode('upload')}
                        className={`flex-1 py-1 px-2 rounded-lg transition-colors cursor-pointer text-center ${
                          imageInputMode === 'upload' ? 'bg-emerald-600 text-white shadow-xs' : 'hover:bg-slate-50'
                        }`}
                      >
                        📁 File / Kamera
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageInputMode('preset')}
                        className={`flex-1 py-1 px-2 rounded-lg transition-colors cursor-pointer text-center ${
                          imageInputMode === 'preset' ? 'bg-emerald-600 text-white shadow-xs' : 'hover:bg-slate-50'
                        }`}
                      >
                        ✨ Galeri Rekomendasi F&amp;B
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageInputMode('url')}
                        className={`flex-1 py-1 px-2 rounded-lg transition-colors cursor-pointer text-center ${
                          imageInputMode === 'url' ? 'bg-emerald-600 text-white shadow-xs' : 'hover:bg-slate-50'
                        }`}
                      >
                        🔗 URL Gambar
                      </button>
                    </div>

                    {imageInputMode === 'upload' && (
                      <label className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-white">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-1">
                          <Camera className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-slate-800">
                          Klik untuk Unggah Foto dari Perangkat / Kamera
                        </span>
                        <span className="text-[11px] text-slate-400 mt-0.5">
                          Mendukung file JPG, PNG, atau WebP
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}

                    {imageInputMode === 'preset' && (
                      <div className="space-y-1.5 bg-white p-2.5 rounded-xl border border-slate-200">
                        <p className="text-[11px] text-slate-500 font-medium">
                          Pilih gambar siap pakai untuk menu Anda:
                        </p>
                        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto p-1">
                          {PRESET_PRODUCT_IMAGES.map((preset) => (
                            <button
                              key={preset.name}
                              type="button"
                              onClick={() => setFormData({ ...formData, image: preset.url })}
                              className="group relative rounded-xl overflow-hidden aspect-square border border-slate-200 hover:border-emerald-500 hover:ring-2 hover:ring-emerald-500/20 transition-all cursor-pointer text-left"
                            >
                              <img
                                src={preset.url}
                                alt={preset.name}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1 text-[9px] text-white font-bold leading-tight truncate">
                                {preset.name}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {imageInputMode === 'url' && (
                      <div className="flex gap-2 bg-white p-2 rounded-xl border border-slate-200">
                        <input
                          type="url"
                          placeholder="https://images.unsplash.com/..."
                          value={customUrlInput}
                          onChange={(e) => setCustomUrlInput(e.target.value)}
                          className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customUrlInput.trim()) {
                              setFormData({ ...formData, image: customUrlInput.trim() });
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                        >
                          Terapkan
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Menu &amp; Produk *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Kopi Susu Gula Aren, Croissant, Nasi Goreng..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Category: Minuman, Makanan, Snack */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kategori Menu *
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500 bg-white font-semibold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Satuan Unit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Satuan Porsi</label>
                  <input
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="cup, porsi, gelas, pcs, slice..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Harga Jual & HPP Section (NO BUY PRICE, NO STOCK) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-emerald-700 mb-1">
                      Harga Jual (Rp) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={formData.sellPrice || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, sellPrice: Math.max(0, Number(e.target.value)) })
                      }
                      placeholder="Contoh: 25000"
                      className="w-full px-3 py-2 rounded-xl border border-emerald-300 text-sm font-mono font-black bg-emerald-50/40 text-emerald-900 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Estimasi HPP Resep (Rp) <span className="text-[10px] font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.hpp || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, hpp: Math.max(0, Number(e.target.value)) })
                      }
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {formData.sellPrice > 0 && formData.hpp > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 text-slate-600">
                    <span>
                      Estimasi Laba Kotor:{' '}
                      <strong className="text-emerald-700 font-black">
                        {formatRupiah(formData.sellPrice - formData.hpp)}
                      </strong>
                    </span>
                    <span>
                      Margin:{' '}
                      <strong className="text-slate-900 font-black">
                        {calculateProfitAndMargin(formData.sellPrice, formData.hpp).marginPercent}%
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              {/* FITUR 3: ADDITIONAL MENU / TOPPING / EXTRA MODIFIERS */}
              <div className="bg-purple-50/50 border border-purple-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-purple-950 uppercase tracking-wider">
                        Additional Menu &amp; Topping (Opsi Tambahan)
                      </h4>
                      <p className="text-[11px] text-purple-700">
                        Opsi tambahan saat kasir memilih menu ini di kasir POS (contoh: Extra Shot, Boba, Sambal).
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                    {formData.addons.length} Opsi
                  </span>
                </div>

                {/* Form to add an addon */}
                <div className="bg-white p-3 rounded-xl border border-purple-200 shadow-2xs space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        placeholder="Nama opsi (cth: Extra Espresso Shot, Boba, Cheese)"
                        value={newAddonName}
                        onChange={(e) => setNewAddonName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAddon();
                          }
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="number"
                        min="0"
                        placeholder="+ Harga (Rp)"
                        value={newAddonPrice || ''}
                        onChange={(e) => setNewAddonPrice(Math.max(0, Number(e.target.value)))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAddon();
                          }
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddAddon}
                        disabled={!newAddonName.trim()}
                        className="w-full h-full py-1.5 px-3 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-semibold mr-1">Rekomendasi Cepat:</span>
                    {[
                      { name: 'Extra Shot Espresso', price: 5000 },
                      { name: 'Oat Milk Substitution', price: 6000 },
                      { name: 'Topping Boba', price: 4000 },
                      { name: 'Extra Keju / Cheese', price: 5000 },
                      { name: 'Extra Sambal Spesial', price: 3000 },
                      { name: 'Upsize Large', price: 5000 },
                    ].map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          if (!formData.addons.some((a) => a.name === preset.name)) {
                            setFormData((prev) => ({
                              ...prev,
                              addons: [
                                ...prev.addons,
                                {
                                  id: `add-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                  name: preset.name,
                                  price: preset.price,
                                },
                              ],
                            }));
                          }
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-medium cursor-pointer transition-colors"
                      >
                        + {preset.name} (+{formatRupiah(preset.price)})
                      </button>
                    ))}
                  </div>
                </div>

                {/* List of current addons for this product */}
                {formData.addons.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {formData.addons.map((addon) => (
                      <div
                        key={addon.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-white border border-purple-100 shadow-2xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-slate-800 truncate">{addon.name}</p>
                          <p className="text-[11px] font-mono font-semibold text-emerald-700">
                            +{formatRupiah(addon.price)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAddon(addon.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                          title="Hapus opsi ini"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center text-[11px] text-purple-600/70 bg-purple-50/50 rounded-xl">
                    Belum ada menu tambahan (additional) untuk produk ini.
                  </div>
                )}
              </div>

              {/* FITUR DISKON PRODUK */}
              <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-amber-950 uppercase tracking-wider">
                        Diskon Menu &amp; Produk
                      </h4>
                      <p className="text-[11px] text-amber-800">
                        Atur potongan harga promo langsung pada menu ini di kasir POS.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!formData.isDiscountActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isDiscountActive: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {formData.isDiscountActive && (
                  <div className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Tipe Diskon:</span>
                      <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, discountType: 'percent' })}
                          className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                            formData.discountType === 'percent'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Persentase (%)
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, discountType: 'fixed' })}
                          className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                            formData.discountType === 'fixed'
                              ? 'bg-amber-500 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Nominal Tetap (Rp)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {formData.discountType === 'percent' ? 'Besar Diskon (%)' : 'Besar Diskon (Rp)'}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max={formData.discountType === 'percent' ? 100 : formData.sellPrice}
                            value={formData.discountValue || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                discountValue: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            placeholder={formData.discountType === 'percent' ? '10' : '5000'}
                            className="w-full px-3 py-2 pr-10 rounded-xl border border-amber-300 font-mono font-bold text-xs bg-amber-50/30 text-amber-900 focus:ring-2 focus:ring-amber-500"
                          />
                          <span className="absolute right-3 top-2 text-xs font-bold text-amber-700">
                            {formData.discountType === 'percent' ? '%' : 'Rp'}
                          </span>
                        </div>
                      </div>

                      {/* Preset buttons */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-semibold block">Rekomendasi Cepat:</span>
                        <div className="flex flex-wrap gap-1">
                          {formData.discountType === 'percent'
                            ? [5, 10, 15, 20, 25, 50].map((pct) => (
                                <button
                                  key={pct}
                                  type="button"
                                  onClick={() => setFormData({ ...formData, discountValue: pct })}
                                  className={`text-[10px] px-2 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                                    formData.discountValue === pct
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {pct}%
                                </button>
                              ))
                            : [1000, 2000, 3000, 5000, 10000].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setFormData({ ...formData, discountValue: amt })}
                                  className={`text-[10px] px-2 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                                    formData.discountValue === amt
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                >
                                  {formatRupiah(amt)}
                                </button>
                              ))}
                        </div>
                      </div>
                    </div>

                    {/* Preview harga promo */}
                    {formData.sellPrice > 0 && formData.discountValue > 0 && (
                      <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-500 text-[11px] block">
                            Harga Normal: <span className="line-through">{formatRupiah(formData.sellPrice)}</span>
                          </span>
                          <span className="font-extrabold text-amber-900">
                            Potongan Diskon: -{formatRupiah(
                              formData.discountType === 'percent'
                                ? Math.round((formData.sellPrice * formData.discountValue) / 100)
                                : Math.min(formData.sellPrice, formData.discountValue)
                            )}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-emerald-800 block">Harga Bersih di POS:</span>
                          <span className="text-sm font-black text-emerald-700 font-mono">
                            {formatRupiah(
                              Math.max(
                                0,
                                formData.sellPrice -
                                  (formData.discountType === 'percent'
                                    ? Math.round((formData.sellPrice * formData.discountValue) / 100)
                                    : Math.min(formData.sellPrice, formData.discountValue))
                              )
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FITUR PAJAK PRODUK */}
              <div className="bg-blue-50/60 border border-blue-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                      <Percent className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-blue-950 uppercase tracking-wider">
                        Pajak Menu &amp; Produk
                      </h4>
                      <p className="text-[11px] text-blue-800">
                        Pengenaan Pajak Restoran (PB1 10%) atau Pajak Pertambahan Nilai (PPN 11%).
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.enableTax !== false}
                      onChange={(e) =>
                        setFormData({ ...formData, enableTax: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {formData.enableTax !== false ? (
                  <div className="bg-white p-3.5 rounded-xl border border-blue-200 shadow-2xs space-y-3 animate-in fade-in duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Tarif Pajak Produk (%)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={formData.taxRate !== undefined ? formData.taxRate : 11}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                taxRate: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            placeholder="11"
                            className="w-full px-3 py-2 pr-10 rounded-xl border border-blue-300 font-mono font-bold text-xs bg-blue-50/30 text-blue-900 focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="absolute right-3 top-2 text-xs font-bold text-blue-700">
                            %
                          </span>
                        </div>
                      </div>

                      {/* Preset buttons */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-semibold block">Pilihan Standar:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            { label: 'PPN 11%', rate: 11 },
                            { label: 'PB1 Resto 10%', rate: 10 },
                            { label: 'Bebas (0%)', rate: 0 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => setFormData({ ...formData, taxRate: preset.rate })}
                              className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                                formData.taxRate === preset.rate
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-[11px] text-blue-900 flex items-center justify-between">
                      <span>Status Pajak: <strong>Dikenakan Pajak {formData.taxRate || 11}%</strong></span>
                      <span className="font-semibold text-blue-700">Otomatis dihitung di kasir POS</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    <span>Menu ini <strong>Bebas Pajak (Non-Taxable)</strong>. Transaksi menu ini tidak akan dipungut pajak di POS.</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Deskripsi / Keterangan Menu
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Penjelasan rasa, bahan utama, atau saran penyajian..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Menu Produk</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CATEGORIES MANAGEMENT MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">Kelola Kategori Menu</h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-800 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Form Add Category */}
              <form onSubmit={handleAddCategory} className="space-y-2 pb-4 border-b border-slate-200">
                <label className="block text-xs font-bold text-slate-700">Tambah Kategori Baru</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Nama Kategori (cth: Minuman, Makanan, Snack)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah</span>
                  </button>
                </div>
              </form>

              {/* Category List */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {categories.map((cat) => {
                  const prodCount = products.filter((p) => p.categoryId === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100"
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-800">{cat.name}</div>
                        <div className="text-[10px] text-slate-400">{prodCount} menu terdaftar</div>
                      </div>
                      <button
                        onClick={() =>
                          setConfirmDelete({
                            isOpen: true,
                            type: 'category',
                            id: cat.id,
                            name: cat.name,
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Hapus Kategori"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL (Replaces blocked window.confirm) */}
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        title={
          confirmDelete.type === 'product'
            ? `Hapus Menu "${confirmDelete.name}"?`
            : `Hapus Kategori "${confirmDelete.name}"?`
        }
        message={
          confirmDelete.type === 'product'
            ? 'Menu ini akan dihapus dari daftar katalog produk dan kasir POS.'
            : 'Kategori ini akan dihapus. Menu yang menggunakan kategori ini akan tetap tersimpan di database.'
        }
        confirmLabel="Ya, Hapus Sekarang"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete({ isOpen: false, type: 'product', id: '', name: '' })}
      />
    </div>
  );
};
