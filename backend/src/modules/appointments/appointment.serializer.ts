/**
 * appointment.serializer.ts — molda Appointment (Prisma camelCase aninhado)
 * para o DTO plano em snake_case que o frontend consome.
 *
 * Corrige 3 problemas de exibição:
 *  - relações aninhadas (barber.name/service.price) → barber_name/service_price
 *  - `time` (DateTime 1970-01-01T..) → "HH:MM:SS"
 *  - `date` (UTC midnight) → "YYYY-MM-DDT00:00:00" local p/ evitar off-by-one no fuso BR
 */

interface RawAppointment {
  id: string;
  barbershopId?: string;
  clientId?: string;
  barberId?: string;
  serviceId?: string;
  date: Date | string;
  time: Date | string;
  status: string;
  reminderSent?: boolean;
  createdAt?: Date | string;
  client?: { name?: string; phone?: string } | null;
  barber?: { name?: string } | null;
  service?: { name?: string; price?: unknown } | null;
}

export interface AppointmentDto {
  id: string;
  barbershop_id?: string;
  client_id?: string;
  barber_id?: string;
  service_id?: string;
  date: string;
  time: string;
  status: string;
  reminder_sent?: boolean;
  created_at?: string;
  client_name: string | null;
  client_phone: string | null;
  barber_name: string | null;
  service_name: string | null;
  service_price: number;
}

const dateToLocalIso = (d: Date | string): string => {
  if (typeof d === 'string') return d;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00`;
};

const timeToHms = (t: Date | string): string => {
  if (typeof t === 'string') return t.length >= 8 ? t.substring(0, 8) : t;
  if (!(t instanceof Date) || Number.isNaN(t.getTime())) return '';
  const h = String(t.getUTCHours()).padStart(2, '0');
  const m = String(t.getUTCMinutes()).padStart(2, '0');
  const s = String(t.getUTCSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

const priceToNumber = (p: unknown): number => {
  if (p === null || p === undefined) return 0;
  const n = Number(typeof p === 'object' ? String(p) : (p as string | number));
  return Number.isFinite(n) ? n : 0;
};

export const toAppointmentDto = (a: RawAppointment): AppointmentDto => ({
  id: a.id,
  barbershop_id: a.barbershopId,
  client_id: a.clientId,
  barber_id: a.barberId,
  service_id: a.serviceId,
  date: dateToLocalIso(a.date),
  time: timeToHms(a.time),
  status: a.status,
  reminder_sent: a.reminderSent,
  created_at: a.createdAt ? new Date(a.createdAt).toISOString() : undefined,
  client_name: a.client?.name ?? null,
  client_phone: a.client?.phone ?? null,
  barber_name: a.barber?.name ?? null,
  service_name: a.service?.name ?? null,
  service_price: priceToNumber(a.service?.price),
});
