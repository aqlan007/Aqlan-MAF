/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Boxes,
  Building2,
  Calculator,
  Check,
  ChevronRight,
  Database,
  History,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  QrCode,
  Receipt,
  RotateCcw,
  Settings,
  Share2,
  ShoppingCart,
  Store,
  TrendingUp,
  User as UserIcon,
  Users,
  Wallet,
  Wheat,
  X,
} from 'lucide-react';
import { PinLockModal } from './components/auth/PinLockModal';
import { AdminAuthModal } from './components/auth/AdminAuthModal';
import { ChangePinModal } from './components/auth/ChangePinModal';
import { RestrictedScreen } from './components/auth/RestrictedScreen';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { PWAInstallButton } from './components/common/PWAInstallButton';
import { ContactsScreen } from './components/contacts/ContactsScreen';
import { DashboardScreen } from './components/dashboard/DashboardScreen';
import { ExpensesScreen } from './components/expenses/ExpensesScreen';
import { InventoryScreen } from './components/inventory/InventoryScreen';
import { OnboardingModal } from './components/onboarding/OnboardingModal';
import { POSScreen } from './components/pos/POSScreen';
import { ProductsScreen } from './components/products/ProductsScreen';
import { RecipesAndHppScreen } from './components/recipes/RecipesAndHppScreen';
import { ReportsScreen } from './components/reports/ReportsScreen';
import { ReturnsScreen } from './components/returns/ReturnsScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { DeviceLinkModal } from './components/sync/DeviceLinkModal';
import { supabaseService } from './services/supabase';
import { spreadsheetService } from './services/spreadsheet';
import { db, initializeDatabaseIfNeeded, seedSampleData } from './db/db';
import {
  PrinterSettings,
  StoreSettings,
  User,
} from './types';
import { SAMPLE_PRINTER_SETTINGS, SAMPLE_STORE_SETTINGS, SAMPLE_USERS } from './db/sampleData';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isOnboarded, setIsOnboarded] = useState<boolean>(true);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // App Global State
  const [currentUser, setCurrentUser] = useState<User>(SAMPLE_USERS[0]);
  const [allUsers, setAllUsers] = useState<User[]>(SAMPLE_USERS);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Admin access control & supervisor override states
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [pendingAdminTab, setPendingAdminTab] = useState<string | null>(null);
  const [overriddenTabs, setOverriddenTabs] = useState<string[]>([]);
  const [userToChangePin, setUserToChangePin] = useState<User | null>(null);

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(SAMPLE_STORE_SETTINGS);
  const [printerSettings, setPrinterSettings] = useState<PrinterSettings>(SAMPLE_PRINTER_SETTINGS);

  // Multi-Device Link & Sync State
  const [showDeviceLinkModal, setShowDeviceLinkModal] = useState<boolean>(false);
  const [autoLinkDetected, setAutoLinkDetected] = useState<string | null>(null);
  const [isSyncConfigured, setIsSyncConfigured] = useState<boolean>(
    spreadsheetService.isConfigured() || supabaseService.isConfigured()
  );

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Helper to determine if a module is restricted for the current user role:
  // - 'admin': Akses penuh ke semua modul.
  // - 'manager': Akses semuanya KECUALI laporan keuangan ('reports') dan pengaturan ('settings').
  // - 'cashier': Dibatasi dari modul operasional & manajemen.
  const isTabRestrictedForUser = (tabId: string, role: User['role']): boolean => {
    if (role === 'admin') return false;
    if (role === 'manager') {
      return tabId === 'reports' || tabId === 'settings';
    }
    if (role === 'cashier') {
      return [
        'recipes',
        'inventory',
        'reports',
        'expenses',
        'returns',
        'contacts',
        'settings',
      ].includes(tabId);
    }
    return false;
  };

  // Determine authorized accounts for PIN unlock
  const getAuthorizingUsers = (tabId: string | null): User[] => {
    const admins = allUsers.filter((u) => u.role === 'admin' && u.isActive);
    if (!tabId || tabId === 'reports' || tabId === 'settings') {
      return admins.length > 0 ? admins : [SAMPLE_USERS[0]];
    }
    // For cashier unlocking other operational modules (recipes, inventory, expenses, returns, contacts),
    // either Manager or Admin can authorize
    const supervisors = allUsers.filter(
      (u) => (u.role === 'admin' || u.role === 'manager') && u.isActive
    );
    return supervisors.length > 0 ? supervisors : admins.length > 0 ? admins : [SAMPLE_USERS[0]];
  };

  const handleTabClick = (tabId: string) => {
    if (isTabRestrictedForUser(tabId, currentUser.role) && !overriddenTabs.includes(tabId)) {
      setPendingAdminTab(tabId);
      setShowAdminAuth(true);
      return;
    }
    setActiveTab(tabId);
  };

  // Detect link_sync parameter in URL for instant 1-click device link
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const linkParam = urlParams.get('link_sync');
      if (linkParam) {
        setAutoLinkDetected(linkParam);
      }
    }
  }, []);

  const handleConfirmAutoLink = async () => {
    if (!autoLinkDetected) return;
    try {
      // 1. Check v2 Spreadsheet Pairing code (with complete store & printer settings snapshot)
      const parsedSheet = spreadsheetService.parsePairingCode(autoLinkDetected);
      if (parsedSheet) {
        if (parsedSheet.storeSettings) {
          await db.store_settings.put(parsedSheet.storeSettings);
          setStoreSettings(parsedSheet.storeSettings);
        }
        if (parsedSheet.printerSettings) {
          await db.printer_settings.put(parsedSheet.printerSettings);
          setPrinterSettings(parsedSheet.printerSettings);
        }
        if (parsedSheet.spreadsheetConfig) {
          spreadsheetService.saveConfig(parsedSheet.spreadsheetConfig);
          setIsSyncConfigured(true);
          await spreadsheetService.sync();
        }
        await initApp();
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        setAutoLinkDetected(null);
        alert('🎉 Perangkat ini berhasil terhubung! Seluruh pengaturan toko dan printer telah disamakan dengan perangkat sebelumnya.');
        return;
      }

      // 2. Legacy fallback
      const parsed = supabaseService.parsePairingCode(autoLinkDetected);
      if (parsed) {
        supabaseService.saveConfig({
          url: parsed.url,
          anonKey: parsed.anonKey,
          autoSync: true,
        });
        setIsSyncConfigured(true);
        await supabaseService.sync();
        await initApp();
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        setAutoLinkDetected(null);
        alert('🎉 Perangkat ini berhasil terhubung ke toko KasirKu!');
        return;
      }

      alert('Tautan pairing tidak valid.');
      setAutoLinkDetected(null);
    } catch (e: any) {
      alert('Gagal menghubungkan perangkat: ' + e.message);
    }
  };

  // Initialize DB & load settings
  const initApp = async () => {
    try {
      const onboarded = await initializeDatabaseIfNeeded();
      setIsOnboarded(onboarded);

      if (!onboarded) {
        setShowOnboarding(true);
      }

      // Load store settings
      const st = await db.store_settings.get('store-main');
      if (st) setStoreSettings(st);

      // Load printer settings
      const pr = await db.printer_settings.get('printer-main');
      if (pr) setPrinterSettings(pr);

      // Load users and ensure at least one active Admin exists
      let uList = await db.users.toArray();
      const hasAdmin = uList.some((u) => u.role === 'admin');
      if (uList.length === 0 || !hasAdmin) {
        await db.users.bulkPut(SAMPLE_USERS);
        uList = await db.users.toArray();
      }
      setAllUsers(uList);
      // Prefer keeping existing user if valid, or default to admin
      const adminDefault = uList.find((u) => u.role === 'admin') || uList[0];
      setCurrentUser(adminDefault);
    } catch (err) {
      console.error('Failed to initialize app DB:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  // Realtime multi-device sync listener: automatically refreshes store name, logo, printer, & users
  useEffect(() => {
    const handleDataSync = async (event: any) => {
      const table = event.detail?.table;
      try {
        if (!table || table === 'store_settings' || table === 'all') {
          const st = await db.store_settings.get('store-main');
          if (st) setStoreSettings(st);
        }
        if (!table || table === 'printer_settings' || table === 'all') {
          const pr = await db.printer_settings.get('printer-main');
          if (pr) setPrinterSettings(pr);
        }
        if (!table || table === 'users' || table === 'all') {
          const uList = await db.users.toArray();
          if (uList.length > 0) {
            setAllUsers(uList);
            setCurrentUser((prev) => uList.find((u) => u.id === prev.id) || uList[0]);
          }
        }
      } catch (err) {
        console.error('Error handling data sync in App:', err);
      }
    };

    window.addEventListener('kasirku:data_sync', handleDataSync);

    // Initial silent sync if Supabase is already configured
    if (supabaseService.isConfigured()) {
      supabaseService.sync(true).then((res) => {
        if (res.success) {
          initApp();
        }
      });
    }

    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, []);

  const handleFinishOnboarding = async () => {
    setShowOnboarding(false);
    setIsOnboarded(true);
    await initApp();
    setActiveTab('dashboard');
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos', label: 'Kasir / Transaksi', icon: ShoppingCart },
    { id: 'recipes', label: 'Bahan Baku & HPP Resep', icon: Calculator },
    { id: 'products', label: 'Menu & Produk F&B', icon: Package },
    { id: 'inventory', label: 'Inventori & Restock', icon: Boxes },
    { id: 'reports', label: 'Laporan Keuangan', icon: TrendingUp },
    { id: 'expenses', label: 'Pengeluaran Cafe', icon: Wallet },
    { id: 'returns', label: 'Retur Barang', icon: RotateCcw },
    { id: 'contacts', label: 'Supplier & Pelanggan', icon: Building2 },
    { id: 'settings', label: 'Pengaturan Toko', icon: Settings },
  ];

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white gap-3 select-none">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500 flex items-center justify-center animate-pulse">
          <Store className="w-6 h-6 text-emerald-400" />
        </div>
        <h2 className="text-lg font-black tracking-tight">Memuat KasirKu POS...</h2>
        <p className="text-xs text-slate-400">Menyiapkan database lokal IndexedDB</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans select-none text-slate-800">
      {/* 1. DESKTOP / TABLET SIDEBAR */}
      <aside className="hidden lg:flex w-64 xl:w-72 bg-slate-900 text-white flex-col border-r border-slate-800 shrink-0">
        {/* Brand Header */}
        <div className="p-4 xl:p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div
              onClick={() => handleTabClick('settings')}
              className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shadow-lg shadow-black/40 overflow-hidden shrink-0 cursor-pointer group relative border border-slate-700"
              title="Klik untuk ubah logo & pengaturan toko"
            >
              {storeSettings.logo ? (
                <img
                  src={storeSettings.logo}
                  alt="Logo Toko"
                  className="w-full h-full object-contain p-0.5 bg-black"
                />
              ) : (
                <Store className="w-5 h-5" />
              )}
            </div>
            <div className="overflow-hidden">
              <h1 className="font-extrabold text-sm xl:text-base leading-tight truncate">
                {storeSettings.storeName || 'CHORD #Kopi_kebun.'}
              </h1>
              <button
                onClick={() => handleTabClick('settings')}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-mono tracking-wider uppercase font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>POS &bull; Live Vibes</span>
                <span className="text-[9px] opacity-60 underline">&bull; Pengaturan</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Menu Links */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isRestricted =
              isTabRestrictedForUser(item.id, currentUser.role) &&
              !overriddenTabs.includes(item.id);

            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs xl:text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {isRestricted && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold flex items-center gap-1 border border-amber-500/30">
                      <Lock className="w-2.5 h-2.5" />
                      <span>{item.id === 'reports' || item.id === 'settings' ? 'Admin' : 'Supervisor'}</span>
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-4 h-4 text-emerald-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Bottom User Profile & Lock Screen */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2">
          {/* Device Link Multi-Device Sync Button with QR Icon */}
          <button
            type="button"
            onClick={() => setShowDeviceLinkModal(true)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold transition cursor-pointer text-slate-200"
            title="Hubungkan KasirKu ke HP/Perangkat Lain via QR Code"
          >
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <span>Hubungkan Perangkat (QR)</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                isSyncConfigured
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-700 text-slate-400'
              }`}
            >
              {isSyncConfigured ? '🟢 Sinkron' : 'Lokal'}
            </span>
          </button>

          {/* PWA Install Button Mount */}
          <div className="w-full">
            <PWAInstallButton variant="sidebar" />
          </div>

          <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  currentUser.role === 'admin'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : currentUser.role === 'manager'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}
              >
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <div className="font-bold text-xs truncate text-white">{currentUser.name}</div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className={`px-1.5 py-0.2 rounded font-mono font-bold text-[9px] uppercase tracking-wider ${
                      currentUser.role === 'admin'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : currentUser.role === 'manager'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {currentUser.role === 'admin'
                      ? '👑 Owner / Admin'
                      : currentUser.role === 'manager'
                      ? '👔 Manager'
                      : '🛒 Kasir'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setUserToChangePin(currentUser)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-700 transition-colors cursor-pointer"
                title="Ganti PIN / Password Akun Ini"
              >
                <KeyRound className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsLocked(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                title="Ganti Kasir / Pengguna"
              >
                <Users className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsLocked(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
                title="Kunci Layar (Lock Session)"
              >
                <Lock className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              onClick={() => handleTabClick('settings')}
              className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center shadow-md overflow-hidden shrink-0 cursor-pointer border border-slate-700"
              title="Ubah logo / toko"
            >
              {storeSettings.logo ? (
                <img
                  src={storeSettings.logo}
                  alt="Logo Toko"
                  className="w-full h-full object-contain p-0.5 bg-black"
                />
              ) : (
                <Store className="w-4 h-4" />
              )}
            </div>
            <div className="truncate">
              <h2 className="font-extrabold text-sm leading-tight truncate max-w-[170px]">
                {storeSettings.storeName}
              </h2>
              <span className="text-[10px] text-emerald-400 font-mono">
                {currentUser.name} ({currentUser.role === 'admin' ? 'Admin' : currentUser.role === 'manager' ? 'Manager' : 'Kasir'})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDeviceLinkModal(true)}
              className="p-2 rounded-xl bg-slate-800 text-emerald-400 relative cursor-pointer"
              title="Hubungkan Antar-Perangkat (Scan QR Code)"
            >
              <QrCode className="w-4 h-4" />
              <span
                className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                  isSyncConfigured ? 'bg-emerald-400 ring-2 ring-slate-900 animate-pulse' : 'bg-slate-500'
                }`}
              />
            </button>
            <PWAInstallButton variant="header" />
            <button
              onClick={() => setUserToChangePin(currentUser)}
              className="p-2 rounded-xl bg-slate-800 text-amber-300"
              title="Ganti PIN"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsLocked(true)}
              className="p-2 rounded-xl bg-slate-800 text-slate-300"
              title="Kunci Kasir"
            >
              <Lock className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Dynamic Screen View */}
        <main className="flex-1 overflow-hidden relative">
          {activeTab === 'dashboard' && (
            <DashboardScreen
              onNavigate={(t) => handleTabClick(t)}
              storeSettings={storeSettings}
              currentUser={currentUser}
            />
          )}
          {activeTab === 'pos' && (
            <POSScreen
              currentUser={currentUser}
              storeSettings={storeSettings}
              printerSettings={printerSettings}
              onRefreshData={() => {}}
            />
          )}
          {activeTab === 'recipes' && <RecipesAndHppScreen currentUser={currentUser} />}
          {activeTab === 'products' && <ProductsScreen currentUser={currentUser} />}
          {activeTab === 'inventory' && <InventoryScreen currentUser={currentUser} />}
          {activeTab === 'reports' && (
            isTabRestrictedForUser('reports', currentUser.role) && !overriddenTabs.includes('reports') ? (
              <RestrictedScreen
                moduleName="Laporan Keuangan"
                currentUser={currentUser}
                onRequestAdminUnlock={() => {
                  setPendingAdminTab('reports');
                  setShowAdminAuth(true);
                }}
                onNavigateToPos={() => setActiveTab('pos')}
              />
            ) : (
              <ReportsScreen
                currentUser={currentUser}
                storeSettings={storeSettings}
                printerSettings={printerSettings}
              />
            )
          )}
          {activeTab === 'expenses' && <ExpensesScreen currentUser={currentUser} />}
          {activeTab === 'returns' && <ReturnsScreen currentUser={currentUser} />}
          {activeTab === 'contacts' && <ContactsScreen currentUser={currentUser} />}
          {activeTab === 'settings' && (
            isTabRestrictedForUser('settings', currentUser.role) && !overriddenTabs.includes('settings') ? (
              <RestrictedScreen
                moduleName="Pengaturan Sistem & Toko"
                currentUser={currentUser}
                onRequestAdminUnlock={() => {
                  setPendingAdminTab('settings');
                  setShowAdminAuth(true);
                }}
                onNavigateToPos={() => setActiveTab('pos')}
              />
            ) : (
              <SettingsScreen
                currentUser={currentUser}
                storeSettings={storeSettings}
                printerSettings={printerSettings}
                onStoreUpdated={(s) => setStoreSettings(s)}
                onPrinterUpdated={(p) => setPrinterSettings(p)}
                onUserSwitched={(u) => setCurrentUser(u)}
              />
            )
          )}
        </main>

        {/* 3. MOBILE BOTTOM NAVIGATION */}
        <nav className="lg:hidden bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shrink-0 z-30 shadow-lg">
          {[
            { id: 'dashboard', label: 'Beranda', icon: LayoutDashboard },
            { id: 'pos', label: 'Kasir', icon: ShoppingCart },
            { id: 'products', label: 'Produk', icon: Package },
            { id: 'reports', label: 'Laporan', icon: TrendingUp },
          ].map((item) => {
            const Icon = item.icon;
            const isSel = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
                  isSel ? 'text-emerald-700 font-extrabold' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className={`w-5 h-5 ${isSel ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}

          {/* More menu drawer trigger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-colors cursor-pointer ${
              ['inventory', 'expenses', 'returns', 'contacts', 'settings'].includes(activeTab)
                ? 'text-emerald-700 font-extrabold'
                : 'text-slate-400'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px]">Menu</span>
          </button>
        </nav>
      </div>

      {/* MOBILE MORE MENU DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs lg:hidden">
          <div className="bg-white rounded-t-3xl p-5 border-t border-slate-200 shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-800">Menu &amp; Modul Lainnya</h3>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'recipes', label: 'Bahan Baku & HPP', icon: Calculator },
                { id: 'inventory', label: 'Inventori Stok', icon: Boxes },
                { id: 'expenses', label: 'Pengeluaran Cafe', icon: Wallet },
                { id: 'returns', label: 'Retur Barang', icon: RotateCcw },
                { id: 'contacts', label: 'Supplier & Tamu', icon: Building2 },
                { id: 'settings', label: 'Pengaturan Toko', icon: Settings },
              ].map((item) => {
                const Icon = item.icon;
                const isRestricted =
                  isTabRestrictedForUser(item.id, currentUser.role) &&
                  !overriddenTabs.includes(item.id);

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleTabClick(item.id);
                    }}
                    className="p-3 bg-slate-50 hover:bg-emerald-50 rounded-2xl border border-slate-200 flex items-center justify-between font-bold text-slate-700 hover:text-emerald-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-emerald-600" />
                      <span>{item.label}</span>
                    </div>
                    {isRestricted && (
                      <span className="p-1 rounded bg-amber-100 text-amber-800 text-[10px]">
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Admin Authorization / Supervisor Override Modal */}
      <AdminAuthModal
        isOpen={showAdminAuth}
        featureName={navItems.find((n) => n.id === pendingAdminTab)?.label || 'Fitur Admin'}
        adminUsers={getAuthorizingUsers(pendingAdminTab)}
        onSuccess={async (adminUser, mode) => {
          try {
            const freshUsers = await db.users.toArray();
            setAllUsers(freshUsers);
          } catch (e) {
            console.error(e);
          }
          if (mode === 'override') {
            if (pendingAdminTab) {
              setOverriddenTabs((prev) => [...prev, pendingAdminTab]);
              setActiveTab(pendingAdminTab);
            }
          } else {
            setCurrentUser(adminUser);
            if (pendingAdminTab) setActiveTab(pendingAdminTab);
          }
          setShowAdminAuth(false);
          setPendingAdminTab(null);
        }}
        onClose={() => {
          setShowAdminAuth(false);
          setPendingAdminTab(null);
        }}
      />

      {/* Offline Status Badge */}
      <OfflineIndicator />

      {/* Onboarding Wizard Modal */}
      <OnboardingModal isOpen={showOnboarding} onFinish={handleFinishOnboarding} />

      {/* PIN Lock Screen Modal */}
      <PinLockModal
        users={allUsers}
        currentSelectedUser={currentUser}
        isOpen={isLocked}
        storeLogo={storeSettings.logo}
        storeName={storeSettings.storeName}
        onSuccess={(u) => {
          setCurrentUser(u);
          setIsLocked(false);
        }}
      />

      {/* Global Change PIN Modal */}
      {userToChangePin && (
        <ChangePinModal
          isOpen={!!userToChangePin}
          targetUser={userToChangePin}
          currentUser={currentUser}
          onSuccess={async (updated) => {
            try {
              const freshUsers = await db.users.toArray();
              setAllUsers(freshUsers);
            } catch (e) {
              console.error(e);
            }
            if (currentUser.id === updated.id) {
              setCurrentUser(updated);
            }
          }}
          onClose={() => setUserToChangePin(null)}
        />
      )}

      {/* Device Link Multi-Device Sync Modal */}
      <DeviceLinkModal
        isOpen={showDeviceLinkModal}
        onClose={() => setShowDeviceLinkModal(false)}
        storeSettings={storeSettings}
        printerSettings={printerSettings}
        onApplySettings={(st, pr) => {
          setStoreSettings(st);
          setPrinterSettings(pr);
        }}
        onSyncSuccess={async () => {
          setIsSyncConfigured(spreadsheetService.isConfigured() || supabaseService.isConfigured());
          await initApp();
        }}
      />

      {/* Instant 1-Click Auto Link Prompt Modal */}
      {autoLinkDetected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Share2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Hubungkan Perangkat Ini?</h3>
                <p className="text-xs text-slate-500">Tautan sinkronisasi terdeteksi dari HP utama</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Perangkat ini akan otomatis disambungkan ke toko <strong>{storeSettings.storeName}</strong>. Semua produk, harga, stok, dan transaksi kasir akan disinkronkan secara real-time.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const cleanUrl = window.location.origin + window.location.pathname;
                  window.history.replaceState({}, document.title, cleanUrl);
                  setAutoLinkDetected(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmAutoLink}
                className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Ya, Sambungkan Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
