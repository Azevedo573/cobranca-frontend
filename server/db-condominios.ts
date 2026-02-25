import { eq } from "drizzle-orm";
import { condominios, InsertCondominio } from "../drizzle/schema";
import { getDb } from "./db";
import bcrypt from "bcryptjs";

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

export async function createCondominio(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Hash da senha se fornecida
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 10);
  }
  
  // Converter boolean para number (0/1) para aplicarCorrecaoAuto
  if (typeof data.aplicarCorrecaoAuto === 'boolean') {
    data.aplicarCorrecaoAuto = data.aplicarCorrecaoAuto ? 1 : 0;
  }
  
  const result = await db.insert(condominios).values(data);
  return result;
}

export async function updateCondominio(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Hash da senha se fornecida (se vazio, não atualiza)
  if (data.password) {
    data.password = await bcrypt.hash(data.password, 10);
  } else if (data.password === "") {
    // Remove password do objeto para não atualizar
    delete data.password;
  }
  
  // Converter boolean para number (0/1) para aplicarCorrecaoAuto
  if (typeof data.aplicarCorrecaoAuto === 'boolean') {
    data.aplicarCorrecaoAuto = data.aplicarCorrecaoAuto ? 1 : 0;
  }
  
  await db.update(condominios).set(data).where(eq(condominios.id, id));
  return await getCondominioById(id);
}

export async function deleteCondominio(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(condominios).where(eq(condominios.id, id));
}
