import { eq } from "drizzle-orm";
import { condominios, InsertCondominio } from "../drizzle/schema";
import { getDb } from "./db";

export async function getAllCondominios() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(condominios);
}

export async function getCondominioById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(condominios).where(eq(condominios.id, id)).limit(1);
  return result[0] || null;
}

export async function createCondominio(data: InsertCondominio) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(condominios).values(data);
  return result;
}

export async function updateCondominio(id: number, data: Partial<InsertCondominio>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(condominios).set(data).where(eq(condominios.id, id));
  return await getCondominioById(id);
}

export async function deleteCondominio(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(condominios).where(eq(condominios.id, id));
}
