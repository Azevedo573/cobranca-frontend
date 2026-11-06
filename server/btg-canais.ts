import { and, asc, eq, inArray } from 'drizzle-orm';
import { acordos, auditLogs, btgCobrancasEmitidas, parcelasAcordo } from '../drizzle/schema';
import { avaliarElegibilidadeCanalParcela, type CanalEnvioBancario } from '../shared/btg-canais';
import type { TrpcContext } from './_core/context';
import type { BtgTransaction } from './btg-v2/manual-producao';
import { BtgV2ConfigurationError } from './btg-v2/config';

type Db = NonNullable<Awaited<ReturnType<typeof import('./db').getDb>>>;
export interface ParcelaCanalBloqueada {
  parcela: typeof parcelasAcordo.$inferSelect;
  acordoStatus: string;
  condominioId: number;
  emissaoV2Existente: boolean;
}

/** Ordem comum: parcela/acordo em IDs crescentes -> emissões. Nunca adquirir integração depois destes locks. */
export async function bloquearParcelasParaCanal(tx: BtgTransaction, parcelaIds: number[], condominioId?: number): Promise<ParcelaCanalBloqueada[]> {
  const ids = Array.from(new Set(parcelaIds)).sort((a, b) => a - b);
  if (!ids.length || ids.length !== parcelaIds.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new BtgV2ConfigurationError('Selecione parcelas válidas, sem IDs duplicados.');
  }
  const rows = await tx.select({ parcela: parcelasAcordo, acordoStatus: acordos.status, condominioId: acordos.condominioId })
    .from(parcelasAcordo).innerJoin(acordos, eq(acordos.id, parcelasAcordo.acordoId))
    .where(inArray(parcelasAcordo.id, ids)).orderBy(asc(parcelasAcordo.id)).for('update');
  if (rows.length !== ids.length || (condominioId != null && rows.some(row => row.condominioId !== condominioId))) {
    throw new BtgV2ConfigurationError('Uma ou mais parcelas não pertencem ao contexto selecionado.');
  }
  const emissoes = await tx.select({ origemId: btgCobrancasEmitidas.origemId }).from(btgCobrancasEmitidas)
    .where(and(eq(btgCobrancasEmitidas.origemTipo, 'parcela_acordo'), inArray(btgCobrancasEmitidas.origemId, ids))).for('update');
  const emitidas = new Set(emissoes.map(row => row.origemId));
  return rows.map(row => ({ ...row, emissaoV2Existente: emitidas.has(row.parcela.id) }));
}

export function exigirParcelaLivreParaCanal(row: ParcelaCanalBloqueada, canal: CanalEnvioBancario) {
  if (row.acordoStatus !== 'ativo') throw new BtgV2ConfigurationError('Acordo não está ativo.');
  const avaliacao = avaliarElegibilidadeCanalParcela({ ...row.parcela, btgEmissaoV2Existente: row.emissaoV2Existente }, canal);
  if (!avaliacao.elegivel) throw new BtgV2ConfigurationError(avaliacao.motivo ?? 'Parcela indisponível para envio.');
  return avaliacao;
}

/** Leitura de evidências para filas; não adquire canal nem interpreta ausência como aprovação de legado. */
export async function idsComEmissaoV2(db: Pick<Db, 'select'>, parcelaIds: number[]): Promise<Set<number>> {
  if (!parcelaIds.length) return new Set();
  const rows = await db.select({ origemId: btgCobrancasEmitidas.origemId }).from(btgCobrancasEmitidas)
    .where(and(eq(btgCobrancasEmitidas.origemTipo, 'parcela_acordo'), inArray(btgCobrancasEmitidas.origemId, parcelaIds)));
  return new Set(rows.map(row => row.origemId));
}

/** Auditoria estrita: falha deve desfazer a confirmação/reserva da própria transação. Sem meios de pagamento ou segredos. */
export async function auditarDecisaoCanal(tx: BtgTransaction, ctx: TrpcContext, input: {
  parcelaId: number; condominioId: number; evento: string;
  antes: Record<string, unknown>; depois: Record<string, unknown>; motivo?: string;
}) {
  const forwarded = ctx.req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || ctx.req.socket?.remoteAddress || ctx.req.ip || 'unknown';
  await tx.insert(auditLogs).values({
    userId: ctx.user?.id ?? null, userName: ctx.user?.name ?? null, userRole: ctx.user?.role ?? null,
    userEmail: ctx.user?.email ?? null, action: 'config_change', entity: 'parcela', entityId: String(input.parcelaId),
    condominioId: input.condominioId, beforeData: JSON.stringify(input.antes), afterData: JSON.stringify(input.depois),
    metadata: JSON.stringify({ evento: input.evento, motivo: input.motivo ?? null, operacao: 'decisao_canal_bancario' }),
    ipAddress: ip.substring(0, 45), userAgent: String(ctx.req.headers['user-agent'] ?? '').substring(0, 500),
    severity: 'warning', success: 1,
  });
}
