import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { tarefaComentarios, users, type TarefaDemanda, type User } from "../../drizzle/schema";
import { TAREFA_ACOES, TAREFA_PRAZO_FILTROS, TAREFA_PRIORIDADES, TAREFA_STATUS, type TarefaAcao } from "../../shared/juridico-tarefas";
import { assertDemandaAccess, assertTarefaAccess } from "../juridico-access";
import { alterarTarefa, criarTarefa, listarResponsaveis, nomeUsuario, responsavelServidor,
  revisoresNotificaveis, tarefaCapacidades, tarefasDb, type TarefaAccess } from "../juridico-tarefas";
import { acaoParaStatus, exigirGestao, transicaoTarefa } from "../juridico-tarefas-transicoes";
import { consultarCentral, consultarNotificacoes, contarDemandas, detalheTarefa, historicoTarefa,
  lerNotificacao, listarDaDemanda, totalCentral } from "../juridico-tarefas-consultas";

const id = z.number().int().positive();
const versao = z.number().int().positive().optional();
const texto = z.string().trim().max(10000).optional();
const data = z.string().refine(value => value.length > 0 && !Number.isNaN(new Date(value).getTime()), "Data inválida.");
const flag = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform(value => value === true || value === 1 ? 1 : 0);
const paginacao = { limit: z.number().int().min(1).max(200).default(100), offset: z.number().int().min(0).default(0) };
const filtros = {
  status: z.enum([...TAREFA_STATUS, "todas"]).default("todas"),
  prioridade: z.enum([...TAREFA_PRIORIDADES, "todas"]).default("todas"),
  condominioId: id.optional(), demandaId: id.optional(), prazo: z.enum(TAREFA_PRAZO_FILTROS).default("todas"),
};
const mutationOk = { ok: true as const };

async function notificacaoDaAcao(acao: TarefaAcao, access: TarefaAccess, tarefa: TarefaDemanda) {
  if (acao === "entregar") return { notificacaoTipo: "entrega", destinatarios: (await revisoresNotificaveis(access.demanda)).filter(id => id !== tarefa.responsavelId) };
  if (acao === "devolver") return { notificacaoTipo: "devolucao", destinatarios: tarefa.responsavelId == null ? [] : [tarefa.responsavelId] };
  return {};
}
async function executar(actor: User, input: { id: number; acao: TarefaAcao; texto?: string; versao?: number }) {
  return alterarTarefa(actor, input.id, input.versao, async (_tx, tarefa, access) => {
    const patch = transicaoTarefa(tarefa, input.acao, tarefaCapacidades(access), input.texto);
    return { patch, tipo: input.acao, descricao: input.texto?.trim() || `Ação: ${input.acao}.`, resultado: mutationOk,
      ...await notificacaoDaAcao(input.acao, access, tarefa) };
  }, input.acao === "aprovar" || input.acao === "devolver" ? "aprovar" : "editar");
}

