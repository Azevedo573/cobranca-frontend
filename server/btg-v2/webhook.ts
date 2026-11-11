import { createHash, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  acordos,
  auditLogs,
  btgCancelamentos,
  btgContaRecebedoraCondominios,
  btgCobrancasEmitidas,
  btgIntegracoes,
  btgWebhookEntregas,
  cobrancas,
  parcelasAcordo,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getBtgV2ServerConfig } from "./config";
import { bloquearContextoRecebimentoAcordo, aplicarRecebimentoAcordo } from "../recebimento-acordo";
import { reaisBtgParaCentavos, valorPagoBtgEmCentavos, dataPagamentoBtg, metodoPagamentoBtg } from "./valores";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type BtgV2Status = typeof btgCobrancasEmitidas.$inferSelect.status;
type Emissao = typeof btgCobrancasEmitidas.$inferSelect;
type Operacao = typeof btgCancelamentos.$inferSelect;
type OrigemBloqueada = {
  cobranca?: typeof cobrancas.$inferSelect;
  acordo?: typeof acordos.$inferSelect;
  parcela?: typeof parcelasAcordo.$inferSelect;
  parcelas: (typeof parcelasAcordo.$inferSelect)[];
  contextoRecebimento?: Awaited<ReturnType<typeof bloquearContextoRecebimentoAcordo>>;
};
type Resultado = { ok: true; duplicate?: true; ignored?: true };

const payloadSchema = z.object({
  id: z.string().min(1).max(150).optional(),
  webhookId: z.string().min(1).max(150).optional(),
  event: z.string().trim().min(1).max(100),
  data: z.object({
    collectionId: z.string().trim().min(1).max(150).optional(),
    status: z.string().max(40).optional(),
    amount: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    paidAmount: z.number().refine(value => reaisBtgParaCentavos(value) !== null).optional(),
    amountPaid: z.number().refine(value => reaisBtgParaCentavos(value) !== null).optional(),
    paidAt: z.string().max(64).refine(value => dataPagamento(value, new Date()) !== null).optional(),
  }).passthrough(),
});
type Payload = z.infer<typeof payloadSchema>;
const eventosCancelamento = new Set(["collections.cancelled", "collections.canceled", "colections.cancelled"]);
const eventos = new Set([
  "collections.created", "collections.paid", "collections.expired",
  ...Array.from(eventosCancelamento),
]);
const camposDiagnosticaveis = new Set(["id", "webhookId", "event", "data", "data.collectionId",
  "data.status", "data.amount", "data.paidAmount", "data.amountPaid", "data.paidAt"]);

/** BTG envia seu webhook secret via Authorization: Bearer, não uma assinatura HMAC. */
export function validarAutenticacaoWebhookBtgV2(authorization: unknown, secret: string): boolean {
  if (typeof authorization !== "string" || !secret || /[\s,]/.test(secret)) return false;
  const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(authorization);
  if (!match) return false;
  const recebida = createHash("sha256").update(match[1]).digest();
  const esperada = createHash("sha256").update(secret).digest();
  return timingSafeEqual(recebida, esperada);
}

export function mapearStatusWebhookBtgV2(evento: string, statusAtual: BtgV2Status): BtgV2Status {
  if (statusAtual === "paga") return "paga";
  if (evento === "collections.paid") return "paga";
  // Uma criação entregue depois do cancelamento/expiração não reabre o título.
  if (evento === "collections.created" && ["cancelada", "expirada"].includes(statusAtual)) return statusAtual;
  if (evento === "collections.expired") return statusAtual === "cancelada" ? statusAtual : "expirada";
  if (eventosCancelamento.has(evento)) return "cancelada";
  if (evento === "collections.created") return "emitida";
  return statusAtual;
}

export function valorPagoWebhookBtgEmCentavos(data: { amountPaid?: unknown; paidAmount?: unknown }): number | null {
  return valorPagoBtgEmCentavos(data);
}

function dataPagamento(value: string | undefined, now: Date): Date | null {
  return dataPagamentoBtg(value, now);
}

