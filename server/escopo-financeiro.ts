import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { acordos, acordoCobrancas, parcelasAcordo, custasJudiciais } from "../drizzle/schema";
import { getDb } from "./db";
import { getCarteiraExplicita } from "./escopo-explicito";
import { assertCondominioAccess, assertDevedorAcessivel, assertCobrancaAcessivel, assertAcordoAcessivel, type TenantActor } from "./tenant-guard";

type RelacaoFinanceira = { condominioId: number; devedorId: number };
function conferirRelacao(recurso: RelacaoFinanceira, alvo: RelacaoFinanceira) {
  if (recurso.condominioId !== alvo.condominioId || recurso.devedorId !== alvo.devedorId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Relação financeira fora do condomínio/devedor informado." });
  }
}
async function dbFinanceiro() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  return db;
}

/** Guards adicionais são exclusivos dos novos modos; NULL conserva os handlers antigos. */
export async function preflightDevedorFinanceiro(actor: TenantActor, devedorId: number, condominioId?: number) {
  if (!await getCarteiraExplicita(actor)) return;
  if (condominioId !== undefined) await assertCondominioAccess(actor, condominioId);
  const devedor = await assertDevedorAcessivel(actor, devedorId);
  if (condominioId !== undefined && devedor.condominioId !== condominioId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Devedor não pertence ao condomínio informado." });
  }
}
export async function preflightCondominioFinanceiro(actor: TenantActor, condominioId: number) {
  if (await getCarteiraExplicita(actor)) await assertCondominioAccess(actor, condominioId);
}
export async function preflightCobrancaFinanceiro(actor: TenantActor, cobrancaId: number) {
  if (!await getCarteiraExplicita(actor)) return;
  const cobranca = await assertCobrancaAcessivel(actor, cobrancaId);
  await preflightDevedorFinanceiro(actor, cobranca.devedorId, cobranca.condominioId);
  return cobranca;
}
export async function preflightAcordosDaCobrancaFinanceiro(actor: TenantActor, cobrancaId: number) {
  const cobranca = await preflightCobrancaFinanceiro(actor, cobrancaId);
  if (!cobranca) return;
  const db = await dbFinanceiro();
  const vinculados = await db.select({ id: acordos.id }).from(acordos)
    .innerJoin(acordoCobrancas, eq(acordos.id, acordoCobrancas.acordoId))
    .where(and(eq(acordoCobrancas.cobrancaId, cobrancaId), eq(acordos.status, "ativo")));
  for (const vinculado of vinculados) conferirRelacao(await assertAcordoAcessivel(actor, vinculado.id), cobranca);
}
export async function preflightAcordoFinanceiro(actor: TenantActor, acordoId: number, relacionadas = false) {
  if (!await getCarteiraExplicita(actor)) return;
  const acordo = await assertAcordoAcessivel(actor, acordoId);
  await preflightDevedorFinanceiro(actor, acordo.devedorId, acordo.condominioId);
  if (relacionadas) {
    const db = await dbFinanceiro();
    const vinculos = await db.select({ cobrancaId: acordoCobrancas.cobrancaId }).from(acordoCobrancas)
      .where(eq(acordoCobrancas.acordoId, acordoId));
    for (const vinculo of vinculos) conferirRelacao(await assertCobrancaAcessivel(actor, vinculo.cobrancaId), acordo);
    const custas = await db.select({ condominioId: custasJudiciais.condominioId, devedorId: custasJudiciais.devedorId })
      .from(custasJudiciais).where(eq(custasJudiciais.acordoId, acordoId));
    for (const custa of custas) conferirRelacao(custa, acordo);
  }
  return acordo;
}
export async function preflightParcelaFinanceiro(actor: TenantActor, parcelaId: number, relacionadas = false) {
  if (!await getCarteiraExplicita(actor)) return;
  const db = await dbFinanceiro();
  const [parcela] = await db.select({ acordoId: parcelasAcordo.acordoId }).from(parcelasAcordo)
    .where(eq(parcelasAcordo.id, parcelaId)).limit(1);
  if (!parcela) throw new TRPCError({ code: "NOT_FOUND", message: "Parcela não encontrada." });
  await preflightAcordoFinanceiro(actor, parcela.acordoId, relacionadas);
}

/** Todas as referências são verificadas antes de cancelamentos, sequenciais e writes. */
export async function preflightCriacaoAcordoFinanceiro(actor: TenantActor, input: RelacaoFinanceira & { cobrancaIds: number[]; acordoOrigemId?: number }) {
  if (!await getCarteiraExplicita(actor)) return;
  await preflightDevedorFinanceiro(actor, input.devedorId, input.condominioId);
  for (const id of input.cobrancaIds) conferirRelacao(await assertCobrancaAcessivel(actor, id), input);
  if (input.acordoOrigemId !== undefined) conferirRelacao(await assertAcordoAcessivel(actor, input.acordoOrigemId), input);
  const db = await dbFinanceiro();
  const ativos = await db.select({ id: acordos.id, condominioId: acordos.condominioId, devedorId: acordos.devedorId })
    .from(acordos).where(and(eq(acordos.devedorId, input.devedorId), eq(acordos.status, "ativo")));
  for (const ativo of ativos) conferirRelacao(await assertAcordoAcessivel(actor, ativo.id), input);
  const custas = await db.select({ condominioId: custasJudiciais.condominioId, devedorId: custasJudiciais.devedorId })
    .from(custasJudiciais).where(and(eq(custasJudiciais.devedorId, input.devedorId), isNull(custasJudiciais.acordoId)));
  for (const custa of custas) conferirRelacao(custa, input);
}

/** O histórico recursivo não pode cruzar devedor/tenant nem entrar em ciclo. */
export async function preflightHistoricoAcordoFinanceiro(actor: TenantActor, acordoId: number) {
  if (!await getCarteiraExplicita(actor)) return;
  const alvo = await assertAcordoAcessivel(actor, acordoId);
  const db = await dbFinanceiro();
  const visitados = new Set<number>();
  let id: number | null = acordoId;
  while (id !== null) {
    if (visitados.has(id)) throw new TRPCError({ code: "NOT_FOUND", message: "Histórico de acordo inválido." });
    visitados.add(id);
    conferirRelacao(await assertAcordoAcessivel(actor, id), alvo);
    const [origem] = await db.select({ acordoOrigemId: acordos.acordoOrigemId }).from(acordos).where(eq(acordos.id, id)).limit(1);
    id = origem?.acordoOrigemId ?? null;
  }
}
