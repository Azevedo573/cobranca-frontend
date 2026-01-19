import { and, eq } from "drizzle-orm";
import { acordos, parcelasAcordo, tentativasCobranca, InsertAcordo, InsertParcelaAcordo, InsertTentativaCobranca } from "../drizzle/schema";
import { getDb } from "./db";

// Tentativas de Cobrança
export async function getTentativasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tentativasCobranca).where(eq(tentativasCobranca.condominioId, condominioId));
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
  return await db.select().from(acordos).where(eq(acordos.condominioId, condominioId));
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

export async function updateParcela(id: number, data: Partial<InsertParcelaAcordo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(parcelasAcordo).set(data).where(eq(parcelasAcordo.id, id));
}
