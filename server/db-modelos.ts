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
  // insertId pode ser bigint em algumas versões do driver MySQL
  const rawId = (result as any).insertId;
  const id = typeof rawId === 'bigint' ? Number(rawId) : Number(rawId);
  if (!id || isNaN(id)) {
    // Fallback: buscar o último registro inserido pelo nome
    const rows = await db
      .select({ id: modelosDocumento.id })
      .from(modelosDocumento)
      .where(eq(modelosDocumento.nome, data.nome ?? ""))
      .orderBy(desc(modelosDocumento.createdAt))
      .limit(1);
    const fallbackId = rows[0]?.id;
    if (!fallbackId) throw new Error("Não foi possível obter o ID do modelo criado");
    return Number(fallbackId);
  }
  return id;
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

// ─── Anexos de Modelos ────────────────────────────────────────────────────────
import { modeloAnexos, type ModeloAnexo, type InsertModeloAnexo } from "../drizzle/schema";
import { asc } from "drizzle-orm";

export async function listAnexosByModelo(modeloId: number): Promise<ModeloAnexo[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(modeloAnexos)
    .where(eq(modeloAnexos.modeloId, modeloId))
    .orderBy(asc(modeloAnexos.ordem));
}

export async function createAnexo(data: InsertModeloAnexo): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(modeloAnexos).values(data);
  return (result as any).insertId as number;
}

export async function updateAnexo(id: number, data: Partial<InsertModeloAnexo>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.update(modeloAnexos).set(data).where(eq(modeloAnexos.id, id));
}

export async function deleteAnexo(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(modeloAnexos).where(eq(modeloAnexos.id, id));
}

export async function reordenarAnexos(modeloId: number, ids: number[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Atualizar ordem de cada anexo em sequência
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(modeloAnexos)
      .set({ ordem: i })
      .where(and(eq(modeloAnexos.id, ids[i]), eq(modeloAnexos.modeloId, modeloId)));
  }
}