function identificadorEntrega(req: Request, payload: Payload): string | null {
  const correlation = req.headers["x-correlation-id"];
  // webhookId identifica a inscrição e nunca é usado como identidade do evento.
  const valido = (value: unknown): value is string => typeof value === "string" && /^[\x21-\x7e]{1,150}$/.test(value) && !value.includes(",");
  if (valido(correlation)) return correlation;
  return valido(payload.id) ? payload.id : null;
}

async function finalizarEntrega(tx: Tx, id: number, codigo: string | null): Promise<Resultado> {
  const change = await tx.update(btgWebhookEntregas).set({
    statusProcessamento: codigo ? "ignorado" : "processado",
    erroCodigo: codigo,
    processadoEm: new Date(),
  }).where(eq(btgWebhookEntregas.id, id));
  if (!Array.isArray(change) || change[0]?.affectedRows !== 1) throw new Error("DELIVERY_UPDATE_FAILED");
  return codigo ? { ok: true, ignored: true } : { ok: true };
}

/** Pai e TODAS as parcelas antes de qualquer emissão. A conclusão do acordo não
 * pode adquirir outra parcela depois da emissão e inverter a ordem da reserva. */
async function bloquearOrigem(tx: Tx, emissao: Emissao): Promise<OrigemBloqueada> {
  if (emissao.origemTipo === "cobranca") {
    const [cobranca] = await tx.select().from(cobrancas)
      .where(eq(cobrancas.id, emissao.origemId)).limit(1).for("update");
    return { cobranca, parcelas: [] };
  }
  const contextoRecebimento = await bloquearContextoRecebimentoAcordo(tx, emissao.origemId);
  return { ...contextoRecebimento, contextoRecebimento };
}

async function aplicarPagamento(tx: Tx, emissao: Emissao, paidAt: Date, origem: OrigemBloqueada,
  entregaId: number, metodoPagamento?: string, fonteDataPagamento: "banco" | "processamento" = "banco", liquidadoEm?: Date): Promise<string | null> {
  if (emissao.origemTipo === "cobranca") {
    const cobranca = origem.cobranca;
    if (!cobranca || cobranca.condominioId !== emissao.condominioId) return "ORIGIN_SCOPE_MISMATCH";
    if (["cancelado", "acordo", "em_acordo", "acordo_atrasado"].includes(cobranca.status)) return "ORIGIN_NOT_ELIGIBLE";
    if (cobranca.status !== "pago") {
      await tx.update(cobrancas).set({ status: "pago", paidAt, paidAmount: emissao.amount, updatedAt: new Date() })
        .where(and(eq(cobrancas.id, cobranca.id), eq(cobrancas.condominioId, emissao.condominioId)));
    }
    return null;
  }

  if (!origem.contextoRecebimento) return "ORIGIN_NOT_FOUND";
  const resultado = await aplicarRecebimentoAcordo(tx, origem.contextoRecebimento, {
    valorPagoCentavos: emissao.amount, dataPagamento: paidAt, condominioId: emissao.condominioId,
    canal: "btg_webhook", ator: { userId: null, userRole: "system" },
    emissaoId: emissao.id, entregaId, metodoPagamento,
    fonteDataPagamento, liquidadoEm,
  });
  return resultado.codigo;
}

function origemNoEscopo(emissao: Emissao, origem: OrigemBloqueada): boolean {
  return emissao.origemTipo === "parcela_acordo"
    ? !!(origem.acordo && origem.parcela && origem.acordo.condominioId === emissao.condominioId && origem.parcela.acordoId === origem.acordo.id)
    : origem.cobranca?.condominioId === emissao.condominioId;
}

function pagamentoLocal(emissao: Emissao, origem: OrigemBloqueada): boolean {
  if (emissao.status === "paga" || /PAYMENT|PAGAMENTO|PARCIAL/i.test(emissao.erroCodigo ?? "")) return true;
  if (!origemNoEscopo(emissao, origem)) return false;
  return origem.parcela?.status === "pago" || origem.parcela?.paymentDate != null || origem.acordo?.status === "pago" ||
    origem.cobranca?.status === "pago" || origem.cobranca?.paidAt != null || (origem.cobranca?.paidAmount ?? 0) > 0;
}

