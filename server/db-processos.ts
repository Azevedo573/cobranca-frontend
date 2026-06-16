import { getDb } from "./db";
import { eq, and, desc, asc, like, or } from "drizzle-orm";
import {
  processosJudiciais,
  partesProcesso,
  movimentacoesProcesso,
  financeirosProcesso,
  ProcessoJudicial,
  ParteProcesso,
  MovimentacaoProcesso,
  FinanceiroProcesso,
  InsertProcessoJudicial,
  InsertParteProcesso,
  InsertMovimentacaoProcesso,
  InsertFinanceiroProcesso,
} from "../drizzle/schema";

// ─── Processos ────────────────────────────────────────────────────────────────

export interface FiltrosProcesso {
  condominioId?: number;
  status?: string;
  tipo?: string;
  faseProcessual?: string;
  advogadoId?: number;
  busca?: string;
}

export async function getProcessos(filtros: FiltrosProcesso = {}): Promise<ProcessoJudicial[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];

  if (filtros.condominioId) {
    conditions.push(eq(processosJudiciais.condominioId, filtros.condominioId));
  }
  if (filtros.status) {
    conditions.push(eq(processosJudiciais.status, filtros.status as ProcessoJudicial["status"]));
  }
  if (filtros.tipo) {
    conditions.push(eq(processosJudiciais.tipo, filtros.tipo as ProcessoJudicial["tipo"]));
  }
  if (filtros.faseProcessual) {
    conditions.push(eq(processosJudiciais.faseProcessual, filtros.faseProcessual as ProcessoJudicial["faseProcessual"]));
  }
  if (filtros.advogadoId) {
    conditions.push(eq(processosJudiciais.advogadoId, filtros.advogadoId));
  }
  if (filtros.busca) {
    const termo = `%${filtros.busca}%`;
    conditions.push(
      or(
        like(processosJudiciais.numeroCNJ, termo),
        like(processosJudiciais.comarca, termo),
        like(processosJudiciais.vara, termo),
        like(processosJudiciais.assunto, termo),
        like(processosJudiciais.condominioNome, termo),
        like(processosJudiciais.advogadoNome, termo),
      )
    );
  }

  if (conditions.length > 0) {
    return db.select().from(processosJudiciais)
      .where(and(...conditions))
      .orderBy(desc(processosJudiciais.createdAt));
  }

  return db.select().from(processosJudiciais)
    .orderBy(desc(processosJudiciais.createdAt));
}

export async function getProcessoById(id: number): Promise<ProcessoJudicial | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(processosJudiciais)
    .where(eq(processosJudiciais.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createProcesso(data: InsertProcessoJudicial): Promise<ProcessoJudicial | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(processosJudiciais).values(data);
  const id = (result as any)[0]?.insertId as number;
  return getProcessoById(id);
}

export async function updateProcesso(id: number, data: Partial<InsertProcessoJudicial>): Promise<ProcessoJudicial | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(processosJudiciais).set(data).where(eq(processosJudiciais.id, id));
  return getProcessoById(id);
}

export async function deleteProcesso(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(partesProcesso).where(eq(partesProcesso.processoId, id));
  await db.delete(movimentacoesProcesso).where(eq(movimentacoesProcesso.processoId, id));
  await db.delete(financeirosProcesso).where(eq(financeirosProcesso.processoId, id));
  await db.delete(processosJudiciais).where(eq(processosJudiciais.id, id));
  return true;
}

export async function getResumoProcessos(condominioId?: number) {
  const todos = await getProcessos(condominioId ? { condominioId } : {});

  const ativos = todos.filter((p: ProcessoJudicial) => p.status === "ativo").length;
  const suspensos = todos.filter((p: ProcessoJudicial) => p.status === "suspenso").length;
  const encerrados = todos.filter((p: ProcessoJudicial) => p.status === "encerrado" || p.status === "arquivado").length;

  const porTipo = todos.reduce((acc: Record<string, number>, p: ProcessoJudicial) => {
    acc[p.tipo] = (acc[p.tipo] ?? 0) + 1;
    return acc;
  }, {});

  const porFase = todos.reduce((acc: Record<string, number>, p: ProcessoJudicial) => {
    acc[p.faseProcessual] = (acc[p.faseProcessual] ?? 0) + 1;
    return acc;
  }, {});

  return { total: todos.length, ativos, suspensos, encerrados, porTipo, porFase };
}

