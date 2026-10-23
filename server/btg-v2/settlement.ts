import { and, eq } from "drizzle-orm";
import { acordos, btgCobrancasEmitidas, cobrancas, parcelasAcordo } from "../../drizzle/schema";
import { cancelarCobrancaBtgV2, consultarCobrancaBtgV2 } from "./client";
import { BtgV2ConfigurationError } from "./config";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;
type BtgV2Status = typeof btgCobrancasEmitidas.$inferSelect.status;

export function mapearStatusCollectionsV2(statusRemoto: string, atual: BtgV2Status): BtgV2Status {
  if (atual === "paga") return "paga";
  switch (statusRemoto.toUpperCase()) {
    case "CREATED":
    case "PROCESSING":
      return "emitida";
    case "PAID":
      return "paga";
    case "CANCELED":
    case "CANCELLED":
      return "cancelada";
    case "EXPIRED":
    case "OVERDUE":
      return "expirada";
    case "FAILED":
      return "falha";
    default:
      return atual;
  }
}

function isTerminal(status: BtgV2Status): boolean {
  return ["paga", "cancelada", "expirada"].includes(status);
}

async function aplicarPagamentoNaOrigem(
  db: Db,
  emissao: typeof btgCobrancasEmitidas.$inferSelect,
  paidAt: Date,
): Promise<void> {
  if (emissao.origemTipo === "cobranca") {
    await db.update(cobrancas).set({
      status: "pago",
      paidAt,
      paidAmount: emissao.amount,
      updatedAt: new Date(),
    }).where(eq(cobrancas.id, emissao.origemId));
    return;
  }

  await db.update(parcelasAcordo).set({ status: "pago", paymentDate: paidAt })
    .where(eq(parcelasAcordo.id, emissao.origemId));
  const [parcela] = await db.select({ acordoId: parcelasAcordo.acordoId }).from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, emissao.origemId)).limit(1);
  if (!parcela) return;
  const parcelas = await db.select({ status: parcelasAcordo.status }).from(parcelasAcordo)
    .where(eq(parcelasAcordo.acordoId, parcela.acordoId));
  if (parcelas.length > 0 && parcelas.every((item) => item.status === "pago")) {
    await db.update(acordos).set({ status: "pago", updatedAt: new Date() })
      .where(eq(acordos.id, parcela.acordoId));
  }
}

export interface BtgV2ConciliacaoResultado {
  id: number;
  statusAnterior: BtgV2Status;
  statusAtual: BtgV2Status;
  pagamentoAplicado: boolean;
  encontradoNoBtg: boolean;
}

/** Consulta um único título remoto e aplica baixa apenas com valor idêntico em centavos. */
export async function conciliarEmissaoBolePixV2(db: Db, emissaoId: number): Promise<BtgV2ConciliacaoResultado> {
  const [emissao] = await db.select().from(btgCobrancasEmitidas)
    .where(eq(btgCobrancasEmitidas.id, emissaoId)).limit(1);
  if (!emissao) throw new BtgV2ConfigurationError("Emissão BolePix v2 não encontrada.");
  if (!emissao.btgCollectionId) throw new BtgV2ConfigurationError("A emissão não possui collectionId confirmado pelo BTG.");

  const remoto = await consultarCobrancaBtgV2(emissao.btgCollectionId);
  if (!remoto) {
    return { id: emissao.id, statusAnterior: emissao.status, statusAtual: emissao.status, pagamentoAplicado: false, encontradoNoBtg: false };
  }

  const statusAtual = mapearStatusCollectionsV2(remoto.status, emissao.status);
  const now = new Date();
  let pagamentoAplicado = false;
  if (statusAtual === "paga") {
    if (remoto.paidAmount === null || remoto.paidAmount !== emissao.amount) {
      await db.update(btgCobrancasEmitidas).set({
        erroCodigo: "PAYMENT_AMOUNT_MISMATCH",
        updatedAt: now,
      }).where(eq(btgCobrancasEmitidas.id, emissao.id));
      throw new BtgV2ConfigurationError("O valor pago retornado pelo BTG não confere com o título; a baixa foi bloqueada.");
    }
    await aplicarPagamentoNaOrigem(db, emissao, remoto.paidAt ? new Date(remoto.paidAt) : now);
    pagamentoAplicado = true;
  }

  await db.update(btgCobrancasEmitidas).set({
    status: statusAtual,
    bankSlipUrl: remoto.bankSlipUrl,
    pixQrCode: remoto.pixQrCode,
    pixCopiaECola: remoto.pixCopiaECola,
    codigoBarras: remoto.codigoBarras,
    linhaDigitavel: remoto.linhaDigitavel,
    nossoNumero: remoto.nossoNumero,
    erroCodigo: null,
    updatedAt: now,
  }).where(eq(btgCobrancasEmitidas.id, emissao.id));

  return { id: emissao.id, statusAnterior: emissao.status, statusAtual, pagamentoAplicado, encontradoNoBtg: true };
}

/** Cancelamento tem confirmação externa obrigatória. A origem permanece pendente para permitir reemissão revisada. */
export async function cancelarEmissaoBolePixV2(db: Db, emissaoId: number): Promise<{ id: number; status: "cancelada" }> {
  const [emissao] = await db.select().from(btgCobrancasEmitidas)
    .where(eq(btgCobrancasEmitidas.id, emissaoId)).limit(1);
  if (!emissao) throw new BtgV2ConfigurationError("Emissão BolePix v2 não encontrada.");
  if (!emissao.btgCollectionId) throw new BtgV2ConfigurationError("A emissão não possui collectionId confirmado pelo BTG.");
  if (isTerminal(emissao.status)) throw new BtgV2ConfigurationError("Não é possível cancelar uma emissão já encerrada.");

  await cancelarCobrancaBtgV2(emissao.btgCollectionId);
  await db.update(btgCobrancasEmitidas).set({
    status: "cancelada",
    updatedAt: new Date(),
  }).where(and(eq(btgCobrancasEmitidas.id, emissao.id), eq(btgCobrancasEmitidas.status, emissao.status)));
  return { id: emissao.id, status: "cancelada" };
}
