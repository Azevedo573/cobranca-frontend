import { eq, and, desc, inArray } from "drizzle-orm";
import { devedores, InsertDevedor, cobrancas, condominios, demandas, processosJudiciais, tentativasCobranca, acordos } from "../drizzle/schema";
import { getDb } from "./db";
import { calcularValorDevido } from "../shared/calculos";

export async function getDevedoresByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar devedores
  const devedoresList = await db.select().from(devedores).where(eq(devedores.condominioId, condominioId));
  
  // Buscar taxas do condomínio
  const condominioData = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
  const taxas = condominioData[0] ? {
    taxaJurosMensal: Number(condominioData[0].taxaJurosMensal || 0),
    taxaMulta: Number(condominioData[0].taxaMulta || 0),
    taxaHonorarios: Number(condominioData[0].taxaHonorarios || 0),
    correcaoMonetaria: Number(condominioData[0].correcaoMonetaria || 0),
  } : null;
  
  // Para cada devedor, calcular valor total devido
  const devedoresComValor = await Promise.all(
    devedoresList.map(async (devedor) => {
      // Buscar cobranças ativas (pendentes ou em acordo)
      const cobrancasAtivas = await db.select().from(cobrancas).where(
        and(
          eq(cobrancas.devedorId, devedor.id),
          eq(cobrancas.status, "pendente")
        )
      );
      
      const cobrancasEmAcordo = await db.select().from(cobrancas).where(
        and(
          eq(cobrancas.devedorId, devedor.id),
          eq(cobrancas.status, "em_acordo")
        )
      );
      
      const todasCobrancasAtivas = [...cobrancasAtivas, ...cobrancasEmAcordo];
      
      // Calcular valor total com encargos
      let valorTotalDevido = 0;
      if (todasCobrancasAtivas.length > 0 && taxas) {
        valorTotalDevido = todasCobrancasAtivas.reduce((sum, cob) => {
          const breakdown = calcularValorDevido(
            cob.amount / 100,  // Converter centavos para reais
            cob.dueDate ? new Date(cob.dueDate) : new Date(),
            taxas
          );
          return sum + breakdown.valorTotal;
        }, 0);
      }
      
      // Retornar devedor com valor atualizado (em centavos)
      return {
        ...devedor,
        totalDue: Math.round(valorTotalDevido * 100),
      };
    })
  );
  
  return devedoresComValor;
}

export async function getDevedorById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(devedores).where(eq(devedores.id, id)).limit(1);
  const devedor = result[0];
  if (!devedor) return null;

  // Buscar nome do condomínio
  let condominioNome: string | null = null;
  if (devedor.condominioId) {
    const cond = await db.select({ name: condominios.name }).from(condominios).where(eq(condominios.id, devedor.condominioId)).limit(1);
    condominioNome = cond[0]?.name ?? null;
  }

  // Verificar se existe demanda judicial ativa vinculada a este devedor
  const demandasJudiciais = await db.select({ id: demandas.id }).from(demandas).where(
    and(
      eq(demandas.devedorId, devedor.id),
      eq(demandas.tipo, "cobranca_judicial")
    )
  ).limit(1);
  const statusUnidade: "padrao" | "ajuizado" = demandasJudiciais.length > 0 ? "ajuizado" : "padrao";

  // Se ajuizado, buscar o processo judicial vinculado à demanda
  let processoJudicial: { numeroCNJ: string; status: string } | null = null;
  if (demandasJudiciais.length > 0) {
    const demandaId = demandasJudiciais[0].id;
    const processo = await db
      .select({ numeroCNJ: processosJudiciais.numeroCNJ, status: processosJudiciais.status })
      .from(processosJudiciais)
      .where(eq(processosJudiciais.demandaId, demandaId))
      .limit(1);
    if (processo[0]) {
      processoJudicial = { numeroCNJ: processo[0].numeroCNJ, status: processo[0].status };
    } else {
      // Fallback: buscar processo vinculado ao devedor via condominioId
      const processoPorCondominio = await db
        .select({ numeroCNJ: processosJudiciais.numeroCNJ, status: processosJudiciais.status })
        .from(processosJudiciais)
        .where(
          and(
            eq(processosJudiciais.condominioId, devedor.condominioId),
            eq(processosJudiciais.status, "ativo")
          )
        )
        .limit(1);
      if (processoPorCondominio[0]) {
        processoJudicial = { numeroCNJ: processoPorCondominio[0].numeroCNJ, status: processoPorCondominio[0].status };
      }
    }
  }

  return { ...devedor, condominioNome, statusUnidade, processoJudicial };
}

