import { getDb } from "./db";
import { TRPCError } from "@trpc/server";
import { eq, desc, asc, and, gte, lte, inArray, sql } from "drizzle-orm";
import {
  demandas,
  colunasDemanda,
  timelineDemanda,
  anexosDemanda,
  assembleias,
  condominios,
  users,
  tarefasDemanda,
  juridicoEquipes,
  juridicoEquipeMembros,
  profiles,
  profilePermissions,
  devedores,
  cobrancas,
} from "../drizzle/schema";

// ─── Colunas Kanban ───────────────────────────────────────────────────────────

/**
 * Retorna as colunas visíveis para um usuário:
 * - Colunas fixas globais (userId IS NULL): entrada e saída
 * - Colunas intermediárias do próprio usuário (userId = userId)
 */
export async function getColunasDemanda(userId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (!userId) {
    // Sem userId: retorna apenas as fixas globais
    return db
      .select()
      .from(colunasDemanda)
      .where(sql`${colunasDemanda.userId} IS NULL`)
      .orderBy(asc(colunasDemanda.ordem));
  }
  // Retorna fixas globais + intermediárias do usuário
  return db
    .select()
    .from(colunasDemanda)
    .where(
      sql`(${colunasDemanda.userId} IS NULL AND ${colunasDemanda.tipo} IN ('entrada','saida'))
       OR (${colunasDemanda.userId} = ${userId} AND ${colunasDemanda.tipo} = 'intermediaria')`
    )
    .orderBy(asc(colunasDemanda.ordem));
}

/** Retorna a coluna de entrada (tipo=entrada) — usada ao criar novas demandas */
export async function getColunaEntrada() {
  const db = await getDb();
  if (!db) return null;
  const [col] = await db
    .select()
    .from(colunasDemanda)
    .where(and(eq(colunasDemanda.tipo, "entrada"), sql`${colunasDemanda.userId} IS NULL`))
    .orderBy(asc(colunasDemanda.ordem))
    .limit(1);
  return col ?? null;
}

/** Retorna a coluna de saída (tipo=saida) — usada para concluir demandas */
export async function getColunaSaida() {
  const db = await getDb();
  if (!db) return null;
  const [col] = await db
    .select()
    .from(colunasDemanda)
    .where(and(eq(colunasDemanda.tipo, "saida"), sql`${colunasDemanda.userId} IS NULL`))
    .orderBy(asc(colunasDemanda.ordem))
    .limit(1);
  return col ?? null;
}

export async function createColunaDemanda(data: {
  nome: string;
  icone?: string;
  cor?: string;
  userId: number; // obrigatório: colunas intermediárias são sempre pessoais
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  // Busca a maior ordem entre as colunas intermediárias deste usuário
  const [maxIntermed] = await db
    .select({ max: sql<number>`MAX(${colunasDemanda.ordem})` })
    .from(colunasDemanda)
    .where(
      sql`${colunasDemanda.tipo} = 'intermediaria' AND ${colunasDemanda.userId} = ${data.userId}`
    );
  // Coluna de saída global fica sempre por último (ordem 99)
  const novaOrdem = (maxIntermed?.max ?? 0) + 1;
  const result = await db.insert(colunasDemanda).values({
    nome: data.nome,
    icone: data.icone ?? "📋",
    cor: data.cor ?? "slate",
    ordem: novaOrdem,
    padrao: 0,
    tipo: "intermediaria",
    userId: data.userId,
  });
  return result;
}

export async function updateColunaDemanda(
  id: number,
  userId: number,
  data: { nome?: string; icone?: string; cor?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [col] = await db.select().from(colunasDemanda).where(eq(colunasDemanda.id, id)).limit(1);
  if (!col) throw new Error("Coluna não encontrada");
  if (col.tipo === "entrada" || col.tipo === "saida") {
    throw new Error("Não é possível editar colunas fixas do sistema");
  }
  // Só o dono da coluna pode editar
  if (col.userId !== userId) {
    throw new Error("Você não tem permissão para editar esta coluna");
  }
  return db.update(colunasDemanda).set(data).where(eq(colunasDemanda.id, id));
}

export async function deleteColunaDemanda(id: number, userId: number, autorizar: (id: number) => Promise<void>) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const [col] = await tx.select().from(colunasDemanda).where(eq(colunasDemanda.id, id)).limit(1).for("update");
    if (!col || col.userId !== userId) throw new TRPCError({ code: "NOT_FOUND", message: "Coluna não encontrada" });
    if (col.tipo !== "intermediaria") throw new TRPCError({ code: "FORBIDDEN", message: "Colunas fixas não podem ser excluídas" });
    const casos = await tx.select().from(demandas).where(eq(demandas.colunaId, id)).orderBy(asc(demandas.id)).for("update");
    for (const caso of casos) await autorizar(caso.id);
    const [entrada] = await tx.select().from(colunasDemanda)
      .where(and(eq(colunasDemanda.tipo, "entrada"), sql`${colunasDemanda.userId} IS NULL`)).limit(1);
    if (casos.length && !entrada) throw new TRPCError({ code: "CONFLICT", message: "Coluna de entrada não configurada" });
    for (const caso of casos) await tx.update(demandas).set({ colunaId: entrada!.id }).where(eq(demandas.id, caso.id));
    return tx.delete(colunasDemanda).where(eq(colunasDemanda.id, id));
  });
}

