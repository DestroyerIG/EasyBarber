'use client';

import { LogOut, UserCog } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function AdminTopbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-black/70 px-5 py-4 backdrop-blur-sm">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-primary/70">Painel global</p>
        <h2 className="text-lg font-black text-white">Administração da Plataforma</h2>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 sm:flex">
          <UserCog size={16} className="text-primary" />
          <span className="text-xs font-semibold text-gray-200">{user?.email || 'Administrador'}</span>
        </div>

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </header>
  );
}
