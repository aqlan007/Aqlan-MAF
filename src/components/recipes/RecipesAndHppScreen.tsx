import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronRight,
  Coffee,
  DollarSign,
  Download,
  Edit2,
  Filter,
  Flame,
  HelpCircle,
  Info,
  Layers,
  Package,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sliders,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  Utensils,
  Wheat,
  X,
  Zap,
} from 'lucide-react';
import { db } from '../../db/db';
import { supabaseService } from '../../services/supabase';
import {
  Ingredient,
  IngredientCategory,
  Product,
  ProductRecipe,
  RecipeItem,
  Supplier,
  User,
} from '../../types';
import { formatNumber, formatRupiah } from '../../utils/format';
import {
  calculateEffectiveUnitCost,
  calculateRecipeTotals,
  RecipeTotalCalculationResult,
} from '../../utils/hpp';
import { ConfirmModal } from '../common/ConfirmModal';

interface RecipesAndHppScreenProps {
  currentUser: User;
}

const INGREDIENT_CATEGORIES: { id: IngredientCategory; label: string; icon: string }[] = [
  { id: 'kopi_espresso', label: 'Biji Kopi & Espresso', icon: '☕' },
  { id: 'dairy_susu', label: 'Susu & Dairy', icon: '🥛' },
  { id: 'sirup_pemanis', label: 'Sirup & Gula Aren', icon: '🍯' },
  { id: 'bubuk_powder', label: 'Matcha & Cokelat Powder', icon: '🍵' },
  { id: 'protein_daging', label: 'Daging, Ayam & Telur', icon: '🍗' },
  { id: 'karbo_baking', label: 'Beras, Pasta & Kentang', icon: '🌾' },
  { id: 'bumbu_sauce', label: 'Saus & Bumbu Dapur', icon: '🌶️' },
  { id: 'packaging', label: 'Kemasan (Cup/Box/Sedotan)', icon: '📦' },
  { id: 'topping', label: 'Topping & Garnish', icon: '🍒' },
  { id: 'lainnya', label: 'Es Batu & Lain-lain', icon: '🧊' },
];