export async function reordenarColunas(colunaIds: number[], userId: number) {
  if (!colunaIds.length || colunaIds.length > 100 || new Set(colunaIds).size !== colunaIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Seleção de colunas inválida" });
  }
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.transaction(async tx => {
    const colunas = await tx.select().from(colunasDemanda).where(inArray(colunasDemanda.id, colunaIds)).orderBy(asc(colunasDemanda.id)).for("update");
    for (const id of colunaIds) {
      const col = colunas.find(c => c.id === id);
      if (!col || !((col.userId === userId && col.tipo === "intermediaria") || (col.userId === null && ["entrada", "saida"].includes(col.tipo)))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Coluna fora das preferências pessoais" });
      }
    }
    const pessoais = colunaIds.filter(id => colunas.find(col => col.id === id)?.tipo === "intermediaria");
    // Não altera a ordem das colunas globais para todos os demais usuários.
    for (const [index, id] of Array.from(pessoais.entries())) await tx.update(colunasDemanda).set({ ordem: index + 1 }).where(eq(colunasDemanda.id, id));
  });
}

export async function migrarColunasPadrao() {
  /**
   * Migração: garante que as colunas existentes tenham o campo tipo correto.
   * - Primeira coluna (ordem=0 ou nome="Recebido") → tipo=entrada
   * - Última coluna com nome "Concluído" ou "Cancelado" → tipo=saida (cria se não existir)
   * - Demais → tipo=intermediaria
   * Executada automaticamente no boot do servidor.
   */
  const db = await getDb();
  if (!db) return;
  const cols = await db.select().from(colunasDemanda).orderBy(asc(colunasDemanda.ordem));
  if (cols.length === 0) return;
  // Verifica se já existe coluna de entrada e saída
  const temEntrada = cols.some(c => c.tipo === "entrada");
  const temSaida = cols.some(c => c.tipo === "saida");
  if (temEntrada && temSaida) return; // já migrado
  // Marca a primeira coluna como entrada
  if (!temEntrada) {
    const primeiraColuna = cols[0];
    await db.update(colunasDemanda).set({ tipo: "entrada" }).where(eq(colunasDemanda.id, primeiraColuna.id));
  }
  // Marca a última coluna como saída (ou cria uma nova)
  if (!temSaida) {
    // Procura por "Concluído" ou "Cancelado"
    const colConcluido = cols.find(c => c.nome.toLowerCase().includes("conclu") || c.nome.toLowerCase().includes("resolv"));
    if (colConcluido) {
      await db.update(colunasDemanda).set({ tipo: "saida" }).where(eq(colunasDemanda.id, colConcluido.id));
    } else {
      // Cria uma nova coluna de saída
      const maxOrdem = Math.max(...cols.map(c => c.ordem));
      await db.insert(colunasDemanda).values({
        nome: "Demandas Resolvidas",
        icone: "✅",
        cor: "green",
        ordem: maxOrdem + 1,
        padrao: 1,
        tipo: "saida",
      });
    }
  }
  // Marca todas as demais como intermediaria
  const colsAtualizadas = await db.select().from(colunasDemanda);
  for (const col of colsAtualizadas) {
    if (col.tipo !== "entrada" && col.tipo !== "saida") {
      await db.update(colunasDemanda).set({ tipo: "intermediaria" }).where(eq(colunasDemanda.id, col.id));
    }
  }
}

/**
 * Seed de colunas para um usuário específico:
 * - Garante que as colunas fixas globais (entrada/saida) existam (userId=null)
 * - Cria colunas intermediárias de exemplo para o usuário se ele ainda não tiver nenhuma
 */
export async function seedColunasPadrao(userId?: number) {
  const db = await getDb();
  if (!db) return;

  // 1. Garante as colunas fixas globais (userId IS NULL)
  const fixasExistentes = await db
    .select()
    .from(colunasDemanda)
    .where(sql`${colunasDemanda.userId} IS NULL AND ${colunasDemanda.tipo} IN ('entrada','saida')`);

  const temEntradaGlobal = fixasExistentes.some(c => c.tipo === "entrada");
  const temSaidaGlobal = fixasExistentes.some(c => c.tipo === "saida");

  if (!temEntradaGlobal) {
    await db.insert(colunasDemanda).values({
      nome: "Demandas Recebidas", icone: "📥", cor: "blue",
      ordem: 0, padrao: 1, tipo: "entrada", userId: null,
    });
  }
  if (!temSaidaGlobal) {
    await db.insert(colunasDemanda).values({
      nome: "Demandas Resolvidas", icone: "✅", cor: "green",
      ordem: 99, padrao: 1, tipo: "saida", userId: null,
    });
  }

  // 2. Se userId fornecido, cria colunas intermediárias de exemplo para o usuário
  if (userId) {
    const intermedExistentes = await db
      .select()
      .from(colunasDemanda)
      .where(
        sql`${colunasDemanda.tipo} = 'intermediaria' AND ${colunasDemanda.userId} = ${userId}`
      );
    if (intermedExistentes.length === 0) {
      // Cria etapas de exemplo para o novo usuário
      await db.insert(colunasDemanda).values([
        { nome: "Em Análise",         icone: "🔍", cor: "yellow", ordem: 1, padrao: 0, tipo: "intermediaria", userId },
        { nome: "Elaboração de Peça", icone: "📄", cor: "orange", ordem: 2, padrao: 0, tipo: "intermediaria", userId },
        { nome: "Aguardando Cliente", icone: "⏳", cor: "amber",  ordem: 3, padrao: 0, tipo: "intermediaria", userId },
        { nome: "Em Audiência",       icone: "⚖️", cor: "purple", ordem: 4, padrao: 0, tipo: "intermediaria", userId },
      ]);
    }
  }
}