function indicioPagamentoPayload(payload: Payload): boolean {
  return payload.event === "collections.paid" || /PAID|PAYMENT|PARTIAL|PAGO|PAGAMENTO|PARCIAL/i.test(payload.data.status ?? "") ||
    ["paidAt", "paymentDate", "paidAmount", "amountPaid", "valorPagoCentavos", "paidAmountCentavos",
      "paymentAmount", "paid", "hasPayment", "pagamentoDetectado"].some(k => {
      const value = payload.data[k];
      return value !== undefined && value !== null && value !== 0 && value !== false;
    });
}

function identidadeCancelamentoPayload(payload: Payload, emissao: Emissao): boolean {
  // collectionId autentica a identidade mínima; dados opcionais contraditórios
  // nunca podem confirmar uma operação. Não guardar nem logar esses campos.
  const esperados: Record<string, unknown> = {
    externalId: emissao.externalId,
    correlationId: `btgv2-${emissao.id}`,
    documentNumber: `PA${emissao.origemId}R${emissao.revisao}`,
    type: "BANKSLIP_QRCODE",
    amount: emissao.amount,
  };
  return Object.entries(esperados).every(([campo, esperado]) => payload.data[campo] === undefined ||
    (campo === "amount" ? reaisBtgParaCentavos(payload.data[campo]) === esperado : payload.data[campo] === esperado));
}

async function atualizarOperacoes(tx: Tx, operacoes: Operacao[], emissao: Emissao,
  ambiente: "sandbox" | "producao", entregaId: number, conflito: boolean): Promise<void> {
  for (const operacao of operacoes) {
    // Conflito é monotônico, inclusive quando pagamento chega após CANCELED.
    // Cancelamento nunca consome prévia nem ressuscita uma operação recusada.
    if (!conflito && !["solicitada", "em_confirmacao"].includes(operacao.estado)) continue;
    const estado = conflito ? "conflito_pagamento" : "cancelada";
    const codigo = conflito ? "CONFLITO_PAGAMENTO" : "CANCELED";
    if (operacao.estado === estado && operacao.codigo === codigo) continue;
    const confirmadaEm = estado === "cancelada" ? (operacao.confirmadaEm ?? new Date()) : operacao.confirmadaEm;
    const change = await tx.update(btgCancelamentos).set({ estado, codigo, confirmadaEm, updatedAt: new Date() })
      .where(and(eq(btgCancelamentos.id, operacao.id), eq(btgCancelamentos.estado, operacao.estado),
        eq(btgCancelamentos.btgCobrancaEmitidaId, emissao.id), eq(btgCancelamentos.btgIntegracaoId, emissao.btgIntegracaoId),
        eq(btgCancelamentos.parcelaAcordoId, emissao.origemId), eq(btgCancelamentos.condominioId, emissao.condominioId)));
    if (!Array.isArray(change) || change[0]?.affectedRows !== 1) throw new Error("CANCELLATION_UPDATE_FAILED");
    // Auditoria direta/estrita: falha desfaz operação, financeiro e entrega.
    // Ator é o webhook autenticado, não uma nova ação do admin da prévia.
    const audit = await tx.insert(auditLogs).values({
      userId: null,
      userRole: "system",
      action: "config_change",
      entity: "configuracao",
      entityId: `btg-cancelamento:${operacao.chaveOperacao}`,
      condominioId: emissao.condominioId,
      metadata: JSON.stringify({
        evento: conflito ? "webhook_conflito_pagamento" : "webhook_cancelamento_confirmado",
        operacaoId: operacao.chaveOperacao, emissaoId: emissao.id, parcelaId: emissao.origemId,
        ambiente, entregaId, estado, codigo,
      }),
      success: 1,
      severity: "warning",
      ipAddress: "unknown",
    });
    if (!Array.isArray(audit) || audit[0]?.affectedRows !== 1) throw new Error("CANCELLATION_AUDIT_FAILED");
  }
}

