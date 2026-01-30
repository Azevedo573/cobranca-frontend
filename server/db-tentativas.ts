import { getDb } from "./db";
import { tentativasCobranca, devedores } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { InsertTentativaCobranca } from "../drizzle/schema";

export async function createTentativa(data: InsertTentativaCobranca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tentativasCobranca).values(data);
  return result;
}

export async function getTentativasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select({
      id: tentativasCobranca.id,
      devedorId: tentativasCobranca.devedorId,
      devedorName: devedores.name,
      contactType: tentativasCobranca.contactType,
      attemptDate: tentativasCobranca.attemptDate,
      result: tentativasCobranca.result,
      notes: tentativasCobranca.notes,
      userId: tentativasCobranca.userId,
      createdAt: tentativasCobranca.createdAt,
    })
    .from(tentativasCobranca)
    .leftJoin(devedores, eq(tentativasCobranca.devedorId, devedores.id))
    .where(eq(devedores.condominioId, condominioId))
    .orderBy(desc(tentativasCobranca.attemptDate));
}

export async function getTentativasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(tentativasCobranca)
    .where(eq(tentativasCobranca.devedorId, devedorId))
    .orderBy(desc(tentativasCobranca.attemptDate));
}

export async function getTentativaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(tentativasCobranca)
    .where(eq(tentativasCobranca.id, id))
    .limit(1);
  return result[0] || null;
}

export async function updateTentativa(id: number, data: Partial<InsertTentativaCobranca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(tentativasCobranca)
    .set(data)
    .where(eq(tentativasCobranca.id, id));
}

export async function deleteTentativa(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tentativasCobranca).where(eq(tentativasCobranca.id, id));
}

export async function getEstatisticasTentativas(condominioId: number) {
  const db = await getDb();
  if (!db) return { total: 0, sucesso: 0, semResposta: 0, promessaPagamento: 0 };
  const result = await db
    .select({
      total: sql<number>`COUNT(*)`,
      sucesso: sql<number>`SUM(CASE WHEN ${tentativasCobranca.result} = 'sucesso' THEN 1 ELSE 0 END)`,
      semResposta: sql<number>`SUM(CASE WHEN ${tentativasCobranca.result} = 'sem_resposta' THEN 1 ELSE 0 END)`,
      promessaPagamento: sql<number>`SUM(CASE WHEN ${tentativasCobranca.result} = 'promessa_pagamento' THEN 1 ELSE 0 END)`,
    })
    .from(tentativasCobranca)
    .leftJoin(devedores, eq(tentativasCobranca.devedorId, devedores.id))
    .where(eq(devedores.condominioId, condominioId));

  return result[0];
}
