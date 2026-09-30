import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db/db';
import {
  Category,
  Customer,
  Expense,
  ExpenseCategory,
  Ingredient,
  IngredientCategory,
  OrderType,
  PaymentMethod,
  PrinterSettings,
  Product,
  ProductRecipe,
  Sale,
  SaleItem,
  SaleReturn,
  SaleStatus,
  StoreSettings,
  Supplier,
  User,
  UserRole,
} from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  autoSync: boolean;
  lastSyncedAt?: string | null;
}

const STORAGE_KEY = 'kasirku_supabase_config';
const PAIRING_PREFIX = 'KASIRKU-LINK:';
const BROADCAST_CHANNEL = 'kasirku_live_sync';

class SupabaseService {
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig = {
    url: '',
    anonKey: '',
    autoSync: false,
    lastSyncedAt: null,
  };
  private isSyncing = false;
  private syncListeners: Set<(isSyncing: boolean, lastSync?: string | null, error?: string | null) => void> = new Set();
  private realtimeChannel: any = null;
  private pollInterval: any = null;
  private isListeningLifecycle = false;

  constructor() {
    this.loadConfig();
    this.setupLifecycleListeners();
  }

  public loadConfig(): SupabaseConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.config = JSON.parse(saved);
        if (this.config.url && this.config.anonKey) {
          this.client = createClient(this.config.url, this.config.anonKey, {
            realtime: {
              params: {
                eventsPerSecond: 10,
              },
            },
          });
          if (this.config.autoSync) {
            this.initRealtime();
            this.startPolling();
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load Supabase config:', e);
    }
    return this.config;
  }

  public saveConfig(config: SupabaseConfig): boolean {
    try {
      this.config = config;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      if (config.url && config.anonKey) {
        this.client = createClient(config.url, config.anonKey, {
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
        });
        if (config.autoSync) {
          this.initRealtime();
          this.startPolling();
        } else {
          this.stopPolling();
        }
      } else {
        this.client = null;
        this.stopPolling();
      }
      this.notify(null);
      return true;
    } catch (e) {
      console.error('Failed to save Supabase config:', e);
      return false;
    }
  }

  public getConfig(): SupabaseConfig {
    return { ...this.config };
  }

  public isConfigured(): boolean {
    return !!(this.client && this.config.url && this.config.anonKey);
  }

  public addSyncListener(listener: (isSyncing: boolean, lastSync?: string | null, error?: string | null) => void): () => void {
    this.syncListeners.add(listener);
    listener(this.isSyncing, this.config.lastSyncedAt);
    return () => this.syncListeners.delete(listener);
  }

  private notify(error?: string | null) {
    this.syncListeners.forEach((l) => l(this.isSyncing, this.config.lastSyncedAt, error));
  }

