import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  atendimentoDepartamentos,
  atendimentoOperadores,
  atendimentoEtiquetas,
  atendimentoMensagensRapidas,
  atendimentos,
  atendimentoTransferencias,
  atendimentoEtiquetasAplicadas,
  atendimentoNotas,
  atendimentoAvaliacoes,
  atendimentoStatusLog,
  whatsappConversas,
  devedores,
  cobrancas,
  users,
} from "../../drizzle/schema";
import { eq, and, desc, asc, sql, isNull, isNotNull, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gerarProtocolo(): string {
  const now = new Date();
  const ano = now.getFullYear();
  const rand = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `ATD-${ano}-${rand}`;
}

function calcularSlaLimite(slaMinutos: number): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + slaMinutos);
  return d;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const atendimentoRouter = router({

  // ── Departamentos ──────────────────────────────────────────────────────────

  listarDepartamentos: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(atendimentoDepartamentos)
      .where(eq(atendimentoDepartamentos.ativo, 1))
      .orderBy(asc(atendimentoDepartamentos.nome));
  }),

  criarDepartamento: protectedProcedure
    .input(z.object({
      nome: z.string().min(2),
      descricao: z.string().optional(),
      cor: z.string().default("#6366f1"),
      instanciaId: z.number().optional(),
      slaMinutos: z.number().default(60),
      limiteChatsSimultaneos: z.number().default(5),
      distribuicaoAutomatica: z.number().default(1),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      const [result] = await db.insert(atendimentoDepartamentos).values(input);
      return { id: (result as any).insertId };
    }),

  atualizarDepartamento: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().min(2).optional(),
      descricao: z.string().optional(),
      cor: z.string().optional(),
      instanciaId: z.number().optional().nullable(),
      slaMinutos: z.number().optional(),
      limiteChatsSimultaneos: z.number().optional(),
      distribuicaoAutomatica: z.number().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(atendimentoDepartamentos).set(data).where(eq(atendimentoDepartamentos.id, id));
      return { ok: true };
    }),

  // ── Operadores ─────────────────────────────────────────────────────────────

  listarOperadores: protectedProcedure
    .input(z.object({ departamentoId: z.number().optional() }).optional())
    .query(async ({ input }) => {
    const db = (await getDb())!;
      const rows = await db
        .select({
          id: atendimentoOperadores.id,
          userId: atendimentoOperadores.userId,
          departamentoId: atendimentoOperadores.departamentoId,
          status: atendimentoOperadores.status,
          limiteChats: atendimentoOperadores.limiteChats,
          chatsAtivos: atendimentoOperadores.chatsAtivos,
          ultimaAtividade: atendimentoOperadores.ultimaAtividade,
          nome: users.name,
                    departamentoNome: atendimentoDepartamentos.nome,
          departamentoCor: atendimentoDepartamentos.cor,
        })
        .from(atendimentoOperadores)
        .leftJoin(users, eq(atendimentoOperadores.userId, users.id))
        .leftJoin(atendimentoDepartamentos, eq(atendimentoOperadores.departamentoId, atendimentoDepartamentos.id))
        .where(input?.departamentoId ? eq(atendimentoOperadores.departamentoId, input.departamentoId) : undefined)
        .orderBy(asc(users.name));
      return rows;
    }),

  atualizarStatusOperador: protectedProcedure
    .input(z.object({
      status: z.enum(["online", "offline", "ausente", "ocupado"]),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const userId = ctx.user.id;
      // Buscar operador atual
      const [op] = await db.select().from(atendimentoOperadores)
        .where(eq(atendimentoOperadores.userId, userId))
        .limit(1);

      if (!op) {
        // Criar registro de operador se não existir
        await db.insert(atendimentoOperadores).values({
          userId,
          departamentoId: 1,
          status: input.status,
          ultimaAtividade: new Date(),
        });
      } else {
        // Log de mudança de status
        await db.insert(atendimentoStatusLog).values({
          operadorId: userId,
          statusAnterior: op.status,
          statusNovo: input.status,
          motivo: input.motivo,
        });
        await db.update(atendimentoOperadores)
          .set({ status: input.status, ultimaAtividade: new Date() })
          .where(eq(atendimentoOperadores.userId, userId));
      }
      return { ok: true, status: input.status };
    }),

  meuStatusOperador: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const [op] = await db.select().from(atendimentoOperadores)
      .where(eq(atendimentoOperadores.userId, ctx.user.id))
      .limit(1);
    return op ?? null;
  }),

  vincularOperadorDepartamento: protectedProcedure
    .input(z.object({
      userId: z.number(),
      departamentoId: z.number(),
      limiteChats: z.number().default(5),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      // Verificar se já existe
      const [existe] = await db.select().from(atendimentoOperadores)
        .where(and(
          eq(atendimentoOperadores.userId, input.userId),
          eq(atendimentoOperadores.departamentoId, input.departamentoId)
        )).limit(1);

      if (existe) {
        await db.update(atendimentoOperadores)
          .set({ limiteChats: input.limiteChats })
          .where(eq(atendimentoOperadores.id, existe.id));
      } else {
        await db.insert(atendimentoOperadores).values(input);
      }
      return { ok: true };
    }),

  // ── Etiquetas ──────────────────────────────────────────────────────────────

  listarEtiquetas: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(atendimentoEtiquetas)
      .where(eq(atendimentoEtiquetas.ativo, 1))
      .orderBy(asc(atendimentoEtiquetas.nome));
  }),

  criarEtiqueta: protectedProcedure
    .input(z.object({
      nome: z.string().min(1),
      cor: z.string().default("#22c55e"),
      descricao: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      const [result] = await db.insert(atendimentoEtiquetas).values(input);
      return { id: (result as any).insertId };
    }),

  // ── Mensagens Rápidas ──────────────────────────────────────────────────────

  listarMensagensRapidas: protectedProcedure
    .input(z.object({
      departamentoId: z.number().optional(),
      busca: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const rows = await db.select().from(atendimentoMensagensRapidas)
        .where(and(
          eq(atendimentoMensagensRapidas.ativo, 1),
          input?.departamentoId
            ? or(
                eq(atendimentoMensagensRapidas.departamentoId, input.departamentoId),
                isNull(atendimentoMensagensRapidas.departamentoId)
              )
            : undefined,
          input?.busca
            ? or(
                like(atendimentoMensagensRapidas.atalho, `%${input.busca}%`),
                like(atendimentoMensagensRapidas.titulo, `%${input.busca}%`)
              )
            : undefined,
        ))
        .orderBy(asc(atendimentoMensagensRapidas.atalho));
      return rows;
    }),

  criarMensagemRapida: protectedProcedure
    .input(z.object({
      titulo: z.string().min(1),
      atalho: z.string().min(1),
      conteudo: z.string().min(1),
      departamentoId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const [result] = await db.insert(atendimentoMensagensRapidas).values({
        ...input,
        criadoPorId: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  atualizarMensagemRapida: protectedProcedure
    .input(z.object({
      id: z.number(),
      titulo: z.string().optional(),
      atalho: z.string().optional(),
      conteudo: z.string().optional(),
      ativo: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      const { id, ...data } = input;
      await db.update(atendimentoMensagensRapidas).set(data)
        .where(eq(atendimentoMensagensRapidas.id, id));
      return { ok: true };
    }),

  // ── Atendimentos ───────────────────────────────────────────────────────────

  // Criar ou recuperar atendimento para uma conversa
  abrirAtendimento: protectedProcedure
    .input(z.object({
      conversaId: z.number(),
      departamentoId: z.number().optional(),
      prioridade: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
      devedorId: z.number().optional(),
      cobrancaId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      // Verificar se já existe atendimento aberto para essa conversa
      const [existente] = await db.select().from(atendimentos)
        .where(and(
          eq(atendimentos.conversaId, input.conversaId),
          or(
            eq(atendimentos.status, "aguardando"),
            eq(atendimentos.status, "em_atendimento"),
            eq(atendimentos.status, "transferido"),
          )
        )).limit(1);

      if (existente) return existente;

      // Buscar SLA do departamento
      let slaMinutos = 60;
      if (input.departamentoId) {
        const [dep] = await db.select().from(atendimentoDepartamentos)
          .where(eq(atendimentoDepartamentos.id, input.departamentoId)).limit(1);
        if (dep) slaMinutos = dep.slaMinutos;
      }

      // Tentar distribuição automática
      let operadorId: number | null = null;
      if (input.departamentoId) {
        const [dep] = await db.select().from(atendimentoDepartamentos)
          .where(eq(atendimentoDepartamentos.id, input.departamentoId)).limit(1);

        if (dep?.distribuicaoAutomatica) {
          // Buscar operador online com menor carga
          const ops = await db.select().from(atendimentoOperadores)
            .where(and(
              eq(atendimentoOperadores.departamentoId, input.departamentoId),
              eq(atendimentoOperadores.status, "online"),
              sql`${atendimentoOperadores.chatsAtivos} < ${atendimentoOperadores.limiteChats}`
            ))
            .orderBy(asc(atendimentoOperadores.chatsAtivos))
            .limit(1);

          if (ops.length > 0) {
            operadorId = ops[0].userId;
            // Incrementar chats ativos
            await db.update(atendimentoOperadores)
              .set({ chatsAtivos: sql`${atendimentoOperadores.chatsAtivos} + 1` })
              .where(eq(atendimentoOperadores.id, ops[0].id));
          }
        }
      }

      const protocolo = gerarProtocolo();
      const slaLimite = calcularSlaLimite(slaMinutos);

      const [result] = await db.insert(atendimentos).values({
        conversaId: input.conversaId,
        departamentoId: input.departamentoId,
        operadorId,
        devedorId: input.devedorId,
        cobrancaId: input.cobrancaId,
        protocolo,
        status: operadorId ? "em_atendimento" : "aguardando",
        prioridade: input.prioridade,
        slaLimite,
        atendidoEm: operadorId ? new Date() : null,
      });

      return { id: (result as any).insertId, protocolo, operadorId, status: operadorId ? "em_atendimento" : "aguardando" };
    }),

  // Fila de atendimento (aguardando)
  filaAtendimento: protectedProcedure
    .input(z.object({ departamentoId: z.number().optional() }).optional())
    .query(async ({ input }) => {
    const db = (await getDb())!;
      const rows = await db
        .select({
          id: atendimentos.id,
          protocolo: atendimentos.protocolo,
          status: atendimentos.status,
          prioridade: atendimentos.prioridade,
          slaLimite: atendimentos.slaLimite,
          slaViolado: atendimentos.slaViolado,
          iniciadoEm: atendimentos.iniciadoEm,
          conversaId: atendimentos.conversaId,
          departamentoId: atendimentos.departamentoId,
          devedorId: atendimentos.devedorId,
          telefone: whatsappConversas.telefone,
          nomeContato: whatsappConversas.nomeContato,
          departamentoNome: atendimentoDepartamentos.nome,
          departamentoCor: atendimentoDepartamentos.cor,
          devedorNome: devedores.name,
        })
        .from(atendimentos)
        .leftJoin(whatsappConversas, eq(atendimentos.conversaId, whatsappConversas.id))
        .leftJoin(atendimentoDepartamentos, eq(atendimentos.departamentoId, atendimentoDepartamentos.id))
        .leftJoin(devedores, eq(atendimentos.devedorId, devedores.id))
        .where(and(
          eq(atendimentos.status, "aguardando"),
          input?.departamentoId ? eq(atendimentos.departamentoId, input.departamentoId) : undefined,
        ))
        .orderBy(
          desc(sql`FIELD(${atendimentos.prioridade}, 'urgente', 'alta', 'normal', 'baixa')`),
          asc(atendimentos.iniciadoEm)
        );
      return rows;
    }),

  // Meus atendimentos ativos (do operador logado)
  meusAtendimentos: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db
      .select({
        id: atendimentos.id,
        protocolo: atendimentos.protocolo,
        status: atendimentos.status,
        prioridade: atendimentos.prioridade,
        slaLimite: atendimentos.slaLimite,
        slaViolado: atendimentos.slaViolado,
        iniciadoEm: atendimentos.iniciadoEm,
        atendidoEm: atendimentos.atendidoEm,
        conversaId: atendimentos.conversaId,
        departamentoId: atendimentos.departamentoId,
        devedorId: atendimentos.devedorId,
        cobrancaId: atendimentos.cobrancaId,
        telefone: whatsappConversas.telefone,
        nomeContato: whatsappConversas.nomeContato,
        ultimaMensagem: whatsappConversas.ultimaMensagem,
        naoLidas: whatsappConversas.naoLidas,
        departamentoNome: atendimentoDepartamentos.nome,
        departamentoCor: atendimentoDepartamentos.cor,
        devedorNome: devedores.name,
      })
      .from(atendimentos)
      .leftJoin(whatsappConversas, eq(atendimentos.conversaId, whatsappConversas.id))
      .leftJoin(atendimentoDepartamentos, eq(atendimentos.departamentoId, atendimentoDepartamentos.id))
      .leftJoin(devedores, eq(atendimentos.devedorId, devedores.id))
      .where(and(
        eq(atendimentos.operadorId, ctx.user.id),
        or(
          eq(atendimentos.status, "em_atendimento"),
          eq(atendimentos.status, "transferido"),
        )
      ))
      .orderBy(desc(atendimentos.updatedAt));
    return rows;
  }),

  // Assumir atendimento da fila
  assumirAtendimento: protectedProcedure
    .input(z.object({ atendimentoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const [atend] = await db.select().from(atendimentos)
        .where(eq(atendimentos.id, input.atendimentoId)).limit(1);
      if (!atend) throw new TRPCError({ code: "NOT_FOUND" });

      const tempoEspera = Math.floor((Date.now() - new Date(atend.iniciadoEm).getTime()) / 1000);

      const updateResult = await db.update(atendimentos).set({
        operadorId: ctx.user.id,
        status: "em_atendimento",
        atendidoEm: new Date(),
        tempoEspera,
      }).where(eq(atendimentos.id, input.atendimentoId));

      // Incrementar chats ativos do operador
      await db.update(atendimentoOperadores)
        .set({ chatsAtivos: sql`${atendimentoOperadores.chatsAtivos} + 1` })
        .where(eq(atendimentoOperadores.userId, ctx.user.id));

      return { ok: true, atendimentoId: input.atendimentoId };
    }),

  // Transferir atendimento
  transferirAtendimento: protectedProcedure
    .input(z.object({
      atendimentoId: z.number(),
      paraOperadorId: z.number().optional(),
      paraDepartamentoId: z.number().optional(),
      motivo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const [atend] = await db.select().from(atendimentos)
        .where(eq(atendimentos.id, input.atendimentoId)).limit(1);
      if (!atend) throw new TRPCError({ code: "NOT_FOUND" });

      // Registrar transferência
      await db.insert(atendimentoTransferencias).values({
        atendimentoId: input.atendimentoId,
        deOperadorId: atend.operadorId,
        paraOperadorId: input.paraOperadorId ?? null,
        paraDepartamentoId: input.paraDepartamentoId ?? null,
        motivo: input.motivo,
        transferidoPorId: ctx.user.id,
      });

      // Decrementar chats do operador atual
      if (atend.operadorId) {
        await db.update(atendimentoOperadores)
          .set({ chatsAtivos: sql`GREATEST(${atendimentoOperadores.chatsAtivos} - 1, 0)` })
          .where(eq(atendimentoOperadores.userId, atend.operadorId));
      }

      // Atualizar atendimento
      const novoStatus = input.paraOperadorId ? "em_atendimento" : "transferido";
      await db.update(atendimentos).set({
        operadorId: input.paraOperadorId ?? null,
        departamentoId: input.paraDepartamentoId ?? atend.departamentoId,
        status: novoStatus,
      }).where(eq(atendimentos.id, input.atendimentoId));

      // Incrementar chats do novo operador
      if (input.paraOperadorId) {
        await db.update(atendimentoOperadores)
          .set({ chatsAtivos: sql`${atendimentoOperadores.chatsAtivos} + 1` })
          .where(eq(atendimentoOperadores.userId, input.paraOperadorId));
      }

      return { ok: true };
    }),

  // Finalizar atendimento
  finalizarAtendimento: protectedProcedure
    .input(z.object({
      atendimentoId: z.number(),
      motivo: z.string().optional(),
      status: z.enum(["resolvido", "abandonado"]).default("resolvido"),
    }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const [atend] = await db.select().from(atendimentos)
        .where(eq(atendimentos.id, input.atendimentoId)).limit(1);
      if (!atend) throw new TRPCError({ code: "NOT_FOUND" });

      const tempoAtendimento = atend.atendidoEm
        ? Math.floor((Date.now() - new Date(atend.atendidoEm).getTime()) / 1000)
        : null;

      await db.update(atendimentos).set({
        status: input.status,
        resolvidoEm: new Date(),
        motivoFechamento: input.motivo,
        tempoAtendimento,
      }).where(eq(atendimentos.id, input.atendimentoId));

      // Decrementar chats ativos
      if (atend.operadorId) {
        await db.update(atendimentoOperadores)
          .set({ chatsAtivos: sql`GREATEST(${atendimentoOperadores.chatsAtivos} - 1, 0)` })
          .where(eq(atendimentoOperadores.userId, atend.operadorId));
      }

      // Fechar conversa WhatsApp
      await db.update(whatsappConversas)
        .set({ status: "fechada" })
        .where(eq(whatsappConversas.id, atend.conversaId));

      return { ok: true };
    }),

  // Atualizar prioridade
  atualizarPrioridade: protectedProcedure
    .input(z.object({
      atendimentoId: z.number(),
      prioridade: z.enum(["baixa", "normal", "alta", "urgente"]),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      await db.update(atendimentos)
        .set({ prioridade: input.prioridade })
        .where(eq(atendimentos.id, input.atendimentoId));
      return { ok: true };
    }),

  // Buscar atendimento por conversa
  atendimentoPorConversa: protectedProcedure
    .input(z.object({ conversaId: z.number() }))
    .query(async ({ input }) => {
    const db = (await getDb())!;
      const [atend] = await db
        .select({
          id: atendimentos.id,
          protocolo: atendimentos.protocolo,
          status: atendimentos.status,
          prioridade: atendimentos.prioridade,
          slaLimite: atendimentos.slaLimite,
          slaViolado: atendimentos.slaViolado,
          iniciadoEm: atendimentos.iniciadoEm,
          atendidoEm: atendimentos.atendidoEm,
          resolvidoEm: atendimentos.resolvidoEm,
          operadorId: atendimentos.operadorId,
          departamentoId: atendimentos.departamentoId,
          devedorId: atendimentos.devedorId,
          cobrancaId: atendimentos.cobrancaId,
          tempoEspera: atendimentos.tempoEspera,
          tempoAtendimento: atendimentos.tempoAtendimento,
          departamentoNome: atendimentoDepartamentos.nome,
          departamentoCor: atendimentoDepartamentos.cor,
          operadorNome: users.name,
          devedorNome: devedores.name,
        })
        .from(atendimentos)
        .leftJoin(atendimentoDepartamentos, eq(atendimentos.departamentoId, atendimentoDepartamentos.id))
        .leftJoin(users, eq(atendimentos.operadorId, users.id))
        .leftJoin(devedores, eq(atendimentos.devedorId, devedores.id))
        .where(and(
          eq(atendimentos.conversaId, input.conversaId),
          or(
            eq(atendimentos.status, "aguardando"),
            eq(atendimentos.status, "em_atendimento"),
            eq(atendimentos.status, "transferido"),
          )
        ))
        .limit(1);
      return atend ?? null;
    }),

  // ── Etiquetas em atendimentos ──────────────────────────────────────────────

  aplicarEtiqueta: protectedProcedure
    .input(z.object({ atendimentoId: z.number(), etiquetaId: z.number() }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      // Evitar duplicata
      const [existe] = await db.select().from(atendimentoEtiquetasAplicadas)
        .where(and(
          eq(atendimentoEtiquetasAplicadas.atendimentoId, input.atendimentoId),
          eq(atendimentoEtiquetasAplicadas.etiquetaId, input.etiquetaId)
        )).limit(1);
      if (!existe) {
        await db.insert(atendimentoEtiquetasAplicadas).values({
          ...input,
          aplicadoPorId: ctx.user.id,
        });
      }
      return { ok: true };
    }),

  removerEtiqueta: protectedProcedure
    .input(z.object({ atendimentoId: z.number(), etiquetaId: z.number() }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      await db.delete(atendimentoEtiquetasAplicadas)
        .where(and(
          eq(atendimentoEtiquetasAplicadas.atendimentoId, input.atendimentoId),
          eq(atendimentoEtiquetasAplicadas.etiquetaId, input.etiquetaId)
        ));
      return { ok: true };
    }),

  etiquetasDoAtendimento: protectedProcedure
    .input(z.object({ atendimentoId: z.number() }))
    .query(async ({ input }) => {
    const db = (await getDb())!;
      return db
        .select({
          id: atendimentoEtiquetas.id,
          nome: atendimentoEtiquetas.nome,
          cor: atendimentoEtiquetas.cor,
        })
        .from(atendimentoEtiquetasAplicadas)
        .innerJoin(atendimentoEtiquetas, eq(atendimentoEtiquetasAplicadas.etiquetaId, atendimentoEtiquetas.id))
        .where(eq(atendimentoEtiquetasAplicadas.atendimentoId, input.atendimentoId));
    }),

  // ── Notas internas ─────────────────────────────────────────────────────────

  listarNotas: protectedProcedure
    .input(z.object({ atendimentoId: z.number() }))
    .query(async ({ input }) => {
    const db = (await getDb())!;
      return db
        .select({
          id: atendimentoNotas.id,
          conteudo: atendimentoNotas.conteudo,
          createdAt: atendimentoNotas.createdAt,
          updatedAt: atendimentoNotas.updatedAt,
          autorNome: users.name,
          autorId: atendimentoNotas.autorId,
        })
        .from(atendimentoNotas)
        .leftJoin(users, eq(atendimentoNotas.autorId, users.id))
        .where(eq(atendimentoNotas.atendimentoId, input.atendimentoId))
        .orderBy(asc(atendimentoNotas.createdAt));
    }),

  criarNota: protectedProcedure
    .input(z.object({
      atendimentoId: z.number(),
      conteudo: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      const [result] = await db.insert(atendimentoNotas).values({
        ...input,
        autorId: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  editarNota: protectedProcedure
    .input(z.object({ id: z.number(), conteudo: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      await db.update(atendimentoNotas)
        .set({ conteudo: input.conteudo })
        .where(and(
          eq(atendimentoNotas.id, input.id),
          eq(atendimentoNotas.autorId, ctx.user.id) // só o autor pode editar
        ));
      return { ok: true };
    }),

  excluirNota: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
      await db.delete(atendimentoNotas)
        .where(and(
          eq(atendimentoNotas.id, input.id),
          eq(atendimentoNotas.autorId, ctx.user.id)
        ));
      return { ok: true };
    }),

  // ── Avaliações ─────────────────────────────────────────────────────────────

  registrarAvaliacao: protectedProcedure
    .input(z.object({
      atendimentoId: z.number(),
      nota: z.number().min(1).max(5),
      comentario: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
    const db = (await getDb())!;
      const [result] = await db.insert(atendimentoAvaliacoes).values(input);
      return { id: (result as any).insertId };
    }),

  // ── Supervisão em tempo real ───────────────────────────────────────────────

  painelSupervisao: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    // Operadores com status
    const operadores = await db
      .select({
        userId: atendimentoOperadores.userId,
        status: atendimentoOperadores.status,
        chatsAtivos: atendimentoOperadores.chatsAtivos,
        limiteChats: atendimentoOperadores.limiteChats,
        ultimaAtividade: atendimentoOperadores.ultimaAtividade,
        nome: users.name,
        departamentoId: atendimentoOperadores.departamentoId,
        departamentoNome: atendimentoDepartamentos.nome,
      })
      .from(atendimentoOperadores)
      .leftJoin(users, eq(atendimentoOperadores.userId, users.id))
      .leftJoin(atendimentoDepartamentos, eq(atendimentoOperadores.departamentoId, atendimentoDepartamentos.id))
      .orderBy(asc(users.name));

    // Contadores por status
    const [totais] = await db
      .select({
        aguardando: sql<number>`SUM(CASE WHEN ${atendimentos.status} = 'aguardando' THEN 1 ELSE 0 END)`,
        emAtendimento: sql<number>`SUM(CASE WHEN ${atendimentos.status} = 'em_atendimento' THEN 1 ELSE 0 END)`,
        slaViolados: sql<number>`SUM(CASE WHEN ${atendimentos.slaViolado} = 1 AND ${atendimentos.status} != 'resolvido' THEN 1 ELSE 0 END)`,
        resolvidosHoje: sql<number>`SUM(CASE WHEN ${atendimentos.status} = 'resolvido' AND DATE(${atendimentos.resolvidoEm}) = CURDATE() THEN 1 ELSE 0 END)`,
      })
      .from(atendimentos);

    // Atendimentos em andamento com detalhes
    const emAndamento = await db
      .select({
        id: atendimentos.id,
        protocolo: atendimentos.protocolo,
        status: atendimentos.status,
        prioridade: atendimentos.prioridade,
        slaLimite: atendimentos.slaLimite,
        slaViolado: atendimentos.slaViolado,
        iniciadoEm: atendimentos.iniciadoEm,
        atendidoEm: atendimentos.atendidoEm,
        nomeContato: whatsappConversas.nomeContato,
        telefone: whatsappConversas.telefone,
        operadorNome: users.name,
        departamentoNome: atendimentoDepartamentos.nome,
        departamentoCor: atendimentoDepartamentos.cor,
      })
      .from(atendimentos)
      .leftJoin(whatsappConversas, eq(atendimentos.conversaId, whatsappConversas.id))
      .leftJoin(users, eq(atendimentos.operadorId, users.id))
      .leftJoin(atendimentoDepartamentos, eq(atendimentos.departamentoId, atendimentoDepartamentos.id))
      .where(or(
        eq(atendimentos.status, "aguardando"),
        eq(atendimentos.status, "em_atendimento"),
        eq(atendimentos.status, "transferido"),
      ))
      .orderBy(asc(atendimentos.iniciadoEm))
      .limit(50);

    return { operadores, totais, emAndamento };
  }),

  // ── Histórico consolidado ──────────────────────────────────────────────────

  historicoAtendimentos: protectedProcedure
    .input(z.object({
      devedorId: z.number().optional(),
      telefone: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
    const db = (await getDb())!;
      const offset = (input.page - 1) * input.limit;

      const rows = await db
        .select({
          id: atendimentos.id,
          protocolo: atendimentos.protocolo,
          status: atendimentos.status,
          prioridade: atendimentos.prioridade,
          iniciadoEm: atendimentos.iniciadoEm,
          resolvidoEm: atendimentos.resolvidoEm,
          tempoEspera: atendimentos.tempoEspera,
          tempoAtendimento: atendimentos.tempoAtendimento,
          motivoFechamento: atendimentos.motivoFechamento,
          nomeContato: whatsappConversas.nomeContato,
          telefone: whatsappConversas.telefone,
          operadorNome: users.name,
          departamentoNome: atendimentoDepartamentos.nome,
          devedorNome: devedores.name,
        })
        .from(atendimentos)
        .leftJoin(whatsappConversas, eq(atendimentos.conversaId, whatsappConversas.id))
        .leftJoin(users, eq(atendimentos.operadorId, users.id))
        .leftJoin(atendimentoDepartamentos, eq(atendimentos.departamentoId, atendimentoDepartamentos.id))
        .leftJoin(devedores, eq(atendimentos.devedorId, devedores.id))
        .where(and(
          input.devedorId ? eq(atendimentos.devedorId, input.devedorId) : undefined,
          input.telefone ? eq(whatsappConversas.telefone, input.telefone) : undefined,
        ))
        .orderBy(desc(atendimentos.iniciadoEm))
        .limit(input.limit)
        .offset(offset);

      return rows;
    }),

  // ── Integração Devedor ↔ WhatsApp ─────────────────────────────────────────

  // Inicia um atendimento a partir do perfil do devedor
  // Busca ou cria a conversa WhatsApp e cria um atendimento em_atendimento vinculado
  iniciarAtendimentoDevedor: protectedProcedure
    .input(z.object({
      devedorId: z.number(),
      instanciaId: z.number(),
      telefone: z.string(), // formato: 5521999999999
      departamentoId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = (await getDb())!;

      // 1. Buscar dados do devedor
      const [devedor] = await db.select().from(devedores).where(eq(devedores.id, input.devedorId)).limit(1);
      if (!devedor) throw new TRPCError({ code: "NOT_FOUND", message: "Devedor não encontrado" });

      // 2. Buscar ou criar conversa WhatsApp para esse telefone + instância
      let [conversa] = await db.select().from(whatsappConversas)
        .where(and(
          eq(whatsappConversas.instanciaId, input.instanciaId),
          eq(whatsappConversas.telefone, input.telefone),
        ))
        .limit(1);

      if (!conversa) {
        const [inserted] = await db.insert(whatsappConversas).values({
          instanciaId: input.instanciaId,
          telefone: input.telefone,
          nomeContato: devedor.name,
          devedorId: input.devedorId,
          status: "aberta",
        });
        const insertId = (inserted as any).insertId;
        const [nova] = await db.select().from(whatsappConversas).where(eq(whatsappConversas.id, insertId)).limit(1);
        conversa = nova;
      } else {
        // Garantir que o devedorId está vinculado
        if (!conversa.devedorId) {
          await db.update(whatsappConversas)
            .set({ devedorId: input.devedorId })
            .where(eq(whatsappConversas.id, conversa.id));
        }
      }

      // 3. Verificar se já existe atendimento ativo para essa conversa
      const [atendimentoAtivo] = await db.select().from(atendimentos)
        .where(and(
          eq(atendimentos.conversaId, conversa.id),
          or(
            eq(atendimentos.status, "aguardando"),
            eq(atendimentos.status, "em_atendimento"),
          )
        ))
        .limit(1);

      if (atendimentoAtivo) {
        // Retorna o atendimento existente
        return { atendimentoId: atendimentoAtivo.id, conversaId: conversa.id, novo: false };
      }

      // 4. Criar novo atendimento já em_atendimento (operador iniciou)
      const protocolo = gerarProtocolo();
      const slaLimite = calcularSlaLimite(input.departamentoId ? 60 : 60);

      const [insertResult] = await db.insert(atendimentos).values({
        conversaId: conversa.id,
        devedorId: input.devedorId,
        operadorId: ctx.user.id,
        departamentoId: input.departamentoId ?? null,
        protocolo,
        status: "em_atendimento",
        prioridade: "normal",
        slaLimite,
        slaViolado: 0,
        iniciadoEm: new Date(),
        atendidoEm: new Date(),
        tempoEspera: 0,
      });

      const novoId = (insertResult as any).insertId;

      // 5. Registrar operador como ativo se não existir
      const [opExiste] = await db.select().from(atendimentoOperadores)
        .where(eq(atendimentoOperadores.userId, ctx.user.id))
        .limit(1);
      if (!opExiste) {
        await db.insert(atendimentoOperadores).values({
          userId: ctx.user.id,
          departamentoId: input.departamentoId ?? 0,
          status: "online",
          chatsAtivos: 1,
          limiteChats: 10,
        });
      } else {
        await db.update(atendimentoOperadores)
          .set({ chatsAtivos: sql`${atendimentoOperadores.chatsAtivos} + 1` })
          .where(eq(atendimentoOperadores.userId, ctx.user.id));
      }

      return { atendimentoId: novoId, conversaId: conversa.id, novo: true };
    }),

  // Lista histórico de atendimentos de um devedor específico
  listarAtendimentosDevedor: protectedProcedure
    .input(z.object({ devedorId: z.number() }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const rows = await db
        .select({
          id: atendimentos.id,
          protocolo: atendimentos.protocolo,
          status: atendimentos.status,
          prioridade: atendimentos.prioridade,
          iniciadoEm: atendimentos.iniciadoEm,
          atendidoEm: atendimentos.atendidoEm,
          resolvidoEm: atendimentos.resolvidoEm,
          tempoEspera: atendimentos.tempoEspera,
          tempoAtendimento: atendimentos.tempoAtendimento,
          motivoFechamento: atendimentos.motivoFechamento,
          slaViolado: atendimentos.slaViolado,
          telefone: whatsappConversas.telefone,
          nomeContato: whatsappConversas.nomeContato,
          operadorNome: users.name,
          departamentoNome: atendimentoDepartamentos.nome,
          departamentoCor: atendimentoDepartamentos.cor,
        })
        .from(atendimentos)
        .leftJoin(whatsappConversas, eq(atendimentos.conversaId, whatsappConversas.id))
        .leftJoin(users, eq(atendimentos.operadorId, users.id))
        .leftJoin(atendimentoDepartamentos, eq(atendimentos.departamentoId, atendimentoDepartamentos.id))
        .where(eq(atendimentos.devedorId, input.devedorId))
        .orderBy(desc(atendimentos.iniciadoEm))
        .limit(50);
      return rows;
    }),

  // Verificar e marcar SLAs violados (chamado periodicamente)
  verificarSlas: protectedProcedure.mutation(async () => {
    const db = (await getDb())!;
    const agora = new Date();
    await db.update(atendimentos)
      .set({ slaViolado: 1 })
      .where(and(
        sql`${atendimentos.slaLimite} < ${agora}`,
        eq(atendimentos.slaViolado, 0),
        or(
          eq(atendimentos.status, "aguardando"),
          eq(atendimentos.status, "em_atendimento"),
        )
      ));
    return { ok: true };
  }),
});
