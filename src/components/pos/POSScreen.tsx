import React, { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  AlertCircle,
  Barcode,
  Bluetooth,
  Calculator,
  Check,
  CheckCircle2,
  Coffee,
  CreditCard,
  Flame,
  Gift,
  Image as ImageIcon,
  Layers,
  Minus,
  Percent,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Trash2,
  User as UserIcon,
  Utensils,
  Wallet,
  X,
} from 'lucide-react';
import { db, deductRecipeIngredients } from '../../db/db';
import { printerService } from '../../services/printer';
import { supabaseService } from '../../services/supabase';
import { spreadsheetService } from '../../services/spreadsheet';
import {
  CartItem,
  Category,
  Customer,
  OrderType,
  PaymentMethod,
  PrinterSettings,
  Product,
  ProductAddon,
  Sale,
  SaleItem,
  StoreSettings,
  User,
} from '../../types';
import {
  formatDate,
  formatNumber,
  formatRupiah,
  generateInvoiceNumber,
  getCurrentTimeString,
  getTodayDateString,
  parseNumber,
} from '../../utils/format';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ReceiptModal } from './ReceiptModal';

interface POSScreenProps {
  currentUser: User;
  storeSettings: StoreSettings;
  printerSettings: PrinterSettings;
  onRefreshData?: () => void;
}

