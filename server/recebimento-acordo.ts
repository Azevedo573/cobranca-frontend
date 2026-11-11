import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  acordoCobrancas,
  acordos,
  auditLogs,
  cobrancas,
  devedores,
  parcelasAcordo,
  type Acordo,
  type AcordoCobranca,
  type Cobranca,
  type Devedor,
  type ParcelaAcordo,
} from "../drizzle/schema";
import type { getDb } from "./db";
import { recalcularSaldoDevedorTx } from "./saldo-devedor";

// Tipo transacional real do Drizzle; este serviço nunca abre conexão/transação.
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Parcela = ParcelaAcordo;
export type ContextoRecebimentoAcordo = {
  acordo?: Acordo;
  parcela?: Parcela;
  parcelas: Parcela[];
  origens: Array<{ vinculo: AcordoCobranca; cobranca: Cobranca }>;
  devedor?: Devedor;
};
export type DadosRecebimentoAcordo = {
  valorPagoCentavos: number;
  dataPagamento: Date;
  condominioId: number;
  canal: "btg_webhook" | "btg_conciliacao" | "manual";
  ator: { userId: number | null; userRole: string };
  emissaoId?: number;
  entregaId?: number;
  metodoPagamento?: string;
  fonteDataPagamento?: "banco" | "processamento" | "manual";
  liquidadoEm?: Date;
};
export type ResultadoRecebimentoAcordo = {
  codigo: string | null;
  aplicado: boolean;
  valorPagoTotal: number;
  statusAcordo: Acordo["status"];
  cobrancasQuitadas: boolean;
  cobrancasIds: number[];
};

// Mantém a API exata sem perder vínculos órfãos em joins. O contexto público
// contém apenas pares existentes; os IDs bloqueados permitem recusá-los antes
// de qualquer write. Não há dados pessoais ou cache de estado financeiro.
const vinculosBloqueados = new WeakMap<ContextoRecebimentoAcordo, number[]>();
const MAX_CENTAVOS = 2_147_483_647;
const idValido = (id: unknown): id is number =>
  typeof id === "number" &&
  Number.isInteger(id) &&
  id > 0 &&
  id <= MAX_CENTAVOS;
const centavosValidos = (valor: unknown): valor is number =>
  typeof valor === "number" &&
  Number.isInteger(valor) &&
  valor >= 0 &&
  valor <= MAX_CENTAVOS;

/**
 * Referência inicial é somente leitura. Ordem obrigatória: acordo → TODAS as
 * parcelas → vínculos → origens → devedor. O caller bloqueia emissões depois.
 * Não adquirir lock de outra parcela/pai durante aplicação do recebimento.
 */
export async function bloquearContextoRecebimentoAcordo(
  tx: Tx,
  parcelaId: number
): Promise<ContextoRecebimentoAcordo> {
  const vazio: ContextoRecebimentoAcordo = { parcelas: [], origens: [] };
  if (!idValido(parcelaId)) return vazio;
  const [referencia] = await tx
    .select({ acordoId: parcelasAcordo.acordoId })
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, parcelaId))
    .limit(1);
  if (!referencia) return vazio;

  const [acordo] = await tx
    .select()
    .from(acordos)
    .where(eq(acordos.id, referencia.acordoId))
    .limit(1)
    .for("update");
  if (!acordo) return vazio;
  const parcelas = await tx
    .select()
    .from(parcelasAcordo)
    .where(eq(parcelasAcordo.acordoId, acordo.id))
    .orderBy(asc(parcelasAcordo.id))
    .for("update");
  const vinculos = await tx
    .select()
    .from(acordoCobrancas)
    .where(eq(acordoCobrancas.acordoId, acordo.id))
    .orderBy(asc(acordoCobrancas.id))
    .for("update");
  const ids = Array.from(new Set(vinculos.map(v => v.cobrancaId))).sort(
    (a, b) => a - b
  );
  const origens = ids.length
    ? await tx
        .select()
        .from(cobrancas)
        .where(inArray(cobrancas.id, ids))
        .orderBy(asc(cobrancas.id))
        .for("update")
    : [];
  const [devedor] = await tx
    .select()
    .from(devedores)
    .where(eq(devedores.id, acordo.devedorId))
    .limit(1)
    .for("update");
  const porId = new Map(origens.map(c => [c.id, c]));
  const contexto: ContextoRecebimentoAcordo = {
    acordo,
    parcela: parcelas.find(p => p.id === parcelaId),
    parcelas,
    origens: vinculos.flatMap(vinculo => {
      const cobranca = porId.get(vinculo.cobrancaId);
      return cobranca ? [{ vinculo, cobranca }] : [];
    }),
    devedor,
  };
  vinculosBloqueados.set(
    contexto,
    vinculos.map(v => v.id)
  );
  return contexto;
}