// ─── Demandas ─────────────────────────────────────────────────────────────────

async function gerarNumeroDemanda(): Promise<string> {
  const db = await getDb();
  if (!db) return "#0001";
  // Usa MAX(id) para evitar colisão em inserções concorrentes.
  // COUNT(*) geraria duplicatas se duas demandas fossem criadas ao mesmo tempo.
  const [result] = await db
    .select({ maxId: sql<number>`COALESCE(MAX(${demandas.id}), 0)` })
    .from(demandas);
  const num = (result?.maxId ?? 0) + 1;
  return `#${String(num).padStart(4, "0")}`;
}

export async function createDemanda(data: {
  condominioId?: number | null;
  equipeId?: number | null;
  colunaId: number;
  solicitante?: string;
  solicitanteTipo?: string;
  canal: "whatsapp" | "email" | "portal" | "telefone" | "presencial" | "assembleia" | "processo_interno" | "manual";
  assunto: string;
  descricao?: string;
  tipo: string;
  prioridade?: "baixa" | "media" | "alta" | "urgente";
  prazo?: Date | null;
  responsavelId?: number | null;
  responsavelNome?: string | null;
  devedorId?: number | null;
  cobrancaId?: number | null;
  criadoPorId?: number;
}) {
  const connection = await getDb();
  if (!connection) throw new Error("DB unavailable");
  return connection.transaction(async db => {
  const numero = await gerarNumeroDemanda();
  const result = await db.insert(demandas).values({
    numero,
    condominioId: data.condominioId ?? null,
    equipeId: data.equipeId ?? null,
    colunaId: data.colunaId,
    solicitante: data.solicitante,
    solicitanteTipo: data.solicitanteTipo,
    canal: data.canal,
    assunto: data.assunto,
    descricao: data.descricao,
    tipo: data.tipo as any,
    prioridade: data.prioridade ?? "media",
    prazo: data.prazo ?? null,
    responsavelId: data.responsavelId ?? null,
    responsavelNome: data.responsavelNome,
    devedorId: data.devedorId ?? null,
    cobrancaId: data.cobrancaId ?? null,
    criadoPorId: data.criadoPorId,
  });
  const insertId = (result as any).insertId ?? (result[0] as any)?.insertId;
  if (insertId) {
    await db.insert(timelineDemanda).values({
      demandaId: insertId,
      tipo: "criacao",
      descricao: `Demanda ${numero} criada via ${data.canal}`,
      usuarioId: data.criadoPorId,
    });
  }
  return { insertId, numero };
  });
}

export async function getDemandas(filters: {
  condominioId?: number;
  colunaId?: number;
  responsavelId?: number;
  /** Predicado gerado por demandaScopeCondition com escopo fresco. */
  scopeCondition: import("drizzle-orm").SQL;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [filters.scopeCondition];
  if (filters?.condominioId) conditions.push(eq(demandas.condominioId, filters.condominioId));
  if (filters?.colunaId) conditions.push(eq(demandas.colunaId, filters.colunaId));
  if (filters?.responsavelId) conditions.push(eq(demandas.responsavelId, filters.responsavelId));
  const query = db
    .select({
      id: demandas.id,
      numero: demandas.numero,
      condominioId: demandas.condominioId,
      equipeId: demandas.equipeId,
      condominioNome: condominios.name,
      colunaId: demandas.colunaId,
      solicitante: demandas.solicitante,
      solicitanteTipo: demandas.solicitanteTipo,
      canal: demandas.canal,
      assunto: demandas.assunto,
      descricao: demandas.descricao,
      tipo: demandas.tipo,
      prioridade: demandas.prioridade,
      prazo: demandas.prazo,
      responsavelId: demandas.responsavelId,
      responsavelNome: demandas.responsavelNome,
      devedorId: demandas.devedorId,
      cobrancaId: demandas.cobrancaId,
      valorDivida: demandas.valorDivida,
      nomeDevedor: demandas.nomeDevedor,
      cpfDevedor: demandas.cpfDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      qtdCobrancas: demandas.qtdCobrancas,
      criadoPorId: demandas.criadoPorId,
      status: demandas.status,
      resolvidoEm: demandas.resolvidoEm,
      ordemColuna: demandas.ordemColuna,
      createdAt: demandas.createdAt,
      updatedAt: demandas.updatedAt,
    })
    .from(demandas)
    .leftJoin(condominios, eq(demandas.condominioId, condominios.id))
    .orderBy(asc(demandas.ordemColuna), desc(demandas.createdAt));
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getDemandaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: demandas.id,
      numero: demandas.numero,
      condominioId: demandas.condominioId,
      equipeId: demandas.equipeId,
      condominioNome: condominios.name,
      colunaId: demandas.colunaId,
      solicitante: demandas.solicitante,
      solicitanteTipo: demandas.solicitanteTipo,
      canal: demandas.canal,
      assunto: demandas.assunto,
      descricao: demandas.descricao,
      tipo: demandas.tipo,
      prioridade: demandas.prioridade,
      prazo: demandas.prazo,
      responsavelId: demandas.responsavelId,
      responsavelNome: demandas.responsavelNome,
      devedorId: demandas.devedorId,
      cobrancaId: demandas.cobrancaId,
      valorDivida: demandas.valorDivida,
      nomeDevedor: demandas.nomeDevedor,
      cpfDevedor: demandas.cpfDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      qtdCobrancas: demandas.qtdCobrancas,
      criadoPorId: demandas.criadoPorId,
      createdAt: demandas.createdAt,
      updatedAt: demandas.updatedAt,
    })
    .from(demandas)
    .leftJoin(condominios, eq(demandas.condominioId, condominios.id))
    .where(eq(demandas.id, id))
    .limit(1);
  const row = rows[0] ?? null;
  return row;
}