/** Visão consolidada, somente-leitura, para apoiar a gestão do caso do devedor. */
export async function getVisao360Devedor(id: number) {
  const db = await getDb();
  if (!db) return null;

  const [devedor] = await db.select().from(devedores).where(eq(devedores.id, id)).limit(1);
  if (!devedor) return null;

  const [titulos, tentativas, acordosDoDevedor, demandasDoDevedor] = await Promise.all([
    db.select().from(cobrancas).where(eq(cobrancas.devedorId, id)),
    db.select({ id: tentativasCobranca.id, attemptDate: tentativasCobranca.attemptDate, result: tentativasCobranca.result, contactType: tentativasCobranca.contactType })
      .from(tentativasCobranca)
      .where(eq(tentativasCobranca.devedorId, id))
      .orderBy(desc(tentativasCobranca.attemptDate))
      .limit(5),
    db.select({ id: acordos.id, status: acordos.status, totalAmount: acordos.totalAmount, createdAt: acordos.createdAt })
      .from(acordos)
      .where(eq(acordos.devedorId, id))
      .orderBy(desc(acordos.createdAt)),
    db.select({ id: demandas.id, numero: demandas.numero, assunto: demandas.assunto, tipo: demandas.tipo, status: demandas.status, prioridade: demandas.prioridade, prazo: demandas.prazo })
      .from(demandas)
      .where(eq(demandas.devedorId, id))
      .orderBy(desc(demandas.createdAt)),
  ]);

  const demandaIds = demandasDoDevedor.map((demanda) => demanda.id);
  const processos = demandaIds.length
    ? await db.select({ id: processosJudiciais.id, demandaId: processosJudiciais.demandaId, numeroCNJ: processosJudiciais.numeroCNJ, status: processosJudiciais.status, tribunal: processosJudiciais.tribunal, dataUltimaMovimentacao: processosJudiciais.dataUltimaMovimentacao })
      .from(processosJudiciais)
      .where(inArray(processosJudiciais.demandaId, demandaIds))
      .orderBy(desc(processosJudiciais.dataUltimaMovimentacao))
    : [];

  const titulosEmAberto = titulos.filter((titulo) => titulo.status !== "pago");
  return {
    resumo: {
      totalTitulos: titulos.length,
      titulosEmAberto: titulosEmAberto.length,
      valorNominalEmAberto: titulosEmAberto.reduce((total, titulo) => total + titulo.amount, 0),
      acordosAtivos: acordosDoDevedor.filter((acordo) => acordo.status === "ativo" || acordo.status === "inadimplente").length,
      demandasAbertas: demandasDoDevedor.filter((demanda) => demanda.status === "aberta" || demanda.status === "em_andamento").length,
      processosAtivos: processos.filter((processo) => processo.status === "ativo" || processo.status === "suspenso").length,
    },
    tentativas,
    acordos: acordosDoDevedor,
    demandas: demandasDoDevedor,
    processos,
  };
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

export async function getDevedorByCpfCnpj(cpfCnpj: string, condominioId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(devedores).where(
    and(
      eq(devedores.cpfCnpj, cpfCnpj),
      eq(devedores.condominioId, condominioId)
    )
  ).limit(1);
  return result[0] || null;
}

export async function getDevedorByBlocoUnidade(
  unitNumber: string,
  bloco: string | undefined | null,
  condominioId: number
) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [
    eq(devedores.unitNumber, unitNumber),
    eq(devedores.condominioId, condominioId),
  ];
  if (bloco) {
    conditions.push(eq(devedores.bloco, bloco));
  }
  const result = await db
    .select()
    .from(devedores)
    .where(and(...conditions))
    .limit(1);
  return result[0] || null;
}
