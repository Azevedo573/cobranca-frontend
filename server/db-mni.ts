/**
 * db-mni.ts — Helpers de banco de dados para a integração MNI TJRJ.
 */

import { getDb } from "./db";
import {
  mniCredenciais,
  intimacoesMNI,
  sincronizacoesMNI,
  type MniCredencial,
  type InsertMniCredencial,
  type IntimacaoMNI,
  type InsertIntimacaoMNI,
} from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";

// ─── Credenciais ──────────────────────────────────────────────────────────────

export async function getMniCredencial(): Promise<MniCredencial | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(mniCredenciais)
    .where(eq(mniCredenciais.ativo, true))
    .limit(1);
  return rows[0] ?? null;
}

export async function getMniCredencialById(id: number): Promise<MniCredencial | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(mniCredenciais).where(eq(mniCredenciais.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listMniCredenciais(): Promise<MniCredencial[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mniCredenciais).orderBy(desc(mniCredenciais.createdAt));
}

export async function upsertMniCredencial(
  data: Omit<InsertMniCredencial, "id" | "createdAt" | "updatedAt">
): Promise<MniCredencial> {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");

  // Desativa todas as outras credenciais do mesmo tribunal
  await db
    .update(mniCredenciais)
    .set({ ativo: false })
    .where(eq(mniCredenciais.tribunal, data.tribunal ?? "TJRJ"));

  await db.insert(mniCredenciais).values({ ...data, ativo: true });

  const rows = await db
    .select()
    .from(mniCredenciais)
    .orderBy(desc(mniCredenciais.createdAt))
    .limit(1);
  return rows[0];
}

export async function updateMniCredencial(
  id: number,
  data: Partial<Omit<InsertMniCredencial, "id" | "createdAt">>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(mniCredenciais).set(data).where(eq(mniCredenciais.id, id));
}

export async function deleteMniCredencial(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(mniCredenciais).where(eq(mniCredenciais.id, id));
}

// ─── Intimações ───────────────────────────────────────────────────────────────

export async function getIntimacao(id: number): Promise<IntimacaoMNI | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(intimacoesMNI).where(eq(intimacoesMNI.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getIntimacaoPorAviso(idAviso: string): Promise<IntimacaoMNI | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(intimacoesMNI)
    .where(eq(intimacoesMNI.idAviso, idAviso))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListIntimacoesFiltros {
  status?: "pendente" | "visualizado" | "tratado" | "descartado";
  processoId?: number;
  numeroCNJ?: string;
  limit?: number;
  offset?: number;
}

export async function listIntimacoes(filtros: ListIntimacoesFiltros = {}): Promise<IntimacaoMNI[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filtros.status) conditions.push(eq(intimacoesMNI.status, filtros.status));
  if (filtros.processoId) conditions.push(eq(intimacoesMNI.processoId, filtros.processoId));
  if (filtros.numeroCNJ) conditions.push(eq(intimacoesMNI.numeroCNJ, filtros.numeroCNJ));

  return db
    .select()
    .from(intimacoesMNI)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(intimacoesMNI.dataDisponibilizacao), desc(intimacoesMNI.createdAt))
    .limit(filtros.limit ?? 100)
    .offset(filtros.offset ?? 0);
}

export async function countIntimacoesPendentes(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(intimacoesMNI)
    .where(eq(intimacoesMNI.status, "pendente"));
  return rows.length;
}

export async function salvarIntimacao(
  data: Omit<InsertIntimacaoMNI, "id" | "createdAt" | "updatedAt">
): Promise<IntimacaoMNI> {
  const db = await getDb();
  if (!db) throw new Error("DB não disponível");

  // Evita duplicatas pelo idAviso
  if (data.idAviso) {
    const existente = await getIntimacaoPorAviso(data.idAviso);
    if (existente) return existente;
  }

  await db.insert(intimacoesMNI).values(data);

  const rows = await db
    .select()
    .from(intimacoesMNI)
    .orderBy(desc(intimacoesMNI.createdAt))
    .limit(1);
  return rows[0];
}

export async function marcarIntimacaoVisualizada(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const intimacao = await getIntimacao(id);
  if (!intimacao || intimacao.status !== "pendente") return;
  await db
    .update(intimacoesMNI)
    .set({ status: "visualizado" })
    .where(eq(intimacoesMNI.id, id));
}

export async function tratarIntimacao(
  id: number,
  dados: {
    status: "tratado" | "descartado";
    tratadoPorId: number;
    tratadoPorNome: string;
    observacoes?: string;
    prazoGeradoId?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(intimacoesMNI)
    .set({
      status: dados.status,
      tratadoPorId: dados.tratadoPorId,
      tratadoPorNome: dados.tratadoPorNome,
      tratadoEm: new Date(),
      observacoes: dados.observacoes,
      prazoGeradoId: dados.prazoGeradoId,
    })
    .where(eq(intimacoesMNI.id, id));
}

export async function atualizarTeorIntimacao(id: number, teor: string, parametrosJson?: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(intimacoesMNI)
    .set({ teor, parametrosJson })
    .where(eq(intimacoesMNI.id, id));
}

// ─── Log de Sincronizações ────────────────────────────────────────────────────

export async function registrarSincronizacao(data: {
  processoId?: number;
  numeroCNJ?: string;
  tipo: "processo" | "avisos" | "teor";
  status: "sucesso" | "erro" | "parcial";
  movimentacoesImportadas?: number;
  avisosImportados?: number;
  erroMsg?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(sincronizacoesMNI).values({
    processoId: data.processoId,
    numeroCNJ: data.numeroCNJ,
    tipo: data.tipo,
    status: data.status,
    movimentacoesImportadas: data.movimentacoesImportadas ?? 0,
    avisosImportados: data.avisosImportados ?? 0,
    erroMsg: data.erroMsg,
  });
}

export async function getUltimaSincronizacao(processoId: number): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(sincronizacoesMNI)
    .where(
      and(
        eq(sincronizacoesMNI.processoId, processoId),
        eq(sincronizacoesMNI.status, "sucesso")
      )
    )
    .orderBy(desc(sincronizacoesMNI.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}