async function processarEntrega(db: Db, integracaoId: number, payloadHash: string, payload: Payload): Promise<Resultado> {
  return db.transaction(async tx => {
    const [entrega] = await tx.select().from(btgWebhookEntregas)
      .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracaoId), eq(btgWebhookEntregas.payloadHash, payloadHash)))
      .limit(1).for("update");
    if (!entrega) throw new Error("DELIVERY_NOT_FOUND");
    if (entrega.assinaturaValida !== 1) throw new Error("DELIVERY_NOT_AUTHENTICATED");
    if (["processado", "ignorado"].includes(entrega.statusProcessamento)) return { ok: true, duplicate: true };
    if (!eventos.has(payload.event)) return finalizarEntrega(tx, entrega.id, "EVENT_NOT_SUPPORTED");

    // Ordem comum: integração → vínculo → pai → parcelas → emissões → operações.
    // A entrega é exclusiva deste fluxo; nunca bloquear outras entregas ao ler
    // indícios anteriores, evitando entrega A ↔ entrega B sob integração.
    const [integracao] = await tx.select().from(btgIntegracoes)
      .where(eq(btgIntegracoes.id, integracaoId)).limit(1).for("update");
    const config = getBtgV2ServerConfig();
    if (!integracao || integracao.ambiente !== config.ambiente || integracao.companyId !== config.companyId)
      return finalizarEntrega(tx, entrega.id, "INTEGRATION_SCOPE_MISMATCH");
    const hints = await tx.select().from(btgCobrancasEmitidas)
      .where(and(eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId), eq(btgCobrancasEmitidas.btgCollectionId, payload.data.collectionId!)))
      .limit(2);
    if (hints.length !== 1) return finalizarEntrega(tx, entrega.id, hints.length ? "COLLECTION_AMBIGUOUS" : "COLLECTION_NOT_FOUND");
    const hint = hints[0];
    const [vinculo] = await tx.select().from(btgContaRecebedoraCondominios)
      .where(and(eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracaoId), eq(btgContaRecebedoraCondominios.condominioId, hint.condominioId)))
      .limit(1).for("share");
    const origem = await bloquearOrigem(tx, hint);
    const revisoes = await tx.select().from(btgCobrancasEmitidas)
      .where(and(eq(btgCobrancasEmitidas.origemTipo, hint.origemTipo), eq(btgCobrancasEmitidas.origemId, hint.origemId)))
      .orderBy(desc(btgCobrancasEmitidas.revisao)).for("update");
    const emissoes = await tx.select().from(btgCobrancasEmitidas)
      .where(and(eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId), eq(btgCobrancasEmitidas.btgCollectionId, payload.data.collectionId!)))
      .limit(2).for("update");
    if (emissoes.length !== 1) return finalizarEntrega(tx, entrega.id, emissoes.length ? "COLLECTION_AMBIGUOUS" : "COLLECTION_NOT_FOUND");
    const emissao = emissoes[0];
    if (emissao.id !== hint.id || emissao.origemId !== hint.origemId || emissao.origemTipo !== hint.origemTipo || emissao.condominioId !== hint.condominioId)
      return finalizarEntrega(tx, entrega.id, "COLLECTION_IDENTITY_CHANGED");

    // Bookkeeping só do título atual identificado. Vínculos desconhecidos não
    // são corrigidos nem passam a autorizar documentos/canais por este evento.
    const atual = revisoes.filter(r => r.revisao >= emissao.revisao);
    const identidadeOperacional = emissao.origemTipo === "parcela_acordo" && origemNoEscopo(emissao, origem) &&
      atual.length === 1 && atual[0].id === emissao.id &&
      vinculo?.ativo === 1 && vinculo.btgContaRecebedoraId === emissao.btgContaRecebedoraId;
    const operacoes = identidadeOperacional ? await tx.select().from(btgCancelamentos)
      .where(and(eq(btgCancelamentos.btgCobrancaEmitidaId, emissao.id), eq(btgCancelamentos.btgIntegracaoId, integracaoId),
        eq(btgCancelamentos.parcelaAcordoId, emissao.origemId), eq(btgCancelamentos.condominioId, emissao.condominioId)))
      .orderBy(desc(btgCancelamentos.id)).for("update") : [];
    if (emissao.status === "paga") {
      await atualizarOperacoes(tx, operacoes, emissao, integracao.ambiente, entrega.id, true);
      return finalizarEntrega(tx, entrega.id, null);
    }
    if (payload.event === "collections.paid") {
      // Parcial/ambíguo bloqueia a operação para UI, mantendo a regra anterior
      // de valor integral/elegibilidade. O livro da entrega conserva o indício.
      if (payload.data.status !== undefined && payload.data.status.toUpperCase() !== "PAID") {
        await atualizarOperacoes(tx, operacoes, emissao, integracao.ambiente, entrega.id, true);
        return finalizarEntrega(tx, entrega.id, "PAYMENT_STATUS_MISMATCH");
      }
      const pago = valorPagoWebhookBtgEmCentavos(payload.data);
      if (pago === null || pago !== emissao.amount) {
        await atualizarOperacoes(tx, operacoes, emissao, integracao.ambiente, entrega.id, true);
        return finalizarEntrega(tx, entrega.id, "PAYMENT_AMOUNT_MISMATCH");
      }
      const paidAt = dataPagamento(payload.data.paidAt, new Date());
      if (!paidAt) return finalizarEntrega(tx, entrega.id, "PAYMENT_DATE_INVALID");
      const codigo = await aplicarPagamento(tx, emissao, paidAt, origem, entrega.id, metodoPagamentoBtg(payload.data.paymentMethod),
        payload.data.paidAt === undefined ? "processamento" : "banco",
        payload.data.settledAt === undefined ? undefined : dataPagamentoBtg(payload.data.settledAt) ?? undefined);
      await atualizarOperacoes(tx, operacoes, emissao, integracao.ambiente, entrega.id, true);
      if (codigo) return finalizarEntrega(tx, entrega.id, codigo);
    }
    if (eventosCancelamento.has(payload.event)) {
      const suspeitas = await tx.select({ id: btgWebhookEntregas.id }).from(btgWebhookEntregas)
        .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracaoId), eq(btgWebhookEntregas.btgCollectionId, emissao.btgCollectionId!),
          eq(btgWebhookEntregas.assinaturaValida, 1), eq(btgWebhookEntregas.statusProcessamento, "ignorado"),
          or(eq(btgWebhookEntregas.evento, "collections.paid"), eq(btgWebhookEntregas.erroCodigo, "CANCELLATION_PAYMENT_CONFLICT"))))
        .limit(1);
      const conflito = pagamentoLocal(emissao, origem) || indicioPagamentoPayload(payload) || suspeitas.length > 0 ||
        operacoes.some(o => o.estado === "conflito_pagamento");
      if (conflito) {
        await atualizarOperacoes(tx, operacoes, emissao, integracao.ambiente, entrega.id, true);
        return finalizarEntrega(tx, entrega.id, "CANCELLATION_PAYMENT_CONFLICT");
      }
      // Evento contraditório ou contexto financeiro divergente exige consulta,
      // nunca uma confirmação local otimista. Não mudar a regra de baixa paid.
      if (payload.data.status !== undefined && !["CANCELED", "CANCELLED"].includes(payload.data.status.toUpperCase()))
        return finalizarEntrega(tx, entrega.id, "CANCELLATION_STATUS_MISMATCH");
      if (emissao.origemTipo === "parcela_acordo" && !identidadeCancelamentoPayload(payload, emissao))
        return finalizarEntrega(tx, entrega.id, "CANCELLATION_IDENTITY_MISMATCH");
      if (operacoes.length && (!origem.parcela || origem.parcela.amount !== emissao.amount ||
        origem.parcela.dueDate.getTime() !== emissao.dueDate.getTime() ||
        !["pendente", "atrasado"].includes(origem.parcela.status) || origem.acordo?.status !== "ativo"))
        return finalizarEntrega(tx, entrega.id, "CANCELLATION_CONTEXT_MISMATCH");
      await atualizarOperacoes(tx, operacoes, emissao, integracao.ambiente, entrega.id, false);
    }
    const novoStatus = mapearStatusWebhookBtgV2(payload.event, emissao.status);
    if (novoStatus !== emissao.status) {
      const change = await tx.update(btgCobrancasEmitidas).set({ status: novoStatus, updatedAt: new Date() })
        .where(and(eq(btgCobrancasEmitidas.id, emissao.id), eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId),
          eq(btgCobrancasEmitidas.status, emissao.status)));
      if (!Array.isArray(change) || change[0]?.affectedRows !== 1) throw new Error("EMISSION_UPDATE_FAILED");
    }
    return finalizarEntrega(tx, entrega.id, null);
  });
}

