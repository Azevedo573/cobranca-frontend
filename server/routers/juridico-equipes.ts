import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { demandas, juridicoEquipes, juridicoEquipeMembros, profilePermissions, tarefasDemanda, timelineDemanda, users } from "../../drizzle/schema";
import { assertDemandaAccess, assertResponsavelElegivel, getJuridicoScope } from "../juridico-access";
import { logAudit } from "../audit";

const membroSchema = z.object({ userId: z.number().int().positive(), gestor: z.boolean().default(false) });
export function validarMembrosEquipe(membros: { userId: number; gestor: boolean }[]) {
  if (!membros.length || new Set(membros.map(m => m.userId)).size !== membros.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione membros sem duplicidade." });
  if (!membros.some(m => m.gestor)) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos um gestor da equipe." });
}

export const juridicoEquipesRouter = router({
  minhas: protectedProcedure.query(async ({ ctx }) => {
    const scope = await getJuridicoScope(ctx.user);
    const db = (await getDb())!;
    const equipes = await db.select({ id: juridicoEquipes.id, nome: juridicoEquipes.nome }).from(juridicoEquipes)
      .where(and(eq(juridicoEquipes.isActive, 1), scope.admin ? sql`1=1` : scope.equipeIds.length ? inArray(juridicoEquipes.id, scope.equipeIds) : sql`1=0`));
    return { equipes: equipes.map(e => ({ ...e, gestor: scope.admin || scope.gestorEquipeIds.includes(e.id) })), canManage: scope.canManage, canCreate: scope.canCreate, canEdit: scope.canEdit, canApprove: scope.canApprove };
  }),

  usuariosElegiveis: adminProcedure.query(async ({ ctx }) => {
    const scope = await getJuridicoScope(ctx.user);
    if (!scope.admin) throw new TRPCError({ code: "FORBIDDEN" });
    const db = (await getDb())!;
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users)
      .where(and(eq(users.isActive, 1), eq(users.isDeleted, 0), inArray(users.role, ["advogado", "colaborador", "admin"]), sql`(${users.role} = 'admin' OR EXISTS (SELECT 1 FROM ${profilePermissions} WHERE ${profilePermissions.profileId} = ${users.profileId} AND ${profilePermissions.modulo} = 'juridico_demandas' AND ${profilePermissions.acao} = 'visualizar' AND ${profilePermissions.permitido} = 1))`));
  }),

  listar: adminProcedure.query(async ({ ctx }) => {
    const scope = await getJuridicoScope(ctx.user);
    if (!scope.admin) throw new TRPCError({ code: "FORBIDDEN" });
    const db = (await getDb())!;
    const equipes = await db.select().from(juridicoEquipes).where(eq(juridicoEquipes.isActive, 1));
    const membros = await db.select({ equipeId: juridicoEquipeMembros.equipeId, userId: users.id, nome: users.name, email: users.email, role: users.role, gestor: juridicoEquipeMembros.gestor })
      .from(juridicoEquipeMembros).innerJoin(users, eq(users.id, juridicoEquipeMembros.userId))
      .where(and(eq(juridicoEquipeMembros.isActive, 1), eq(users.isActive, 1), eq(users.isDeleted, 0)));
    return equipes.map(e => ({ ...e, membros: membros.filter(m => m.equipeId === e.id).map(m => ({ ...m, gestor: m.gestor === 1 })) }));
  }),

  salvar: adminProcedure.input(z.object({ id: z.number().int().positive().optional(), nome: z.string().trim().min(2).max(120), membros: z.array(membroSchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const scope = await getJuridicoScope(ctx.user);
      if (!scope.admin) throw new TRPCError({ code: "FORBIDDEN" });
      validarMembrosEquipe(input.membros);
      const db = (await getDb())!;
      const rows = await db.select().from(users).where(inArray(users.id, input.membros.map(m => m.userId)));
      const permissions = await db.select().from(profilePermissions).where(inArray(profilePermissions.modulo, ["juridico_demandas", "juridico_equipe"]));
      for (const membro of input.membros) {
        const user = rows.find(u => u.id === membro.userId);
        if (!user || user.isActive !== 1 || user.isDeleted === 1 || !["advogado", "colaborador", "admin"].includes(user.role)) throw new TRPCError({ code: "BAD_REQUEST", message: "Membro inativo, excluído ou sem papel jurídico." });
        const can = (modulo: string) => user.role === "admin" || permissions.some(p => p.profileId === user.profileId && p.modulo === modulo && p.acao === "visualizar" && p.permitido === 1);
        if (!can("juridico_demandas") || (membro.gestor && !can("juridico_equipe"))) throw new TRPCError({ code: "BAD_REQUEST", message: `Configure o perfil jurídico${membro.gestor ? " de gestão" : " de execução"} de ${user.name ?? "este usuário"} antes de vinculá-lo.` });
      }
      const id = await db.transaction(async tx => {
        let equipeId = input.id;
        if (equipeId) {
          const [equipe] = await tx.select().from(juridicoEquipes).where(eq(juridicoEquipes.id, equipeId)).limit(1).for("update");
          if (!equipe || equipe.isActive !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "Equipe não encontrada." });
          await tx.update(juridicoEquipes).set({ nome: input.nome }).where(eq(juridicoEquipes.id, equipeId));
        } else {
          const ids = await tx.insert(juridicoEquipes).values({ nome: input.nome }).$returningId();
          equipeId = ids[0]?.id;
          if (!equipeId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível identificar a equipe criada." });
        }
        await tx.update(juridicoEquipeMembros).set({ isActive: 0 }).where(eq(juridicoEquipeMembros.equipeId, equipeId));
        await tx.insert(juridicoEquipeMembros).values(input.membros.map(m => ({ equipeId: equipeId!, userId: m.userId, gestor: m.gestor ? 1 : 0, isActive: 1 })))
          .onDuplicateKeyUpdate({ set: { isActive: 1, gestor: sql`VALUES(gestor)` } });
        return equipeId;
      });
      await logAudit(ctx, { action: "config_change", entity: "configuracao", entityId: String(id), entityLabel: "Equipe jurídica", afterData: { nome: input.nome, membros: input.membros } });
      return { id };
    }),

  vincularDemanda: protectedProcedure.input(z.object({ demandaId: z.number().int().positive(), equipeId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { demanda, scope } = await assertDemandaAccess(ctx.user, input.demandaId, "editar");
      if (!scope.admin && (!scope.canEdit || !scope.gestorEquipeIds.includes(input.equipeId))) throw new TRPCError({ code: "FORBIDDEN", message: "Só a gestão autorizada pode vincular a demanda à equipe." });
      const db = (await getDb())!;
      const [equipe] = await db.select().from(juridicoEquipes).where(and(eq(juridicoEquipes.id, input.equipeId), eq(juridicoEquipes.isActive, 1))).limit(1);
      if (!equipe) throw new TRPCError({ code: "NOT_FOUND", message: "Equipe não encontrada." });
      // Nenhum responsável atual pode ser transportado a equipe/carteira incompatível.
      await db.transaction(async tx => {
        const [atual] = await tx.select().from(demandas).where(eq(demandas.id, input.demandaId)).limit(1).for("update");
        if (!atual || atual.equipeId !== demanda.equipeId || atual.condominioId !== demanda.condominioId || atual.responsavelId !== demanda.responsavelId) throw new TRPCError({ code: "CONFLICT", message: "A demanda foi alterada. Atualize a tela." });
        const tarefas = await tx.select({ responsavelId: tarefasDemanda.responsavelId }).from(tarefasDemanda).where(eq(tarefasDemanda.demandaId, input.demandaId));
        const ids = Array.from(new Set([atual.responsavelId, ...tarefas.map(t => t.responsavelId)].filter((id): id is number => id !== null)));
        for (const id of ids) await assertResponsavelElegivel(ctx.user, { ...atual, equipeId: input.equipeId }, id);
        await tx.update(demandas).set({ equipeId: input.equipeId }).where(eq(demandas.id, input.demandaId));
        await tx.insert(timelineDemanda).values({ demandaId: input.demandaId, tipo: "outro", descricao: `Caso vinculado à equipe ${equipe.nome}`, usuarioId: ctx.user.id, usuarioNome: ctx.user.name });
      });
      await logAudit(ctx, { action: "config_change", entity: "configuracao", entityId: String(input.demandaId), entityLabel: "Equipe da demanda", condominioId: demanda.condominioId ?? undefined, beforeData: { equipeId: demanda.equipeId }, afterData: { equipeId: input.equipeId } });
      return { ok: true };
    }),
});