  public dispatchLocalSync(table: string, data?: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kasirku:data_sync', {
          detail: { table, data, timestamp: Date.now() },
        })
      );
    }
  }

  /**
   * Broadcast message to all linked devices in real-time via WebSocket (<50ms delay)
   */
  public async broadcast(event: string, payload: any) {
    if (!this.client || !this.realtimeChannel) return;
    try {
      await this.realtimeChannel.send({
        type: 'broadcast',
        event,
        payload,
      });
    } catch (err) {
      console.warn('Realtime broadcast failed:', err);
    }
  }

  /**
   * Background polling & visibility listeners
   */
  private setupLifecycleListeners() {
    if (typeof window === 'undefined' || this.isListeningLifecycle) return;
    this.isListeningLifecycle = true;

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isConfigured() && !this.isSyncing) {
        this.sync(true);
      }
    });

    window.addEventListener('online', () => {
      if (this.isConfigured()) {
        this.initRealtime();
        this.sync(true);
      }
    });

    window.addEventListener('focus', () => {
      if (this.isConfigured() && !this.isSyncing) {
        this.sync(true);
      }
    });
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (this.isConfigured() && !this.isSyncing) {
        await this.sync(true); // silent sync
      }
    }, 12000);
  }

  private stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Generate an encrypted/base64 pairing code for linking devices
   */
  public generatePairingCode(): string {
    if (!this.config.url || !this.config.anonKey) return '';
    try {
      const payload = JSON.stringify({
        u: this.config.url.trim(),
        k: this.config.anonKey.trim(),
        t: Date.now(),
      });
      return PAIRING_PREFIX + btoa(unescape(encodeURIComponent(payload)));
    } catch (e) {
      console.error('Error generating pairing code:', e);
      return '';
    }
  }

  /**
   * Generate a sharable URL for instant 1-click device link
   */
  public generateLinkUrl(): string {
    const code = this.generatePairingCode();
    if (!code) return '';
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    return `${base}?link_sync=${encodeURIComponent(code)}`;
  }

  /**
   * Parse pairing code or full link URL
   */
  public parsePairingCode(input: string): { url: string; anonKey: string } | null {
    if (!input) return null;
    let clean = input.trim();

    if (clean.includes('link_sync=')) {
      try {
        const urlObj = new URL(clean);
        const codeInParam = urlObj.searchParams.get('link_sync');
        if (codeInParam) clean = codeInParam;
      } catch {
        const match = clean.match(/link_sync=([^&#]+)/);
        if (match && match[1]) clean = decodeURIComponent(match[1]);
      }
    }

    if (clean.startsWith(PAIRING_PREFIX)) {
      clean = clean.slice(PAIRING_PREFIX.length);
    }

    try {
      const decodedJson = decodeURIComponent(escape(atob(clean)));
      const obj = JSON.parse(decodedJson);
      if (obj.u && obj.k) {
        return {
          url: obj.u,
          anonKey: obj.k,
        };
      }
    } catch (err) {
      console.warn('Failed to parse pairing code as JSON/base64:', err);
    }

    return null;
  }

  /**
   * Test Supabase connection
   */
  public async testConnection(url?: string, key?: string): Promise<{ success: boolean; message: string }> {
    const testUrl = (url || this.config.url).trim();
    const testKey = (key || this.config.anonKey).trim();

    if (!testUrl || !testKey) {
      return { success: false, message: 'URL dan Anon Key Supabase harus diisi.' };
    }

    try {
      const testClient = createClient(testUrl, testKey);
      const { error } = await testClient.from('store_settings').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        if (error.message?.includes('does not exist') || error.code === '42P01') {
          return {
            success: true,
            message: 'Terhubung ke server Supabase! Silakan jalankan Skrip SQL Skema untuk membuat tabel.',
          };
        }
        return { success: false, message: `Gagal query Supabase: ${error.message}` };
      }
      return { success: true, message: 'Koneksi ke server Supabase berhasil dan siap sinkronisasi real-time!' };
    } catch (err: any) {
      return { success: false, message: `Koneksi gagal: ${err.message || 'Periksa URL dan kunci API Anda.'}` };
    }
  }

  // =========================================================================
  // IMMEDIATE PUSH METHODS (Push mutation to Supabase & Broadcast to other devices)
  // =========================================================================

  /**
   * Push full store settings update to Supabase and broadcast live to other devices
   */
  public async pushStoreSettings(settings: StoreSettings): Promise<void> {
    if (!this.client) return;
    try {
      const payload: any = {
        id: 'store-main',
        store_name: settings.storeName,
        address: settings.address || '',
        city: settings.city || 'Kota',
        province: settings.province || 'Provinsi',
        postal_code: settings.postalCode || '',
        phone: settings.phone || '',
        whatsapp: settings.whatsapp || '',
        email: settings.email || '',
        website: settings.website || '',
        instagram: settings.instagram || '',
        facebook: settings.facebook || '',
        logo: settings.logo || '',
        slogan: settings.slogan || '',
        receipt_footer: settings.receiptFooter || '',
        owner_name: settings.ownerName || 'Owner',
        npwp: settings.npwp || '',
        currency_symbol: settings.currencySymbol || 'Rp',
        tax_rate: settings.taxRate || 0,
        enable_tax: !!settings.enableTax,
        enable_rounding: !!settings.enableRounding,
        business_type: settings.businessType || 'cafe',
        tables: JSON.stringify(settings.tables || []),
        wifi_name: settings.wifiName || '',
        wifi_password: settings.wifiPassword || '',
        raw_data: settings,
        updated_at: settings.updatedAt || new Date().toISOString(),
      };
      const { error } = await this.client.from('store_settings').upsert(payload, { onConflict: 'id' });
      if (error) {
        console.warn('Upsert full store_settings had notice, trying core fallback:', error.message);
        // Resilient fallback in case some optional columns are missing on remote table
        await this.client.from('store_settings').upsert({
          id: 'store-main',
          store_name: settings.storeName,
          address: settings.address || '',
          phone: settings.phone || '',
          logo: settings.logo || '',
          raw_data: settings,
          updated_at: settings.updatedAt || new Date().toISOString(),
        }, { onConflict: 'id' });
      }
      await this.broadcast('store_settings_updated', settings);
      this.dispatchLocalSync('store_settings', settings);
    } catch (e) {
      console.warn('Failed to push store settings:', e);
    }
  }

  /**
   * Push printer settings update to Supabase and broadcast
   */
  public async pushPrinterSettings(settings: PrinterSettings): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: 'printer-main',
        paper_size: settings.paperSize || '58mm',
        copies: settings.copies || 1,
        margin: settings.margin || 0,
        font_size: settings.fontSize || 'medium',
        show_logo: !!settings.showLogo,
        show_customer_name: !!settings.showCustomerName,
        show_wifi: !!settings.showWifi,
        show_wifi_password: !!settings.showWifiPassword,
        show_address: !!settings.showAddress,
        show_phone: !!settings.showPhone,
        show_email: !!settings.showEmail,
        show_website: !!settings.showWebsite,
        show_qr_code: !!settings.showQrCode,
        show_footer: !!settings.showFooter,
        show_thank_you: !!settings.showThankYou,
        default_printer_name: settings.defaultPrinterName || '',
        raw_data: settings,
        updated_at: new Date().toISOString(),
      };
      await this.client.from('printer_settings').upsert(payload, { onConflict: 'id' });
      await this.broadcast('printer_settings_updated', settings);
      this.dispatchLocalSync('printer_settings', settings);
    } catch (e) {
      console.warn('Failed to push printer settings:', e);
    }
  }

  /**
   * Push single product change to Supabase and broadcast
   */
  public async pushProduct(prod: Product): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: prod.id,
        sku: prod.sku || '',
        name: prod.name,
        image: prod.image || prod.imageUrl || '',
        barcode: prod.barcode || '',
        category_id: prod.categoryId || '',
        buy_price: prod.buyPrice || 0,
        sell_price: prod.sellPrice || 0,
        wholesale_price: prod.wholesalePrice || 0,
        cost_price: prod.hpp || 0,
        stock: prod.stock || 0,
        min_stock: prod.minStock || 0,
        unit: prod.unit || 'pcs',
        margin: prod.margin || 0,
        supplier_id: prod.supplierId || '',
        description: prod.description || '',
        addons: JSON.stringify(prod.addons || []),
        is_discount_active: !!prod.isDiscountActive,
        discount_type: prod.discountType || 'percent',
        discount_value: prod.discountValue || 0,
        enable_tax: prod.enableTax !== false,
        tax_rate: prod.taxRate || 11,
        is_active: prod.isActive !== false,
        has_recipe: !!prod.hasRecipe,
        recipe_id: prod.recipeId || '',
        raw_data: prod,
        updated_at: new Date().toISOString(),
      };
      await this.client.from('products').upsert(payload, { onConflict: 'id' });
      await this.broadcast('product_updated', prod);
      this.dispatchLocalSync('products', prod);
    } catch (e) {
      console.warn('Failed to push product:', e);
    }
  }

  /**
   * Delete product on Supabase and broadcast
   */
  public async deleteProduct(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('products').delete().eq('id', id);
      await this.broadcast('product_deleted', { id });
      this.dispatchLocalSync('products', { id });
    } catch (e) {
      console.warn('Failed to delete product on Supabase:', e);
    }
  }

  /**
   * Push category to Supabase and broadcast
   */
  public async pushCategory(cat: Category): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: cat.id,
        name: cat.name,
        icon: cat.icon || '',
        color: cat.color || '',
        description: cat.description || '',
        created_at: cat.createdAt,
      };
      await this.client.from('categories').upsert(payload, { onConflict: 'id' });
      await this.broadcast('category_updated', cat);
      this.dispatchLocalSync('categories', cat);
    } catch (e) {
      console.warn('Failed to push category:', e);
    }
  }

  /**
   * Delete category on Supabase and broadcast
   */
  public async deleteCategory(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('categories').delete().eq('id', id);
      await this.broadcast('category_deleted', { id });
      this.dispatchLocalSync('categories', { id });
    } catch (e) {
      console.warn('Failed to delete category:', e);
    }
  }

  /**
   * Push completed sale & items to Supabase and broadcast
   */
  public async pushSale(sale: Sale, items: SaleItem[], updatedProducts?: Product[]): Promise<void> {
    if (!this.client) return;
    try {
      const salePayload = {
        id: sale.id,
        invoice_number: sale.invoiceNumber,
        date: sale.date,
        time: sale.time || '',
        customer_id: sale.customerId || null,
        customer_name: sale.customerName || null,
        cashier_id: sale.cashierId || null,
        cashier_name: sale.cashierName || 'Kasir',
        subtotal: sale.subtotal || 0,
        discount: sale.discount || 0,
        tax: sale.tax || 0,
        service_fee: sale.serviceFee || 0,
        rounding: sale.rounding || 0,
        total: sale.total || 0,
        total_hpp: sale.totalHpp || 0,
        total_profit: sale.totalProfit || 0,
        profit_margin: sale.profitMargin || 0,
        payment_method: sale.paymentMethod || 'cash',
        cash_received: sale.cashReceived || 0,
        change_amount: sale.changeAmount || 0,
        order_type: sale.orderType || 'dine_in',
        table_number: sale.tableNumber || '',
        status: sale.status || 'completed',
        is_tester: !!sale.isTester,
        tester_reason: sale.testerReason || '',
        tax_rate: sale.taxRate || 0,
        notes: sale.notes || '',
        raw_data: sale,
        created_at: sale.createdAt,
      };
      await this.client.from('sales').upsert(salePayload, { onConflict: 'id' });

      if (items.length > 0) {
        const itemsPayload = items.map((item) => ({
          id: item.id,
          sale_id: item.saleId,
          product_id: item.productId,
          product_name: item.productName,
          barcode: item.barcode || '',
          unit: item.unit || 'pcs',
          quantity: item.quantity || 1,
          unit_buy_price: item.unitBuyPrice || 0,
          unit_hpp: item.unitHpp || 0,
          unit_sell_price: item.unitSellPrice || 0,
          subtotal: item.subtotal || 0,
          discount: item.discount || 0,
          profit: item.profit || 0,
          total: item.total || 0,
          notes: item.notes || '',
          modifiers: JSON.stringify(item.modifiers || []),
          selected_addons: JSON.stringify(item.selectedAddons || []),
        }));
        await this.client.from('sale_items').upsert(itemsPayload, { onConflict: 'id' });
      }

      // Update deducted product stocks on remote
      if (updatedProducts && updatedProducts.length > 0) {
        for (const p of updatedProducts) {
          await this.client.from('products').update({ stock: p.stock, updated_at: new Date().toISOString() }).eq('id', p.id);
        }
      }

      await this.broadcast('sale_created', { sale, items, updatedProducts });
      this.dispatchLocalSync('sales', { sale, items });
    } catch (e) {
      console.warn('Failed to push sale to Supabase:', e);
    }
  }

  /**
   * Push void sale to Supabase and broadcast
   */
  public async voidSale(saleId: string, restoredProducts?: Product[]): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('sales').update({ status: 'voided' }).eq('id', saleId);
      if (restoredProducts && restoredProducts.length > 0) {
        for (const p of restoredProducts) {
          await this.client.from('products').update({ stock: p.stock, updated_at: new Date().toISOString() }).eq('id', p.id);
        }
      }
      await this.broadcast('sale_voided', { saleId, restoredProducts });
      this.dispatchLocalSync('sales', { saleId });
    } catch (e) {
      console.warn('Failed to void sale on Supabase:', e);
    }
  }

  /**
   * Push expense to Supabase and broadcast
   */
  public async pushExpense(exp: Expense): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: exp.id,
        date: exp.date,
        category: exp.category,
        title: exp.title,
        amount: exp.amount || 0,
        notes: exp.notes || '',
        created_at: exp.createdAt,
      };
      await this.client.from('expenses').upsert(payload, { onConflict: 'id' });
      await this.broadcast('expense_updated', exp);
      this.dispatchLocalSync('expenses', exp);
    } catch (e) {
      console.warn('Failed to push expense:', e);
    }
  }

  /**
   * Delete expense on Supabase and broadcast
   */
  public async deleteExpense(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('expenses').delete().eq('id', id);
      await this.broadcast('expense_deleted', { id });
      this.dispatchLocalSync('expenses', { id });
    } catch (e) {
      console.warn('Failed to delete expense on Supabase:', e);
    }
  }

  /**
   * Push user to Supabase and broadcast
   */
  public async pushUser(user: User): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: user.id,
        name: user.name,
        pin: user.pin,
        role: user.role,
        phone: user.phone || '',
        is_active: user.isActive !== false,
        created_at: user.createdAt,
      };
      await this.client.from('users').upsert(payload, { onConflict: 'id' });
      await this.broadcast('user_updated', user);
      this.dispatchLocalSync('users', user);
    } catch (e) {
      console.warn('Failed to push user:', e);
    }
  }

  /**
   * Delete user on Supabase and broadcast
   */
  public async deleteUser(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('users').delete().eq('id', id);
      await this.broadcast('user_deleted', { id });
      this.dispatchLocalSync('users', { id });
    } catch (e) {
      console.warn('Failed to delete user:', e);
    }
  }

  /**
   * Push customer to Supabase and broadcast
   */
  public async pushCustomer(cust: Customer): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: cust.id,
        name: cust.name,
        phone: cust.phone || '',
        email: cust.email || '',
        address: cust.address || '',
        total_transactions: cust.totalTransactions || 0,
        total_spent: cust.totalSpent || 0,
        created_at: cust.createdAt,
      };
      await this.client.from('customers').upsert(payload, { onConflict: 'id' });
      await this.broadcast('customer_updated', cust);
      this.dispatchLocalSync('customers', cust);
    } catch (e) {
      console.warn('Failed to push customer:', e);
    }
  }

  /**
   * Delete customer on Supabase and broadcast
   */
  public async deleteCustomer(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('customers').delete().eq('id', id);
      await this.broadcast('customer_deleted', { id });
      this.dispatchLocalSync('customers', { id });
    } catch (e) {
      console.warn('Failed to delete customer:', e);
    }
  }

  /**
   * Push supplier to Supabase and broadcast
   */
  public async pushSupplier(supp: Supplier): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: supp.id,
        name: supp.name,
        phone: supp.phone || '',
        whatsapp: supp.whatsapp || '',
        email: supp.email || '',
        address: supp.address || '',
        notes: supp.notes || '',
        created_at: supp.createdAt,
      };
      await this.client.from('suppliers').upsert(payload, { onConflict: 'id' });
      await this.broadcast('supplier_updated', supp);
      this.dispatchLocalSync('suppliers', supp);
    } catch (e) {
      console.warn('Failed to push supplier:', e);
    }
  }

  /**
   * Delete supplier on Supabase and broadcast
   */
  public async deleteSupplier(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('suppliers').delete().eq('id', id);
      await this.broadcast('supplier_deleted', { id });
      this.dispatchLocalSync('suppliers', { id });
    } catch (e) {
      console.warn('Failed to delete supplier:', e);
    }
  }

  /**
   * Push ingredient (raw material) to Supabase and broadcast
   */
  public async pushIngredient(ing: Ingredient): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: ing.id,
        name: ing.name,
        category: ing.category,
        purchase_unit: ing.purchaseUnit,
        purchase_price: ing.purchasePrice || 0,
        purchase_unit_size: ing.purchaseUnitSize || 1,
        recipe_unit: ing.recipeUnit,
        conversion_factor: ing.conversionFactor || 1,
        cost_per_recipe_unit: ing.costPerRecipeUnit || 0,
        wastage_percent: ing.wastagePercent || 0,
        effective_cost_per_recipe_unit: ing.effectiveCostPerRecipeUnit || 0,
        current_stock: ing.currentStock || 0,
        min_stock: ing.minStock || 0,
        supplier_id: ing.supplierId || '',
        notes: ing.notes || '',
        updated_at: ing.updatedAt,
      };
      await this.client.from('ingredients').upsert(payload, { onConflict: 'id' });
      await this.broadcast('ingredient_updated', ing);
      this.dispatchLocalSync('ingredients', ing);
    } catch (e) {
      console.warn('Failed to push ingredient:', e);
    }
  }

  /**
   * Delete ingredient on Supabase and broadcast
   */
  public async deleteIngredient(id: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.from('ingredients').delete().eq('id', id);
      await this.broadcast('ingredient_deleted', { id });
      this.dispatchLocalSync('ingredients', { id });
    } catch (e) {
      console.warn('Failed to delete ingredient:', e);
    }
  }

  /**
   * Push recipe to Supabase and broadcast
   */
  public async pushRecipe(recipe: ProductRecipe): Promise<void> {
    if (!this.client) return;
    try {
      const payload = {
        id: recipe.id,
        product_id: recipe.productId,
        product_name: recipe.productName,
        items: JSON.stringify(recipe.items || []),
        packaging_cost: recipe.packagingCost || 0,
        labor_cost: recipe.laborCost || 0,
        utility_cost: recipe.utilityCost || 0,
        other_cost: recipe.otherCost || 0,
        total_ingredient_cost: recipe.totalIngredientCost || 0,
        total_hpp: recipe.totalHpp || 0,
        target_food_cost_percent: recipe.targetFoodCostPercent || 0,
        recommended_price: recipe.recommendedPrice || 0,
        actual_sell_price: recipe.actualSellPrice || 0,
        actual_food_cost_percent: recipe.actualFoodCostPercent || 0,
        actual_margin_percent: recipe.actualMarginPercent || 0,
        actual_profit: recipe.actualProfit || 0,
        notes: recipe.notes || '',
        raw_data: recipe,
        updated_at: recipe.updatedAt,
      };
      await this.client.from('recipes').upsert(payload, { onConflict: 'id' });
      await this.broadcast('recipe_updated', recipe);
      this.dispatchLocalSync('recipes', recipe);
    } catch (e) {
      console.warn('Failed to push recipe:', e);
    }
  }

  // =========================================================================
  // FULL TWO-WAY SYNC (Pull remote database & Push unsynced records)
  // =========================================================================

  public async sync(silent = false): Promise<{ success: boolean; message: string; count?: number }> {
    if (!this.client) {
      return { success: false, message: 'Supabase belum dikonfigurasi pada perangkat ini.' };
    }

    if (this.isSyncing) {
      return { success: false, message: 'Sinkronisasi sedang berlangsung...' };
    }

    this.isSyncing = true;
    if (!silent) this.notify();

    let totalSynced = 0;

    try {
      // 1. SYNC STORE SETTINGS (100% of fields, logo, wifi, tables, taxes, contact)
      const localStore = await db.store_settings.get('store-main');
      const { data: remoteStore } = await this.client.from('store_settings').select('*').limit(1);

      if (remoteStore && remoteStore.length > 0) {
        const rs = remoteStore[0];
        const raw = rs.raw_data || {};
        const localUpdatedAt = localStore?.updatedAt ? new Date(localStore.updatedAt).getTime() : 0;
        const remoteUpdatedAt = rs.updated_at ? new Date(rs.updated_at).getTime() : 0;

        if (localStore && localUpdatedAt > remoteUpdatedAt && localStore.storeName) {
          // Local store was modified more recently, push local settings to remote!
          await this.pushStoreSettings(localStore);
        } else {
          const updatedStore: StoreSettings = {
            id: 'store-main',
            storeName: rs.store_name || raw.storeName || localStore?.storeName || 'KasirKu POS',
            address: rs.address || raw.address || '',
            city: rs.city || raw.city || 'Kota',
            province: rs.province || raw.province || 'Provinsi',
            postalCode: rs.postal_code || raw.postalCode || '',
            phone: rs.phone || raw.phone || '',
            whatsapp: rs.whatsapp || raw.whatsapp || '',
            email: rs.email || raw.email || '',
            website: rs.website || raw.website || '',
            instagram: rs.instagram || raw.instagram || '',
            facebook: rs.facebook || raw.facebook || '',
            logo: rs.logo || raw.logo || localStore?.logo || undefined,
            slogan: rs.slogan || raw.slogan || '',
            receiptFooter: rs.receipt_footer || raw.receiptFooter || '',
            currencySymbol: rs.currency_symbol || raw.currencySymbol || 'Rp',
            ownerName: rs.owner_name || raw.ownerName || 'Owner',
            npwp: rs.npwp || raw.npwp || '',
            taxRate: Number(rs.tax_rate ?? raw.taxRate ?? 0),
            enableTax: rs.enable_tax !== undefined ? !!rs.enable_tax : !!raw.enableTax,
            enableRounding: rs.enable_rounding !== undefined ? !!rs.enable_rounding : (raw.enableRounding !== false),
            businessType: rs.business_type || raw.businessType || 'cafe',
            tables: rs.tables ? (typeof rs.tables === 'string' ? JSON.parse(rs.tables) : rs.tables) : (raw.tables || []),
            wifiName: rs.wifi_name || raw.wifiName || '',
            wifiPassword: rs.wifi_password || raw.wifiPassword || '',
            updatedAt: rs.updated_at || raw.updatedAt,
            isOnboarded: true,
          };
          await db.store_settings.put(updatedStore);
          this.dispatchLocalSync('store_settings', updatedStore);
        }
      } else if (localStore) {
        await this.pushStoreSettings(localStore);
      }

      // 2. SYNC PRINTER SETTINGS
      const localPrinter = await db.printer_settings.get('printer-main');
      const { data: remotePrinter } = await this.client.from('printer_settings').select('*').limit(1);

      if (remotePrinter && remotePrinter.length > 0) {
        const rp = remotePrinter[0];
        const raw = rp.raw_data || {};
        const updatedPrinter: PrinterSettings = {
          id: 'printer-main',
          paperSize: rp.paper_size || raw.paperSize || '58mm',
          copies: Number(rp.copies || raw.copies || 1),
          margin: Number(rp.margin || raw.margin || 0),
          fontSize: rp.font_size || raw.fontSize || 'medium',
          showLogo: rp.show_logo !== undefined ? !!rp.show_logo : !!raw.showLogo,
          showCustomerName: rp.show_customer_name !== undefined ? !!rp.show_customer_name : !!raw.showCustomerName,
          showWifi: rp.show_wifi !== undefined ? !!rp.show_wifi : !!raw.showWifi,
          showWifiPassword: rp.show_wifi_password !== undefined ? !!rp.show_wifi_password : !!raw.showWifiPassword,
          showAddress: rp.show_address !== undefined ? !!rp.show_address : (raw.showAddress !== false),
          showPhone: rp.show_phone !== undefined ? !!rp.show_phone : (raw.showPhone !== false),
          showEmail: rp.show_email !== undefined ? !!rp.show_email : !!raw.showEmail,
          showWebsite: rp.show_website !== undefined ? !!rp.show_website : !!raw.showWebsite,
          showQrCode: rp.show_qr_code !== undefined ? !!rp.show_qr_code : !!raw.showQrCode,
          showBarcode: false,
          showFooter: rp.show_footer !== undefined ? !!rp.show_footer : (raw.showFooter !== false),
          showThankYou: rp.show_thank_you !== undefined ? !!rp.show_thank_you : (raw.showThankYou !== false),
          showHpp: false,
          showProfit: false,
          autoCut: false,
          defaultPrinterName: rp.default_printer_name || raw.defaultPrinterName || '',
        };
        await db.printer_settings.put(updatedPrinter);
        this.dispatchLocalSync('printer_settings', updatedPrinter);
      } else if (localPrinter) {
        await this.pushPrinterSettings(localPrinter);
      }

      // 3. SYNC CATEGORIES
      const localCats = await db.categories.toArray();
      if (localCats.length > 0) {
        const catPayload = localCats.map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon || '',
          color: c.color || '',
          description: c.description || '',
          created_at: c.createdAt,
        }));
        await this.client.from('categories').upsert(catPayload, { onConflict: 'id' });
      }

      const { data: remoteCats } = await this.client.from('categories').select('*');
      if (remoteCats && remoteCats.length > 0) {
        for (const rc of remoteCats) {
          await db.categories.put({
            id: rc.id,
            name: rc.name,
            icon: rc.icon,
            color: rc.color,
            description: rc.description,
            createdAt: rc.created_at || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('categories');
      }

      // 4. SYNC PRODUCTS (Complete catalog, photos, HPP, prices, recipes, addons)
      const localProducts = await db.products.toArray();
      if (localProducts.length > 0) {
        const prodPayload = localProducts.map((p) => ({
          id: p.id,
          sku: p.sku || '',
          name: p.name,
          image: p.image || p.imageUrl || '',
          barcode: p.barcode || '',
          category_id: p.categoryId || '',
          buy_price: p.buyPrice || 0,
          sell_price: p.sellPrice || 0,
          wholesale_price: p.wholesalePrice || 0,
          cost_price: p.hpp || 0,
          stock: p.stock || 0,
          min_stock: p.minStock || 0,
          unit: p.unit || 'pcs',
          margin: p.margin || 0,
          supplier_id: p.supplierId || '',
          description: p.description || '',
          addons: JSON.stringify(p.addons || []),
          is_discount_active: !!p.isDiscountActive,
          discount_type: p.discountType || 'percent',
          discount_value: p.discountValue || 0,
          enable_tax: p.enableTax !== false,
          tax_rate: p.taxRate || 11,
          is_active: p.isActive !== false,
          has_recipe: !!p.hasRecipe,
          recipe_id: p.recipeId || '',
          raw_data: p,
          updated_at: p.updatedAt || new Date().toISOString(),
        }));
        await this.client.from('products').upsert(prodPayload, { onConflict: 'id' });
        totalSynced += localProducts.length;
      }

      const { data: remoteProducts } = await this.client.from('products').select('*');
      if (remoteProducts && remoteProducts.length > 0) {
        for (const rp of remoteProducts) {
          const raw = rp.raw_data || {};
          const buyPrice = Number(rp.buy_price ?? raw.buyPrice ?? 0);
          const sellPrice = Number(rp.sell_price ?? raw.sellPrice ?? 0);
          const hpp = Number(rp.cost_price ?? raw.hpp ?? rp.buy_price ?? 0);
          const margin = sellPrice > 0 ? Math.round(((sellPrice - hpp) / sellPrice) * 100) : 0;
          let parsedAddons = raw.addons || [];
          if (rp.addons && typeof rp.addons === 'string') {
            try { parsedAddons = JSON.parse(rp.addons); } catch {}
          }

          await db.products.put({
            id: rp.id,
            sku: rp.sku || raw.sku || '',
            name: rp.name,
            image: rp.image || raw.image || raw.imageUrl || '',
            imageUrl: rp.image || raw.imageUrl || raw.image || '',
            barcode: rp.barcode || raw.barcode || '',
            categoryId: rp.category_id || raw.categoryId || '',
            buyPrice,
            sellPrice,
            wholesalePrice: Number(rp.wholesale_price ?? raw.wholesalePrice ?? 0),
            hpp,
            stock: Number(rp.stock ?? raw.stock ?? 0),
            minStock: Number(rp.min_stock ?? raw.minStock ?? 0),
            unit: rp.unit || raw.unit || 'pcs',
            margin,
            supplierId: rp.supplier_id || raw.supplierId || '',
            description: rp.description || raw.description || '',
            addons: parsedAddons,
            isDiscountActive: rp.is_discount_active !== undefined ? !!rp.is_discount_active : !!raw.isDiscountActive,
            discountType: rp.discount_type || raw.discountType || 'percent',
            discountValue: Number(rp.discount_value ?? raw.discountValue ?? 0),
            enableTax: rp.enable_tax !== undefined ? !!rp.enable_tax : (raw.enableTax !== false),
            taxRate: Number(rp.tax_rate ?? raw.taxRate ?? 11),
            isActive: rp.is_active !== false && raw.isActive !== false,
            hasRecipe: rp.has_recipe === true || raw.hasRecipe === true,
            recipeId: rp.recipe_id || raw.recipeId || undefined,
            createdAt: rp.created_at || raw.createdAt || new Date().toISOString(),
            updatedAt: rp.updated_at || raw.updatedAt || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('products');
      }

      // 5. SYNC SALES & SALE ITEMS
      const localSales = await db.sales.toArray();
      if (localSales.length > 0) {
        const salesPayload = localSales.map((s) => ({
          id: s.id,
          invoice_number: s.invoiceNumber,
          date: s.date,
          time: s.time || '',
          customer_id: s.customerId || null,
          customer_name: s.customerName || null,
          cashier_id: s.cashierId || null,
          cashier_name: s.cashierName || 'Kasir',
          subtotal: s.subtotal || 0,
          discount: s.discount || 0,
          tax: s.tax || 0,
          service_fee: s.serviceFee || 0,
          rounding: s.rounding || 0,
          total: s.total || 0,
          total_hpp: s.totalHpp || 0,
          total_profit: s.totalProfit || 0,
          profit_margin: s.profitMargin || 0,
          payment_method: s.paymentMethod || 'cash',
          cash_received: s.cashReceived || 0,
          change_amount: s.changeAmount || 0,
          order_type: s.orderType || 'dine_in',
          table_number: s.tableNumber || '',
          status: s.status || 'completed',
          is_tester: !!s.isTester,
          tester_reason: s.testerReason || '',
          tax_rate: s.taxRate || 0,
          notes: s.notes || '',
          raw_data: s,
          created_at: s.createdAt,
        }));
        await this.client.from('sales').upsert(salesPayload, { onConflict: 'id' });
        totalSynced += localSales.length;
      }

      const localItems = await db.sale_items.toArray();
      if (localItems.length > 0) {
        const itemsPayload = localItems.map((item) => ({
          id: item.id,
          sale_id: item.saleId,
          product_id: item.productId,
          product_name: item.productName,
          barcode: item.barcode || '',
          unit: item.unit || 'pcs',
          quantity: item.quantity || 1,
          unit_buy_price: item.unitBuyPrice || 0,
          unit_hpp: item.unitHpp || 0,
          unit_sell_price: item.unitSellPrice || 0,
          subtotal: item.subtotal || 0,
          discount: item.discount || 0,
          profit: item.profit || 0,
          total: item.total || 0,
          notes: item.notes || '',
          modifiers: JSON.stringify(item.modifiers || []),
          selected_addons: JSON.stringify(item.selectedAddons || []),
        }));
        await this.client.from('sale_items').upsert(itemsPayload, { onConflict: 'id' });
      }

      const { data: remoteSales } = await this.client.from('sales').select('*');
      if (remoteSales && remoteSales.length > 0) {
        for (const rs of remoteSales) {
          await db.sales.put({
            id: rs.id,
            invoiceNumber: rs.invoice_number,
            date: rs.date || rs.created_at?.slice(0, 10),
            time: rs.time || '',
            customerId: rs.customer_id,
            customerName: rs.customer_name,
            cashierId: rs.cashier_id,
            cashierName: rs.cashier_name,
            subtotal: Number(rs.subtotal) || 0,
            discount: Number(rs.discount) || 0,
            tax: Number(rs.tax) || 0,
            serviceFee: Number(rs.service_fee) || 0,
            rounding: Number(rs.rounding) || 0,
            total: Number(rs.total) || 0,
            totalHpp: Number(rs.total_hpp) || 0,
            totalProfit: Number(rs.total_profit) || 0,
            profitMargin: Number(rs.profit_margin) || 0,
            paymentMethod: (rs.payment_method || 'cash') as PaymentMethod,
            cashReceived: Number(rs.cash_received || rs.pay_amount) || 0,
            changeAmount: Number(rs.change_amount) || 0,
            orderType: (rs.order_type || 'dine_in') as OrderType,
            tableNumber: rs.table_number || '',
            status: (rs.status || 'completed') as SaleStatus,
            isTester: !!rs.is_tester,
            testerReason: rs.tester_reason || undefined,
            taxRate: Number(rs.tax_rate) || 0,
            notes: rs.notes || '',
            createdAt: rs.created_at,
          });
        }
      }

      const { data: remoteSaleItems } = await this.client.from('sale_items').select('*');
      if (remoteSaleItems && remoteSaleItems.length > 0) {
        for (const rsi of remoteSaleItems) {
          let parsedAddons = undefined;
          let parsedModifiers = undefined;
          if (rsi.selected_addons) {
            try { parsedAddons = JSON.parse(rsi.selected_addons); } catch {}
          }
          if (rsi.modifiers) {
            try { parsedModifiers = JSON.parse(rsi.modifiers); } catch {}
          }

          await db.sale_items.put({
            id: rsi.id,
            saleId: rsi.sale_id,
            productId: rsi.product_id,
            productName: rsi.product_name,
            barcode: rsi.barcode || '',
            unit: rsi.unit || 'pcs',
            quantity: Number(rsi.quantity || rsi.qty) || 1,
            unitBuyPrice: Number(rsi.unit_buy_price) || 0,
            unitHpp: Number(rsi.unit_hpp || rsi.cost_price) || 0,
            unitSellPrice: Number(rsi.unit_sell_price || rsi.price) || 0,
            subtotal: Number(rsi.subtotal) || 0,
            discount: Number(rsi.discount) || 0,
            profit: Number(rsi.profit) || 0,
            total: Number(rsi.total) || 0,
            notes: rsi.notes || undefined,
            modifiers: parsedModifiers,
            selectedAddons: parsedAddons,
          });
        }
        this.dispatchLocalSync('sales');
      }

      // 6. SYNC EXPENSES
      const localExpenses = await db.expenses.toArray();
      if (localExpenses.length > 0) {
        const expPayload = localExpenses.map((e) => ({
          id: e.id,
          date: e.date,
          category: e.category,
          title: e.title || '',
          amount: e.amount || 0,
          notes: e.notes || '',
          created_at: e.createdAt,
        }));
        await this.client.from('expenses').upsert(expPayload, { onConflict: 'id' });
        totalSynced += localExpenses.length;
      }

      const { data: remoteExpenses } = await this.client.from('expenses').select('*');
      if (remoteExpenses && remoteExpenses.length > 0) {
        for (const re of remoteExpenses) {
          await db.expenses.put({
            id: re.id,
            date: re.date,
            category: (re.category || 'operasional') as ExpenseCategory,
            title: re.title || re.description || 'Pengeluaran',
            amount: Number(re.amount) || 0,
            notes: re.notes || '',
            createdAt: re.created_at,
          });
        }
        this.dispatchLocalSync('expenses');
      }

      // 7. SYNC USERS
      const localUsers = await db.users.toArray();
      if (localUsers.length > 0) {
        const usersPayload = localUsers.map((u) => ({
          id: u.id,
          name: u.name,
          pin: u.pin,
          role: u.role,
          phone: u.phone || '',
          is_active: u.isActive !== false,
          created_at: u.createdAt,
        }));
        await this.client.from('users').upsert(usersPayload, { onConflict: 'id' });
      }

      const { data: remoteUsers } = await this.client.from('users').select('*');
      if (remoteUsers && remoteUsers.length > 0) {
        for (const ru of remoteUsers) {
          await db.users.put({
            id: ru.id,
            name: ru.name,
            pin: ru.pin,
            role: (ru.role || 'cashier') as UserRole,
            phone: ru.phone || '',
            isActive: ru.is_active !== false,
            createdAt: ru.created_at || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('users');
      }

      // 8. SYNC CUSTOMERS & SUPPLIERS
      const localCusts = await db.customers.toArray();
      if (localCusts.length > 0) {
        const custPayload = localCusts.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone || '',
          email: c.email || '',
          address: c.address || '',
          total_transactions: c.totalTransactions || 0,
          total_spent: c.totalSpent || 0,
          created_at: c.createdAt,
        }));
        await this.client.from('customers').upsert(custPayload, { onConflict: 'id' });
      }

      const { data: remoteCusts } = await this.client.from('customers').select('*');
      if (remoteCusts && remoteCusts.length > 0) {
        for (const rc of remoteCusts) {
          await db.customers.put({
            id: rc.id,
            name: rc.name,
            phone: rc.phone || '',
            email: rc.email || '',
            address: rc.address || '',
            totalTransactions: Number(rc.total_transactions) || 0,
            totalSpent: Number(rc.total_spent) || 0,
            createdAt: rc.created_at || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('customers');
      }

      const localSupps = await db.suppliers.toArray();
      if (localSupps.length > 0) {
        const suppPayload = localSupps.map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone || '',
          whatsapp: s.whatsapp || '',
          email: s.email || '',
          address: s.address || '',
          notes: s.notes || '',
          created_at: s.createdAt,
        }));
        await this.client.from('suppliers').upsert(suppPayload, { onConflict: 'id' });
      }

      const { data: remoteSupps } = await this.client.from('suppliers').select('*');
      if (remoteSupps && remoteSupps.length > 0) {
        for (const rs of remoteSupps) {
          await db.suppliers.put({
            id: rs.id,
            name: rs.name,
            phone: rs.phone || '',
            whatsapp: rs.whatsapp || '',
            email: rs.email || '',
            address: rs.address || '',
            notes: rs.notes || '',
            createdAt: rs.created_at || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('suppliers');
      }

      // 9. SYNC INGREDIENTS & RECIPES (F&B / Cafe HPP)
      const localIngs = await db.ingredients.toArray();
      if (localIngs.length > 0) {
        const ingPayload = localIngs.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          purchase_unit: i.purchaseUnit,
          purchase_price: i.purchasePrice || 0,
          purchase_unit_size: i.purchaseUnitSize || 1,
          recipe_unit: i.recipeUnit,
          conversion_factor: i.conversionFactor || 1,
          cost_per_recipe_unit: i.costPerRecipeUnit || 0,
          wastage_percent: i.wastagePercent || 0,
          effective_cost_per_recipe_unit: i.effectiveCostPerRecipeUnit || 0,
          current_stock: i.currentStock || 0,
          min_stock: i.minStock || 0,
          supplier_id: i.supplierId || '',
          notes: i.notes || '',
          updated_at: i.updatedAt,
        }));
        await this.client.from('ingredients').upsert(ingPayload, { onConflict: 'id' });
      }

      const { data: remoteIngs } = await this.client.from('ingredients').select('*');
      if (remoteIngs && remoteIngs.length > 0) {
        for (const ri of remoteIngs) {
          await db.ingredients.put({
            id: ri.id,
            name: ri.name,
            category: (ri.category || 'lainnya') as IngredientCategory,
            purchaseUnit: ri.purchase_unit || 'kg',
            purchasePrice: Number(ri.purchase_price) || 0,
            purchaseUnitSize: Number(ri.purchase_unit_size) || 1,
            recipeUnit: ri.recipe_unit || 'gram',
            conversionFactor: Number(ri.conversion_factor) || 1,
            costPerRecipeUnit: Number(ri.cost_per_recipe_unit) || 0,
            wastagePercent: Number(ri.wastage_percent) || 0,
            effectiveCostPerRecipeUnit: Number(ri.effective_cost_per_recipe_unit) || 0,
            currentStock: Number(ri.current_stock) || 0,
            minStock: Number(ri.min_stock) || 0,
            supplierId: ri.supplier_id || undefined,
            notes: ri.notes || '',
            updatedAt: ri.updated_at || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('ingredients');
      }

      const localRecipes = await db.recipes.toArray();
      if (localRecipes.length > 0) {
        const recipePayload = localRecipes.map((r) => ({
          id: r.id,
          product_id: r.productId,
          product_name: r.productName,
          items: JSON.stringify(r.items || []),
          packaging_cost: r.packagingCost || 0,
          labor_cost: r.laborCost || 0,
          utility_cost: r.utilityCost || 0,
          other_cost: r.otherCost || 0,
          total_ingredient_cost: r.totalIngredientCost || 0,
          total_hpp: r.totalHpp || 0,
          target_food_cost_percent: r.targetFoodCostPercent || 0,
          recommended_price: r.recommendedPrice || 0,
          actual_sell_price: r.actualSellPrice || 0,
          actual_food_cost_percent: r.actualFoodCostPercent || 0,
          actual_margin_percent: r.actualMarginPercent || 0,
          actual_profit: r.actualProfit || 0,
          notes: r.notes || '',
          raw_data: r,
          updated_at: r.updatedAt,
        }));
        await this.client.from('recipes').upsert(recipePayload, { onConflict: 'id' });
      }

      const { data: remoteRecipes } = await this.client.from('recipes').select('*');
      if (remoteRecipes && remoteRecipes.length > 0) {
        for (const rr of remoteRecipes) {
          let parsedItems = [];
          if (rr.items) {
            try { parsedItems = typeof rr.items === 'string' ? JSON.parse(rr.items) : rr.items; } catch {}
          }
          await db.recipes.put({
            id: rr.id,
            productId: rr.product_id,
            productName: rr.product_name,
            items: parsedItems,
            packagingCost: Number(rr.packaging_cost) || 0,
            laborCost: Number(rr.labor_cost) || 0,
            utilityCost: Number(rr.utility_cost) || 0,
            otherCost: Number(rr.other_cost) || 0,
            totalIngredientCost: Number(rr.total_ingredient_cost) || 0,
            totalHpp: Number(rr.total_hpp) || 0,
            targetFoodCostPercent: Number(rr.target_food_cost_percent) || 0,
            recommendedPrice: Number(rr.recommended_price) || 0,
            actualSellPrice: Number(rr.actual_sell_price) || 0,
            actualFoodCostPercent: Number(rr.actual_food_cost_percent) || 0,
            actualMarginPercent: Number(rr.actual_margin_percent) || 0,
            actualProfit: Number(rr.actual_profit) || 0,
            notes: rr.notes || '',
            updatedAt: rr.updated_at || new Date().toISOString(),
          });
        }
        this.dispatchLocalSync('recipes');
      }

      // Update sync state
      const now = new Date().toISOString();
      this.config.lastSyncedAt = now;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));

      this.isSyncing = false;
      this.notify(null);
      this.dispatchLocalSync('all');

      return {
        success: true,
        message: 'Seluruh data toko (pengaturan toko, printer, produk, transaksi, resep) tersinkronisasi 100%!',
        count: totalSynced,
      };
    } catch (err: any) {
      this.isSyncing = false;
      this.notify(err.message || 'Sinkronisasi gagal.');
      return { success: false, message: `Sinkronisasi gagal: ${err.message || 'Terjadi gangguan jaringan'}` };
    }
  }

  // =========================================================================
  // REAL-TIME ENGINE (Broadcast WebSocket + Postgres Changes)
  // =========================================================================

  public initRealtime() {
    if (!this.client) return;

    if (this.realtimeChannel) {
      try {
        this.client.removeChannel(this.realtimeChannel);
      } catch {}
      this.realtimeChannel = null;
    }

    try {
      this.realtimeChannel = this.client.channel(BROADCAST_CHANNEL, {
        config: {
          broadcast: { self: false },
        },
      });

      // 1. BROADCAST LISTENERS (<50ms peer-to-peer over WebSocket)
      this.realtimeChannel
        .on('broadcast', { event: 'store_settings_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.store_settings.put(payload);
            this.dispatchLocalSync('store_settings', payload);
          }
        })
        .on('broadcast', { event: 'printer_settings_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.printer_settings.put(payload);
            this.dispatchLocalSync('printer_settings', payload);
          }
        })
        .on('broadcast', { event: 'sale_created' }, async ({ payload }: any) => {
          if (payload) {
            if (payload.sale) await db.sales.put(payload.sale);
            if (payload.items) await db.sale_items.bulkPut(payload.items);
            if (payload.updatedProducts) {
              for (const p of payload.updatedProducts) {
                await db.products.update(p.id, { stock: p.stock });
              }
            }
            this.dispatchLocalSync('sales', payload);
            this.dispatchLocalSync('products');
          }
        })
        .on('broadcast', { event: 'sale_voided' }, async ({ payload }: any) => {
          if (payload && payload.saleId) {
            await db.sales.update(payload.saleId, { status: 'voided' });
            if (payload.restoredProducts) {
              for (const p of payload.restoredProducts) {
                await db.products.update(p.id, { stock: p.stock });
              }
            }
            this.dispatchLocalSync('sales', payload);
            this.dispatchLocalSync('products');
          }
        })
        .on('broadcast', { event: 'product_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.products.put(payload);
            this.dispatchLocalSync('products', payload);
          }
        })
        .on('broadcast', { event: 'product_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.products.delete(payload.id);
            this.dispatchLocalSync('products', payload);
          }
        })
        .on('broadcast', { event: 'category_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.categories.put(payload);
            this.dispatchLocalSync('categories', payload);
          }
        })
        .on('broadcast', { event: 'category_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.categories.delete(payload.id);
            this.dispatchLocalSync('categories', payload);
          }
        })
        .on('broadcast', { event: 'expense_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.expenses.put(payload);
            this.dispatchLocalSync('expenses', payload);
          }
        })
        .on('broadcast', { event: 'expense_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.expenses.delete(payload.id);
            this.dispatchLocalSync('expenses', payload);
          }
        })
        .on('broadcast', { event: 'user_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.users.put(payload);
            this.dispatchLocalSync('users', payload);
          }
        })
        .on('broadcast', { event: 'user_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.users.delete(payload.id);
            this.dispatchLocalSync('users', payload);
          }
        })
        .on('broadcast', { event: 'customer_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.customers.put(payload);
            this.dispatchLocalSync('customers', payload);
          }
        })
        .on('broadcast', { event: 'customer_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.customers.delete(payload.id);
            this.dispatchLocalSync('customers', payload);
          }
        })
        .on('broadcast', { event: 'supplier_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.suppliers.put(payload);
            this.dispatchLocalSync('suppliers', payload);
          }
        })
        .on('broadcast', { event: 'supplier_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.suppliers.delete(payload.id);
            this.dispatchLocalSync('suppliers', payload);
          }
        })
        .on('broadcast', { event: 'ingredient_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.ingredients.put(payload);
            this.dispatchLocalSync('ingredients', payload);
          }
        })
        .on('broadcast', { event: 'ingredient_deleted' }, async ({ payload }: any) => {
          if (payload && payload.id) {
            await db.ingredients.delete(payload.id);
            this.dispatchLocalSync('ingredients', payload);
          }
        })
        .on('broadcast', { event: 'recipe_updated' }, async ({ payload }: any) => {
          if (payload) {
            await db.recipes.put(payload);
            this.dispatchLocalSync('recipes', payload);
          }
        });

      // 2. POSTGRES REPLICATION LISTENERS (External DB updates)
      this.realtimeChannel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, async (payload: any) => {
          if (payload.new && payload.new.id) {
            const rs = payload.new;
            const raw = rs.raw_data || {};
            const updated: StoreSettings = {
              id: 'store-main',
              storeName: rs.store_name || raw.storeName || 'KasirKu POS',
              address: rs.address || raw.address || '',
              city: rs.city || raw.city || 'Kota',
              province: rs.province || raw.province || 'Provinsi',
              postalCode: rs.postal_code || raw.postalCode || '',
              phone: rs.phone || raw.phone || '',
              whatsapp: rs.whatsapp || raw.whatsapp || '',
              email: rs.email || raw.email || '',
              website: rs.website || raw.website || '',
              instagram: rs.instagram || raw.instagram || '',
              facebook: rs.facebook || raw.facebook || '',
              logo: rs.logo || raw.logo || undefined,
              slogan: rs.slogan || raw.slogan || '',
              receiptFooter: rs.receipt_footer || raw.receiptFooter || '',
              currencySymbol: rs.currency_symbol || raw.currencySymbol || 'Rp',
              ownerName: rs.owner_name || raw.ownerName || 'Owner',
              npwp: rs.npwp || raw.npwp || '',
              taxRate: Number(rs.tax_rate ?? raw.taxRate ?? 0),
              enableTax: rs.enable_tax !== undefined ? !!rs.enable_tax : !!raw.enableTax,
              enableRounding: rs.enable_rounding !== undefined ? !!rs.enable_rounding : (raw.enableRounding !== false),
              businessType: rs.business_type || raw.businessType || 'cafe',
              tables: rs.tables ? (typeof rs.tables === 'string' ? JSON.parse(rs.tables) : rs.tables) : (raw.tables || []),
              wifiName: rs.wifi_name || raw.wifiName || '',
              wifiPassword: rs.wifi_password || raw.wifiPassword || '',
              isOnboarded: true,
            };
            await db.store_settings.put(updated);
            this.dispatchLocalSync('store_settings', updated);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'printer_settings' }, async (payload: any) => {
          if (payload.new && payload.new.id) {
            const rp = payload.new;
            const raw = rp.raw_data || {};
            const updated: PrinterSettings = {
              id: 'printer-main',
              paperSize: rp.paper_size || raw.paperSize || '58mm',
              copies: Number(rp.copies || raw.copies || 1),
              margin: Number(rp.margin || raw.margin || 0),
              fontSize: rp.font_size || raw.fontSize || 'medium',
              showLogo: rp.show_logo !== undefined ? !!rp.show_logo : !!raw.showLogo,
              showCustomerName: rp.show_customer_name !== undefined ? !!rp.show_customer_name : !!raw.showCustomerName,
              showWifi: rp.show_wifi !== undefined ? !!rp.show_wifi : !!raw.showWifi,
              showWifiPassword: rp.show_wifi_password !== undefined ? !!rp.show_wifi_password : !!raw.showWifiPassword,
              showAddress: rp.show_address !== undefined ? !!rp.show_address : (raw.showAddress !== false),
              showPhone: rp.show_phone !== undefined ? !!rp.show_phone : (raw.showPhone !== false),
              showEmail: rp.show_email !== undefined ? !!rp.show_email : !!raw.showEmail,
              showWebsite: rp.show_website !== undefined ? !!rp.show_website : !!raw.showWebsite,
              showQrCode: rp.show_qr_code !== undefined ? !!rp.show_qr_code : !!raw.showQrCode,
              showBarcode: false,
              showFooter: rp.show_footer !== undefined ? !!rp.show_footer : (raw.showFooter !== false),
              showThankYou: rp.show_thank_you !== undefined ? !!rp.show_thank_you : (raw.showThankYou !== false),
              showHpp: false,
              showProfit: false,
              autoCut: false,
              defaultPrinterName: rp.default_printer_name || raw.defaultPrinterName || '',
            };
            await db.printer_settings.put(updated);
            this.dispatchLocalSync('printer_settings', updated);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async (payload: any) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            await db.products.delete(payload.old.id);
            this.dispatchLocalSync('products', payload.old);
          } else if (payload.new && payload.new.id) {
            const rp = payload.new;
            const raw = rp.raw_data || {};
            const buyPrice = Number(rp.buy_price ?? raw.buyPrice ?? 0);
            const sellPrice = Number(rp.sell_price ?? raw.sellPrice ?? 0);
            const hpp = Number(rp.cost_price ?? raw.hpp ?? rp.buy_price ?? 0);
            const margin = sellPrice > 0 ? Math.round(((sellPrice - hpp) / sellPrice) * 100) : 0;
            let parsedAddons = raw.addons || [];
            if (rp.addons && typeof rp.addons === 'string') {
              try { parsedAddons = JSON.parse(rp.addons); } catch {}
            }

            await db.products.put({
              id: rp.id,
              sku: rp.sku || raw.sku || '',
              name: rp.name,
              image: rp.image || raw.image || raw.imageUrl || '',
              imageUrl: rp.image || raw.imageUrl || raw.image || '',
              barcode: rp.barcode || raw.barcode || '',
              categoryId: rp.category_id || raw.categoryId || '',
              buyPrice,
              sellPrice,
              wholesalePrice: Number(rp.wholesale_price ?? raw.wholesalePrice ?? 0),
              hpp,
              stock: Number(rp.stock ?? raw.stock ?? 0),
              minStock: Number(rp.min_stock ?? raw.minStock ?? 0),
              unit: rp.unit || raw.unit || 'pcs',
              margin,
              supplierId: rp.supplier_id || raw.supplierId || '',
              description: rp.description || raw.description || '',
              addons: parsedAddons,
              isDiscountActive: rp.is_discount_active !== undefined ? !!rp.is_discount_active : !!raw.isDiscountActive,
              discountType: rp.discount_type || raw.discountType || 'percent',
              discountValue: Number(rp.discount_value ?? raw.discountValue ?? 0),
              enableTax: rp.enable_tax !== undefined ? !!rp.enable_tax : (raw.enableTax !== false),
              taxRate: Number(rp.tax_rate ?? raw.taxRate ?? 11),
              isActive: rp.is_active !== false && raw.isActive !== false,
              hasRecipe: rp.has_recipe === true || raw.hasRecipe === true,
              recipeId: rp.recipe_id || raw.recipeId || undefined,
              createdAt: rp.created_at || raw.createdAt || new Date().toISOString(),
              updatedAt: rp.updated_at || raw.updatedAt || new Date().toISOString(),
            });
            this.dispatchLocalSync('products', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, async (payload: any) => {
          if (payload.new && payload.new.id) {
            const rs = payload.new;
            await db.sales.put({
              id: rs.id,
              invoiceNumber: rs.invoice_number,
              date: rs.date || rs.created_at?.slice(0, 10),
              time: rs.time || '',
              customerId: rs.customer_id,
              customerName: rs.customer_name,
              cashierId: rs.cashier_id,
              cashierName: rs.cashier_name,
              subtotal: Number(rs.subtotal) || 0,
              discount: Number(rs.discount) || 0,
              tax: Number(rs.tax) || 0,
              serviceFee: Number(rs.service_fee) || 0,
              rounding: Number(rs.rounding) || 0,
              total: Number(rs.total) || 0,
              totalHpp: Number(rs.total_hpp) || 0,
              totalProfit: Number(rs.total_profit) || 0,
              profitMargin: Number(rs.profit_margin) || 0,
              paymentMethod: (rs.payment_method || 'cash') as PaymentMethod,
              cashReceived: Number(rs.cash_received || rs.pay_amount) || 0,
              changeAmount: Number(rs.change_amount) || 0,
              orderType: (rs.order_type || 'dine_in') as OrderType,
              tableNumber: rs.table_number || '',
              status: (rs.status || 'completed') as SaleStatus,
              isTester: !!rs.is_tester,
              testerReason: rs.tester_reason || undefined,
              taxRate: Number(rs.tax_rate) || 0,
              notes: rs.notes || '',
              createdAt: rs.created_at,
            });
            this.dispatchLocalSync('sales', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, async (payload: any) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            await db.expenses.delete(payload.old.id);
            this.dispatchLocalSync('expenses', payload.old);
          } else if (payload.new && payload.new.id) {
            const re = payload.new;
            await db.expenses.put({
              id: re.id,
              date: re.date,
              category: (re.category || 'operasional') as ExpenseCategory,
              title: re.title || re.description || 'Pengeluaran',
              amount: Number(re.amount) || 0,
              notes: re.notes || '',
              createdAt: re.created_at,
            });
            this.dispatchLocalSync('expenses', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, async (payload: any) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            await db.users.delete(payload.old.id);
            this.dispatchLocalSync('users', payload.old);
          } else if (payload.new && payload.new.id) {
            const ru = payload.new;
            await db.users.put({
              id: ru.id,
              name: ru.name,
              pin: ru.pin,
              role: (ru.role || 'cashier') as UserRole,
              phone: ru.phone || '',
              isActive: ru.is_active !== false,
              createdAt: ru.created_at || new Date().toISOString(),
            });
            this.dispatchLocalSync('users', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, async (payload: any) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            await db.customers.delete(payload.old.id);
            this.dispatchLocalSync('customers', payload.old);
          } else if (payload.new && payload.new.id) {
            const rc = payload.new;
            await db.customers.put({
              id: rc.id,
              name: rc.name,
              phone: rc.phone || '',
              email: rc.email || '',
              address: rc.address || '',
              totalTransactions: Number(rc.total_transactions) || 0,
              totalSpent: Number(rc.total_spent) || 0,
              createdAt: rc.created_at || new Date().toISOString(),
            });
            this.dispatchLocalSync('customers', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, async (payload: any) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            await db.suppliers.delete(payload.old.id);
            this.dispatchLocalSync('suppliers', payload.old);
          } else if (payload.new && payload.new.id) {
            const rs = payload.new;
            await db.suppliers.put({
              id: rs.id,
              name: rs.name,
              phone: rs.phone || '',
              whatsapp: rs.whatsapp || '',
              email: rs.email || '',
              address: rs.address || '',
              notes: rs.notes || '',
              createdAt: rs.created_at || new Date().toISOString(),
            });
            this.dispatchLocalSync('suppliers', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, async (payload: any) => {
          if (payload.eventType === 'DELETE' && payload.old?.id) {
            await db.ingredients.delete(payload.old.id);
            this.dispatchLocalSync('ingredients', payload.old);
          } else if (payload.new && payload.new.id) {
            const ri = payload.new;
            await db.ingredients.put({
              id: ri.id,
              name: ri.name,
              category: (ri.category || 'lainnya') as IngredientCategory,
              purchaseUnit: ri.purchase_unit || 'kg',
              purchasePrice: Number(ri.purchase_price) || 0,
              purchaseUnitSize: Number(ri.purchase_unit_size) || 1,
              recipeUnit: ri.recipe_unit || 'gram',
              conversionFactor: Number(ri.conversion_factor) || 1,
              costPerRecipeUnit: Number(ri.cost_per_recipe_unit) || 0,
              wastagePercent: Number(ri.wastage_percent) || 0,
              effectiveCostPerRecipeUnit: Number(ri.effective_cost_per_recipe_unit) || 0,
              currentStock: Number(ri.current_stock) || 0,
              minStock: Number(ri.min_stock) || 0,
              supplierId: ri.supplier_id || undefined,
              notes: ri.notes || '',
              updatedAt: ri.updated_at || new Date().toISOString(),
            });
            this.dispatchLocalSync('ingredients', payload.new);
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, async (payload: any) => {
          if (payload.new && payload.new.id) {
            const rr = payload.new;
            let parsedItems = [];
            if (rr.items) {
              try { parsedItems = typeof rr.items === 'string' ? JSON.parse(rr.items) : rr.items; } catch {}
            }
            await db.recipes.put({
              id: rr.id,
              productId: rr.product_id,
              productName: rr.product_name,
              items: parsedItems,
              packagingCost: Number(rr.packaging_cost) || 0,
              laborCost: Number(rr.labor_cost) || 0,
              utilityCost: Number(rr.utility_cost) || 0,
              otherCost: Number(rr.other_cost) || 0,
              totalIngredientCost: Number(rr.total_ingredient_cost) || 0,
              totalHpp: Number(rr.total_hpp) || 0,
              targetFoodCostPercent: Number(rr.target_food_cost_percent) || 0,
              recommendedPrice: Number(rr.recommended_price) || 0,
              actualSellPrice: Number(rr.actual_sell_price) || 0,
              actualFoodCostPercent: Number(rr.actual_food_cost_percent) || 0,
              actualMarginPercent: Number(rr.actual_margin_percent) || 0,
              actualProfit: Number(rr.actual_profit) || 0,
              notes: rr.notes || '',
              updatedAt: rr.updated_at || new Date().toISOString(),
            });
            this.dispatchLocalSync('recipes', payload.new);
          }
        });

      this.realtimeChannel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime sync channel subscribed successfully.');
        }
      });
    } catch (e) {
      console.warn('Realtime init failed:', e);
    }
  }

  /**
   * Complete SQL DDL script for Supabase SQL Editor
   */
  public getSqlSchemaScript(): string {
    return `-- ========================================================
-- SKRIP SETUP DATABASE LENGKAP KASIRKU POS (SUPABASE POSTGRESQL)
-- Salin dan jalankan skrip ini di menu SQL Editor Supabase Anda
-- ========================================================

-- 1. Tabel Profil & Pengaturan Toko (Identitas, Nama, Logo, WiFi, dsb)
create table if not exists public.store_settings (
  id text primary key default 'store-main',
  store_name text not null default 'KasirKu POS',
  address text default '',
  city text default 'Kota',
  province text default 'Provinsi',
  postal_code text default '',
  phone text default '',
  whatsapp text default '',
  email text default '',
  website text default '',
  instagram text default '',
  facebook text default '',
  logo text default '',
  slogan text default '',
  receipt_footer text default '',
  owner_name text default 'Owner',
  npwp text default '',
  currency_symbol text default 'Rp',
  tax_rate numeric default 0,
  enable_tax boolean default false,
  enable_rounding boolean default true,
  business_type text default 'cafe',
  tables text default '[]',
  wifi_name text default '',
  wifi_password text default '',
  raw_data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Pastikan kolom baru ada jika tabel sudah dibuat sebelumnya
alter table public.store_settings add column if not exists raw_data jsonb default '{}'::jsonb;
alter table public.store_settings add column if not exists postal_code text default '';
alter table public.store_settings add column if not exists whatsapp text default '';
alter table public.store_settings add column if not exists email text default '';
alter table public.store_settings add column if not exists website text default '';
alter table public.store_settings add column if not exists instagram text default '';
alter table public.store_settings add column if not exists facebook text default '';
alter table public.store_settings add column if not exists npwp text default '';
alter table public.store_settings add column if not exists currency_symbol text default 'Rp';
alter table public.store_settings add column if not exists tax_rate numeric default 0;
alter table public.store_settings add column if not exists enable_tax boolean default false;
alter table public.store_settings add column if not exists enable_rounding boolean default true;
alter table public.store_settings add column if not exists business_type text default 'cafe';
alter table public.store_settings add column if not exists tables text default '[]';
alter table public.store_settings add column if not exists wifi_name text default '';
alter table public.store_settings add column if not exists wifi_password text default '';

-- 2. Tabel Pengaturan Printer & Struk
create table if not exists public.printer_settings (
  id text primary key default 'printer-main',
  paper_size text default '58mm',
  copies numeric default 1,
  margin numeric default 0,
  font_size text default 'medium',
  show_logo boolean default true,
  show_customer_name boolean default true,
  show_wifi boolean default true,
  show_wifi_password boolean default true,
  show_address boolean default true,
  show_phone boolean default true,
  show_email boolean default false,
  show_website boolean default false,
  show_qr_code boolean default true,
  show_footer boolean default true,
  show_thank_you boolean default true,
  default_printer_name text default '',
  raw_data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 3. Tabel Kategori Menu & Produk
create table if not exists public.categories (
  id text primary key,
  name text not null,
  icon text default '',
  color text default '',
  description text default '',
  created_at timestamptz default now()
);

-- 4. Tabel Produk & Menu
create table if not exists public.products (
  id text primary key,
  sku text default '',
  name text not null,
  image text default '',
  barcode text default '',
  category_id text default '',
  buy_price numeric default 0,
  sell_price numeric default 0,
  wholesale_price numeric default 0,
  cost_price numeric default 0,
  stock numeric default 0,
  min_stock numeric default 0,
  unit text default 'pcs',
  margin numeric default 0,
  supplier_id text default '',
  description text default '',
  addons text default '[]',
  is_discount_active boolean default false,
  discount_type text default 'percent',
  discount_value numeric default 0,
  enable_tax boolean default true,
  tax_rate numeric default 11,
  is_active boolean default true,
  has_recipe boolean default false,
  recipe_id text default '',
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.products add column if not exists image text default '';
alter table public.products add column if not exists raw_data jsonb default '{}'::jsonb;
alter table public.products add column if not exists addons text default '[]';
alter table public.products add column if not exists wholesale_price numeric default 0;
alter table public.products add column if not exists is_discount_active boolean default false;
alter table public.products add column if not exists discount_type text default 'percent';
alter table public.products add column if not exists discount_value numeric default 0;
alter table public.products add column if not exists enable_tax boolean default true;
alter table public.products add column if not exists tax_rate numeric default 11;

-- 5. Tabel Penjualan (Transaksi Kasir)
create table if not exists public.sales (
  id text primary key,
  invoice_number text not null,
  date text,
  time text,
  customer_id text,
  customer_name text,
  cashier_id text,
  cashier_name text default 'Kasir',
  subtotal numeric default 0,
  discount numeric default 0,
  tax numeric default 0,
  service_fee numeric default 0,
  rounding numeric default 0,
  total numeric default 0,
  total_hpp numeric default 0,
  total_profit numeric default 0,
  profit_margin numeric default 0,
  payment_method text default 'cash',
  cash_received numeric default 0,
  change_amount numeric default 0,
  order_type text default 'dine_in',
  table_number text default '',
  status text default 'completed',
  is_tester boolean default false,
  tester_reason text default '',
  tax_rate numeric default 0,
  notes text default '',
  raw_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 6. Tabel Detail Item Penjualan
create table if not exists public.sale_items (
  id text primary key,
  sale_id text not null,
  product_id text not null,
  product_name text not null,
  barcode text default '',
  unit text default 'pcs',
  quantity numeric default 1,
  unit_buy_price numeric default 0,
  unit_hpp numeric default 0,
  unit_sell_price numeric default 0,
  subtotal numeric default 0,
  discount numeric default 0,
  profit numeric default 0,
  total numeric default 0,
  notes text default '',
  modifiers text default '[]',
  selected_addons text default '[]'
);

-- 7. Tabel Pengeluaran Operasional
create table if not exists public.expenses (
  id text primary key,
  date text not null,
  category text not null,
  title text not null,
  amount numeric default 0,
  notes text default '',
  created_at timestamptz default now()
);

-- 8. Tabel Pengguna & Kasir
create table if not exists public.users (
  id text primary key,
  name text not null,
  pin text not null,
  role text not null default 'cashier',
  phone text default '',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 9. Tabel Pelanggan & Supplier
create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text default '',
  email text default '',
  address text default '',
  total_transactions numeric default 0,
  total_spent numeric default 0,
  created_at timestamptz default now()
);

create table if not exists public.suppliers (
  id text primary key,
  name text not null,
  phone text default '',
  whatsapp text default '',
  email text default '',
  address text default '',
  notes text default '',
  created_at timestamptz default now()
);

-- 10. Tabel Bahan Baku & Formula Resep (HPP Cafe / F&B)
create table if not exists public.ingredients (
  id text primary key,
  name text not null,
  category text default 'lainnya',
  purchase_unit text default 'kg',
  purchase_price numeric default 0,
  purchase_unit_size numeric default 1,
  recipe_unit text default 'gram',
  conversion_factor numeric default 1,
  cost_per_recipe_unit numeric default 0,
  wastage_percent numeric default 0,
  effective_cost_per_recipe_unit numeric default 0,
  current_stock numeric default 0,
  min_stock numeric default 0,
  supplier_id text default '',
  notes text default '',
  updated_at timestamptz default now()
);

create table if not exists public.recipes (
  id text primary key,
  product_id text not null,
  product_name text not null,
  items text default '[]',
  packaging_cost numeric default 0,
  labor_cost numeric default 0,
  utility_cost numeric default 0,
  other_cost numeric default 0,
  total_ingredient_cost numeric default 0,
  total_hpp numeric default 0,
  target_food_cost_percent numeric default 0,
  recommended_price numeric default 0,
  actual_sell_price numeric default 0,
  actual_food_cost_percent numeric default 0,
  actual_margin_percent numeric default 0,
  actual_profit numeric default 0,
  notes text default '',
  raw_data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- ========================================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================================
alter table public.store_settings enable row level security;
alter table public.printer_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.users enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipes enable row level security;

-- Kebijakan Akses Penuh untuk Client Anon (Aplikasi Kasir)
drop policy if exists "KasirKu Store Settings Policy" on public.store_settings;
create policy "KasirKu Store Settings Policy" on public.store_settings for all using (true) with check (true);

drop policy if exists "KasirKu Printer Settings Policy" on public.printer_settings;
create policy "KasirKu Printer Settings Policy" on public.printer_settings for all using (true) with check (true);

drop policy if exists "KasirKu Categories Policy" on public.categories;
create policy "KasirKu Categories Policy" on public.categories for all using (true) with check (true);

drop policy if exists "KasirKu Products Policy" on public.products;
create policy "KasirKu Products Policy" on public.products for all using (true) with check (true);

drop policy if exists "KasirKu Sales Policy" on public.sales;
create policy "KasirKu Sales Policy" on public.sales for all using (true) with check (true);

drop policy if exists "KasirKu Sale Items Policy" on public.sale_items;
create policy "KasirKu Sale Items Policy" on public.sale_items for all using (true) with check (true);

drop policy if exists "KasirKu Expenses Policy" on public.expenses;
create policy "KasirKu Expenses Policy" on public.expenses for all using (true) with check (true);

drop policy if exists "KasirKu Users Policy" on public.users;
create policy "KasirKu Users Policy" on public.users for all using (true) with check (true);

drop policy if exists "KasirKu Customers Policy" on public.customers;
create policy "KasirKu Customers Policy" on public.customers for all using (true) with check (true);

drop policy if exists "KasirKu Suppliers Policy" on public.suppliers;
create policy "KasirKu Suppliers Policy" on public.suppliers for all using (true) with check (true);

drop policy if exists "KasirKu Ingredients Policy" on public.ingredients;
create policy "KasirKu Ingredients Policy" on public.ingredients for all using (true) with check (true);

drop policy if exists "KasirKu Recipes Policy" on public.recipes;
create policy "KasirKu Recipes Policy" on public.recipes for all using (true) with check (true);

-- ========================================================
-- REPLICA IDENTITY FULL & PUBLICATION REALTIME
-- ========================================================
alter table public.store_settings replica identity full;
alter table public.printer_settings replica identity full;
alter table public.categories replica identity full;
alter table public.products replica identity full;
alter table public.sales replica identity full;
alter table public.sale_items replica identity full;
alter table public.expenses replica identity full;
alter table public.users replica identity full;
alter table public.customers replica identity full;
alter table public.suppliers replica identity full;
alter table public.ingredients replica identity full;
alter table public.recipes replica identity full;

-- Daftarkan seluruh tabel ke publikasi realtime Supabase
alter publication supabase_realtime add table 
  public.store_settings,
  public.printer_settings,
  public.categories,
  public.products,
  public.sales,
  public.sale_items,
  public.expenses,
  public.users,
  public.customers,
  public.suppliers,
  public.ingredients,
  public.recipes;
`;
  }
}

export const supabaseService = new SupabaseService();
