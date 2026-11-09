import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  CONFIRMACAO_CANCELAMENTO_BTG,
  confirmarCancelamentoBtg,
  consultarResultadoCancelamentoBtg,
  prepararCancelamentoBtg,
} from "../btg-v2/cancelamento";

async function dbDisponivel() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco não disponível.",
    });
  return db;
}
async function seguro<T>(executar: () => Promise<T>): Promise<T> {
  try {
    return await executar();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Operação BTG indisponível; consulte o resultado sem repetir a solicitação.",
    });
  }
}
const operacaoSchema = z.object({ operacaoId: z.string().uuid() });
export const btgCancelamentoRouter = router({
  preparar: adminProcedure
    .input(z.object({ emissaoId: z.number().int().positive() }))
    .mutation(({ input, ctx }) =>
      seguro(async () =>
        prepararCancelamentoBtg({
          db: await dbDisponivel(),
          usuarioId: ctx.user.id,
          ...input,
        })
      )
    ),
  confirmar: adminProcedure
    .input(
      operacaoSchema.extend({
        motivo: z
          .string()
          .trim()
          .min(5)
          .max(500)
          .refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
        confirmacao: z.literal(CONFIRMACAO_CANCELAMENTO_BTG),
        ciente: z.literal(true),
      })
    )
    .mutation(({ input, ctx }) =>
      seguro(async () =>
        confirmarCancelamentoBtg({
          db: await dbDisponivel(),
          usuarioId: ctx.user.id,
          ...input,
        })
      )
    ),
  // Consulta manual tem auditoria e pode persistir um resultado bancário. Não é
  // query cacheável, não cancela e não concilia o financeiro da origem.
  consultarResultado: adminProcedure
    .input(operacaoSchema)
    .mutation(({ input, ctx }) =>
      seguro(async () =>
        consultarResultadoCancelamentoBtg({
          db: await dbDisponivel(),
          usuarioId: ctx.user.id,
          ...input,
        })
      )
    ),
});
