import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";

export const tarefasDemandaRouter = router({
  // ─── Listar tarefas de uma demanda ─────────────────────────────────────────
  listar: protectedProcedure
    .input(z.object({ demandaId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { tarefasDemanda } = await import("../../drizzle/schema");
      const { eq, asc } = await import("drizzle-orm");
      return db
        .select()
        .from(tarefasDemanda)
        .where(eq(tarefasDemanda.demandaId, input.demandaId))
        .orderBy(asc(tarefasDemanda.createdAt));
    }),

  // ─── Contadores por demanda (para o card do Kanban) ────────────────────────
  contadores: protectedProcedure
    .input(z.object({ demandaId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { total: 0, concluidas: 0, pendentes: 0 };
      const { tarefasDemanda } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const [row] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          concluidas: sql<number>`SUM(CASE WHEN ${tarefasDemanda.status} = 'concluida' THEN 1 ELSE 0 END)`,
        })
        .from(tarefasDemanda)
        .where(eq(tarefasDemanda.demandaId, input.demandaId));
      const total = Number(row?.total ?? 0);
      const concluidas = Number(row?.concluidas ?? 0);
      return { total, concluidas, pendentes: total - concluidas };
    }),

  // ─── Contadores em lote (para múltiplos cards do Kanban) ───────────────────
  contadoresLote: protectedProcedure
    .input(z.object({ demandaIds: z.array(z.number().int().positive()).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.demandaIds.length === 0) return [];
      const { tarefasDemanda } = await import("../../drizzle/schema");
      const { inArray, sql } = await import("drizzle-orm");
      const rows = await db
        .select({
          demandaId: tarefasDemanda.demandaId,
          total: sql<number>`COUNT(*)`,
          concluidas: sql<number>`SUM(CASE WHEN ${tarefasDemanda.status} = 'concluida' THEN 1 ELSE 0 END)`,
        })
        .from(tarefasDemanda)
        .where(inArray(tarefasDemanda.demandaId, input.demandaIds))
        .groupBy(tarefasDemanda.demandaId);
      return rows.map((r: { demandaId: number; total: number; concluidas: number }) => ({
        demandaId: r.demandaId,
        total: Number(r.total ?? 0),
        concluidas: Number(r.concluidas ?? 0),
      }));
    }),

  // ─── Criar tarefa ──────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      demandaId: z.number().int().positive(),
      titulo: z.string().min(1).max(255),
      descricao: z.string().optional(),
      responsavelId: z.number().int().positive().optional(),
      responsavelNome: z.string().max(255).optional(),
      prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
      prazo: z.string().optional(), // ISO string
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { tarefasDemanda } = await import("../../drizzle/schema");
      const prazo = input.prazo ? new Date(input.prazo) : null;
      const [result] = await db.insert(tarefasDemanda).values({
        demandaId: input.demandaId,
        titulo: input.titulo,
        descricao: input.descricao ?? null,
        responsavelId: input.responsavelId ?? null,
        responsavelNome: input.responsavelNome ?? null,
        status: "pendente",
        prioridade: input.prioridade,
        prazo: prazo ?? undefined,
        criadoPorId: ctx.user.id,
        criadoPorNome: ctx.user.name ?? ctx.user.email ?? undefined,
      });
      return { id: (result as any).insertId };
    }),

  // ─── Atualizar tarefa ──────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      titulo: z.string().min(1).max(255).optional(),
      descricao: z.string().nullable().optional(),
      responsavelId: z.number().int().positive().nullable().optional(),
      responsavelNome: z.string().max(255).nullable().optional(),
      status: z.enum(["pendente", "em_andamento", "concluida"]).optional(),
      prioridade: z.enum(["baixa", "media", "alta"]).optional(),
      prazo: z.string().nullable().optional(), // ISO string ou null
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { tarefasDemanda } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const { id, prazo: prazoStr, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (prazoStr !== undefined) {
        updateData.prazo = prazoStr ? new Date(prazoStr) : null;
      }
      await db.update(tarefasDemanda).set(updateData).where(eq(tarefasDemanda.id, id));
      return { ok: true };
    }),

  // ─── Excluir tarefa ────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { tarefasDemanda, tarefaComentarios } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [tarefa] = await db.select().from(tarefasDemanda).where(eq(tarefasDemanda.id, input.id));
      if (!tarefa) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada" });
      if (ctx.user.role !== "admin" && tarefa.criadoPorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para excluir esta tarefa" });
      }
      // Excluir comentários antes
      await db.delete(tarefaComentarios).where(eq(tarefaComentarios.tarefaId, input.id));
      await db.delete(tarefasDemanda).where(eq(tarefasDemanda.id, input.id));
      return { ok: true };
    }),

  // ─── Listar comentários de uma tarefa ──────────────────────────────────────
  getComentarios: protectedProcedure
    .input(z.object({ tarefaId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { tarefaComentarios } = await import("../../drizzle/schema");
      const { eq, asc } = await import("drizzle-orm");
      return db
        .select()
        .from(tarefaComentarios)
        .where(eq(tarefaComentarios.tarefaId, input.tarefaId))
        .orderBy(asc(tarefaComentarios.createdAt));
    }),

  // ─── Adicionar comentário a uma tarefa ─────────────────────────────────────
  addComentario: protectedProcedure
    .input(z.object({
      tarefaId: z.number().int().positive(),
      texto: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { tarefaComentarios } = await import("../../drizzle/schema");
      const [result] = await db.insert(tarefaComentarios).values({
        tarefaId: input.tarefaId,
        texto: input.texto,
        autorId: ctx.user.id,
        autorNome: ctx.user.name ?? ctx.user.email ?? undefined,
      });
      return { id: (result as any).insertId };
    }),

  // ─── Excluir comentário ────────────────────────────────────────────────────
  deleteComentario: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { tarefaComentarios } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const [comentario] = await db.select().from(tarefaComentarios).where(eq(tarefaComentarios.id, input.id));
      if (!comentario) throw new TRPCError({ code: "NOT_FOUND", message: "Comentário não encontrado" });
      if (ctx.user.role !== "admin" && comentario.autorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para excluir este comentário" });
      }
      await db.delete(tarefaComentarios).where(eq(tarefaComentarios.id, input.id));
      return { ok: true };
    }),

  // ─── Minhas Tarefas (tarefas atribuídas ao usuário logado) ────────────────────────────────────────
  minhasTarefas: protectedProcedure
    .input(z.object({
      status: z.enum(["pendente", "em_andamento", "concluida", "todas"]).default("todas"),
      prioridade: z.enum(["baixa", "media", "alta", "todas"]).default("todas"),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const { tarefasDemanda, demandas: juridicoDemandas } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const conditions: any[] = [eq(tarefasDemanda.responsavelId, ctx.user.id)];
      if (input.status !== "todas") conditions.push(eq(tarefasDemanda.status, input.status as any));
      if (input.prioridade !== "todas") conditions.push(eq(tarefasDemanda.prioridade, input.prioridade as any));

      const rows = await db
        .select({
          id: tarefasDemanda.id,
          demandaId: tarefasDemanda.demandaId,
          titulo: tarefasDemanda.titulo,
          descricao: tarefasDemanda.descricao,
          status: tarefasDemanda.status,
          prioridade: tarefasDemanda.prioridade,
          prazo: tarefasDemanda.prazo,
          criadoPorNome: tarefasDemanda.criadoPorNome,
          createdAt: tarefasDemanda.createdAt,
          updatedAt: tarefasDemanda.updatedAt,
          // dados da demanda
          demandaNumero: juridicoDemandas.numero,
          demandaAssunto: juridicoDemandas.assunto,
          demandaCondominioId: juridicoDemandas.condominioId,
        })
        .from(tarefasDemanda)
        .leftJoin(juridicoDemandas, eq(tarefasDemanda.demandaId, juridicoDemandas.id))
        .where(and(...conditions))
        .orderBy(tarefasDemanda.createdAt);

      return rows;
    }),

  // ─── Mover status rapidamente (para drag-and-drop do Kanban) ───────────────────────────
  moverStatus: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["pendente", "em_andamento", "concluida"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
      const { tarefasDemanda } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(tarefasDemanda).set({ status: input.status }).where(eq(tarefasDemanda.id, input.id));
      return { ok: true };
    }),
});
