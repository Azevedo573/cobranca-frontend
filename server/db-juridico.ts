import { getDb } from "./db";
import { juridicoTickets, juridicoMensagens } from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

// ─── Tickets ─────────────────────────────────────────────────────────────────

export async function createTicket(data: {
  condominioId: number;
  titulo: string;
  descricao: string;
  categoria: string;
  prioridade: string;
  criadoPorId: number;
  responsavelId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(juridicoTickets).values({
    condominioId: data.condominioId,
    titulo: data.titulo,
    descricao: data.descricao,
    categoria: data.categoria as any,
    prioridade: data.prioridade as any,
    criadoPorId: data.criadoPorId,
    responsavelId: data.responsavelId ?? null,
    status: "aberto",
  });
  return { id: Number(result[0].insertId) };
}

export async function getTicketById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(juridicoTickets).where(eq(juridicoTickets.id, id));
  return rows[0] ?? null;
}

export async function getTicketsByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  const { users } = await import("../drizzle/schema");
  const rows = await db
    .select({
      id: juridicoTickets.id,
      condominioId: juridicoTickets.condominioId,
      titulo: juridicoTickets.titulo,
      descricao: juridicoTickets.descricao,
      categoria: juridicoTickets.categoria,
      prioridade: juridicoTickets.prioridade,
      status: juridicoTickets.status,
      responsavelId: juridicoTickets.responsavelId,
      responsavelNome: users.name,
      criadoPorId: juridicoTickets.criadoPorId,
      resolvidoEm: juridicoTickets.resolvidoEm,
      createdAt: juridicoTickets.createdAt,
      updatedAt: juridicoTickets.updatedAt,
    })
    .from(juridicoTickets)
    .leftJoin(users, eq(juridicoTickets.responsavelId, users.id))
    .where(eq(juridicoTickets.condominioId, condominioId))
    .orderBy(desc(juridicoTickets.createdAt));
  return rows;
}

export async function getAllTickets() {
  const db = await getDb();
  if (!db) return [];
  const { users } = await import("../drizzle/schema");
  const rows = await db
    .select({
      id: juridicoTickets.id,
      condominioId: juridicoTickets.condominioId,
      titulo: juridicoTickets.titulo,
      descricao: juridicoTickets.descricao,
      categoria: juridicoTickets.categoria,
      prioridade: juridicoTickets.prioridade,
      status: juridicoTickets.status,
      responsavelId: juridicoTickets.responsavelId,
      responsavelNome: users.name,
      criadoPorId: juridicoTickets.criadoPorId,
      resolvidoEm: juridicoTickets.resolvidoEm,
      createdAt: juridicoTickets.createdAt,
      updatedAt: juridicoTickets.updatedAt,
    })
    .from(juridicoTickets)
    .leftJoin(users, eq(juridicoTickets.responsavelId, users.id))
    .orderBy(desc(juridicoTickets.createdAt));
  return rows;
}

export async function updateTicket(
  id: number,
  data: Partial<{
    status: string;
    prioridade: string;
    responsavelId: number | null;
    resolvidoEm: Date | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(juridicoTickets)
    .set(data as any)
    .where(eq(juridicoTickets.id, id));
  return { success: true };
}

// ─── Mensagens ───────────────────────────────────────────────────────────────

export async function createMensagem(data: {
  ticketId: number;
  autorId: number;
  conteudo: string;
  tipoAutor: "cliente" | "escritorio" | "sistema";
  anexos?: Array<{ nome: string; url: string; tipo: string }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(juridicoMensagens).values({
    ticketId: data.ticketId,
    autorId: data.autorId,
    conteudo: data.conteudo,
    tipoAutor: data.tipoAutor,
    anexos: data.anexos ? JSON.stringify(data.anexos) : null,
  });
  return { id: Number(result[0].insertId) };
}

export async function getMensagensByTicket(ticketId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(juridicoMensagens)
    .where(eq(juridicoMensagens.ticketId, ticketId))
    .orderBy(juridicoMensagens.createdAt);
  return rows.map((r) => ({
    ...r,
    anexos: r.anexos ? JSON.parse(r.anexos) : [],
  }));
}

export async function countMensagensNaoLidas(ticketId: number, tipoAutor: "cliente" | "escritorio") {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(juridicoMensagens)
    .where(
      and(
        eq(juridicoMensagens.ticketId, ticketId),
        eq(juridicoMensagens.tipoAutor, tipoAutor)
      )
    );
  return Number(rows[0]?.count ?? 0);
}
