/**
 * Router tRPC para gerenciamento dos termos de monitoramento do DOERJ.
 * Cada termo cadastrado será pesquisado automaticamente pelo job diário.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const doerjMonitoramentosRouter = router({
  // Listar todos os monitoramentos
  listar: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { doerjMonitoramentos } = await import("../../drizzle/schema");
      const { asc } = await import("drizzle-orm");
      return db.select().from(doerjMonitoramentos).orderBy(asc(doerjMonitoramentos.nome));
    }),

  // Listar apenas os ativos (usado pelo job)
  listarAtivos: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const { doerjMonitoramentos } = await import("../../drizzle/schema");
      const { eq, asc } = await import("drizzle-orm");
      return db.select().from(doerjMonitoramentos)
        .where(eq(doerjMonitoramentos.ativo, 1))
        .orderBy(asc(doerjMonitoramentos.nome));
    }),

  // Criar novo monitoramento
  criar: protectedProcedure
    .input(z.object({
      nome: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(255),
      oab: z.string().max(50).optional(),
      descricao: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { doerjMonitoramentos } = await import("../../drizzle/schema");
      await db.insert(doerjMonitoramentos).values({
        nome: input.nome.trim().toUpperCase(),
        oab: input.oab?.trim() || null,
        descricao: input.descricao?.trim() || null,
        ativo: 1,
      });
      return { ok: true };
    }),

  // Atualizar monitoramento
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      nome: z.string().min(2).max(255).optional(),
      oab: z.string().max(50).optional().nullable(),
      descricao: z.string().max(500).optional().nullable(),
      ativo: z.number().int().min(0).max(1).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { doerjMonitoramentos } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const patch: Record<string, unknown> = {};
      if (input.nome !== undefined) patch.nome = input.nome.trim().toUpperCase();
      if (input.oab !== undefined) patch.oab = input.oab?.trim() || null;
      if (input.descricao !== undefined) patch.descricao = input.descricao?.trim() || null;
      if (input.ativo !== undefined) patch.ativo = input.ativo;
      if (Object.keys(patch).length === 0) return { ok: true };
      await db.update(doerjMonitoramentos).set(patch).where(eq(doerjMonitoramentos.id, input.id));
      return { ok: true };
    }),

  // Excluir monitoramento
  excluir: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { doerjMonitoramentos } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(doerjMonitoramentos).where(eq(doerjMonitoramentos.id, input.id));
      return { ok: true };
    }),

  // Alternar ativo/pausado
  toggleAtivo: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { doerjMonitoramentos } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select({ ativo: doerjMonitoramentos.ativo })
        .from(doerjMonitoramentos)
        .where(eq(doerjMonitoramentos.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(doerjMonitoramentos)
        .set({ ativo: row.ativo === 1 ? 0 : 1 })
        .where(eq(doerjMonitoramentos.id, input.id));
      return { ok: true, novoStatus: row.ativo === 1 ? 0 : 1 };
    }),
});
