// Interfaces TypeScript do EasyBarber

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
    emailVerified?: boolean;
    subscriptionStatus?: 'active' | 'trialing' | 'pending' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete';
    subscriptionCurrentPeriodEnd?: string | null;
}

export interface Expense {
    id: string;
    barbershop_id: string;
    description: string;
    category: string;
    amount: number;
    date: string;
    created_at: string;
}

export interface MonthlyReportDay {
    date: string;
    earnings: number;
    expenses: number;
    profit: number;
}

// --- Form Data Types ---

export interface AppointmentFormData {
    clientId: string;
    barberId: string;
    serviceId: string;
    date: string;
    time: string;
}

export interface ClientFormData {
    name: string;
    phone: string;
    email?: string;
    birthDate?: string;
    address?: string;
    notes?: string;
}

export interface ServiceFormData {
    name: string;
    price: number;
    duration_minutes: number;
}

export interface BarberFormData {
    name: string;
    photo?: string | null;
}

export interface ExpenseFormData {
    description: string;
    category: string;
    amount: number;
    date: string;
}

// --- API Response Types ---

export interface LoginResponse {
    user: User;
}

export interface RegisterResponse {
    verificationRequired: boolean;
    verificationEmailSent: boolean;
    message: string;
    user: User;
    barbershop: {
        id: string;
        name: string;
        plan: string;
        desiredPlan?: string;
    };
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

// --- WhatsApp Types ---

export interface BotConfig {
    welcome_message: string;
    ask_name_message: string;
    menu_options: MenuOption[];
    auto_reply: boolean;
}

export interface MenuOption {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
}

export interface WhatsAppStatus {
    status:
        | 'provider_unavailable'
        | 'instance_not_found'
        | 'disconnected'
        | 'pairing'
        | 'connected'
        | 'error'
        | 'unavailable';
    qrCode: string | null;
    connectedNumber: string | null;
    connectedName: string | null;
    error: string | null;
    provider?: string;
}

export type TabId = 'dashboard' | 'agendamentos' | 'financeiro' | 'clientes' | 'servicos' | 'planos' | 'configuracoes' | 'whatsapp';

export interface TabItem {
    id: TabId;
    label: string;
}
