import { and, eq } from "drizzle-orm";
import {
  acordos,
  btgCobrancasEmitidas,
  btgRemessaItens,
  btgRemessas,
  devedores,
  parcelasAcordo,
} from "../../drizzle/schema";
import { BtgV2ConfigurationError } from "./config";
import { avaliarElegibilidadeParcelaAcordoBtgV2, emitirBolePixV2 } from "./issuance";

export type ResultadoItemRemessaBtgV2 = "emitida" | "ja_existia" | "falha";
export type StatusRemessaBtgV2 = "rascunho" | "enviando" | "processada" | "processada_parcialmente" | "falha" | "cancelada";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export interface ResultadoRemessaBtgV2 {
  resultado: ResultadoItemRemessaBtgV2;
  valorCentavos: number;
}

export interface ResumoRemessaBtgV2 {
  status: StatusRemessaBtgV2;
  totalSelecionado: number;
  totalEmitido: number;
  totalFalha: number;
  valorTotalCentavos: number;
}

/**
 * Drizzle/mysql2 pode devolver o cabeçalho da inserção diretamente ou como
 * primeiro item da tupla [ResultSetHeader, campos]. Aceita os dois formatos
 * sem assumir uma versão específica do driver.
 */
export function obterInsertIdBtgV2(resultado: unknown): number {
  let cabecalho = resultado;
  while (Array.isArray(cabecalho) && cabecalho.length > 0) {
    cabecalho = cabecalho[0];
  }
  if (!cabecalho || typeof cabecalho !== "object" || !("insertId" in cabecalho)) return 0;
  const bruto = (cabecalho as { insertId?: unknown }).insertId;
  const id = typeof bruto === "bigint" ? Number(bruto) : Number(bruto);
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

/** Consolida o resultado persistível de uma execução de remessa sem reemitir títulos. */
export function consolidarResultadoRemessaBtgV2(itens: ResultadoRemessaBtgV2[]): ResumoRemessaBtgV2 {
  const totalSelecionado = itens.length;
  const totalEmitido = itens.filter((item) => item.resultado === "emitida" || item.resultado === "ja_existia").length;
  const totalFalha = itens.filter((item) => item.resultado === "falha").length;
  const valorTotalCentavos = itens.reduce((total, item) => total + item.valorCentavos, 0);

  const status: StatusRemessaBtgV2 = totalFalha === 0
    ? "processada"
    : totalEmitido === 0
      ? "falha"
      : "processada_parcialmente";

  return { status, totalSelecionado, totalEmitido, totalFalha, valorTotalCentavos };
}

export function validarLoteUnicoCondominioBtgV2(condominioIds: number[]): number {
  const ids = Array.from(new Set(condominioIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length !== 1) {
    throw new Error("Uma remessa BTG deve conter parcelas de um único condomínio.");
  }
  return ids[0];
}

export interface ParcelaFilaRemessaBtgV2 {
  id: number;
  acordoId: number;
  installmentNumber: number;
  amount: number;
  dueDate: Date;
  status: string;
  devedorNome: string | null;
  devedorCpfCnpj: string | null;
  elegivel: boolean;
  motivoBloqueio: string | null;
}

/** Lista parcelas de acordos ativos de um único condomínio, com os mesmos bloqueios da emissão individual. */
export async function listarFilaRemessaBtgV2(input: { db: Db; condominioId: number; btgIntegracaoId: number }): Promise<ParcelaFilaRemessaBtgV2[]> {
  const rows = await input.db.select({
    parcela: parcelasAcordo,
    acordoStatus: acordos.status,
    devedorNome: devedores.name,
    devedorCpfCnpj: devedores.cpfCnpj,
    emissaoId: btgCobrancasEmitidas.id,
  }).from(parcelasAcordo)
    .innerJoin(acordos, eq(acordos.id, parcelasAcordo.acordoId))
    .innerJoin(devedores, eq(devedores.id, acordos.devedorId))
    .leftJoin(btgCobrancasEmitidas, and(
      eq(btgCobrancasEmitidas.btgIntegracaoId, input.btgIntegracaoId),
      eq(btgCobrancasEmitidas.origemTipo, "parcela_acordo"),
      eq(btgCobrancasEmitidas.origemId, parcelasAcordo.id),
    ))
    .where(eq(acordos.condominioId, input.condominioId));

  return rows.map(({ parcela, acordoStatus, devedorNome, devedorCpfCnpj, emissaoId }) => {
    const avaliacao = acordoStatus === "ativo"
      ? avaliarElegibilidadeParcelaAcordoBtgV2({ ...parcela, btgEmissaoV2Existente: Boolean(emissaoId) })
      : { elegivel: false, motivo: "Acordo não está ativo" };
    return {
      id: parcela.id,
      acordoId: parcela.acordoId,
      installmentNumber: parcela.installmentNumber,
      amount: parcela.amount,
      dueDate: parcela.dueDate,
      status: parcela.status,
      devedorNome,
      devedorCpfCnpj,
      elegivel: avaliacao.elegivel,
      motivoBloqueio: avaliacao.motivo,
    };
  }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.acordoId - b.acordoId || a.installmentNumber - b.installmentNumber);
}

export function validarSelecaoRemessaBtgV2(input: {
  condominioId: number;
  parcelaIds: number[];
  fila: ParcelaFilaRemessaBtgV2[];
}): ParcelaFilaRemessaBtgV2[] {
  const ids = Array.from(new Set(input.parcelaIds));
  if (ids.length !== input.parcelaIds.length) throw new BtgV2ConfigurationError("A seleção contém parcelas duplicadas.");
  if (ids.length === 0) throw new BtgV2ConfigurationError("Selecione ao menos uma parcela para a remessa.");
  const porId = new Map(input.fila.map((item) => [item.id, item]));
  return ids.map((id) => {
    const parcela = porId.get(id);
    if (!parcela) throw new BtgV2ConfigurationError("Uma ou mais parcelas não pertencem ao condomínio selecionado.");
    if (!parcela.elegivel) throw new BtgV2ConfigurationError(`A parcela ${id} não pode ser enviada: ${parcela.motivoBloqueio?.toLowerCase()}.`);
    return parcela;
  });
}

export async function executarRemessaBtgV2(input: {
  db: Db;
  remessaId: number;
  parcelas: Array<Pick<ParcelaFilaRemessaBtgV2, "id" | "installmentNumber" | "amount">>;
}): Promise<ResumoRemessaBtgV2> {
  const now = new Date();
  await input.db.update(btgRemessas)
    .set({ status: "enviando", iniciadaEm: now, updatedAt: now })
    .where(and(eq(btgRemessas.id, input.remessaId), eq(btgRemessas.status, "rascunho")));

  const resultados: ResultadoRemessaBtgV2[] = [];
  const erros: string[] = [];
  for (const parcela of input.parcelas) {
    try {
      const emissao = await emitirBolePixV2({ db: input.db, parcelaId: parcela.id, btgRemessaId: input.remessaId });
      const resultado: ResultadoItemRemessaBtgV2 = emissao.jaExistia ? "ja_existia" : "emitida";
      const mensagem = emissao.jaExistia ? "Emissão já existente, vinculada ao lote." : "Cobrança enviada ao BTG.";
      await input.db.update(btgRemessaItens).set({
        btgCobrancaEmitidaId: emissao.id,
        resultado,
        mensagem,
        updatedAt: new Date(),
      }).where(and(eq(btgRemessaItens.btgRemessaId, input.remessaId), eq(btgRemessaItens.parcelaAcordoId, parcela.id)));
      resultados.push({ resultado, valorCentavos: parcela.amount });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Falha desconhecida no envio ao BTG.";
      erros.push(`Parcela ${parcela.installmentNumber}: ${mensagem}`);
      await input.db.update(btgRemessaItens).set({ resultado: "falha", mensagem: mensagem.slice(0, 500), updatedAt: new Date() })
        .where(and(eq(btgRemessaItens.btgRemessaId, input.remessaId), eq(btgRemessaItens.parcelaAcordoId, parcela.id)));
      resultados.push({ resultado: "falha", valorCentavos: parcela.amount });
    }
  }

  const resumo = consolidarResultadoRemessaBtgV2(resultados);
  await input.db.update(btgRemessas).set({
    status: resumo.status,
    totalSelecionado: resumo.totalSelecionado,
    totalEmitido: resumo.totalEmitido,
    totalFalha: resumo.totalFalha,
    valorTotalCentavos: resumo.valorTotalCentavos,
    erroResumo: erros.length ? erros.join(" | ").slice(0, 500) : null,
    finalizadaEm: new Date(),
    updatedAt: new Date(),
  }).where(eq(btgRemessas.id, input.remessaId));

  return resumo;
}
