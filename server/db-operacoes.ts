import { getDb } from "./db";
import { devedores, cobrancas, tentativasCobranca, condominios, acordos } from "../drizzle/schema";
import { eq, and, sql, desc, or, like, isNull } from "drizzle-orm";
import { calcularValorDevido } from "../shared/calculos";

/**
 * Busca a fila de cobrança ativa: devedores com cobranças pendentes, ordenados por score (prioridade)
 */
export async function buscarFilaAtiva(condominioId: number | null, limite = 50) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const whereClause = condominioId
    ? and(
        sql`${devedores.status} = 'ativo'`,
        eq(devedores.condominioId, condominioId),
        sql`EXISTS (
          SELECT 1 FROM cobrancas c
          WHERE c.devedorId = ${devedores.id}
          AND c.status IN ('pendente', 'em_cobranca')
        )`
      )
    : and(
        sql`${devedores.status} = 'ativo'`,
        sql`EXISTS (
          SELECT 1 FROM cobrancas c
          WHERE c.devedorId = ${devedores.id}
          AND c.status IN ('pendente', 'em_cobranca')
        )`
      );

  const lista = await db
    .select({
      id: devedores.id,
      name: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unitNumber: devedores.unitNumber,
      bloco: devedores.bloco,
      email: devedores.email,
      phone: devedores.phone,
      score: devedores.score,
      condominioId: devedores.condominioId,
      status: devedores.status,
    })
    .from(devedores)
    .where(whereClause)
    .orderBy(desc(devedores.score))
    .limit(limite);

  // Para cada devedor, buscar cobranças pendentes e última tentativa
  const resultado = await Promise.all(
    lista.map(async (devedor) => {
      const cobrancasPendentes = await db
        .select()
        .from(cobrancas)
        .where(
          and(
            eq(cobrancas.devedorId, devedor.id),
            sql`${cobrancas.status} IN ('pendente', 'em_cobranca')`
          )
        )
        .orderBy(cobrancas.dueDate);

      // Buscar condomínio para calcular valores
      const condResult = await db
        .select()
        .from(condominios)
        .where(eq(condominios.id, devedor.condominioId))
        .limit(1);
      const cond = condResult[0];

      let valorTotalDevido = 0;
      let diasMaxAtraso = 0;
      const hoje = new Date();

      for (const cob of cobrancasPendentes) {
        if (cob.dueDate && cond) {
          const calc = calcularValorDevido(
            cob.amount,
            cob.dueDate,
            {
              taxaJurosMensal: Number(cond.taxaJurosMensal || 0),
              taxaMulta: Number(cond.taxaMulta || 0),
              taxaHonorarios: Number(cond.taxaHonorarios || 0),
              correcaoMonetaria: Number(cond.correcaoMonetaria || 0),
            },
            cob.custasJudiciais || 0
          );
          valorTotalDevido += calc.valorTotal;
          const dias = Math.floor((hoje.getTime() - new Date(cob.dueDate).getTime()) / 86400000);
          if (dias > diasMaxAtraso) diasMaxAtraso = dias;
        } else {
          valorTotalDevido += cob.amount;
        }
      }

      // Última tentativa
      const ultimaTentativa = await db
        .select()
        .from(tentativasCobranca)
        .where(eq(tentativasCobranca.devedorId, devedor.id))
        .orderBy(desc(tentativasCobranca.attemptDate))
        .limit(1);

      // Contar tentativas
      const totalTentativas = await db
        .select({ count: sql<number>`count(*)` })
        .from(tentativasCobranca)
        .where(eq(tentativasCobranca.devedorId, devedor.id));

      return {
        ...devedor,
        nomeCondominio: cond?.name || "",
        totalCobrancasPendentes: cobrancasPendentes.length,
        valorTotalDevido,
        diasMaxAtraso,
        ultimaTentativa: ultimaTentativa[0] || null,
        totalTentativas: Number(totalTentativas[0]?.count || 0),
        cobrancasPendentes: cobrancasPendentes.slice(0, 3), // Primeiras 3 para preview
      };
    })
  );

  return resultado;
}

/**
 * Busca detalhes completos de um devedor para o painel de atendimento
 */
