import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({
  scope: vi.fn(), access: vi.fn(), eligible: vi.fn(), condition: vi.fn(), list: vi.fn(), get: vi.fn(), atomic: vi.fn(),
  create: vi.fn(), timeline: vi.fn(), comment: vi.fn(), linked: vi.fn(), remove: vi.fn(), column: vi.fn(), entrada: vi.fn(),
  currentColumn: vi.fn(), team: vi.fn(), teamTasks: vi.fn(), related: vi.fn(), openTasks: vi.fn(), dashboard: vi.fn(), chooser: vi.fn(),
  storage: vi.fn(), queries: [] as any[][], writes: vi.fn(), db: vi.fn(),
}));
vi.mock("./juridico-access", async original => ({
  ...await original<typeof import("./juridico-access")>(),
  getJuridicoScope: mocks.scope, assertDemandaAccess: mocks.access,
  assertResponsavelElegivel: mocks.eligible, demandaScopeCondition: mocks.condition,
}));
vi.mock("./db-demandas", () => ({
  getDemandas: mocks.list, getDemandaById: mocks.get, executarDemandasAtomico: mocks.atomic, createDemanda: mocks.create,
  getTimelineDemanda: mocks.timeline, addTimelineEvento: mocks.comment, getCobrancasVinculadas: mocks.linked, deleteDemanda: mocks.remove,
  assertColunaDemandaAccess: mocks.column, getColunaEntrada: mocks.entrada, getColunaDemanda: mocks.currentColumn,
  assertEquipeDemandaAtiva: mocks.team, assertTrocaEquipeSemTarefas: mocks.teamTasks, validarVinculosDemanda: mocks.related,
  contarTarefasAbertasDemanda: mocks.openTasks, getNomeActorDemanda: async () => "Nome atual",
  getDashboardJuridico: mocks.dashboard, getAdvogados: mocks.chooser,
  getColunasDemanda: vi.fn(),
}));
vi.mock("./db", async original => ({ ...await original<typeof import("./db")>(), getDb: mocks.db }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
import { appRouter, validarAtribuicaoDemanda } from "./routers";

const actor = { id: 10, role: "colaborador", condominioId: 1 };
const scope = (extra = {}) => ({ actor, admin: false, condominioIds: [1], equipeIds: [5], gestorEquipeIds: [], canManage: false, canCreate: false, canEdit: false, canApprove: false, ...extra });
const demanda = (id = 20, extra = {}) => ({ id, condominioId: 1, equipeId: 5, colunaId: 1, responsavelId: 10, criadoPorId: 10, assunto: "Caso", ...extra });
const access = (extra = {}) => ({ demanda: demanda(), scope: scope(), acessoCompleto: true, gerencia: false, ...extra });
function ctx(role = "colaborador"): TrpcContext {
  return { user: { ...actor, role, name: "Nome da sessão", email: "nao-retornar@example.com" } as any, req: { headers: {}, protocol: "https" } as any, res: {} as any };
}
const caller = () => appRouter.createCaller(ctx()).juridicoDemandas;
beforeEach(() => {
  vi.clearAllMocks(); mocks.queries.length = 0;
  mocks.scope.mockResolvedValue(scope()); mocks.access.mockResolvedValue(access());
  mocks.eligible.mockResolvedValue({ id: 11, name: "Profissional atual", role: "advogado" });
  mocks.condition.mockReturnValue("AUTHORIZED_PREDICATE"); mocks.get.mockResolvedValue(demanda()); mocks.list.mockResolvedValue([]);
  mocks.column.mockResolvedValue({ id: 1, userId: null, tipo: "entrada" }); mocks.entrada.mockResolvedValue({ id: 1, tipo: "entrada" });
  mocks.currentColumn.mockResolvedValue({ id: 1, tipo: "entrada" }); mocks.openTasks.mockResolvedValue(2);
  mocks.team.mockResolvedValue(undefined); mocks.teamTasks.mockResolvedValue(undefined); mocks.related.mockResolvedValue(undefined);
  mocks.timeline.mockResolvedValue([]); mocks.atomic.mockResolvedValue(undefined);
  mocks.db.mockResolvedValue({ select: () => {
    const rows = Promise.resolve(mocks.queries.shift() ?? []);
    const q: any = { from: () => q, where: () => q, orderBy: () => rows, limit: () => rows, then: rows.then.bind(rows) };
    return q;
  }, delete: mocks.writes, insert: mocks.writes });
});

describe("demandas — guards em todos os paths relevantes", () => {
  const forbidden = () => new TRPCError({ code: "NOT_FOUND", message: "Demanda não encontrada" });
  it.each([
    ["getById", { id: 99 }], ["update", { id: 99, assunto: "Ataque" }], ["mover", { id: 99, novaColunaId: 1 }],
    ["delete", { id: 99 }], ["getTimeline", { demandaId: 99 }], ["addComentario", { demandaId: 99, descricao: "Ataque" }],
    ["getCobrancasVinculadas", { demandaId: 99 }], ["getAnexos", { demandaId: 99 }],
    ["uploadAnexoDemanda", { demandaId: 99, fileBase64: "eA==", fileName: "a.txt", mimeType: "text/plain", tamanho: 1 }],
  ])("nega ID alheio em %s antes de ler/persistir conteúdo", async (name, input) => {
    mocks.access.mockRejectedValue(forbidden());
    await expect((caller() as any)[name](input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.access.mock.calls[0][0]).toMatchObject(actor);
    for (const fn of [mocks.get, mocks.atomic, mocks.remove, mocks.timeline, mocks.comment, mocks.linked, mocks.storage, mocks.writes]) expect(fn).not.toHaveBeenCalled();
  });
  it("executor de tarefa com responsável do caso diferente recebe formato redigido", async () => {
    const caso = demanda(20, { responsavelId: 11, criadoPorId: 11, devedorId: 50, cobrancaId: 60, valorDivida: 9000, cpfDevedor: "CPF", nomeDevedor: "Devedor", qtdCobrancas: 2 });
    mocks.access.mockResolvedValue(access({ demanda: caso, acessoCompleto: false })); mocks.get.mockResolvedValue(caso);
    const result = await caller().getById({ id: 20 });
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining(actor), 20, "visualizar", true);
    expect(result).toMatchObject({ id: 20, assunto: "Caso", responsavelId: 11, acessoCompleto: false, gerencia: false, devedorId: null, cobrancaId: null, valorDivida: null, cpfDevedor: null, qtdCobrancas: null });
  });
  it("não dá acesso a anexos pelo contexto de tarefa", async () => {
    mocks.access.mockResolvedValue(access({ acessoCompleto: false }));
    await expect(caller().getAnexos({ demandaId: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().uploadAnexoDemanda({ demandaId: 20, fileBase64: "eA==", fileName: "a", mimeType: "text/plain", tamanho: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("uploader também perde exclusão do anexo quando perde o acesso ao caso", async () => {
    mocks.queries.push([{ id: 1, demandaId: 99, uploadadoPorId: 10 }]); mocks.access.mockRejectedValue(forbidden());
    await expect(caller().deleteAnexoDemanda({ id: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining(actor), 99, "editar"); expect(mocks.writes).not.toHaveBeenCalled();
  });
  it("perfil/tenant revogado impede listagem mesmo com sessão antiga", async () => {
    mocks.scope.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller().listar()).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("consulta condomínio solicitado fresco e usa condição compartilhada com contexto", async () => {
    await expect(caller().listar({ condominioId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.list).not.toHaveBeenCalled();
    await caller().listar({ condominioId: 1 });
    expect(mocks.condition).toHaveBeenCalledWith(expect.objectContaining({ condominioIds: [1] }), true);
    expect(mocks.list).toHaveBeenCalledWith({ condominioId: 1, scopeCondition: "AUTHORIZED_PREDICATE" });
  });
  it("lista redige também os casos acessíveis somente por tarefa", async () => {
    mocks.list.mockResolvedValue([demanda(20, { cpfDevedor: "CPF", valorDivida: 100 })]); mocks.access.mockResolvedValue(access({ acessoCompleto: false }));
    expect(await caller().listar()).toEqual([expect.objectContaining({ cpfDevedor: null, valorDivida: null, acessoCompleto: false })]);
  });
  it("gestor explícito recebe caso completo da sua equipe autorizado pelo guard", async () => {
    const gestor = scope({ canManage: true, canEdit: true, gestorEquipeIds: [5] });
    mocks.access.mockResolvedValue(access({ scope: gestor, gerencia: true })); mocks.get.mockResolvedValue(demanda(20, { valorDivida: 100 }));
    expect(await caller().getById({ id: 20 })).toMatchObject({ valorDivida: 100, acessoCompleto: true, gerencia: true });
  });
  it("executor não pode forjar conclusão nem criação na timeline", async () => {
    await expect(caller().addComentario({ demandaId: 20, descricao: "Aprovo", tipo: "conclusao" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.comment).not.toHaveBeenCalled();
  });
  it("caso completo preserva interação manual sem simular evento de estado", async () => {
    await caller().addComentario({ demandaId: 20, descricao: "Contato efetuado", tipo: "whatsapp" });
    expect(mocks.comment).toHaveBeenCalledWith(expect.objectContaining({ tipo: "whatsapp", usuarioId: 10, usuarioNome: "Nome atual" }));
  });
  it("executor com apenas contexto não pode criar interação que não seja comentário", async () => {
    mocks.access.mockResolvedValue(access({ acessoCompleto: false }));
    await expect(caller().addComentario({ demandaId: 20, descricao: "Contato", tipo: "email" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.comment).not.toHaveBeenCalled();
  });
  it("contexto mínimo lê apenas comentários próprios, não eventos financeiros", async () => {
    mocks.access.mockResolvedValue(access({ acessoCompleto: false }));
    mocks.timeline.mockResolvedValue([{ tipo: "criacao", descricao: "Valor dívida" }, { tipo: "comentario", usuarioId: 11, descricao: "Alheio" }, { tipo: "comentario", usuarioId: 10, descricao: "Meu" }]);
    expect(await caller().getTimeline({ demandaId: 20 })).toEqual([{ tipo: "comentario", usuarioId: 10, descricao: "Meu" }]);
  });
});

describe("demandas — atribuição e lotes sem escrita parcial", () => {
  it("usuário não reatribui outra pessoa nem remove responsável alheio", async () => {
    mocks.access.mockResolvedValue(access({ demanda: demanda(20, { responsavelId: 11 }) }));
    for (const responsavelId of [10, 12, null]) await expect(caller().update({ id: 20, responsavelId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("não altera nome legado por texto sem ID", async () => {
    await caller().update({ id: 20, responsavelNome: "Nome forjado" });
    expect(mocks.atomic.mock.calls[0][0][0].data).not.toHaveProperty("responsavelNome");
  });
  it("deriva nome do cadastro do servidor quando gestor atribui ID elegível", async () => {
    const gestor = scope({ canManage: true, canEdit: true, gestorEquipeIds: [5] }); mocks.access.mockResolvedValue(access({ scope: gestor, gerencia: true }));
    await caller().update({ id: 20, responsavelId: 11, responsavelNome: "Nome forjado" });
    expect(mocks.atomic.mock.calls[0][0][0].data).toMatchObject({ responsavelId: 11, responsavelNome: "Profissional atual" });
  });
  it("equipe de destino exige gestão explícita e rejeita equipe alheia", async () => {
    const gestor = scope({ canManage: true, canEdit: true, gestorEquipeIds: [5] });
    await expect(validarAtribuicaoDemanda(actor, gestor as any, demanda(), { equipeId: 6 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.eligible).not.toHaveBeenCalled();
  });
  it("não troca equipe pelo update genérico em caso com tarefas", async () => {
    mocks.access.mockResolvedValue(access({ scope: scope({ admin: true }), gerencia: true })); mocks.teamTasks.mockRejectedValue(new TRPCError({ code: "CONFLICT" }));
    await expect(caller().update({ id: 20, equipeId: 6 })).rejects.toMatchObject({ code: "CONFLICT" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("seleção com último ID alheio não escreve os primeiros", async () => {
    const gestor = scope({ canManage: true, canEdit: true, gestorEquipeIds: [5] });
    mocks.access.mockResolvedValueOnce(access({ scope: gestor, gerencia: true })).mockRejectedValueOnce(new TRPCError({ code: "NOT_FOUND" }));
    await expect(caller().acaoEmLote({ ids: [20, 99], acao: "alterar_prioridade", prioridade: "alta" })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("último responsável inelegível em lote não escreve nenhuma demanda", async () => {
    const gestor = scope({ canManage: true, canEdit: true, gestorEquipeIds: [5] }); mocks.access.mockResolvedValue(access({ scope: gestor, gerencia: true }));
    mocks.eligible.mockResolvedValueOnce({ id: 11, name: "Nome" }).mockRejectedValueOnce(new TRPCError({ code: "BAD_REQUEST" }));
    await expect(caller().acaoEmLote({ ids: [20, 21], acao: "reatribuir", responsavelId: 11 })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("destino de coluna privado inválido não escreve nada", async () => {
    mocks.access.mockResolvedValue(access({ scope: scope({ admin: true }), gerencia: true })); mocks.column.mockRejectedValue(new TRPCError({ code: "NOT_FOUND" }));
    await expect(caller().acaoEmLote({ ids: [20, 21], acao: "mover_coluna", colunaId: 99 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("lote completo validado usa uma transação/helper, não Promise.all de escritas", async () => {
    mocks.access.mockResolvedValue(access({ scope: scope({ admin: true }), gerencia: true }));
    expect(await caller().acaoEmLote({ ids: [20, 21], acao: "alterar_prioridade", prioridade: "alta" })).toEqual({ atualizadas: 2 });
    expect(mocks.atomic).toHaveBeenCalledTimes(1); expect(mocks.atomic.mock.calls[0][0]).toHaveLength(2);
  });
  it("reordenação com último ID alheio não escreve os primeiros", async () => {
    mocks.access.mockResolvedValueOnce(access()).mockRejectedValueOnce(new TRPCError({ code: "NOT_FOUND" }));
    await expect(caller().reordenarDemandas({ ids: [20, 99] })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("reordenação de colunas diferentes é recusada integralmente", async () => {
    mocks.access.mockResolvedValueOnce(access()).mockResolvedValueOnce(access({ demanda: demanda(21, { colunaId: 2 }) }));
    await expect(caller().reordenarDemandas({ ids: [20, 21] })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("limita lotes a 100, reordenação a 200 e recusa duplicação", async () => {
    await expect(caller().acaoEmLote({ ids: Array.from({ length: 101 }, (_, i) => i + 1), acao: "alterar_prioridade", prioridade: "alta" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().reordenarDemandas({ ids: Array.from({ length: 201 }, (_, i) => i + 1) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().acaoEmLote({ ids: [20, 20], acao: "alterar_prioridade", prioridade: "alta" })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.atomic).not.toHaveBeenCalled();
  });
  it("gestor não modifica casualmente preferências de outro usuário", async () => {
    mocks.scope.mockResolvedValue(scope({ canManage: true, gestorEquipeIds: [5] }));
    await expect(caller().getColunas({ targetUserId: 11 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("escalada verifica condomínio e referência devedor antes da criação", async () => {
    await expect(caller().escalarParaJuridico({ devedorId: 1, condominioId: 2, nomeDevedor: "Nome", unidadeDevedor: "1", valorDivida: 1, qtdCobrancas: 1, assunto: "Caso" })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.related).not.toHaveBeenCalled();
  });
  it("dashboard não consulta métricas globais para gestor não admin", async () => {
    await caller().dashboard(); expect(mocks.dashboard).toHaveBeenCalledWith("AUTHORIZED_PREDICATE", false);
  });
});
