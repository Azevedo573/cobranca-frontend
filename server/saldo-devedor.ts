import { and, eq, inArray, or } from "drizzle-orm";
import {
  acordos,
  acordoCobrancas,
  cobrancas,
  condominios,
  devedores,
  parcelasAcordo,
} from "../drizzle/schema";
import type {
  Acordo,
  AcordoCobranca,
  Cobranca,
  ParcelaAcordo,
} from "../drizzle/schema";
import { calcularValorDevido, type TaxasCondominio } from "../shared/calculos";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type SaldoDevedorDb = Pick<Db, "select" | "update">;
export type SaldoDevedor = {
  totalDue: number;
  status: "ativo" | "pago" | "acordo";
};
type OrigemSaldo = Pick<
  Cobranca,
  "id" | "condominioId" | "devedorId" | "amount" | "dueDate" | "status"
> & { custasJudiciais?: number };
type PlanoSaldo = Pick<
  Acordo,
  "id" | "condominioId" | "devedorId" | "agreedAmount" | "status"
>;
type ParcelaSaldo = Pick<
  ParcelaAcordo,
  "id" | "acordoId" | "amount" | "status"
>;
type VinculoSaldo = Pick<AcordoCobranca, "id" | "acordoId" | "cobrancaId">;
export type DadosSaldoDevedor = {
  devedorId: number;
  condominioId: number;
  now: Date;
  taxas: TaxasCondominio | null;
  cobrancas: OrigemSaldo[];
  acordos: PlanoSaldo[];
  parcelas: ParcelaSaldo[];
  vinculos: VinculoSaldo[];
};
const vivo = (a: PlanoSaldo) =>
  a.status === "ativo" || a.status === "inadimplente";
const aberta = (c: OrigemSaldo) =>
  c.status !== "pago" && c.status !== "cancelado";
const negociada = (c: OrigemSaldo) =>
  ["em_acordo", "acordo", "acordo_atrasado"].includes(c.status);
const centavos = (v: number) => Number.isSafeInteger(v) && v >= 0;
const zeroTaxas: TaxasCondominio = {
  taxaJurosMensal: 0,
  taxaMulta: 0,
  taxaHonorarios: 0,
  correcaoMonetaria: 0,
};

/** O utilitário legado lê o relógio internamente. Ancora somente o atraso ao `now`
 * informado, mantendo sua fórmula de juros/multa/honorários/correção intacta. */
function vencimentoParaCalculo(dueDate: Date | null, now: Date): Date {
  const vencimento = dueDate ? new Date(dueDate) : now;
  if (!Number.isFinite(vencimento.getTime())) return new Date();
  const meses =
    vencimento >= now
      ? 0
      : Math.max(
          0,
          (now.getFullYear() - vencimento.getFullYear()) * 12 +
            now.getMonth() -
            vencimento.getMonth() +
            (now.getDate() > vencimento.getDate() ? 1 : 0)
        );
  const hoje = new Date();
  // Dia 1 evita overflow de meses (29–31) e reproduz exatamente mesesAtraso.
  return new Date(
    hoje.getFullYear(),
    hoje.getMonth() - meses + (hoje.getDate() > 1 ? 1 : 0),
    1
  );
}

