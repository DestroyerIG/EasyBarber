import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';

// ── DTO plano em snake_case esperado pelo frontend (type Client) ──────────────
interface ClientDto {
  id: string;
  barbershop_id: string;
  name: string;
  phone: string;
  email: string | null;
  birth_date: string | null;
  address: string | null;
  notes: string | null;
  last_visit: string | null;
  total_spent: number;
  created_at: string;
}

interface ClientAggregate {
  last_visit: string | null;
  total_spent: number;
}

type RawClient = {
  id: string;
  barbershopId: string;
  name: string;
  phone: string;
  email: string | null;
  birthDate: Date | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
};

const dateOnlyLocalIso = (d: Date | string | null): string | null => {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}T00:00:00`;
};

// total_spent = soma dos earnings (gerados ao concluir); last_visit = último concluído.
const fetchAggregates = async (
  barbershopId: string
): Promise<Map<string, ClientAggregate>> => {
  const rows = await prisma.$queryRaw<
    { client_id: string; last_visit: Date | null; total_spent: unknown }[]
  >(Prisma.sql`
    SELECT a.client_id::text AS client_id,
           MAX(a.date) FILTER (WHERE a.status = 'concluido') AS last_visit,
           COALESCE(SUM(e.amount), 0) AS total_spent
      FROM appointments a
      LEFT JOIN earnings e ON e.appointment_id = a.id
     WHERE a.barbershop_id = ${barbershopId}::uuid
     GROUP BY a.client_id
  `);

  const map = new Map<string, ClientAggregate>();
  for (const row of rows) {
    map.set(row.client_id, {
      last_visit: dateOnlyLocalIso(row.last_visit),
      total_spent: Number(String(row.total_spent ?? 0)),
    });
  }
  return map;
};

const toClientDto = (client: RawClient, agg?: ClientAggregate): ClientDto => ({
  id: client.id,
  barbershop_id: client.barbershopId,
  name: client.name,
  phone: client.phone,
  email: client.email,
  birth_date: dateOnlyLocalIso(client.birthDate),
  address: client.address,
  notes: client.notes,
  last_visit: agg?.last_visit ?? null,
  total_spent: agg?.total_spent ?? 0,
  created_at: client.createdAt.toISOString(),
});

export const clientRepository = {
  async findByPhone(barbershopId: string, phone: string) {
    return prisma.client.findFirst({
      where: { barbershopId, phone },
      select: { id: true },
    });
  },

  async findMany(barbershopId: string, _options?: { orderBy?: string }): Promise<ClientDto[]> {
    const [clients, aggregates] = await Promise.all([
      prisma.client.findMany({
        where: { barbershopId },
        orderBy: { createdAt: 'desc' },
      }),
      fetchAggregates(barbershopId),
    ]);
    return clients.map((c) => toClientDto(c as RawClient, aggregates.get(c.id)));
  },

  async findManyPaginated(
    barbershopId: string,
    options: { page: number; limit: number; orderBy?: string }
  ): Promise<ClientDto[]> {
    const skip = (options.page - 1) * options.limit;
    const [clients, aggregates] = await Promise.all([
      prisma.client.findMany({
        where: { barbershopId },
        skip,
        take: options.limit,
        orderBy: { createdAt: 'desc' },
      }),
      fetchAggregates(barbershopId),
    ]);
    return clients.map((c) => toClientDto(c as RawClient, aggregates.get(c.id)));
  },

  async create(data: {
    barbershopId: string;
    name: string;
    phone: string;
    email: string | null;
    birthDate: string | null;
    address: string | null;
    notes: string | null;
  }): Promise<ClientDto> {
    const created = await prisma.client.create({
      data: {
        barbershopId: data.barbershopId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        address: data.address,
        notes: data.notes,
      },
    });
    return toClientDto(created as RawClient);
  },

  async update(
    id: string,
    barbershopId: string,
    data: {
      name?: string;
      phone?: string;
      email?: string | null;
      birthDate?: string | null;
      address?: string | null;
      notes?: string | null;
    }
  ): Promise<ClientDto | null> {
    const result = await prisma.client.updateMany({
      where: { id, barbershopId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.birthDate !== undefined && {
          birthDate: data.birthDate ? new Date(data.birthDate) : null,
        }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
    if (result.count === 0) return null;

    const updated = await prisma.client.findFirst({ where: { id, barbershopId } });
    return updated ? toClientDto(updated as RawClient) : null;
  },

  async getHistory(barbershopId: string, clientId: string) {
    return prisma.appointment.findMany({
      where: { barbershopId, clientId },
      include: {
        barber: { select: { name: true } },
        service: { select: { name: true, price: true } },
      },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
    });
  },
};
