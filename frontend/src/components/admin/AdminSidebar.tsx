'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Activity, Building2, CreditCard, LayoutDashboard, ScrollText } from 'lucide-react';
import easyBarberLogo from '@/icons/easybarber.png';

const links = [
  { href: '/admin', label: 'Resumo', icon: LayoutDashboard },
  { href: '/admin/metrics', label: 'Métricas', icon: Activity },
  { href: '/admin/tenants', label: 'Contas', icon: Building2 },
  { href: '/admin/subscriptions', label: 'Assinaturas', icon: CreditCard },
  { href: '/admin/logs', label: 'Auditoria', icon: ScrollText },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full border-b border-white/10 bg-dark-light lg:w-64 lg:border-b-0 lg:border-r">
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-primary/30 bg-black/40">
            <Image src={easyBarberLogo} alt="Logo EasyBarber" width={40} height={40} className="h-full w-full object-contain" priority />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70">Área Administrativa</p>
            <h1 className="mt-1 text-xl font-black text-white">EasyBarber</h1>
          </div>
        </div>
      </div>

      <nav className="grid grid-cols-2 gap-2 px-3 pb-4 lg:grid-cols-1" aria-label="Navegação administrativa">
        {links.map((item) => {
          const active = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-primary text-black' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
