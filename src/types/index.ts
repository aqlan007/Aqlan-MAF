export type UserRole = 'admin' | 'manager' | 'cashier';

export interface User {
  id: string;
  name: string;
  pin: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  createdAt: string;
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  image?: string;
  imageUrl?: string;
  categoryId: string;
  unit: string; // porsi, cup, gelas, pcs, kg, botol, box, dll.
  buyPrice: number;
  hpp: number; // calculated HPP (either direct or derived from raw ingredient recipe BOM)
  sellPrice: number;
  wholesalePrice?: number;
  margin: number; // percentage
  stock: number;
  minStock: number;
  supplierId?: string;
  description?: string;
  addons?: ProductAddon[]; // Additional menu / toppings / extra options
  // Diskon dan Pajak pada Produk
  discountType?: 'percent' | 'fixed';
  discountValue?: number; // e.g. 10 (persen) atau 5000 (Rupiah)
  isDiscountActive?: boolean;
  enableTax?: boolean; // Apakah produk ini dikenakan pajak (default: true)
  taxRate?: number; // Tarif pajak produk (misal: 11%)
  hasRecipe?: boolean; // True if this F&B menu item is calculated from ingredients
  recipeId?: string;
  foodCostPercent?: number; // Food cost percentage (e.g. 28-35%)
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  address?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  totalTransactions: number;
  totalSpent: number;
  createdAt: string;
}

export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'debit' | 'credit' | 'ewallet' | 'other';
export type OrderType = 'dine_in' | 'take_away' | 'delivery';

export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  barcode: string;
  unit: string;
  quantity: number;
  unitBuyPrice: number;
  unitHpp: number;
  unitSellPrice: number;
  subtotal: number;
  discount: number;
  total: number;
  profit: number; // (unitSellPrice - unitHpp) * quantity - discount
  notes?: string; // e.g. "Less Sugar, Less Ice"
  modifiers?: string[]; // e.g. ["Extra Shot", "Oat Milk"]
  selectedAddons?: ProductAddon[];
  isTester?: boolean;
}

export type SaleStatus = 'completed' | 'voided' | 'refunded';

export interface Sale {
  id: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  cashierId: string;
  cashierName: string;
  orderType?: OrderType; // 'dine_in' | 'take_away' | 'delivery'
  tableNumber?: string; // e.g. 'Meja 04', 'Bar 2', 'VIP 1'
  customerId?: string;
  customerName?: string;
  subtotal: number;
  discount: number; // transaction-level discount
  tax: number;
  serviceFee: number;
  rounding: number;
  total: number;
  paymentMethod: PaymentMethod;
  cashReceived: number;
  changeAmount: number;
  totalHpp: number;
  totalProfit: number;
  profitMargin: number;
  status: SaleStatus;
  isTester?: boolean;
  testerReason?: string;
  taxRate?: number;
  notes?: string;
  createdAt: string;
  items?: SaleItem[];
}

export type StockMovementType =
  | 'in_purchase'
  | 'out_sale'
  | 'out_damaged'
  | 'out_lost'
  | 'out_internal'
  | 'return_sale'
  | 'adjustment';

export interface StockMovement {
  id: string;
  date: string; // ISO
  productId: string;
  productName: string;
  type: StockMovementType;
  referenceId?: string;
  referenceNumber?: string;
  quantity: number; // positive for addition, negative for deduction
  initialStock: number;
  finalStock: number;
  unitCost?: number;
  notes?: string;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitBuyPrice: number;
  allocatedExtraCost: number;
  unitHpp: number;
  total: number;
}

export interface Purchase {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  totalAmount: number; // sum of buy prices
  additionalCost: number;
  transportCost: number;
  otherCost: number;
  totalCost: number; // totalAmount + additionalCost + transportCost + otherCost
  notes?: string;
  createdAt: string;
  items?: PurchaseItem[];
}

export interface ReturnItem {
  id: string;
  returnId: string;
  productId: string;
  productName: string;
  quantity: number;
  refundPrice: number;
  returnHpp: number;
}

export interface SaleReturn {
  id: string;
  returnNumber: string;
  saleId: string;
  invoiceNumber: string;
  date: string;
  cashierName: string;
  totalRefund: number;
  reason: string;
  notes?: string;
  createdAt: string;
  items?: ReturnItem[];
}

export type ExpenseCategory =
  | 'listrik'
  | 'sewa'
  | 'gaji'
  | 'transport'
  | 'internet'
  | 'operasional'
  | 'lainnya';

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  title: string;
  amount: number;
  notes?: string;
  createdAt: string;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  logo?: string;
  address: string;
  city: string;
  province: string;
  postalCode?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  ownerName: string;
  npwp?: string;
  slogan: string;
  receiptFooter: string;
  currencySymbol: string;
  taxRate: number; // percentage, e.g. 11 or 0
  enableTax: boolean;
  enableRounding: boolean;
  isOnboarded: boolean;
  businessType?: 'cafe' | 'retail'; // Mode Cafe & Resto atau Retail
  tables?: string[]; // Daftar meja cafe: ['Meja 01', 'Meja 02', ...]
  wifiName?: string; // Nama SSID WiFi Toko / Cafe untuk dicetak pada struk
  wifiPassword?: string; // Kata sandi WiFi untuk pengunjung pada struk
  updatedAt?: string;
}