function exigirUmaLinha(result: unknown, codigo: string): void {
  if (!Array.isArray(result) || result[0]?.affectedRows !== 1)
    throw new Error(codigo);
}
const metodos = new Set(["QRCODE", "BANKSLIP", "BARCODE", "BANK_SLIP", "PIX"]);
const roles = new Set([
  "admin",
  "sindico",
  "cobrador",
  "colaborador",
  "advogado",
  "system",
]);

/**
 * Recebimento integral de UMA parcela. Não é baixa de caixa/rateio, reparação
 * histórica, prova bancária por nominal ou mecanismo de reabertura de acordo.
 * O caller deve manter a transação e propagar erros de write/audit (rollback).
 */
export async function aplicarRecebimentoAcordo(
  tx: Tx,
  contexto: ContextoRecebimentoAcordo,
  dados: DadosRecebimentoAcordo
): Promise<ResultadoRecebimentoAcordo> {
  const { acordo, parcela, parcelas, origens, devedor } = contexto;
  const recusar = (codigo: string | null): ResultadoRecebimentoAcordo => ({
    codigo,
    aplicado: false,
    valorPagoTotal: acordo?.valorPago ?? 0,
    statusAcordo: acordo?.status ?? "ativo",
    cobrancasQuitadas: false,
    cobrancasIds: [],
  });
  if (!acordo || !parcela) return recusar("ORIGIN_NOT_FOUND");
  const parcelaBloqueada = parcelas.find(p => p.id === parcela.id);
  if (
    !idValido(dados.condominioId) ||
    acordo.condominioId !== dados.condominioId ||
    !devedor ||
    devedor.id !== acordo.devedorId ||
    devedor.condominioId !== dados.condominioId ||
    parcela.acordoId !== acordo.id ||
    !parcelaBloqueada ||
    parcelaBloqueada.acordoId !== acordo.id ||
    parcelaBloqueada.amount !== parcela.amount ||
    parcelaBloqueada.status !== parcela.status ||
    (parcelaBloqueada.paymentDate?.getTime() ?? null) !==
      (parcela.paymentDate?.getTime() ?? null) ||
    parcelas.some(p => p.acordoId !== acordo.id) ||
    new Set(parcelas.map(p => p.id)).size !== parcelas.length
  ) {
    return recusar("ORIGIN_SCOPE_MISMATCH");
  }
  if (acordo.status === "cancelado" || parcela.status === "cancelado")
    return recusar("ORIGIN_NOT_ELIGIBLE");
  if (!centavosValidos(parcela.amount) || parcela.amount === 0)
    return recusar("ORIGIN_AMOUNT_MISMATCH");
  if (
    !centavosValidos(dados.valorPagoCentavos) ||
    dados.valorPagoCentavos === 0 ||
    dados.valorPagoCentavos !== parcela.amount
  )
    return recusar("PAYMENT_AMOUNT_MISMATCH");
  if (
    !(dados.dataPagamento instanceof Date) ||
    !Number.isFinite(dados.dataPagamento.getTime())
  ) {
    return recusar("PAYMENT_DATE_INVALID");
  }
  if (
    dados.liquidadoEm !== undefined &&
    (!(dados.liquidadoEm instanceof Date) ||
      !Number.isFinite(dados.liquidadoEm.getTime()))
  )
    return recusar("PAYMENT_DATE_INVALID");
  if (
    dados.fonteDataPagamento !== undefined &&
    !["banco", "processamento", "manual"].includes(dados.fonteDataPagamento)
  ) {
    return recusar("PAYMENT_CONTEXT_INVALID");
  }
  if (
    !["btg_webhook", "btg_conciliacao", "manual"].includes(dados.canal) ||
    !dados.ator ||
    (dados.ator.userId !== null && !idValido(dados.ator.userId)) ||
    (dados.emissaoId !== undefined && !idValido(dados.emissaoId)) ||
    (dados.entregaId !== undefined && !idValido(dados.entregaId))
  ) {
    return recusar("PAYMENT_CONTEXT_INVALID");
  }

  // Pago é um no-op absoluto. Não recompor valorPago, reparar origens ou trocar
  // datas históricas; quitação exige um novo recebimento elegível, não duplicata.
  if (parcela.status === "pago") return recusar(null);
  if (
    !["ativo", "inadimplente"].includes(acordo.status) ||
    !["pendente", "atrasado"].includes(parcela.status) ||
    parcela.paymentDate !== null
  ) {
    return recusar("ORIGIN_NOT_ELIGIBLE");
  }
  if (
    !parcelas.length ||
    !centavosValidos(acordo.agreedAmount) ||
    acordo.agreedAmount === 0 ||
    parcelas.some(
      p =>
        !idValido(p.id) ||
        !centavosValidos(p.amount) ||
        !["pendente", "atrasado", "pago", "cancelado"].includes(p.status)
    )
  ) {
    return recusar("AGREEMENT_PLAN_MISMATCH");
  }
  const somaPlano = parcelas.reduce(
    (total, p) => total + BigInt(p.amount),
    BigInt(0)
  );
  if (somaPlano !== BigInt(acordo.agreedAmount))
    return recusar("AGREEMENT_PLAN_MISMATCH");

  const vinculos = vinculosBloqueados.get(contexto);
  if (
    !origens.length ||
    !vinculos ||
    vinculos.length !== origens.length ||
    new Set(origens.map(o => o.cobranca.id)).size !== origens.length ||
    origens.some(
      ({ vinculo, cobranca }) =>
        !vinculos.includes(vinculo.id) ||
        vinculo.acordoId !== acordo.id ||
        vinculo.cobrancaId !== cobranca.id ||
        cobranca.devedorId !== acordo.devedorId ||
        cobranca.condominioId !== dados.condominioId
    )
  ) {
    return recusar("ORIGIN_SCOPE_MISMATCH");
  }
  if (origens.some(o => o.cobranca.status === "cancelado"))
    return recusar("ORIGIN_NOT_ELIGIBLE");

  // Leitura sem .for(): não bloquear pai de outro acordo depois das origens ou
  // emissões. A exclusividade da origem é coordenada pelo seu lock já adquirido;
  // integração MySQL deve validar também os writers de criação/consolidação.
  const reutilizadas = await tx
    .select({ acordoId: acordoCobrancas.acordoId })
    .from(acordoCobrancas)
    .innerJoin(acordos, eq(acordos.id, acordoCobrancas.acordoId))
    .where(
      and(
        inArray(
          acordoCobrancas.cobrancaId,
          origens.map(o => o.cobranca.id)
        ),
        ne(acordoCobrancas.acordoId, acordo.id),
        inArray(acordos.status, ["ativo", "inadimplente"])
      )
    );
  if (reutilizadas.length) return recusar("ORIGIN_REUSED_BY_ACTIVE_AGREEMENT");

  const todasPagas = parcelas.every(
    p => p.id === parcela.id || p.status === "pago"
  );
  const valorPagoTotal = Number(
    parcelas.reduce(
      (total, p) =>
        total +
        (p.id === parcela.id || p.status === "pago"
          ? BigInt(p.amount)
          : BigInt(0)),
      BigInt(0)
    )
  );
  const statusAcordo: Acordo["status"] = todasPagas ? "pago" : acordo.status;
  const cobrancasIds = todasPagas
    ? origens.map(o => o.cobranca.id).sort((a, b) => a - b)
    : [];
  const now = new Date();
  // Construir evidência mínima antes de writes. Método/role arbitrários jamais
  // entram na auditoria; não copiar payload, documento, descrição, Pix ou PII.
  const metadata = JSON.stringify({
    evento: "recebimento_acordo",
    acordoId: acordo.id,
    parcelaId: parcela.id,
    devedorId: acordo.devedorId,
    valorPagoCentavos: dados.valorPagoCentavos,
    valorPagoTotal,
    dataPagamento: dados.dataPagamento.toISOString(),
    canal: dados.canal,
    metodoPagamento: metodos.has(dados.metodoPagamento ?? "")
      ? dados.metodoPagamento
      : null,
    fonteDataPagamento:
      dados.fonteDataPagamento ?? (dados.canal === "manual" ? "manual" : null),
    ...(dados.liquidadoEm !== undefined
      ? { liquidadoEm: dados.liquidadoEm.toISOString() }
      : {}),
    ...(dados.emissaoId !== undefined ? { emissaoId: dados.emissaoId } : {}),
    ...(dados.entregaId !== undefined ? { entregaId: dados.entregaId } : {}),
    statusAcordo,
    cobrancasQuitadas: todasPagas,
    cobrancasIds,
  });

  exigirUmaLinha(
    await tx
      .update(parcelasAcordo)
      .set({ status: "pago", paymentDate: dados.dataPagamento })
      .where(
        and(
          eq(parcelasAcordo.id, parcela.id),
          eq(parcelasAcordo.acordoId, acordo.id),
          eq(parcelasAcordo.status, parcela.status),
          eq(parcelasAcordo.amount, parcela.amount)
        )
      ),
    "INSTALLMENT_UPDATE_FAILED"
  );
  // valorPagoAcordo é histórico de quebra: intencionalmente NÃO atualizado.
  exigirUmaLinha(
    await tx
      .update(acordos)
      .set({ valorPago: valorPagoTotal, status: statusAcordo, updatedAt: now })
      .where(
        and(
          eq(acordos.id, acordo.id),
          eq(acordos.condominioId, dados.condominioId),
          eq(acordos.devedorId, acordo.devedorId),
          eq(acordos.status, acordo.status)
        )
      ),
    "AGREEMENT_UPDATE_FAILED"
  );
  if (todasPagas) {
    for (const { cobranca } of origens) {
      // Origem já paga tem seu histórico preservado, inclusive data/paidAmount.
      if (cobranca.status === "pago") continue;
      exigirUmaLinha(
        await tx
          .update(cobrancas)
          .set({ status: "pago", paidAt: dados.dataPagamento, updatedAt: now })
          .where(
            and(
              eq(cobrancas.id, cobranca.id),
              eq(cobrancas.devedorId, acordo.devedorId),
              eq(cobrancas.condominioId, dados.condominioId),
              eq(cobrancas.status, cobranca.status)
            )
          ),
        "ORIGIN_UPDATE_FAILED"
      );
    }
  }
  await recalcularSaldoDevedorTx(tx, acordo.devedorId, dados.condominioId, now);
  exigirUmaLinha(
    await tx.insert(auditLogs).values({
      userId: dados.ator.userId,
      userRole: roles.has(dados.ator.userRole)
        ? dados.ator.userRole
        : "unknown",
      action: "pay_parcela",
      entity: "parcela",
      entityId: String(parcela.id),
      condominioId: dados.condominioId,
      metadata,
      ipAddress: "unknown",
      severity: "info",
      success: 1,
      createdAt: now,
    }),
    "RECEIPT_AUDIT_FAILED"
  );
  return {
    codigo: null,
    aplicado: true,
    valorPagoTotal,
    statusAcordo,
    cobrancasQuitadas: todasPagas,
    cobrancasIds,
  };
}
