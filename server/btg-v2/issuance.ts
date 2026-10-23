import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  acordos,
  btgContaRecebedoraCondominios,
  btgContasRecebedoras,
  btgCobrancasEmitidas,
  btgIntegracoes,
  cobrancas,
  devedores,
  parcelasAcordo,
} from "../../drizzle/schema";
import { criarBolePixBtgV2 } from "./client";
import { montarPayloadBolePixV2 } from "./bolepix";
import { BtgV2ConfigurationError, validarVinculoContaRecebedora } from "./config";

export type BtgV2OrigemTipo = "cobranca" | "parcela_acordo";

type Db = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export interface BtgV2EmissaoResultado {
  id: number;
  status: "emitida" | "reservada" | "enviando" | "incerta" | "falha" | "paga" | "cancelada" | "expirada";
  jaExistia: boolean;
  collectionId: string | null;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixCopiaECola: string | null;
  codigoBarras: string | null;
  linhaDigitavel: string | null;
  nossoNumero: string | null;
}

export function gerarExternalIdBtgV2(ambiente: "sandbox" | "producao", origemTipo: BtgV2OrigemTipo, origemId: number, revisao = 1): string {
  const prefixo = ambiente === "sandbox" ? "sbx" : "prd";
  return `v2:${prefixo}:${origemTipo}:${origemId}:r${revisao}`;
}

export function gerarIdempotencyKeyBtgV2(externalId: string): string {
  return createHash("sha256").update(`btg-v2:${externalId}`).digest("hex");
}

export function calcularDataLimiteBtgV2(dueDate: Date, diasLimitePagamento: number): Date {
  if (!Number.isInteger(diasLimitePagamento) || diasLimitePagamento < 1 || diasLimitePagamento > 365) {
    throw new BtgV2ConfigurationError("O limite de pagamento BTG deve estar entre 1 e 365 dias.");
  }
  const result = new Date(dueDate);
  if (Number.isNaN(result.getTime())) throw new BtgV2ConfigurationError("A data de vencimento da cobrança é inválida.");
  result.setUTCDate(result.getUTCDate() + diasLimitePagamento);
  return result;
}

function toResult(row: typeof btgCobrancasEmitidas.$inferSelect, jaExistia: boolean): BtgV2EmissaoResultado {
  return {
    id: row.id,
    status: row.status,
    jaExistia,
    collectionId: row.btgCollectionId,
    bankSlipUrl: row.bankSlipUrl,
    pixQrCode: row.pixQrCode,
    pixCopiaECola: row.pixCopiaECola,
    codigoBarras: row.codigoBarras,
    linhaDigitavel: row.linhaDigitavel,
    nossoNumero: row.nossoNumero,
  };
}

function isDuplicate(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate|unique|1062/i.test(message);
}