// ─── Partes ───────────────────────────────────────────────────────────────────

export async function getPartes(processoId: number): Promise<ParteProcesso[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partesProcesso)
    .where(eq(partesProcesso.processoId, processoId))
    .orderBy(asc(partesProcesso.tipo));
}

export async function addParte(data: InsertParteProcesso): Promise<ParteProcesso | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(partesProcesso).values(data);
  const id = (result as any)[0]?.insertId as number;
  const rows = await db.select().from(partesProcesso).where(eq(partesProcesso.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function removeParte(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(partesProcesso).where(eq(partesProcesso.id, id));
  return true;
}

// ─── Movimentações ────────────────────────────────────────────────────────────

export async function getMovimentacoes(processoId: number): Promise<MovimentacaoProcesso[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(movimentacoesProcesso)
    .where(eq(movimentacoesProcesso.processoId, processoId))
    .orderBy(desc(movimentacoesProcesso.data));
}

export async function addMovimentacao(data: InsertMovimentacaoProcesso): Promise<MovimentacaoProcesso | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(movimentacoesProcesso).values(data);
  const id = (result as any)[0]?.insertId as number;
  const rows = await db.select().from(movimentacoesProcesso)
    .where(eq(movimentacoesProcesso.id, id)).limit(1);

  // Atualizar dataUltimaMovimentacao no processo
  await db.update(processosJudiciais)
    .set({ dataUltimaMovimentacao: data.data })
    .where(eq(processosJudiciais.id, data.processoId));

  return rows[0] ?? null;
}

export async function deleteMovimentacao(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(movimentacoesProcesso).where(eq(movimentacoesProcesso.id, id));
  return true;
}

// ─── Financeiro ───────────────────────────────────────────────────────────────

export async function getFinanceiro(processoId: number): Promise<FinanceiroProcesso[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(financeirosProcesso)
    .where(eq(financeirosProcesso.processoId, processoId))
    .orderBy(desc(financeirosProcesso.data));
}

export async function addFinanceiro(data: InsertFinanceiroProcesso): Promise<FinanceiroProcesso | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(financeirosProcesso).values(data);
  const id = (result as any)[0]?.insertId as number;
  const rows = await db.select().from(financeirosProcesso)
    .where(eq(financeirosProcesso.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateFinanceiro(id: number, data: Partial<InsertFinanceiroProcesso>): Promise<FinanceiroProcesso | null> {
  const db = await getDb();
  if (!db) return null;
  await db.update(financeirosProcesso).set(data).where(eq(financeirosProcesso.id, id));
  const rows = await db.select().from(financeirosProcesso)
    .where(eq(financeirosProcesso.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteFinanceiro(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  await db.delete(financeirosProcesso).where(eq(financeirosProcesso.id, id));
  return true;
}

export async function getResumoFinanceiro(processoId: number) {
  const itens = await getFinanceiro(processoId);
  const totalPago = itens
    .filter((i: FinanceiroProcesso) => i.pago)
    .reduce((s: number, i: FinanceiroProcesso) => s + i.valor, 0);
  const totalPendente = itens
    .filter((i: FinanceiroProcesso) => !i.pago)
    .reduce((s: number, i: FinanceiroProcesso) => s + i.valor, 0);
  const porTipo = itens.reduce((acc: Record<string, number>, i: FinanceiroProcesso) => {
    acc[i.tipo] = (acc[i.tipo] ?? 0) + i.valor;
    return acc;
  }, {});
  return { totalPago, totalPendente, total: totalPago + totalPendente, porTipo };
}