export async function buscarDevedorParaAtendimento(devedorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const devedorResult = await db
    .select()
    .from(devedores)
    .where(eq(devedores.id, devedorId))
    .limit(1);

  const devedor = devedorResult[0];
  if (!devedor) throw new Error("Devedor não encontrado");

  const condResult = await db
    .select()
    .from(condominios)
    .where(eq(condominios.id, devedor.condominioId))
    .limit(1);
  const cond = condResult[0];

  const cobrancasPendentes = await db
    .select()
    .from(cobrancas)
    .where(
      and(
        eq(cobrancas.devedorId, devedorId),
        sql`${cobrancas.status} IN ('pendente', 'em_cobranca')`
      )
    )
    .orderBy(cobrancas.dueDate);

  const todasTentativas = await db
    .select()
    .from(tentativasCobranca)
    .where(eq(tentativasCobranca.devedorId, devedorId))
    .orderBy(desc(tentativasCobranca.attemptDate))
    .limit(10);

  const acordosAtivos = await db
    .select()
    .from(acordos)
    .where(
      and(
        eq(acordos.devedorId, devedorId),
        sql`${acordos.status} IN ('ativo', 'atrasado')`
      )
    );

  const hoje = new Date();
  let valorTotalDevido = 0;
  let diasMaxAtraso = 0;

  const cobrancasComCalculo = cobrancasPendentes.map((cob) => {
    let valorAtualizado = cob.amount;
    let diasAtraso = 0;

    if (cob.dueDate && cond) {
      const calc = calcularValorDevido(
        cob.amount,
        cob.dueDate,
        {
          taxaJurosMensal: Number(cond.taxaJurosMensal || 0),
          taxaMulta: Number(cond.taxaMulta || 0),
          taxaHonorarios: Number(cond.taxaHonorarios || 0),
          correcaoMonetaria: Number(cond.correcaoMonetaria || 0),
        },
        cob.custasJudiciais || 0
      );
      valorAtualizado = calc.valorTotal;
      diasAtraso = Math.max(0, Math.floor((hoje.getTime() - new Date(cob.dueDate).getTime()) / 86400000));
    }

    valorTotalDevido += valorAtualizado;
    if (diasAtraso > diasMaxAtraso) diasMaxAtraso = diasAtraso;

    return { ...cob, valorAtualizado, diasAtraso };
  });

  return {
    devedor,
    condominio: cond,
    cobrancasPendentes: cobrancasComCalculo,
    tentativas: todasTentativas,
    acordosAtivos,
    valorTotalDevido,
    diasMaxAtraso,
  };
}

/**
 * Busca devedores por CPF/nome/unidade para cobrança passiva
 */
export async function buscarDevedorPorIdentificador(
  termo: string,
  condominioId: number | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const termoLike = `%${termo}%`;

  const whereClause = condominioId
    ? and(
        eq(devedores.condominioId, condominioId),
        or(
          like(devedores.name, termoLike),
          like(devedores.cpfCnpj, termoLike),
          like(devedores.unitNumber, termoLike),
          like(devedores.phone, termoLike)
        )
      )
    : or(
        like(devedores.name, termoLike),
        like(devedores.cpfCnpj, termoLike),
        like(devedores.unitNumber, termoLike),
        like(devedores.phone, termoLike)
      );

  const resultados = await db
    .select({
      id: devedores.id,
      name: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unitNumber: devedores.unitNumber,
      bloco: devedores.bloco,
      phone: devedores.phone,
      email: devedores.email,
      condominioId: devedores.condominioId,
      score: devedores.score,
    })
    .from(devedores)
    .where(whereClause)
    .limit(10);

  // Enriquecer com nome do condomínio e total de cobranças
  const enriquecidos = await Promise.all(
    resultados.map(async (d) => {
      const condResult = await db
        .select({ name: condominios.name })
        .from(condominios)
        .where(eq(condominios.id, d.condominioId))
        .limit(1);

      const totalCobs = await db
        .select({ count: sql<number>`count(*)` })
        .from(cobrancas)
        .where(
          and(
            eq(cobrancas.devedorId, d.id),
            sql`${cobrancas.status} IN ('pendente', 'em_cobranca')`
          )
        );

      return {
        ...d,
        nomeCondominio: condResult[0]?.name || "",
        totalCobrancasPendentes: Number(totalCobs[0]?.count || 0),
      };
    })
  );

  return enriquecidos;
}
