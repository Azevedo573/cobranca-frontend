import { and, eq } from "drizzle-orm";
import { acordos, acordoCobrancas, parcelasAcordo, tentativasCobranca, users, InsertAcordo, InsertParcelaAcordo, InsertTentativaCobranca } from "../drizzle/schema";
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
  // Buscar o ID do acordo recém-criado
  const insertId = (result as any)[0]?.insertId || (result as any).insertId;
  if (!insertId) {
    throw new Error("Failed to get inserted acordo ID");
  }
  return { insertId };
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
  
  // Inserir uma parcela por vez para evitar problemas com Drizzle ORM
  const results = [];
  for (const parcela of parcelas) {
    const result = await db.insert(parcelasAcordo).values(parcela);
    results.push(result);
  }
  
  return results;
}

export async function updateParcela(id: number, data: Partial<InsertParcelaAcordo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(parcelasAcordo).set(data).where(eq(parcelasAcordo.id, id));
}

// Relacionamento Acordo-Cobranças
export async function createAcordoCobrancas(acordoId: number, cobrancaIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar valores originais das cobranças
  const { cobrancas } = await import("../drizzle/schema");
  const cobrancasData = await db.select().from(cobrancas).where(
    eq(cobrancas.id, cobrancaIds[0]) // Simplificado para primeira implementação
  );
  
  const relacionamentos = cobrancaIds.map(cobrancaId => ({
    acordoId,
    cobrancaId,
    valorOriginal: cobrancasData[0]?.amount || 0,
  }));
  
  const result = await db.insert(acordoCobrancas).values(relacionamentos);
  return result;
}

export async function getCobrancasByAcordo(acordoId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { cobrancas } = await import("../drizzle/schema");
  
  const result = await db
    .select({
      id: cobrancas.id,
      devedorId: cobrancas.devedorId,
      condominioId: cobrancas.condominioId,
      tipoCobranca: cobrancas.tipoCobranca,
      description: cobrancas.description,
      amount: cobrancas.amount,
      custasJudiciais: cobrancas.custasJudiciais,
      dueDate: cobrancas.dueDate,
      monthReference: cobrancas.monthReference,
      status: cobrancas.status,
      createdAt: cobrancas.createdAt,
      updatedAt: cobrancas.updatedAt,
      valorOriginal: acordoCobrancas.valorOriginal,
    })
    .from(acordoCobrancas)
    .innerJoin(cobrancas, eq(acordoCobrancas.cobrancaId, cobrancas.id))
    .where(eq(acordoCobrancas.acordoId, acordoId));
  
  return result;
}
