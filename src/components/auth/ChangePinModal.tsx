import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { User } from '../../types';
import { db } from '../../db/db';

interface ChangePinModalProps {
  isOpen: boolean;
  targetUser: User | null;
  currentUser: User;
  onSuccess: (updatedUser: User) => void;
  onClose: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({
  isOpen,
  targetUser,
  currentUser,
  onSuccess,
  onClose,
}) => {
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPins, setShowPins] = useState(false);
  const [activeField, setActiveField] = useState<'old' | 'new' | 'confirm'>('new');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Is old PIN required?
  // Only required if a cashier is changing their OWN PIN (non-admin)
  const isOldPinRequired =
    currentUser.role === 'cashier' && targetUser?.id === currentUser.id;

  useEffect(() => {
    if (isOpen) {
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setIsSubmitting(false);
      setActiveField(isOldPinRequired ? 'old' : 'new');
    }
  }, [isOpen, targetUser, isOldPinRequired]);

  if (!isOpen || !targetUser) return null;

  const isAdmin = targetUser.role === 'admin';

  // Handle keypad digit for active field
  const handleDigit = (digit: string) => {
    setErrorMsg(null);
    if (activeField === 'old') {
      if (oldPin.length < 6) setOldPin((prev) => prev + digit);
    } else if (activeField === 'new') {
      if (newPin.length < 6) setNewPin((prev) => prev + digit);
    } else if (activeField === 'confirm') {
      if (confirmPin.length < 6) setConfirmPin((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    setErrorMsg(null);
    if (activeField === 'old') {
      setOldPin((prev) => prev.slice(0, -1));
    } else if (activeField === 'new') {
      setNewPin((prev) => prev.slice(0, -1));
    } else if (activeField === 'confirm') {
      setConfirmPin((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    setErrorMsg(null);
    if (activeField === 'old') setOldPin('');
    else if (activeField === 'new') setNewPin('');
    else if (activeField === 'confirm') setConfirmPin('');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    // 1. Verify old PIN if required
    if (isOldPinRequired) {
      if (!oldPin) {
        setErrorMsg('Masukkan PIN lama saat ini!');
        setActiveField('old');
        return;
      }
      if (oldPin !== targetUser.pin) {
        setErrorMsg('PIN lama yang Anda masukkan salah!');
        setActiveField('old');
        return;
      }
    }

    // 2. Validate new PIN format
    const cleanNewPin = newPin.trim();
    if (!/^\d{4,6}$/.test(cleanNewPin)) {
      setErrorMsg('PIN baru harus berupa 4 sampai 6 digit angka (0-9)!');
      setActiveField('new');
      return;
    }

    // 3. Prevent same PIN
    if (cleanNewPin === targetUser.pin) {
      setErrorMsg('PIN baru tidak boleh sama dengan PIN saat ini!');
      setActiveField('new');
      return;
    }

    // 4. Validate confirmation match
    if (cleanNewPin !== confirmPin.trim()) {
      setErrorMsg('Konfirmasi PIN baru tidak cocok! Periksa kembali.');
      setActiveField('confirm');
      return;
    }

    try {
      setIsSubmitting(true);
      await db.users.update(targetUser.id, { pin: cleanNewPin });

      const updatedUser: User = {
        ...targetUser,
        pin: cleanNewPin,
      };

      setSuccessMsg(`PIN untuk "${targetUser.name}" berhasil diperbarui dengan aman!`);

      setTimeout(() => {
        onSuccess(updatedUser);
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg('Gagal menyimpan PIN baru: ' + (err?.message || 'Kesalahan sistem'));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg border ${
                isAdmin
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
              }`}
            >
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white">
                  Ubah PIN {isAdmin ? 'Admin' : 'Kasir'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isAdmin
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                      : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                  }`}
                >
                  {isAdmin ? '👑 Administrator' : '🛒 Staf Kasir'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Pengguna: <strong className="text-white">{targetUser.name}</strong>
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-slate-300">
              PIN Saat Ini:{' '}
              <strong className="font-mono text-emerald-300">
                {showPins ? targetUser.pin : '••••'}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setShowPins(!showPins)}
              className="text-slate-400 hover:text-white flex items-center gap-1 font-semibold cursor-pointer"
            >
              {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPins ? 'Sembunyikan' : 'Lihat'}</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {/* Notification Messages */}
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in zoom-in-95">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-3">
            {/* Old PIN Input (If required for cashier) */}
            {isOldPinRequired && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  1. Masukkan PIN Lama Saat Ini:
                </label>
                <div
                  onClick={() => setActiveField('old')}
                  className={`w-full p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    activeField === 'old'
                      ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <input
                    type={showPins ? 'text' : 'password'}
                    value={oldPin}
                    maxLength={6}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      setOldPin(v);
                      setErrorMsg(null);
                    }}
                    onFocus={() => setActiveField('old')}
                    placeholder="PIN lama (angka)"
                    className="w-full bg-transparent font-mono text-center font-bold text-base text-slate-900 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 font-mono">
                    {oldPin.length}/6
                  </span>
                </div>
              </div>
            )}

            {/* New PIN Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isOldPinRequired ? '2. Masukkan PIN Baru (4-6 digit angka):' : 'PIN Baru (4-6 digit angka):'}
              </label>
              <div
                onClick={() => setActiveField('new')}
                className={`w-full p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  activeField === 'new'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <input
                  type={showPins ? 'text' : 'password'}
                  value={newPin}
                  maxLength={6}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    setNewPin(v);
                    setErrorMsg(null);
                  }}
                  onFocus={() => setActiveField('new')}
                  placeholder="Ketik PIN Baru..."
                  className="w-full bg-transparent font-mono text-center font-bold text-base text-slate-900 focus:outline-none"
                  autoFocus={!isOldPinRequired}
                />
                <span className="text-[10px] text-slate-400 font-mono">
                  {newPin.length}/6
                </span>
              </div>
            </div>

            {/* Confirm New PIN Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {isOldPinRequired ? '3. Konfirmasi Ulang PIN Baru:' : 'Konfirmasi Ulang PIN Baru:'}
              </label>
              <div
                onClick={() => setActiveField('confirm')}
                className={`w-full p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  activeField === 'confirm'
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/30'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <input
                  type={showPins ? 'text' : 'password'}
                  value={confirmPin}
                  maxLength={6}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    setConfirmPin(v);
                    setErrorMsg(null);
                  }}
                  onFocus={() => setActiveField('confirm')}
                  placeholder="Ulangi PIN baru..."
                  className="w-full bg-transparent font-mono text-center font-bold text-base text-slate-900 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 font-mono">
                  {confirmPin.length}/6
                </span>
              </div>

              {/* Match indicator */}
              {newPin.length >= 4 && confirmPin.length >= 4 && (
                <div className="mt-1.5 flex items-center justify-between text-xs px-1">
                  {newPin === confirmPin ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> PIN Cocok
                    </span>
                  ) : (
                    <span className="text-rose-500 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> PIN belum sama
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">Minimal 4 digit</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick On-Screen Touch Numpad */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5 text-[11px] text-slate-400 font-semibold px-1">
              <span>Input Tombol Angka:</span>
              <span className="text-slate-500">
                Kolom Aktif: <strong className="text-slate-700 capitalize">{activeField}</strong>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') handleClear();
                    else if (k === '⌫') handleBackspace();
                    else handleDigit(k);
                  }}
                  className={`py-2 rounded-xl font-bold text-sm transition-all active:scale-95 cursor-pointer select-none border ${
                    k === 'C'
                      ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 text-xs'
                      : k === '⌫'
                      ? 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 text-xs'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Footer Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-2xl border border-slate-200 hover:bg-slate-100 font-bold text-xs text-slate-600 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isSubmitting || newPin.length < 4 || newPin !== confirmPin}
              onClick={() => handleSubmit()}
              className="flex-1 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan PIN Baru'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
