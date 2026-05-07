import { prisma } from '../../config/prisma.js';
import type { AppointmentWithRelations, CreateAppointmentInput } from './appointments.types.js';

const APPOINTMENT_INCLUDE = {
  client: { select: { name: true, phone: true } },
  barber: { select: { name: true } },
  service: { select: { name: true, price: true } },
} as const;

export const appointmentsPrismaRepository = {
  async findAll(
    barbershopId: string,
    filters: {
      date?: string;
      status?: string;
      view?: 'day' | 'week';
      barberId?: string;
    }
  ): Promise<AppointmentWithRelations[]> {
    const where: Record<string, unknown> = { barbershopId };

    if (filters.barberId) where['barberId'] = filters.barberId;
    if (filters.status) where['status'] = filters.status;

    if (filters.date) {
      const start = new Date(filters.date);
      if (filters.view === 'week') {
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        where['date'] = { gte: start, lt: end };
      } else {
        where['date'] = start;
      }
    }

    return prisma.appointment.findMany({
      where,
      include: APPOINTMENT_INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    }) as unknown as AppointmentWithRelations[];
  },

  async findById(
    id: string,
    barbershopId: string
  ): Promise<AppointmentWithRelations | null> {
    return prisma.appointment.findFirst({
      where: { id, barbershopId },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations | null;
  },

  async validateOwnership(
    barbershopId: string,
    data: { clientId: string; barberId: string; serviceId: string }
  ): Promise<{ clientOk: boolean; barberOk: boolean; serviceOk: boolean }> {
    const [client, barber, service] = await Promise.all([
      prisma.client.findFirst({
        where: { id: data.clientId, barbershopId, active: true },
        select: { id: true },
      }),
      prisma.barber.findFirst({
        where: { id: data.barberId, barbershopId, active: true },
        select: { id: true },
      }),
      prisma.service.findFirst({
        where: { id: data.serviceId, barbershopId, active: true },
        select: { id: true },
      }),
    ]);

    return {
      clientOk: client !== null,
      barberOk: barber !== null,
      serviceOk: service !== null,
    };
  },

  async hasConflict(
    barbershopId: string,
    barberId: string,
    date: string,
    time: string,
    excludeId?: string
  ): Promise<boolean> {
    const existing = await prisma.appointment.findFirst({
      where: {
        barbershopId,
        barberId,
        date: new Date(date),
        time: new Date(`1970-01-01T${time}`),
        status: 'confirmado',
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    return existing !== null;
  },

  async create(data: CreateAppointmentInput & { barbershopId: string }): Promise<AppointmentWithRelations> {
    return prisma.appointment.create({
      data: {
        barbershopId: data.barbershopId,
        clientId: data.clientId,
        barberId: data.barberId,
        serviceId: data.serviceId,
        date: new Date(data.date),
        time: new Date(`1970-01-01T${data.time}:00`),
        status: 'confirmado',
      },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations;
  },

  async updateStatus(
    id: string,
    barbershopId: string,
    status: string
  ): Promise<AppointmentWithRelations | null> {
    const existing = await prisma.appointment.findFirst({
      where: { id, barbershopId },
      select: { id: true },
    });
    if (!existing) return null;

    return prisma.appointment.update({
      where: { id },
      data: { status },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations;
  },

  async update(
    id: string,
    barbershopId: string,
    data: Partial<CreateAppointmentInput>
  ): Promise<AppointmentWithRelations | null> {
    const existing = await prisma.appointment.findFirst({
      where: { id, barbershopId, status: 'confirmado' },
      select: { id: true },
    });
    if (!existing) return null;

    return prisma.appointment.update({
      where: { id },
      data: {
        ...(data.clientId && { clientId: data.clientId }),
        ...(data.barberId && { barberId: data.barberId }),
        ...(data.serviceId && { serviceId: data.serviceId }),
        ...(data.date && { date: new Date(data.date) }),
        ...(data.time && { time: new Date(`1970-01-01T${data.time}:00`) }),
      },
      include: APPOINTMENT_INCLUDE,
    }) as unknown as AppointmentWithRelations;
  },

  async softDelete(id: string, barbershopId: string): Promise<boolean> {
    const existing = await prisma.appointment.findFirst({
      where: { id, barbershopId, status: 'confirmado' },
      select: { id: true },
    });
    if (!existing) return false;

    await prisma.appointment.update({
      where: { id },
      data: { status: 'cancelado' },
    });
    return true;
  },

  async getBookedSlots(
    barbershopId: string,
    barberId: string,
    date: string
  ): Promise<string[]> {
    const appointments = await prisma.appointment.findMany({
      where: {
        barbershopId,
        barberId,
        date: new Date(date),
        status: 'confirmado',
      },
      select: { time: true },
    });

    return appointments.map((a) => {
      const t = a.time;
      const h = String(t.getHours()).padStart(2, '0');
      const m = String(t.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    });
  },

  async getServiceDetails(serviceId: string, barbershopId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, barbershopId, active: true },
      select: { price: true, durationMinutes: true },
    });
  },
};
