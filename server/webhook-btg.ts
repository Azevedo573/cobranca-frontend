/**
 * Webhook BTG Pactual
 * Processa eventos de cobrança enviados pelo BTG:
 * - collections.paid → dar baixa automática na cobrança/parcela
 * - collections.expired → atualizar status para vencido
 * - collections.cancelled → atualizar status para cancelado
 *
 * O BTG envia um header X-BTG-Signature com HMAC-SHA256 do body.
 * Registrar endpoint: POST /api/webhook/btg/:condominioId
 */

import type { Request, Response } from "express";
import { getDb } from "./db";
import { btgConfig, cobrancas, parcelasAcordo, acordos } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { validarAssinaturaBtg, type BtgWebhookPayload } from "./btg-service";

export async function webhookBtgHandler(req: Request, res: Response) {
  // Responder imediatamente para evitar timeout do BTG
  res.status(200).json({ ok: true });

  // Processar de forma assíncrona
  processarEventoBtg(req).catch((err) => {
    console.error("[BTG Webhook] Erro ao processar evento:", err);
  });
}

async function processarEventoBtg(req: Request) {
  const condominioId = parseInt(req.params.condominioId || "0");
  if (!condominioId) {
    console.warn("[BTG Webhook] condominioId inválido na URL");
    return;
  }

  const db = await getDb();
  if (!db) {
    console.error("[BTG Webhook] Banco de dados não disponível");
    return;
  }

  // Validar assinatura HMAC (se configurada)
  const signature = req.headers["x-btg-signature"] as string | undefined;
  const rawBody = JSON.stringify(req.body);

  if (signature) {
    const configRows = await db.select({ webhookSecret: btgConfig.webhookSecret })
      .from(btgConfig)
      .where(eq(btgConfig.condominioId, condominioId))
      .limit(1);

    if (configRows.length && configRows[0].webhookSecret) {
      const valido = validarAssinaturaBtg(rawBody, signature, configRows[0].webhookSecret);
      if (!valido) {
        console.warn(`[BTG Webhook] Assinatura inválida para condomínio ${condominioId}`);
        return;
      }
    }
  }

  const payload = req.body as BtgWebhookPayload;

  if (!payload?.event || !payload?.data?.collectionId) {
    console.warn("[BTG Webhook] Payload inválido:", payload);
    return;
  }

  const { event, data } = payload;
  const { collectionId, externalId, status } = data;

  console.log(`[BTG Webhook] Evento: ${event} | Collection: ${collectionId} | ExternalId: ${externalId}`);

  // Determinar novo status no sistema
  let novoStatus: string | null = null;
  let pago = false;

  switch (event) {
    case "collections.paid":
      novoStatus = "pago";
      pago = true;
      break;
    case "collections.expired":
      novoStatus = "pendente"; // Manter como pendente para reemissão
      break;
    case "collections.cancelled":
      novoStatus = "cancelado";
      break;
    default:
      // Outros eventos (criado, etc.) — apenas atualizar btgStatus
      break;
  }

  // Tentar encontrar pelo externalId primeiro (mais confiável)
  if (externalId) {
    if (externalId.startsWith("cobranca-")) {
      const cobrancaId = parseInt(externalId.replace("cobranca-", ""));
      if (!isNaN(cobrancaId)) {
        await atualizarCobranca(db, cobrancaId, collectionId, status, novoStatus, pago, data);
        return;
      }
    }

    if (externalId.startsWith("parcela-")) {
      const parcelaId = parseInt(externalId.replace("parcela-", ""));
      if (!isNaN(parcelaId)) {
        await atualizarParcela(db, parcelaId, collectionId, status, novoStatus, pago, data);
        return;
      }
    }
  }

  // Fallback: buscar pelo collectionId
  const cobrancaRows = await db.select({ id: cobrancas.id })
    .from(cobrancas)
    .where(eq(cobrancas.btgCollectionId, collectionId))
    .limit(1);

  if (cobrancaRows.length) {
    await atualizarCobranca(db, cobrancaRows[0].id, collectionId, status, novoStatus, pago, data);
    return;
  }

  const parcelaRows = await db.select({ id: parcelasAcordo.id })
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.btgCollectionId, collectionId))
    .limit(1);

  if (parcelaRows.length) {
    await atualizarParcela(db, parcelaRows[0].id, collectionId, status, novoStatus, pago, data);
    return;
  }

  console.warn(`[BTG Webhook] Cobrança não encontrada para collectionId: ${collectionId}`);
}

type DbType = Awaited<ReturnType<typeof getDb>>;

async function atualizarCobranca(
  db: NonNullable<DbType>,
  cobrancaId: number,
  collectionId: string,
  btgStatus: string,
  novoStatus: string | null,
  pago: boolean,
  data: BtgWebhookPayload["data"]
) {
  const updates: Record<string, unknown> = {
    btgStatus,
    btgCollectionId: collectionId,
    updatedAt: new Date(),
  };

  if (novoStatus) {
    updates.status = novoStatus;
  }

  if (pago) {
    updates.paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    updates.paidAmount = data.paidAmount ?? data.amount;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(cobrancas).set(updates as any).where(eq(cobrancas.id, cobrancaId));

  console.log(`[BTG Webhook] Cobrança ${cobrancaId} atualizada: status=${novoStatus ?? btgStatus}`);
}

async function atualizarParcela(
  db: NonNullable<DbType>,
  parcelaId: number,
  collectionId: string,
  btgStatus: string,
  novoStatus: string | null,
  pago: boolean,
  data: BtgWebhookPayload["data"]
) {
  const updates: Record<string, unknown> = {
    btgStatus,
    btgCollectionId: collectionId,
  };

  if (novoStatus === "pago") {
    updates.status = "pago";
    updates.paymentDate = data.paidAt ? new Date(data.paidAt) : new Date();
  } else if (novoStatus === "cancelado") {
    updates.status = "cancelado";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(parcelasAcordo).set(updates as any).where(eq(parcelasAcordo.id, parcelaId));

  console.log(`[BTG Webhook] Parcela ${parcelaId} atualizada: status=${novoStatus ?? btgStatus}`);

  // Se parcela paga, verificar se todas as parcelas do acordo foram pagas
  if (pago) {
    await verificarAcordoQuitado(db, parcelaId);
  }
}

async function verificarAcordoQuitado(db: NonNullable<DbType>, parcelaId: number) {
  const parcelaRows = await db.select({ acordoId: parcelasAcordo.acordoId })
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, parcelaId))
    .limit(1);

  if (!parcelaRows.length) return;

  const acordoId = parcelaRows[0].acordoId;

  const todasParcelas = await db.select({ status: parcelasAcordo.status })
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.acordoId, acordoId));

  const todasPagas = todasParcelas.every(p => p.status === "pago");

  if (todasPagas) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.update(acordos).set({ status: "quitado" } as any).where(eq(acordos.id, acordoId));
    console.log(`[BTG Webhook] Acordo ${acordoId} quitado automaticamente!`);
  }
}
