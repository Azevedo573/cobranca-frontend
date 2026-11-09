import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { adminProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { analisarRecuperacaoBtg, confirmarRecuperacaoBtg } from '../btg-v2/reenvio';
async function protegido<T>(fn:()=>Promise<T>):Promise<T> {
  try {return await fn();} catch(error) {
    if(error instanceof TRPCError) throw error;
    throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'Não foi possível analisar a recuperação BTG agora; nenhuma repetição automática será feita.'});
  }
}
const id = z.number().int().positive().max(2_147_483_647);
export const btgRecuperacaoRouter = router({
  analisar:adminProcedure.input(z.object({parcelaId:id,remessaId:id.optional()})).mutation(({ctx,input})=>protegido(async()=>{
    const db=await getDb();if(!db)throw new Error('db unavailable');
    return analisarRecuperacaoBtg({db,usuarioId:ctx.user.id,...input});
  })),
  confirmar:adminProcedure.input(z.object({analiseId:z.string().uuid(),confirmacao:z.enum(['REENVIAR PARCELA BTG','RECUPERAR VINCULO BTG']),ciente:z.literal(true)})).mutation(({ctx,input})=>protegido(async()=>{
    const db=await getDb();if(!db)throw new Error('db unavailable');
    return confirmarRecuperacaoBtg({db,usuarioId:ctx.user.id,...input});
  })),
});
