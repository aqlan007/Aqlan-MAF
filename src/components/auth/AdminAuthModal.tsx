import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  KeyRound,
  Lock,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { User } from '../../types';

interface AdminAuthModalProps {
  isOpen: boolean;
  featureName?: string;
  adminUsers: User[];
  onSuccess: (adminUser: User, mode: 'override' | 'switch') => void;
  onClose: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  featureName = 'Fitur Terbatas',
  adminUsers,
  onSuccess,
  onClose,
}) => {
  const [selectedAdminId, setSelectedAdminId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Sync selected admin when modal opens or adminUsers update
  useEffect(() => {
    if (isOpen) {
      const activeAdmin = adminUsers.find((u) => u.isActive) || adminUsers[0];
      if (activeAdmin) {
        setSelectedAdminId(activeAdmin.id);
      }
      setPin('');
      setError(null);
      setInfoMessage(null);
    }
  }, [isOpen, adminUsers]);

  // Physical keyboard listener for desktop / laptop users
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (pin.length >= 4) {
          verifyAndProceed('switch');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, selectedAdminId, adminUsers]);

  if (!isOpen) return null;

  const currentAdmin =
    adminUsers.find((u) => u.id === selectedAdminId) ||
    adminUsers[0] || {
      id: 'usr-admin',
      name: 'Owner / Admin',
      pin: '',
      role: 'admin' as const,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(null);
      setInfoMessage(null);

      // Auto check when matching PIN
      if (isPinValid(nextPin, currentAdmin)) {
        setTimeout(() => {
          verifyAndProceed('switch', nextPin);
        }, 120);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const isPinValid = (inputPin: string, admin: User): boolean => {
    const clean = inputPin.trim();
    if (admin && admin.pin && admin.pin.trim() === clean) return true;
    if (adminUsers.some((u) => u.pin && u.pin.trim() === clean)) return true;
    return false;
  };

  const verifyAndProceed = async (mode: 'override' | 'switch', pinToCheck = pin) => {
    const admin = currentAdmin;

    if (isPinValid(pinToCheck, admin)) {
      setError(null);
      setPin('');
      onSuccess(admin, mode);
    } else {
      setError('PIN Admin salah. Silakan coba kembali.');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 text-center relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto mb-2.5 shadow-lg">
            <Lock className="w-6 h-6" />
          </div>

          <h3 className="font-extrabold text-base tracking-tight">
            {adminUsers.some((u) => u.role === 'manager') ? 'Otorisasi Supervisor / Admin' : 'Otorisasi Admin / Owner'}
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Akses ke <strong className="text-amber-300">{featureName}</strong> memerlukan verifikasi PIN.
          </p>

          <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Masukkan PIN Anda untuk Membuka</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3.5">
          {/* Admin / Manager Selector if multiple */}
          {adminUsers.length > 1 && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Pilih Akun Otorisasi:
              </label>
              <select
                value={selectedAdminId}
                onChange={(e) => {
                  setSelectedAdminId(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500"
              >
                {adminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.role === 'admin' ? '👑' : '👔'} {u.name} ({u.role === 'admin' ? 'Admin / Owner' : 'Manager'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PIN Display */}
          <div className="text-center py-0.5">
            <div className="flex justify-center gap-3 my-1">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all ${
                    pin.length > idx
                      ? 'bg-amber-500 scale-125 shadow-sm shadow-amber-500/50'
                      : 'bg-slate-200 border border-slate-300'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="mt-2 text-xs text-rose-600 font-bold flex items-center justify-center gap-1 animate-shake">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {infoMessage && (
              <div className="mt-2 text-xs text-emerald-700 font-bold flex items-center justify-center gap-1">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{infoMessage}</span>
              </div>
            )}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  if (k === 'C') handleClear();
                  else if (k === '⌫') handleBackspace();
                  else handleDigit(k);
                }}
                className={`py-2.5 rounded-xl font-bold text-base transition-all active:scale-95 cursor-pointer select-none ${
                  k === 'C'
                    ? 'text-rose-600 bg-rose-50 hover:bg-rose-100 text-xs'
                    : k === '⌫'
                    ? 'text-slate-600 bg-slate-100 hover:bg-slate-200 text-xs'
                    : 'bg-slate-50 hover:bg-amber-50 hover:text-amber-800 text-slate-800 border border-slate-200 shadow-2xs'
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={pin.length < 4}
              onClick={() => verifyAndProceed('override')}
              className="py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:pointer-events-none text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer transition-all"
            >
              <KeyRound className="w-4 h-4" />
              <span>Buka Sementara</span>
            </button>

            <button
              type="button"
              disabled={pin.length < 4}
              onClick={() => verifyAndProceed('switch')}
              className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-black disabled:opacity-40 disabled:pointer-events-none text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-slate-900/20 cursor-pointer transition-all"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Login Admin</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
