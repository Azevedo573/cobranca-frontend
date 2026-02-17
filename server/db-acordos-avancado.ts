import { eq, and, sql } from "drizzle-orm";
import { acordos, parcelasAcordo, devedores, InsertAcordo, InsertParcelaAcordo } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Simula parcelas de um acordo antes de criar
 */
export async function simularParcelas(params: {
  valorTotal: number;
  numParcelas: number;
  dataInicio: Date;
  frequencia: "mensal" | "semanal" | "quinzenal";
}) {
  const { valorTotal, numParcelas, dataInicio, frequencia } = params;

  const valorParcela = Math.ceil(valorTotal / numParcelas);
  const parcelas = [];

  for (let i = 0; i < numParcelas; i++) {
    const dataVencimento = new Date(dataInicio);
    
    switch (frequencia) {
      case "mensal":
        dataVencimento.setMonth(dataVencimento.getMonth() + i);
        break;
      case "quinzenal":
        dataVencimento.setDate(dataVencimento.getDate() + (i * 15));
        break;
      case "semanal":
        dataVencimento.setDate(dataVencimento.getDate() + (i * 7));
        break;
    }

    parcelas.push({
      numeroParcela: i + 1,
      valor: valorParcela,
      dataVencimento,
    });
  }

  return {
    parcelas,
    valorParcela,
    valorTotal: valorParcela * numParcelas,
  };
}

/**
 * Cria acordo e gera parcelas automaticamente
 */
export async function criarAcordoComParcelas(params: {
  cobrancaIds: number[]; // Agora aceita múltiplas cobranças
  devedorId: number;
  condominioId: number;
  valorTotal: number;
  valorAcordado: number;
  numParcelas: number;
  dataInicio: Date;
  frequencia: "mensal" | "semanal" | "quinzenal";
  observacoes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const {
    cobrancaIds,
    devedorId,
    condominioId,
    valorTotal,
    valorAcordado,
    numParcelas,
    dataInicio,
    frequencia,
    observacoes,
  } = params;

  // Criar acordo (sem cobrancaId)
  const acordoData: InsertAcordo = {
    devedorId,
    condominioId,
    totalAmount: valorTotal.toString(),
    agreedAmount: valorAcordado.toString(),
    installments: numParcelas,
    firstPaymentDate: dataInicio,
    paymentFrequency: frequencia,
    status: "ativo",
    notes: observacoes,
  };

  const resultAcordo = await db.insert(acordos).values(acordoData);
  const acordoId = Number((resultAcordo as any).insertId);

  // Gerar parcelas
  const valorParcela = Math.ceil(valorAcordado / numParcelas);
  const parcelas: InsertParcelaAcordo[] = [];

  for (let i = 0; i < numParcelas; i++) {
    const dataVencimento = new Date(dataInicio);
    
    switch (frequencia) {
      case "mensal":
        dataVencimento.setMonth(dataVencimento.getMonth() + i);
        break;
      case "quinzenal":
        dataVencimento.setDate(dataVencimento.getDate() + (i * 15));
        break;
      case "semanal":
        dataVencimento.setDate(dataVencimento.getDate() + (i * 7));
        break;
    }

    parcelas.push({
      acordoId,
      installmentNumber: i + 1,
      amount: valorParcela,
      dueDate: dataVencimento,
      status: "pendente",
    });
  }

  // Inserir todas as parcelas
  if (parcelas.length > 0) {
    await db.insert(parcelasAcordo).values(parcelas);
  }

  // Atualizar status do devedor para "acordo"
  await db
    .update(devedores)
    .set({ status: "acordo" })
    .where(eq(devedores.id, devedorId));

  return {
    acordoId,
    parcelas,
  };
}

/**
 * Marca parcela como paga
 */
export async function marcarParcelaPaga(parcelaId: number, dataPagamento: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(parcelasAcordo)
    .set({
      status: "pago",
      paymentDate: dataPagamento,
    })
    .where(eq(parcelasAcordo.id, parcelaId));

  // Verificar se todas as parcelas do acordo foram pagas
  const parcela = await db
    .select()
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, parcelaId))
    .limit(1);

  if (parcela.length > 0) {
    const acordoId = parcela[0].acordoId;

    // Contar parcelas pendentes
    const parcelasPendentes = await db
      .select()
      .from(parcelasAcordo)
      .where(
        and(
          eq(parcelasAcordo.acordoId, acordoId),
          eq(parcelasAcordo.status, "pendente")
        )
      );

    // Se não há mais parcelas pendentes, marcar acordo como pago
    if (parcelasPendentes.length === 0) {
      await db
        .update(acordos)
        .set({ status: "pago" })
        .where(eq(acordos.id, acordoId));

      // Atualizar status do devedor
      const acordo = await db
        .select()
        .from(acordos)
        .where(eq(acordos.id, acordoId))
        .limit(1);

      if (acordo.length > 0) {
        await db
          .update(devedores)
          .set({ status: "pago" })
          .where(eq(devedores.id, acordo[0].devedorId));
      }
    }
  }

  return { success: true };
}

/**
 * Atualiza status de parcelas atrasadas
 */
export async function atualizarParcelasAtrasadas() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const hoje = new Date();

  await db
    .update(parcelasAcordo)
    .set({ status: "atrasado" })
    .where(
      and(
        eq(parcelasAcordo.status, "pendente"),
        sql`${parcelasAcordo.dueDate} < ${hoje}`
      )
    );

  return { success: true };
}

/**
 * Busca acordos com estatísticas
 */
export async function getAcordosComEstatisticas(condominioId?: number) {
  const db = await getDb();
  if (!db) return [];

  const query = condominioId
    ? eq(acordos.condominioId, condominioId)
    : sql`1=1`;

  const result = await db
    .select({
      id: acordos.id,
      devedorId: acordos.devedorId,
      condominioId: acordos.condominioId,
      totalAmount: acordos.totalAmount,
      agreedAmount: acordos.agreedAmount,
      installments: acordos.installments,
      firstPaymentDate: acordos.firstPaymentDate,
      paymentFrequency: acordos.paymentFrequency,
      status: acordos.status,
      notes: acordos.notes,
      createdAt: acordos.createdAt,
      updatedAt: acordos.updatedAt,
      devedorName: devedores.name,
      devedorUnit: devedores.unitNumber,
    })
    .from(acordos)
    .leftJoin(devedores, eq(acordos.devedorId, devedores.id))
    .where(query);

  // Buscar estatísticas de parcelas para cada acordo
  const acordosComStats = await Promise.all(
    result.map(async (acordo) => {
      const parcelas = await db
        .select()
        .from(parcelasAcordo)
        .where(eq(parcelasAcordo.acordoId, acordo.id));

      const parcelasPagas = parcelas.filter(p => p.status === "pago").length;
      const parcelasAtrasadas = parcelas.filter(p => p.status === "atrasado").length;
      const parcelasPendentes = parcelas.filter(p => p.status === "pendente").length;

      return {
        ...acordo,
        estatisticas: {
          totalParcelas: parcelas.length,
          parcelasPagas,
          parcelasAtrasadas,
          parcelasPendentes,
          percentualCumprimento: parcelas.length > 0
            ? Math.round((parcelasPagas / parcelas.length) * 100)
            : 0,
        },
      };
    })
  );

  return acordosComStats;
}