export interface PrinterSettings {
  id: string;
  paperSize: '58mm' | '80mm';
  copies: number;
  margin: number;
  fontSize: 'small' | 'medium' | 'large';
  showLogo: boolean;
  logoSize?: 'small' | 'medium' | 'large'; // Ukuran logo di struk
  logoGrayscale?: boolean; // Filter monokrom kontras tinggi untuk printer thermal
  showCustomerName?: boolean; // Tampilkan nama tamu/pelanggan di nota
  showWifi?: boolean; // Tampilkan nama SSID & kata sandi WiFi toko di nota
  showWifiPassword?: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showQrCode: boolean;
  showBarcode: boolean;
  showFooter: boolean;
  showThankYou: boolean;
  showHpp: boolean;
  showProfit: boolean;
  autoCut: boolean;
  defaultPrinterName?: string;
  bluetoothDeviceId?: string;
  lastConnected?: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  discount: number; // Rupiah discount on this item
  notes?: string;
  modifiers?: string[]; // e.g. ['Less Ice', 'Normal Sweet']
  selectedAddons?: ProductAddon[];
  isTester?: boolean;
}

// ==========================================
// MODUL BAHAN BAKU & RESEP HPP LENGKAP (F&B / CAFE)
// ==========================================

export type IngredientCategory =
  | 'kopi_espresso'
  | 'dairy_susu'
  | 'sirup_pemanis'
  | 'bubuk_powder'
  | 'protein_daging'
  | 'bumbu_sauce'
  | 'karbo_baking'
  | 'packaging'
  | 'topping'
  | 'lainnya';

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  purchaseUnit: string; // misal 'kg', 'liter', 'pack', 'botol', 'box', 'pcs', 'butir'
  purchasePrice: number; // Harga beli per kemasan (misal Rp 185.000)
  purchaseUnitSize: number; // Ukuran kemasan (misal 1000 gram / 1000 ml / 1 pack isi 50)
  recipeUnit: string; // Satuan saat dipakai resep: 'gram', 'ml', 'pcs', 'lembar', 'slice', 'butir'
  conversionFactor: number; // 1 purchaseUnit = berapa recipeUnit (misal 1 kg = 1000 gram)
  costPerRecipeUnit: number; // purchasePrice / conversionFactor (misal Rp 185 / gram)
  wastagePercent: number; // Persentase susut/waste (misal 5% susut espresso dial-in / ampas)
  effectiveCostPerRecipeUnit: number; // costPerRecipeUnit / (1 - wastagePercent/100)
  currentStock: number; // Stok saat ini dalam satuan recipeUnit (misal 5000 gram)
  minStock: number; // Batas minimum peringatan stok bahan baku
  supplierId?: string;
  notes?: string;
  updatedAt: string;
}

export interface RecipeItem {
  ingredientId: string;
  ingredientName: string;
  recipeUnit: string;
  quantity: number; // Jumlah yang dipakai per 1 porsi (misal 18 gram kopi, 120 ml susu)
  unitCost: number; // Biaya per satuan resep (efektif)
  subtotal: number; // quantity * unitCost
}

export interface ProductRecipe {
  id: string;
  productId: string;
  productName: string;
  items: RecipeItem[];
  packagingCost: number; // Biaya kemasan (cup, lid, straw, sleeve, kantong, box take-away)
  laborCost: number; // Alokasi biaya tenaga kerja/barista per porsi
  utilityCost: number; // Alokasi listrik, gas, es batu kristal per porsi
  otherCost: number; // Biaya operasional lain per porsi
  totalIngredientCost: number; // Total biaya bahan baku mentah
  totalHpp: number; // Total HPP riil (Bahan Baku + Kemasan + Overhead)
  targetFoodCostPercent: number; // Target food cost standar F&B (misal 28% - 35%)
  recommendedPrice: number; // Harga jual rekomendasi berbasis target food cost
  actualSellPrice: number; // Harga jual yang saat ini ditetapkan di menu
  actualFoodCostPercent: number; // (totalHpp / actualSellPrice) * 100
  actualMarginPercent: number; // ((actualSellPrice - totalHpp) / actualSellPrice) * 100
  actualProfit: number; // actualSellPrice - totalHpp
  notes?: string;
  updatedAt: string;
}

export type Recipe = ProductRecipe;

export interface IngredientMovement {
  id: string;
  date: string;
  ingredientId: string;
  ingredientName: string;
  type: 'purchase_in' | 'recipe_deduction' | 'waste' | 'adjustment';
  quantity: number; // dalam satuan recipeUnit (+ untuk masuk, - untuk keluar)
  recipeUnit: string;
  unitCost: number;
  totalCost: number;
  referenceId?: string; // ID transaksi penjualan atau invoice pembelian
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
}
