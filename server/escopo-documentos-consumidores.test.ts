import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({ db: vi.fn(), storage: vi.fn(), remessas: vi.fn(), retornos: vi.fn(), config: vi.fn(), saveConfig: vi.fn(), parser: vi.fn(), pdf: vi.fn(), modelo: vi.fn(), listModelos: vi.fn(), createModelo: vi.fn(), updateModelo: vi.fn(), deleteModelo: vi.fn(), listAnexos: vi.fn(), createAnexo: vi.fn(), updateAnexo: vi.fn(), deleteAnexo: vi.fn(), ordem: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.db }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
vi.mock("./db-cnab", () => ({ listarRemessasCNAB: mocks.remessas, listarRetornosCNAB: mocks.retornos, classificarExcecaoRetorno: () => "revisao", criarRetornoCNAB: vi.fn() }));
vi.mock("./db-configuracao-boleto", () => ({ getConfiguracaoBoleto: mocks.config, upsertConfiguracaoBoleto: mocks.saveConfig }));
vi.mock("./db-cnab-retorno", () => ({ parseRetornoCNAB240: mocks.parser, determinarNovoStatus: vi.fn(), isLiquidacaoParcialCNAB: vi.fn() }));
vi.mock("./modelo-pdf", () => ({ gerarPDFModelo: mocks.pdf, gerarHtmlTabelaParcelas: vi.fn() }));
vi.mock("./db-modelos", () => ({ getModeloById: mocks.modelo, listModelosByCondominio: mocks.listModelos, createModelo: mocks.createModelo, updateModelo: mocks.updateModelo, deleteModelo: mocks.deleteModelo, listAnexosByModelo: mocks.listAnexos, createAnexo: mocks.createAnexo, updateAnexo: mocks.updateAnexo, deleteAnexo: mocks.deleteAnexo, reordenarAnexos: mocks.ordem }));
import { appRouter } from "./routers";
import { condominiosPermitidosFilaCnab } from "./btg-canais-cnab";
import { resolverCondominioRetornoDocumento } from "./escopo-documentos-consumidores";
let fixture: ReturnType<typeof criarDbCanaisEmMemoria>;
let modelSql: { sql: string; params: unknown[] }[];
const dialect = new MySqlDialect();
const ctx = (role = "advogado", principal: number | null = null) => ({ user: { id: 10, role, condominioId: principal, name: "Fixture", isActive: 1 }, req: { headers: {} }, res: {} } as unknown as TrpcContext);
const caller = () => appRouter.createCaller(ctx(fixture.state.tables.users[0].role, fixture.state.tables.users[0].condominioId));
const user = () => fixture.state.tables.users[0];
const upload = { cobrancaId: 101, condominioId: 1, nomeArquivo: "fixture.pdf", conteudoBase64: "YQ==" };
beforeEach(() => {
  vi.resetAllMocks();
  fixture = criarDbCanaisEmMemoria({
    users: [{ id: 10, role: "advogado", condominioId: null, escopoCondominios: "selecionados", isActive: 1, isDeleted: 0 }],
    userCondominios: [{ userId: 10, condominioId: 1, isActive: 1 }, { userId: 10, condominioId: 2, isActive: 1 }],
    condominios: [{ id: 1, statusCadastro: "ativo" }, { id: 2, statusCadastro: "ativo" }, { id: 3, statusCadastro: "ativo" }, { id: 4, statusCadastro: "inativo" }],
    devedores: [{ id: 11, condominioId: 1 }, { id: 22, condominioId: 2 }, { id: 33, condominioId: 3 }],
    cobrancas: [{ id: 101, condominioId: 1, devedorId: 11, statusRemessa: "remessa_gerada", amount: 999, status: "pendente" }, { id: 202, condominioId: 2, devedorId: 22, statusRemessa: "remessa_gerada" }, { id: 303, condominioId: 3, devedorId: 33 }],
    boletosUpload: [{ id: 501, cobrancaId: 101, condominioId: 1 }, { id: 502, cobrancaId: 101, condominioId: 3 }, { id: 503, cobrancaId: 303, condominioId: 3 }],
    remessasCNAB: [{ id: 601, condominioId: 1 }, { id: 602, condominioId: 2 }],
    retornosCNAB: [{ id: 701, condominioId: 3 }, { id: 702, condominioId: 1 }],
    retornoItens: [{ id: 801, retornoId: 701, statusProcessamento: "erro", createdAt: 2 }, { id: 802, retornoId: 702, statusProcessamento: "erro", createdAt: 1 }],
    retornoExcecaoRevisoes: [],
    modelosDocumento: [{ id: 901, condominioId: 1, ativo: 1, conteudoHtml: "fixture" }, { id: 902, condominioId: 3, ativo: 1 }, { id: 903, condominioId: null, ativo: 1, conteudoHtml: "shared" }, { id: 904, condominioId: 4, ativo: 1 }],
    modeloAnexos: [{ id: 1001, modeloId: 901 }, { id: 1002, modeloId: 902 }],
  });
  modelSql = [];
  const select = fixture.db.select;
  fixture.db.select = vi.fn((selection?: any) => {
    const chain = select(selection);
    const orderBy = chain.orderBy;
    chain.orderBy = (order: any) => orderBy(order?.toQuery ? order : sql`${order}`);
    const from = chain.from;
    chain.from = (table: any) => {
      from(table);
      if (getTableName(table) === "modelosDocumento") {
        chain.where = (condition: any) => {
          const query = dialect.sqlToQuery(condition); modelSql.push(query);
          // Fixture dedicada para o OR de compartilhados NULL; aplica o filtro real antes de retornar.
          chain.then = (resolve: any, reject: any) => Promise.resolve(fixture.state.tables.modelosDocumento.filter(item => item.ativo === 1 && (item.condominioId === null || query.params.slice(1).includes(item.condominioId)))).then(resolve, reject);
          return chain;
        };
      }
      return chain;
    };
    return chain;
  });
  fixture.db.delete = vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) }));
  mocks.db.mockResolvedValue(fixture.db);
  mocks.storage.mockResolvedValue({ url: "https://example.invalid/fixture" });
  mocks.remessas.mockResolvedValue([]); mocks.retornos.mockResolvedValue([]); mocks.config.mockResolvedValue({});
  mocks.modelo.mockImplementation(async id => fixture.state.tables.modelosDocumento.find(item => item.id === id) ?? null);
  mocks.listModelos.mockResolvedValue([{ id: 999, condominioId: 3 }]); mocks.createModelo.mockResolvedValue(905);
  mocks.listAnexos.mockResolvedValue([]); mocks.createAnexo.mockResolvedValue(1003); mocks.pdf.mockResolvedValue(Buffer.from("fixture"));
  mocks.parser.mockReturnValue({ pares: [], header: { dataGeracao: "fixture", horaGeracao: "fixture" } });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Rede proibida")));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("CNAB e boletos — escopo explícito versus NULL", () => {
  it.each(["advogado", "colaborador"])("%s selecionado usa input autorizado sem principal", async role => {
    user().role = role;
    await caller().cnab.listarRemessas({ condominioId: 2 }); await caller().cnab.listarRetornos({ condominioId: 2 });
    expect(mocks.remessas).toHaveBeenCalledWith(2); expect(mocks.retornos).toHaveBeenCalledWith(2);
  });
  it.each(["listarRemessas", "listarRetornos", "getConfiguracaoBoleto"] as const)("%s nega tenant fora da carteira", async route => {
    await expect(caller().cnab[route]({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.remessas).not.toHaveBeenCalled(); expect(mocks.retornos).not.toHaveBeenCalled(); expect(mocks.config).not.toHaveBeenCalled();
  });
  it("configuração local permite B após parse, mantendo os dados", async () => {
    await caller().cnab.getConfiguracaoBoleto({ condominioId: 2 }); expect(mocks.config).toHaveBeenCalledWith(2);
  });
  it("configuração local escrita valida input sem transformar colaborador em admin", async () => {
    user().role = "colaborador";
    const input = { condominioId: 2, agencia: "fixture", conta: "fixture" };
    await caller().cnab.salvarConfiguracaoBoleto(input);
    expect(mocks.saveConfig).toHaveBeenCalledWith(2, expect.objectContaining({ agencia: "fixture", conta: "fixture" }));
    await expect(caller().cnab.salvarConfiguracaoBoleto({ ...input, condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
  });
  it("listar itens nega tenant externo antes de consultar os itens", async () => {
    await expect(caller().cnab.listarItensRetorno({ retornoId: 701, condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.state.writes).toEqual([]);
  });
  it("upload nega cobrança externa antes de storage", async () => {
    await expect(caller().cnab.uploadBoleto({ ...upload, cobrancaId: 303, condominioId: 3 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(fixture.state.writes).toEqual([]);
  });
  it.each(["input", "devedor"])("upload nega tenant inconsistente: %s", async mismatch => {
    if (mismatch === "devedor") fixture.state.tables.cobrancas[0].devedorId = 22;
    await expect(caller().cnab.uploadBoleto({ ...upload, condominioId: mismatch === "input" ? 2 : 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(fixture.state.writes).toEqual([]);
  });
  it("upload autorizado mantém payload e valores originais", async () => {
    await caller().cnab.uploadBoleto(upload);
    expect(mocks.storage).toHaveBeenCalledTimes(1); expect(fixture.state.writes[0]).toMatchObject({ table: "boletosUpload", values: { condominioId: 1, cobrancaId: 101 } });
    expect(fixture.state.tables.cobrancas[0]).toMatchObject({ amount: 999, status: "pendente" });
  });
  it("lista boletos somente com tenant correspondente à cobrança/devedor", async () => {
    expect((await caller().cnab.listarBoletos({ cobrancaId: 101 })).map(item => item.id)).toEqual([501]);
    expect((await caller().cnab.listarBoletosPorDevedor({ devedorId: 11 })).map(item => item.id)).toEqual([501]);
    await expect(caller().cnab.listarBoletosPorDevedor({ devedorId: 33 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each([502, 503])("delete boleto %s valida o objeto e relações antes da escrita", async id => {
    await expect(caller().cnab.deletarBoleto({ id })).rejects.toBeDefined(); expect(fixture.db.delete).not.toHaveBeenCalled();
  });
  it("delete boleto permitido e itens do retorno respeitam ID/tenant reais", async () => {
    expect(await caller().cnab.deletarBoleto({ id: 501 })).toEqual({ deleted: true });
    expect(fixture.db.delete).toHaveBeenCalledTimes(1);
    expect((await caller().cnab.listarItensRetorno({ retornoId: 702, condominioId: 1 })).map(item => item.id)).toEqual([802]);
    await expect(caller().cnab.listarItensRetorno({ retornoId: 701, condominioId: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it.each([{ ids: [101, 303] }, { ids: [101, 999] }, { ids: [101, 101] }])("lote inválido $ids não faz escrita parcial", async ({ ids }) => {
    await expect(caller().cnab.marcarComoEnviado({ cobrancaIds: ids })).rejects.toBeDefined(); expect(fixture.state.writes).toEqual([]);
  });
  it.each([{ ids: [101, 202] }, { ids: [101, 303] }, { ids: [101, 999] }])("gerar remessa nega lote $ids inteiro antes de configuração/sequencial/storage", async ({ ids }) => {
    await expect(caller().cnab.gerarRemessa({ condominioId: 1, cobrancaIds: ids })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.config).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled(); expect(fixture.state.writes).toEqual([]);
  });
  it("remessa incompatível nega lote inteiro antes de escrita", async () => {
    await expect(caller().cnab.marcarComoEnviado({ cobrancaIds: [101, 202], remessaId: 601 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(fixture.state.writes).toEqual([]);
  });
  it("envio válido mantém fluxo existente e não baixa cobrança", async () => {
    expect(await caller().cnab.marcarComoEnviado({ cobrancaIds: [101], remessaId: 601 })).toEqual({ updated: 1 });
    expect(fixture.state.tables.cobrancas[0]).toMatchObject({ statusRemessa: "enviado", remessaId: 601, amount: 999, status: "pendente" });
  });
  it("exceções aplicam carteira antes de LIMIT, não pós-filtragem", async () => {
    const rows = await caller().cnab.listarExcecoesRetorno({ limit: 1 }); expect(rows.map(item => item.id)).toEqual([802]);
    await expect(caller().cnab.listarExcecoesRetorno({ condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("revisão externa nega antes de insert; revisão permitida nunca baixa", async () => {
    await expect(caller().cnab.revisarExcecaoRetorno({ retornoItemId: 801, acao: "ignorada", justificativa: "fixture" })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(fixture.state.writes).toEqual([]);
    expect(await caller().cnab.revisarExcecaoRetorno({ retornoItemId: 802, acao: "ignorada", justificativa: "fixture" })).toMatchObject({ baixaAutomatica: false });
    expect(fixture.state.writes.map(item => item.table)).toEqual(["retornoExcecaoRevisoes"]);
  });
  it.each([0, -1, 3, 4])("processar retorno nega contexto %s antes de parse/storage/write", async condominioId => {
    await expect(caller().cnab.processarRetorno({ condominioId, nomeArquivo: "fixture.ret", conteudo: "fixture" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.parser).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled(); expect(fixture.state.writes).toEqual([]);
  });
  it("processar retorno global profissional resolve positivo concreto nunca zero", async () => {
    user().escopoCondominios = "todos";
    await caller().cnab.processarRetorno({ nomeArquivo: "fixture.ret", conteudo: "fixture" });
    expect(fixture.state.writes[0]).toMatchObject({ table: "retornosCNAB", values: { condominioId: 1 } });
  });
  it("fila BTG global profissional usa todos os IDs ativos e novo ativo futuro", async () => {
    user().escopoCondominios = "todos"; fixture.state.tables.condominios.push({ id: 5, statusCadastro: "ativo" });
    expect(await condominiosPermitidosFilaCnab(ctx().user!)).toEqual([1, 2, 3, 5]);
  });
  it("carteira vazia explícita nega fila e processamento sem sentinela", async () => {
    fixture.state.tables.userCondominios = [];
    await expect(condominiosPermitidosFilaCnab(ctx().user!)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().cnab.processarRetorno({ nomeArquivo: "fixture", conteudo: "fixture" })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("NULL advogado preserva dispensa histórica, incluindo revisão externa e upload", async () => {
    user().escopoCondominios = null;
    await caller().cnab.listarRemessas({ condominioId: 3 }); expect(mocks.remessas).toHaveBeenCalledWith(3);
    expect((await caller().cnab.listarExcecoesRetorno({ limit: 1 }))[0].id).toBe(801);
    await caller().cnab.revisarExcecaoRetorno({ retornoItemId: 801, acao: "ignorada", justificativa: "fixture" });
    await caller().cnab.uploadBoleto({ ...upload, cobrancaId: 303, condominioId: 3 }); expect(mocks.storage).toHaveBeenCalledTimes(1);
  });
  it("NULL colaborador mantém fórmula principal, admin conserva retorno 0", async () => {
    user().escopoCondominios = null; user().role = "colaborador"; user().condominioId = 1;
    await caller().cnab.listarRemessas({ condominioId: 3 }); expect(mocks.remessas).toHaveBeenCalledWith(1);
    user().role = "admin"; user().condominioId = null;
    expect(await resolverCondominioRetornoDocumento(ctx("admin").user!)).toBe(0); expect(await condominiosPermitidosFilaCnab(ctx("admin").user!)).toBeUndefined();
  });
  it.each(["sindico", "cobrador"])("%s nunca aceita todos", async role => {
    user().role = role; user().escopoCondominios = "todos";
    await expect(caller().cnab.listarRemessas({ condominioId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("revogação na sessão antiga bloqueia na próxima requisição", async () => {
    const stale = caller(); user().isActive = 0;
    await expect(stale.cnab.uploadBoleto(upload)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.storage).not.toHaveBeenCalled();
  });
});

describe("modelos e anexos — tenant real e compartilhados especiais", () => {
  it("list selecionados inclui compartilhados NULL sem liberar outros tenants", async () => {
    expect((await caller().modelosDocumento.list({})).map(item => item.id)).toEqual([901, 903]);
    expect(modelSql[0].sql).toContain(" in "); expect(modelSql[0].sql).toContain(" is null"); expect(modelSql[0].params).toEqual([1, 1, 2]); expect(mocks.listModelos).not.toHaveBeenCalled();
  });
  it("list todos inclui somente ativos atuais e compartilhados", async () => {
    user().escopoCondominios = "todos";
    expect((await caller().modelosDocumento.list({ condominioId: null })).map(item => item.id)).toEqual([901, 902, 903]);
    await expect(caller().modelosDocumento.list({ condominioId: 4 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["getById", "update", "delete"] as const)("%s rejeita ID externo antes de mutation", async route => {
    await expect(caller().modelosDocumento[route]({ id: 902 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.updateModelo).not.toHaveBeenCalled(); expect(mocks.deleteModelo).not.toHaveBeenCalled();
  });
  it("PDF externo nega antes de gerador/storage e compartilhado mantém política", async () => {
    await expect(caller().modelosDocumento.gerarPDF({ modeloId: 902 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.pdf).not.toHaveBeenCalled(); expect(mocks.storage).not.toHaveBeenCalled();
    await caller().modelosDocumento.gerarPDF({ modeloId: 903 }); expect(mocks.pdf).toHaveBeenCalledTimes(1);
  });
  it("modelos compartilhados preservam update/delete anteriores", async () => {
    await caller().modelosDocumento.update({ id: 903, nome: "fixture" }); await caller().modelosDocumento.delete({ id: 903 });
    expect(mocks.updateModelo).toHaveBeenCalledWith(903, { nome: "fixture" }); expect(mocks.deleteModelo).toHaveBeenCalledWith(903);
  });
  it("create explícito resolve concreto e não cria compartilhado implícito", async () => {
    await caller().modelosDocumento.create({ nome: "fixture", tipo: "outro", conteudoHtml: "", condominioId: null });
    expect(mocks.createModelo).toHaveBeenCalledWith(expect.objectContaining({ condominioId: 1 }));
    await expect(caller().modelosDocumento.create({ nome: "fixture", tipo: "outro", conteudoHtml: "", condominioId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.createModelo).toHaveBeenCalledTimes(1);
  });
  it("anexos externos negam list/upload antes de storage", async () => {
    await expect(caller().modelosDocumento.listAnexos({ modeloId: 902 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().modelosDocumento.addAnexo({ modeloId: 902, nomeArquivo: "fixture.png", mimeType: "image/png", base64: "YQ==" })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.createAnexo).not.toHaveBeenCalled();
  });
  it("anexos permitidos preservam upload e mutations originais", async () => {
    await caller().modelosDocumento.addAnexo({ modeloId: 901, nomeArquivo: "fixture.png", mimeType: "image/png", base64: "YQ==" });
    expect(mocks.createAnexo).toHaveBeenCalledWith(expect.objectContaining({ modeloId: 901, tamanhoBytes: 1 }));
    await caller().modelosDocumento.updateAnexo({ id: 1001, legenda: "fixture" }); await caller().modelosDocumento.deleteAnexo({ id: 1001 });
    expect(mocks.updateAnexo).toHaveBeenCalledWith(1001, { legenda: "fixture" }); expect(mocks.deleteAnexo).toHaveBeenCalledWith(1001);
  });
  it.each(["updateAnexo", "deleteAnexo"] as const)("%s valida modelo real por ID do anexo", async route => {
    await expect(caller().modelosDocumento[route]({ id: 1002 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.updateAnexo).not.toHaveBeenCalled(); expect(mocks.deleteAnexo).not.toHaveBeenCalled();
  });
  it("reordenar valida lote de anexos inteiro sem escrita parcial", async () => {
    await expect(caller().modelosDocumento.reordenarAnexos({ modeloId: 901, ids: [1001, 1002] })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.ordem).not.toHaveBeenCalled();
    await caller().modelosDocumento.reordenarAnexos({ modeloId: 901, ids: [1001] }); expect(mocks.ordem).toHaveBeenCalledWith(901, [1001]);
  });
  it("zero carteira nega mesmo modelo compartilhado", async () => {
    fixture.state.tables.userCondominios = [];
    await expect(caller().modelosDocumento.getById({ id: 903 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().modelosDocumento.list({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("NULL preserva list e CRUD externo originais", async () => {
    user().escopoCondominios = null;
    expect((await caller().modelosDocumento.list({}))[0].id).toBe(999); expect(mocks.listModelos).toHaveBeenCalledWith(null);
    await caller().modelosDocumento.update({ id: 902, nome: "fixture" }); expect(mocks.updateModelo).toHaveBeenCalledWith(902, { nome: "fixture" });
    await caller().modelosDocumento.deleteAnexo({ id: 1002 }); expect(mocks.deleteAnexo).toHaveBeenCalledWith(1002);
  });
});
