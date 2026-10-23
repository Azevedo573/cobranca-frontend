import { createHash, createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
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

type BtgV2Status = "reservada" | "enviando" | "emitida" | "incerta" | "paga" | "cancelada" | "expirada" | "falha";

interface BtgWebhookPayloadV2 {
  id?: string;
  event?: string;
  data?: {
    collectionId?: string;
    status?: string;
    amount?: number;
    paidAmount?: number;
    amountPaid?: number;
    paidAt?: string;
  };
}

function normalizarAssinatura(signature: string): Buffer | null {
  const value = signature.trim().replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Buffer.from(value, "hex");
}

export function validarAssinaturaWebhookBtgV2(rawBody: Buffer, signature: string, secret: string): boolean {
  const recebida = normalizarAssinatura(signature);
  if (!recebida || !secret) return false;
  const esperada = createHmac("sha256", secret).update(rawBody).digest();
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

export function mapearStatusWebhookBtgV2(evento: string, statusAtual: BtgV2Status): BtgV2Status {
  // Pagamento é terminal nesta fase: eventos posteriores não podem regredir o título.
  if (statusAtual === "paga") return "paga";
  if (evento === "collections.paid") return "paga";
  if (evento === "collections.expired") return "expirada";
  if (evento === "collections.cancelled" || evento === "collections.canceled") return "cancelada";
  if (evento === "collections.created") return "emitida";
  return statusAtual;
}

function extrairAssinatura(req: Request): string | null {
  const candidate = req.headers["x-btg-signature"] ?? req.headers["x-signature"];
  if (Array.isArray(candidate)) return candidate[0] ?? null;
  return typeof candidate === "string" ? candidate : null;
}

function extractRawBody(req: Request): Buffer | null {
  return Buffer.isBuffer(req.body) ? req.body : null;
}

function isDuplicate(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|unique|1062/i.test(message);
}

function valorPagoEmCentavos(data: NonNullable<BtgWebhookPayloadV2["data"]>): number | null {
  const amount = data.paidAmount ?? data.amountPaid ?? data.amount;
  return typeof amount === "number" && Number.isInteger(amount) && amount >= 0 ? amount : null;
}

export async function webhookBtgV2Handler(req: Request, res: Response): Promise<void> {
  const rawBody = extractRawBody(req);
  const ambiente = req.params.ambiente;
  if (!rawBody || (ambiente !== "sandbox" && ambiente !== "producao")) {
    res.status(400).json({ ok: false, error: "INVALID_REQUEST" });
    return;
  }

  const secret = process.env.BTG_WEBHOOK_SECRET?.trim();
  const signature = extrairAssinatura(req);
  if (!secret || !signature || !validarAssinaturaWebhookBtgV2(rawBody, signature, secret)) {
    res.status(401).json({ ok: false, error: "INVALID_SIGNATURE" });
    return;
  }

  let payload: BtgWebhookPayloadV2;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as BtgWebhookPayloadV2;
  } catch {
    res.status(400).json({ ok: false, error: "INVALID_JSON" });
    return;
  }

  const evento = payload.event?.trim();
  const collectionId = payload.data?.collectionId?.trim();
  if (!evento || !collectionId) {
    res.status(400).json({ ok: false, error: "INVALID_PAYLOAD" });
    return;
  }

  try {
    const config = getBtgV2ServerConfig();
    if (config.ambiente !== ambiente) {
      res.status(404).json({ ok: false, error: "ENVIRONMENT_NOT_ACTIVE" });
      return;
    }
    const db = await getDb();
    if (!db) throw new Error("DATABASE_UNAVAILABLE");
    const [integracao] = await db.select().from(btgIntegracoes)
      .where(eq(btgIntegracoes.ambiente, ambiente))
      .limit(1);
    if (!integracao) {
      res.status(404).json({ ok: false, error: "INTEGRATION_NOT_FOUND" });
      return;
    }

    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    try {
      await db.insert(btgWebhookEntregas).values({
        btgIntegracaoId: integracao.id,
        providerEventId: typeof payload.id === "string" ? payload.id.slice(0, 150) : null,
        payloadHash,
        evento: evento.slice(0, 100),
        btgCollectionId: collectionId.slice(0, 150),
        assinaturaValida: 1,
        statusProcessamento: "recebido",
      });
    } catch (error) {
      if (isDuplicate(error)) {
        res.status(200).json({ ok: true, duplicate: true });
        return;
      }
      throw error;
    }

    const [emissao] = await db.select().from(btgCobrancasEmitidas)
      .where(and(
        eq(btgCobrancasEmitidas.btgIntegracaoId, integracao.id),
        eq(btgCobrancasEmitidas.btgCollectionId, collectionId),
      ))
      .limit(1);
    if (!emissao) {
      await db.update(btgWebhookEntregas)
        .set({ statusProcessamento: "ignorado", erroCodigo: "COLLECTION_NOT_FOUND", processadoEm: new Date() })
        .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracao.id), eq(btgWebhookEntregas.payloadHash, payloadHash)));
      res.status(202).json({ ok: true, ignored: true });
      return;
    }

    const novoStatus = mapearStatusWebhookBtgV2(evento, emissao.status);
    if (novoStatus === "paga") {
      const paidAmount = valorPagoEmCentavos(payload.data ?? {});
      if (paidAmount === null || paidAmount !== emissao.amount) {
        await db.update(btgWebhookEntregas)
          .set({ statusProcessamento: "ignorado", erroCodigo: "PAYMENT_AMOUNT_MISMATCH", processadoEm: new Date() })
          .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracao.id), eq(btgWebhookEntregas.payloadHash, payloadHash)));
        res.status(202).json({ ok: true, ignored: true });
        return;
      }
    }

    const paidAt = payload.data?.paidAt ? new Date(payload.data.paidAt) : new Date();
    const processedAt = new Date();
    await db.update(btgCobrancasEmitidas)
      .set({ status: novoStatus, updatedAt: processedAt })
      .where(eq(btgCobrancasEmitidas.id, emissao.id));

    // A origem financeira é atualizada somente após assinatura, deduplicação,
    // vínculo da collection e conferência integral de valor.
    if (novoStatus === "paga" && emissao.origemTipo === "cobranca") {
      await db.update(cobrancas).set({ status: "pago", paidAt, paidAmount: emissao.amount, updatedAt: processedAt })
        .where(eq(cobrancas.id, emissao.origemId));
    }
    if (novoStatus === "paga" && emissao.origemTipo === "parcela_acordo") {
      await db.update(parcelasAcordo).set({ status: "pago", paymentDate: paidAt })
        .where(eq(parcelasAcordo.id, emissao.origemId));
      const [parcela] = await db.select({ acordoId: parcelasAcordo.acordoId }).from(parcelasAcordo)
        .where(eq(parcelasAcordo.id, emissao.origemId)).limit(1);
      if (parcela) {
        const parcelas = await db.select({ status: parcelasAcordo.status }).from(parcelasAcordo)
          .where(eq(parcelasAcordo.acordoId, parcela.acordoId));
        if (parcelas.length > 0 && parcelas.every((item) => item.status === "pago")) {
          await db.update(acordos).set({ status: "pago", updatedAt: processedAt })
            .where(eq(acordos.id, parcela.acordoId));
        }
      }
    }

    await db.update(btgWebhookEntregas)
      .set({ statusProcessamento: "processado", processadoEm: processedAt })
      .where(and(eq(btgWebhookEntregas.btgIntegracaoId, integracao.id), eq(btgWebhookEntregas.payloadHash, payloadHash)));
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[BTG v2 webhook] Falha de processamento", error instanceof Error ? error.message : "UNKNOWN");
    res.status(500).json({ ok: false, error: "PROCESSING_FAILED" });
  }
}