export async function updateDemanda(
  id: number,
  data: Partial<{
    colunaId: number;
    solicitante: string;
    solicitanteTipo: string;
    canal: string;
    assunto: string;
    descricao: string;
    tipo: string;
    prioridade: string;
    prazo: Date | null;
    responsavelId: number | null;
    responsavelNome: string | null;
    condominioId: number | null;
    equipeId: number | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(demandas).set(data as any).where(eq(demandas.id, id));
}

type DemandaAtual = typeof demandas.$inferSelect;
type DemandaOperacao = { id: number; esperada: DemandaAtual; data: Record<string, any> };

export async function getColunaDemanda(id: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [coluna] = await db.select().from(colunasDemanda).where(eq(colunasDemanda.id, id)).limit(1);
  return coluna ?? null;
}

export async function assertColunaDemandaAccess(id: number, userId: number, admin = false) {
  const coluna = await getColunaDemanda(id);
  if (!coluna || (!admin && !(coluna.userId === userId && coluna.tipo === "intermediaria") &&
      !(coluna.userId === null && ["entrada", "saida"].includes(coluna.tipo)))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Coluna não encontrada" });
  }
  return coluna;
}

export async function assertEquipeDemandaAtiva(equipeId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [equipe] = await db.select({ id: juridicoEquipes.id }).from(juridicoEquipes)
    .where(and(eq(juridicoEquipes.id, equipeId), eq(juridicoEquipes.isActive, 1))).limit(1);
  if (!equipe) throw new TRPCError({ code: "BAD_REQUEST", message: "Equipe inexistente ou inativa" });
}

export async function assertTrocaEquipeSemTarefas(demandaId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [tarefa] = await db.select({ id: tarefasDemanda.id }).from(tarefasDemanda).where(eq(tarefasDemanda.demandaId, demandaId)).limit(1);
  if (tarefa) throw new TRPCError({ code: "CONFLICT", message: "Demandas com tarefas exigem alteração de contexto pelo fluxo dedicado" });
}

export async function getNomeActorDemanda(userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [usuario] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  return usuario?.name ?? undefined;
}

/** Referências financeiras são verificadas por tenant, sem modificar seus valores. */
export async function validarVinculosDemanda(data: { condominioId?: number | null; devedorId?: number | null; cobrancaId?: number | null }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  if (data.devedorId) {
    const [devedor] = await db.select({ condominioId: devedores.condominioId }).from(devedores).where(eq(devedores.id, data.devedorId)).limit(1);
    if (!devedor || devedor.condominioId !== data.condominioId) throw new TRPCError({ code: "NOT_FOUND", message: "Devedor fora do condomínio da demanda" });
  }
  if (data.cobrancaId) {
    const [cobranca] = await db.select({ condominioId: cobrancas.condominioId, devedorId: cobrancas.devedorId }).from(cobrancas).where(eq(cobrancas.id, data.cobrancaId)).limit(1);
    if (!cobranca || cobranca.condominioId !== data.condominioId || (data.devedorId && cobranca.devedorId !== data.devedorId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Cobrança fora do contexto da demanda" });
    }
  }
}

export function assertEstadoDemandaAtual(atual: DemandaAtual | undefined, esperada: DemandaAtual) {
  if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Demanda não encontrada" });
  // A tabela legada não possui versão inteira. Compara snapshot sob FOR UPDATE;
  // updatedAt isolado tem precisão insuficiente para duas alterações no mesmo segundo.
  for (const chave of Object.keys(esperada) as (keyof DemandaAtual)[]) {
    const normalize = (valor: unknown) => valor instanceof Date ? valor.getTime() : valor;
    if (normalize(atual[chave]) !== normalize(esperada[chave])) {
      throw new TRPCError({ code: "CONFLICT", message: "A demanda foi alterada. Atualize a tela e tente novamente" });
    }
  }
}

/** A seleção inteira é travada e validada antes da primeira escrita. */
export async function executarDemandasAtomico(operacoes: DemandaOperacao[], actor: { id: number }, revalidar?: () => Promise<void>) {
  if (!operacoes.length || operacoes.length > 200 || new Set(operacoes.map(op => op.id)).size !== operacoes.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Seleção inválida" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db.transaction(async tx => {
    const ids = operacoes.map(op => op.id).sort((a, b) => a - b);
    const atuais = await tx.select().from(demandas).where(inArray(demandas.id, ids)).orderBy(asc(demandas.id)).for("update");
    for (const op of operacoes) assertEstadoDemandaAtual(atuais.find(row => row.id === op.id), op.esperada);
    if (revalidar) await revalidar();
    for (const op of operacoes) {
      if ((op.data.equipeId !== undefined && op.data.equipeId !== op.esperada.equipeId) ||
          (op.data.condominioId !== undefined && op.data.condominioId !== op.esperada.condominioId)) {
        const [tarefa] = await tx.select({ id: tarefasDemanda.id }).from(tarefasDemanda).where(eq(tarefasDemanda.demandaId, op.id)).limit(1).for("update");
        if (tarefa) throw new TRPCError({ code: "CONFLICT", message: "Demandas com tarefas exigem alteração de contexto pelo fluxo dedicado" });
      }
    }
    const [usuario] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.id)).limit(1);
    const colunas = new Map<number, typeof colunasDemanda.$inferSelect>();
    for (const op of operacoes) {
      if (op.data.colunaId !== undefined) {
        const [coluna] = await tx.select().from(colunasDemanda).where(eq(colunasDemanda.id, op.data.colunaId)).limit(1).for("update");
        if (!coluna) throw new TRPCError({ code: "NOT_FOUND", message: "Coluna não encontrada" });
        colunas.set(coluna.id, coluna);
      }
    }
    for (const op of operacoes) {
      const data = { ...op.data };
      const coluna = data.colunaId === undefined ? undefined : colunas.get(data.colunaId);
      if (coluna?.tipo === "saida") {
        data.status = "concluida";
        data.resolvidoEm = new Date();
      }
      await tx.update(demandas).set(data).where(eq(demandas.id, op.id));
      let tipo: typeof timelineDemanda.$inferInsert.tipo = "outro";
      let descricao = "Dados da demanda atualizados";
      if (data.responsavelId !== undefined && data.responsavelId !== op.esperada.responsavelId) {
        tipo = "atribuicao"; descricao = `Responsável alterado para ${data.responsavelNome ?? "não atribuído"}`;
      } else if (coluna) {
        tipo = coluna.tipo === "saida" ? "conclusao" : "movimentacao";
        descricao = coluna.tipo === "saida" ? `Demanda concluída e movida para "${coluna.nome}"` : `Movida para "${coluna.nome}"`;
      } else if (Object.keys(data).length === 1 && data.ordemColuna !== undefined) {
        tipo = "movimentacao"; descricao = "Ordem da demanda alterada";
      }
      await tx.insert(timelineDemanda).values({ demandaId: op.id, tipo, descricao, usuarioId: actor.id, usuarioNome: usuario?.name ?? undefined });
    }
  });
}

