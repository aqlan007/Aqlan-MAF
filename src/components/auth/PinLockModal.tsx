import React, { useEffect, useState } from 'react';
import {
  Check,
  Delete,
  Lock,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { User } from '../../types';

interface PinLockModalProps {
  users: User[];
  currentSelectedUser: User;
  isOpen: boolean;
  storeLogo?: string;
  storeName?: string;
  onSuccess: (user: User) => void;
  onCancel?: () => void;
}

export const PinLockModal: React.FC<PinLockModalProps> = ({
  users,
  currentSelectedUser,
  isOpen,
  storeLogo,
  storeName,
  onSuccess,
  onCancel,
}) => {
  const [selectedUser, setSelectedUser] = useState<User>(currentSelectedUser);
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Sync selected user whenever modal opens or currentSelectedUser changes
  useEffect(() => {
    if (isOpen) {
      setSelectedUser(currentSelectedUser || users[0]);
      setPin('');
      setErrorMsg(null);
      setInfoMsg(null);
    }
  }, [isOpen, currentSelectedUser, users]);

  // Physical keyboard listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Escape' && onCancel) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, selectedUser, users]);

  if (!isOpen) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 6) {
      const nextPin = pin + num;
      setPin(nextPin);
      setErrorMsg(null);
      setInfoMsg(null);

      // Verify strictly against selected user's PIN
      if (selectedUser?.pin && nextPin === selectedUser.pin) {
        setTimeout(() => {
          onSuccess(selectedUser);
          setPin('');
        }, 120);
        return;
      }

      // Check if user has entered sufficient digits
      const targetLength = Math.max(4, selectedUser.pin?.length || 4);
      if (nextPin.length >= targetLength) {
        setErrorMsg('PIN yang Anda masukkan salah. Silakan coba lagi.');
      }
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center border border-slate-200 animate-in zoom-in-95 duration-200">
        {storeLogo ? (
          <div className="w-16 h-12 flex items-center justify-center mb-2 overflow-hidden">
            <img src={storeLogo} alt="Logo" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2.5 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
        )}

        <h3 className="font-extrabold text-lg text-slate-800">
          {storeName || 'Kunci Keamanan Kasir'}
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Masukkan PIN untuk membuka sesi kasir</p>

        {/* Quick User Selector Pills - PIN is strictly kept private and hidden */}
        <div className="mt-4 w-full space-y-1.5">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Pilih Pengguna yang Ingin Masuk:
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {users.map((u) => {
              const isSelected = selectedUser.id === u.id;
              const roleIcon = u.role === 'admin' ? '👑' : u.role === 'manager' ? '👔' : '🛒';
              const roleLabel = u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Manager' : 'Kasir';
              const roleBadgeColor =
                u.role === 'admin'
                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                  : u.role === 'manager'
                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200';

              const selectedRing =
                u.role === 'admin'
                  ? 'bg-purple-50 border-purple-400 shadow-xs ring-1 ring-purple-400/40'
                  : u.role === 'manager'
                  ? 'bg-blue-50 border-blue-400 shadow-xs ring-1 ring-blue-400/40'
                  : 'bg-emerald-50 border-emerald-400 shadow-xs ring-1 ring-emerald-400/40';

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setSelectedUser(u);
                    setPin('');
                    setErrorMsg(null);
                  }}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    isSelected
                      ? selectedRing
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 opacity-80'
                  }`}
                >
                  <div className="font-bold text-xs truncate text-slate-800 flex items-center gap-1">
                    <span>{roleIcon}</span>
                    <span className="truncate">{u.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase ${roleBadgeColor}`}>
                      {roleLabel}
                    </span>
                    <span className="text-slate-400 text-[10px]">• Terproteksi PIN</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* PIN Indicators */}
        <div className="my-4 flex items-center justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all duration-150 ${
                pin.length > idx
                  ? 'bg-emerald-600 scale-110 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <div className="text-xs font-bold text-rose-600 mb-2.5 text-center animate-shake px-2">
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="text-xs font-bold text-emerald-700 mb-2.5 text-center flex items-center gap-1">
            <Check className="w-3.5 h-3.5" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Numpad */}
        <div className="w-full grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
            <button
              key={n}
              onClick={() => handleKeyPress(n)}
              className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 text-slate-800 font-bold text-lg transition-all flex items-center justify-center cursor-pointer select-none border border-slate-200/50 shadow-2xs"
            >
              {n}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="h-12 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-400 font-bold text-xs transition-all flex items-center justify-center cursor-pointer"
          >
            Hapus
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 text-slate-800 font-bold text-lg transition-all flex items-center justify-center cursor-pointer select-none border border-slate-200/50 shadow-2xs"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            className="h-12 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs transition-all flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Footer info & cancel */}
        <div className="w-full mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Sistem terlindungi PIN aman</span>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Batal
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
