import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  Laptop,
  LogOut,
  PlusCircle,
  QrCode,
  RefreshCw,
  Share2,
  Sliders,
  Smartphone,
  Tablet,
  Upload,
  UserCheck,
  Wifi,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { db, exportFullDatabase, importFullDatabase } from '../../db/db';
import {
  getAccessToken,
  getGoogleUser,
  logoutGoogle,
  signInWithGoogle,
} from '../../services/googleAuth';
import {
  SpreadsheetConfig,
  spreadsheetService,
} from '../../services/spreadsheet';
import { PrinterSettings, StoreSettings } from '../../types';

interface DeviceLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncSuccess?: () => void;
  storeSettings?: StoreSettings;
  printerSettings?: PrinterSettings;
  onApplySettings?: (store: StoreSettings, printer: PrinterSettings) => void;
}

export const DeviceLinkModal: React.FC<DeviceLinkModalProps> = ({
  isOpen,
  onClose,
  onSyncSuccess,
  storeSettings,
  printerSettings,
  onApplySettings,
}) => {
  const [tab, setTab] = useState<'share' | 'join' | 'spreadsheet' | 'transfer'>('share');
  const [isConfigured, setIsConfigured] = useState(spreadsheetService.isConfigured());
  const [config, setConfig] = useState<SpreadsheetConfig>(spreadsheetService.getConfig());
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Google Auth User
  const [googleUser, setGoogleUser] = useState(getGoogleUser());
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);

  // QR Code canvas ref & Image Data URL
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isEnlargedQr, setIsEnlargedQr] = useState(false);

  // Copy states
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Manual join form state
  const [joinInput, setJoinInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Existing Spreadsheet ID / URL input
  const [existingSheetInput, setExistingSheetInput] = useState(config.spreadsheetUrl || config.spreadsheetId || '');

  // Fast file transfer state
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local settings fallback if not provided via props
  const [localStore, setLocalStore] = useState<StoreSettings | undefined>(storeSettings);
  const [localPrinter, setLocalPrinter] = useState<PrinterSettings | undefined>(printerSettings);

  useEffect(() => {
    if (storeSettings) setLocalStore(storeSettings);
    if (printerSettings) setLocalPrinter(printerSettings);
  }, [storeSettings, printerSettings]);

  useEffect(() => {
    if (!localStore || !localPrinter) {
      db.store_settings.get('store-main').then((st) => {
        if (st) setLocalStore(st);
      });
      db.printer_settings.get('printer-main').then((pr) => {
        if (pr) setLocalPrinter(pr);
      });
    }
  }, []);

  useEffect(() => {
    const unsub = spreadsheetService.addSyncListener((syncing, lastSync, err) => {
      setIsSyncing(syncing);
      setConfig(spreadsheetService.getConfig());
      setIsConfigured(spreadsheetService.isConfigured());
      setGoogleUser(getGoogleUser());
      if (err) {
        setStatusMsg({ text: err, type: 'error' });
      }
    });
    return () => unsub();
  }, []);

  // Generate QR Code data URL & canvas whenever modal opens or settings change
  useEffect(() => {
    let isMounted = true;
    if (isOpen && localStore && localPrinter) {
      setIsGeneratingQr(true);
      const linkUrl = spreadsheetService.generateLinkUrl(localStore, localPrinter);
      if (linkUrl) {
        QRCode.toDataURL(linkUrl, {
          width: 320,
          margin: 1,
          color: {
            dark: '#064e3b',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'M',
        })
          .then((url) => {
            if (isMounted) {
              setQrDataUrl(url);
              setIsGeneratingQr(false);
            }
          })
          .catch((err) => {
            console.error('Error generating QR Data URL:', err);
            if (isMounted) setIsGeneratingQr(false);
          });

        if (qrCanvasRef.current) {
          QRCode.toCanvas(
            qrCanvasRef.current,
            linkUrl,
            {
              width: 200,
              margin: 1,
              color: {
                dark: '#064e3b',
                light: '#ffffff',
              },
            },
            (err) => {
              if (err) console.error('Error drawing QR code to canvas:', err);
            }
          );
        }
      }
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, tab, localStore, localPrinter, isConfigured, config]);

  if (!isOpen) return null;

  const currentStore = localStore || {
    id: 'store-main',
    storeName: 'KasirKu POS',
    address: '',
    city: '',
    province: '',
    phone: '',
    ownerName: '',
    slogan: '',
    receiptFooter: '',
    currencySymbol: 'Rp',
    taxRate: 10,
    enableTax: false,
    enableRounding: true,
    isOnboarded: true,
  };

  const currentPrinter = localPrinter || {
    id: 'printer-main',
    paperSize: '58mm' as const,
    copies: 1,
    margin: 0,
    fontSize: 'medium' as const,
    showLogo: true,
    showAddress: true,
    showPhone: true,
    showEmail: false,
    showWebsite: false,
    showQrCode: true,
    showBarcode: false,
    showFooter: true,
    showThankYou: true,
    showHpp: false,
    showProfit: false,
    autoCut: false,
  };

  const handleCopyLink = () => {
    const link = spreadsheetService.generateLinkUrl(currentStore, currentPrinter);
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = () => {
    const code = spreadsheetService.generatePairingCode(currentStore, currentPrinter);
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleSyncNow = async () => {
    setStatusMsg({ text: 'Menyinkronkan data dengan Google Spreadsheet...', type: 'info' });
    const res = await spreadsheetService.sync();
    if (res.success) {
      setStatusMsg({ text: res.message, type: 'success' });
      if (onSyncSuccess) onSyncSuccess();
    } else {
      setStatusMsg({ text: res.message, type: 'error' });
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await signInWithGoogle();
      setGoogleUser(res.user);
      setStatusMsg({
        text: `Berhasil terhubung dengan Google Account (${res.user.email || res.user.displayName}).`,
        type: 'success',
      });
    } catch (err: any) {
      setStatusMsg({
        text: 'Gagal login Google: ' + (err.message || 'Dibatalkan'),
        type: 'error',
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setStatusMsg({ text: 'Akun Google telah dikeluarkan.', type: 'info' });
  };

  const handleCreateNewSpreadsheet = async () => {
    setIsCreatingSheet(true);
    setStatusMsg({
      text: 'Membuat file Google Spreadsheet "KasirKu POS Database" di Google Drive Anda...',
      type: 'info',
    });
    try {
      const storeName = currentStore.storeName || 'Toko';
      const result = await spreadsheetService.createDatabaseSpreadsheet(
        `KasirKu POS Database - ${storeName}`
      );
      setConfig(spreadsheetService.getConfig());
      setIsConfigured(true);
      setStatusMsg({
        text: `🎉 Berhasil membuat Spreadsheet baru! Seluruh tabel toko telah disiapkan dan disinkronkan.`,
        type: 'success',
      });
      if (onSyncSuccess) onSyncSuccess();
    } catch (err: any) {
      setStatusMsg({
        text: 'Gagal membuat Google Spreadsheet: ' + (err.message || 'Terjadi kesalahan'),
        type: 'error',
      });
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleSaveExistingSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingSheetInput.trim()) return;

    let sheetId = existingSheetInput.trim();
    // Extract ID from full URL if pasted: e.g. https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
    const urlMatch = sheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch && urlMatch[1]) {
      sheetId = urlMatch[1];
    }

    spreadsheetService.saveConfig({
      spreadsheetId: sheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      autoSync: true,
    });
    setConfig(spreadsheetService.getConfig());
    setIsConfigured(true);

    setStatusMsg({ text: 'Menyinkronkan data dengan Google Spreadsheet...', type: 'info' });
    const syncRes = await spreadsheetService.sync();
    if (syncRes.success) {
      setStatusMsg({
        text: '🎉 Berhasil terhubung ke Google Spreadsheet! Data lokal dan cloud kini sinkron.',
        type: 'success',
      });
      if (onSyncSuccess) onSyncSuccess();
    } else {
      setStatusMsg({ text: syncRes.message, type: 'error' });
    }
  };

  const handleJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;

    setIsJoining(true);
    setStatusMsg({ text: 'Menerapkan pengaturan dan menghubungkan database...', type: 'info' });

    try {
      const parsed = spreadsheetService.parsePairingCode(joinInput.trim());
      if (!parsed) {
        setStatusMsg({
          text: 'Format Kode Pairing atau Tautan tidak valid. Pastikan Anda menyalin kode lengkap dari perangkat pertama.',
          type: 'error',
        });
        setIsJoining(false);
        return;
      }

      // 1. Immediately apply the store settings so they are IDENTICAL to previous device
      if (parsed.storeSettings) {
        await db.store_settings.put(parsed.storeSettings);
        setLocalStore(parsed.storeSettings);
      }

      // 2. Immediately apply printer settings so they are IDENTICAL to previous device
      if (parsed.printerSettings) {
        await db.printer_settings.put(parsed.printerSettings);
        setLocalPrinter(parsed.printerSettings);
      }

      // Trigger parent callback to update App.tsx state
      if (onApplySettings && parsed.storeSettings && parsed.printerSettings) {
        onApplySettings(parsed.storeSettings, parsed.printerSettings);
      }

      // 3. Save spreadsheet configuration
      if (parsed.spreadsheetConfig) {
        spreadsheetService.saveConfig(parsed.spreadsheetConfig);
        setIsConfigured(true);
        setConfig(spreadsheetService.getConfig());
      }

      // 4. Run sync if spreadsheet configured
      if (parsed.spreadsheetConfig?.spreadsheetId) {
        await spreadsheetService.sync();
      }

      // 5. Emit custom sync event
      spreadsheetService.dispatchLocalSync('all');

      setStatusMsg({
        text: '🎉 Berhasil terhubung! Seluruh pengaturan toko (nama, logo, meja, wifi, pajak) dan printer telah disamakan dengan perangkat sebelumnya.',
        type: 'success',
      });
      setJoinInput('');
      if (onSyncSuccess) onSyncSuccess();
    } catch (err: any) {
      setStatusMsg({
        text: 'Gagal menghubungkan perangkat: ' + (err.message || 'Terjadi kesalahan'),
        type: 'error',
      });
    } finally {
      setIsJoining(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      setTransferStatus('Menyiapkan file transfer data...');
      const json = await exportFullDatabase();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KasirKu-Snapshot-Toko-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setTransferStatus('File snapshot berhasil diunduh! Kirimkan file ini via WhatsApp / Bluetooth ke HP lain.');
    } catch (err: any) {
      setTransferStatus('Gagal export snapshot: ' + err.message);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTransferStatus('Membaca file data...');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        await importFullDatabase(content);
        setTransferStatus('Data dan seluruh pengaturan berhasil disinkronkan ke perangkat ini!');
        if (onSyncSuccess) onSyncSuccess();
      } catch (err: any) {
        setTransferStatus('Gagal import data: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200 select-none">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base leading-tight">
                  Hubungkan Antar-Perangkat &amp; Spreadsheet
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isConfigured
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {isConfigured ? '🟢 Spreadsheet Aktif' : '⚪ Mode Lokal'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Pengaturan toko sama persis di seluruh perangkat &amp; basis data tersimpan di Google Spreadsheet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-2 gap-2 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setTab('share')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              tab === 'share'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>Bagikan QR / Tautan</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('join')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              tab === 'join'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Hubungkan Perangkat Ini</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('spreadsheet')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              tab === 'spreadsheet'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Basis Data Spreadsheet</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('transfer')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-b-2 ${
              tab === 'transfer'
                ? 'bg-white text-emerald-700 border-emerald-600 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 border-transparent'
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>Transfer Cepat Offline</span>
          </button>
        </div>

        {/* Status Notification Banner */}
        {statusMsg && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between gap-2 border-b ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : statusMsg.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />}
              {statusMsg.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />}
              {statusMsg.type === 'info' && <RefreshCw className="w-4 h-4 shrink-0 animate-spin text-blue-600" />}
              <span>{statusMsg.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMsg(null)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Modal Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: BAGIKAN LINK / QR CODE */}
          {tab === 'share' && (
            <div className="space-y-4">
              {/* Highlight Banner: Identical Settings Guarantee */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-600 text-white shrink-0 mt-0.5">
                  <Sliders className="w-4 h-4" />
                </div>
                <div className="text-xs text-emerald-950 space-y-1">
                  <span className="font-extrabold block text-sm text-emerald-900">
                    Pengaturan Otomatis Sama Persis di Perangkat Baru!
                  </span>
                  <p className="leading-relaxed text-emerald-800">
                    Saat HP kasir atau tablet lain memindai QR Code atau membuka tautan di bawah, seluruh
                    <strong> Nama Toko ({currentStore.storeName})</strong>, <strong>Logo Toko</strong>,
                    <strong> Pengaturan Pajak ({currentStore.taxRate}%)</strong>, <strong>Daftar Meja</strong>,
                    <strong> WiFi Toko</strong>, dan <strong>Format Printer/Struk</strong> akan langsung disalin dan sama persis.
                  </p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-6 bg-slate-50 p-5 rounded-3xl border border-slate-200">
                {/* QR Code Container with High-Visibility Rendering */}
                <div className="flex flex-col items-center bg-white p-4 rounded-2xl shadow-md border-2 border-emerald-500/30 shrink-0">
                  <div className="relative flex items-center justify-center p-2 bg-emerald-50/50 rounded-xl border border-emerald-100">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="QR Code Hubungkan Antar Perangkat"
                        className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg"
                      />
                    ) : (
                      <canvas ref={qrCanvasRef} className="rounded-lg shadow-2xs" />
                    )}

                    {isGeneratingQr && (
                      <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-black text-emerald-900 mt-2.5 flex items-center gap-1.5 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200">
                    <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Pindai dengan Kamera HP Kasir</span>
                  </span>

                  {/* QR Action Buttons */}
                  <div className="flex items-center gap-1.5 mt-2.5 w-full">
                    {qrDataUrl && (
                      <a
                        href={qrDataUrl}
                        download={`QR-Hubungkan-${currentStore.storeName.replace(/\s+/g, '_')}.png`}
                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold text-center transition cursor-pointer"
                        title="Simpan gambar QR Code ke galeri"
                      >
                        📥 Unduh QR
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsEnlargedQr(true)}
                      className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold text-center transition cursor-pointer"
                    >
                      🔍 Perbesar
                    </button>
                  </div>
                </div>

                {/* Instructions & 1-Click Link */}
                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-800">
                      Tautkan HP / Tablet Kasir Kedua
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Arahkan kamera HP kasir kedua ke QR Code di samping atau kirimkan tautan langsung di bawah.
                      Perangkat baru akan langsung tersinkron dan memiliki pengaturan yang persis sama.
                    </p>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Tautan Cepat 1-Klik (Buka di browser HP kedua):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={spreadsheetService.generateLinkUrl(currentStore, currentPrinter)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-700 truncate"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Tersalin!' : 'Salin Tautan'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="block text-[11px] font-bold text-slate-700">
                      Kode Pairing Cepat:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={spreadsheetService.generatePairingCode(currentStore, currentPrinter)}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-700 truncate"
                      />
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode ? 'Tersalin!' : 'Salin Kode'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Basis Data Spreadsheet */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Basis Data Google Spreadsheet: {isConfigured ? '🟢 Tersambung' : '⚪ Belum Dikonfigurasi'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {config.lastSyncedAt
                        ? `Terakhir sinkron: ${new Date(config.lastSyncedAt).toLocaleString('id-ID')}`
                        : 'Belum pernah disinkronkan'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isConfigured && (
                    <button
                      type="button"
                      onClick={handleSyncNow}
                      disabled={isSyncing}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Sinkron...' : 'Sinkronkan Sekarang'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setTab('spreadsheet')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Atur Spreadsheet
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HUBUNGKAN PERANGKAT INI */}
          {tab === 'join' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 space-y-1">
                <span className="font-extrabold text-xs block text-blue-900">
                  Sinkronkan Pengaturan dari Perangkat Utama
                </span>
                <p className="text-xs text-blue-800 leading-relaxed">
                  Masukkan <strong>Kode Pairing</strong> atau tempelkan <strong>Tautan Cepat</strong> yang disalin dari HP pertama.
                  Perangkat ini akan otomatis menyalin nama toko, logo, meja, wifi, pajak, dan terhubung ke Spreadsheet yang sama.
                </p>
              </div>

              <form onSubmit={handleJoinWithCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tempelkan Kode Pairing / Tautan dari HP Pertama:
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Contoh: KASIRKU_SHEET_V2:eyJzaGVldElkIjoi... atau tempel tautan https://.../?link_sync=..."
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isJoining || !joinInput.trim()}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer"
                  >
                    {isJoining ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Menghubungkan...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Hubungkan &amp; Samakan Pengaturan</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: BASIS DATA SPREADSHEET */}
          {tab === 'spreadsheet' && (
            <div className="space-y-5">
              {/* Account Connect Header */}
              <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-xs">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-800">
                        Basis Data Google Spreadsheet
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {googleUser
                          ? `Terhubung: ${googleUser.email || googleUser.displayName}`
                          : 'Hubungkan Akun Google untuk sinkronisasi otomatis'}
                      </p>
                    </div>
                  </div>

                  {googleUser ? (
                    <button
                      type="button"
                      onClick={handleGoogleLogout}
                      className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      <span>Keluar Akun</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      disabled={isLoggingIn}
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
                      <span>{isLoggingIn ? 'Menghubungkan...' : 'Masuk dengan Google'}</span>
                    </button>
                  )}
                </div>

                {/* Option 1: Create New Spreadsheet */}
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Buat Lembar Basis Data Otomatis di Google Drive
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Satu klik untuk membuat Google Spreadsheet baru lengkap dengan 12 sheet: Pengaturan Toko, Printer, Menu, Resep HPP, Penjualan, dll.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateNewSpreadsheet}
                      disabled={isCreatingSheet}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>{isCreatingSheet ? 'Membuat Spreadsheet...' : 'Buat Spreadsheet Baru'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Option 2: Link Existing Spreadsheet by ID / URL */}
              <div className="p-5 rounded-3xl bg-white border border-slate-200 space-y-3">
                <h4 className="font-extrabold text-sm text-slate-800">
                  Atau Tautkan Spreadsheet yang Sudah Ada
                </h4>
                <p className="text-xs text-slate-500">
                  Masukkan ID Spreadsheet atau salin tautan Google Spreadsheet Anda:
                </p>

                <form onSubmit={handleSaveExistingSheet} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Contoh: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                      value={existingSheetInput}
                      onChange={(e) => setExistingSheetInput(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!existingSheetInput.trim()}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      Simpan &amp; Hubungkan
                    </button>
                  </div>
                </form>
              </div>

              {/* Current Connected Spreadsheet Status */}
              {isConfigured && config.spreadsheetId && (
                <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-emerald-900 block flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Spreadsheet Aktif: {config.spreadsheetTitle || 'KasirKu POS Database'}</span>
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 block mt-0.5 truncate max-w-md">
                      ID: {config.spreadsheetId}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={spreadsheetService.getSpreadsheetUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka di Google Sheets</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleSyncNow}
                      disabled={isSyncing}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Sinkron...' : 'Sinkronkan'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: TRANSFER CEPAT OFFLINE */}
          {tab === 'transfer' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                <span className="font-extrabold text-xs block text-amber-900">
                  Transfer Cepat Offline (Tanpa Internet)
                </span>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Jika Anda tidak menggunakan koneksi cloud, Anda dapat mengunduh seluruh data &amp; pengaturan toko menjadi 1 file, lalu mengimpornya di HP lain melalui WhatsApp, Bluetooth, atau kabel data.
                </p>
              </div>

              {transferStatus && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{transferStatus}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                  <div>
                    <h5 className="font-extrabold text-xs text-slate-800">1. Unduh Data &amp; Pengaturan (HP 1)</h5>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Simpan snapshot database lengkap beserta pengaturan toko dan printer ke dalam file JSON.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 rotate-180" />
                    <span>Download Snapshot Data</span>
                  </button>
                </div>

                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between space-y-3">
                  <div>
                    <h5 className="font-extrabold text-xs text-slate-800">2. Impor Data ke HP Ini (HP 2)</h5>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Pilih file snapshot yang diterima dari HP pertama untuk menyamakan semua menu dan pengaturan.
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".json"
                    ref={fileInputRef}
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Pilih File Snapshot</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Perangkat ini: {window.navigator.userAgent.includes('Mobile') ? 'Smartphone/Tablet' : 'Komputer/Laptop'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold rounded-xl transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Enlarged Fullscreen QR Code Overlay */}
      {isEnlargedQr && qrDataUrl && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full flex flex-col items-center text-center shadow-2xl space-y-4">
            <div className="flex items-center justify-between w-full">
              <span className="font-extrabold text-sm text-slate-800">Scan QR Code HP Kasir</span>
              <button
                type="button"
                onClick={() => setIsEnlargedQr(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-emerald-50 rounded-2xl border-2 border-emerald-500/40">
              <img
                src={qrDataUrl}
                alt="Enlarged QR Code"
                className="w-72 h-72 object-contain rounded-xl"
              />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Arahkan kamera smartphone kasir ke QR Code ini untuk otomatis menyalin pengaturan dan terhubung ke spreadsheet.
            </p>
            <button
              type="button"
              onClick={() => setIsEnlargedQr(false)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Selesai &amp; Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
