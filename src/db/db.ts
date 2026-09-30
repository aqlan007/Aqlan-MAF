import Dexie, { type Table } from 'dexie';
import {
  AuditLog,
  Category,
  Customer,
  Expense,
  Ingredient,
  IngredientMovement,
  PrinterSettings,
  Product,
  ProductRecipe,
  Purchase,
  PurchaseItem,
  ReturnItem,
  Sale,
  SaleItem,
  SaleReturn,
  StockMovement,
  StoreSettings,
  Supplier,
  User,
} from '../types';
import {
  generateSampleSales,
  SAMPLE_CATEGORIES,
  SAMPLE_CUSTOMERS,
  SAMPLE_EXPENSES,
  SAMPLE_INGREDIENTS,
  SAMPLE_PRINTER_SETTINGS,
  SAMPLE_PRODUCTS,
  SAMPLE_RECIPES,
  SAMPLE_STORE_SETTINGS,
  SAMPLE_SUPPLIERS,
  SAMPLE_USERS,
} from './sampleData';

export class KasirDatabase extends Dexie {
  users!: Table<User, string>;
  categories!: Table<Category, string>;
  products!: Table<Product, string>;
  suppliers!: Table<Supplier, string>;
  customers!: Table<Customer, string>;
  sales!: Table<Sale, string>;
  sale_items!: Table<SaleItem, string>;
  stock_movements!: Table<StockMovement, string>;
  purchases!: Table<Purchase, string>;
  purchase_items!: Table<PurchaseItem, string>;
  returns!: Table<SaleReturn, string>;
  return_items!: Table<ReturnItem, string>;
  expenses!: Table<Expense, string>;
  store_settings!: Table<StoreSettings, string>;
  printer_settings!: Table<PrinterSettings, string>;
  audit_logs!: Table<AuditLog, string>;
  // F&B Cafe Recipe & Raw Ingredients tables
  ingredients!: Table<Ingredient, string>;
  recipes!: Table<ProductRecipe, string>;
  ingredient_movements!: Table<IngredientMovement, string>;

  constructor() {
    super('KasirKuDB');

    this.version(1).stores({
      users: 'id, name, pin, role, isActive',
      categories: 'id, name',
      products: 'id, sku, barcode, name, categoryId, supplierId, isActive, stock',
      suppliers: 'id, name, phone',
      customers: 'id, name, phone',
      sales: 'id, invoiceNumber, date, cashierId, paymentMethod, status, createdAt',
      sale_items: 'id, saleId, productId',
      stock_movements: 'id, date, productId, type, referenceId',
      purchases: 'id, invoiceNumber, supplierId, date',
      purchase_items: 'id, purchaseId, productId',
      returns: 'id, returnNumber, saleId, invoiceNumber, date',
      return_items: 'id, returnId, productId',
      expenses: 'id, date, category',
      store_settings: 'id',
      printer_settings: 'id',
      audit_logs: 'id, timestamp, userId',
    });

    this.version(2).stores({
      users: 'id, name, pin, role, isActive',
      categories: 'id, name',
      products: 'id, sku, barcode, name, categoryId, supplierId, isActive, stock, hasRecipe',
      suppliers: 'id, name, phone',
      customers: 'id, name, phone',
      sales: 'id, invoiceNumber, date, cashierId, paymentMethod, status, createdAt, orderType, tableNumber',
      sale_items: 'id, saleId, productId',
      stock_movements: 'id, date, productId, type, referenceId',
      purchases: 'id, invoiceNumber, supplierId, date',
      purchase_items: 'id, purchaseId, productId',
      returns: 'id, returnNumber, saleId, invoiceNumber, date',
      return_items: 'id, returnId, productId',
      expenses: 'id, date, category',
      store_settings: 'id',
      printer_settings: 'id',
      audit_logs: 'id, timestamp, userId',
      ingredients: 'id, name, category, currentStock, minStock',
      recipes: 'id, productId, productName',
      ingredient_movements: 'id, date, ingredientId, type, referenceId',
    });
  }
}

export const db = new KasirDatabase();

/**
 * Potong stok bahan baku secara otomatis saat menu F&B terjual
 */
