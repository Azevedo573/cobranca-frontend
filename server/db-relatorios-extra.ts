import { getDb } from "./db";
import { and, eq, gte, lte, inArray, desc } from "drizzle-orm";
import {
  cobrancas, devedores, condominios, acordos,
} from "../drizzle/schema";

type FiltroBase = {
  dataInicio?: string;
  dataFim?: string;
  condominioId?: number;
  devedorId?: number;
};

// ─── 1. Inadimplência ────────────────────────────────────────────────────────
export async function getRelatorioInadimplencia(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalDevedores: 0, totalValor: 0, totalCobrado: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));
  cond.push(
    inArray(cobrancas.status, [
      "pendente", "em_cobranca", "em_acordo", "acordo",
      "acordo_atrasado", "em_negociacao", "suspenso", "judicial",
    ])
  );

  const rows = await db
    .select({
      devedorId: devedores.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      cobrancaId: cobrancas.id,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      valorOriginal: cobrancas.amount,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(and(...cond))
    .orderBy(desc(cobrancas.dueDate))
    .limit(2000);

  return {
    rows,
    totais: {
      totalDevedores: new Set(rows.map((r) => r.devedorId)).size,
      totalValor: rows.reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
      totalCobrado: rows.length,
    },
  };
}

// ─── 2. Acordos ──────────────────────────────────────────────────────────────
export async function getRelatorioAcordos(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalAcordos: 0, valorTotal: 0, valorRecuperado: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.dataInicio) cond.push(gte(acordos.createdAt, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(acordos.createdAt, new Date(filtro.dataFim)));

  const rows = await db
    .select({
      acordoId: acordos.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      status: acordos.status,
      valorTotal: acordos.agreedAmount,
      numParcelas: acordos.installments,
      valorPago: acordos.valorPago,
      dataCriacao: acordos.createdAt,
    })
    .from(acordos)
    .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(acordos.createdAt))
    .limit(2000);

  return {
    rows,
    totais: {
      totalAcordos: rows.length,
      valorTotal: rows.reduce((s, r) => s + (r.valorTotal ?? 0), 0),
      valorRecuperado: rows
        .filter((r) => r.status === "pago")
        .reduce((s, r) => s + (r.valorTotal ?? 0), 0),
    },
  };
}

// ─── 3. Extrato ──────────────────────────────────────────────────────────────
export async function getRelatorioExtrato(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalCobrado: 0, totalPago: 0, totalPendente: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.devedorId) cond.push(eq(cobrancas.devedorId, filtro.devedorId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));

  const rows = await db
    .select({
      cobrancaId: cobrancas.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      dataPagamento: cobrancas.paidAt,
      valorOriginal: cobrancas.amount,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(cobrancas.dueDate))
    .limit(2000);

  return {
    rows,
    totais: {
      totalCobrado: rows.reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
      totalPago: rows
        .filter((r) => r.status === "pago")
        .reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
      totalPendente: rows
        .filter((r) => r.status !== "pago")
        .reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
    },
  };
}

// ─── 4. Recuperação ──────────────────────────────────────────────────────────
export async function getRelatorioRecuperacao(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalRecuperado: 0, totalEmAberto: 0, taxaRecuperacao: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));

  const todasRows = await db
    .select({
      cobrancaId: cobrancas.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      dataPagamento: cobrancas.paidAt,
      valorOriginal: cobrancas.amount,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(cobrancas.paidAt))
    .limit(2000);

  const pagos = todasRows.filter((r) => r.status === "pago");
  const totalRecuperado = pagos.reduce((s, r) => s + (r.valorOriginal ?? 0), 0);
  const totalEmAberto = todasRows
    .filter((r) => r.status !== "pago")
    .reduce((s, r) => s + (r.valorOriginal ?? 0), 0);
  const taxaRecuperacao =
    todasRows.length > 0 ? Math.round((pagos.length / todasRows.length) * 100) : 0;

  return {
    rows: pagos,
    totais: { totalRecuperado, totalEmAberto, taxaRecuperacao },
  };
}
