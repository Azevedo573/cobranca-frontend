import { and, eq } from "drizzle-orm";
import { cobrancas, InsertCobranca } from "../drizzle/schema";
import { getDb } from "./db";

export async function getCobrancasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(eq(cobrancas.condominioId, condominioId));
}

export async function getCobrancasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(eq(cobrancas.devedorId, devedorId));
}

export async function getCobrancaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(cobrancas).where(eq(cobrancas.id, id)).limit(1);
  return result[0] || null;
}

export async function createCobranca(data: InsertCobranca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cobrancas).values(data);
  return result;
}

export async function updateCobranca(id: number, data: Partial<InsertCobranca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cobrancas).set(data).where(eq(cobrancas.id, id));
  return await getCobrancaById(id);
}

export async function deleteCobranca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cobrancas).where(eq(cobrancas.id, id));
}
