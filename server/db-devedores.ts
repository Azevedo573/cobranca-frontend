import { and, eq } from "drizzle-orm";
import { devedores, InsertDevedor } from "../drizzle/schema";
import { getDb } from "./db";

export async function getDevedoresByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devedores).where(eq(devedores.condominioId, condominioId));
}

export async function getDevedorById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(devedores).where(eq(devedores.id, id)).limit(1);
  return result[0] || null;
}

export async function createDevedor(data: InsertDevedor) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devedores).values(data);
  return result;
}

export async function updateDevedor(id: number, data: Partial<InsertDevedor>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(devedores).set(data).where(eq(devedores.id, id));
  return await getDevedorById(id);
}

export async function deleteDevedor(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devedores).where(eq(devedores.id, id));
}