export const RecipesAndHppScreen: React.FC<RecipesAndHppScreenProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'calculator' | 'ingredients' | 'matrix'>('calculator');
  const [isLoading, setIsLoading] = useState(true);

  // Database Data
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Delete Confirmation Modal State
  const [deleteConfirmIng, setDeleteConfirmIng] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
  }>({
    isOpen: false,
    id: '',
    name: '',
  });

  // Selected Product for Recipe Builder
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [currentRecipe, setCurrentRecipe] = useState<Partial<ProductRecipe>>({
    items: [],
    packagingCost: 850,
    laborCost: 400,
    utilityCost: 300,
    otherCost: 0,
    targetFoodCostPercent: 35,
    actualSellPrice: 0,
  });

  // Ingredient search in builder
  const [builderIngredientSearch, setBuilderIngredientSearch] = useState('');
  const [showAddIngredientDropdown, setShowAddIngredientDropdown] = useState(false);

  // Ingredient Management Tab State
  const [searchIngredientText, setSearchIngredientText] = useState('');
  const [selectedIngCategory, setSelectedIngCategory] = useState<string>('all');
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);

  // Restock Quick Modal
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockIngredient, setRestockIngredient] = useState<Ingredient | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(0);
  const [restockNewPrice, setRestockNewPrice] = useState<number>(0);

  // Toast notification
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Load all initial data
  const loadData = async () => {
    try {
      setIsLoading(true);
      const [ings, prods, recs, sups] = await Promise.all([
        db.ingredients.toArray(),
        db.products.toArray(),
        db.recipes.toArray(),
        db.suppliers.toArray(),
      ]);

      setIngredients(ings);
      setProducts(prods);
      setRecipes(recs);
      setSuppliers(sups);

      // Default select first product with recipe or first product
      if (!selectedProductId && prods.length > 0) {
        const prodWithRecipe = prods.find((p) => p.hasRecipe) || prods[0];
        setSelectedProductId(prodWithRecipe.id);
      }
    } catch (err) {
      console.error('Failed loading recipe data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || table === 'ingredients' || table === 'recipes' || table === 'products' || table === 'all') {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  // When selectedProductId changes, load its recipe or prepare clean draft
  useEffect(() => {
    if (!selectedProductId) return;

    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const existingRecipe = recipes.find((r) => r.productId === selectedProductId);

    if (existingRecipe) {
      setCurrentRecipe({
        ...existingRecipe,
        actualSellPrice: prod.sellPrice,
      });
    } else {
      // Default empty template for this menu
      setCurrentRecipe({
        productId: prod.id,
        productName: prod.name,
        items: [],
        packagingCost: prod.unit === 'cup' ? 850 : 1250,
        laborCost: 400,
        utilityCost: 300,
        otherCost: 0,
        targetFoodCostPercent: 35,
        actualSellPrice: prod.sellPrice,
        notes: '',
      });
    }
  }, [selectedProductId, products, recipes]);

  // Selected product object
  const currentProduct = products.find((p) => p.id === selectedProductId);

  // Live Calculation using HPP utility
  const calculationResult: RecipeTotalCalculationResult = calculateRecipeTotals({
    itemSubtotals: (currentRecipe.items || []).map((it) => it.subtotal || 0),
    packagingCost: currentRecipe.packagingCost,
    laborCost: currentRecipe.laborCost,
    utilityCost: currentRecipe.utilityCost,
    otherCost: currentRecipe.otherCost,
    targetFoodCostPercent: currentRecipe.targetFoodCostPercent,
    actualSellPrice: currentRecipe.actualSellPrice || currentProduct?.sellPrice || 0,
  });

  // Handle adding an ingredient to current recipe
  const handleAddIngredientToRecipe = (ing: Ingredient) => {
    const existingIndex = (currentRecipe.items || []).findIndex((i) => i.ingredientId === ing.id);
    if (existingIndex >= 0) {
      showToast(`${ing.name} sudah ada di resep. Ubah takaran di daftar bawah.`, 'error');
      setShowAddIngredientDropdown(false);
      return;
    }

    const defaultQty = ing.recipeUnit === 'gram' ? 18 : ing.recipeUnit === 'ml' ? 30 : 1;
    const newItem: RecipeItem = {
      ingredientId: ing.id,
      ingredientName: ing.name,
      recipeUnit: ing.recipeUnit,
      quantity: defaultQty,
      unitCost: ing.effectiveCostPerRecipeUnit,
      subtotal: Math.round(defaultQty * ing.effectiveCostPerRecipeUnit),
    };

    setCurrentRecipe((prev) => ({
      ...prev,
      items: [...(prev.items || []), newItem],
    }));

    setShowAddIngredientDropdown(false);
    setBuilderIngredientSearch('');
  };

  // Update item quantity
  const handleUpdateItemQuantity = (index: number, qty: number) => {
    const items = [...(currentRecipe.items || [])];
    if (!items[index]) return;

    const safeQty = Math.max(0, qty);
    items[index] = {
      ...items[index],
      quantity: safeQty,
      subtotal: Math.round(safeQty * items[index].unitCost),
    };

    setCurrentRecipe((prev) => ({ ...prev, items }));
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    const items = [...(currentRecipe.items || [])];
    items.splice(index, 1);
    setCurrentRecipe((prev) => ({ ...prev, items }));
  };

  // Save Recipe & Apply HPP to Product in Database
  const handleSaveRecipeAndApply = async () => {
    if (!currentProduct) return;

    if (!currentRecipe.items || currentRecipe.items.length === 0) {
      showToast('Tambahkan minimal 1 bahan baku ke dalam resep.', 'error');
      return;
    }

    try {
      const recipeId = currentRecipe.id || `rec-${currentProduct.id}`;
      const updatedRecipe: ProductRecipe = {
        id: recipeId,
        productId: currentProduct.id,
        productName: currentProduct.name,
        items: currentRecipe.items,
        packagingCost: currentRecipe.packagingCost || 0,
        laborCost: currentRecipe.laborCost || 0,
        utilityCost: currentRecipe.utilityCost || 0,
        otherCost: currentRecipe.otherCost || 0,
        totalIngredientCost: calculationResult.totalIngredientCost,
        totalHpp: calculationResult.totalHpp,
        targetFoodCostPercent: currentRecipe.targetFoodCostPercent || 35,
        recommendedPrice: calculationResult.recommendedPrice,
        actualSellPrice: currentRecipe.actualSellPrice || currentProduct.sellPrice,
        actualFoodCostPercent: calculationResult.actualFoodCostPercent,
        actualMarginPercent: calculationResult.actualMarginPercent,
        actualProfit: calculationResult.actualProfit,
        notes: currentRecipe.notes || '',
        updatedAt: new Date().toISOString(),
      };

      // 1. Put recipe in Dexie
      await db.recipes.put(updatedRecipe);

      // 2. Update product HPP, SellPrice, and Food Cost in Dexie
      await db.products.update(currentProduct.id, {
        buyPrice: calculationResult.totalIngredientCost,
        hpp: calculationResult.totalHpp,
        sellPrice: currentRecipe.actualSellPrice || currentProduct.sellPrice,
        margin: calculationResult.actualMarginPercent,
        hasRecipe: true,
        recipeId: recipeId,
        foodCostPercent: calculationResult.actualFoodCostPercent,
        updatedAt: new Date().toISOString(),
      });

      // 3. Log Audit
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'UPDATE_RECIPE_HPP',
        details: `Memperbarui formula resep menu ${currentProduct.name}: HPP Rp ${formatNumber(
          calculationResult.totalHpp
        )}, Food Cost ${calculationResult.actualFoodCostPercent}%`,
      });

      if (supabaseService.isConfigured()) {
        await supabaseService.pushRecipe(updatedRecipe);
        const freshProduct = await db.products.get(currentProduct.id);
        if (freshProduct) {
          await supabaseService.pushProduct(freshProduct);
        }
      }

      showToast(`Resep berhasil disimpan! HPP menu ${currentProduct.name} otomatis diperbarui ke Kasir.`);
      await loadData();
    } catch (err) {
      console.error('Failed saving recipe:', err);
      showToast('Gagal menyimpan resep. Silakan coba lagi.', 'error');
    }
  };

  // Quick Restock Ingredient
  const handleQuickRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockIngredient) return;

    if (restockAmount <= 0) {
      showToast('Jumlah restock harus lebih dari 0.', 'error');
      return;
    }

    try {
      const addedRecipeUnits = restockAmount * (restockIngredient.conversionFactor || 1);
      const newStock = (restockIngredient.currentStock || 0) + addedRecipeUnits;

      const newPurchasePrice = restockNewPrice > 0 ? restockNewPrice : restockIngredient.purchasePrice;
      const effectiveCost = calculateEffectiveUnitCost(
        newPurchasePrice,
        restockIngredient.conversionFactor,
        restockIngredient.wastagePercent
      );

      await db.ingredients.update(restockIngredient.id, {
        currentStock: newStock,
        purchasePrice: newPurchasePrice,
        costPerRecipeUnit: newPurchasePrice / (restockIngredient.conversionFactor || 1),
        effectiveCostPerRecipeUnit: effectiveCost,
        updatedAt: new Date().toISOString(),
      });

      // Record movement
      await db.ingredient_movements.add({
        id: `im-restock-${Date.now()}`,
        date: new Date().toISOString(),
        ingredientId: restockIngredient.id,
        ingredientName: restockIngredient.name,
        type: 'purchase_in',
        quantity: addedRecipeUnits,
        recipeUnit: restockIngredient.recipeUnit,
        unitCost: effectiveCost,
        totalCost: restockAmount * newPurchasePrice,
        notes: `Restock bahan baku (+${restockAmount} ${restockIngredient.purchaseUnit})`,
        createdAt: new Date().toISOString(),
      });

      const updatedIng = await db.ingredients.get(restockIngredient.id);
      if (updatedIng && supabaseService.isConfigured()) {
        await supabaseService.pushIngredient(updatedIng);
      }

      showToast(`Berhasil restock ${restockAmount} ${restockIngredient.purchaseUnit} ${restockIngredient.name}!`);
      setShowRestockModal(false);
      setRestockIngredient(null);
      await loadData();
    } catch (err) {
      console.error('Restock error:', err);
      showToast('Gagal memproses restock.', 'error');
    }
  };

  // Save or Create Ingredient from Form
  const handleSaveIngredientForm = async (formData: Partial<Ingredient>) => {
    try {
      const id = editingIngredient ? editingIngredient.id : `ing-${Date.now()}`;
      const factor = Number(formData.conversionFactor) || 1000;
      const pPrice = Number(formData.purchasePrice) || 0;
      const wastage = Number(formData.wastagePercent) || 0;
      const baseCost = pPrice / factor;
      const effectiveCost = calculateEffectiveUnitCost(pPrice, factor, wastage);

      const record: Ingredient = {
        id,
        name: formData.name || 'Bahan Baku',
        category: (formData.category as IngredientCategory) || 'lainnya',
        purchaseUnit: formData.purchaseUnit || 'kg',
        purchasePrice: pPrice,
        purchaseUnitSize: Number(formData.purchaseUnitSize) || factor,
        recipeUnit: formData.recipeUnit || 'gram',
        conversionFactor: factor,
        costPerRecipeUnit: baseCost,
        wastagePercent: wastage,
        effectiveCostPerRecipeUnit: effectiveCost,
        currentStock: Number(formData.currentStock) || 0,
        minStock: Number(formData.minStock) || 0,
        supplierId: formData.supplierId,
        notes: formData.notes || '',
        updatedAt: new Date().toISOString(),
      };

      await db.ingredients.put(record);
      if (supabaseService.isConfigured()) {
        await supabaseService.pushIngredient(record);
      }
      showToast(editingIngredient ? 'Bahan baku diperbarui' : 'Bahan baku baru ditambahkan');
      setShowIngredientModal(false);
      setEditingIngredient(null);
      await loadData();
    } catch (err) {
      console.error('Failed saving ingredient:', err);
      showToast('Gagal menyimpan bahan baku.', 'error');
    }
  };

  // Delete ingredient trigger modal
  const handleDeleteIngredient = (id: string, name: string) => {
    setDeleteConfirmIng({
      isOpen: true,
      id,
      name,
    });
  };

  const handleConfirmDeleteIngredient = async () => {
    try {
      await db.ingredients.delete(deleteConfirmIng.id);
      if (supabaseService.isConfigured()) {
        await supabaseService.deleteIngredient(deleteConfirmIng.id);
      }
      showToast(`Bahan baku ${deleteConfirmIng.name} telah dihapus.`);
      await loadData();
    } catch (err) {
      console.error('Error deleting ingredient:', err);
      showToast('Gagal menghapus bahan baku.', 'error');
    } finally {
      setDeleteConfirmIng({ isOpen: false, id: '', name: '' });
    }
  };

  // Filtered ingredients for Tab 2
  const filteredIngredients = ingredients.filter((ing) => {
    const matchCategory = selectedIngCategory === 'all' || ing.category === selectedIngCategory;
    const matchSearch =
      searchIngredientText === '' ||
      ing.name.toLowerCase().includes(searchIngredientText.toLowerCase()) ||
      ing.purchaseUnit.toLowerCase().includes(searchIngredientText.toLowerCase());
    return matchCategory && matchSearch;
  });

  // Critical Low Stock Ingredients count
  const lowStockCount = ingredients.filter((i) => i.currentStock <= i.minStock).length;

  // Average food cost of menus with recipes
  const menusWithRecipe = products.filter((p) => p.hasRecipe && p.foodCostPercent);
  const avgFoodCost =
    menusWithRecipe.length > 0
      ? (menusWithRecipe.reduce((acc, p) => acc + (p.foodCostPercent || 0), 0) / menusWithRecipe.length).toFixed(1)
      : '35.0';

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden">
      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold flex items-center gap-2.5 animate-bounce ${
            toastMsg.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-emerald-600 text-white border-emerald-500'
          }`}
        >
          {toastMsg.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Check className="w-5 h-5" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="bg-white border-b border-slate-200 px-4 xl:px-6 py-3.5 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg xl:text-xl font-black text-slate-800 leading-tight">
                Formula Resep & HPP Bahan Baku
              </h1>
              <p className="text-xs text-slate-500">
                Kalkulator Food Cost, Bill of Materials (BOM), dan Analisis Keuntungan Menu F&B
              </p>
            </div>
          </div>
        </div>

        {/* Sub-tab Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('calculator')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'calculator'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Kalkulator HPP & Resep</span>
          </button>
          <button
            onClick={() => setActiveSubTab('ingredients')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
              activeSubTab === 'ingredients'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wheat className="w-3.5 h-3.5" />
            <span>Bahan Baku ({ingredients.length})</span>
            {lowStockCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            )}
          </button>
          <button
            onClick={() => setActiveSubTab('matrix')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'matrix'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Matriks Profit Menu</span>
          </button>
        </div>
      </div>

      {/* TOP KPI STATS SUMMARY */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 xl:px-6 py-2.5 shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <Wheat className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Total Bahan Baku</div>
            <div className="text-sm font-extrabold text-slate-800">{ingredients.length} Macam Bahan</div>
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Coffee className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Menu Ber-Resep</div>
            <div className="text-sm font-extrabold text-slate-800">
              {menusWithRecipe.length} dari {products.length} Menu
            </div>
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <Percent className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Rata-rata Food Cost</div>
            <div className="text-sm font-extrabold text-blue-600">{avgFoodCost}% (Ideal F&B)</div>
          </div>
        </div>

        <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              lowStockCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] text-slate-500 font-medium">Stok Bahan Menipis</div>
            <div
              className={`text-sm font-extrabold ${
                lowStockCount > 0 ? 'text-rose-600 animate-pulse' : 'text-emerald-600'
              }`}
            >
              {lowStockCount > 0 ? `${lowStockCount} Bahan Kritis` : 'Semua Stok Aman'}
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TAB 1: LIVE HPP CALCULATOR & RECIPE BUILDER */}
      {activeSubTab === 'calculator' && (
        <div className="flex-1 overflow-y-auto p-4 xl:p-6">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* LEFT COLUMN: MENU SELECTOR & INGREDIENT LIST (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              {/* Product Selector Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Pilih Menu Cafe yang Akan Dihitung HPP-nya
                </label>
                <div className="relative">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer appearance-none"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — Jual: {formatRupiah(p.sellPrice)} {p.hasRecipe ? '✓ (Ada Resep)' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
                </div>

                {currentProduct && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      Kategori: <strong className="text-slate-700">{currentProduct.categoryId}</strong>
                    </span>
                    <span>
                      Harga Menu Sekarang:{' '}
                      <strong className="text-emerald-600 font-extrabold">
                        {formatRupiah(currentProduct.sellPrice)}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Recipe Items (BOM) Table Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">
                      2. Komposisi Bahan Baku (Resep / BOM)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tentukan takaran bahan yang dipakai untuk 1 porsi menu ini
                    </p>
                  </div>

                  {/* Add Ingredient Button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAddIngredientDropdown(!showAddIngredientDropdown)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Bahan Baku</span>
                    </button>

                    {/* Dropdown search */}
                    {showAddIngredientDropdown && (
                      <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 z-30 p-2 max-h-96 overflow-y-auto">
                        <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                          <input
                            type="text"
                            placeholder="Cari bahan (e.g. kopi, susu, sirup)..."
                            value={builderIngredientSearch}
                            onChange={(e) => setBuilderIngredientSearch(e.target.value)}
                            className="w-full px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            autoFocus
                          />
                        </div>

                        <div className="py-1">
                          {ingredients
                            .filter((ing) =>
                              ing.name.toLowerCase().includes(builderIngredientSearch.toLowerCase())
                            )
                            .map((ing) => (
                              <button
                                key={ing.id}
                                onClick={() => handleAddIngredientToRecipe(ing)}
                                className="w-full text-left p-2 hover:bg-emerald-50 rounded-xl transition-colors flex items-center justify-between group cursor-pointer"
                              >
                                <div>
                                  <div className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                                    {ing.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Beli: {formatRupiah(ing.purchasePrice)}/{ing.purchaseUnit} • Biaya:{' '}
                                    {formatRupiah(ing.effectiveCostPerRecipeUnit)}/{ing.recipeUnit}
                                  </div>
                                </div>
                                <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* List of items */}
                {(!currentRecipe.items || currentRecipe.items.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <Wheat className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-600">Belum ada bahan baku di resep ini</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Klik tombol "Tambah Bahan Baku" di atas untuk memasukkan komposisi resep
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                          <th className="pb-2">Nama Bahan Baku</th>
                          <th className="pb-2 text-center">Takaran / Qty</th>
                          <th className="pb-2 text-right">Biaya/Unit (Efektif)</th>
                          <th className="pb-2 text-right">Subtotal Biaya</th>
                          <th className="pb-2 text-center w-8">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentRecipe.items.map((item, idx) => (
                          <tr key={item.ingredientId} className="hover:bg-slate-50/60">
                            <td className="py-2.5 font-bold text-slate-800">
                              <div>{item.ingredientName}</div>
                              <span className="text-[10px] text-slate-400 font-normal">
                                Satuan: {item.recipeUnit}
                              </span>
                            </td>
                            <td className="py-2.5 text-center">
                              <div className="inline-flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">
                                <input
                                  type="number"
                                  min="0.1"
                                  step="any"
                                  value={item.quantity}
                                  onChange={(e) => handleUpdateItemQuantity(idx, parseFloat(e.target.value) || 0)}
                                  className="w-16 text-center font-extrabold text-slate-800 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                                <span className="text-[10px] font-bold text-slate-500">{item.recipeUnit}</span>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-mono text-slate-600">
                              {formatRupiah(item.unitCost)}/{item.recipeUnit}
                            </td>
                            <td className="py-2.5 text-right font-extrabold text-slate-800 font-mono">
                              {formatRupiah(item.subtotal)}
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Hapus bahan dari resep"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 bg-amber-50/50">
                          <td colSpan={3} className="py-2 font-bold text-slate-700">
                            Total Biaya Bahan Baku Mentah:
                          </td>
                          <td className="py-2 text-right font-extrabold text-amber-700 font-mono text-sm">
                            {formatRupiah(calculationResult.totalIngredientCost)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Overhead & Packaging Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <h3 className="text-sm font-extrabold text-slate-800 mb-1">
                  3. Biaya Kemasan & Overhead Operasional per Porsi
                </h3>
                <p className="text-xs text-slate-500 mb-3">
                  Hitung secara detail biaya cup, sedotan, listrik mesin, dan barista agar HPP tidak bocor
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Kemasan (Cup/Box/Sedotan)
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={currentRecipe.packagingCost ?? 850}
                        onChange={(e) =>
                          setCurrentRecipe((prev) => ({
                            ...prev,
                            packagingCost: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Tenaga Kerja / Barista
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={currentRecipe.laborCost ?? 400}
                        onChange={(e) =>
                          setCurrentRecipe((prev) => ({
                            ...prev,
                            laborCost: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Utilitas (Listrik/Es/Gas)
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={currentRecipe.utilityCost ?? 300}
                        onChange={(e) =>
                          setCurrentRecipe((prev) => ({
                            ...prev,
                            utilityCost: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">
                      Biaya Lain-lain / Tak Terduga
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={currentRecipe.otherCost ?? 0}
                        onChange={(e) =>
                          setCurrentRecipe((prev) => ({
                            ...prev,
                            otherCost: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: HPP & FOOD COST ANALYSIS SUMMARY (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Grand Total HPP & Food Cost Card */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-3xl p-5 shadow-xl border border-slate-700/60 relative overflow-hidden">
                <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none"></div>

                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                      Hasil Analisis HPP & Food Cost
                    </span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Formula
                  </span>
                </div>

                {/* HPP Result Value */}
                <div className="space-y-1 mb-5">
                  <span className="text-xs text-slate-400 font-medium">
                    Total HPP Bersih per Porsi (COGS):
                  </span>
                  <div className="text-3xl font-black text-emerald-400 tracking-tight font-mono">
                    {formatRupiah(calculationResult.totalHpp)}
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span>Bahan: {formatRupiah(calculationResult.totalIngredientCost)}</span> •
                    <span>
                      Overhead/Kemasan:{' '}
                      {formatRupiah(
                        calculationResult.packagingCost +
                          calculationResult.laborCost +
                          calculationResult.utilityCost +
                          calculationResult.otherCost
                      )}
                    </span>
                  </div>
                </div>

                {/* Target Food Cost Slider */}
                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 space-y-2 mb-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-bold">Target Food Cost %:</span>
                    <span className="font-mono font-extrabold text-amber-300 text-sm">
                      {currentRecipe.targetFoodCostPercent || 35}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="60"
                    step="1"
                    value={currentRecipe.targetFoodCostPercent || 35}
                    onChange={(e) =>
                      setCurrentRecipe((prev) => ({
                        ...prev,
                        targetFoodCostPercent: parseInt(e.target.value) || 35,
                      }))
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>20% (Sangat Murah)</span>
                    <span className="text-emerald-400 font-bold">30-35% (Standar Ideal F&B)</span>
                    <span>50% (Tinggi)</span>
                  </div>

                  {/* Recommended Selling Price */}
                  <div className="mt-3 pt-2 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-xs text-slate-300">Rekomendasi Harga Jual:</span>
                    <span className="text-base font-black text-amber-400 font-mono">
                      {formatRupiah(calculationResult.recommendedPrice)}
                    </span>
                  </div>
                </div>

                {/* Actual Menu Selling Price Input */}
                <div className="bg-slate-800/80 p-3.5 rounded-2xl border border-slate-700/80 space-y-3 mb-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">
                      Harga Jual Menu yang Ditetapkan di Kasir (Rp):
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-mono">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={currentRecipe.actualSellPrice || 0}
                        onChange={(e) =>
                          setCurrentRecipe((prev) => ({
                            ...prev,
                            actualSellPrice: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-xl text-sm font-extrabold text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Calculated Food Cost & Margin metrics */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700">
                      <div className="text-[10px] text-slate-400">Food Cost Riil:</div>
                      <div
                        className={`text-lg font-black font-mono ${
                          calculationResult.actualFoodCostPercent <= 38
                            ? 'text-emerald-400'
                            : calculationResult.actualFoodCostPercent <= 45
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {calculationResult.actualFoodCostPercent}%
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-700">
                      <div className="text-[10px] text-slate-400">Margin Laba Kotor:</div>
                      <div className="text-lg font-black font-mono text-emerald-400">
                        {calculationResult.actualMarginPercent}%
                      </div>
                    </div>
                  </div>

                  {/* Profit in Rupiah */}
                  <div className="flex items-center justify-between text-xs pt-1 px-1">
                    <span className="text-slate-400">Estimasi Laba per Porsi:</span>
                    <span className="text-sm font-black text-emerald-400 font-mono">
                      +{formatRupiah(calculationResult.actualProfit)}
                    </span>
                  </div>
                </div>

                {/* Health Status Assessment Banner */}
                <div
                  className={`p-3 rounded-2xl border text-xs flex items-start gap-2.5 mb-5 ${
                    calculationResult.foodCostStatus.level === 'optimal'
                      ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                      : calculationResult.foodCostStatus.level === 'moderate'
                      ? 'bg-blue-950/60 border-blue-700/60 text-blue-200'
                      : calculationResult.foodCostStatus.level === 'warning'
                      ? 'bg-amber-950/60 border-amber-700/60 text-amber-200'
                      : 'bg-rose-950/60 border-rose-700/60 text-rose-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold">{calculationResult.foodCostStatus.label}</div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      {calculationResult.foodCostStatus.description}
                    </div>
                  </div>
                </div>

                {/* Apply Button */}
                <button
                  onClick={handleSaveRecipeAndApply}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Resep & Terapkan HPP ke Menu</span>
                </button>
              </div>

              {/* Recipe Notes Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Catatan SOP / Resep Barista:
                </label>
                <textarea
                  rows={3}
                  value={currentRecipe.notes || ''}
                  onChange={(e) => setCurrentRecipe((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Instruksi pembuatan (misal: extract 36ml espresso 25 detik, campur susu dingin, tuang gula aren di dasar cup)..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: RAW INGREDIENT INVENTORY MANAGEMENT */}
      {activeSubTab === 'ingredients' && (
        <div className="flex-1 overflow-y-auto p-4 xl:p-6 space-y-4">
          <div className="max-w-7xl mx-auto space-y-4">
            {/* Action Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-1 items-center gap-2 max-w-md">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Cari bahan baku..."
                    value={searchIngredientText}
                    onChange={(e) => setSearchIngredientText(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <select
                  value={selectedIngCategory}
                  onChange={(e) => setSelectedIngCategory(e.target.value)}
                  className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Semua Kategori</option>
                  {INGREDIENT_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingIngredient(null);
                    setShowIngredientModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tambah Bahan Baku Baru</span>
                </button>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Nama Bahan Baku</th>
                      <th className="py-3 px-3">Kategori</th>
                      <th className="py-3 px-3 text-right">Harga Beli Kemasan</th>
                      <th className="py-3 px-3 text-center">Faktor Susut</th>
                      <th className="py-3 px-3 text-right">Biaya Satuan Resep</th>
                      <th className="py-3 px-3 text-center">Stok Saat Ini</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredIngredients.map((ing) => {
                      const isLow = ing.currentStock <= ing.minStock;
                      const catDef = INGREDIENT_CATEGORIES.find((c) => c.id === ing.category);

                      return (
                        <tr key={ing.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-slate-800">{ing.name}</div>
                            {ing.notes && (
                              <div className="text-[10px] text-slate-400 truncate max-w-xs">{ing.notes}</div>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold inline-flex items-center gap-1">
                              <span>{catDef?.icon || '📦'}</span>
                              <span>{catDef?.label.split('&')[0] || ing.category}</span>
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-mono">
                            <div className="font-extrabold text-slate-800">
                              {formatRupiah(ing.purchasePrice)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              per {ing.purchaseUnit} ({formatNumber(ing.conversionFactor)} {ing.recipeUnit})
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center font-mono">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              {ing.wastagePercent}%
                            </span>
                          </td>

                          <td className="py-3 px-3 text-right font-mono">
                            <div className="font-black text-emerald-600">
                              {formatRupiah(ing.effectiveCostPerRecipeUnit)}
                            </div>
                            <div className="text-[10px] text-slate-400">per {ing.recipeUnit}</div>
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div
                              className={`inline-flex flex-col items-center px-2.5 py-1 rounded-xl font-bold font-mono ${
                                isLow ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-800'
                              }`}
                            >
                              <span>
                                {formatNumber(ing.currentStock)} {ing.recipeUnit}
                              </span>
                              {isLow && (
                                <span className="text-[9px] uppercase tracking-wider text-rose-600 font-extrabold">
                                  Menipis (Min: {ing.minStock})
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => {
                                  setRestockIngredient(ing);
                                  setRestockAmount(1);
                                  setRestockNewPrice(ing.purchasePrice);
                                  setShowRestockModal(true);
                                }}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="Beli / Restock stok bahan ini"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Restock</span>
                              </button>
                              <button
                                onClick={() => {
                                  setEditingIngredient(ing);
                                  setShowIngredientModal(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                                title="Edit bahan baku"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                                title="Hapus bahan baku"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MENU PROFITABILITY MATRIX */}
      {activeSubTab === 'matrix' && (
        <div className="flex-1 overflow-y-auto p-4 xl:p-6 space-y-4">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">
                  Matriks Food Cost & Keuntungan Menu Cafe
                </h3>
                <p className="text-xs text-slate-500">
                  Transparansi seluruh menu: Harga Jual vs HPP Bahan Baku vs Laba Bersih
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Menu Cafe & Kategori</th>
                      <th className="py-3 px-3 text-right">Harga Jual Menu</th>
                      <th className="py-3 px-3 text-right">HPP Riil (BOM)</th>
                      <th className="py-3 px-3 text-right">Laba Kotor per Porsi</th>
                      <th className="py-3 px-3 text-center">Food Cost %</th>
                      <th className="py-3 px-3 text-center">Margin %</th>
                      <th className="py-3 px-3 text-center">Status Resep</th>
                      <th className="py-3 px-4 text-center">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((prod) => {
                      const recipe = recipes.find((r) => r.productId === prod.id);
                      const fc = prod.foodCostPercent || (prod.sellPrice > 0 ? (prod.hpp / prod.sellPrice) * 100 : 0);
                      const profit = prod.sellPrice - prod.hpp;

                      return (
                        <tr key={prod.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-extrabold text-slate-800 text-sm">{prod.name}</div>
                            <div className="text-[10px] text-slate-400">{prod.categoryId}</div>
                          </td>

                          <td className="py-3 px-3 text-right font-extrabold text-slate-800 font-mono text-sm">
                            {formatRupiah(prod.sellPrice)}
                          </td>

                          <td className="py-3 px-3 text-right font-bold text-amber-700 font-mono text-sm">
                            {formatRupiah(prod.hpp)}
                          </td>

                          <td className="py-3 px-3 text-right font-black text-emerald-600 font-mono text-sm">
                            +{formatRupiah(profit)}
                          </td>

                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-black ${
                                  fc <= 32
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : fc <= 38
                                    ? 'bg-blue-100 text-blue-800'
                                    : fc <= 45
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {fc.toFixed(1)}%
                              </span>
                              <span className="text-[9px] text-slate-400 mt-0.5">
                                {fc <= 38 ? 'Ideal' : fc <= 45 ? 'Sedang' : 'Tinggi'}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center font-mono font-extrabold text-slate-700 text-xs">
                            {prod.margin}%
                          </td>

                          <td className="py-3 px-3 text-center">
                            {recipe ? (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                ✓ {recipe.items.length} Bahan
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-500 text-[10px]">
                                Manual
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedProductId(prod.id);
                                setActiveSubTab('calculator');
                              }}
                              className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white text-xs font-bold transition-colors cursor-pointer"
                            >
                              {recipe ? 'Edit Resep' : 'Buat Resep'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK RESTOCK MODAL */}
      {showRestockModal && restockIngredient && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-black text-slate-800">Restock Bahan Baku</h3>
                <p className="text-xs text-slate-500">{restockIngredient.name}</p>
              </div>
              <button
                onClick={() => setShowRestockModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickRestockSubmit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Stok Saat Ini:</span>
                  <strong className="text-slate-800 font-mono">
                    {formatNumber(restockIngredient.currentStock)} {restockIngredient.recipeUnit}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Kemasan Beli:</span>
                  <strong className="text-slate-800 font-mono">
                    1 {restockIngredient.purchaseUnit} = {restockIngredient.conversionFactor}{' '}
                    {restockIngredient.recipeUnit}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Jumlah yang Dibeli ({restockIngredient.purchaseUnit}):
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  required
                  value={restockAmount}
                  onChange={(e) => setRestockAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  placeholder="Contoh: 5"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Harga Beli per {restockIngredient.purchaseUnit} (Update jika ada perubahan harga):
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-mono">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    required
                    value={restockNewPrice}
                    onChange={(e) => setRestockNewPrice(parseFloat(e.target.value) || 0)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRestockModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer"
                >
                  Simpan & Tambah Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT INGREDIENT MODAL */}
      {showIngredientModal && (
        <IngredientFormModal
          initialData={editingIngredient}
          suppliers={suppliers}
          onClose={() => {
            setShowIngredientModal(false);
            setEditingIngredient(null);
          }}
          onSave={handleSaveIngredientForm}
        />
      )}

      {/* CONFIRM DELETE MODAL */}
      <ConfirmModal
        isOpen={deleteConfirmIng.isOpen}
        title={`Hapus Bahan Baku "${deleteConfirmIng.name}"?`}
        message="Bahan baku ini akan dihapus dari inventori cafe dan resep HPP yang menggunakannya. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Hapus Sekarang"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={handleConfirmDeleteIngredient}
        onCancel={() => setDeleteConfirmIng({ isOpen: false, id: '', name: '' })}
      />
    </div>
  );
};

// ==========================================
// SUB-MODAL: FORM INGREDIENT DETAIL
// ==========================================
interface IngredientFormModalProps {
  initialData: Ingredient | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSave: (data: Partial<Ingredient>) => void;
}

const IngredientFormModal: React.FC<IngredientFormModalProps> = ({
  initialData,
  suppliers,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(initialData?.name || '');
  const [category, setCategory] = useState<IngredientCategory>(
    initialData?.category || 'kopi_espresso'
  );
  const [purchaseUnit, setPurchaseUnit] = useState(initialData?.purchaseUnit || 'kg');
  const [purchasePrice, setPurchasePrice] = useState<number>(initialData?.purchasePrice || 100000);
  const [recipeUnit, setRecipeUnit] = useState(initialData?.recipeUnit || 'gram');
  const [conversionFactor, setConversionFactor] = useState<number>(
    initialData?.conversionFactor || 1000
  );
  const [wastagePercent, setWastagePercent] = useState<number>(initialData?.wastagePercent || 5);
  const [currentStock, setCurrentStock] = useState<number>(initialData?.currentStock || 5000);
  const [minStock, setMinStock] = useState<number>(initialData?.minStock || 1000);
  const [supplierId, setSupplierId] = useState(initialData?.supplierId || '');
  const [notes, setNotes] = useState(initialData?.notes || '');

  // Live effective cost preview
  const effectiveCost = calculateEffectiveUnitCost(purchasePrice, conversionFactor, wastagePercent);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name,
      category,
      purchaseUnit,
      purchasePrice,
      recipeUnit,
      conversionFactor,
      wastagePercent,
      currentStock,
      minStock,
      supplierId: supplierId || undefined,
      notes,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div>
            <h3 className="text-base font-black text-slate-800">
              {initialData ? 'Edit Bahan Baku' : 'Tambah Bahan Baku Baru'}
            </h3>
            <p className="text-xs text-slate-500">Konfigurasi harga beli, konversi, dan susut resep</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Bahan Baku:</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Biji Kopi Arabica Flores Gayo"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kategori:</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as IngredientCategory)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                {INGREDIENT_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Supplier / Pemasok:</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="">-- Pilih Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Unit & Purchase Price */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
            <div className="text-xs font-extrabold text-slate-800">Pembelian & Konversi Resep</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Satuan Beli (Kemasan):
                </label>
                <input
                  type="text"
                  required
                  value={purchaseUnit}
                  onChange={(e) => setPurchaseUnit(e.target.value)}
                  placeholder="kg, liter, pack, box"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Harga Beli per Kemasan (Rp):
                </label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Satuan saat Dipakai Resep:
                </label>
                <input
                  type="text"
                  required
                  value={recipeUnit}
                  onChange={(e) => setRecipeUnit(e.target.value)}
                  placeholder="gram, ml, pcs, butir"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Isi per Kemasan (Konversi):
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={conversionFactor}
                  onChange={(e) => setConversionFactor(parseFloat(e.target.value) || 1)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono"
                  placeholder="e.g. 1000"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Faktor Susut / Yield Loss (%) — misal 5% susut espresso / ampas:
              </label>
              <input
                type="number"
                min="0"
                max="80"
                value={wastagePercent}
                onChange={(e) => setWastagePercent(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono"
              />
            </div>

            {/* Calculated cost pill */}
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs flex items-center justify-between">
              <span className="text-emerald-800 font-bold">Biaya Efektif per Satuan Resep:</span>
              <span className="font-extrabold text-emerald-700 font-mono text-sm">
                {formatRupiah(effectiveCost)} / {recipeUnit}
              </span>
            </div>
          </div>

          {/* Stock Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Stok Awal ({recipeUnit}):
              </label>
              <input
                type="number"
                min="0"
                value={currentStock}
                onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Batas Minimum Peringatan ({recipeUnit}):
              </label>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Catatan Tambahan:</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Simpan di tempat sejuk dan kering kedap udara"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer"
            >
              Simpan Bahan Baku
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
