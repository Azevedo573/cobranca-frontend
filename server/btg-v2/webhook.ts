import { createHash, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  acordos,
  btgCobrancasEmitidas,
  btgIntegracoes,
  btgWebhookEntregas,
  cobrancas,
  parcelasAcordo,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { getBtgV2ServerConfig } from "./config";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type BtgV2Status = typeof btgCobrancasEmitidas.$inferSelect.status;
type Emissao = typeof btgCobrancasEmitidas.$inferSelect;
type Resultado = { ok: true; duplicate?: true; ignored?: true };

const payloadSchema = z.object({
  id: z.string().min(1).max(150).optional(),
  webhookId: z.string().min(1).max(150).optional(),
  event: z.string().trim().min(1).max(100),
  data: z.object({
    collectionId: z.string().trim().min(1).max(150).optional(),
    status: z.string().max(40).optional(),
    amount: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    paidAmount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    amountPaid: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    paidAt: z.string().max(64).refine(value => dataPagamento(value, new Date()) !== null).optional(),
  }).passthrough(),
});
type Payload = z.infer<typeof payloadSchema>;
const eventos = new Set([
  "collections.created", "collections.paid", "collections.expired",
  "collections.cancelled", "collections.canceled", "colections.cancelled",
]);

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
  if (["collections.cancelled", "collections.canceled", "colections.cancelled"].includes(evento)) return "cancelada";
  if (evento === "collections.created") return "emitida";
  return statusAtual;
}

export function valorPagoWebhookBtgEmCentavos(data: { amountPaid?: unknown; paidAmount?: unknown }): number | null {
  const presentes = [data.amountPaid, data.paidAmount].filter(v => v !== undefined);
  if (!presentes.length || presentes.some(v => typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)) return null;
  if (presentes.length === 2 && presentes[0] !== presentes[1]) return null;
  // amount é o valor nominal: não comprova o valor efetivamente pago.
  return presentes[0] as number;
}

function dataPagamento(value: string | undefined, now: Date): Date | null {
  if (value === undefined) return now;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  // Date normaliza dias inexistentes (31/02); recusar em vez de inventar data.
  const calendar = value.slice(0, 10);
  const midnight = new Date(`${calendar}T00:00:00.000Z`);
  return Number.isFinite(midnight.getTime()) && midnight.toISOString().slice(0, 10) === calendar ? date : null;
}

function identificadorEntrega(req: Request, payload: Payload): string | null {
  const correlation = req.headers["x-correlation-id"];
  // webhookId identifica a inscrição e nunca é usado como identidade do evento.
  const valido = (value: unknown): value is string => typeof value === "string" && /^[\x21-\x7e]{1,150}$/.test(value) && !value.includes(",");
  if (valido(correlation)) return correlation;
  return valido(payload.id) ? payload.id : null;
}

async function finalizarEntrega(tx: Tx, id: number, codigo: string | null): Promise<Resultado> {
  await tx.update(btgWebhookEntregas).set({
    statusProcessamento: codigo ? "ignorado" : "processado",
    erroCodigo: codigo,
    processadoEm: new Date(),
  }).where(eq(btgWebhookEntregas.id, id));
  return codigo ? { ok: true, ignored: true } : { ok: true };
}