export async function contarTarefasAbertasDemanda(demandaId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ total: sql<number>`COUNT(*)` }).from(tarefasDemanda)
    .where(and(eq(tarefasDemanda.demandaId, demandaId), sql`${tarefasDemanda.status} NOT IN ('concluida', 'cancelada')`));
  return Number(row?.total ?? 0);
}

export async function deleteDemanda(id: number, actor: { id: number }, esperada: DemandaAtual, revalidar?: () => Promise<void>) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db.transaction(async tx => {
    const [atual] = await tx.select().from(demandas).where(eq(demandas.id, id)).limit(1).for("update");
    assertEstadoDemandaAtual(atual, esperada);
    if (revalidar) await revalidar();
    const [tarefa] = await tx.select({ id: tarefasDemanda.id }).from(tarefasDemanda).where(eq(tarefasDemanda.demandaId, id)).limit(1).for("update");
    if (tarefa) throw new TRPCError({ code: "CONFLICT", message: "Demandas com tarefas não podem ser excluídas. Preserve o histórico das atividades" });
    const [usuario] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actor.id)).limit(1);
    await tx.update(demandas).set({ status: "cancelada" }).where(eq(demandas.id, id));
    await tx.insert(timelineDemanda).values({ demandaId: id, tipo: "cancelamento", descricao: "Demanda cancelada em vez de excluída, preservando histórico e anexos", usuarioId: actor.id, usuarioNome: usuario?.name ?? undefined });
  });
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export async function getTimelineDemanda(demandaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(timelineDemanda)
    .where(eq(timelineDemanda.demandaId, demandaId))
    .orderBy(asc(timelineDemanda.createdAt));
}

