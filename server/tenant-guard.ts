import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { condominios, userCondominios } from "../drizzle/schema";
import { getDb } from "./db";

export type TenantActor = {
  id: number;
  role: string;
  condominioId: number | null;
};

export type VinculoCondominio = {
  condominioId: number;
  isActive: number;
};

function acessoNegado(mensagem: string): TRPCError {
  return new TRPCError({ code: "FORBIDDEN", message: mensagem });
}

/**
 * Confere um vínculo sem acessar o banco. Exportado para testes unitários e para
 * evitar que o cliente defina acesso apenas pelo condomínio principal histórico.
 */
export function validarVinculoMultiCondominio(
  condominioId: number,
  vinculos: VinculoCondominio[],
): boolean {
  return vinculos.some((vinculo) =>
    Number(vinculo.condominioId) === Number(condominioId) && vinculo.isActive === 1,
  );
}

/**
 * Resolve o condomínio do pedido a partir dos vínculos ativos já carregados.
 * Admin é o único papel que pode operar sem filtro condominial.
 */
export function resolveCondominioEfetivoComVinculos(
  actor: TenantActor,
  condominioIdsAtivos: number[],
  condominioSolicitado?: number | null,
): number | undefined {
  if (actor.role === "admin") return condominioSolicitado ?? undefined;

  const vinculosNormalizados = Array.from(new Set(condominioIdsAtivos.map(Number)));
  if (vinculosNormalizados.length === 0) {
    throw acessoNegado("Usuário sem vínculo ativo com condomínio.");
  }

  const condominioPadrao = actor.condominioId ?? vinculosNormalizados[0];
  const efetivo = condominioSolicitado ?? condominioPadrao;

  if (!vinculosNormalizados.includes(Number(efetivo))) {
    throw acessoNegado("Você não possui vínculo ativo com o condomínio solicitado.");
  }

  return Number(efetivo);
}

/** Lista condomínios ativos aos quais a pessoa usuária está vinculada. */
export async function getCondominiosAtivosDoUsuario(actor: TenantActor): Promise<number[]> {
  if (actor.role === "admin") return [];

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

  const vinculos = await db
    .select({ condominioId: userCondominios.condominioId })
    .from(userCondominios)
    .innerJoin(condominios, eq(userCondominios.condominioId, condominios.id))
    .where(and(
      eq(userCondominios.userId, actor.id),
      eq(userCondominios.isActive, 1),
      eq(condominios.statusCadastro, "ativo"),
    ));

  return Array.from(new Set(vinculos.map((vinculo) => Number(vinculo.condominioId))));
}

/** Resolve o condomínio confiável que será usado pelo handler. */
export async function resolveCondominioEfetivo(
  actor: TenantActor,
  condominioSolicitado?: number | null,
): Promise<number | undefined> {
  const vinculados = await getCondominiosAtivosDoUsuario(actor);
  return resolveCondominioEfetivoComVinculos(actor, vinculados, condominioSolicitado);
}

/** Verifica que o ator pode operar no condomínio informado. */
export async function assertCondominioAccess(actor: TenantActor, condominioId: number): Promise<void> {
  await resolveCondominioEfetivo(actor, condominioId);
}

/**
 * Valida os condomínios antes de persistir vínculos. Condomínios inativos não
 * podem ser associados a usuários locais.
 */
export async function validarCondominiosAtivos(condominioIds: number[]): Promise<number[]> {
  const ids = Array.from(new Set(condominioIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length !== condominioIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe condomínios válidos e sem duplicidade." });
  }
  if (ids.length === 0) return [];

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

  const ativos = await db
    .select({ id: condominios.id })
    .from(condominios)
    .where(and(inArray(condominios.id, ids), eq(condominios.statusCadastro, "ativo")));

  if (ativos.length !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Um ou mais condomínios informados não existem ou estão inativos." });
  }

  return ids;
}

/**
 * Substitui a lista de vínculos ativos de um usuário sem apagar histórico físico.
 * O condomínio principal precisa constar na lista para preservar compatibilidade
 * dos fluxos que ainda usam users.condominioId.
 */
export async function substituirVinculosDeCondominio(
  userId: number,
  condominioIds: number[],
  condominioPrincipalId: number | null,
): Promise<void> {
  const ids = await validarCondominiosAtivos(condominioIds);
  if (condominioPrincipalId !== null && !ids.includes(Number(condominioPrincipalId))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O condomínio principal deve constar entre os vínculos autorizados." });
  }

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });

  await db.transaction(async (tx) => {
    await tx.update(userCondominios)
      .set({ isActive: 0 })
      .where(eq(userCondominios.userId, userId));

    if (ids.length > 0) {
      await tx.insert(userCondominios)
        .values(ids.map((condominioId) => ({ userId, condominioId, isActive: 1 })))
        .onDuplicateKeyUpdate({ set: { isActive: 1 } });
    }
  });
}

export async function listarVinculosDeCondominio(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      condominioId: userCondominios.condominioId,
      isActive: userCondominios.isActive,
      condominioNome: condominios.name,
      statusCadastro: condominios.statusCadastro,
    })
    .from(userCondominios)
    .innerJoin(condominios, eq(userCondominios.condominioId, condominios.id))
    .where(eq(userCondominios.userId, userId));
}
