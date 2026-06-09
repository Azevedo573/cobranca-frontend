import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { botFluxos, botNos, botSessoes, whatsappConversas, whatsappInstancias } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Schemas de validação ─────────────────────────────────────────────────────

const BotaoSchema = z.object({
  label: z.string().min(1).max(20),
  proximoNoId: z.number().nullable(),
});

const ConteudoNoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("inicio"),
    texto: z.string().optional(),
  }),
  z.object({
    tipo: z.literal("mensagem"),
    texto: z.string().min(1),
  }),
  z.object({
    tipo: z.literal("botoes"),
    texto: z.string().min(1),
    botoes: z.array(BotaoSchema).min(1).max(3),
  }),
  z.object({
    tipo: z.literal("transferir"),
    mensagem: z.string().optional(),
    departamentoId: z.number().nullable().optional(),
  }),
  z.object({
    tipo: z.literal("encerrar"),
    mensagem: z.string().optional(),
  }),
]);

// ─── Router ───────────────────────────────────────────────────────────────────

export const fluxosRouter = router({
  // Listar todos os fluxos
  listar: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const fluxos = await db.select().from(botFluxos).orderBy(desc(botFluxos.createdAt));
    // Para cada fluxo, contar nós
    const result = await Promise.all(
      fluxos.map(async (f) => {
        const nos = await db.select().from(botNos).where(eq(botNos.fluxoId, f.id));
        return { ...f, totalNos: nos.length };
      })
    );
    return result;
  }),

  // Buscar fluxo completo com nós
  buscar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [fluxo] = await db.select().from(botFluxos).where(eq(botFluxos.id, input.id));
      if (!fluxo) throw new TRPCError({ code: "NOT_FOUND", message: "Fluxo não encontrado" });
      const nos = await db.select().from(botNos).where(eq(botNos.fluxoId, input.id)).orderBy(botNos.ordem);
      return { ...fluxo, nos };
    }),

  // Criar fluxo
  criar: protectedProcedure
    .input(z.object({
      nome: z.string().min(1).max(100),
      descricao: z.string().optional(),
      instanciaId: z.number().nullable().optional(),
      gatilho: z.enum(["primeira_mensagem", "palavra_chave"]).default("primeira_mensagem"),
      palavraChave: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const [result] = await db.insert(botFluxos).values({
        nome: input.nome,
        descricao: input.descricao || null,
        instanciaId: input.instanciaId || null,
        gatilho: input.gatilho,
        palavraChave: input.palavraChave || null,
        ativo: true,
      });
      const fluxoId = (result as any).insertId;

      // Criar nó de início automaticamente
      await db.insert(botNos).values({
        fluxoId,
        tipo: "inicio",
        titulo: "Início",
        conteudo: { tipo: "inicio", texto: "" },
        ordem: 0,
      });

      return { id: fluxoId };
    }),

  // Atualizar fluxo
  atualizar: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(1).max(100).optional(),
      descricao: z.string().optional(),
      ativo: z.boolean().optional(),
      instanciaId: z.number().nullable().optional(),
      gatilho: z.enum(["primeira_mensagem", "palavra_chave"]).optional(),
      palavraChave: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(botFluxos).set({ ...data, updatedAt: new Date() }).where(eq(botFluxos.id, id));
      return { ok: true };
    }),

  // Excluir fluxo
  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(botNos).where(eq(botNos.fluxoId, input.id));
      await db.delete(botSessoes).where(eq(botSessoes.fluxoId, input.id));
      await db.delete(botFluxos).where(eq(botFluxos.id, input.id));
      return { ok: true };
    }),

  // ─── Nós ───────────────────────────────────────────────────────────────────

  // Adicionar nó ao fluxo
  adicionarNo: protectedProcedure
    .input(z.object({
      fluxoId: z.number(),
      tipo: z.enum(["mensagem", "botoes", "transferir", "encerrar"]),
      titulo: z.string().min(1).max(100),
      conteudo: z.any(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Calcular próxima ordem
      const nos = await db.select().from(botNos).where(eq(botNos.fluxoId, input.fluxoId));
      const maxOrdem = nos.reduce((max, n) => Math.max(max, n.ordem), 0);
      const [result] = await db.insert(botNos).values({
        fluxoId: input.fluxoId,
        tipo: input.tipo,
        titulo: input.titulo,
        conteudo: input.conteudo,
        ordem: input.ordem ?? maxOrdem + 1,
      });
      return { id: (result as any).insertId };
    }),

  // Atualizar nó
  atualizarNo: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().min(1).max(100).optional(),
      conteudo: z.any().optional(),
      ordem: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(botNos).set(data).where(eq(botNos.id, id));
      return { ok: true };
    }),

  // Excluir nó
  excluirNo: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      await db.delete(botNos).where(eq(botNos.id, input.id));
      return { ok: true };
    }),

  // Salvar todos os nós de um fluxo de uma vez (usado pelo editor)
  salvarNos: protectedProcedure
    .input(z.object({
      fluxoId: z.number(),
      nos: z.array(z.object({
        id: z.number().optional(), // undefined = novo nó
        tipo: z.enum(["inicio", "mensagem", "botoes", "transferir", "encerrar"]),
        titulo: z.string().min(1).max(100),
        conteudo: z.any(),
        ordem: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      // Remover nós existentes (exceto início)
      const nosExistentes = await db.select().from(botNos).where(eq(botNos.fluxoId, input.fluxoId));
      const noInicio = nosExistentes.find(n => n.tipo === "inicio");

      // Apagar todos exceto o nó de início
      for (const no of nosExistentes) {
        if (no.tipo !== "inicio") {
          await db.delete(botNos).where(eq(botNos.id, no.id));
        }
      }

      // Inserir/atualizar nós
      const idsMap: Record<string, number> = {};
      for (const no of input.nos) {
        if (no.tipo === "inicio" && noInicio) {
          await db.update(botNos).set({ titulo: no.titulo, conteudo: no.conteudo, ordem: no.ordem }).where(eq(botNos.id, noInicio.id));
          idsMap[`_${no.ordem}`] = noInicio.id;
        } else if (no.tipo !== "inicio") {
          const [r] = await db.insert(botNos).values({
            fluxoId: input.fluxoId,
            tipo: no.tipo,
            titulo: no.titulo,
            conteudo: no.conteudo,
            ordem: no.ordem,
          });
          idsMap[`_${no.ordem}`] = (r as any).insertId;
        }
      }

      return { ok: true, idsMap };
    }),

  // Listar instâncias disponíveis para associar ao fluxo
  listarInstancias: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return await db.select().from(whatsappInstancias).orderBy(whatsappInstancias.nome);
  }),
});