export const tarefasDemandaRouter = router({
  listar: protectedProcedure.input(z.object({ demandaId: id }))
    .query(({ ctx, input }) => listarDaDemanda(ctx.user, input.demandaId)),
  contadores: protectedProcedure.input(z.object({ demandaId: id })).query(async ({ ctx, input }) => {
    await assertDemandaAccess(ctx.user, input.demandaId, "visualizar", true);
    const [row] = await contarDemandas(ctx.user, [input.demandaId]);
    if (!row) return { total: 0, concluidas: 0, pendentes: 0, emRevisao: 0, bloqueadas: 0 };
    const { demandaId: _id, ...result } = row;
    return result;
  }),
  contadoresLote: protectedProcedure.input(z.object({ demandaIds: z.array(id).max(200) }))
    .query(({ ctx, input }) => contarDemandas(ctx.user, input.demandaIds)),
  getById: protectedProcedure.input(z.object({ id })).query(({ ctx, input }) => detalheTarefa(ctx.user, input.id)),
  minhasTarefas: protectedProcedure.input(z.object(filtros).optional())
    .query(({ ctx, input }) => consultarCentral(ctx.user, input ?? {}, false)),
  listarEquipe: protectedProcedure.input(z.object({ ...filtros, responsavelId: id.optional(), ...paginacao }).optional())
    .query(async ({ ctx, input }) => {
      const options = input ?? { limit: 100, offset: 0, status: "todas" as const };
      const tarefas = await consultarCentral(ctx.user, options, true);
      const total = await totalCentral(ctx.user, options);
      return { tarefas, total, limit: options.limit, offset: options.offset };
    }),
  create: protectedProcedure.input(z.object({ demandaId: id, titulo: z.string().trim().min(1).max(255),
    descricao: z.string().max(10000).optional(), responsavelId: id.optional(), responsavelNome: z.string().max(255).optional(),
    prioridade: z.enum(TAREFA_PRIORIDADES).default("media"), prazo: data.optional(), exigeRevisao: flag.default(0),
  })).mutation(({ ctx, input }) => criarTarefa(ctx.user, input)),
  update: protectedProcedure.input(z.object({ id, titulo: z.string().trim().min(1).max(255).optional(),
    descricao: z.string().max(10000).nullable().optional(), responsavelId: id.nullable().optional(),
    responsavelNome: z.string().max(255).nullable().optional(), status: z.enum(TAREFA_STATUS).optional(),
    prioridade: z.enum(TAREFA_PRIORIDADES).optional(), prazo: data.nullable().optional(), exigeRevisao: flag.optional(), texto, versao,
  })).mutation(async ({ ctx, input }) => {
    // Status antigo que equivale a revisão usa permissão aprovar, não a edição gerencial.
    const snapshot = await assertTarefaAccess(ctx.user, input.id, "visualizar");
    const acao = input.status === undefined ? null : acaoParaStatus(snapshot.tarefa, input.status);
    const permissao = acao === "aprovar" || acao === "devolver" ? "aprovar" as const : "editar" as const;
    return alterarTarefa(ctx.user, input.id, input.versao ?? snapshot.tarefa.versao, async (_tx, tarefa, access) => {
      if (tarefa.status === "cancelada" && acao !== "reabrir") throw new TRPCError({ code: "BAD_REQUEST", message: "Reabra a tarefa cancelada antes de editar." });
      const cap = tarefaCapacidades(access);
      const gerenciamento = input.responsavelId !== undefined || input.responsavelNome !== undefined ||
        input.prazo !== undefined || input.prioridade !== undefined || input.exigeRevisao !== undefined;
      if (gerenciamento) exigirGestao(cap);
      const campos = input.titulo !== undefined || input.descricao !== undefined || gerenciamento;
      if (campos && cap.gerencia && !cap.canEdit) exigirGestao(cap);
      if (tarefa.status === "em_revisao" && (input.exigeRevisao !== undefined || input.responsavelId !== undefined)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Aprove ou devolva a entrega antes de alterar revisão ou responsável." });
      }
      const patch: Partial<TarefaDemanda> = {};
      if (input.titulo !== undefined) patch.titulo = input.titulo;
      if (input.descricao !== undefined) patch.descricao = input.descricao;
      if (input.prioridade !== undefined) patch.prioridade = input.prioridade;
      if (input.prazo !== undefined) patch.prazo = input.prazo ? new Date(input.prazo) : null;
      if (input.exigeRevisao !== undefined) {
        if (tarefa.status === "concluida") throw new TRPCError({ code: "BAD_REQUEST", message: "Reabra a tarefa para mudar a política de revisão." });
        patch.exigeRevisao = input.exigeRevisao;
      }
      if (input.responsavelId !== undefined) Object.assign(patch, input.responsavelId == null ?
        { responsavelId: null, responsavelNome: null } : await responsavelServidor(access.scope.actor, access.demanda, input.responsavelId));
      // Não confiar no nome informado; nomes livres legados são atualizados somente junto do ID elegível.
      let command: TarefaAcao | null = null;
      if (input.status !== undefined) {
        command = acaoParaStatus(tarefa, input.status);
        if (command) Object.assign(patch, transicaoTarefa({ ...tarefa, ...patch }, command, cap, input.texto));
      }
      if (!Object.keys(patch).length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma alteração válida informada." });
      const reatribuida = patch.responsavelId !== undefined && patch.responsavelId !== tarefa.responsavelId;
      const notification = reatribuida ? { notificacaoTipo: "atribuicao", destinatarios: patch.responsavelId == null ? [] : [patch.responsavelId] } :
        command ? await notificacaoDaAcao(command, access, tarefa) : {};
      return { patch, tipo: reatribuida ? "reatribuicao" : command ?? "alteracao", descricao: input.texto?.trim() || "Tarefa atualizada.",
        resultado: mutationOk, ...notification };
    }, permissao);
  }),
  comando: protectedProcedure.input(z.object({ id, acao: z.enum(TAREFA_ACOES), texto, versao }))
    .mutation(({ ctx, input }) => executar(ctx.user, input)),
  moverStatus: protectedProcedure.input(z.object({ id, status: z.enum(TAREFA_STATUS), texto, versao }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertTarefaAccess(ctx.user, input.id, "visualizar");
      const acao = acaoParaStatus(access.tarefa, input.status);
      if (!acao) {
        // Revalidação e CAS mesmo se o drag não altera o estado.
        return alterarTarefa(ctx.user, input.id, input.versao ?? access.tarefa.versao, async () => ({ tipo: "alteracao", descricao: "Estado mantido.", resultado: mutationOk }));
      }
      return executar(ctx.user, { ...input, versao: input.versao ?? access.tarefa.versao, acao });
    }),
  delete: protectedProcedure.input(z.object({ id, texto, versao }))
    .mutation(({ ctx, input }) => executar(ctx.user, { ...input, acao: "cancelar" })),
  getComentarios: protectedProcedure.input(z.object({ tarefaId: id })).query(async ({ ctx, input }) => {
    await assertTarefaAccess(ctx.user, input.tarefaId, "visualizar");
    const db = await tarefasDb();
    return db.select().from(tarefaComentarios).where(and(eq(tarefaComentarios.tarefaId, input.tarefaId), eq(tarefaComentarios.oculto, 0)))
      .orderBy(asc(tarefaComentarios.createdAt), asc(tarefaComentarios.id));
  }),
  addComentario: protectedProcedure.input(z.object({ tarefaId: id, texto: z.string().trim().min(1).max(2000), versao }))
    .mutation(({ ctx, input }) => alterarTarefa(ctx.user, input.tarefaId, input.versao, async (tx, tarefa, access) => {
      if (tarefa.status === "cancelada") throw new TRPCError({ code: "BAD_REQUEST", message: "Reabra a tarefa cancelada antes de comentar." });
      const [autor] = await tx.select().from(users).where(eq(users.id, access.scope.actor.id)).limit(1);
      const [result] = await tx.insert(tarefaComentarios).values({ tarefaId: input.tarefaId, texto: input.texto,
        autorId: access.scope.actor.id, autorNome: autor ? nomeUsuario(autor) : "Usuário", oculto: 0 });
      return { tipo: "comentario", descricao: "Comentário adicionado.", resultado: { id: result.insertId },
        eventoAntes: null, eventoDepois: { comentarioId: result.insertId } };
    })),
  deleteComentario: protectedProcedure.input(z.object({ id, versao })).mutation(async ({ ctx, input }) => {
    const db = await tarefasDb();
    const [comentario] = await db.select().from(tarefaComentarios).where(eq(tarefaComentarios.id, input.id)).limit(1);
    if (!comentario) throw new TRPCError({ code: "NOT_FOUND", message: "Comentário não encontrado." });
    return alterarTarefa(ctx.user, comentario.tarefaId, input.versao, async (tx, _tarefa, access) => {
      const [atual] = await tx.select().from(tarefaComentarios).where(eq(tarefaComentarios.id, input.id)).limit(1).for("update");
      if (!atual || atual.oculto) throw new TRPCError({ code: "NOT_FOUND", message: "Comentário não encontrado." });
      if (atual.autorId !== access.scope.actor.id) exigirGestao(tarefaCapacidades(access));
      await tx.update(tarefaComentarios).set({ oculto: 1 }).where(eq(tarefaComentarios.id, input.id));
      return { tipo: "comentario_oculto", descricao: "Comentário ocultado; registro preservado.", resultado: mutationOk,
        eventoAntes: { comentarioId: atual.id, oculto: 0 }, eventoDepois: { comentarioId: atual.id, oculto: 1 } };
    });
  }),
  getHistorico: protectedProcedure.input(z.object({ tarefaId: id, ...paginacao }))
    .query(({ ctx, input }) => historicoTarefa(ctx.user, input.tarefaId, input.limit, input.offset)),
  responsaveisElegiveis: protectedProcedure.input(z.object({ demandaId: id }))
    .query(({ ctx, input }) => listarResponsaveis(ctx.user, input.demandaId)),
  notificacoes: protectedProcedure.input(z.object({ somenteNaoLidas: z.boolean().default(false), ...paginacao }).optional())
    .query(({ ctx, input }) => consultarNotificacoes(ctx.user, input ?? { somenteNaoLidas: false, limit: 100, offset: 0 })),
  marcarNotificacaoLida: protectedProcedure.input(z.object({ id })).mutation(({ ctx, input }) => lerNotificacao(ctx.user, input.id)),
});
