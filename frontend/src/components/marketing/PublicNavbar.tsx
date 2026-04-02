'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

const navItems = [
  { href: '#inicio', label: 'Início' },
  { href: '#recursos', label: 'Recursos' },
  { href: '#planos', label: 'Planos' },
  { href: '#contato', label: 'Contato' },
];

const defaultContactUrl =
  'https://wa.me/5500000000000?text=Ol%C3%A1%2C%20quero%20conhecer%20o%20EasyBarber';

export function PublicNavbar() {
  const [open, setOpen] = useState(false);
  const contactUrl = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_URL || defaultContactUrl;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="EasyBarber página inicial">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-black font-black">E</span>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-primary/70">SaaS para Barbearias</p>
            <p className="text-xl font-black leading-none">EasyBarber</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex" aria-label="Navegação pública">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="text-sm font-semibold text-gray-300 transition-colors hover:text-white">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white">
            Login
          </Link>
          <Link href="/cadastro" className="btn-primary px-5 py-2 text-sm">
            Cadastrar-se
          </Link>
          <a
            href={contactUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
          >
            Entrar em contato
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-lg border border-white/20 p-2 text-white lg:hidden"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-black/95 lg:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/5"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2">
              <Link href="/login" onClick={() => setOpen(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-center font-semibold text-white">
                Login
              </Link>
              <Link href="/cadastro" onClick={() => setOpen(false)} className="btn-primary text-center text-sm">
                Cadastrar-se
              </Link>
              <a
                href={contactUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-emerald-500 px-4 py-2 text-center text-sm font-semibold text-emerald-950"
              >
                Entrar em contato
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
