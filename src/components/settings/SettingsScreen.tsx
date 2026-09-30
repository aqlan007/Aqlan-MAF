import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bluetooth,
  Building,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  Globe,
  Image,
  KeyRound,
  Lock,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
  FileSpreadsheet,
  ExternalLink,
  PlusCircle,
  LogOut,
  Sliders,
} from 'lucide-react';
import { db, exportFullDatabase, importFullDatabase, seedSampleData } from '../../db/db';
import { printerService } from '../../services/printer';
import { supabaseService } from '../../services/supabase';
import { spreadsheetService, SpreadsheetConfig } from '../../services/spreadsheet';
import { signInWithGoogle, logoutGoogle, getGoogleUser } from '../../services/googleAuth';
import { PrinterSettings, StoreSettings, User, UserRole } from '../../types';
import { PRESET_LOGOS, processLogoImage } from '../../utils/logoPresets';
import { ChangePinModal } from '../auth/ChangePinModal';
import { ConfirmModal } from '../common/ConfirmModal';
import { DeviceLinkModal } from '../sync/DeviceLinkModal';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import QRCode from 'qrcode';

interface SettingsScreenProps {
  currentUser: User;
  storeSettings: StoreSettings;
  printerSettings: PrinterSettings;
  onStoreUpdated: (s: StoreSettings) => void;
  onPrinterUpdated: (p: PrinterSettings) => void;
  onUserSwitched: (u: User) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  currentUser,
  storeSettings,
  printerSettings,
  onStoreUpdated,
  onPrinterUpdated,
  onUserSwitched,
}) => {
  const [tab, setTab] = useState<'store' | 'receipt' | 'printer' | 'users' | 'database' | 'pwa' | 'supabase'>('store');

  // Multi-Device Link Modal state
  const [showDeviceLinkModal, setShowDeviceLinkModal] = useState(false);

  // Store form state
  const [storeForm, setStoreForm] = useState<StoreSettings>(storeSettings);
  const [isStoreDirty, setIsStoreDirty] = useState(false);
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [saveStoreSuccess, setSaveStoreSuccess] = useState(false);
  const [storeSaveError, setStoreSaveError] = useState<string | null>(null);

  // Printer form state
  const [printForm, setPrintForm] = useState<PrinterSettings>(printerSettings);
  const [isPrinterDirty, setIsPrinterDirty] = useState(false);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);
  const [savePrinterSuccess, setSavePrinterSuccess] = useState(false);

  // Bluetooth scanning & connection state
  const [btStatus, setBtStatus] = useState<string | null>(null);
  const [isConnectedBt, setIsConnectedBt] = useState(printerService.isConnected());
  const [btDeviceName, setBtDeviceName] = useState<string | null>(
    printerService.getConnectedDeviceName()
  );
  const [isBtConnecting, setIsBtConnecting] = useState(false);

  useEffect(() => {
    const unsub = printerService.addListener((status) => {
      setIsConnectedBt(status.connected);
      if (status.deviceName) setBtDeviceName(status.deviceName);
      if (status.error) setBtStatus(status.error);
    });
    return () => unsub();
  }, []);

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier');
  const [showPins, setShowPins] = useState(true); // Default show PINs to prevent locked out users

  // Change PIN modal / form
  const [editingUserPin, setEditingUserPin] = useState<User | null>(null);
  const [pinChangeVal, setPinChangeVal] = useState('');

  // Delete user modal confirmation state
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  // Backup / restore status
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [copiedPwaUrl, setCopiedPwaUrl] = useState(false);

  // Google Spreadsheet Database States
  const [sheetConfig, setSheetConfig] = useState<SpreadsheetConfig>(spreadsheetService.getConfig());
  const [sheetStatus, setSheetStatus] = useState<string | null>(null);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [googleUser, setGoogleUser] = useState(getGoogleUser());
  const [isLoggingInGoogle, setIsLoggingInGoogle] = useState(false);
  const [sheetInput, setSheetInput] = useState(
    spreadsheetService.getConfig().spreadsheetUrl || spreadsheetService.getConfig().spreadsheetId || ''
  );
  const [settingsQrUrl, setSettingsQrUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const url = spreadsheetService.generateLinkUrl(storeForm, printForm);
    if (url) {
      QRCode.toDataURL(url, {
        width: 220,
        margin: 1,
        color: { dark: '#064e3b', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      })
        .then((dataUrl) => {
          if (isMounted) setSettingsQrUrl(dataUrl);
        })
        .catch(console.error);
    }
    return () => {
      isMounted = false;
    };
  }, [storeForm, printForm, sheetConfig]);

  useEffect(() => {
    const unsub = spreadsheetService.addSyncListener((syncing, lastSync, err) => {
      setIsSyncingSheet(syncing);
      setSheetConfig(spreadsheetService.getConfig());
      setGoogleUser(getGoogleUser());
      if (err) setSheetStatus(`Error: ${err}`);
    });
    return () => unsub();
  }, []);

  const handleGoogleLogin = async () => {
    setIsLoggingInGoogle(true);
    try {
      const res = await signInWithGoogle();
      setGoogleUser(res.user);
      setSheetStatus(`Berhasil terhubung dengan Google Account (${res.user.email}).`);
    } catch (err: any) {
      setSheetStatus(`Gagal login Google: ${err.message || 'Dibatalkan'}`);
    } finally {
      setIsLoggingInGoogle(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setSheetStatus('Akun Google telah dikeluarkan.');
  };

  const handleCreateNewSpreadsheet = async () => {
    setIsCreatingSheet(true);
    setSheetStatus('Membuat Google Spreadsheet baru di Drive...');
    try {
      const result = await spreadsheetService.createDatabaseSpreadsheet(
        `KasirKu POS Database - ${storeForm.storeName || 'Toko'}`
      );
      setSheetConfig(spreadsheetService.getConfig());
      setSheetInput(result.spreadsheetUrl);
      setSheetStatus('🎉 Berhasil membuat Spreadsheet baru dan menyinkronkan data toko!');
    } catch (err: any) {
      setSheetStatus(`Gagal membuat spreadsheet: ${err.message}`);
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleSaveSheetConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetInput.trim()) return;

    let id = sheetInput.trim();
    const match = id.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) id = match[1];

    spreadsheetService.saveConfig({
      spreadsheetId: id,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${id}/edit`,
      autoSync: sheetConfig.autoSync,
    });
    setSheetConfig(spreadsheetService.getConfig());
    setSheetStatus('Menyinkronkan dengan Google Spreadsheet...');
    const res = await spreadsheetService.sync();
    setSheetStatus(res.message);
  };

  const handleTriggerSheetSync = async () => {
    setIsSyncingSheet(true);
    setSheetStatus('Menyinkronkan data...');
    const res = await spreadsheetService.sync();
    setIsSyncingSheet(false);
    setSheetStatus(res.message);
  };

  // Supabase Sync States
  const [supabaseForm, setSupabaseForm] = useState(supabaseService.getConfig());
  const [supabaseStatus, setSupabaseStatus] = useState<string | null>(null);
  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [showSqlScript, setShowSqlScript] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    const unsub = supabaseService.addSyncListener((syncing, lastSync, err) => {
      setIsSyncingSupabase(syncing);
      if (err) setSupabaseStatus(`Error: ${err}`);
    });
    return () => unsub();
  }, []);

  const handleSaveSupabaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = supabaseService.saveConfig(supabaseForm);
    if (ok) {
      setSupabaseStatus('Pengaturan server Supabase berhasil disimpan!');
      setTimeout(() => setSupabaseStatus(null), 3000);
    }
  };

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    setSupabaseStatus(null);
    const res = await supabaseService.testConnection(supabaseForm.url, supabaseForm.anonKey);
    setIsTestingSupabase(false);
    setSupabaseStatus(res.message);
  };

  const handleTriggerSync = async () => {
    setIsSyncingSupabase(true);
    setSupabaseStatus(null);
    const res = await supabaseService.sync();
    setIsSyncingSupabase(false);
    setSupabaseStatus(res.message);
    if (res.success) {
      setSupabaseForm(supabaseService.getConfig());
    }
  };

  // Confirmation Modal state for Settings
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Ya, Lanjutkan',
    variant: 'danger',
    onConfirm: () => {},
  });

  const loadUsers = async () => {
    const list = await db.users.toArray();
    setUsers(list);
  };

  useEffect(() => {
    if (!isStoreDirty) {
      setStoreForm(storeSettings);
    }
    if (!isPrinterDirty) {
      setPrintForm(printerSettings);
    }
    loadUsers();
  }, [storeSettings, printerSettings]);

  // Listen for remote updates from other devices in real-time
  useEffect(() => {
    const handleDataSync = async (event: any) => {
      const table = event.detail?.table;
      try {
        if (!table || table === 'store_settings' || table === 'all') {
          if (!isStoreDirty) {
            const st = await db.store_settings.get('store-main');
            if (st) setStoreForm(st);
          }
        }
        if (!table || table === 'printer_settings' || table === 'all') {
          if (!isPrinterDirty) {
            const pr = await db.printer_settings.get('printer-main');
            if (pr) setPrintForm(pr);
          }
        }
        if (!table || table === 'users' || table === 'all') {
          await loadUsers();
        }
      } catch (err) {
        console.error('Error handling data sync in SettingsScreen:', err);
      }
    };
    window.addEventListener('kasirku:data_sync', handleDataSync);
    return () => window.removeEventListener('kasirku:data_sync', handleDataSync);
  }, [isStoreDirty, isPrinterDirty]);

  // Logo file upload handler with automatic thermal contrast enhancement
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Ukuran file logo maksimal 5 MB.');
      return;
    }

    setIsStoreDirty(true);
    try {
      const processed = await processLogoImage(file);
      setStoreForm((prev) => ({ ...prev, logo: processed }));
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setStoreForm((prev) => ({ ...prev, logo: result }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Store Settings
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStore(true);
    setSaveStoreSuccess(false);
    setStoreSaveError(null);
    try {
      const updated: StoreSettings = {
        ...storeForm,
        id: 'store-main',
        updatedAt: new Date().toISOString(),
      };
      await db.store_settings.put(updated);
      setStoreForm(updated);
      setIsStoreDirty(false);
      onStoreUpdated(updated);

      if (spreadsheetService.isConfigured()) {
        await spreadsheetService.pushStoreSettings(updated);
      }
      if (supabaseService.isConfigured()) {
        await supabaseService.pushStoreSettings(updated);
      }
      setSaveStoreSuccess(true);
      setTimeout(() => setSaveStoreSuccess(false), 4500);
    } catch (err: any) {
      console.error('Failed to save store settings:', err);
      setStoreSaveError(err.message || 'Gagal menyimpan profil toko.');
    } finally {
      setIsSavingStore(false);
    }
  };

  // Save Receipt & Printer Settings
  const handleSavePrinterSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPrinter(true);
    setSavePrinterSuccess(false);
    try {
      const updated: PrinterSettings = {
        ...printForm,
        id: 'printer-main',
      };
      await db.printer_settings.put(updated);
      setPrintForm(updated);
      setIsPrinterDirty(false);
      onPrinterUpdated(updated);

      if (spreadsheetService.isConfigured()) {
        await spreadsheetService.pushPrinterSettings(updated);
      }
      if (supabaseService.isConfigured()) {
        await supabaseService.pushPrinterSettings(updated);
      }
      setSavePrinterSuccess(true);
      setTimeout(() => setSavePrinterSuccess(false), 4500);
    } catch (err: any) {
      console.error('Failed to save printer settings:', err);
    } finally {
      setIsSavingPrinter(false);
    }
  };

  // Connect Bluetooth Printer
  const handleConnectBluetooth = async () => {
    try {
      setIsBtConnecting(true);
      setBtStatus('Mencari perangkat Bluetooth di sekitar...');
      const dev = await printerService.requestAndConnect();
      setIsConnectedBt(true);
      setBtDeviceName(dev.name);
      setPrintForm((prev) => ({ ...prev, defaultPrinterName: dev.name }));
      await db.printer_settings.update(printForm.id, { defaultPrinterName: dev.name });
      setBtStatus(`Terhubung ke ${dev.name}!`);
      setTimeout(() => setBtStatus(null), 3500);
    } catch (err: any) {
      console.error(err);
      setBtStatus(`Gagal menghubungkan: ${err.message || 'Dibatalkan'}`);
      setTimeout(() => setBtStatus(null), 4500);
    } finally {
      setIsBtConnecting(false);
    }
  };

  const handleReconnectBluetooth = async () => {
    try {
      setIsBtConnecting(true);
      setBtStatus('Menghubungkan ulang printer...');
      const dev = await printerService.reconnect();
      setIsConnectedBt(true);
      setBtDeviceName(dev.name);
      setBtStatus(`Terhubung ke ${dev.name}!`);
      setTimeout(() => setBtStatus(null), 3500);
    } catch (err: any) {
      setBtStatus(`Gagal menyambung ulang: ${err.message || 'Error'}`);
      setTimeout(() => setBtStatus(null), 4000);
    } finally {
      setIsBtConnecting(false);
    }
  };

  const handleDisconnectBluetooth = async () => {
    await printerService.disconnect();
    setIsConnectedBt(false);
    setBtDeviceName(null);
    setBtStatus('Printer Bluetooth diputuskan.');
    setTimeout(() => setBtStatus(null), 3000);
  };

  const handleTestPrint = async () => {
    try {
      setBtStatus('Mengirim data test print...');
      await printerService.testPrint(storeForm, printForm);
      setBtStatus('Test print berhasil terkirim!');
      setTimeout(() => setBtStatus(null), 3000);
    } catch (err: any) {
      alert('Error saat test print: ' + err.message);
      setBtStatus(null);
    }
  };

  // Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserPin.trim()) return;

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: newUserName.trim(),
      pin: newUserPin.trim(),
      role: newUserRole,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await db.users.add(newUser);
    if (supabaseService.isConfigured()) {
      await supabaseService.pushUser(newUser);
    }
    setNewUserName('');
    setNewUserPin('');
    await loadUsers();
  };

  // Change PIN
  const handleUpdatePin = async () => {
    if (!editingUserPin || !pinChangeVal.trim()) return;
    await db.users.update(editingUserPin.id, { pin: pinChangeVal.trim() });
    const freshUser = await db.users.get(editingUserPin.id);
    if (freshUser && supabaseService.isConfigured()) {
      await supabaseService.pushUser(freshUser);
    }
    setEditingUserPin(null);
    setPinChangeVal('');
    await loadUsers();
    alert('PIN berhasil diperbarui dan disinkronkan.');
  };

  // Initiate Delete User
  const handleDeleteUser = (u: User) => {
    if (u.id === currentUser.id) {
      alert('Tidak dapat menghapus user yang sedang aktif digunakan.');
      return;
    }
    if (currentUser.role !== 'admin') {
      alert('Hanya akun Admin yang berhak menghapus pengguna.');
      return;
    }
    setUserToDelete(u);
  };

  // Confirm delete user action
  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    if (userToDelete.role === 'admin') {
      const remainingAdmins = users.filter((u) => u.role === 'admin' && u.id !== userToDelete.id);
      if (remainingAdmins.length === 0) {
        alert('Tidak dapat menghapus admin terakhir. Minimal harus ada 1 akun admin di sistem toko.');
        return;
      }
    }

    try {
      await db.users.delete(userToDelete.id);
      if (supabaseService.isConfigured()) {
        await supabaseService.deleteUser(userToDelete.id);
      }
      await db.audit_logs.add({
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'DELETE_USER',
        details: `Admin ${currentUser.name} menghapus pengguna: ${userToDelete.name} (${userToDelete.role})`,
      });
      const deletedName = userToDelete.name;
      setUserToDelete(null);
      await loadUsers();
      setDeleteNotice(`Pengguna "${deletedName}" berhasil dihapus.`);
      setTimeout(() => setDeleteNotice(null), 4000);
    } catch (err: any) {
      alert('Gagal menghapus pengguna: ' + err.message);
    }
  };

  // Database Backup
  const handleDownloadBackup = async () => {
    try {
      const json = await exportFullDatabase();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Backup-KasirKu-${storeSettings.storeName.replace(/\s+/g, '_')}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBackupStatus('Backup berhasil diekspor.');
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (err: any) {
      alert('Gagal mendownload backup: ' + err.message);
    }
  };

  // Database Restore
  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setConfirmAction({
      isOpen: true,
      title: 'Pulihkan Database dari File Backup?',
      message:
        'PERINGATAN: Memulihkan database dari file backup akan menimpa seluruh data toko saat ini. Lanjutkan proses pemulihan?',
      confirmLabel: 'Ya, Pulihkan Database',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const text = await file.text();
          await importFullDatabase(text);
          alert('Database berhasil dipulihkan! Halaman akan dimuat ulang.');
          window.location.reload();
        } catch (err: any) {
          alert('Gagal memulihkan database: ' + err.message);
        }
      },
    });
    e.target.value = '';
  };

  // Reset / Load Sample Data
  const handleResetSampleData = () => {
    setConfirmAction({
      isOpen: true,
      title: 'Muat Ulang Data Contoh Demo?',
      message: 'Seluruh menu contoh percontohan (F&B Cafe & Resto, bahan baku, resep HPP, dan transaksi) akan dimuat ulang. Data kustom saat ini akan diperbarui.',
      confirmLabel: 'Ya, Muat Ulang Demo',
      variant: 'warning',
      onConfirm: async () => {
        await seedSampleData();
        setConfirmAction((prev) => ({ ...prev, isOpen: false }));
        window.location.reload();
      },
    });
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 lg:p-6 space-y-6">
      {/* Top Header & Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tight">
            Pengaturan Sistem &amp; Toko
          </h2>
          <p className="text-xs text-slate-400">
            Konfigurasi profil toko, format nota, printer thermal bluetooth, kasir, dan backup database.
          </p>
        </div>

        {/* Tab Navigator */}
        <div className="flex items-center bg-slate-200/80 p-1 rounded-2xl gap-1 overflow-x-auto max-w-full">
          {[
            { id: 'store', label: 'Toko', icon: Building },
            { id: 'receipt', label: 'Nota', icon: Receipt },
            { id: 'printer', label: 'Printer BT', icon: Printer },
            { id: 'users', label: 'Kasir & PIN', icon: Users },
            { id: 'database', label: 'Database', icon: Database },
            { id: 'pwa', label: 'Aplikasi / Android', icon: Smartphone },
            { id: 'supabase', label: 'Basis Data Spreadsheet', icon: FileSpreadsheet },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  tab === item.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. STORE PROFILE TAB */}
      {tab === 'store' && (
        <form onSubmit={handleSaveStore} className="max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4 animate-in fade-in duration-200">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800">Identitas Usaha / Toko</h3>
            <span className="text-xs text-slate-400">Tampil pada struk nota belanja</span>
          </div>

          {/* Logo Toko & Logo Aplikasi Upload & Preset Block */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Logo Aplikasi &amp; Struk Kasir
                </label>
                <p className="text-[11px] text-slate-500">
                  Logo ini ditampilkan pada navigasi header aplikasi, layar PIN kasir, dan dicetak di atas nota pelanggan
                </p>
              </div>
              {storeForm.logo && (
                <button
                  type="button"
                  onClick={() => setStoreForm({ ...storeForm, logo: undefined })}
                  className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                >
                  Hapus Logo
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden p-2 shrink-0 shadow-2xs">
                {storeForm.logo ? (
                  <img
                    src={storeForm.logo}
                    alt="Logo Toko"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-400">
                    <Image className="w-6 h-6 mx-auto mb-1 opacity-40" />
                    <span className="text-[9px] font-bold block">Belum Ada Logo</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="logo-upload"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center gap-1.5 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Logo Sendiri</span>
                  </label>

                  <span className="text-[11px] text-slate-400 font-medium">atau pilih preset modern:</span>
                </div>

                {/* Preset Logo Quick Selectors */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {PRESET_LOGOS.map((p) => {
                    const isSelected = storeForm.logo === p.dataUrl;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setStoreForm({ ...storeForm, logo: p.dataUrl })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Logo akan otomatis dioptimasi untuk layar aplikasi berwarna dan printer thermal Bluetooth hitam-putih.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Toko *</label>
              <input
                type="text"
                required
                value={storeForm.storeName}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, storeName: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Slogan / Tagline</label>
              <input
                type="text"
                value={storeForm.slogan}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, slogan: e.target.value });
                  setIsStoreDirty(true);
                }}
                placeholder="Contoh: Murah, Lengkap, dan Terpercaya"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pemilik</label>
              <input
                type="text"
                value={storeForm.ownerName}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, ownerName: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Telepon Toko *</label>
              <input
                type="text"
                required
                value={storeForm.phone}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, phone: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp Toko</label>
              <input
                type="text"
                value={storeForm.whatsapp || ''}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, whatsapp: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Email Toko</label>
              <input
                type="email"
                value={storeForm.email || ''}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, email: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Alamat Lengkap</label>
            <input
              type="text"
              value={storeForm.address}
              onChange={(e) => {
                setStoreForm({ ...storeForm, address: e.target.value });
                setIsStoreDirty(true);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kota / Kabupaten</label>
              <input
                type="text"
                value={storeForm.city}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, city: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Provinsi</label>
              <input
                type="text"
                value={storeForm.province}
                onChange={(e) => {
                  setStoreForm({ ...storeForm, province: e.target.value });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Pesan Footer Nota</label>
            <textarea
              rows={2}
              value={storeForm.receiptFooter}
              onChange={(e) => {
                setStoreForm({ ...storeForm, receiptFooter: e.target.value });
                setIsStoreDirty(true);
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* FITUR PAJAK & PEMBULATAN HARGA */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Pajak Restoran / PB1 &amp; Pembulatan Kasir
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tarif Pajak Penjualan (%)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={storeForm.taxRate || 0}
                    onChange={(e) => {
                      setStoreForm({ ...storeForm, taxRate: Number(e.target.value) });
                      setIsStoreDirty(true);
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-bold"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                </div>
                <span className="text-[10px] text-slate-400">Contoh: 10% untuk Pajak Restoran (PB1) atau 11% PPN</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Simbol Mata Uang
                </label>
                <input
                  type="text"
                  value={storeForm.currencySymbol || 'Rp'}
                  onChange={(e) => {
                    setStoreForm({ ...storeForm, currencySymbol: e.target.value });
                    setIsStoreDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!storeForm.enableTax}
                  onChange={(e) => {
                    setStoreForm({ ...storeForm, enableTax: e.target.checked });
                    setIsStoreDirty(true);
                  }}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span>Aktifkan Pemungutan Pajak di Kasir POS</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={storeForm.enableRounding !== false}
                  onChange={(e) => {
                    setStoreForm({ ...storeForm, enableRounding: e.target.checked });
                    setIsStoreDirty(true);
                  }}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span>Aktifkan Pembulatan Nominal Kasir</span>
              </label>
            </div>
          </div>

          {/* FITUR PASSWORD WIFI CAFE & RESTO */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Akses Wi-Fi Gratis Pelanggan (Dicetak di Nota)
              </h4>
            </div>
            <p className="text-[11px] text-slate-500">
              Nama jaringan WiFi dan password akan otomatis dicetak pada nota belanja pengunjung cafe/toko Anda.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Wi-Fi (SSID)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: SenjaKopi_FreeWiFi"
                  value={storeForm.wifiName || ''}
                  onChange={(e) => {
                    setStoreForm({ ...storeForm, wifiName: e.target.value });
                    setIsStoreDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password Wi-Fi
                </label>
                <input
                  type="text"
                  placeholder="Contoh: kopisenjaenak"
                  value={storeForm.wifiPassword || ''}
                  onChange={(e) => {
                    setStoreForm({ ...storeForm, wifiPassword: e.target.value });
                    setIsStoreDirty(true);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Mode Bisnis & Manajemen Meja Cafe */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Mode Bisnis &amp; Tata Meja (F&amp;B / Cafe)
            </h4>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipe Bisnis:</label>
              <select
                value={storeForm.businessType || 'cafe'}
                onChange={(e) => {
                  setStoreForm({
                    ...storeForm,
                    businessType: e.target.value as 'cafe' | 'retail',
                  });
                  setIsStoreDirty(true);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-bold text-slate-800"
              >
                <option value="cafe">☕ Cafe, Coffee Shop, Resto &amp; F&amp;B (Dengan Fitur Meja &amp; Resep HPP)</option>
                <option value="retail">🏬 Toko Retail, Minimarket &amp; Sembako</option>
              </select>
            </div>

            {/* Table Management */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Daftar Meja Cafe (Dine In):
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(storeForm.tables || []).map((tbl, tIdx) => (
                  <span
                    key={tbl}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold"
                  >
                    <span>📍 {tbl}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newTables = [...(storeForm.tables || [])];
                        newTables.splice(tIdx, 1);
                        setStoreForm({ ...storeForm, tables: newTables });
                        setIsStoreDirty(true);
                      }}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Tambah meja baru (misal: Meja 13 / VIP 2)..."
                  id="new-table-input"
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('new-table-input') as HTMLInputElement;
                    if (el && el.value.trim()) {
                      const newT = el.value.trim();
                      const current = storeForm.tables || [];
                      if (!current.includes(newT)) {
                        setStoreForm({ ...storeForm, tables: [...current, newT] });
                        setIsStoreDirty(true);
                      }
                      el.value = '';
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  + Tambah Meja
                </button>
              </div>
            </div>
          </div>

          {/* Feedback Banners */}
          {saveStoreSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-2.5 text-emerald-900 animate-in fade-in duration-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-extrabold block">Profil Toko Berhasil Disimpan!</span>
                <span className="text-emerald-700">Data telah tersimpan di database lokal dan otomatis tersinkronisasi ke seluruh perangkat terhubung.</span>
              </div>
            </div>
          )}

          {storeSaveError && (
            <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl flex items-center gap-2.5 text-rose-900 animate-in fade-in duration-300">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-xs font-semibold">{storeSaveError}</div>
            </div>
          )}

          {isStoreDirty && !saveStoreSuccess && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl font-medium">
              💡 Ada perubahan profil toko yang belum disimpan. Klik tombol Simpan Profil Toko di bawah ini.
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              ID: {storeForm.id || 'store-main'}
            </span>
            <button
              type="submit"
              disabled={isSavingStore}
              className={`px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-2 ${
                isSavingStore ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isSavingStore ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Profil Toko</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* 2. RECEIPT SETTINGS TAB */}
      {tab === 'receipt' && (
        <form onSubmit={handleSavePrinterSettings} className="max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5 animate-in fade-in duration-200">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800">Pengaturan Tampilan Nota / Struk</h3>
            <span className="text-xs text-slate-400">Thermal 58mm &amp; 80mm</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ukuran Kertas Thermal</label>
              <select
                value={printForm.paperSize}
                onChange={(e) => setPrintForm({ ...printForm, paperSize: e.target.value as any })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-bold"
              >
                <option value="58mm">58 mm (Standar Kasir Portable)</option>
                <option value="80mm">80 mm (Printer Meja Lebar)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Ukuran Huruf (Font)</label>
              <select
                value={printForm.fontSize}
                onChange={(e) => setPrintForm({ ...printForm, fontSize: e.target.value as any })}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
              >
                <option value="small">Kecil (Kompak)</option>
                <option value="medium">Sedang (Rekomendasi)</option>
                <option value="large">Besar (Jelas)</option>
              </select>
            </div>
          </div>

          {/* Dedicated Logo on Receipt Section */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Logo pada Struk / Thermal Receipt
                </h4>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={printForm.showLogo}
                  onChange={(e) => setPrintForm({ ...printForm, showLogo: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <span>Aktifkan Logo di Nota</span>
              </label>
            </div>

            {printForm.showLogo && (
              <div className="pt-2 border-t border-slate-200/80 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Ukuran Logo di Struk:
                    </label>
                    <select
                      value={printForm.logoSize || 'medium'}
                      onChange={(e) =>
                        setPrintForm({
                          ...printForm,
                          logoSize: e.target.value as 'small' | 'medium' | 'large',
                        })
                      }
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white font-semibold"
                    >
                      <option value="small">Kecil (Compact ~30mm)</option>
                      <option value="medium">Sedang (Standar ~40mm)</option>
                      <option value="large">Besar (Menonjol ~48mm)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Filter Monokrom Thermal:
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 rounded-xl cursor-pointer text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={printForm.logoGrayscale !== false}
                        onChange={(e) =>
                          setPrintForm({ ...printForm, logoGrayscale: e.target.checked })
                        }
                        className="w-4 h-4 text-emerald-600 rounded"
                      />
                      <span>Kontras Tinggi Hitam-Putih</span>
                    </label>
                  </div>
                </div>

                {/* Logo Preview & Quick Preset */}
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200">
                  <div className="w-16 h-14 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center p-1 shrink-0 overflow-hidden">
                    {storeForm.logo ? (
                      <img
                        src={storeForm.logo}
                        alt="Logo Struk"
                        className="max-h-full max-w-full object-contain filter grayscale"
                      />
                    ) : (
                      <span className="text-[9px] text-slate-400 text-center font-bold">No Logo</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-800">
                      {storeForm.logo ? 'Logo aktif terpasang' : 'Belum memilih logo'}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {PRESET_LOGOS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setStoreForm({ ...storeForm, logo: p.dataUrl })}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            storeForm.logo === p.dataUrl
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {p.name.split(' ')[0]} {p.name.split(' ')[1]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Toggle Switches */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Elemen Lain yang Ditampilkan:
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {[
                { key: 'showCustomerName', label: 'Tampilkan Nama Pelanggan' },
                { key: 'showWifi', label: 'Tampilkan Info & Password WiFi' },
                { key: 'showAddress', label: 'Tampilkan Alamat Toko' },
                { key: 'showPhone', label: 'Tampilkan No. Telepon' },
                { key: 'showEmail', label: 'Tampilkan Email' },
                { key: 'showThankYou', label: 'Tampilkan Ucapan Terima Kasih' },
                { key: 'showFooter', label: 'Tampilkan Pesan Footer / Garansi' },
                { key: 'autoCut', label: 'Auto Cut Kertas (Jika didukung)' },
                { key: 'showHpp', label: 'Tampilkan HPP & Laba (Internal Struk)' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(printForm as any)[item.key] !== false}
                    onChange={(e) =>
                      setPrintForm({ ...printForm, [item.key]: e.target.checked })
                    }
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <span className="font-medium text-slate-700">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Live Preview Paper */}
          <div className="pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Pratinjau Hasil Cetak Thermal ({printForm.paperSize}):
            </h4>
            <div className="bg-slate-100 p-4 rounded-2xl flex justify-center">
              <div
                className={`bg-white p-4 rounded-xl shadow-md border border-slate-300 font-mono text-[11px] text-slate-800 transition-all ${
                  printForm.paperSize === '80mm' ? 'w-full max-w-[320px]' : 'w-full max-w-[260px]'
                }`}
              >
                {/* Logo Toko */}
                {printForm.showLogo && storeForm.logo && (
                  <div className="flex justify-center mb-2">
                    <img
                      src={storeForm.logo}
                      alt="Logo Preview"
                      className={`object-contain ${
                        printForm.logoSize === 'small'
                          ? 'h-8 max-w-[80px]'
                          : printForm.logoSize === 'large'
                          ? 'h-14 max-w-[140px]'
                          : 'h-11 max-w-[110px]'
                      } ${printForm.logoGrayscale !== false ? 'filter grayscale contrast-150' : ''}`}
                    />
                  </div>
                )}

                <div className="text-center font-bold text-xs">{storeForm.storeName}</div>
                {storeForm.slogan && <div className="text-center text-[10px] text-slate-500">{storeForm.slogan}</div>}
                {printForm.showAddress && storeForm.address && (
                  <div className="text-center text-[10px] text-slate-500 mt-0.5">
                    {storeForm.address}, {storeForm.city}
                  </div>
                )}
                {printForm.showPhone && storeForm.phone && (
                  <div className="text-center text-[10px] text-slate-500">Telp: {storeForm.phone}</div>
                )}
                <div className="border-b border-dashed border-slate-400 my-1.5" />

                <div className="flex justify-between text-[10px]">
                  <span>Nota: #TX-9021</span>
                  <span>14:30</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span>Kasir: {currentUser.name}</span>
                  <span>DINE IN</span>
                </div>
                {printForm.showCustomerName !== false && (
                  <div className="flex justify-between text-[10px] font-bold">
                    <span>Pelanggan:</span>
                    <span>Nadia Salsabila</span>
                  </div>
                )}
                <div className="border-b border-dashed border-slate-400 my-1.5" />

                <div className="space-y-1">
                  <div>
                    <div>Es Kopi Susu Gula Aren</div>
                    <div className="flex justify-between text-slate-600 pl-2">
                      <span>2 x 24.000</span>
                      <span>48.000</span>
                    </div>
                  </div>
                  <div>
                    <div>French Butter Croissant</div>
                    <div className="flex justify-between text-slate-600 pl-2">
                      <span>1 x 22.000</span>
                      <span>22.000</span>
                    </div>
                  </div>
                </div>

                <div className="border-b border-dashed border-slate-400 my-1.5" />
                <div className="flex justify-between font-bold text-xs">
                  <span>TOTAL:</span>
                  <span>Rp 70.000</span>
                </div>
                <div className="flex justify-between text-[10px] mt-0.5">
                  <span>Bayar (QRIS):</span>
                  <span>Rp 70.000</span>
                </div>

                {printForm.showHpp && (
                  <div className="text-[9px] text-slate-400 mt-1 pt-1 border-t border-dotted border-slate-300">
                    HPP: Rp 26.736 | Laba: Rp 43.264 (61.8%)
                  </div>
                )}

                {/* Pratinjau Kotak WiFi pada Nota */}
                {printForm.showWifi !== false && (storeForm.wifiName || storeForm.wifiPassword) && (
                  <div className="my-2 p-1.5 rounded-lg border border-dashed border-slate-400 text-center text-[10px] bg-slate-50">
                    <div className="font-bold flex items-center justify-center gap-1">
                      <Wifi className="w-3 h-3 text-emerald-600" />
                      <span>WIFI GRATIS</span>
                    </div>
                    {storeForm.wifiName && <div>SSID: {storeForm.wifiName}</div>}
                    {storeForm.wifiPassword && (
                      <div className="font-bold">Password: {storeForm.wifiPassword}</div>
                    )}
                  </div>
                )}

                <div className="border-b border-dashed border-slate-400 my-2" />
                {printForm.showThankYou && (
                  <div className="text-center font-bold text-[10px]">TERIMA KASIH ATAS KUNJUNGANNYA</div>
                )}
                {printForm.showFooter && storeForm.receiptFooter && (
                  <div className="text-center text-[9px] text-slate-500 mt-1">{storeForm.receiptFooter}</div>
                )}
              </div>
            </div>
          </div>

          {/* Feedback Banner */}
          {savePrinterSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-2.5 text-emerald-900 animate-in fade-in duration-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <span className="font-extrabold block">Pengaturan Nota Berhasil Disimpan!</span>
                <span className="text-emerald-700">Tampilan struk thermal telah diperbarui dan disinkronkan.</span>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={isSavingPrinter}
              className={`px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-2 ${
                isSavingPrinter ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isSavingPrinter ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Pengaturan Nota</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* 3. BLUETOOTH PRINTER TAB */}
      {tab === 'printer' && (
        <div className="max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bluetooth className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-800">Printer Thermal Bluetooth ESC/POS</h3>
            </div>
            {isConnectedBt ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Terhubung Aktif
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 font-medium text-xs">
                Tidak Terhubung
              </span>
            )}
          </div>

          {/* Browser Web Bluetooth API Check */}
          {!printerService.isSupported() && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-amber-900">Perhatian Browser Web Bluetooth</h5>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  Browser saat ini tidak mendukung Web Bluetooth API secara native. Gunakan <strong>Google Chrome</strong> pada Android, Windows, Mac, atau Chromebook dengan fitur Bluetooth aktif.
                  Anda tetap dapat mencetak struk secara instan menggunakan opsi cetak sistem browser standar.
                </p>
              </div>
            </div>
          )}

          {/* Connection status card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase">Perangkat Aktif:</span>
              <div className="text-base font-bold text-slate-900 mt-0.5 flex items-center gap-2">
                <Bluetooth className={`w-4 h-4 ${isConnectedBt ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{btDeviceName || printForm.defaultPrinterName || 'Belum Ada Printer Tersambung'}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Protokol ESC/POS Wireless (BLE / SPP) &bull; Ukuran Kertas: {printForm.paperSize}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {isConnectedBt ? (
                <>
                  <button
                    onClick={handleTestPrint}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    Test Print
                  </button>
                  <button
                    onClick={handleDisconnectBluetooth}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Putuskan
                  </button>
                </>
              ) : (
                <>
                  {printForm.defaultPrinterName && (
                    <button
                      onClick={handleReconnectBluetooth}
                      disabled={isBtConnecting}
                      className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Sambungkan Ulang
                    </button>
                  )}
                  <button
                    onClick={handleConnectBluetooth}
                    disabled={isBtConnecting}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>{isBtConnecting ? 'Mencari Perangkat...' : 'Cari & Hubungkan Printer'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {btStatus && (
            <div className="p-3 rounded-xl bg-blue-50 text-blue-900 text-xs font-semibold text-center border border-blue-200 animate-pulse">
              {btStatus}
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <h5 className="font-bold text-slate-800">Petunjuk Koneksi Bluetooth:</h5>
            <ol className="list-decimal pl-4 space-y-1 text-slate-500 leading-relaxed">
              <li>Nyalakan printer thermal Bluetooth Anda (posisi switch ON).</li>
              <li>Pastikan Bluetooth di HP / Tablet / Laptop Anda telah aktif.</li>
              <li>Klik tombol <strong>"Cari &amp; Hubungkan Printer"</strong> di atas.</li>
              <li>Pilih nama printer Anda (misal: POS-58, POS-80, MPT-II, RPP02N, Panda, Eppos, Iware, Goojprt).</li>
              <li>Klik <strong>Test Print</strong> untuk memverifikasi cetakan struk thermal.</li>
            </ol>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] leading-relaxed mt-2">
              💡 <strong>Tips Printer Thermal:</strong> KasirKu POS mendukung standar protokol ESC/POS via Web Bluetooth langsung tanpa driver pihak ketiga. Jika Anda menggunakan printer USB kabel, struk otomatis tercetak via dialog cetak browser standar.
            </div>
          </div>
        </div>
      )}

      {/* 4. USERS & CASHIERS TAB */}
      {tab === 'users' && (
        <div className="max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Kelola Pengguna Kasir &amp; PIN</h3>
              <p className="text-xs text-slate-400">Atur hak akses staf dan kata sandi PIN kasir</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPins(!showPins)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPins ? 'Sembunyikan PIN' : 'Lihat Semua PIN'}</span>
            </button>
          </div>

          {/* Security PIN Policy Notice */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-slate-800">Keamanan Akses PIN Kasir:</div>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Fitur password default dinonaktifkan demi keamanan. Setiap staf kasir &amp; admin menggunakan PIN unik pribadi. PIN dirahasiakan dan tidak ditampilkan di layar login.
              </p>
            </div>
          </div>

          {/* Quick Active User PIN Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-transparent border border-emerald-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                {currentUser.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">{currentUser.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      currentUser.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : currentUser.role === 'manager'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {currentUser.role === 'admin'
                      ? '👑 Admin / Owner'
                      : currentUser.role === 'manager'
                      ? '👔 Manager'
                      : '🛒 Kasir'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  PIN Aktif Anda:{' '}
                  <strong className="font-mono text-slate-900 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                    {showPins ? currentUser.pin : '••••'}
                  </strong>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditingUserPin(currentUser)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Ganti PIN Saya</span>
            </button>
          </div>

          {/* Form Add User */}
          <form onSubmit={handleAddUser} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <h4 className="font-bold text-xs text-slate-700 uppercase">Tambah Pengguna / Staf Baru</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                required
                placeholder="Nama Pengguna"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
              />
              <input
                type="password"
                maxLength={6}
                required
                placeholder="PIN (4-6 angka)"
                value={newUserPin}
                onChange={(e) => setNewUserPin(e.target.value)}
                className="px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-mono"
              />
              <div className="flex gap-2">
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="flex-1 px-2 py-2 text-xs border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value="cashier">🛒 Kasir (Hanya POS)</option>
                  <option value="manager">👔 Manager (Akses Luas kecuali Lap &amp; Setting)</option>
                  <option value="admin">👑 Owner / Admin (Penuh)</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
                >
                  + Tambah
                </button>
              </div>
            </div>
          </form>

          {/* User List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-700">Daftar Pengguna Aktif ({users.length}):</h4>
              <span className="text-[11px] text-slate-400">Gunakan "Ubah PIN" untuk mengganti PIN staf</span>
            </div>

            {users.map((u) => {
              const isCurrent = u.id === currentUser.id;
              const isAdmin = u.role === 'admin';
              const isManager = u.role === 'manager';
              const roleIcon = isAdmin ? '👑' : isManager ? '👔' : '🛒';
              const roleTitle = isAdmin ? 'Admin / Owner' : isManager ? 'Manager' : 'Kasir';
              const roleBadgeColor = isAdmin
                ? 'bg-purple-100 text-purple-800 border-purple-200'
                : isManager
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : 'bg-emerald-100 text-emerald-800 border-emerald-200';

              return (
                <div
                  key={u.id}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between transition-all ${
                    isCurrent ? 'bg-emerald-50/50 border-emerald-300' : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-800">
                        {roleIcon} {u.name}
                      </span>
                      {isCurrent && (
                        <span className="px-2 py-0.2 rounded bg-emerald-600 text-white text-[10px] font-bold">
                          Sedang Aktif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        Role:{' '}
                        <strong className={`px-1.5 py-0.2 rounded font-extrabold text-[10px] uppercase border ${roleBadgeColor}`}>
                          {roleTitle}
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        PIN:{' '}
                        <strong className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                          {showPins ? u.pin : '••••'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!isCurrent && (
                      <button
                        onClick={() => onUserSwitched(u)}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
                      >
                        Beralih Akun
                      </button>
                    )}
                    <button
                      onClick={() => setEditingUserPin(u)}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                      title="Ganti PIN / Password"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span>Ubah PIN</span>
                    </button>
                    {!isCurrent && currentUser.role === 'admin' && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="px-2.5 py-1.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                        title={`Hapus Akun ${u.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Delete Notice Banner */}
          {deleteNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-in fade-in">
              <span>{deleteNotice}</span>
              <button
                onClick={() => setDeleteNotice(null)}
                className="text-emerald-600 hover:text-emerald-800 cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
          )}

          {/* Dedicated Delete User Confirmation Modal */}
          {userToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
              <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-base text-slate-900">Hapus Pengguna</h3>
                    <p className="text-xs text-slate-500">Konfirmasi penghapusan akun pengguna</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Nama Pengguna:</span>
                    <span className="text-xs font-bold text-slate-900">{userToDelete.name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Peran / Role:</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                        userToDelete.role === 'admin'
                          ? 'bg-purple-100 text-purple-900 border border-purple-300'
                          : userToDelete.role === 'manager'
                          ? 'bg-blue-100 text-blue-900 border border-blue-300'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      }`}
                    >
                      {userToDelete.role === 'admin'
                        ? 'Administrator'
                        : userToDelete.role === 'manager'
                        ? 'Manager'
                        : 'Kasir'}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Apakah Anda yakin ingin menghapus akun <strong>{userToDelete.name}</strong>? Pengguna ini tidak akan dapat login lagi ke sistem.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setUserToDelete(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteUser}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Ya, Hapus Pengguna</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Dedicated Change PIN Modal */}
          {editingUserPin && (
            <ChangePinModal
              isOpen={!!editingUserPin}
              targetUser={editingUserPin}
              currentUser={currentUser}
              onSuccess={async (updated) => {
                await loadUsers();
                if (currentUser.id === updated.id) {
                  onUserSwitched(updated);
                }
              }}
              onClose={() => setEditingUserPin(null)}
            />
          )}
        </div>
      )}

      {/* 5. DATABASE BACKUP & RESTORE TAB */}
      {tab === 'database' && (
        <div className="max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6 animate-in fade-in duration-200">
          <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800">Backup &amp; Restore Database Lokal</h3>
            <span className="text-xs text-slate-400">IndexedDB Offline Storage</span>
          </div>

          {backupStatus && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold text-center">
              {backupStatus}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Backup Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2">
                  <Download className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900">Backup Data</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Unduh seluruh produk, stok, transaksi kasir, dan pengaturan ke file JSON yang aman di perangkat Anda.
                </p>
              </div>
              <button
                onClick={handleDownloadBackup}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Download Backup Database
              </button>
            </div>

            {/* Restore Card */}
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-slate-900">Restore Data</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Pulihkan kembali database dari file backup sebelumnya. Data saat ini akan digantikan oleh isi file.
                </p>
              </div>
              <label className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md text-center cursor-pointer transition-colors">
                <span>Pilih File Backup (.json)</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreFile}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Reset / Reload Sample Data */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h5 className="font-bold text-xs text-slate-800">Muat Ulang Data Contoh (Demo)</h5>
              <p className="text-[11px] text-slate-400">
                Isi ulang 20 produk retail, 5 kategori, 10 transaksi, dan data mutasi stok.
              </p>
            </div>
            <button
              onClick={handleResetSampleData}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Muat Ulang Data Contoh</span>
            </button>
          </div>
        </div>
      )}

      {/* 6. PWA & ANDROID APP INSTALL TAB */}
      {tab === 'pwa' && (
        <div className="max-w-3xl space-y-5 animate-in fade-in duration-200">
          {/* Main Action Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-emerald-600" />
                  <span>Pasang Aplikasi di HP Android (PWA)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Jadikan KasirKu aplikasi mandiri yang terpasang di HP Android, tablet, atau komputer Anda.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                Resmi PWA
              </span>
            </div>

            {/* PWA Install Button Widget */}
            <PWAInstallButton variant="settings" />

            {/* URL Sharing / Copy Section */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                Link Akses Aplikasi (Buka di Google Chrome Android):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={window.location.href}
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-600 select-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopiedPwaUrl(true);
                    setTimeout(() => setCopiedPwaUrl(false), 2500);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0"
                >
                  {copiedPwaUrl ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Link</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Bagikan link ini ke ponsel kasir atau tim Anda agar mereka dapat memasang aplikasi di ponsel masing-masing.
              </p>
            </div>
          </div>

          {/* Android Step-by-Step Guide Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Langkah-Langkah Pasang di HP Android (Google Chrome)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                  1
                </div>
                <h5 className="font-bold text-xs text-slate-800">Buka di Google Chrome</h5>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Buka browser <strong>Google Chrome</strong> di HP Android Anda, lalu masukkan atau paste link aplikasi KasirKu ini.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                  2
                </div>
                <h5 className="font-bold text-xs text-slate-800">Ketuk Menu Titik Tiga (⋮)</h5>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Pada sudut kanan atas Google Chrome, ketuk ikon titik tiga <strong>(⋮)</strong> untuk membuka opsi menu browser.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center text-sm shadow-xs">
                  3
                </div>
                <h5 className="font-bold text-xs text-slate-800">Pilih "Install Aplikasi"</h5>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Pilih menu <strong>"Install aplikasi"</strong> (atau <em>"Tambahkan ke Layar Utama"</em>), lalu konfirmasi klik <strong>Install</strong>.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/70 text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Setelah terpasang, ikon <strong>KasirKu</strong> akan muncul di beranda dan laci aplikasi Android Anda. Saat dibuka, aplikasi akan berjalan layar penuh (fullscreen) tanpa bilah URL browser.
              </span>
            </div>
          </div>

          {/* Key Advantages of PWA */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Keunggulan Aplikasi PWA KasirKu</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-emerald-600">⚡</span>
                  <span>100% Offline-First</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Database lokal IndexedDB tetap bisa melayani transaksi kasir, cetak nota, dan perhitungan HPP meski tidak ada koneksi internet.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-emerald-600">🖨️</span>
                  <span>Printer Bluetooth Android</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Mendukung printer thermal Bluetooth standar 58mm &amp; 80mm langsung dari ponsel Android Anda via Web Bluetooth API.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-emerald-600">📷</span>
                  <span>Scanner Barcode Kamera</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Pindai barcode produk langsung memanfaatkan kamera belakang smartphone Android tanpa perlu alat scanner fisik tambahan.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <span className="text-emerald-600">🚀</span>
                  <span>Ringan &amp; Hemat Kuota</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ukuran aplikasi di bawah 2MB, tidak memenuhi ruang penyimpanan smartphone, dan aset statis otomatis tersimpan di Service Worker Cache.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. BASIS DATA SPREADSHEET (GOOGLE SHEETS) TAB */}
      {tab === 'supabase' && (
        <div className="max-w-3xl space-y-5 animate-in fade-in duration-200">
          {/* Quick Pairing & LIVE QR Code Showcase Banner */}
          <div className="bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 p-5 rounded-3xl text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-5 border border-emerald-500/20">
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              {settingsQrUrl ? (
                <div className="p-2.5 bg-white rounded-2xl shadow-lg shrink-0 flex flex-col items-center border-2 border-emerald-400">
                  <img
                    src={settingsQrUrl}
                    alt="QR Code Hubungkan HP Kasir"
                    className="w-28 h-28 object-contain rounded-lg"
                  />
                  <span className="text-[10px] font-black text-emerald-950 mt-1 flex items-center gap-1">
                    <QrCode className="w-3 h-3 text-emerald-600" />
                    <span>Scan HP Kasir</span>
                  </span>
                </div>
              ) : (
                <div className="w-28 h-28 bg-white/10 rounded-2xl flex items-center justify-center shrink-0 border border-white/20">
                  <QrCode className="w-10 h-10 text-emerald-400 animate-pulse" />
                </div>
              )}

              <div className="space-y-1.5 text-center sm:text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Sinkronisasi Otomatis Antar-Perangkat
                </span>
                <h4 className="font-extrabold text-base flex items-center justify-center sm:justify-start gap-2">
                  <QrCode className="w-5 h-5 text-emerald-400" />
                  <span>Hubungkan HP Kasir Lain (QR Code Langsung)</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed max-w-md">
                  Pindai QR Code di samping dengan kamera HP kasir kedua. Seluruh nama toko, logo, meja, wifi, tarif pajak, dan format struk akan langsung disamakan dan tersambung ke spreadsheet.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowDeviceLinkModal(true)}
              className="w-full md:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-md transition cursor-pointer shrink-0 flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              <span>Buka QR Layar Penuh &amp; Tautan</span>
            </button>
          </div>

          {/* Main Google Spreadsheet Database Card */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <span>Basis Data Google Spreadsheet (Google Sheets)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gunakan Google Spreadsheet sebagai basis data utama toko. Seluruh transaksi kasir, stok, resep, dan pengaturan otomatis tersinkron.
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  spreadsheetService.isConfigured()
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                }`}
              >
                {spreadsheetService.isConfigured() ? '🟢 Spreadsheet Tersambung' : '⚪ Belum Dikonfigurasi'}
              </span>
            </div>

            {/* Notification alert */}
            {sheetStatus && (
              <div
                className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2.5 ${
                  sheetStatus.toLowerCase().includes('berhasil') || sheetStatus.toLowerCase().includes('tersambung')
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{sheetStatus}</span>
              </div>
            )}

            {/* Google Account Section */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-700">
                  <Globe className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Akun Google Terhubung</span>
                  <span className="text-[11px] text-slate-500">
                    {googleUser
                      ? `${googleUser.email || googleUser.displayName} (Tersambung ke Google Drive & Sheets)`
                      : 'Masuk dengan akun Google untuk akses langsung ke Spreadsheet Anda'}
                  </span>
                </div>
              </div>

              {googleUser ? (
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Keluar Akun Google</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoggingInGoogle}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2 0 10.04 0 12s.46 3.8 1.27 5.42l4.01-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>{isLoggingInGoogle ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                </button>
              )}
            </div>

            {/* Quick 1-Click Create Spreadsheet */}
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-extrabold text-emerald-900 block">
                  1-Klik: Buat File Spreadsheet Baru di Google Drive
                </span>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Otomatis membuat file Google Sheets "KasirKu POS Database" lengkap dengan 12 sheet terstruktur dan menyalin seluruh menu &amp; pengaturan.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateNewSpreadsheet}
                disabled={isCreatingSheet}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isCreatingSheet ? 'Membuat Spreadsheet...' : 'Buat Spreadsheet Baru'}</span>
              </button>
            </div>

            {/* Configuration Form for Existing Spreadsheet */}
            <form onSubmit={handleSaveSheetConfig} className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Atau Tautkan URL / ID Google Spreadsheet:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer shrink-0"
                  >
                    Simpan Tautan
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Anda dapat menyalin URL langsung dari browser Google Spreadsheet Anda.
                </span>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  {sheetConfig.lastSyncedAt && (
                    <span className="text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                      Terakhir Disinkronkan:{' '}
                      <strong className="text-slate-700 font-mono">
                        {new Date(sheetConfig.lastSyncedAt).toLocaleString('id-ID')}
                      </strong>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {sheetConfig.spreadsheetId && (
                    <a
                      href={spreadsheetService.getSpreadsheetUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Buka di Google Sheets</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={handleTriggerSheetSync}
                    disabled={isSyncingSheet || !spreadsheetService.isConfigured()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                    <span>{isSyncingSheet ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Guide Card: How Spreadsheet Database Works */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h4 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span>Keunggulan Basis Data Google Spreadsheet &amp; Link Antar-Perangkat</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block text-xs">1. Data Aman di Akun Anda</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Semua transaksi, penjualan, dan resep HPP tersimpan di Google Spreadsheet Anda sendiri, dapat dibuka kapan pun lewat laptop atau HP.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block text-xs">2. Pengaturan Sama Persis</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Saat menghubungkan HP kasir 2 atau tablet kasir 3, seluruh profil toko, logo, meja, wifi, dan printer otomatis disalin sama persis.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block text-xs">3. Real-time Multi-Perangkat</span>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Kasir 1 dan Kasir 2 dapat melayani pesanan secara bersamaan dan semua penjualan otomatis tercatat rapi di lembar Spreadsheet.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SQL Script Modal */}
      {showSqlScript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h4 className="font-bold text-sm">Skrip SQL Skema Supabase</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlScript(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-600">
                Salin skrip ini dan jalankan di menu <strong>SQL Editor</strong> dashboard Supabase Anda:
              </p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(supabaseService.getSqlSchemaScript());
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Tersalin!' : 'Salin Skrip SQL'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-[11px] text-emerald-400">
              <pre className="whitespace-pre-wrap">{supabaseService.getSqlSchemaScript()}</pre>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSqlScript(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs text-slate-700 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM ACTION MODAL */}
      <ConfirmModal
        isOpen={confirmAction.isOpen}
        title={confirmAction.title}
        message={confirmAction.message}
        confirmLabel={confirmAction.confirmLabel}
        variant={confirmAction.variant}
        onConfirm={confirmAction.onConfirm}
        onCancel={() => setConfirmAction((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* DEVICE LINK MODAL */}
      <DeviceLinkModal
        isOpen={showDeviceLinkModal}
        onClose={() => setShowDeviceLinkModal(false)}
        storeSettings={storeForm}
        printerSettings={printForm}
        onApplySettings={(st, pr) => {
          setStoreForm(st);
          setPrintForm(pr);
          onStoreUpdated(st);
          onPrinterUpdated(pr);
        }}
        onSyncSuccess={() => {
          setSheetConfig(spreadsheetService.getConfig());
          setSupabaseForm(supabaseService.getConfig());
        }}
      />
    </div>
  );
};
