import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), carteiras: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./tenant-guard", async original => ({ ...await original<typeof import("./tenant-guard")>(), getCondominiosAtivosDoUsuario: mocks.carteiras }));
import { assertDemandaAccess, assertResponsavelElegivel, assertTarefaAccess, casoDentroDaCarteira, demandaScopeCondition, gerenciaCaso, getJuridicoScope, resolverScopeJuridico, tarefaScopeCondition } from "./juridico-access";

const ator = { id: 10, role: "advogado", condominioId: 1 };
const usuario = { ...ator, name: "Advogada", isActive: 1, isDeleted: 0, profileId: 4 };
const permissao = (modulo: string, acao = "visualizar", permitido = 1) => ({ modulo, acao, permitido });
const base = [permissao("juridico_demandas"), permissao("juridico_demandas", "editar")];
const gerenciais = ["visualizar", "criar", "editar", "aprovar"].map(acao => permissao("juridico_equipe", acao));
const caso = { id: 100, condominioId: 1, equipeId: 7, responsavelId: 20, criadoPorId: 20 };
const tarefa = { id: 200, demandaId: 100, responsavelId: 10, status: "pendente" };
/** Uma fila de resultados mantém o schema/SQL reais, sem conexão ou persistência. */
function banco(resultados: unknown[][]) {
  const fila = [...resultados];
  const select = vi.fn(() => {
    const resultado = fila.shift();
    if (!resultado) throw new Error("Consulta inesperada no teste");
    const query: any = { from: () => query, where: () => query, innerJoin: () => query, limit: () => query, then: (ok: any, fail: any) => Promise.resolve(resultado).then(ok, fail) };
    return query;
  });
  mocks.getDb.mockResolvedValue({ select });
  return select;
}
function scopeRows(extra: unknown[][] = [], memberships = [] as { equipeId: number; gestor: number }[], permissions = base) {
  return [[usuario], permissions, memberships, ...extra];
}
beforeEach(() => { vi.resetAllMocks(); mocks.carteiras.mockResolvedValue([1, 2]); });

describe("juridico-access — escopo explícito", () => {
  it("não infere gestão de role, nome de perfil ou condomínio compartilhado", () => {
    const scope = resolverScopeJuridico(ator, [1, 2], [{ equipeId: 7, gestor: 0 }], gerenciais);
    expect(scope.canManage).toBe(false); expect(scope.gestorEquipeIds).toEqual([]);
  });
  it("gestor explícito sem RBAC de gestão não recebe equipe", () => {
    const scope = resolverScopeJuridico(ator, [1], [{ equipeId: 7, gestor: 1 }], base);
    expect(scope.canManage).toBe(false); expect(gerenciaCaso(scope, 7)).toBe(false);
  });
  it("cada ação gerencial exige sua permissão, além da visualização", () => {
    const scope = resolverScopeJuridico(ator, [1, 1, 2], [{ equipeId: 7, gestor: 1 }, { equipeId: 7, gestor: 1 }], [permissao("juridico_equipe")]);
    expect(scope).toMatchObject({ canManage: true, canCreate: false, canEdit: false, canApprove: false, condominioIds: [1, 2], gestorEquipeIds: [7] });
    expect(gerenciaCaso(scope, 8)).toBe(false); expect(gerenciaCaso(scope, null)).toBe(false);
  });
  it("gerente continua limitada às carteiras atuais e não acessa caso sem condomínio", () => {
    const scope = resolverScopeJuridico(ator, [1, 2], [{ equipeId: 7, gestor: 1 }], gerenciais);
    expect(casoDentroDaCarteira(scope, 2)).toBe(true); expect(casoDentroDaCarteira(scope, 3)).toBe(false); expect(casoDentroDaCarteira(scope, null)).toBe(false);
  });
  it("administrador conserva acesso global e todas as ações", () => {
    const scope = resolverScopeJuridico({ ...ator, role: "admin" }, [], [], []);
    expect(scope).toMatchObject({ admin: true, canManage: true, canCreate: true, canEdit: true, canApprove: true });
    expect(casoDentroDaCarteira(scope, null)).toBe(true); expect(gerenciaCaso(scope, null)).toBe(true);
  });
  it("predicados SQL nunca incluem equipe de simples membro e limitam Minhas ao executor", () => {
    const dialect = new MySqlDialect();
    const member = resolverScopeJuridico(ator, [1, 2], [{ equipeId: 7, gestor: 0 }], gerenciais);
    const manager = resolverScopeJuridico(ator, [1, 2], [{ equipeId: 7, gestor: 1 }], gerenciais);
    const pessoal = dialect.sqlToQuery(tarefaScopeCondition(manager, true));
    const equipe = dialect.sqlToQuery(tarefaScopeCondition(manager));
    const membro = dialect.sqlToQuery(tarefaScopeCondition(member));
    expect(pessoal.params).not.toContain(7); expect(equipe.params).toContain(7); expect(membro.params).not.toContain(7);
    expect(dialect.sqlToQuery(demandaScopeCondition(member, true)).sql).toContain("EXISTS");
    expect(dialect.sqlToQuery(tarefaScopeCondition(resolverScopeJuridico(ator, [], [], base))).sql).toContain("1 = 0");
  });
});

