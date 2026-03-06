'use client';

import { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ui';
import type { TabId, TabItem } from '@/types';

const tabs: TabItem[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'agendamentos', label: 'Agendamentos' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'servicos', label: 'Serviços' },
    { id: 'planos', label: 'Planos' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'configuracoes', label: 'Configurações' },
];

interface NavbarProps {
    activeTab: TabId;
    onTabChange: (tab: TabId) => void;
    onLogout: () => void;
}

export function Navbar({ activeTab, onTabChange, onLogout }: NavbarProps) {
    const [menuOpen, setMenuOpen] = useState(false);

    const handleTabClick = (tabId: TabId) => {
        onTabChange(tabId);
        setMenuOpen(false);
    };

    return (
        <nav className="bg-dark-light border-b border-primary/20 p-4 relative" aria-label="Navegação principal">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="lg:hidden text-primary"
                        aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
                        aria-expanded={menuOpen}
                    >
                        {menuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                    <h1 className="text-2xl font-bold text-primary">💈 BarberPro</h1>
                </div>

                {/* Desktop navigation */}
                <div className="hidden lg:flex gap-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`px-4 py-2 rounded-lg transition-all text-sm font-medium ${activeTab === tab.id
                                ? 'bg-primary text-black'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            aria-current={activeTab === tab.id ? 'page' : undefined}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <button
                        onClick={onLogout}
                        className="text-gray-400 hover:text-primary transition-all"
                        title="Sair"
                        aria-label="Sair da conta"
                    >
                        <LogOut size={24} aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Mobile navigation */}
            {menuOpen && (
                <div className="lg:hidden absolute top-full left-0 right-0 bg-dark-light border-b border-primary/20 z-50 shadow-2xl">
                    <div className="flex flex-col p-4 gap-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabClick(tab.id)}
                                className={`px-4 py-3 rounded-lg transition-all text-left text-sm font-medium ${activeTab === tab.id
                                    ? 'bg-primary text-black'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </nav>
    );
}
