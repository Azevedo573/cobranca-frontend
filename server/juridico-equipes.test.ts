import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({ db: vi.fn(), scope: vi.fn(), demanda: vi.fn(), elegivel: vi.fn(), audit: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.db }));
vi.mock("./juridico-access", () => ({ getJuridicoScope: mocks.scope, assertDemandaAccess: mocks.demanda, assertResponsavelElegivel: mocks.elegivel }));
vi.mock("./audit", () => ({ logAudit: mocks.audit }));
import { juridicoEquipesRouter, validarMembrosEquipe } from "./routers/juridico-equipes";
import { MODULOS } from "./db-profiles";
const contexto = (role = "admin"): TrpcContext => ({ user: { id: 1, role, name: "Administrador", isActive: 1 } as TrpcContext["user"], req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const caso = { id: 100, condominioId: 1, equipeId: null, responsavelId: 10 };
const admin = { admin: true, canManage: true, canCreate: true, canEdit: true, canApprove: true, gestorEquipeIds: [], equipeIds: [], condominioIds: [] };
const entrada = { nome: "Equipe Cível", membros: [{ userId: 10, gestor: true }, { userId: 20, gestor: false }] };
const usuarios = [{ id: 10, name: "Gestora", role: "advogado", profileId: 4, isActive: 1, isDeleted: 0 }, { id: 20, name: "Estagiário", role: "colaborador", profileId: 5, isActive: 1, isDeleted: 0 }];
const permissoes = [{ profileId: 4, modulo: "juridico_demandas", acao: "visualizar", permitido: 1 }, { profileId: 4, modulo: "juridico_equipe", acao: "visualizar", permitido: 1 }, { profileId: 5, modulo: "juridico_demandas", acao: "visualizar", permitido: 1 }];
function banco(resultados: unknown[][]) {
  const fila = [...resultados];
  const updates = vi.fn(); const inserts = vi.fn();
  const db: any = {
    select: vi.fn(() => {
      const resultado = fila.shift(); if (!resultado) throw new Error("Consulta inesperada");
      const query: any = { from: () => query, where: () => query, innerJoin: () => query, limit: () => query, for: () => query, then: (ok: any, fail: any) => Promise.resolve(resultado).then(ok, fail) }; return query;
    }),
    update: (table: unknown) => ({ set: (values: unknown) => ({ where: async () => { updates(table, values); return [{ affectedRows: 1 }]; } }) }),
    insert: (table: unknown) => ({ values: (values: unknown) => {
      inserts(table, values);
      const query: any = { $returningId: async () => [{ id: 7 }], onDuplicateKeyUpdate: async () => undefined, then: (ok: any, fail: any) => Promise.resolve().then(ok, fail) }; return query;
    } }),
  };
  db.transaction = vi.fn(async (fn: any) => fn(db)); mocks.db.mockResolvedValue(db);
  return { db, updates, inserts };
}
beforeEach(() => { vi.resetAllMocks(); mocks.scope.mockResolvedValue(admin); mocks.demanda.mockResolvedValue({ demanda: caso, scope: admin }); mocks.elegivel.mockResolvedValue({ id: 10, name: "Gestora" }); });

describe("equipes jurídicas — configuração explícita", () => {
  it("exige gestor e recusa membros duplicados", () => {
    expect(() => validarMembrosEquipe([{ userId: 1, gestor: false }])).toThrow(/gestor/);
    expect(() => validarMembrosEquipe([{ userId: 1, gestor: true }, { userId: 1, gestor: false }])).toThrow(/duplicidade/);
    expect(() => validarMembrosEquipe(entrada.membros)).not.toThrow();
  });
  it.each(["advogado", "colaborador", "sindico"])("não permite configuração por %s", async role => {
    const { db } = banco([]);
    await expect(juridicoEquipesRouter.createCaller(contexto(role)).salvar(entrada)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("cria equipe com advogado gestor e colaborador executor sem mudar papéis/perfis", async () => {
    const { inserts } = banco([usuarios, permissoes]);
    expect(await juridicoEquipesRouter.createCaller(contexto()).salvar(entrada)).toEqual({ id: 7 });
    expect(inserts.mock.calls[1][1]).toEqual([{ equipeId: 7, userId: 10, gestor: 1, isActive: 1 }, { equipeId: 7, userId: 20, gestor: 0, isActive: 1 }]);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "config_change", entityId: "7" }));
  });
  it.each([{ isActive: 0 }, { isDeleted: 1 }, { role: "user" }])("recusa membro incompatível %j antes de gravar", async flags => {
    const { db } = banco([[{ ...usuarios[0], ...flags }, usuarios[1]], permissoes]);
    await expect(juridicoEquipesRouter.createCaller(contexto()).salvar(entrada)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("não atribui gestão a perfil que só tem demandas", async () => {
    const { db } = banco([usuarios, permissoes.filter(p => p.modulo !== "juridico_equipe")]);
    await expect(juridicoEquipesRouter.createCaller(contexto()).salvar(entrada)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("preserva membros antigos como inativos em vez de excluí-los", async () => {
    const { updates } = banco([usuarios, permissoes, [{ id: 7, isActive: 1 }]]);
    await juridicoEquipesRouter.createCaller(contexto()).salvar({ ...entrada, id: 7 });
    expect(updates.mock.calls[1][1]).toEqual({ isActive: 0 });
  });
  it("módulo RBAC é configurável sem concessão automática a perfis default", () => {
    expect(MODULOS.some(m => m.id === "juridico_equipe")).toBe(true);
    const profiles = readFileSync(new URL("./db-profiles.ts", import.meta.url), "utf8");
    expect(profiles.match(/juridico_equipe/g)).toHaveLength(1);
    const editor = readFileSync(new URL("../client/src/pages/admin/ProfileEditor.tsx", import.meta.url), "utf8");
    expect(editor).toContain("modulos");
  });
});

describe("equipes jurídicas — vínculo de demanda", () => {
  it("valida responsável principal e todos executores sob bloqueio antes da gravação", async () => {
    const { db, updates, inserts } = banco([[{ id: 7, nome: "Cível", isActive: 1 }], [caso], [{ responsavelId: 20 }, { responsavelId: 20 }]]);
    await juridicoEquipesRouter.createCaller(contexto()).vincularDemanda({ demandaId: 100, equipeId: 7 });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(mocks.elegivel.mock.calls.map(call => call[2])).toEqual([10, 20]);
    expect(mocks.elegivel.mock.calls[0][1]).toMatchObject({ condominioId: 1, equipeId: 7 });
    expect(updates).toHaveBeenCalledOnce(); expect(inserts).toHaveBeenCalledOnce();
    expect(mocks.elegivel.mock.invocationCallOrder[1]).toBeLessThan(updates.mock.invocationCallOrder[0]);
  });
  it("responsável incompatível impede vínculo inteiro, timeline e auditoria de sucesso", async () => {
    const { updates, inserts } = banco([[{ id: 7, nome: "Cível", isActive: 1 }], [caso], [{ responsavelId: 20 }]]);
    mocks.elegivel.mockResolvedValueOnce({ id: 10 }).mockRejectedValueOnce(new Error("Carteira incompatível"));
    await expect(juridicoEquipesRouter.createCaller(contexto()).vincularDemanda({ demandaId: 100, equipeId: 7 })).rejects.toThrow(/Carteira/);
    expect(updates).not.toHaveBeenCalled(); expect(inserts).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it.each([{ equipeId: 8 }, { condominioId: 2 }, { responsavelId: 30 }])("recusa demanda alterada simultaneamente %j", async flags => {
    const { updates } = banco([[{ id: 7, nome: "Cível", isActive: 1 }], [{ ...caso, ...flags }]]);
    await expect(juridicoEquipesRouter.createCaller(contexto()).vincularDemanda({ demandaId: 100, equipeId: 7 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updates).not.toHaveBeenCalled();
  });
  it("não aceita gerente de outra equipe nem membro sem gestão", async () => {
    mocks.demanda.mockResolvedValue({ demanda: caso, scope: { ...admin, admin: false, canEdit: true, gestorEquipeIds: [8] } });
    await expect(juridicoEquipesRouter.createCaller(contexto("advogado")).vincularDemanda({ demandaId: 100, equipeId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.demanda.mockResolvedValue({ demanda: caso, scope: { ...admin, admin: false, canEdit: false, gestorEquipeIds: [] } });
    await expect(juridicoEquipesRouter.createCaller(contexto("colaborador")).vincularDemanda({ demandaId: 100, equipeId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