/** Não distribui recebimento histórico por cobrança: pago/status é nominal, não rateio. */
export function calcularSaldoDevedor(d: DadosSaldoDevedor): SaldoDevedor {
  if (!Number.isFinite(d.now.getTime())) throw new Error("SALDO_DATE_INVALID");
  const origens = d.cobrancas.filter(c => c.devedorId === d.devedorId);
  const porId = new Map(origens.map(c => [c.id, c]));
  const planos = d.acordos.filter(a => vivo(a) || a.status === "pago");
  const porAcordo = new Map(planos.filter(vivo).map(a => [a.id, a]));
  const consumo = new Set<number>();
  const valorAvulso = (c: OrigemSaldo) => {
    if (!centavos(c.amount) || !centavos(c.custasJudiciais ?? 0))
      throw new Error("SALDO_AMOUNT_INVALID");
    const valor = calcularValorDevido(
      c.amount / 100,
      vencimentoParaCalculo(c.dueDate, d.now),
      d.taxas ?? zeroTaxas,
      (c.custasJudiciais ?? 0) / 100
    ).valorTotal;
    if (!Number.isFinite(valor) || valor < 0)
      throw new Error("SALDO_AMOUNT_INVALID");
    return valor;
  };
  let planosTotal = 0,
    ambiguo = false,
    haPlanos = false;
  for (const plano of planos) {
    const vinculos = d.vinculos.filter(v => v.acordoId === plano.id);
    const vinculadas = vinculos.map(v => porId.get(v.cobrancaId));
    // Plano alheio só é relevante se está indevidamente ligado à obrigação local.
    if (plano.devedorId !== d.devedorId && !vinculadas.some(Boolean)) continue;
    const ps = d.parcelas.filter(p => p.acordoId === plano.id);
    if (!centavos(plano.agreedAmount) || ps.some(p => !centavos(p.amount)))
      throw new Error("SALDO_AMOUNT_INVALID");
    const pagoNominal = ps
      .filter(p => p.status === "pago")
      .reduce((s, p) => s + p.amount, 0);
    // Status histórico sozinho não comprova plano integral quitado. Não altera
    // o histórico; mantém pendências/incoerências visíveis e conservadoras.
    if (
      plano.status === "pago" &&
      ps.length > 0 &&
      ps.every(p => p.status === "pago") &&
      pagoNominal === plano.agreedAmount
    )
      continue;
    const saldoParcelas = ps
      .filter(p => p.status === "pendente" || p.status === "atrasado")
      .reduce((s, p) => s + p.amount, 0);
    const identidade =
      plano.devedorId === d.devedorId && plano.condominioId === d.condominioId;
    const origensValidas =
      vinculos.length > 0 &&
      vinculadas.some(c => c && aberta(c)) &&
      new Set(vinculos.map(v => v.cobrancaId)).size === vinculos.length &&
      vinculadas.every(
        c =>
          c &&
          c.condominioId === d.condominioId &&
          c.devedorId === d.devedorId &&
          (c.status === "pago" || (aberta(c) && negociada(c))) &&
          d.vinculos.filter(
            v => v.cobrancaId === c.id && porAcordo.has(v.acordoId)
          ).length === 1
      );
    const planoValido =
      ps.length > 0 &&
      ps.reduce((s, p) => s + p.amount, 0) === plano.agreedAmount &&
      ps.every(p => ["pago", "pendente", "atrasado"].includes(p.status)) &&
      ps.some(p => p.status !== "pago");
    if (vivo(plano) && identidade && origensValidas && planoValido) {
      planosTotal += saldoParcelas;
      vinculadas.forEach(c => consumo.add(c!.id));
      haPlanos = true;
    } else {
      // Dados cancelados/incoerentes/all-paid ainda ativos não concedem quitação.
      ambiguo = true;
      const conservador = Math.max(
        saldoParcelas,
        ps.filter(p => p.status !== "pago").reduce((s, p) => s + p.amount, 0),
        plano.agreedAmount - pagoNominal,
        0
      );
      const origensAbertas = Array.from(
        new Set(vinculadas.filter((c): c is OrigemSaldo => !!c && aberta(c)))
      );
      const nominalOrigens = origensAbertas.reduce(
        (s, c) => s + valorAvulso(c) * 100,
        0
      );
      // Origens ambíguas permanecem avulsas; acrescenta somente o excesso do plano.
      planosTotal += Math.max(0, conservador - nominalOrigens);
    }
  }
  const avulsas = origens.filter(c => aberta(c) && !consumo.has(c.id));
  const avulsoTotal = avulsas.reduce((s, c) => s + valorAvulso(c), 0);
  const totalDue = Math.round(avulsoTotal * 100 + planosTotal);
  if (!Number.isSafeInteger(totalDue) || totalDue < 0 || totalDue > 2147483647)
    throw new Error("SALDO_AMOUNT_INVALID");
  return {
    totalDue,
    status:
      ambiguo || avulsas.length > 0 ? "ativo" : haPlanos ? "acordo" : "pago",
  };
}

