import { desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { execucoesOperacionais } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export function exigirAdministradorOperacional(role: string | undefined) {
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores podem consultar a saúde operacional" });
  }
}

export const operacionalRouter = router({
  ultimasExecucoes: protectedProcedure
    .input(z.object({ limite: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ input, ctx }) => {
      exigirAdministradorOperacional(ctx.user?.role);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });
      return db.select()
        .from(execucoesOperacionais)
        .orderBy(desc(execucoesOperacionais.iniciadoEm))
        .limit(input.limite);
    }),

  resumo: protectedProcedure.query(async ({ ctx }) => {
    exigirAdministradorOperacional(ctx.user?.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível" });

    const ultimas = await db.select()
      .from(execucoesOperacionais)
      .orderBy(desc(execucoesOperacionais.iniciadoEm))
      .limit(100);

    const porChave = new Map<string, typeof ultimas[number]>();
    for (const execucao of ultimas) {
      if (!porChave.has(execucao.chave)) porChave.set(execucao.chave, execucao);
    }

    const status = Array.from(porChave.values());
    return {
      totalMonitorados: status.length,
      saudaveis: status.filter(item => item.status === "sucesso").length,
      comAlerta: status.filter(item => item.status === "alerta").length,
      comFalha: status.filter(item => item.status === "falha").length,
      emAndamento: status.filter(item => item.status === "em_andamento").length,
      itens: status,
    };
  }),
});
