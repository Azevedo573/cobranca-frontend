import { and, desc, eq } from "drizzle-orm";
import { auditLogs, btgCancelamentos, btgContaRecebedoraCondominios, btgCobrancasEmitidas, btgIntegracoes, cobrancas, devedores } from "../../drizzle/schema";
import { cancelarCobrancaBtgV2, consultarCobrancaBtgV2 } from "./client";
import { BtgV2ConfigurationError, getBtgV2ServerConfig } from "./config";
import { aplicarRecebimentoAcordo, bloquearContextoRecebimentoAcordo } from "../recebimento-acordo";
import { recalcularSaldoDevedorTx } from "../saldo-devedor";
import { dataPagamentoBtg, metodoPagamentoBtg } from "./valores";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Emissao = typeof btgCobrancasEmitidas.$inferSelect;
type BtgV2Status = Emissao["status"];
type Ator = { userId: number | null; userRole: string };

export function mapearStatusCollectionsV2(statusRemoto: string, atual: BtgV2Status): BtgV2Status {
  if (atual === "paga") return "paga";
  switch (statusRemoto.toUpperCase()) {
    case "CREATED": case "PROCESSING": return "emitida";
    case "PAID": return "paga";
    case "CANCELED": case "CANCELLED": return "cancelada";
    case "EXPIRED": case "OVERDUE": return "expirada";
    case "FAILED": return "falha";
    default: return atual;
  }
}
function isTerminal(status: BtgV2Status): boolean { return ["paga", "cancelada", "expirada"].includes(status); }
function recusar(message: string): never { throw new BtgV2ConfigurationError(message); }
function conferirMudanca(result: unknown, message: string) {
  if (!Array.isArray(result) || result[0]?.affectedRows !== 1) recusar(message);
}

export interface BtgV2ConciliacaoResultado {
  id: number; statusAnterior: BtgV2Status; statusAtual: BtgV2Status;
  pagamentoAplicado: boolean; encontradoNoBtg: boolean;
}

async function conferirIntegracao(db: Db | Tx, emissao: Emissao, bloquear = false) {
  const query = db.select().from(btgIntegracoes).where(eq(btgIntegracoes.id, emissao.btgIntegracaoId)).limit(1);
  const [integracao] = await (bloquear ? query.for("update") : query);
  const config = getBtgV2ServerConfig();
  if (!integracao || integracao.ambiente !== config.ambiente || integracao.companyId !== config.companyId)
    recusar("A emissão não pertence à integração BTG atual; conciliação bloqueada.");
  const link = db.select().from(btgContaRecebedoraCondominios)
    .where(and(eq(btgContaRecebedoraCondominios.btgIntegracaoId, emissao.btgIntegracaoId),
      eq(btgContaRecebedoraCondominios.condominioId, emissao.condominioId))).limit(1);
  const [vinculo] = await (bloquear ? link.for("share") : link);
  if (!vinculo || vinculo.ativo !== 1 || vinculo.btgContaRecebedoraId !== emissao.btgContaRecebedoraId)
    recusar("O vínculo da conta BTG não confere com a emissão; conciliação bloqueada.");
  return integracao;
}

async function registrarConflitoPagamento(tx: Tx, emissao: Emissao, ator: Ator) {
  if (emissao.origemTipo !== "parcela_acordo") return;
  const operacoes = await tx.select().from(btgCancelamentos)
    .where(and(eq(btgCancelamentos.btgCobrancaEmitidaId, emissao.id),
      eq(btgCancelamentos.btgIntegracaoId, emissao.btgIntegracaoId),
      eq(btgCancelamentos.parcelaAcordoId, emissao.origemId), eq(btgCancelamentos.condominioId, emissao.condominioId)))
    .orderBy(desc(btgCancelamentos.id)).for("update");
  for (const operacao of operacoes) {
    if (operacao.estado === "conflito_pagamento" && operacao.codigo === "CONFLITO_PAGAMENTO") continue;
    const result = await tx.update(btgCancelamentos).set({ estado: "conflito_pagamento", codigo: "CONFLITO_PAGAMENTO", updatedAt: new Date() })
      .where(and(eq(btgCancelamentos.id, operacao.id), eq(btgCancelamentos.estado, operacao.estado)));
    conferirMudanca(result, "Não foi possível registrar o conflito de pagamento; transação desfeita.");
    const audit = await tx.insert(auditLogs).values({
      userId: ator.userId, userRole: ator.userRole, action: "config_change", entity: "configuracao",
      entityId: `btg-cancelamento:${operacao.chaveOperacao}`, condominioId: emissao.condominioId,
      metadata: JSON.stringify({ evento: "conciliacao_conflito_pagamento", emissaoId: emissao.id, parcelaId: emissao.origemId,
        estado: "conflito_pagamento", codigo: "CONFLITO_PAGAMENTO" }),
      success: 1, severity: "warning", ipAddress: "unknown",
    });
    conferirMudanca(audit, "Não foi possível auditar o conflito de pagamento; transação desfeita.");
  }
}

