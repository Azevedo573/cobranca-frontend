import { modelosDocumento, type ModeloDocumento, type InsertModeloDocumento } from "../drizzle/schema";
import { getDb } from "./db";
import { eq, and, or, isNull, desc } from "drizzle-orm";

// ─── Listagem ────────────────────────────────────────────────────────────────

export async function listModelosByCondominio(condominioId: number | null): Promise<ModeloDocumento[]> {
  const db = await getDb();
  if (!db) return [];

  if (condominioId === null) {
    // Admin: retorna todos os modelos
    return db.select().from(modelosDocumento).where(eq(modelosDocumento.ativo, 1)).orderBy(desc(modelosDocumento.updatedAt));
  }
  // Retorna modelos do condomínio + modelos globais (condominioId = null)
  return db
    .select()
    .from(modelosDocumento)
    .where(
      and(
        eq(modelosDocumento.ativo, 1),
        or(eq(modelosDocumento.condominioId, condominioId), isNull(modelosDocumento.condominioId))
      )
    )
    .orderBy(desc(modelosDocumento.updatedAt));
}

export async function getModeloById(id: number): Promise<ModeloDocumento | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(modelosDocumento).where(eq(modelosDocumento.id, id)).limit(1);
  return rows[0] ?? null;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function createModelo(data: InsertModeloDocumento): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(modelosDocumento).values(data);
  return (result as any).insertId as number;
}

export async function updateModelo(id: number, data: Partial<InsertModeloDocumento>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(modelosDocumento).set(data).where(eq(modelosDocumento.id, id));
}

export async function deleteModelo(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Soft delete
  await db.update(modelosDocumento).set({ ativo: 0 }).where(eq(modelosDocumento.id, id));
}