export const POSScreen: React.FC<POSScreenProps> = ({
  currentUser,
  storeSettings,
  printerSettings,
  onRefreshData,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Cafe F&B Order Types & Table
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [tableNumber, setTableNumber] = useState<string>(
    storeSettings.tables && storeSettings.tables.length > 0 ? storeSettings.tables[0] : 'Meja 01 (Indoor AC)'
  );
  const [guestName, setGuestName] = useState<string>('');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactionNotes, setTransactionNotes] = useState('');

  // FITUR 1: DISKON TRANSAKSI
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('fixed');
  const [discountInputValue, setDiscountInputValue] = useState<number>(0);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  // FITUR 2: PAJAK (PPN)
  const [enableTax, setEnableTax] = useState<boolean>(storeSettings.enableTax ?? true);
  const [taxRate, setTaxRate] = useState<number>(storeSettings.taxRate > 0 ? storeSettings.taxRate : 11);

  // FITUR 3: ADDITIONAL MENU / TOPPING MODAL
  const [addonModalItemIndex, setAddonModalItemIndex] = useState<number | null>(null);
  const [customAddonName, setCustomAddonName] = useState('');
  const [customAddonPrice, setCustomAddonPrice] = useState<number>(0);

  // FITUR 4: FITUR TESTER
  const [isTesterOrder, setIsTesterOrder] = useState<boolean>(false);
  const [testerReason, setTesterReason] = useState<string>('Cicip Rasa Pelanggan');
  const [isTesterModalOpen, setIsTesterModalOpen] = useState(false);

  // Item note modal state
  const [itemNoteModalIndex, setItemNoteModalIndex] = useState<number | null>(null);
  const [itemNoteDraft, setItemNoteDraft] = useState<string>('');

  // Payment modal state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');

  // Scanner & Receipt Modal state
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Bluetooth Printer state & connection
  const [btConnected, setBtConnected] = useState<boolean>(printerService.isConnected());
  const [btDeviceName, setBtDeviceName] = useState<string | null>(printerService.getConnectedDeviceName());
  const [isBtConnecting, setIsBtConnecting] = useState<boolean>(false);

  useEffect(() => {
    const unsub = printerService.addListener((status) => {
      setBtConnected(status.connected);
      if (status.deviceName) setBtDeviceName(status.deviceName);
    });
    return () => unsub();
  }, []);

  const handleConnectBluetooth = async () => {
    try {
      setIsBtConnecting(true);
      showToast('Mencari printer Bluetooth thermal di sekitar...');
      const dev = await printerService.requestAndConnect();
      showToast(`Printer terhubung: ${dev.name}`);
    } catch (err: any) {
      showToast(`Bluetooth: ${err.message || 'Dibatalkan'}`);
    } finally {
      setIsBtConnecting(false);
    }
  };

  // Mobile drawer view for Cart
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Toast / notification banner state (replaces window.alert)
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Barcode keyboard buffer for USB Barcode scanner
  const barcodeBufferRef = useRef<string>('');
  const barcodeTimeoutRef = useRef<any>(null);

  // Load products, categories, customers
  const loadData = async () => {
    const prods = await db.products.filter((p) => p.isActive).toArray();
    let cats = await db.categories.toArray();
    const custs = await db.customers.toArray();

    // Ensure Minuman, Makanan, Snack exist
    const standardCategories = [
      { id: 'cat-minuman', name: 'Minuman', icon: 'Coffee', color: '#0284c7', description: 'Kopi, teh, susu, jus, dan aneka minuman segar', createdAt: new Date().toISOString() },
      { id: 'cat-makanan', name: 'Makanan', icon: 'Utensils', color: '#ea580c', description: 'Nasi, mie, pasta, rice bowl, dan makanan utama', createdAt: new Date().toISOString() },
      { id: 'cat-snack', name: 'Snack', icon: 'Cookie', color: '#d97706', description: 'Camilan ringan, gorengan, french fries, pastry', createdAt: new Date().toISOString() },
    ];
    let hasAdded = false;
    for (const sc of standardCategories) {
      if (!cats.some((cat) => cat.name.toLowerCase() === sc.name.toLowerCase())) {
        await db.categories.put(sc);
        hasAdded = true;
      }
    }
    if (hasAdded) {
      cats = await db.categories.toArray();
    }

    setProducts(prods);
    setCategories(cats);
    setCustomers(custs);
  };

  useEffect(() => {
    loadData();
    const handleDataSync = (event: any) => {
      const table = event.detail?.table;
      if (!table || table === 'products' || table === 'categories' || table === 'customers' || table === 'sales' || table === 'all') {
        loadData();
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  // Listen to physical USB Barcode scanner
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          handleBarcodeScanned(barcodeBufferRef.current);
          barcodeBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
        clearTimeout(barcodeTimeoutRef.current);
        barcodeTimeoutRef.current = setTimeout(() => {
          barcodeBufferRef.current = '';
        }, 200);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(barcodeTimeoutRef.current);
    };
  }, [products, cart]);

  // Handle scanned barcode
  const handleBarcodeScanned = (code: string) => {
    const cleanCode = code.trim().toLowerCase();
    const matched = products.find(
      (p) =>
        p.barcode.toLowerCase() === cleanCode ||
        p.sku.toLowerCase() === cleanCode
    );

    if (matched) {
      addToCart(matched);
      showToast(`Ditambahkan: ${matched.name}`);
    } else {
      showToast(`Produk dengan Barcode "${code}" tidak ditemukan.`);
    }
  };

  // Filtered products (Categories: Minuman, Makanan, Snack, etc.)
  const filteredProducts = useMemo(() => {
    let result = products;

    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.categoryId === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      );
    }

    return result;
  }, [products, selectedCategory, searchQuery]);

  // Helper to calculate product unit discount
  const getProductUnitDiscount = (prod: Product): number => {
    if (!prod.isDiscountActive || !prod.discountValue || prod.discountValue <= 0) return 0;
    if (prod.discountType === 'percent') {
      return Math.round((prod.sellPrice * prod.discountValue) / 100);
    }
    return Math.min(prod.sellPrice, prod.discountValue);
  };

  // Helper to calculate effective unit price of a cart item (base price + selected addons)
  const getItemUnitPrice = (item: CartItem): number => {
    if (item.isTester || isTesterOrder) return 0;
    const addonsSum = (item.selectedAddons || []).reduce((s, a) => s + (a.price || 0), 0);
    return item.product.sellPrice + addonsSum;
  };

  // Cart operations
  const addToCart = (product: Product) => {
    // If product has addons, add to cart and prompt for addons if available
    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.product.id === product.id &&
          (!item.selectedAddons || item.selectedAddons.length === 0) &&
          !item.isTester
      );
      const unitDiscount = getProductUnitDiscount(product);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const newQty = updated[existingIdx].quantity + 1;
        const currentItem = updated[existingIdx];
        const oldUnitDiscount = currentItem.quantity > 0 ? (currentItem.discount || 0) / currentItem.quantity : 0;
        const effectiveUnitDisc = unitDiscount > 0 ? unitDiscount : oldUnitDiscount;
        updated[existingIdx] = {
          ...currentItem,
          quantity: newQty,
          discount: Math.round(effectiveUnitDisc * newQty),
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            product,
            quantity: 1,
            discount: unitDiscount,
            selectedAddons: [],
            isTester: false,
          },
        ];
      }
    });
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const newQty = target.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, idx) => idx !== index);
      }
      const unitDiscount = getProductUnitDiscount(target.product);
      const oldUnitDiscount = target.quantity > 0 ? (target.discount || 0) / target.quantity : 0;
      const effectiveUnitDisc = unitDiscount > 0 ? unitDiscount : oldUnitDiscount;
      const updated = [...prev];
      updated[index] = {
        ...target,
        quantity: newQty,
        discount: Math.round(effectiveUnitDisc * newQty),
      };
      return updated;
    });
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  const toggleItemTester = (index: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const current = updated[index];
      if (current) {
        updated[index] = {
          ...current,
          isTester: !current.isTester,
          discount: 0,
        };
      }
      return updated;
    });
  };

  const clearCart = () => {
    setCart([]);
    setDiscountInputValue(0);
    setTransactionNotes('');
    setSelectedCustomer(null);
    setIsTesterOrder(false);
  };

  // Calculations
  const rawSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const unitPrice = getItemUnitPrice(item);
      const lineTotal = Math.max(0, unitPrice * item.quantity - (item.discount || 0));
      return sum + lineTotal;
    }, 0);
  }, [cart, isTesterOrder]);

  // Transaction Discount in Rupiah
  const transactionDiscountAmount = useMemo(() => {
    if (isTesterOrder || rawSubtotal === 0) return 0;
    if (discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, discountInputValue));
      return Math.round((rawSubtotal * pct) / 100);
    }
    return Math.min(rawSubtotal, Math.max(0, discountInputValue));
  }, [rawSubtotal, discountType, discountInputValue, isTesterOrder]);

  const subtotalAfterDiscount = useMemo(() => {
    return Math.max(0, rawSubtotal - transactionDiscountAmount);
  }, [rawSubtotal, transactionDiscountAmount]);

  // Check if cart has non-taxable items
  const hasNonTaxableItemsInCart = useMemo(() => {
    return cart.some((i) => i.product.enableTax === false);
  }, [cart]);

  // Tax calculation respecting product-level tax exemption and individual product tax rates
  const taxAmount = useMemo(() => {
    if (isTesterOrder || !enableTax || rawSubtotal === 0) return 0;

    const discountRatio = (rawSubtotal - transactionDiscountAmount) / rawSubtotal;
    let computedTax = 0;

    for (const item of cart) {
      if (item.isTester) continue;
      // If product has enableTax explicitly set to false, exempt from tax
      if (item.product.enableTax === false) continue;

      const unitPrice = getItemUnitPrice(item);
      const itemNet = Math.max(0, unitPrice * item.quantity - (item.discount || 0));
      const discountedItemNet = itemNet * discountRatio;
      const itemTaxRate = item.product.taxRate !== undefined ? item.product.taxRate : taxRate;
      if (itemTaxRate > 0) {
        computedTax += (discountedItemNet * itemTaxRate) / 100;
      }
    }

    return Math.round(computedTax);
  }, [isTesterOrder, enableTax, taxRate, rawSubtotal, transactionDiscountAmount, cart]);

  // Rounding
  const rounding = useMemo(() => {
    if (isTesterOrder || !storeSettings.enableRounding) return 0;
    const rawTotal = subtotalAfterDiscount + taxAmount;
    const remainder = rawTotal % 100;
    if (remainder === 0) return 0;
    return remainder < 50 ? -remainder : 100 - remainder;
  }, [isTesterOrder, subtotalAfterDiscount, taxAmount, storeSettings]);

  // Grand Total
  const grandTotal = useMemo(() => {
    if (isTesterOrder) return 0;
    return Math.max(0, subtotalAfterDiscount + taxAmount + rounding);
  }, [isTesterOrder, subtotalAfterDiscount, taxAmount, rounding]);

  const totalHpp = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.product.hpp || 0) * item.quantity, 0);
  }, [cart]);

  const totalProfit = useMemo(() => {
    return grandTotal - totalHpp;
  }, [grandTotal, totalHpp]);

  const profitMarginPercent = useMemo(() => {
    if (grandTotal === 0) return 0;
    return Number(((totalProfit / grandTotal) * 100).toFixed(1));
  }, [grandTotal, totalProfit]);

  // Cash received & change
  const cashReceivedNum = useMemo(() => {
    if (isTesterOrder) return 0;
    if (paymentMethod !== 'cash') return grandTotal;
    return parseNumber(cashReceivedInput);
  }, [isTesterOrder, paymentMethod, cashReceivedInput, grandTotal]);

  const changeAmount = useMemo(() => {
    if (isTesterOrder) return 0;
    return Math.max(0, cashReceivedNum - grandTotal);
  }, [isTesterOrder, cashReceivedNum, grandTotal]);

  // Open Checkout Modal
  const handleOpenCheckout = () => {
    if (cart.length === 0) {
      showToast('Keranjang pesanan masih kosong.');
      return;
    }
    if (isTesterOrder) {
      setPaymentMethod('other');
      setCashReceivedInput('0');
    } else {
      setPaymentMethod('cash');
      setCashReceivedInput(grandTotal.toString());
    }
    setIsPaymentOpen(true);
  };

  // Complete Payment & Save Transaction
  const handleProcessPayment = async () => {
    if (!isTesterOrder && paymentMethod === 'cash' && cashReceivedNum < grandTotal) {
      showToast(`Uang diterima (${formatRupiah(cashReceivedNum)}) kurang dari total (${formatRupiah(grandTotal)})!`);
      return;
    }

    try {
      const today = getTodayDateString();
      const time = getCurrentTimeString();
      const invoiceNumber = isTesterOrder
        ? generateInvoiceNumber('TST')
        : generateInvoiceNumber('INV');
      const saleId = `sale-${Date.now()}`;

      // Build sale items
      const saleItemsToSave: SaleItem[] = [];

      for (let idx = 0; idx < cart.length; idx++) {
        const item = cart[idx];
        const isThisTester = isTesterOrder || !!item.isTester;
        const unitSellPrice = isThisTester ? 0 : getItemUnitPrice(item);
        const itemSubtotal = unitSellPrice * item.quantity;
        const itemDiscount = isThisTester ? 0 : item.discount || 0;
        const itemTotal = Math.max(0, itemSubtotal - itemDiscount);
        const itemHppTotal = (item.product.hpp || 0) * item.quantity;
        const itemProfit = itemTotal - itemHppTotal;

        saleItemsToSave.push({
          id: `si-${Date.now()}-${idx}-${item.product.id}`,
          saleId,
          productId: item.product.id,
          productName: item.product.name,
          barcode: item.product.barcode,
          unit: item.product.unit || 'porsi',
          quantity: item.quantity,
          unitBuyPrice: 0,
          unitHpp: item.product.hpp || 0,
          unitSellPrice,
          subtotal: itemSubtotal,
          discount: itemDiscount,
          total: itemTotal,
          profit: itemProfit,
          notes: item.notes,
          modifiers: item.selectedAddons?.map((a) => a.name),
          selectedAddons: item.selectedAddons,
          isTester: isThisTester,
        });
      }

      const newSale: Sale = {
        id: saleId,
        invoiceNumber,
        date: today,
        time,
        cashierId: currentUser.id,
        cashierName: currentUser.name,
        orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : undefined,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name || guestName || undefined,
        subtotal: rawSubtotal,
        discount: transactionDiscountAmount,
        tax: taxAmount,
        serviceFee: 0,
        rounding,
        total: grandTotal,
        paymentMethod: isTesterOrder ? 'other' : paymentMethod,
        cashReceived: cashReceivedNum,
        changeAmount,
        totalHpp,
        totalProfit,
        profitMargin: profitMarginPercent,
        status: 'completed',
        isTester: isTesterOrder,
        testerReason: isTesterOrder ? testerReason : undefined,
        taxRate: enableTax ? taxRate : 0,
        notes: transactionNotes,
        createdAt: new Date().toISOString(),
        items: saleItemsToSave,
      };

      // Save sale and items
      await db.sales.add(newSale);
      await db.sale_items.bulkAdd(saleItemsToSave);

      if (spreadsheetService.isConfigured()) {
        await spreadsheetService.appendSale(newSale);
      }
      if (supabaseService.isConfigured()) {
        await supabaseService.pushSale(newSale, saleItemsToSave);
      }

      // Auto deduct raw ingredients for any recipe associated with sold items
      await deductRecipeIngredients(
        cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
        saleId,
        invoiceNumber
      );

      // Update customer stats if selected
      if (selectedCustomer && !isTesterOrder) {
        await db.customers.update(selectedCustomer.id, {
          totalTransactions: (selectedCustomer.totalTransactions || 0) + 1,
          totalSpent: (selectedCustomer.totalSpent || 0) + grandTotal,
        });
      }

      // Log audit
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: isTesterOrder ? 'TRANSACTION_TESTER' : 'TRANSACTION_COMPLETED',
        details: isTesterOrder
          ? `Pencatatan Tester/Sampel ${invoiceNumber} (${testerReason}) sebanyak ${cart.length} menu`
          : `Transaksi ${invoiceNumber} senilai ${formatRupiah(grandTotal)} via ${paymentMethod.toUpperCase()}`,
      });

      // Confetti animation celebration
      try {
        confetti({
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}

      // Refresh data
      await loadData();
      if (onRefreshData) onRefreshData();

      // Open receipt modal
      setIsPaymentOpen(false);
      setCompletedSale(newSale);
      setIsReceiptOpen(true);
      clearCart();
    } catch (err: any) {
      console.error(err);
      showToast('Terjadi kesalahan saat memproses transaksi: ' + (err.message || 'Error'));
    }
  };

  const handleQuickAmount = (amount: number) => {
    setCashReceivedInput(amount.toString());
  };

  return (
    <div className="flex-1 h-full flex flex-col lg:flex-row overflow-hidden bg-slate-100 select-none relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-150">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* LEFT: Product Catalog & Category Tabs */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-slate-200 bg-slate-50/50">
        {/* Top Control Bar */}
        <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari menu minuman, makanan, snack..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-100 border border-transparent rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Barcode Scanner Button */}
            <button
              onClick={() => setIsScannerOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Scan Barcode Kamera"
            >
              <Barcode className="w-4 h-4 text-emerald-600" />
              <span className="hidden sm:inline">Scan Barcode</span>
            </button>

            {/* Quick Bluetooth Printer Status & Connect Button */}
            <button
              onClick={btConnected ? undefined : handleConnectBluetooth}
              disabled={isBtConnecting}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                btConnected
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
              }`}
              title={
                btConnected
                  ? `Printer Bluetooth Aktif: ${btDeviceName || 'Thermal BT'}`
                  : 'Klik untuk menghubungkan Printer Bluetooth'
              }
            >
              <Bluetooth className={`w-4 h-4 ${btConnected ? 'text-emerald-600' : 'text-blue-600 animate-pulse'}`} />
              <span className="hidden sm:inline">
                {btConnected
                  ? btDeviceName ? btDeviceName.slice(0, 15) : 'BT Terhubung'
                  : isBtConnecting
                  ? 'Mencari...'
                  : 'Hubungkan BT'}
              </span>
            </button>

            {/* Mobile View Cart Toggle Button */}
            <button
              onClick={() => setMobileCartOpen(true)}
              className="lg:hidden relative px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 shrink-0"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>{cart.length}</span>
              {cart.length > 0 && (
                <span className="text-[10px] font-mono bg-emerald-700 px-1.5 py-0.5 rounded-full">
                  {formatRupiah(grandTotal)}
                </span>
              )}
            </button>
          </div>

          {/* Category Tabs: Minuman, Makanan, Snack, etc. */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter((p) => p.categoryId === cat.id).length;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white shadow-xs shadow-emerald-600/20'
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
        </div>

        {/* Product Grid (Stock and Buy Price completely removed per user request) */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <Coffee className="w-12 h-12 mb-3 stroke-1 text-slate-300" />
              <p className="font-semibold text-slate-600 text-sm">Menu Tidak Ditemukan</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Coba gunakan kata kunci lain atau pilih kategori menu yang berbeda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 sm:gap-3">
              {filteredProducts.map((product) => {
                const inCart = cart.find((i) => i.product.id === product.id);
                const productImg = product.image || product.imageUrl;
                const hasAddons = product.addons && product.addons.length > 0;
                const hasProdDiscount = !!product.isDiscountActive && (product.discountValue || 0) > 0;
                const prodDiscountDeduction = hasProdDiscount
                  ? product.discountType === 'percent'
                    ? Math.round((product.sellPrice * (product.discountValue || 0)) / 100)
                    : Math.min(product.sellPrice, product.discountValue || 0)
                  : 0;
                const effectivePromoPrice = Math.max(0, product.sellPrice - prodDiscountDeduction);

                return (
                  <div
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={`group relative bg-white rounded-2xl p-2.5 sm:p-3 border transition-all flex flex-col justify-between cursor-pointer select-none ${
                      inCart
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-emerald-50/20'
                        : 'border-slate-200 hover:border-emerald-400 hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Product Image Frame */}
                      <div className="relative w-full aspect-4/3 rounded-xl overflow-hidden mb-2 bg-slate-100 flex items-center justify-center border border-slate-100">
                        {productImg ? (
                          <img
                            src={productImg}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-300"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400">
                            <Coffee className="w-8 h-8 stroke-1 text-slate-400 mb-1" />
                            <span className="text-[10px] font-semibold text-slate-400">Menu F&amp;B</span>
                          </div>
                        )}

                        {/* Product-level Discount Badge */}
                        {hasProdDiscount && (
                          <span className="absolute top-1.5 left-1.5 bg-gradient-to-r from-red-600 to-amber-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md shadow-md flex items-center gap-0.5 z-10">
                            <Tag className="w-2.5 h-2.5" />
                            <span>
                              Diskon {product.discountType === 'percent' ? `${product.discountValue}%` : formatRupiah(product.discountValue || 0)}
                            </span>
                          </span>
                        )}

                        {/* In-cart count badge */}
                        {inCart && (
                          <div className="absolute top-1.5 right-1.5 bg-emerald-600 text-white font-black text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white animate-in zoom-in-50 duration-150 z-10">
                            {inCart.quantity}
                          </div>
                        )}

                        {/* Additional Menu Indicator */}
                        {hasAddons && (
                          <span className="absolute bottom-1.5 left-1.5 bg-purple-600/90 backdrop-blur-xs text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-xs flex items-center gap-0.5">
                            <Layers className="w-2.5 h-2.5" />
                            <span>+{product.addons?.length} Opsi</span>
                          </span>
                        )}
                      </div>

                      {/* Product SKU & Tax status */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-0.5">
                        <span>{product.sku}</span>
                        {product.enableTax === false ? (
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                            Non-Pajak
                          </span>
                        ) : product.taxRate && product.taxRate !== 11 ? (
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1 py-0.2 rounded">
                            PPN {product.taxRate}%
                          </span>
                        ) : null}
                      </div>

                      {/* Product Name */}
                      <h4 className="font-semibold text-slate-800 text-xs sm:text-sm line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors">
                        {product.name}
                      </h4>
                    </div>

                    {/* Bottom Price & Tap Indicator */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        {hasProdDiscount ? (
                          <div className="flex flex-col">
                            <span className="line-through text-slate-400 text-[10px] font-mono leading-none">
                              {formatRupiah(product.sellPrice)}
                            </span>
                            <div className="text-emerald-700 font-black text-xs sm:text-sm leading-tight">
                              {formatRupiah(effectivePromoPrice)}
                              <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                                /{product.unit || 'porsi'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-emerald-700 font-extrabold text-xs sm:text-sm">
                            {formatRupiah(product.sellPrice)}
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                              /{product.unit || 'porsi'}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="w-6 h-6 rounded-full bg-slate-100 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center text-slate-400 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Cart & Checkout Panel */}
      <div
        className={`fixed lg:static inset-y-0 right-0 z-40 w-full sm:w-[440px] lg:w-[400px] xl:w-[440px] bg-white border-l border-slate-200 flex flex-col shadow-2xl lg:shadow-none transition-transform duration-300 ${
          mobileCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Cart Header with Tester Switch */}
        <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs ${
                isTesterOrder
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {isTesterOrder ? <Gift className="w-5 h-5" /> : <ShoppingCart className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-slate-800 text-sm">
                  {isTesterOrder ? 'Pesanan Tester / Sampel' : 'Keranjang Kasir'}
                </h3>
                {isTesterOrder && (
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300">
                    GRATIS
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Kasir: <strong className="text-slate-600">{currentUser.name}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Quick Toggle Tester Mode */}
            <button
              onClick={() => setIsTesterModalOpen(true)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                isTesterOrder
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border border-slate-200'
              }`}
              title="Atur Mode Tester / Sampel Gratis"
            >
              <Gift className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[11px]">Tester</span>
            </button>

            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Kosongkan Keranjang"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setMobileCartOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* F&B Order Type Switcher & Table */}
        <div className="p-2.5 bg-slate-100 border-b border-slate-200 space-y-2">
          <div className="grid grid-cols-3 gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              onClick={() => setOrderType('dine_in')}
              className={`py-1 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                orderType === 'dine_in'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🍽️ Dine In
            </button>
            <button
              onClick={() => setOrderType('take_away')}
              className={`py-1 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                orderType === 'take_away'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🛍️ Take Away
            </button>
            <button
              onClick={() => setOrderType('delivery')}
              className={`py-1 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                orderType === 'delivery'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🛵 Delivery
            </button>
          </div>

          {orderType === 'dine_in' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 shrink-0">Pilih Meja:</span>
              <select
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-extrabold text-emerald-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {(storeSettings.tables && storeSettings.tables.length > 0
                  ? storeSettings.tables
                  : [
                      'Meja 01 (Indoor AC)',
                      'Meja 02 (Indoor AC)',
                      'Meja 03 (Indoor AC)',
                      'Meja 04 (Indoor AC)',
                      'Meja 05 (Indoor AC)',
                      'Bar Stool 01',
                      'Bar Stool 02',
                      'VIP Room',
                      'Outdoor 01',
                    ]
                ).map((tbl) => (
                  <option key={tbl} value={tbl}>
                    📍 {tbl}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* FITUR NAMA PELANGGAN PADA NOTA */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Nama Pelanggan (Nota):</span>
              </span>
              {(selectedCustomer || guestName) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setGuestName('');
                  }}
                  className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                >
                  Hapus
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Nama pelanggan (cth: Kak Sarah / Bpk. Budi)..."
              value={selectedCustomer ? selectedCustomer.name : guestName}
              onChange={(e) => {
                setSelectedCustomer(null);
                setGuestName(e.target.value);
              }}
              className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-semibold"
            />
            {customers.length > 0 && !selectedCustomer && (
              <div className="flex flex-wrap gap-1 items-center pt-0.5">
                <span className="text-[9px] text-slate-400">Pilih cepat:</span>
                {customers.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(c);
                      setGuestName(c.name);
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-200/80 hover:bg-emerald-100 hover:text-emerald-800 text-[10px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <ShoppingCart className="w-12 h-12 mb-3 stroke-1 text-slate-300" />
              <p className="font-semibold text-slate-600 text-sm">Pesanan Masih Kosong</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                Pilih menu di sebelah kiri untuk menambahkan ke daftar pesanan.
              </p>
            </div>
          ) : (
            cart.map((item, itemIdx) => {
              const isThisTester = isTesterOrder || !!item.isTester;
              const unitPrice = getItemUnitPrice(item);
              const itemTotal = isThisTester ? 0 : unitPrice * item.quantity - (item.discount || 0);

              return (
                <div
                  key={`${item.product.id}-${itemIdx}`}
                  className={`rounded-2xl p-3 border transition-colors flex flex-col gap-1.5 ${
                    isThisTester
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-slate-50/90 border-slate-200/80 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
                        {item.product.image || item.product.imageUrl ? (
                          <img
                            src={item.product.image || item.product.imageUrl}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <Coffee className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h5 className="font-bold text-xs text-slate-800 line-clamp-1">
                            {item.product.name}
                          </h5>
                          {isThisTester && (
                            <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-white shrink-0">
                              TESTER
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {isThisTester ? (
                            <span className="text-amber-700 font-bold">Gratis (Rp 0)</span>
                          ) : (
                            `${formatRupiah(unitPrice)} / ${item.product.unit || 'porsi'}`
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Per-item Tester button */}
                      <button
                        type="button"
                        onClick={() => toggleItemTester(itemIdx)}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors cursor-pointer ${
                          item.isTester
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-200 hover:bg-amber-100 text-slate-600 hover:text-amber-800'
                        }`}
                        title="Tandai item ini sebagai Tester/Gratis"
                      >
                        Tester
                      </button>

                      <button
                        onClick={() => removeFromCart(itemIdx)}
                        className="text-slate-300 hover:text-red-500 p-1 transition-colors cursor-pointer shrink-0"
                        title="Hapus Item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* FITUR 3: SELECTED ADDON BADGES */}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {item.selectedAddons && item.selectedAddons.length > 0 && (
                      item.selectedAddons.map((addon) => (
                        <span
                          key={addon.id}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1"
                        >
                          <span>+ {addon.name}</span>
                          <span className="text-purple-600">({formatRupiah(addon.price)})</span>
                        </span>
                      ))
                    )}

                    {/* Button to open Addon Selector Modal */}
                    <button
                      type="button"
                      onClick={() => {
                        setAddonModalItemIndex(itemIdx);
                        setCustomAddonName('');
                        setCustomAddonPrice(0);
                      }}
                      className="text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Layers className="w-3 h-3" />
                      <span>{item.selectedAddons && item.selectedAddons.length > 0 ? 'Ubah Tambahan' : '+ Topping / Tambahan'}</span>
                    </button>
                  </div>

                  {/* Barista / Kitchen Notes */}
                  <div className="pt-0.5">
                    {item.notes ? (
                      <button
                        onClick={() => {
                          setItemNoteModalIndex(itemIdx);
                          setItemNoteDraft(item.notes || '');
                        }}
                        className="text-left text-[11px] font-semibold text-amber-800 bg-amber-100/70 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>📝</span>
                        <span className="truncate max-w-[220px]">{item.notes}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setItemNoteModalIndex(itemIdx);
                          setItemNoteDraft('');
                        }}
                        className="text-[10px] text-slate-400 hover:text-emerald-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>+ Catatan Barista (Less sugar, ice, etc.)</span>
                      </button>
                    )}
                  </div>

                  {/* Product Discount Notice in Cart */}
                  {item.discount > 0 && !isThisTester && (
                    <div className="flex items-center justify-between text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                      <span className="flex items-center gap-1 font-bold">
                        <Tag className="w-3 h-3 text-amber-600" />
                        <span>Diskon Produk:</span>
                      </span>
                      <span className="font-mono font-bold text-amber-900">-{formatRupiah(item.discount)}</span>
                    </div>
                  )}

                  {/* Quantity and Line Total */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                    <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-0.5 shadow-2xs">
                      <button
                        onClick={() => updateQuantity(itemIdx, -1)}
                        className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-extrabold text-xs text-slate-800 min-w-[24px] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(itemIdx, 1)}
                        className="w-6 h-6 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-right">
                      {isThisTester ? (
                        <div className="font-black text-sm text-amber-700 font-mono">
                          Rp 0 (Tester)
                        </div>
                      ) : item.discount > 0 ? (
                        <div>
                          <span className="line-through text-slate-400 text-[10px] font-mono block">
                            {formatRupiah(unitPrice * item.quantity)}
                          </span>
                          <div className="font-black text-sm text-slate-900 font-mono">
                            {formatRupiah(itemTotal)}
                          </div>
                        </div>
                      ) : (
                        <div className="font-black text-sm text-slate-900 font-mono">
                          {formatRupiah(itemTotal)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Calculation Summary Footer (Diskon & Pajak Features) */}
        <div className="p-4 border-t border-slate-200 bg-white space-y-2.5 shadow-lg">
          {/* FITUR 1 & FITUR 2: Subtotal, Diskon, Pajak Controls */}
          <div className="space-y-1.5 text-xs text-slate-600">
            {/* Subtotal */}
            <div className="flex justify-between items-center">
              <span>Subtotal Menu</span>
              <span className="font-bold text-slate-800 font-mono">{formatRupiah(rawSubtotal)}</span>
            </div>

            {/* FITUR 1: DISKON TRANSAKSI */}
            <div className="flex items-center justify-between gap-2 bg-emerald-50/60 p-2 rounded-xl border border-emerald-100">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="font-bold text-emerald-900 hover:underline cursor-pointer flex items-center gap-1 text-xs"
                >
                  <span>Diskon:</span>
                  <span className="text-[11px] font-normal text-emerald-700">
                    {discountType === 'percent' ? `(${discountInputValue}%)` : '(Nominal)'}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {transactionDiscountAmount > 0 && (
                  <span className="font-bold text-emerald-700 font-mono">
                    -{formatRupiah(transactionDiscountAmount)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="px-2 py-0.5 bg-white border border-emerald-300 rounded-lg text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 cursor-pointer shadow-2xs"
                >
                  {transactionDiscountAmount > 0 ? 'Ubah' : '+ Tambah Diskon'}
                </button>
              </div>
            </div>

            {/* FITUR 2: PAJAK (PPN / PB1 RESTO) */}
            <div className="flex items-center justify-between gap-2 bg-blue-50/60 p-2 rounded-xl border border-blue-100">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableTax}
                    onChange={(e) => setEnableTax(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-blue-950 text-xs">Pajak (PPN/PB1)</span>
                    {hasNonTaxableItemsInCart && enableTax && (
                      <span className="text-[10px] text-blue-600 block leading-tight">
                        (Ada menu bebas pajak)
                      </span>
                    )}
                  </div>
                </label>

                {enableTax && (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value)))}
                      className="w-12 text-center py-0.5 px-1 bg-white border border-blue-200 rounded text-xs font-mono font-bold"
                    />
                    <span className="text-xs text-blue-700 font-bold">%</span>
                  </div>
                )}
              </div>

              <span className="font-bold text-blue-800 font-mono">
                {enableTax ? formatRupiah(taxAmount) : 'Rp 0'}
              </span>
            </div>

            {/* Rounding if enabled */}
            {storeSettings.enableRounding && rounding !== 0 && !isTesterOrder && (
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Pembulatan</span>
                <span className="font-mono">{formatRupiah(rounding)}</span>
              </div>
            )}
          </div>

          {/* Grand Total */}
          <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
            <div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                {isTesterOrder ? 'TOTAL TESTER' : 'TOTAL TAGIHAN'}
              </span>
              <div
                className={`text-2xl xl:text-3xl font-black font-mono tracking-tight ${
                  isTesterOrder ? 'text-amber-600' : 'text-emerald-700'
                }`}
              >
                {formatRupiah(grandTotal)}
              </div>
            </div>
            <div className="text-right text-xs text-slate-500 font-semibold">
              {cart.reduce((s, i) => s + i.quantity, 0)} Porsi Menu
            </div>
          </div>

          {/* Action Bayar Button */}
          <button
            onClick={handleOpenCheckout}
            disabled={cart.length === 0}
            className={`w-full py-3.5 px-4 rounded-2xl active:scale-[0.99] disabled:opacity-40 disabled:pointer-events-none text-white font-black text-base shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isTesterOrder
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
            }`}
          >
            {isTesterOrder ? (
              <>
                <Gift className="w-5 h-5" />
                <span>SIMPAN TRANSAKSI TESTER (GRATIS)</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5" />
                <span>BAYAR SEKARANG ({formatRupiah(grandTotal)})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* FITUR 3: ADDITIONAL MENU / MODIFIER SELECTION MODAL */}
      {addonModalItemIndex !== null && cart[addonModalItemIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-purple-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  <span>Pilih Opsi Tambahan / Topping</span>
                </h3>
                <p className="text-xs text-purple-100">
                  Untuk menu: <strong>{cart[addonModalItemIndex].product.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setAddonModalItemIndex(null)}
                className="p-1 rounded-full hover:bg-purple-700 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Product's Predefined Addons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Menu Tambahan yang Tersedia:
                </label>
                {cart[addonModalItemIndex].product.addons &&
                cart[addonModalItemIndex].product.addons!.length > 0 ? (
                  <div className="space-y-2">
                    {cart[addonModalItemIndex].product.addons!.map((addon) => {
                      const isSelected = !!cart[addonModalItemIndex].selectedAddons?.some(
                        (a) => a.id === addon.id || a.name === addon.name
                      );
                      return (
                        <div
                          key={addon.id}
                          onClick={() => {
                            setCart((prev) => {
                              const updated = [...prev];
                              const cur = updated[addonModalItemIndex];
                              if (!cur) return prev;
                              const currentAddons = cur.selectedAddons || [];
                              const already = currentAddons.some((a) => a.id === addon.id);
                              const newAddons = already
                                ? currentAddons.filter((a) => a.id !== addon.id)
                                : [...currentAddons, addon];
                              updated[addonModalItemIndex] = {
                                ...cur,
                                selectedAddons: newAddons,
                              };
                              return updated;
                            });
                          }}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-purple-50 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-purple-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center ${
                                isSelected ? 'bg-purple-600 text-white' : 'border border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span className="font-bold text-xs text-slate-800">{addon.name}</span>
                          </div>
                          <span className="font-mono font-bold text-xs text-purple-700">
                            +{formatRupiah(addon.price)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    Produk ini belum memiliki daftar additional bawaan. Anda dapat menambahkan opsi kustom di bawah ini.
                  </div>
                )}
              </div>

              {/* Add Custom Addon on the fly */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <span className="text-xs font-bold text-slate-700 block">
                  + Tambahan Kustom Khusus Pesanan Ini:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-7">
                    <input
                      type="text"
                      placeholder="Nama Tambahan (cth: Extra Boba)"
                      value={customAddonName}
                      onChange={(e) => setCustomAddonName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div className="sm:col-span-5 flex gap-1.5">
                    <input
                      type="number"
                      min="0"
                      placeholder="+ Harga (Rp)"
                      value={customAddonPrice || ''}
                      onChange={(e) => setCustomAddonPrice(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!customAddonName.trim()) return;
                        const newCustom: ProductAddon = {
                          id: `cust-add-${Date.now()}`,
                          name: customAddonName.trim(),
                          price: Math.max(0, Number(customAddonPrice) || 0),
                        };
                        setCart((prev) => {
                          const updated = [...prev];
                          const cur = updated[addonModalItemIndex];
                          if (!cur) return prev;
                          updated[addonModalItemIndex] = {
                            ...cur,
                            selectedAddons: [...(cur.selectedAddons || []), newCustom],
                          };
                          return updated;
                        });
                        setCustomAddonName('');
                        setCustomAddonPrice(0);
                      }}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shrink-0 cursor-pointer"
                    >
                      Tambah
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setAddonModalItemIndex(null)}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs shadow-md shadow-purple-600/20 cursor-pointer transition-colors"
              >
                Selesai Pilih Tambahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FITUR 1: MODAL DISKON TRANSAKSI */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Tag className="w-5 h-5" />
                <span>Atur Diskon Transaksi</span>
              </h3>
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="p-1 rounded-full hover:bg-emerald-700 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Type Switcher */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setDiscountType('fixed')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    discountType === 'fixed'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Rupiah (Rp)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    discountType === 'percent'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Persentase (%)
                </button>
              </div>

              {/* Input Value */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {discountType === 'percent' ? 'Besar Diskon (%)' : 'Jumlah Potongan Diskon (Rp)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? 100 : rawSubtotal}
                  value={discountInputValue || ''}
                  onChange={(e) => setDiscountInputValue(Math.max(0, Number(e.target.value)))}
                  placeholder={discountType === 'percent' ? 'Contoh: 10' : 'Contoh: 15000'}
                  className="w-full px-4 py-2.5 text-lg font-black font-mono border-2 border-emerald-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  autoFocus
                />
              </div>

              {/* Quick Presets */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 block mb-1.5">Pilihan Cepat:</span>
                {discountType === 'percent' ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 15, 20, 25, 50, 70, 100].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountInputValue(pct)}
                        className={`py-1.5 rounded-lg border text-xs font-extrabold cursor-pointer transition-colors ${
                          discountInputValue === pct
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {[5000, 10000, 15000, 20000, 25000, 50000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDiscountInputValue(amt)}
                        className={`py-1.5 rounded-lg border text-xs font-extrabold cursor-pointer transition-colors ${
                          discountInputValue === amt
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50'
                        }`}
                      >
                        {formatRupiah(amt)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-between items-center text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDiscountInputValue(0);
                    setIsDiscountModalOpen(false);
                  }}
                  className="text-red-600 font-bold hover:underline cursor-pointer"
                >
                  Hapus Diskon
                </button>
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold cursor-pointer"
                >
                  Terapkan Diskon
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FITUR 4: MODAL FITUR TESTER */}
      {isTesterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-amber-500 text-slate-950 flex items-center justify-between">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Gift className="w-5 h-5 text-slate-950" />
                <span>Pengaturan Mode Tester</span>
              </h3>
              <button
                onClick={() => setIsTesterModalOpen(false)}
                className="p-1 rounded-full hover:bg-amber-600 text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Mode Tester digunakan untuk mencatat menu gratis untuk evaluasi rasa (food/beverage tasting), quality control barista, atau sampel promosi pelanggan tanpa dipungut biaya.
              </p>

              {/* Toggle Tester Order */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="font-extrabold text-xs text-amber-950 block">
                    Mode Tester Transaksi
                  </span>
                  <span className="text-[11px] text-amber-800">
                    Semua menu dalam nota ini bernilai Rp 0
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isTesterOrder}
                  onChange={(e) => setIsTesterOrder(e.target.checked)}
                  className="w-5 h-5 text-amber-600 rounded cursor-pointer"
                />
              </div>

              {/* Alasan Tester */}
              {isTesterOrder && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Alasan Pemberian Tester:
                  </label>
                  <select
                    value={testerReason}
                    onChange={(e) => setTesterReason(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 bg-white"
                  >
                    <option value="Cicip Rasa Pelanggan">Cicip Rasa Pelanggan (Free Tasting)</option>
                    <option value="Quality Control / Barista Trial">Quality Control / Kalibrasi Barista</option>
                    <option value="Promosi & Event Tester">Promosi &amp; Event Tester Baru</option>
                    <option value="Complimentary Owner / VIP">Complimentary Owner / Tamu Khusus</option>
                  </select>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTesterModalOpen(false)}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl text-xs cursor-pointer shadow-md shadow-amber-500/20"
                >
                  Simpan Pengaturan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ITEM NOTE MODAL */}
      {itemNoteModalIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-800">
                Catatan Pesanan Dapur / Barista
              </h4>
              <button
                onClick={() => setItemNoteModalIndex(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={3}
              value={itemNoteDraft}
              onChange={(e) => setItemNoteDraft(e.target.value)}
              placeholder="Contoh: Less ice, Less sugar, Pisah sambal, Level 2 pedas..."
              className="w-full p-3 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setItemNoteModalIndex(null)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  setCart((prev) => {
                    const updated = [...prev];
                    if (updated[itemNoteModalIndex]) {
                      updated[itemNoteModalIndex] = {
                        ...updated[itemNoteModalIndex],
                        notes: itemNoteDraft.trim(),
                      };
                    }
                    return updated;
                  });
                  setItemNoteModalIndex(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs cursor-pointer"
              >
                Simpan Catatan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHECKOUT & PAYMENT MODAL */}
      {isPaymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div
              className={`px-6 py-4 text-white flex items-center justify-between ${
                isTesterOrder ? 'bg-amber-600' : 'bg-emerald-600'
              }`}
            >
              <div>
                <h3 className="font-extrabold text-lg flex items-center gap-2">
                  {isTesterOrder && <Gift className="w-5 h-5" />}
                  <span>{isTesterOrder ? 'Konfirmasi Transaksi Tester' : 'Pembayaran Transaksi'}</span>
                </h3>
                <p className="text-xs text-white/90">
                  {cart.length} menu • Kasir: {currentUser.name}
                </p>
              </div>
              <button
                onClick={() => setIsPaymentOpen(false)}
                className="p-1 rounded-full hover:bg-black/20 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Display Banner */}
            <div className="p-6 bg-slate-900 text-white flex flex-col items-center justify-center text-center">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
                {isTesterOrder ? 'TOTAL BIAYA TESTER' : 'Total Tagihan Bersih'}
              </span>
              <div
                className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                  isTesterOrder ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {formatRupiah(grandTotal)}
              </div>
              {isTesterOrder ? (
                <div className="text-xs text-amber-300 mt-1 font-semibold">
                  Alasan: {testerReason}
                </div>
              ) : (
                selectedCustomer && (
                  <div className="text-xs text-slate-300 mt-1">
                    Pelanggan: <strong className="text-white">{selectedCustomer.name}</strong>
                  </div>
                )
              )}
            </div>

            <div className="p-6 space-y-4">
              {!isTesterOrder && (
                <>
                  {/* Payment Methods */}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Metode Pembayaran:
                    </label>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'cash', label: 'Tunai (Cash)', icon: Wallet },
                        { id: 'qris', label: 'QRIS', icon: QrCode },
                        { id: 'transfer', label: 'Transfer Bank', icon: CreditCard },
                        { id: 'debit', label: 'Kartu Debit', icon: CreditCard },
                        { id: 'ewallet', label: 'E-Wallet', icon: Wallet },
                        { id: 'credit', label: 'Kartu Kredit', icon: CreditCard },
                        { id: 'other', label: 'Lainnya', icon: Calculator },
                      ].map((m) => {
                        const Icon = m.icon;
                        const isSel = paymentMethod === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setPaymentMethod(m.id as PaymentMethod);
                              if (m.id !== 'cash') {
                                setCashReceivedInput(grandTotal.toString());
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              isSel
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="text-center line-clamp-1">{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cash Input Form */}
                  {paymentMethod === 'cash' && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Uang Tunai Diterima (Rp):
                        </label>
                        <input
                          type="number"
                          value={cashReceivedInput}
                          onChange={(e) => setCashReceivedInput(e.target.value)}
                          placeholder="Masukkan jumlah uang diterima"
                          className="w-full px-4 py-3 text-xl font-bold font-mono border-2 border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                          autoFocus
                        />
                      </div>

                      {/* Quick Cash Buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleQuickAmount(grandTotal)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer"
                        >
                          Uang Pas ({formatRupiah(grandTotal)})
                        </button>
                        {[10000, 20000, 50000, 100000, 200000, 500000].map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => handleQuickAmount(amt)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                          >
                            {formatRupiah(amt)}
                          </button>
                        ))}
                      </div>

                      {/* Kembalian Box */}
                      <div
                        className={`p-4 rounded-xl border flex items-center justify-between ${
                          cashReceivedNum >= grandTotal
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-red-50 border-red-200 text-red-900'
                        }`}
                      >
                        <div>
                          <span className="text-xs font-semibold uppercase">
                            {cashReceivedNum >= grandTotal ? 'Kembalian:' : 'Uang Kurang:'}
                          </span>
                          <div className="text-2xl font-black font-mono">
                            {formatRupiah(Math.abs(cashReceivedNum - grandTotal))}
                          </div>
                        </div>
                        {cashReceivedNum >= grandTotal ? (
                          <Check className="w-8 h-8 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-8 h-8 text-red-500" />
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* FITUR NAMA PELANGGAN PADA MODAL PEMBAYARAN */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Tamu / Pelanggan (Dicetak pada Nota)
                </label>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-emerald-600" />
                  </div>
                  <input
                    type="text"
                    placeholder="Nama pelanggan (cth: Kak Sarah / Bpk. Budi)..."
                    value={selectedCustomer ? selectedCustomer.name : guestName}
                    onChange={(e) => {
                      setSelectedCustomer(null);
                      setGuestName(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Transaction Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">
                  Catatan Transaksi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Catatan tambahan untuk struk..."
                  value={transactionNotes}
                  onChange={(e) => setTransactionNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Submit Payment Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProcessPayment}
                  disabled={!isTesterOrder && paymentMethod === 'cash' && cashReceivedNum < grandTotal}
                  className={`w-full py-4 rounded-2xl active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none text-white font-black text-base shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    isTesterOrder
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                  }`}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    {isTesterOrder ? 'SIMPAN & SELESAIKAN TESTER' : 'PROSES PEMBAYARAN SELESAI'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BARCODE SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={(code: string) => {
          handleBarcodeScanned(code);
          setIsScannerOpen(false);
        }}
      />

      {/* RECEIPT MODAL */}
      {completedSale && (
        <ReceiptModal
          isOpen={isReceiptOpen}
          onClose={() => {
            setIsReceiptOpen(false);
            setCompletedSale(null);
          }}
          sale={completedSale}
          store={storeSettings}
          printer={printerSettings}
          onNewTransaction={() => {
            setIsReceiptOpen(false);
            setCompletedSale(null);
            clearCart();
          }}
        />
      )}
    </div>
  );
};
