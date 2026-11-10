import { TRPCError } from '@trpc/server';
import { getCarteiraCondominialAtual, assertCondominioAccess, type TenantActor, type CarteiraCondominial } from './tenant-guard';

/** NULL/admin mantêm os contratos antigos; novos modos nunca herdam dispensas por role. */
export async function getCarteiraExplicita(actor: TenantActor): Promise<CarteiraCondominial | null> {
  const carteira = await getCarteiraCondominialAtual(actor);
  return carteira.escopo === null ? null : carteira;
}

/** Argumento interno de consultas; nunca deve ser aceito como input público. */
export type FiltroCarteiraExplicita = { condominioIds: number[] };

export async function prepararFiltroCarteira(
  actor: TenantActor,
  condominioId?: number | null,
): Promise<FiltroCarteiraExplicita | undefined> {
  const carteira = await getCarteiraExplicita(actor);
  if (!carteira) return undefined;
  if (!carteira.ids.length) throw new TRPCError({ code: 'FORBIDDEN', message: 'Nenhum condomínio ativo autorizado.' });
  if (condominioId != null) {
    await assertCondominioAccess(carteira.actor, condominioId);
    return { condominioIds: [condominioId] };
  }
  return { condominioIds: carteira.ids };
}
