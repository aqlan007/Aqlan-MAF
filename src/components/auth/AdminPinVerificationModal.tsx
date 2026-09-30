import React, { useState } from 'react';
import { Delete, KeyRound, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { User } from '../../types';

interface AdminPinVerificationModalProps {
  isOpen: boolean;
  adminUsers: User[];
  title?: string;
  description?: string;
  onSuccess: (adminUser: User) => void;
  onCancel: () => void;
}

export const AdminPinVerificationModal: React.FC<AdminPinVerificationModalProps> = ({
  isOpen,
  adminUsers,
  title = 'Verifikasi PIN Admin',
  description = 'Fitur ini dibatasi khusus Admin/Owner. Masukkan PIN Admin untuk membuka otorisasi.',
  onSuccess,
  onCancel,
}) => {
  const [selectedAdminId, setSelectedAdminId] = useState<string>(
    adminUsers[0]?.id || ''
  );
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentAdmin = adminUsers.find((u) => u.id === selectedAdminId) || adminUsers[0];

  const handleKeyPress = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMsg(null);

      // Check if matches selected admin PIN or any admin PIN
      const matchedAdmin = adminUsers.find((u) => u.pin === nextPin);
      if (matchedAdmin) {
        setTimeout(() => {
          onSuccess(matchedAdmin);
          setPin('');
        }, 120);
      } else if (currentAdmin && nextPin.length >= currentAdmin.pin.length) {
        setErrorMsg('PIN Admin tidak valid!');
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center border border-slate-200 animate-in fade-in zoom-in-95 duration-200 relative">
        <button
          onClick={onCancel}
          className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3 shadow-inner">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <h3 className="font-extrabold text-base text-slate-800 text-center">{title}</h3>
        <p className="text-xs text-slate-500 mt-1 text-center px-2">{description}</p>

        {/* Admin selector */}
        {adminUsers.length > 1 && (
          <div className="mt-3 w-full">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Pilih Akun Admin:
            </label>
            <select
              value={selectedAdminId}
              onChange={(e) => {
                setSelectedAdminId(e.target.value);
                setPin('');
                setErrorMsg(null);
              }}
              className="w-full p-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none"
            >
              {adminUsers.map((adm) => (
                <option key={adm.id} value={adm.id}>
                  {adm.name} (Admin)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* PIN Indicators */}
        <div className="my-4 flex items-center justify-center gap-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                pin.length > idx
                  ? 'bg-amber-600 scale-110 shadow-sm shadow-amber-500/30'
                  : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <div className="mb-3 text-xs font-bold text-rose-600 animate-pulse text-center">
            {errorMsg}
          </div>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleKeyPress(num)}
              className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 text-slate-800 text-lg font-black transition-all cursor-pointer flex items-center justify-center border border-slate-200/60 shadow-2xs"
            >
              {num}
            </button>
          ))}

          <button
            onClick={handleClear}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-500 text-xs font-bold transition-all cursor-pointer flex items-center justify-center border border-slate-200/60"
          >
            RESET
          </button>

          <button
            onClick={() => handleKeyPress('0')}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95 text-slate-800 text-lg font-black transition-all cursor-pointer flex items-center justify-center border border-slate-200/60 shadow-2xs"
          >
            0
          </button>

          <button
            onClick={handleDelete}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 text-xs font-bold transition-all cursor-pointer flex items-center justify-center border border-slate-200/60"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={onCancel}
          className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          Batalkan &amp; Kembali
        </button>
      </div>
    </div>
  );
};