async function aplicarPagamento(tx: Tx, emissao: Emissao, paidAt: Date): Promise<string | null> {
  if (emissao.origemTipo === "cobranca") {
    const [origem] = await tx.select().from(cobrancas)
      .where(eq(cobrancas.id, emissao.origemId)).limit(1).for("update");
    if (!origem || origem.condominioId !== emissao.condominioId) return "ORIGIN_SCOPE_MISMATCH";
    if (["cancelado", "acordo", "em_acordo", "acordo_atrasado"].includes(origem.status)) return "ORIGIN_NOT_ELIGIBLE";
    if (origem.status !== "pago") {
      await tx.update(cobrancas).set({ status: "pago", paidAt, paidAmount: emissao.amount, updatedAt: new Date() })
        .where(and(eq(cobrancas.id, origem.id), eq(cobrancas.condominioId, emissao.condominioId)));
    }
    return null;
  }

  // Descobrir o acordo antes do lock e revalidar o vínculo depois dele. Os pagamentos
  // de parcelas do mesmo acordo serializam no pai antes de bloquear suas parcelas.
  const [referencia] = await tx.select({ acordoId: parcelasAcordo.acordoId }).from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, emissao.origemId)).limit(1);
  if (!referencia) return "ORIGIN_NOT_FOUND";
  const [acordo] = await tx.select().from(acordos)
    .where(eq(acordos.id, referencia.acordoId)).limit(1).for("update");
  if (!acordo || acordo.condominioId !== emissao.condominioId) return "ORIGIN_SCOPE_MISMATCH";
  if (acordo.status === "cancelado") return "ORIGIN_NOT_ELIGIBLE";
  const [parcela] = await tx.select().from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, emissao.origemId)).limit(1).for("update");
  if (!parcela || parcela.acordoId !== acordo.id) return "ORIGIN_SCOPE_MISMATCH";
  if (parcela.status === "cancelado") return "ORIGIN_NOT_ELIGIBLE";
  if (parcela.amount !== emissao.amount) return "ORIGIN_AMOUNT_MISMATCH";
  if (parcela.status !== "pago") {
    await tx.update(parcelasAcordo).set({ status: "pago", paymentDate: paidAt })
      .where(and(eq(parcelasAcordo.id, parcela.id), eq(parcelasAcordo.acordoId, acordo.id)));
  }
  const parcelas = await tx.select({ status: parcelasAcordo.status }).from(parcelasAcordo)
    .where(eq(parcelasAcordo.acordoId, acordo.id)).for("update");
  if (acordo.status !== "pago" && parcelas.length && parcelas.every(p => p.status === "pago")) {
    await tx.update(acordos).set({ status: "pago", updatedAt: new Date() }).where(eq(acordos.id, acordo.id));
  }
  return null;
}

async function processarEntrega(db: Db, integracaoId: number, payloadHash: string, payload: Payload): Promise<Resultado> {
  return db.transaction(async tx => {
    const [entrega] = await tx.select().from(btgWebhookEntregas)
      .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracaoId), eq(btgWebhookEntregas.payloadHash, payloadHash)))
      .limit(1).for("update");
    if (!entrega) throw new Error("DELIVERY_NOT_FOUND");
    if (["processado", "ignorado"].includes(entrega.statusProcessamento)) return { ok: true, duplicate: true };
    if (!eventos.has(payload.event)) return finalizarEntrega(tx, entrega.id, "EVENT_NOT_SUPPORTED");
    const emissoes = await tx.select().from(btgCobrancasEmitidas)
      .where(and(eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId), eq(btgCobrancasEmitidas.btgCollectionId, payload.data.collectionId!)))
      .limit(2).for("update");
    if (emissoes.length !== 1) return finalizarEntrega(tx, entrega.id, emissoes.length ? "COLLECTION_AMBIGUOUS" : "COLLECTION_NOT_FOUND");
    const emissao = emissoes[0];
    if (emissao.status === "paga") return finalizarEntrega(tx, entrega.id, null);
    const novoStatus = mapearStatusWebhookBtgV2(payload.event, emissao.status);
    if (payload.event === "collections.paid") {
      const pago = valorPagoWebhookBtgEmCentavos(payload.data);
      if (pago === null || pago !== emissao.amount) return finalizarEntrega(tx, entrega.id, "PAYMENT_AMOUNT_MISMATCH");
      const paidAt = dataPagamento(payload.data.paidAt, new Date());
      if (!paidAt) return finalizarEntrega(tx, entrega.id, "PAYMENT_DATE_INVALID");
      const codigo = await aplicarPagamento(tx, emissao, paidAt);
      if (codigo) return finalizarEntrega(tx, entrega.id, codigo);
    }
    if (novoStatus !== emissao.status) {
      await tx.update(btgCobrancasEmitidas).set({ status: novoStatus, updatedAt: new Date() })
        .where(and(eq(btgCobrancasEmitidas.id, emissao.id), eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId)));
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
    res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
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
    res.status(200).json(await processarEntrega(db, integracao.id, payloadHash, payload));
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
