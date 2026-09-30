import React from 'react';
import { Lock, ShieldAlert, ShoppingCart, UserCheck } from 'lucide-react';
import { User } from '../../types';

interface RestrictedScreenProps {
  moduleName: string;
  description?: string;
  currentUser: User;
  onRequestAdminUnlock: () => void;
  onNavigateToPos: () => void;
}

export const RestrictedScreen: React.FC<RestrictedScreenProps> = ({
  moduleName,
  description,
  currentUser,
  onRequestAdminUnlock,
  onNavigateToPos,
}) => {
  const roleName =
    currentUser.role === 'admin'
      ? 'Administrator'
      : currentUser.role === 'manager'
      ? 'Manager'
      : 'Kasir';

  const defaultDescription =
    currentUser.role === 'manager'
      ? 'Modul laporan keuangan dan pengaturan sistem diproteksi khusus untuk Administrator / Owner.'
      : 'Modul ini dikunci untuk staf kasir guna melindungi data rahasia keuangan dan konfigurasi toko.';

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-6 bg-slate-100 select-none">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-200 shadow-xl flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        <span className="px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 mb-2">
          Hak Akses Khusus Admin
        </span>

        <h3 className="text-xl font-black text-slate-800 mb-2">
          Akses Terbatas: {moduleName}
        </h3>

        <p className="text-xs text-slate-500 leading-relaxed mb-6 max-w-sm">
          {description || defaultDescription} Anda saat ini masuk sebagai{' '}
          <strong className="text-slate-700 font-bold">
            {currentUser.name} (Role: {roleName})
          </strong>
          .
        </p>

        <div className="flex flex-col w-full gap-2.5">
          <button
            onClick={onRequestAdminUnlock}
            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-extrabold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>Verifikasi PIN Admin untuk Buka Akses</span>
          </button>

          <button
            onClick={onNavigateToPos}
            className="w-full py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Kembali ke Halaman Kasir / Transaksi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
