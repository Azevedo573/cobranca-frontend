import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { boletosUpload, cobrancas, modeloAnexos, modelosDocumento, remessasCNAB } from "../drizzle/schema";
import { getDb } from "./db";
import { getModeloById } from "./db-modelos";
import { getCarteiraExplicita, prepararFiltroCarteira } from "./escopo-explicito";
import { assertCondominioAccess, assertCobrancaAcessivel, assertDevedorAcessivel, resolveCondominioEfetivo, type TenantActor } from "./tenant-guard";

function negar() { return new TRPCError({ code: "FORBIDDEN", message: "Documento fora da carteira autorizada." }); }
async function banco() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
  return db;
}

/** Reproduz somente o contexto do middleware antigo no ramo NULL. */
export async function resolverCondominioDocumento(actor: TenantActor, solicitado: number, middlewareLegado = false): Promise<number> {
  const carteira = await getCarteiraExplicita(actor);
  if (carteira) {
    if (!Number.isInteger(solicitado) || solicitado <= 0) throw negar();
    await assertCondominioAccess(carteira.actor, solicitado);
    return solicitado;
  }
  const principal = middlewareLegado ? await resolveCondominioEfetivo(actor) : actor.condominioId;
  return ["admin", "advogado"].includes(actor.role) ? solicitado : principal!;
}

export async function resolverCondominioRetornoDocumento(actor: TenantActor, solicitado?: number): Promise<number> {
  const carteira = await getCarteiraExplicita(actor);
  if (carteira) {
    if (solicitado !== undefined && (!Number.isInteger(solicitado) || solicitado <= 0)) throw negar();
    const id = await resolveCondominioEfetivo(carteira.actor, solicitado);
    if (!id || !Number.isInteger(id) || id <= 0) throw negar();
    return id;
  }
  // Fórmula e contexto originais: somente admin admite retorno global/0.
  const principal = await resolveCondominioEfetivo(actor);
  return actor.role === "admin" ? (solicitado ?? 0) : (principal ?? 0);
}

export async function validarCobrancaDocumento(actor: TenantActor, cobrancaId: number, condominioId?: number) {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return null;
  const cobranca = await assertCobrancaAcessivel(carteira.actor, cobrancaId);
  const devedor = await assertDevedorAcessivel(carteira.actor, cobranca.devedorId);
  if (cobranca.condominioId !== devedor.condominioId || (condominioId !== undefined && cobranca.condominioId !== condominioId)) throw negar();
  return cobranca;
}

export async function validarDevedorDocumento(actor: TenantActor, devedorId: number) {
  const carteira = await getCarteiraExplicita(actor);
  return carteira ? assertDevedorAcessivel(carteira.actor, devedorId) : null;
}

export async function validarBoletoDocumento(actor: TenantActor, id: number) {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return;
  const db = await banco();
  const [boleto] = await db.select().from(boletosUpload).where(eq(boletosUpload.id, id)).limit(1);
  if (!boleto) throw new TRPCError({ code: "NOT_FOUND", message: "Boleto não encontrado" });
  await validarCobrancaDocumento(carteira.actor, boleto.cobrancaId, boleto.condominioId);
}

/** Valida todo o lote e a remessa antes da primeira escrita, sem alterar o fluxo financeiro. */
export async function validarEnvioDocumentos(actor: TenantActor, ids: number[], remessaId?: number, condominioId?: number) {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return;
  if (!ids.length || ids.some(id => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw negar();
  const db = await banco();
  const lote = await db.select().from(cobrancas).where(inArray(cobrancas.id, ids));
  if (lote.length !== ids.length) throw negar();
  if (condominioId !== undefined && lote.some(item => item.condominioId !== condominioId)) throw negar();
  for (const item of lote) await validarCobrancaDocumento(carteira.actor, item.id, item.condominioId);
  if (remessaId !== undefined) {
    if (!Number.isInteger(remessaId) || remessaId <= 0) throw negar();
    const [remessa] = await db.select().from(remessasCNAB).where(eq(remessasCNAB.id, remessaId)).limit(1);
    if (!remessa || lote.some(item => item.condominioId !== remessa.condominioId)) throw negar();
    await assertCondominioAccess(carteira.actor, remessa.condominioId);
  }
}

export async function validarTenantDocumentoExplicito(actor: TenantActor, condominioId: number) {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return false;
  if (!Number.isInteger(condominioId) || condominioId <= 0) throw negar();
  await assertCondominioAccess(carteira.actor, condominioId);
  return true;
}

export async function listarModelosDocumentoExplicitos(actor: TenantActor, condominioId?: number | null) {
  const filtro = await prepararFiltroCarteira(actor, condominioId);
  if (!filtro) return null;
  const db = await banco();
  // NULL é a política especial de modelos compartilhados, não ausência de filtro.
  return db.select().from(modelosDocumento).where(and(eq(modelosDocumento.ativo, 1),
    or(inArray(modelosDocumento.condominioId, filtro.condominioIds), isNull(modelosDocumento.condominioId))))
    .orderBy(desc(modelosDocumento.updatedAt));
}

export async function obterModeloDocumentoAutorizado(actor: TenantActor, id: number) {
  const carteira = await getCarteiraExplicita(actor);
  if (carteira && !carteira.ids.length) throw negar();
  const modelo = await getModeloById(id);
  if (!modelo) throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });
  if (carteira && modelo.condominioId !== null) await validarTenantDocumentoExplicito(carteira.actor, modelo.condominioId);
  return modelo;
}

export async function resolverCondominioCriacaoModelo(actor: TenantActor, solicitado?: number | null) {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return solicitado ?? actor.condominioId ?? null;
  // Novos escopos criam modelo concreto; nunca convertem ausência em compartilhado.
  const id = await resolveCondominioEfetivo(carteira.actor, solicitado);
  if (!id || !Number.isInteger(id) || id <= 0) throw negar();
  return id;
}

export async function validarAnexoDocumento(actor: TenantActor, id: number) {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return;
  const db = await banco();
  const [anexo] = await db.select().from(modeloAnexos).where(eq(modeloAnexos.id, id)).limit(1);
  if (!anexo) throw new TRPCError({ code: "NOT_FOUND", message: "Anexo não encontrado" });
  await obterModeloDocumentoAutorizado(carteira.actor, anexo.modeloId);
}

export async function validarOrdemAnexosDocumento(actor: TenantActor, modeloId: number, ids: number[]) {
  await obterModeloDocumentoAutorizado(actor, modeloId);
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira || !ids.length) return;
  const db = await banco();
  const anexos = await db.select().from(modeloAnexos).where(inArray(modeloAnexos.id, ids));
  if (new Set(ids).size !== ids.length || anexos.length !== ids.length || anexos.some(item => item.modeloId !== modeloId)) throw negar();
}
