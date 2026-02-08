import { getDb } from "./db";
import { devedores, cobrancas, tentativasCobranca, condominios } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { calcularScore } from "../shared/scoring";
import { calcularValorDevido } from "../shared/calculos";

/**
 * Atualiza o score e prioridade de um devedor específico
 */
export async function atualizarScoreDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar devedor
  const result = await db.select().from(devedores).where(eq(devedores.id, devedorId)).limit(1);
  const devedor = result[0] || null;

  if (!devedor) {
    throw new Error("Devedor não encontrado");
  }

  // Buscar condomínio para calcular valores
  const condominioResult = await db.select().from(condominios).where(eq(condominios.id, devedor.condominioId)).limit(1);
  const condominio = condominioResult[0] || null;

  if (!condominio) {
    throw new Error("Condomínio não encontrado");
  }

  // Buscar todas as cobranças pendentes/em cobrança
  const cobrancasPendentes = await db.select().from(cobrancas).where(
    and(
      eq(cobrancas.devedorId, devedorId),
      sql`${cobrancas.status} IN ('pendente', 'em_cobranca')`
    )
  );

  // Calcular valor total devido com juros, multa e honorários
  let valorTotalDevido = 0;
  let diasEmAtrasoMaximo = 0;

  for (const cobranca of cobrancasPendentes) {
    if (cobranca.dueDate) {
      const resultado = calcularValorDevido(
        cobranca.amount,
        cobranca.dueDate,
        {
          taxaJurosMensal: Number(condominio.taxaJurosMensal || 0),
          taxaMulta: Number(condominio.taxaMulta || 0),
          taxaHonorarios: Number(condominio.taxaHonorarios || 0),
          correcaoMonetaria: Number(condominio.correcaoMonetaria || 0),
        },
        cobranca.custasJudiciais || 0
      );
      valorTotalDevido += resultado.valorTotal;

      // Calcular dias em atraso
      const hoje = new Date();
      const vencimento = new Date(cobranca.dueDate);
      const diasAtraso = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
      if (diasAtraso > diasEmAtrasoMaximo) {
        diasEmAtrasoMaximo = diasAtraso;
      }
    }
  }

  // Buscar tentativas de cobrança
  const tentativas = await db.select().from(tentativasCobranca).where(eq(tentativasCobranca.devedorId, devedorId));

  const numeroTentativas = tentativas.length;

  // Contar promessas não cumpridas (resultado = "promessa" mas devedor ainda tem cobranças pendentes)
  const promessas = tentativas.filter((t: any) => t.result === "promessa");
  const promessasNaoCumpridas = promessas.length; // Simplificado - assumimos que se ainda tem dívida, promessa não foi cumprida

  // Calcular score
  const resultado = calcularScore({
    valorTotalDevido,
    diasEmAtraso: Math.max(0, diasEmAtrasoMaximo),
    numeroTentativas,
    promessasNaoCumpridas,
  });

  // Atualizar devedor no banco
  await db
    .update(devedores)
    .set({
      prioridade: resultado.prioridade,
      score: resultado.score,
      ultimaAtualizacaoScore: new Date(),
    })
    .where(eq(devedores.id, devedorId));

  return resultado;
}

/**
 * Atualiza o score de todos os devedores ativos
 */
export async function atualizarScoreTodosDevedores() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const devedoresAtivos = await db.select().from(devedores).where(eq(devedores.status, "ativo"));

  const resultados = [];
  for (const devedor of devedoresAtivos) {
    try {
      const resultado = await atualizarScoreDevedor(devedor.id);
      resultados.push({
        devedorId: devedor.id,
        nome: devedor.name,
        ...resultado,
      });
    } catch (error) {
      console.error(`Erro ao atualizar score do devedor ${devedor.id}:`, error);
    }
  }

  return resultados;
}

/**
 * Busca devedores ordenados por prioridade e score
 */
export async function buscarDevedoresPorPrioridade(condominioId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const query = condominioId
    ? and(eq(devedores.status, "ativo"), eq(devedores.condominioId, condominioId))
    : eq(devedores.status, "ativo");

  const devedoresOrdenados = await db.select().from(devedores).where(query).orderBy(
    sql`CASE ${devedores.prioridade} WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'baixa' THEN 3 END`,
    sql`${devedores.score} DESC`
  );

  return devedoresOrdenados;
}