export async function deductRecipeIngredients(
  saleItems: { productId: string; quantity: number }[],
  saleId: string,
  invoiceNumber: string
): Promise<void> {
  try {
    for (const item of saleItems) {
      const recipe = await db.recipes.where('productId').equals(item.productId).first();
      if (!recipe || !recipe.items || recipe.items.length === 0) continue;

      for (const recipeItem of recipe.items) {
        const totalDeduct = recipeItem.quantity * item.quantity;
        const ing = await db.ingredients.get(recipeItem.ingredientId);
        if (ing) {
          const newStock = Math.max(0, (ing.currentStock || 0) - totalDeduct);
          await db.ingredients.update(ing.id, {
            currentStock: newStock,
            updatedAt: new Date().toISOString(),
          });

          await db.ingredient_movements.add({
            id: `im-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            date: new Date().toISOString(),
            ingredientId: ing.id,
            ingredientName: ing.name,
            type: 'recipe_deduction',
            quantity: -totalDeduct,
            recipeUnit: ing.recipeUnit,
            unitCost: recipeItem.unitCost,
            totalCost: totalDeduct * recipeItem.unitCost,
            referenceId: saleId,
            referenceNumber: invoiceNumber,
            notes: `Auto pemakaian resep ${recipe.productName} (${item.quantity} porsi)`,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  } catch (err) {
    console.error('Error auto-deducting recipe ingredients:', err);
  }
}

/**
 * Seed sample data into the database
 */
export async function seedSampleData(): Promise<void> {
  await db.transaction('rw', [
    db.users,
    db.categories,
    db.products,
    db.suppliers,
    db.customers,
    db.sales,
    db.sale_items,
    db.stock_movements,
    db.expenses,
    db.store_settings,
    db.printer_settings,
    db.audit_logs,
    db.ingredients,
    db.recipes,
    db.ingredient_movements,
  ], async () => {
    // Clear existing
    await db.users.clear();
    await db.categories.clear();
    await db.products.clear();
    await db.suppliers.clear();
    await db.customers.clear();
    await db.sales.clear();
    await db.sale_items.clear();
    await db.stock_movements.clear();
    await db.expenses.clear();
    await db.store_settings.clear();
    await db.printer_settings.clear();
    await db.audit_logs.clear();
    await db.ingredients.clear();
    await db.recipes.clear();
    await db.ingredient_movements.clear();

    // Populate
    await db.users.bulkAdd(SAMPLE_USERS);
    await db.categories.bulkAdd(SAMPLE_CATEGORIES);
    await db.products.bulkAdd(SAMPLE_PRODUCTS);
    await db.suppliers.bulkAdd(SAMPLE_SUPPLIERS);
    await db.customers.bulkAdd(SAMPLE_CUSTOMERS);
    await db.expenses.bulkAdd(SAMPLE_EXPENSES);
    await db.store_settings.add(SAMPLE_STORE_SETTINGS);
    await db.printer_settings.add(SAMPLE_PRINTER_SETTINGS);
    await db.ingredients.bulkAdd(SAMPLE_INGREDIENTS);
    await db.recipes.bulkAdd(SAMPLE_RECIPES);

    const { sales, saleItems, stockMovements } = generateSampleSales();
    await db.sales.bulkAdd(sales);
    await db.sale_items.bulkAdd(saleItems);
    await db.stock_movements.bulkAdd(stockMovements);

    await db.audit_logs.add({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userId: 'usr-admin',
      userName: 'Hendra Setiawan',
      action: 'INIT_CAFE_DATA',
      details: 'Memuat data percontohan Cafe & Resto (16 menu F&B, 22 bahan baku, 8 resep HPP lengkap, meja, dan transaksi).',
    });
  });
}

/**
 * Initialize base tables if empty
 */
export async function initializeDatabaseIfNeeded(): Promise<boolean> {
  const userCount = await db.users.count();
  if (userCount === 0) {
    // Preload defaults
    await db.store_settings.put(SAMPLE_STORE_SETTINGS);
    await db.printer_settings.put(SAMPLE_PRINTER_SETTINGS);
    await db.users.put(SAMPLE_USERS[0]); // default admin
    await db.ingredients.bulkAdd(SAMPLE_INGREDIENTS);
    await db.recipes.bulkAdd(SAMPLE_RECIPES);
    await db.categories.bulkAdd(SAMPLE_CATEGORIES);
    await db.products.bulkAdd(SAMPLE_PRODUCTS);
    return false; // not onboarded yet
  }

  // Check if ingredients exist, if not preload sample
  const ingCount = await db.ingredients.count();
  if (ingCount === 0) {
    await db.ingredients.bulkAdd(SAMPLE_INGREDIENTS);
    await db.recipes.bulkAdd(SAMPLE_RECIPES);
  }

  // Ensure standard categories (Minuman, Makanan, Snack) exist
  try {
    const existingCats = await db.categories.toArray();
    const standardCats = [
      { id: 'cat-minuman', name: 'Minuman', icon: 'Coffee', color: '#0284c7', description: 'Kopi, teh, susu, jus, dan aneka minuman segar', createdAt: new Date().toISOString() },
      { id: 'cat-makanan', name: 'Makanan', icon: 'Utensils', color: '#ea580c', description: 'Nasi, mie, pasta, rice bowl, dan makanan utama', createdAt: new Date().toISOString() },
      { id: 'cat-snack', name: 'Snack', icon: 'Cookie', color: '#d97706', description: 'Camilan ringan, gorengan, french fries, pastry', createdAt: new Date().toISOString() },
    ];
    for (const sc of standardCats) {
      const found = existingCats.find((c) => c.name.toLowerCase() === sc.name.toLowerCase());
      if (!found) {
        await db.categories.put(sc);
      }
    }
  } catch (err) {
    console.error('Failed to sync default categories:', err);
  }

  // Ensure all existing products have images, discount/tax settings, and standard categories
  try {
    const existingProducts = await db.products.toArray();
    for (const p of existingProducts) {
      const updates: Partial<Product> = {};

      if (!p.image && !p.imageUrl) {
        const sampleMatch = SAMPLE_PRODUCTS.find(
          (sp) => sp.id === p.id || sp.sku === p.sku || sp.name.toLowerCase() === p.name.toLowerCase()
        );
        if (sampleMatch && sampleMatch.image) {
          updates.image = sampleMatch.image;
          updates.imageUrl = sampleMatch.imageUrl || sampleMatch.image;
        }
      }

      // Ensure discount settings exist
      if (p.isDiscountActive === undefined) {
        if (p.id === 'prod-kopi-susu' || p.sku === 'CFE-KPSU-01') {
          updates.isDiscountActive = true;
          updates.discountType = 'percent';
          updates.discountValue = 10;
        } else if (p.id === 'prod-croissant' || p.sku === 'PST-CROI-15') {
          updates.isDiscountActive = true;
          updates.discountType = 'fixed';
          updates.discountValue = 3000;
        } else {
          updates.isDiscountActive = false;
          updates.discountType = 'percent';
          updates.discountValue = 0;
        }
      }

      // Ensure tax settings exist
      if (p.enableTax === undefined) {
        updates.enableTax = true;
      }
      if (p.taxRate === undefined) {
        updates.taxRate = 11;
      }

      // Standardize categories to Minuman, Makanan, Snack
      if (['cat-coffee', 'cat-noncoffee', 'cat-tea'].includes(p.categoryId)) {
        updates.categoryId = 'cat-minuman';
      } else if (['cat-meals'].includes(p.categoryId)) {
        updates.categoryId = 'cat-makanan';
      } else if (['cat-snacks', 'cat-pastry'].includes(p.categoryId)) {
        updates.categoryId = 'cat-snack';
      }

      if (Object.keys(updates).length > 0) {
        await db.products.update(p.id, updates);
      }
    }
  } catch (err) {
    console.error('Failed to sync product settings and categories:', err);
  }

  // Ensure manager user exists in the database
  try {
    const allUsers = await db.users.toArray();
    const hasManager = allUsers.some((u) => u.role === 'manager');
    if (!hasManager) {
      const managerSample = SAMPLE_USERS.find((u) => u.role === 'manager');
      if (managerSample) {
        await db.users.put(managerSample);
      }
    }
  } catch (err) {
    console.error('Failed to sync manager user:', err);
  }

  // Ensure store branding uses CHORD #Kopi_kebun.
  try {
    const currentStore = await db.store_settings.get('store-main');
    if (currentStore) {
      if (
        currentStore.storeName === 'Senja Kopi & Kitchen' ||
        !currentStore.logo ||
        currentStore.storeName === 'KasirKu POS'
      ) {
        await db.store_settings.update('store-main', {
          storeName: SAMPLE_STORE_SETTINGS.storeName,
          logo: SAMPLE_STORE_SETTINGS.logo,
          slogan: SAMPLE_STORE_SETTINGS.slogan,
          receiptFooter: SAMPLE_STORE_SETTINGS.receiptFooter,
          wifiName: SAMPLE_STORE_SETTINGS.wifiName,
          wifiPassword: SAMPLE_STORE_SETTINGS.wifiPassword,
        });
      }
    } else {
      await db.store_settings.put(SAMPLE_STORE_SETTINGS);
    }
  } catch (err) {
    console.error('Failed to sync store branding:', err);
  }

  const storeSettings = await db.store_settings.get('store-main');
  return !!storeSettings?.isOnboarded;
}

/**
 * Reset default admin and cashier users
 */
export async function resetUsersToDefault(): Promise<User[]> {
  await db.users.clear();
  await db.users.bulkAdd(SAMPLE_USERS);
  return SAMPLE_USERS;
}

/**
 * Ensure default admin exists with PIN 1234
 */
export async function ensureDefaultAdmin(): Promise<User> {
  const allU = await db.users.toArray();
  let admin = allU.find((u) => u.role === 'admin');
  if (!admin) {
    admin = { ...SAMPLE_USERS[0], pin: '1234' };
    await db.users.put(admin);
  } else if (!admin.pin || admin.pin.trim() === '') {
    admin = { ...admin, pin: '1234' };
    await db.users.update(admin.id, { pin: '1234' });
  }
  return admin;
}

/**
 * Full export database to JSON
 */
export async function exportFullDatabase(): Promise<string> {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    users: await db.users.toArray(),
    categories: await db.categories.toArray(),
    products: await db.products.toArray(),
    suppliers: await db.suppliers.toArray(),
    customers: await db.customers.toArray(),
    sales: await db.sales.toArray(),
    sale_items: await db.sale_items.toArray(),
    stock_movements: await db.stock_movements.toArray(),
    purchases: await db.purchases.toArray(),
    purchase_items: await db.purchase_items.toArray(),
    returns: await db.returns.toArray(),
    return_items: await db.return_items.toArray(),
    expenses: await db.expenses.toArray(),
    store_settings: await db.store_settings.toArray(),
    printer_settings: await db.printer_settings.toArray(),
    ingredients: await db.ingredients.toArray(),
    recipes: await db.recipes.toArray(),
    ingredient_movements: await db.ingredient_movements.toArray(),
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Full import / restore database from JSON
 */
export async function importFullDatabase(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data.version || !data.products) {
      throw new Error('Format file backup tidak valid.');
    }

    await db.transaction('rw', [
      db.users,
      db.categories,
      db.products,
      db.suppliers,
      db.customers,
      db.sales,
      db.sale_items,
      db.stock_movements,
      db.purchases,
      db.purchase_items,
      db.returns,
      db.return_items,
      db.expenses,
      db.store_settings,
      db.printer_settings,
      db.audit_logs,
      db.ingredients,
      db.recipes,
      db.ingredient_movements,
    ], async () => {
      await db.users.clear();
      await db.categories.clear();
      await db.products.clear();
      await db.suppliers.clear();
      await db.customers.clear();
      await db.sales.clear();
      await db.sale_items.clear();
      await db.stock_movements.clear();
      await db.purchases.clear();
      await db.purchase_items.clear();
      await db.returns.clear();
      await db.return_items.clear();
      await db.expenses.clear();
      await db.store_settings.clear();
      await db.printer_settings.clear();
      await db.ingredients.clear();
      await db.recipes.clear();
      await db.ingredient_movements.clear();

      if (data.users?.length) await db.users.bulkAdd(data.users);
      if (data.categories?.length) await db.categories.bulkAdd(data.categories);
      if (data.products?.length) await db.products.bulkAdd(data.products);
      if (data.suppliers?.length) await db.suppliers.bulkAdd(data.suppliers);
      if (data.customers?.length) await db.customers.bulkAdd(data.customers);
      if (data.sales?.length) await db.sales.bulkAdd(data.sales);
      if (data.sale_items?.length) await db.sale_items.bulkAdd(data.sale_items);
      if (data.stock_movements?.length) await db.stock_movements.bulkAdd(data.stock_movements);
      if (data.purchases?.length) await db.purchases.bulkAdd(data.purchases);
      if (data.purchase_items?.length) await db.purchase_items.bulkAdd(data.purchase_items);
      if (data.returns?.length) await db.returns.bulkAdd(data.returns);
      if (data.return_items?.length) await db.return_items.bulkAdd(data.return_items);
      if (data.expenses?.length) await db.expenses.bulkAdd(data.expenses);
      if (data.store_settings?.length) await db.store_settings.bulkAdd(data.store_settings);
      if (data.printer_settings?.length) await db.printer_settings.bulkAdd(data.printer_settings);
      if (data.ingredients?.length) await db.ingredients.bulkAdd(data.ingredients);
      if (data.recipes?.length) await db.recipes.bulkAdd(data.recipes);
      if (data.ingredient_movements?.length) await db.ingredient_movements.bulkAdd(data.ingredient_movements);

      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: 'usr-admin',
        userName: 'Admin',
        action: 'RESTORE_DATABASE',
        details: `Berhasil merestore database (${data.products?.length || 0} menu, ${data.ingredients?.length || 0} bahan baku, ${data.sales?.length || 0} transaksi).`,
      });
    });

    return true;
  } catch (err) {
    console.error('Failed to import database:', err);
    throw err;
  }
}