/** Leituras não bloqueantes: jamais adquirir locks de outros acordos após o devedor.
 * O serviço de recebimento já bloqueou seu contexto/devedor antes de chamar aqui. */
export async function lerSaldoDevedor(
  db: SaldoDevedorDb,
  devedorId: number,
  condominioId: number,
  now: Date
): Promise<SaldoDevedor> {
  const [condominio] = await db
    .select()
    .from(condominios)
    .where(eq(condominios.id, condominioId))
    .limit(1);
  const origens = await db
    .select()
    .from(cobrancas)
    .where(eq(cobrancas.devedorId, devedorId));
  const planos = await db
    .select()
    .from(acordos)
    .where(eq(acordos.devedorId, devedorId));
  const cobrancaIds = Array.from(new Set(origens.map(c => c.id)));
  const acordoIds = Array.from(new Set(planos.map(a => a.id)));
  // Sem IDs, não gerar IN () nem consulta global de vínculos.
  const filtroVinculos = or(
    cobrancaIds.length
      ? inArray(acordoCobrancas.cobrancaId, cobrancaIds)
      : undefined,
    acordoIds.length ? inArray(acordoCobrancas.acordoId, acordoIds) : undefined
  );
  const vinculos: AcordoCobranca[] = filtroVinculos
    ? await db.select().from(acordoCobrancas).where(filtroVinculos)
    : [];
  // Verifica também identidade de planos alheios associados indevidamente à origem.
  const idsAlheios = Array.from(new Set(vinculos.map(v => v.acordoId))).filter(
    id => !acordoIds.includes(id)
  );
  if (idsAlheios.length) {
    planos.push(
      ...(await db
        .select()
        .from(acordos)
        .where(inArray(acordos.id, idsAlheios)))
    );
  }
  const idsPlanos = Array.from(
    new Set(planos.filter(a => vivo(a) || a.status === "pago").map(a => a.id))
  );
  const parcelas: ParcelaAcordo[] = idsPlanos.length
    ? await db
        .select()
        .from(parcelasAcordo)
        .where(inArray(parcelasAcordo.acordoId, idsPlanos))
    : [];
  const taxas = condominio
    ? {
        taxaJurosMensal: Number(condominio.taxaJurosMensal ?? 0),
        taxaMulta: Number(condominio.taxaMulta ?? 0),
        taxaHonorarios: Number(condominio.taxaHonorarios ?? 0),
        correcaoMonetaria: Number(condominio.correcaoMonetaria ?? 0),
      }
    : null;
  return calcularSaldoDevedor({
    devedorId,
    condominioId,
    now,
    taxas,
    cobrancas: origens,
    acordos: planos,
    parcelas,
    vinculos,
  });
}

export async function recalcularSaldoDevedorTx(
  tx: SaldoDevedorDb,
  devedorId: number,
  condominioId: number,
  now: Date
): Promise<SaldoDevedor> {
  const [devedor] = await tx
    .select()
    .from(devedores)
    .where(
      and(eq(devedores.id, devedorId), eq(devedores.condominioId, condominioId))
    )
    .limit(1);
  if (!devedor) throw new Error("SALDO_DEVEDOR_CONTEXT_MISMATCH");
  const saldo = await lerSaldoDevedor(tx, devedorId, condominioId, now);
  const result = await tx
    .update(devedores)
    .set(saldo)
    .where(
      and(eq(devedores.id, devedorId), eq(devedores.condominioId, condominioId))
    );
  if (result[0]?.affectedRows !== 1) throw new Error("SALDO_UPDATE_FAILED");
  return saldo;
}
