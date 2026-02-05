import { and, eq } from "drizzle-orm";
import { acordos, parcelasAcordo, tentativasCobranca, users, InsertAcordo, InsertParcelaAcordo, InsertTentativaCobranca } from "../drizzle/schema";
import { getDb } from "./db";

// Tentativas de Cobrança
export async function getTentativasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar tentativas com informações do usuário (colaborador)
  const result = await db
    .select({
      id: tentativasCobranca.id,
      cobrancaId: tentativasCobranca.cobrancaId,
      devedorId: tentativasCobranca.devedorId,
      condominioId: tentativasCobranca.condominioId,
      userId: tentativasCobranca.userId,
      contactType: tentativasCobranca.contactType,
      notes: tentativasCobranca.notes,
      result: tentativasCobranca.result,
      attemptDate: tentativasCobranca.attemptDate,
      nextAttemptDate: tentativasCobranca.nextAttemptDate,
      createdAt: tentativasCobranca.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tentativasCobranca)
    .leftJoin(users, eq(tentativasCobranca.userId, users.id))
    .where(eq(tentativasCobranca.condominioId, condominioId));
  
  return result;
}

export async function getAllTentativas() {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar todas as tentativas com informações do usuário (para admin)
  const result = await db
    .select({
      id: tentativasCobranca.id,
      cobrancaId: tentativasCobranca.cobrancaId,
      devedorId: tentativasCobranca.devedorId,
      condominioId: tentativasCobranca.condominioId,
      userId: tentativasCobranca.userId,
      contactType: tentativasCobranca.contactType,
      notes: tentativasCobranca.notes,
      result: tentativasCobranca.result,
      attemptDate: tentativasCobranca.attemptDate,
      nextAttemptDate: tentativasCobranca.nextAttemptDate,
      createdAt: tentativasCobranca.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tentativasCobranca)
    .leftJoin(users, eq(tentativasCobranca.userId, users.id));
  
  return result;
}

export async function getTentativasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tentativasCobranca).where(eq(tentativasCobranca.devedorId, devedorId));
}

export async function createTentativa(data: InsertTentativaCobranca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tentativasCobranca).values(data);
  return result;
}

// Acordos
export async function getAcordosByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { devedores } = await import("../drizzle/schema");
  
  const result = await db
    .select({
      id: acordos.id,
      cobrancaId: acordos.cobrancaId,
      devedorId: acordos.devedorId,
      condominioId: acordos.condominioId,
      totalAmount: acordos.totalAmount,
      agreedAmount: acordos.agreedAmount,
      installments: acordos.installments,
      firstPaymentDate: acordos.firstPaymentDate,
      paymentFrequency: acordos.paymentFrequency,
      status: acordos.status,
      notes: acordos.notes,
      createdAt: acordos.createdAt,
      updatedAt: acordos.updatedAt,
      devedorName: devedores.name,
    })
    .from(acordos)
    .leftJoin(devedores, eq(acordos.devedorId, devedores.id))
    .where(eq(acordos.condominioId, condominioId));
  
  return result;
}

export async function getAcordoById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(acordos).where(eq(acordos.id, id)).limit(1);
  return result[0] || null;
}

export async function createAcordo(data: InsertAcordo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(acordos).values(data);
  return result;
}

export async function updateAcordo(id: number, data: Partial<InsertAcordo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(acordos).set(data).where(eq(acordos.id, id));
  return await getAcordoById(id);
}

// Parcelas de Acordo
export async function getParcelasByAcordo(acordoId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.acordoId, acordoId));
}

export async function createParcela(data: InsertParcelaAcordo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(parcelasAcordo).values(data);
  return result;
}

export async function createParcelas(parcelas: InsertParcelaAcordo[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (parcelas.length === 0) return [];
  const result = await db.insert(parcelasAcordo).values(parcelas);
  return result;
}

export async function updateParcela(id: number, data: Partial<InsertParcelaAcordo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(parcelasAcordo).set(data).where(eq(parcelasAcordo.id, id));
}