export async function addTimelineEvento(data: {
  demandaId: number;
  tipo: "criacao" | "atribuicao" | "movimentacao" | "comentario" | "anexo" | "email" | "whatsapp" | "conclusao" | "cancelamento" | "outro";
  descricao: string;
  usuarioId?: number;
  usuarioNome?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.insert(timelineDemanda).values(data);
}

// ─── Assembleias ──────────────────────────────────────────────────────────────

export async function getAssembleias(filters?: {
  condominioId?: number;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (filters?.condominioId) conditions.push(eq(assembleias.condominioId, filters.condominioId));
  if (filters?.status) conditions.push(eq(assembleias.status, filters.status as any));
  const query = db
    .select({
      id: assembleias.id,
      condominioId: assembleias.condominioId,
      condominioNome: condominios.name,
      tipo: assembleias.tipo,
      data: assembleias.data,
      hora: assembleias.hora,
      endereco: assembleias.endereco,
      advogadoResponsavelId: assembleias.advogadoResponsavelId,
      advogadoNome: assembleias.advogadoNome,
      status: assembleias.status,
      pauta: assembleias.pauta,
      ata: assembleias.ata,
      horasGastas: assembleias.horasGastas,
      observacoes: assembleias.observacoes,
      criadoPorId: assembleias.criadoPorId,
      createdAt: assembleias.createdAt,
    })
    .from(assembleias)
    .leftJoin(condominios, eq(assembleias.condominioId, condominios.id))
    .orderBy(desc(assembleias.data));
  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getAssembleiaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: assembleias.id,
      condominioId: assembleias.condominioId,
      condominioNome: condominios.name,
      tipo: assembleias.tipo,
      data: assembleias.data,
      hora: assembleias.hora,
      endereco: assembleias.endereco,
      advogadoResponsavelId: assembleias.advogadoResponsavelId,
      advogadoNome: assembleias.advogadoNome,
      status: assembleias.status,
      pauta: assembleias.pauta,
      ata: assembleias.ata,
      horasGastas: assembleias.horasGastas,
      observacoes: assembleias.observacoes,
      criadoPorId: assembleias.criadoPorId,
      createdAt: assembleias.createdAt,
    })
    .from(assembleias)
    .leftJoin(condominios, eq(assembleias.condominioId, condominios.id))
    .where(eq(assembleias.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function createAssembleia(data: {
  condominioId?: number | null;
  tipo: "ordinaria" | "extraordinaria" | "prestacao_contas" | "eleicao" | "outro";
  data: Date;
  hora: string;
  endereco?: string;
  advogadoResponsavelId?: number | null;
  advogadoNome?: string;
  pauta?: string;
  criadoPorId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.insert(assembleias).values({
    condominioId: data.condominioId ?? null,
    tipo: data.tipo,
    data: data.data,
    hora: data.hora,
    endereco: data.endereco,
    advogadoResponsavelId: data.advogadoResponsavelId ?? null,
    advogadoNome: data.advogadoNome,
    pauta: data.pauta,
    criadoPorId: data.criadoPorId,
    status: "agendada",
  });
}

export async function updateAssembleia(
  id: number,
  data: Partial<{
    tipo: string;
    data: Date;
    hora: string;
    endereco: string;
    advogadoResponsavelId: number | null;
    advogadoNome: string;
    status: string;
    pauta: string;
    ata: string;
    horasGastas: string;
    observacoes: string;
    condominioId: number | null;
  }>
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.update(assembleias).set(data as any).where(eq(assembleias.id, id));
}

export async function deleteAssembleia(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db.delete(assembleias).where(eq(assembleias.id, id));
}

// ─── Dashboard Jurídico ───────────────────────────────────────────────────────

export async function getDashboardJuridico(scopeCondition: import("drizzle-orm").SQL, admin = false) {
  const db = await getDb();
  if (!db) return null;
  const rows = await getDemandas({ scopeCondition });
  const colunaIds = Array.from(new Set(rows.map(row => row.colunaId)));
  const colunas = colunaIds.length ? await db.select().from(colunasDemanda).where(inArray(colunasDemanda.id, colunaIds)) : [];
  const agrupar = <T>(key: (row: typeof rows[number]) => T) => {
    const groups = new Map<T, number>();
    for (const row of rows) groups.set(key(row), (groups.get(key(row)) ?? 0) + 1);
    return groups;
  };
  const porColuna = Array.from(agrupar(row => row.colunaId)).map(([colunaId, total]) => {
    const coluna = colunas.find(col => col.id === colunaId);
    return { colunaId, colunaNome: coluna?.nome ?? null, colunaIcone: coluna?.icone ?? null, cor: coluna?.cor ?? null, total };
  });
  const porPrioridade = Array.from(agrupar(row => row.prioridade)).map(([prioridade, total]) => ({ prioridade, total }));
  const porCanal = Array.from(agrupar(row => row.canal)).map(([canal, total]) => ({ canal, total }));
  const porResponsavel = Array.from(agrupar(row => row.responsavelId)).map(([responsavelId, total]) => ({
    responsavelId, responsavelNome: rows.find(row => row.responsavelId === responsavelId)?.responsavelNome ?? null, total,
  })).sort((a, b) => b.total - a.total).slice(0, 10);
  let assembleiasMes = 0;
  let horasTotaisAssembleias = 0;
  // As métricas de outro módulo continuam exclusivamente administrativas.
  if (admin) {
    const inicio = new Date(); inicio.setDate(1); inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0, 23, 59, 59);
    const [mes] = await db.select({ total: sql<number>`COUNT(*)` }).from(assembleias).where(and(gte(assembleias.data, inicio), lte(assembleias.data, fim)));
    const [horas] = await db.select({ total: sql<number>`SUM(${assembleias.horasGastas})` }).from(assembleias).where(eq(assembleias.status, "realizada"));
    assembleiasMes = Number(mes?.total ?? 0); horasTotaisAssembleias = Number(horas?.total ?? 0);
  }
  return { porColuna, porPrioridade, porCanal, porResponsavel,
    demandasAtrasadas: rows.filter(row => row.prazo && row.prazo <= new Date()).length,
    assembleiasMes, horasTotaisAssembleias, metricasAssembleiasDisponiveis: admin };
}

/** Profissionais atuais do perfil jurídico; nenhum email, hash ou segredo. */
export async function getAdvogados(scope: { admin: boolean; actorId: number; equipeIds: number[]; condominioIds: number[]; somenteProprio?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(users.isActive, 1), eq(users.isDeleted, 0),
    sql`(${users.role} = 'admin' OR (${users.role} IN ('advogado', 'colaborador') AND EXISTS (
      SELECT 1 FROM ${profiles} INNER JOIN ${profilePermissions} ON ${profilePermissions.profileId} = ${profiles.id}
      WHERE ${profiles.id} = ${users.profileId} AND ${profilePermissions.modulo} = 'juridico_demandas'
        AND ${profilePermissions.acao} = 'visualizar' AND ${profilePermissions.permitido} = 1)))`];
  if (scope.somenteProprio || (!scope.admin && !scope.equipeIds.length)) conditions.push(eq(users.id, scope.actorId));
  else if (scope.equipeIds.length) conditions.push(sql`EXISTS (
    SELECT 1 FROM ${juridicoEquipeMembros} INNER JOIN ${juridicoEquipes} ON ${juridicoEquipes.id} = ${juridicoEquipeMembros.equipeId}
    WHERE ${juridicoEquipeMembros.userId} = ${users.id} AND ${juridicoEquipeMembros.isActive} = 1
      AND ${juridicoEquipes.isActive} = 1 AND ${inArray(juridicoEquipeMembros.equipeId, scope.equipeIds)})`);
  const candidatos = await db.select({ id: users.id, name: users.name, role: users.role, condominioId: users.condominioId })
    .from(users).where(and(...conditions)).orderBy(asc(users.name));
  const { getCondominiosAtivosDoUsuario } = await import("./tenant-guard");
  const elegiveis = [];
  for (const usuario of candidatos) {
    if (usuario.role !== "admin") {
      const carteiras = await getCondominiosAtivosDoUsuario(usuario);
      if (!scope.condominioIds.some(id => carteiras.includes(id)) && !(scope.admin && !scope.condominioIds.length)) continue;
    }
    elegiveis.push({ id: usuario.id, name: usuario.name, role: usuario.role });
  }
  return elegiveis;
}

// ─── Integração Jurídico ↔ Cobrança ──────────────────────────────────────────

/**
 * Cria uma demanda jurídica a partir de um devedor inadimplente.
 */
export async function escalarParaJuridico(params: {
  devedorId: number;
  condominioId?: number;
  nomeDevedor: string;
  cpfDevedor?: string;
  unidadeDevedor: string;
  valorDivida: number; // em centavos
  qtdCobrancas: number;
  assunto: string;
  descricao?: string;
  prioridade?: "baixa" | "media" | "alta" | "urgente";
  criadoPorId: number;
  criadoPorNome?: string;
}) {
  const connection = await getDb();
  if (!connection) throw new Error("DB unavailable");
  return connection.transaction(async db => {

  // Buscar a primeira coluna do kanban (menor ordem)
  const [primeiraColuna] = await db
    .select({ id: colunasDemanda.id })
    .from(colunasDemanda)
    .orderBy(asc(colunasDemanda.ordem))
    .limit(1);

  if (!primeiraColuna) {
    throw new Error("Nenhuma coluna do kanban encontrada. Configure o módulo jurídico primeiro.");
  }

  // Gerar número sequencial
  const [ultimaDemanda] = await db
    .select({ numero: demandas.numero })
    .from(demandas)
    .orderBy(desc(demandas.id))
    .limit(1);

  let proximoNumero = 1;
  if (ultimaDemanda?.numero) {
    const match = ultimaDemanda.numero.match(/\d+/);
    if (match) proximoNumero = parseInt(match[0]) + 1;
  }
  const numero = `#${String(proximoNumero).padStart(4, "0")}`;

  const [result] = await db.insert(demandas).values({
    numero,
    condominioId: params.condominioId ?? null,
    colunaId: primeiraColuna.id,
    canal: "manual",
    assunto: params.assunto,
    descricao: params.descricao ?? null,
    tipo: "cobranca_judicial",
    prioridade: params.prioridade ?? "media",
    devedorId: params.devedorId,
    valorDivida: params.valorDivida,
    nomeDevedor: params.nomeDevedor,
    cpfDevedor: params.cpfDevedor ?? null,
    unidadeDevedor: params.unidadeDevedor,
    qtdCobrancas: params.qtdCobrancas,
    criadoPorId: params.criadoPorId,
  });

  const demandaId = (result as any).insertId as number;

  // Adicionar evento na timeline
  await db.insert(timelineDemanda).values({
    demandaId,
    tipo: "criacao",
    descricao: `Demanda criada via escalada de cobrança. Devedor: ${params.nomeDevedor} (${params.unidadeDevedor}). Valor devido: R$ ${(params.valorDivida / 100).toFixed(2).replace(".", ",")}. Cobranças em aberto: ${params.qtdCobrancas}.`,
    usuarioId: params.criadoPorId,
    usuarioNome: params.criadoPorNome ?? undefined,
  });

  return { demandaId, numero };
  });
}

/**
 * Retorna dados do devedor vinculado a uma demanda (snapshot salvo na demanda).
 */
export async function getCobrancasVinculadas(demandaId: number) {
  const db = await getDb();
  if (!db) return null;

  const [demanda] = await db
    .select({
      devedorId: demandas.devedorId,
      nomeDevedor: demandas.nomeDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      valorDivida: demandas.valorDivida,
      qtdCobrancas: demandas.qtdCobrancas,
    })
    .from(demandas)
    .where(eq(demandas.id, demandaId))
    .limit(1);

  if (!demanda?.devedorId) return null;

  return {
    devedorId: demanda.devedorId,
    nomeDevedor: demanda.nomeDevedor,
    unidadeDevedor: demanda.unidadeDevedor,
    valorDivida: demanda.valorDivida,
    qtdCobrancas: demanda.qtdCobrancas,
  };
}

// ─── Visão Consolidada do Administrador ──────────────────────────────────────

/**
 * Retorna todas as demandas em colunas intermediárias (globais + pessoais de todos os advogados).
 * Inclui informações da coluna original (nome, userId, nome do dono da coluna).
 * Usado exclusivamente na visão consolidada do administrador no KanbanDemandas.
 */
export async function listarDemandasConsolidadas(filtroAdvogadoId?: number) {
  const db = await getDb();
  if (!db) return [];

  // Alias para o join de usuário dono da coluna
  const colunaDono = users;

  const conditions: any[] = [
    eq(colunasDemanda.tipo, "intermediaria"),
  ];
  if (filtroAdvogadoId) {
    conditions.push(eq(colunasDemanda.userId, filtroAdvogadoId));
  }

  return db
    .select({
      // Campos da demanda
      id: demandas.id,
      numero: demandas.numero,
      condominioId: demandas.condominioId,
      equipeId: demandas.equipeId,
      condominioNome: condominios.name,
      colunaId: demandas.colunaId,
      solicitante: demandas.solicitante,
      solicitanteTipo: demandas.solicitanteTipo,
      canal: demandas.canal,
      assunto: demandas.assunto,
      descricao: demandas.descricao,
      tipo: demandas.tipo,
      prioridade: demandas.prioridade,
      prazo: demandas.prazo,
      responsavelId: demandas.responsavelId,
      responsavelNome: demandas.responsavelNome,
      devedorId: demandas.devedorId,
      cobrancaId: demandas.cobrancaId,
      valorDivida: demandas.valorDivida,
      nomeDevedor: demandas.nomeDevedor,
      cpfDevedor: demandas.cpfDevedor,
      unidadeDevedor: demandas.unidadeDevedor,
      qtdCobrancas: demandas.qtdCobrancas,
      criadoPorId: demandas.criadoPorId,
      status: demandas.status,
      resolvidoEm: demandas.resolvidoEm,
      ordemColuna: demandas.ordemColuna,
      createdAt: demandas.createdAt,
      updatedAt: demandas.updatedAt,
      // Campos da coluna original
      colunaNome: colunasDemanda.nome,
      colunaIcone: colunasDemanda.icone,
      colunaCor: colunasDemanda.cor,
      colunaUserId: colunasDemanda.userId,
      // Nome do dono da coluna (null se coluna global)
      colunaUserNome: colunaDono.name,
    })
    .from(demandas)
    .innerJoin(colunasDemanda, eq(demandas.colunaId, colunasDemanda.id))
    .leftJoin(condominios, eq(demandas.condominioId, condominios.id))
    .leftJoin(colunaDono, eq(colunasDemanda.userId, colunaDono.id))
    .where(and(...conditions))
    .orderBy(asc(demandas.ordemColuna), desc(demandas.createdAt));
}

/**
 * Retorna lista de usuários que têm pelo menos uma demanda em colunas intermediárias pessoais.
 * Usado para popular o filtro de advogado na visão consolidada do administrador.
 */
export async function listarAdvogadosComDemandas() {
  const db = await getDb();
  if (!db) return [];

  // Busca usuários distintos que são donos de colunas intermediárias com pelo menos 1 demanda
  const rows = await db
    .selectDistinct({
      id: users.id,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .innerJoin(colunasDemanda, eq(colunasDemanda.userId, users.id))
    .innerJoin(demandas, eq(demandas.colunaId, colunasDemanda.id))
    .where(eq(colunasDemanda.tipo, "intermediaria"))
    .orderBy(asc(users.name));

  return rows;
}