async function findExisting(db: Db, integracaoId: number, origemTipo: BtgV2OrigemTipo, origemId: number) {
  const rows = await db.select().from(btgCobrancasEmitidas)
    .where(and(
      eq(btgCobrancasEmitidas.btgIntegracaoId, integracaoId),
      eq(btgCobrancasEmitidas.origemTipo, origemTipo),
      eq(btgCobrancasEmitidas.origemId, origemId),
      eq(btgCobrancasEmitidas.revisao, 1),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function emitirBolePixV2(input: {
  db: Db;
  origemTipo: BtgV2OrigemTipo;
  origemId: number;
}): Promise<BtgV2EmissaoResultado> {
  const { db, origemTipo, origemId } = input;
  const [integracao] = await db.select().from(btgIntegracoes)
    .where(eq(btgIntegracoes.ambiente, "sandbox"))
    .limit(1);

  if (!integracao || integracao.ativo !== 1 || integracao.emissaoHabilitada !== 1) {
    throw new BtgV2ConfigurationError("A emissão BolePix v2 não está habilitada para homologação.");
  }

  let origem: {
    condominioId: number;
    devedorId: number;
    amount: number;
    dueDate: Date;
    description: string;
    legadoAtivo: boolean;
  };

  if (origemTipo === "cobranca") {
    const [cobranca] = await db.select().from(cobrancas).where(eq(cobrancas.id, origemId)).limit(1);
    if (!cobranca) throw new BtgV2ConfigurationError("Cobrança não encontrada.");
    if (!cobranca.dueDate) throw new BtgV2ConfigurationError("A cobrança precisa ter vencimento definido antes da emissão.");
    if (["pago", "cancelado"].includes(cobranca.status)) throw new BtgV2ConfigurationError("Não é possível emitir uma cobrança paga ou cancelada.");
    origem = {
      condominioId: cobranca.condominioId,
      devedorId: cobranca.devedorId,
      amount: cobranca.amount,
      dueDate: cobranca.dueDate,
      description: cobranca.description?.trim() || `Cobrança condominial #${cobranca.id}`,
      legadoAtivo: Boolean(cobranca.btgCollectionId || cobranca.nossoNumero || cobranca.remessaId || (cobranca.statusRemessa && cobranca.statusRemessa !== "nao_enviado")),
    };
  } else {
    const [parcela] = await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.id, origemId)).limit(1);
    if (!parcela) throw new BtgV2ConfigurationError("Parcela do acordo não encontrada.");
    if (["pago", "cancelado"].includes(parcela.status)) throw new BtgV2ConfigurationError("Não é possível emitir uma parcela paga ou cancelada.");
    const [acordo] = await db.select().from(acordos).where(eq(acordos.id, parcela.acordoId)).limit(1);
    if (!acordo) throw new BtgV2ConfigurationError("Acordo da parcela não encontrado.");
    origem = {
      condominioId: acordo.condominioId,
      devedorId: acordo.devedorId,
      amount: parcela.amount,
      dueDate: parcela.dueDate,
      description: `Parcela ${parcela.installmentNumber} do acordo #${acordo.id}`,
      legadoAtivo: Boolean(parcela.btgCollectionId || parcela.nossoNumero || parcela.remessaId || (parcela.statusRemessa && parcela.statusRemessa !== "nao_enviado")),
    };
  }

  if (origem.legadoAtivo) {
    throw new BtgV2ConfigurationError("Este título já possui vínculo ativo com o fluxo BTG/CNAB legado e não pode ser duplicado no BolePix v2.");
  }

  const [devedor] = await db.select().from(devedores).where(eq(devedores.id, origem.devedorId)).limit(1);
  if (!devedor || devedor.condominioId !== origem.condominioId) {
    throw new BtgV2ConfigurationError("O pagador da cobrança é inválido para o condomínio selecionado.");
  }

  const accountRows = await db.select({
    vinculoAtivo: btgContaRecebedoraCondominios.ativo,
    conta: btgContasRecebedoras,
  }).from(btgContaRecebedoraCondominios)
    .innerJoin(btgContasRecebedoras, eq(btgContasRecebedoras.id, btgContaRecebedoraCondominios.btgContaRecebedoraId))
    .where(and(
      eq(btgContaRecebedoraCondominios.btgIntegracaoId, integracao.id),
      eq(btgContaRecebedoraCondominios.condominioId, origem.condominioId),
    ))
    .limit(1);
  const accountRow = accountRows[0];
  validarVinculoContaRecebedora({
    condominioId: origem.condominioId,
    integracaoAtiva: integracao.ativo === 1,
    vinculoAtivo: accountRow?.vinculoAtivo === 1 && accountRow?.conta.ativo === 1,
    conta: accountRow ? {
      accountId: accountRow.conta.accountId,
      agencia: accountRow.conta.agencia,
      numero: accountRow.conta.numero,
      documentoBeneficiario: accountRow.conta.documentoBeneficiario,
      nomeBeneficiario: accountRow.conta.nomeBeneficiario,
    } : null,
  });
  if (!accountRow) throw new BtgV2ConfigurationError("A conta recebedora não foi encontrada.");

  const existingBeforeReserve = await findExisting(db, integracao.id, origemTipo, origemId);
  if (existingBeforeReserve) return toResult(existingBeforeReserve, true);

  const externalId = gerarExternalIdBtgV2(integracao.ambiente, origemTipo, origemId);
  const idempotencyKey = gerarIdempotencyKeyBtgV2(externalId);
  const now = new Date();

  try {
    await db.insert(btgCobrancasEmitidas).values({
      btgIntegracaoId: integracao.id,
      btgContaRecebedoraId: accountRow.conta.id,
      condominioId: origem.condominioId,
      origemTipo,
      origemId,
      revisao: 1,
      instrumento: "bolepix",
      externalId,
      idempotencyKey,
      status: "reservada",
      amount: origem.amount,
      dueDate: origem.dueDate,
      agenciaRecebedora: accountRow.conta.agencia,
      contaRecebedora: accountRow.conta.numero,
      documentoBeneficiario: accountRow.conta.documentoBeneficiario,
      nomeBeneficiario: accountRow.conta.nomeBeneficiario,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (!isDuplicate(error)) throw error;
    const existingAfterRace = await findExisting(db, integracao.id, origemTipo, origemId);
    if (existingAfterRace) return toResult(existingAfterRace, true);
    throw error;
  }

  const reserva = await findExisting(db, integracao.id, origemTipo, origemId);
  if (!reserva) throw new BtgV2ConfigurationError("Não foi possível reservar a emissão BolePix.");

  await db.update(btgCobrancasEmitidas)
    .set({ status: "enviando", updatedAt: new Date() })
    .where(eq(btgCobrancasEmitidas.id, reserva.id));

  try {
    const payload = montarPayloadBolePixV2({
      amountCentavos: origem.amount,
      dueDate: origem.dueDate,
      overDueDate: calcularDataLimiteBtgV2(origem.dueDate, integracao.diasLimitePagamento),
      description: integracao.instrucoes?.trim() || origem.description,
      externalId,
      documentNumber: `${origemTipo}-${origemId}-R1`.slice(0, 100),
      correlationId: `btgv2-${reserva.id}`,
      account: { agencia: accountRow.conta.agencia, numero: accountRow.conta.numero },
      payer: {
        name: devedor.name?.trim() || `Unidade ${devedor.unitNumber}`,
        document: devedor.cpfCnpj ?? "",
        email: devedor.email,
        phone: devedor.phone,
        address: {
          street: devedor.address,
          number: devedor.addressNumber,
          complement: devedor.addressComplement,
          neighborhood: devedor.neighborhood,
          city: devedor.city,
          state: devedor.state,
          zipCode: devedor.zipCode,
        },
      },
    });
    const resposta = await criarBolePixBtgV2(payload);
    const emittedAt = new Date();
    await db.update(btgCobrancasEmitidas).set({
      btgCollectionId: resposta.collectionId,
      status: resposta.status === "PAID" ? "paga" : "emitida",
      bankSlipUrl: resposta.bankSlipUrl,
      pixQrCode: resposta.pixQrCode,
      pixCopiaECola: resposta.pixCopiaECola,
      codigoBarras: resposta.codigoBarras,
      linhaDigitavel: resposta.linhaDigitavel,
      nossoNumero: resposta.nossoNumero,
      erroCodigo: null,
      emitidaEm: emittedAt,
      updatedAt: emittedAt,
    }).where(eq(btgCobrancasEmitidas.id, reserva.id));
    const emitted = await findExisting(db, integracao.id, origemTipo, origemId);
    if (!emitted) throw new BtgV2ConfigurationError("A emissão foi concluída sem registro local.");
    return toResult(emitted, false);
  } catch (error) {
    // Depois de iniciar o POST, qualquer falha é tratada como incerta por
    // segurança: nenhuma nova emissão automática poderá duplicar o título.
    await db.update(btgCobrancasEmitidas)
      .set({ status: "incerta", erroCodigo: "EMISSAO_SEM_CONFIRMACAO", updatedAt: new Date() })
      .where(eq(btgCobrancasEmitidas.id, reserva.id));
    throw error;
  }
}
