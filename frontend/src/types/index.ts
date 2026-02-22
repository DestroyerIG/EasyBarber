// Interfaces TypeScript do BarberPro

export interface DashboardData {
    appointmentsToday: number;
    earningsToday: number;
    expensesToday: number;
    profitToday: number;
    totalClients: number;
    weeklyEarnings: WeeklyEarning[];
}

export interface WeeklyEarning {
    date: string;
    total: number;
}

export interface Appointment {
    id: string;
    barbershop_id: string;
    client_id: string;
    barber_id: string;
    service_id: string;
    date: string;
    time: string;
    status: 'confirmado' | 'concluido' | 'cancelado';
    reminder_sent: boolean;
    created_at: string;
    client_name?: string;
    client_phone?: string;
    barber_name?: string;
    service_name?: string;
    service_price?: number;
}

export interface Client {
    id: string;
    barbershop_id: string;
    name: string;
    phone: string;
    email?: string;
    birth_date?: string;
    address?: string;
    notes?: string;
    last_visit: string | null;
    total_spent: number;
    created_at: string;
}

export interface Service {
    id: string;
    barbershop_id: string;
    name: string;
    price: number;
    duration_minutes: number;
    active: boolean;
    created_at: string;
}

export interface Barber {
    id: string;
    barbershop_id: string;
    name: string;
    photo: string | null;
    active: boolean;
    created_at: string;
}

export interface FinanceSummary {
    today: {
        earnings: number;
        expenses: number;
        profit: number;
    };
    month: {
        earnings: number;
        expenses: number;
        profit: number;
    };
}

export interface User {
    email: string;
    role: string;
    barbershopName: string;
    plan: string;
}

export type TabId = 'dashboard' | 'agendamentos' | 'financeiro' | 'clientes' | 'servicos' | 'planos' | 'configuracoes' | 'whatsapp';

export interface TabItem {
    id: TabId;
    label: string;
}