describe("juridico-access — perfil e identidade consultados novamente", () => {
  it.each([{ isActive: 0 }, { isDeleted: 1 }])("recusa identidade inativa/excluída: %j", async flags => {
    banco([[{ ...usuario, ...flags }]]);
    await expect(getJuridicoScope(ator)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("não aceita admin desatualizado no contexto de sessão", async () => {
    banco([[{ ...usuario, profileId: null }]]);
    await expect(getJuridicoScope({ ...ator, role: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("recusa perfil sem permissão ou com revogação explícita", async () => {
    banco([[usuario], [permissao("juridico_demandas", "visualizar", 0)]]);
    await expect(getJuridicoScope(ator)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("revogação RBAC vale na próxima chamada, sem usar cache", async () => {
    banco(scopeRows()); expect((await getJuridicoScope(ator)).actor.role).toBe("advogado");
    banco([[usuario], []]); await expect(getJuridicoScope(ator)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("colaborador jurídico pode receber escopo pessoal sem gestão", async () => {
    banco([[{ ...usuario, role: "colaborador" }], base, [{ equipeId: 7, gestor: 0 }]]);
    expect(await getJuridicoScope({ ...ator, role: "colaborador" })).toMatchObject({ equipeIds: [7], canManage: false });
  });
});

describe("juridico-access — acesso direto a demandas e tarefas", () => {
  it("executor tem contexto mínimo, não acesso completo por possuir tarefa", async () => {
    banco(scopeRows([[caso], [{ id: 200 }]]));
    expect(await assertDemandaAccess(ator, 100, "visualizar", true)).toMatchObject({ acessoCompleto: false, gerencia: false });
    banco(scopeRows([[caso]])); await expect(assertDemandaAccess(ator, 100)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("criador/responsável legado mantém leitura, mas carteira continua necessária", async () => {
    banco(scopeRows([[{ ...caso, equipeId: null, responsavelId: 10 }]]));
    expect(await assertDemandaAccess(ator, 100)).toMatchObject({ acessoCompleto: true, gerencia: false });
    mocks.carteiras.mockResolvedValue([]); banco(scopeRows([[{ ...caso, responsavelId: 10 }]]));
    await expect(assertDemandaAccess(ator, 100)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("gestora explícita lê caso da equipe dentro de sua carteira, não outra equipe", async () => {
    const members = [{ equipeId: 7, gestor: 1 }];
    banco(scopeRows([[caso]], members, [...base, ...gerenciais]));
    expect(await assertDemandaAccess(ator, 100)).toMatchObject({ acessoCompleto: true, gerencia: true });
    banco(scopeRows([[{ ...caso, equipeId: 8 }]], members, [...base, ...gerenciais]));
    await expect(assertDemandaAccess(ator, 100)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each([3, null])("demanda no condomínio %s não é exposta mesmo ao executor", async condominioId => {
    banco(scopeRows([[{ ...caso, condominioId }]]));
    await expect(assertDemandaAccess(ator, 100, "visualizar", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("contexto herdado nunca autoriza editar caso", async () => {
    banco(scopeRows([[caso]]));
    await expect(assertDemandaAccess(ator, 100, "editar", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("executor lê a tarefa atual, ex-executor perde acesso após reatribuição", async () => {
    banco(scopeRows([[{ tarefa, demanda: caso }]])); expect(await assertTarefaAccess(ator, 200)).toMatchObject({ gerencia: false });
    banco(scopeRows([[{ tarefa: { ...tarefa, responsavelId: 30 }, demanda: caso }]]));
    await expect(assertTarefaAccess(ator, 200)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("membro não gestor não lê atividade de colega", async () => {
    banco(scopeRows([[{ tarefa: { ...tarefa, responsavelId: 30 }, demanda: caso }]], [{ equipeId: 7, gestor: 0 }], [...base, ...gerenciais]));
    await expect(assertTarefaAccess(ator, 200)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("carteira revogada tira acesso à tarefa do próprio executor", async () => {
    mocks.carteiras.mockResolvedValue([2]); banco(scopeRows([[{ tarefa, demanda: caso }]]));
    await expect(assertTarefaAccess(ator, 200)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("gerente sem editar não pode alterar tarefa de colega", async () => {
    banco(scopeRows([[{ tarefa: { ...tarefa, responsavelId: 30 }, demanda: caso }]], [{ equipeId: 7, gestor: 1 }], [...base, permissao("juridico_equipe")]));
    await expect(assertTarefaAccess(ator, 200, "editar")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("juridico-access — elegibilidade para delegação", () => {
  const destino = { ...usuario, id: 30, name: "Estagiário jurídico", role: "colaborador", profileId: 6 };
  function elegivel(flags: Record<string, unknown> = {}, membro = true, permissaoPerfil = true) {
    banco(scopeRows([[{ ...destino, ...flags }], membro ? [{ id: 1 }] : [], permissaoPerfil ? [{ id: 2 }] : []], [{ equipeId: 7, gestor: 1 }], [...base, ...gerenciais]));
  }
  it("aceita colaborador jurídico da equipe/carteira e devolve nome do banco", async () => {
    elegivel(); expect(await assertResponsavelElegivel(ator, caso as never, 30)).toEqual({ id: 30, name: "Estagiário jurídico", role: "colaborador" });
  });
  it.each([{ isActive: 0 }, { isDeleted: 1 }, { role: "sindico" }])("recusa destino incompatível %j", async flags => {
    elegivel(flags); await expect(assertResponsavelElegivel(ator, caso as never, 30)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("recusa outra equipe, perfil sem permissão e carteira incompatível", async () => {
    elegivel({}, false); await expect(assertResponsavelElegivel(ator, caso as never, 30)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    elegivel({}, true, false); await expect(assertResponsavelElegivel(ator, caso as never, 30)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    mocks.carteiras.mockImplementation(async user => user.id === 30 ? [2] : [1]);
    elegivel(); await expect(assertResponsavelElegivel(ator, caso as never, 30)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("não delega legado sem equipe nem mesmo com admin", async () => {
    banco([[{ ...usuario, role: "admin" }], [], [{ ...destino }]]);
    await expect(assertResponsavelElegivel({ ...ator, role: "admin" }, { ...caso, equipeId: null } as never, 30)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("executor não pode delegar a colega mesmo quando compartilham equipe", async () => {
    banco(scopeRows([[destino]], [{ equipeId: 7, gestor: 0 }]));
    await expect(assertResponsavelElegivel(ator, caso as never, 30)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