/** Consulta explícita; valor pago já convertido para centavos pelo cliente BTG.
 * GET fora da transação. Contexto, revisão, conta e identidade revalidados depois.
 * Não materializa documentos, reemite, cancela ou repara recebimentos históricos. */
export async function conciliarEmissaoBolePixV2(db: Db, emissaoId: number,
  ator: Ator = { userId: null, userRole: "system" }): Promise<BtgV2ConciliacaoResultado> {
  const [hint] = await db.select().from(btgCobrancasEmitidas).where(eq(btgCobrancasEmitidas.id, emissaoId)).limit(1);
  if (!hint) recusar("Emissão BolePix v2 não encontrada.");
  if (!hint.btgCollectionId) recusar("A emissão não possui collectionId confirmado pelo BTG.");
  await conferirIntegracao(db, hint);
  const remoto = await consultarCobrancaBtgV2(hint.btgCollectionId);
  if (!remoto) return { id: hint.id, statusAnterior: hint.status, statusAtual: hint.status, pagamentoAplicado: false, encontradoNoBtg: false };
  if (remoto.collectionId !== hint.btgCollectionId) recusar("A identidade retornada pelo BTG não confere com a emissão.");
  const now = new Date();
  const pago = remoto.status.toUpperCase() === "PAID";
  const dataPagamento = dataPagamentoBtg(remoto.paidAt ?? undefined, now);

  const resultado = await db.transaction(async tx => {
    await conferirIntegracao(tx, hint, true);
    // Origem e TODAS parcelas antes de emissões, mesma ordem do webhook/manual.
    const contexto = hint.origemTipo === "parcela_acordo" ? await bloquearContextoRecebimentoAcordo(tx, hint.origemId) : undefined;
    const [avulsa] = hint.origemTipo === "cobranca" ? await tx.select().from(cobrancas)
      .where(eq(cobrancas.id, hint.origemId)).limit(1).for("update") : [];
    if (avulsa) await tx.select().from(devedores).where(eq(devedores.id, avulsa.devedorId)).limit(1).for("update");
    const revisoes = await tx.select().from(btgCobrancasEmitidas)
      .where(and(eq(btgCobrancasEmitidas.origemTipo, hint.origemTipo), eq(btgCobrancasEmitidas.origemId, hint.origemId)))
      .orderBy(desc(btgCobrancasEmitidas.revisao)).for("update");
    const atuais = revisoes.filter(row => row.revisao >= hint.revisao);
    const emissao = atuais.find(row => row.id === hint.id);
    if (atuais.length !== 1 || !emissao || emissao.btgIntegracaoId !== hint.btgIntegracaoId ||
      emissao.btgCollectionId !== hint.btgCollectionId || emissao.amount !== hint.amount ||
      emissao.condominioId !== hint.condominioId || emissao.btgContaRecebedoraId !== hint.btgContaRecebedoraId)
      recusar("A emissão ou sua revisão mudou durante a consulta; revise antes de conciliar.");
    if (emissao.status === "paga") {
      if (pago) await registrarConflitoPagamento(tx, emissao, ator);
      return { id: emissao.id, statusAnterior: emissao.status, statusAtual: emissao.status, pagamentoAplicado: false, encontradoNoBtg: true };
    }
    let pagamentoAplicado = false;
    if (pago) {
      if (!dataPagamento || !Number.isSafeInteger(remoto.paidAmount) || remoto.paidAmount !== emissao.amount) {
        const erroCodigo = !dataPagamento ? "PAYMENT_DATE_INVALID" : "PAYMENT_AMOUNT_MISMATCH";
        conferirMudanca(await tx.update(btgCobrancasEmitidas).set({ erroCodigo, updatedAt: now })
          .where(and(eq(btgCobrancasEmitidas.id, emissao.id), eq(btgCobrancasEmitidas.status, emissao.status))),
          "Não foi possível preservar o indício de pagamento; transação desfeita.");
        await registrarConflitoPagamento(tx, emissao, ator);
        // Commit apenas do indício/conflito; nenhuma parcela ou dívida baixada.
        // Lançar o erro fora da transação evita apagar esse bloqueio conservador.
        return { id: emissao.id, statusAnterior: emissao.status, statusAtual: emissao.status,
          pagamentoAplicado: false, encontradoNoBtg: true, bloqueado: true as const };
      }
      if (contexto) {
        const result = await aplicarRecebimentoAcordo(tx, contexto, {
          valorPagoCentavos: remoto.paidAmount!, dataPagamento: dataPagamento!, condominioId: emissao.condominioId,
          canal: "btg_conciliacao", ator, emissaoId: emissao.id,
          metodoPagamento: metodoPagamentoBtg(remoto.paymentMethod),
          fonteDataPagamento: remoto.paidAt ? "banco" : "processamento",
          liquidadoEm: remoto.settledAt ? dataPagamentoBtg(remoto.settledAt) ?? undefined : undefined,
        });
        if (result.codigo) recusar("O contexto financeiro da parcela impede a baixa; revise o acordo e as origens.");
        pagamentoAplicado = result.aplicado;
      } else {
        if (!avulsa || avulsa.condominioId !== emissao.condominioId || avulsa.amount !== emissao.amount ||
          ["cancelado", "acordo", "em_acordo", "acordo_atrasado"].includes(avulsa.status))
          recusar("A cobrança de origem não é elegível para baixa por essa emissão.");
        if (avulsa.status !== "pago") {
          conferirMudanca(await tx.update(cobrancas).set({ status: "pago", paidAt: dataPagamento!, paidAmount: remoto.paidAmount!, updatedAt: now })
            .where(and(eq(cobrancas.id, avulsa.id), eq(cobrancas.condominioId, emissao.condominioId))), "Não foi possível baixar a cobrança; transação desfeita.");
          await recalcularSaldoDevedorTx(tx, avulsa.devedorId, avulsa.condominioId, now);
          conferirMudanca(await tx.insert(auditLogs).values({userId: ator.userId, userRole: ator.userRole,
            action: "pay_cobranca", entity: "cobranca", entityId: String(avulsa.id), condominioId: avulsa.condominioId,
            metadata: JSON.stringify({canal:"btg_conciliacao",emissaoId:emissao.id,valorPagoCentavos:remoto.paidAmount}),
            success:1,severity:"info",ipAddress:"unknown"}), "Não foi possível auditar o recebimento; transação desfeita.");
          pagamentoAplicado = true;
        }
      }
      await registrarConflitoPagamento(tx, emissao, ator);
    }
    // Não tratar estado terminal bancário de cancelamento como operação nova,
    // nem reabrir terminal local. Esse fluxo só confirma recebimento PAID.
    const statusAtual = pago ? "paga" : isTerminal(emissao.status) ? emissao.status :
      ["CANCELED", "CANCELLED"].includes(remoto.status.toUpperCase()) ? emissao.status : mapearStatusCollectionsV2(remoto.status, emissao.status);
    if (statusAtual !== emissao.status) conferirMudanca(await tx.update(btgCobrancasEmitidas)
      .set({ status: statusAtual, erroCodigo: null, updatedAt: now })
      .where(and(eq(btgCobrancasEmitidas.id, emissao.id), eq(btgCobrancasEmitidas.status, emissao.status))),
      "Não foi possível atualizar a emissão; transação desfeita.");
    return {id:emissao.id,statusAnterior:emissao.status,statusAtual,pagamentoAplicado,encontradoNoBtg:true};
  });
  if ("bloqueado" in resultado) recusar("O valor ou a data do pagamento não confere; baixa bloqueada e indício preservado para revisão.");
  return resultado;
}

/** Legado preservado: chamadas públicas de cancelamento possuem guardas próprias.
 * Não é utilizado pelo novo recebimento/conciliação para cancelar ou reemitir. */
export async function cancelarEmissaoBolePixV2(db: Db, emissaoId: number): Promise<{ id: number; status: "cancelada" }> {
  const [emissao] = await db.select().from(btgCobrancasEmitidas).where(eq(btgCobrancasEmitidas.id, emissaoId)).limit(1);
  if (!emissao) throw new BtgV2ConfigurationError("Emissão BolePix v2 não encontrada.");
  if (!emissao.btgCollectionId) throw new BtgV2ConfigurationError("A emissão não possui collectionId confirmado pelo BTG.");
  if (isTerminal(emissao.status)) throw new BtgV2ConfigurationError("Não é possível cancelar uma emissão já encerrada.");
  await cancelarCobrancaBtgV2(emissao.btgCollectionId);
  await db.update(btgCobrancasEmitidas).set({ status: "cancelada", updatedAt: new Date() })
    .where(and(eq(btgCobrancasEmitidas.id, emissao.id), eq(btgCobrancasEmitidas.status, emissao.status)));
  return { id: emissao.id, status: "cancelada" };
}
