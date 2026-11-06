import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { acordos, parcelasAcordo } from '../../drizzle/schema';
import { avaliarElegibilidadeCanalParcela, CONFIRMACAO_RESERVA_LOCAL } from '../../shared/btg-canais';
import { adminProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { assertAcordoAcessivel, assertCondominioAccess } from '../tenant-guard';
import { auditarDecisaoCanal, bloquearParcelasParaCanal, idsComEmissaoV2 } from '../btg-canais';
import { BtgV2ConfigurationError } from '../btg-v2/config';

export const btgCanaisRouter = router({
  situacaoAcordo: adminProcedure.input(z.object({ acordoId: z.number().int().positive() })).query(async ({ input, ctx }) => {
    await assertAcordoAcessivel(ctx.user!, input.acordoId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });
    const [acordo] = await db.select({ status: acordos.status }).from(acordos).where(eq(acordos.id, input.acordoId)).limit(1);
    if (!acordo) throw new TRPCError({ code: 'NOT_FOUND', message: 'Acordo não encontrado.' });
    const parcelas = await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.acordoId, input.acordoId));
    const existentes = await idsComEmissaoV2(db, parcelas.map(p => p.id));
    return parcelas.map(p => {
      const avaliacao = avaliarElegibilidadeCanalParcela({ ...p, btgEmissaoV2Existente: existentes.has(p.id) }, 'api_btg_v2');
      const ativo = acordo.status === 'ativo';
      return {
        parcelaId: p.id, installmentNumber: p.installmentNumber,
        nossoNumero: p.nossoNumero, nossoNumeroOrigem: p.nossoNumeroOrigem, canalBancario: p.canalBancario,
        elegivel: ativo && avaliacao.elegivel, codigoBloqueio: ativo ? avaliacao.codigo : 'acordo_inativo',
        motivoBloqueio: ativo ? avaliacao.motivo : 'Acordo não está ativo',
        podeConfirmarReserva: ativo && avaliacao.confirmarReservaDisponivel,
      };
    });
  }),
  confirmarReservaLocal: adminProcedure.input(z.object({
    parcelaId: z.number().int().positive(),
    nossoNumeroEsperado: z.string().min(1).max(30),
    confirmacao: z.literal(CONFIRMACAO_RESERVA_LOCAL),
    declaracaoNaoEncaminhada: z.literal(true),
  })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Banco indisponível.' });
    try {
      return await db.transaction(async tx => {
        const [row] = await bloquearParcelasParaCanal(tx, [input.parcelaId]);
        await assertCondominioAccess(ctx.user!, row.condominioId);
        const p = row.parcela;
        if (p.nossoNumero !== input.nossoNumeroEsperado) {
          throw new TRPCError({ code: 'CONFLICT', message: 'A numeração mudou. Atualize a parcela e revise novamente.' });
        }
        if (row.acordoStatus !== 'ativo') throw new BtgV2ConfigurationError('Acordo não está ativo.');
        const avaliacao = avaliarElegibilidadeCanalParcela({ ...p, btgEmissaoV2Existente: row.emissaoV2Existente }, 'api_btg_v2');
        if (!avaliacao.confirmarReservaDisponivel) {
          throw new BtgV2ConfigurationError(avaliacao.motivo ?? 'Esta parcela não precisa de confirmação ou já foi confirmada.');
        }
        await tx.update(parcelasAcordo).set({ nossoNumeroOrigem: 'reserva_local' }).where(eq(parcelasAcordo.id, p.id));
        await auditarDecisaoCanal(tx, ctx, {
          parcelaId: p.id, condominioId: row.condominioId, evento: 'confirmar_reserva_local',
          antes: { nossoNumero: p.nossoNumero, nossoNumeroOrigem: p.nossoNumeroOrigem ?? null, canalBancario: p.canalBancario ?? null },
          depois: { nossoNumero: p.nossoNumero, nossoNumeroOrigem: 'reserva_local', canalBancario: p.canalBancario ?? null },
          motivo: 'Administrador declarou que a numeração foi somente reservada localmente e o título não foi encaminhado, registrado ou distribuído por outro canal.',
        });
        return { success: true as const, parcelaId: p.id, nossoNumero: p.nossoNumero, nossoNumeroOrigem: 'reserva_local' as const };
      });
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (error instanceof BtgV2ConfigurationError) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: error.message });
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível confirmar a reserva. Nenhuma confirmação parcial foi aplicada.' });
    }
  }),
});
