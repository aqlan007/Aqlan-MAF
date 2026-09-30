import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  KeyRound,
  MapPin,
  Phone,
  Printer,
  Sparkles,
  Store,
} from 'lucide-react';
import { db, seedSampleData } from '../../db/db';
import { PrinterSettings, StoreSettings, User } from '../../types';

interface OnboardingModalProps {
  isOpen: boolean;
  onFinish: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onFinish }) => {
  const [step, setStep] = useState(1);
  const [storeName, setStoreName] = useState('Toko Barokah Retail');
  const [slogan, setSlogan] = useState('Murah, Lengkap, dan Terpercaya');
  const [address, setAddress] = useState('Jl. Merdeka Raya No. 10');
  const [city, setCity] = useState('Jakarta');
  const [phone, setPhone] = useState('081234567890');
  const [paperSize, setPaperSize] = useState<'58mm' | '80mm'>('58mm');
  const [adminPin, setAdminPin] = useState('1234');
  const [adminName, setAdminName] = useState('Owner Toko');

  if (!isOpen) return null;

  const handleUseSampleData = async () => {
    await seedSampleData();
    onFinish();
  };

  const handleFinishCustom = async () => {
    const updatedStore: StoreSettings = {
      id: 'store-main',
      storeName,
      slogan,
      ownerName: adminName,
      phone,
      whatsapp: phone,
      address,
      city,
      province: 'Indonesia',
      receiptFooter: 'Terima kasih atas kunjungan Anda. Semoga berlangganan kembali!',
      currencySymbol: 'Rp',
      taxRate: 0,
      enableTax: false,
      enableRounding: true,
      isOnboarded: true,
    };

    const updatedPrinter: PrinterSettings = {
      id: 'printer-main',
      paperSize,
      copies: 1,
      margin: 0,
      fontSize: 'medium',
      showLogo: true,
      showAddress: true,
      showPhone: true,
      showEmail: true,
      showWebsite: false,
      showQrCode: true,
      showBarcode: true,
      showFooter: true,
      showThankYou: true,
      showHpp: false,
      showProfit: false,
      autoCut: true,
      defaultPrinterName: `Thermal BT Printer ${paperSize}`,
    };

    const updatedAdmin: User = {
      id: 'usr-admin',
      name: adminName,
      pin: adminPin || '1234',
      role: 'admin',
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await db.store_settings.put(updatedStore);
    await db.printer_settings.put(updatedPrinter);
    await db.users.put(updatedAdmin);

    onFinish();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 to-teal-800 p-6 text-white text-center relative">
          <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-2 text-emerald-300">
            <Store className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-black">Selamat Datang di KasirKu POS</h2>
          <p className="text-xs text-emerald-100 mt-1">
            Aplikasi Point of Sale Modern, Cepat &amp; 100% Offline-First
          </p>

          {/* Quick Demo Button */}
          <div className="mt-4 pt-3 border-t border-emerald-600/50">
            <button
              onClick={handleUseSampleData}
              className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span>Gunakan Data Contoh (20 Produk + Transaksi Siap Pakai)</span>
            </button>
          </div>
        </div>

        {/* Multi-step Setup Form */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 pb-2 border-b border-slate-100">
            <span>Konfigurasi Cepat Toko Baru:</span>
            <span className="text-emerald-600 font-bold">Langkah {step} dari 3</span>
          </div>

          {step === 1 && (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Nama Toko / Usaha *
                </label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Contoh: Toko Berkah Makmur"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Slogan / Deskripsi
                </label>
                <input
                  type="text"
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  placeholder="Contoh: Belanja Hemat & Lengkap"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  3. Nomor WhatsApp / HP *
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  4. Alamat Toko
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Jl. Raya No. XX"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  5. Kota / Wilayah
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. Ukuran Kertas Thermal Printer
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white font-bold"
                >
                  <option value="58mm">58 mm (Printer Bluetooth Portable)</option>
                  <option value="80mm">80 mm (Printer Desktop Lebar)</option>
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 animate-in fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  7. Nama Pemilik / Admin Toko
                </label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  8. Buat PIN Admin (4-6 angka) *
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="1234"
                  className="w-full px-3 py-2 text-center text-lg font-mono font-bold border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-400 mt-1 text-center">
                  PIN digunakan untuk login dan otorisasi pembatalan transaksi (void).
                </p>
              </div>
            </div>
          )}

          {/* Stepper Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                Kembali
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Lanjut
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinishCustom}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                Selesai &amp; Buka POS
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
