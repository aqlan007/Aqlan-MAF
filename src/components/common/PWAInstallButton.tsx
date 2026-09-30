import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  X,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Layers,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'sidebar' | 'settings' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // If already installed, show nothing in header/sidebar, or badge in settings
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Aplikasi KasirKu telah terpasang di perangkat ini (Mode PWA Standalone).</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    // If native browser prompt is ready, trigger it first
    if (isInstallable) {
      const installed = await install();
      if (!installed) {
        // If user cancelled or prompt failed, open guide modal as fallback
        setShowGuideModal(true);
      }
    } else {
      // Prompt not yet dispatched (common in iframes, in-app webviews, or non-Chromium browsers)
      setShowGuideModal(true);
    }
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <>
      {/* 1. Header Variant */}
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm transition cursor-pointer ${className}`}
          title="Install KasirKu di HP Android atau Desktop"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-200" />
          <span className="hidden sm:inline">Install App</span>
          <span className="sm:hidden">Install</span>
        </button>
      )}

      {/* 2. Sidebar Variant */}
      {variant === 'sidebar' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white shadow-md transition cursor-pointer border border-emerald-400/30 ${className}`}
          title="Install KasirKu di HP Android atau Desktop"
        >
          <Download className="w-4 h-4 text-emerald-200 animate-bounce" />
          <span>Install Aplikasi (Android/PC)</span>
        </button>
      )}

      {/* 3. Settings Screen Variant */}
      {variant === 'settings' && (
        <div className={`space-y-3 ${className}`}>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100/50 border border-emerald-200/80 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <span>Pasang Aplikasi di Android / Komputer</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">
                    PWA
                  </span>
                </h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Bisa diinstall langsung di HP Android tanpa Play Store. Ringan, cepat, dan bisa
                  digunakan offline tanpa internet.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'Install Sekarang' : 'Panduan Install Android'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Banner Variant */}
      {variant === 'banner' && (
        <div className="p-3 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="text-xs truncate">
              <span className="font-bold">Install KasirKu di Android!</span>
              <span className="hidden sm:inline text-emerald-200 ml-1.5">
                Akses cepat dari layar utama &amp; tetap bisa transaksi tanpa internet.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-lg bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 transition cursor-pointer shrink-0 shadow-xs"
          >
            Install
          </button>
        </div>
      )}

      {/* INSTALL GUIDE MODAL */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    {isIOS ? 'Cara Install di iPhone / iPad' : 'Cara Install di HP Android'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Progressive Web App (PWA) Resmi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content for Android / Chromium */}
            {!isIOS ? (
              <div className="mt-4 space-y-4 text-xs text-slate-600">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/60 text-slate-700">
                  <p className="font-semibold text-emerald-900 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>Keuntungan Menginstall KasirKu di Android:</span>
                  </p>
                  <ul className="space-y-1 text-[11px] text-emerald-950 pl-5 list-disc">
                    <li>Ikon muncul langsung di Layar Utama &amp; Menu HP Android seperti aplikasi Play Store.</li>
                    <li>Layar penuh (full-screen tanpa address bar browser).</li>
                    <li>Dapat digunakan offline saat jaringan internet padam atau di lapangan.</li>
                    <li>Sangat hemat memori ponsel (&lt; 2MB).</li>
                  </ul>
                </div>

                {/* Steps */}
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Buka di Browser Google Chrome</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pastikan link web ini dibuka di browser <strong>Google Chrome</strong> di HP Android Anda.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Ketuk Tombol Menu Titik Tiga (⋮)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Lihat di pojok kanan atas browser Chrome, ketuk ikon titik tiga <strong>(⋮)</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Pilih "Install aplikasi" / "Tambahkan ke Layar Utama"</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pilih menu <strong>Install aplikasi</strong> (atau <em>Tambahkan ke Layar Utama</em> / <em>Add to Home screen</em>), lalu klik <strong>Install</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Copy URL feature */}
                <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Buka di HP Android Anda:
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={window.location.href}
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-[11px] font-mono text-slate-600 select-all truncate"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Content for iOS */
              <div className="mt-4 space-y-3 text-xs text-slate-600">
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Buka di Browser Safari</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Buka halaman ini menggunakan browser <strong>Safari</strong> di iPhone atau iPad Anda.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Ketuk Tombol Share (Bagikan)</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Ketuk ikon kotak dengan panah ke atas di bilah bawah Safari.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <p className="font-bold text-slate-800">Pilih "Add to Home Screen"</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Gulir ke bawah dan ketuk <strong>Tambahkan ke Layar Utama (Add to Home Screen)</strong> lalu tekan <strong>Tambah</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex gap-2">
              {isInstallable && (
                <button
                  type="button"
                  onClick={async () => {
                    await install();
                    setShowGuideModal(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 font-bold text-xs text-white hover:bg-emerald-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Coba Install Otomatis Sekarang</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className={`py-2.5 px-4 rounded-xl bg-slate-100 font-bold text-xs text-slate-700 hover:bg-slate-200 transition cursor-pointer ${
                  !isInstallable ? 'w-full' : ''
                }`}
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