export async function webhookBtgV2Handler(req: Request, res: Response): Promise<void> {
  const ambiente = req.params.ambiente;
  if (!Buffer.isBuffer(req.body) || (ambiente !== "sandbox" && ambiente !== "producao")) {
    res.status(400).json({ ok: false, error: "INVALID_REQUEST" });
    return;
  }
  const secret = process.env.BTG_WEBHOOK_SECRET?.trim() ?? "";
  // Node pode reter só o primeiro Authorization em headers; não aceitar duas
  // credenciais enviadas no HTTP original como se houvesse apenas uma.
  const authCount = Array.isArray(req.rawHeaders)
    ? req.rawHeaders.filter((value, index) => index % 2 === 0 && value.toLowerCase() === "authorization").length
    : 0;
  if (authCount > 1 || !validarAutenticacaoWebhookBtgV2(req.headers.authorization, secret)) {
    res.status(401).json({ ok: false, error: "INVALID_AUTHENTICATION" });
    return;
  }
  let parsed: ReturnType<typeof payloadSchema.safeParse>;
  try {
    parsed = payloadSchema.safeParse(JSON.parse(req.body.toString("utf8")));
  } catch {
    res.status(400).json({ ok: false, error: "INVALID_JSON" });
    return;
  }
  if (!parsed.success || (eventos.has(parsed.data.event) && !parsed.data.data.collectionId)) {
    const camposInvalidos = parsed.success ? ["data.collectionId"] :
      Array.from(new Set(parsed.error.issues.map(issue => issue.path.join(".")).filter(path => camposDiagnosticaveis.has(path)))).slice(0, 10);
    res.status(400).json({ ok: false, error: "INVALID_PAYLOAD", camposInvalidos });
    return;
  }
  const payload = parsed.data;
  let db: Db | null = null;
  let integracaoId: number | null = null;
  const payloadHash = createHash("sha256").update(req.body).digest("hex");
  try {
    const config = getBtgV2ServerConfig();
    if (config.ambiente !== ambiente) {
      res.status(404).json({ ok: false, error: "ENVIRONMENT_NOT_ACTIVE" });
      return;
    }
    db = await getDb();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    const [integracao] = await db.select().from(btgIntegracoes).where(eq(btgIntegracoes.ambiente, ambiente)).limit(1);
    if (!integracao || integracao.companyId !== config.companyId) {
      res.status(404).json({ ok: false, error: "INTEGRATION_NOT_FOUND" });
      return;
    }
    integracaoId = integracao.id;
    // Reserva persistente idempotente; o conflito nunca é confirmado como sucesso
    // antes de consultar o estado atual da entrega sob lock transacional.
    await db.insert(btgWebhookEntregas).values({
      btgIntegracaoId: integracao.id,
      providerEventId: identificadorEntrega(req, payload),
      payloadHash,
      evento: payload.event,
      btgCollectionId: payload.data.collectionId ?? null,
      // Coluna legada preservada: 1 significa autenticação válida, não HMAC.
      assinaturaValida: 1,
      statusProcessamento: "recebido",
    }).onDuplicateKeyUpdate({ set: { payloadHash } });
    const resultado = await processarEntrega(db, integracao.id, payloadHash, payload);
    res.status(200).json(resultado);
  } catch {
    // O rollback preserva o financeiro. Um erro/reenvio pode retomar o registro
    // recebido/falha, sem sobrescrever resultado terminal de outra execução.
    if (db && integracaoId !== null) {
      try {
        await db.update(btgWebhookEntregas).set({ statusProcessamento: "falha", erroCodigo: "PROCESSING_FAILED", processadoEm: null })
          .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracaoId), eq(btgWebhookEntregas.payloadHash, payloadHash),
            inArray(btgWebhookEntregas.statusProcessamento, ["recebido", "falha"])));
      } catch { /* A entrega recebida ainda pode ser retomada após reenvio. */ }
    }
    console.error("[BTG v2 webhook] PROCESSING_FAILED");
    res.status(500).json({ ok: false, error: "PROCESSING_FAILED" });
  }
}
