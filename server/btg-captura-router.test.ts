import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { criarDbDiagnosticosTeste } from "./btg-captura-router-test-db";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./btg-v2/config", () => ({ getBtgV2ServerConfig: mocks.config }));
import { btgDiagnosticosRouter } from "./routers/btg-diagnosticos";
import { aadDiagnosticoBtg, cifrarDiagnosticoBtg, RETENCAO_DIAGNOSTICO_BTG_MS } from "./btg-v2/diagnosticos-crypto";

const NOW = new Date("2026-11-06T20:00:00.000Z");
const payload = '{"payer":{"name":"Ana Sintética","taxId":"52998224725","address":"Rua Particular"},"documentNumber":"00000020"}';
const resposta = '<html><script>globalThis.EXECUTOU = true</script>Erro: Ana Sintética — validação é inválida</html>';
const visualizarInput = { diagnosticoId: 50, confirmacao: true as const, finalidade: "Investigar validação bancária" };
const expurgarInput = { diagnosticoId: 50, confirmacao: "EXPURGAR DIAGNOSTICO BTG" as const };
let fixture: ReturnType<typeof criarDbDiagnosticosTeste>;
let fetchMock: ReturnType<typeof vi.fn>;
let antesFinanceiro: string;
const financeiro = ["parcelasAcordo", "acordos", "btgCobrancasEmitidas", "btgRemessas", "btgContasRecebedoras"];

function context(role: string = "admin"): TrpcContext {
  return { user: { id: 10, role, name: "Nome da sessão desatualizado", condominioId: 999 },
    req: { headers: { authorization: "Bearer segredo-session", "user-agent": "52998224725" }, socket: {} }, res: {},
  } as unknown as TrpcContext;
}
function caller(role = "admin") { return btgDiagnosticosRouter.createCaller(context(role)); }
function digest(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
function row() { return fixture.state.tables.btgHttpDiagnosticos[0]; }
function evidencia(body = Buffer.from(resposta), completa = 1) {
  const metadata = { id: 50, chaveCaptura: "a71d74c3-e97c-441e-b09b-cffb15f7874c", ambiente: "sandbox",
    btgIntegracaoId: 1, btgCobrancaEmitidaId: 40, btgRemessaId: 30, parcelaAcordoId: 20,
    condominioId: 2, usuarioId: 11, operacao: "emissao", estadoCaptura: completa ? "resposta_recebida" : "resposta_incompleta",
    httpStatus: 400, correlationId: "00000020", capturaCriadaEm: new Date(NOW.getTime() - 1000),
    respostaRecebidaEm: NOW, conteudoExpurgadoEm: null, updatedAt: NOW, versaoCriptografia: "v1",
    payloadBytes: Buffer.byteLength(payload), respostaBytes: body.byteLength,
    payloadSha256: digest(Buffer.from(payload)), respostaSha256: digest(body), respostaCompleta: completa,
  };
  const aad = aadDiagnosticoBtg(metadata);
  return { ...metadata, payloadCifrado: cifrarDiagnosticoBtg(Buffer.from(payload), aad), respostaCifrada: cifrarDiagnosticoBtg(body, aadDiagnosticoBtg(metadata, "resposta")) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  fetchMock = vi.fn(() => { throw new Error("Rede proibida"); }); vi.stubGlobal("fetch", fetchMock);
  mocks.config.mockReturnValue({ ambiente: "sandbox", companyId: "30306294000145" });
  fixture = criarDbDiagnosticosTeste({
    users: [{ id: 10, role: "admin", isActive: 1, isDeleted: 0 }],
    btgIntegracoes: [{ id: 1, ambiente: "sandbox", companyId: "30306294000145" }, { id: 9, ambiente: "producao", companyId: "00000000000000" }],
    condominios: [{ id: 2, statusCadastro: "ativo" }, { id: 3, statusCadastro: "ativo" }],
    btgContasRecebedoras: [{ id: 7, btgIntegracaoId: 1 }],
    devedores: [{ id: 4, condominioId: 2 }], acordos: [{ id: 5, condominioId: 2, devedorId: 4, status: "ativo" }],
    parcelasAcordo: [{ id: 20, acordoId: 5, status: "pendente", amount: 1852, canalBancario: "api_btg_v2", nossoNumero: "00000020" }],
    btgCobrancasEmitidas: [{ id: 40, btgIntegracaoId: 1, btgContaRecebedoraId: 7, btgRemessaId: 30,
      condominioId: 2, origemTipo: "parcela_acordo", origemId: 20, status: "incerta" }],
    btgRemessas: [{ id: 30, btgIntegracaoId: 1, btgContaRecebedoraId: 7, condominioId: 2, status: "falha" }],
    // O item histórico pode estar sem vínculo; a consulta usa a canônica real.
    btgRemessaItens: [{ id: 60, btgRemessaId: 30, parcelaAcordoId: 20, btgCobrancaEmitidaId: null }],
    btgHttpDiagnosticos: [evidencia()], auditLogs: [],
  });
  antesFinanceiro = JSON.stringify(financeiro.map(table => fixture.state.tables[table]));
  mocks.getDb.mockResolvedValue(fixture.db);
});
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  expect(fixture.db.execute).not.toHaveBeenCalled(); expect(fixture.db.delete).not.toHaveBeenCalled();
  expect(fixture.state.writes.every(write => ["auditLogs", "btgHttpDiagnosticos"].includes(write.table))).toBe(true);
  vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

function semMudancaFinanceira() { expect(JSON.stringify(financeiro.map(table => fixture.state.tables[table]))).toBe(antesFinanceiro); }
function semCorposNasListas(list: unknown) {
  const text = JSON.stringify(list);
  for (const value of [payload, resposta, "payloadCifrado", "respostaCifrada", "payloadSha256", "52998224725", "Rua Particular", "chaveCaptura"]) expect(text).not.toContain(value);
  for (const read of fixture.state.reads.filter(read => read.table === "btgHttpDiagnosticos")) {
    expect(read.columns).not.toBeNull(); expect(read.columns).not.toContain("payloadCifrado"); expect(read.columns).not.toContain("respostaCifrada");
  }
}

describe("btgDiagnosticos — listagens só com metadados e admin fresco", () => {
  it("lista captura por emissão e remessa mesmo com item de falha sem ID canônico", async () => {
    const emissao = await caller().listarPorEmissao({ emissaoId: 40 });
    const remessa = await caller().listarPorRemessa({ remessaId: 30 });
    expect(emissao).toEqual(remessa);
    expect(emissao).toEqual([{ id: 50, btgCobrancaEmitidaId: 40, estadoCaptura: "resposta_recebida", httpStatus: 400,
      parcelaAcordoId: 20,
      payloadBytes: Buffer.byteLength(payload), respostaBytes: Buffer.byteLength(resposta), respostaCompleta: true,
      capturaCriadaEm: new Date(NOW.getTime() - 1000), respostaRecebidaEm: NOW, conteudoExpurgadoEm: null,
      updatedAt: NOW, podeVisualizar: true, podeExpurgar: false }]);
    semCorposNasListas([emissao, remessa]); semMudancaFinanceira(); expect(fixture.state.writes).toEqual([]);
  });
  it("registros anteriores à captura retornam [] sem reconstruir ou reenviar", async () => {
    fixture.state.tables.btgHttpDiagnosticos = [];
    expect(await caller().listarPorEmissao({ emissaoId: 40 })).toEqual([]);
    expect(await caller().listarPorRemessa({ remessaId: 30 })).toEqual([]);
    expect(fixture.state.writes).toEqual([]); semMudancaFinanceira();
  });
  it.each(["advogado", "colaborador", "sindico", "cobrador"])("bloqueia %s mesmo com carteira válida antes de DB", async role => {
    const c = caller(role);
    await expect(c.listarPorEmissao({ emissaoId: 40 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.listarPorRemessa({ remessaId: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.visualizar(visualizarInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(c.expurgar(expurgarInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("bloqueia anônimo antes de DB", async () => {
    const c = btgDiagnosticosRouter.createCaller({ ...context(), user: null });
    await expect(c.visualizar(visualizarInput)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each([{ role: "cobrador" }, { isActive: 0 }, { isDeleted: 1 }])("perfil da sessão não prevalece sobre usuário fresco %j", async change => {
    Object.assign(fixture.state.tables.users[0], change);
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().listarPorEmissao({ emissaoId: 40 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.state.reads.every(read => read.table === "users")).toBe(true); expect(fixture.state.writes).toEqual([]);
  });
  it("nega sessão de usuário removido no banco", async () => {
    fixture.state.tables.users = [];
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([0, -1, 1.5, 2_147_483_648])("rejeita ID inválido %s antes de DB", async id => {
    await expect(caller().visualizar({ ...visualizarInput, diagnosticoId: id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("admin global não é limitado pelo condominioId obsoleto da sessão", async () => {
    expect((await caller().visualizar(visualizarInput)).payload).toBe(payload);
  });
});

describe("btgDiagnosticos — contextos atuais e IDs não enumeráveis", () => {
  it.each([
    ["captura ausente", () => { fixture.state.tables.btgHttpDiagnosticos = []; }],
    ["integração da captura", () => { row().btgIntegracaoId = 9; }],
    ["ambiente da captura", () => { row().ambiente = "producao"; }],
    ["company runtime", () => { mocks.config.mockReturnValue({ ambiente: "sandbox", companyId: "outro" }); }],
    ["emissão ausente", () => { fixture.state.tables.btgCobrancasEmitidas = []; }],
    ["emissão integração", () => { fixture.state.tables.btgCobrancasEmitidas[0].btgIntegracaoId = 9; }],
    ["emissão condomínio", () => { fixture.state.tables.btgCobrancasEmitidas[0].condominioId = 3; }],
    ["captura parcela", () => { row().parcelaAcordoId = 999; }],
    ["captura condomínio", () => { row().condominioId = 3; }],
    ["captura remessa", () => { row().btgRemessaId = null; }],
    ["parcela acordo", () => { fixture.state.tables.parcelasAcordo[0].acordoId = 999; }],
    ["acordo carteira", () => { fixture.state.tables.acordos[0].condominioId = 3; }],
    ["devedor carteira", () => { fixture.state.tables.devedores[0].condominioId = 3; }],
    ["condomínio removido", () => { fixture.state.tables.condominios = []; }],
    ["remessa carteira", () => { fixture.state.tables.btgRemessas[0].condominioId = 3; }],
    ["item remessa ausente", () => { fixture.state.tables.btgRemessaItens = []; }],
    ["item remessa outra emissão", () => { fixture.state.tables.btgRemessaItens[0].btgCobrancaEmitidaId = 999; }],
    ["conta outra integração", () => { fixture.state.tables.btgContasRecebedoras[0].btgIntegracaoId = 9; }],
  ] as const)("nega %s sem revelar vínculo", async (_name, mutate) => {
    mutate();
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "NOT_FOUND", message: "Diagnóstico BTG não disponível." });
    expect(fixture.state.writes).toEqual([]);
  });
  it("listagem também rejeita vínculo adulterado, não vaza nem metadata", async () => {
    row().condominioId = 3;
    await expect(caller().listarPorRemessa({ remessaId: 30 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller().listarPorEmissao({ emissaoId: 40 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("btgDiagnosticos — plaintext só após commit da auditoria estrita", () => {
  it("devolve corpos exatos/HTML inerte e audita apenas IDs/ator/motivo fixo", async () => {
    const result = await caller().visualizar({ ...visualizarInput, finalidade: "CPF 52998224725 Rua Particular token segredo-session" });
    expect(result).toMatchObject({ id: 50, payload, resposta, httpStatus: 400, respostaCompleta: true,
      estadoCaptura: "resposta_recebida", respostaLimitada: false, respostaUtf8Invalido: false });
    expect(fixture.state.committed).toBe(1);
    const audit = fixture.state.tables.auditLogs[0];
    expect(audit).toMatchObject({ userId: 10, userRole: "admin", action: "diagnostico_visualizado", entityId: "50", condominioId: 2 });
    expect(JSON.parse(audit.metadata)).toMatchObject({ finalidade: "diagnostico_integ", diagnosticoId: 50, usuarioId: 10 });
    for (const value of ["52998224725", "Rua Particular", "segredo-session", "Nome da sessão", "payloadCifrado", "<script>"]) expect(JSON.stringify(audit)).not.toContain(value);
    expect(fixture.state.locks).toContainEqual({ table: "users", mode: "share" }); semMudancaFinanceira();
  });
  it("lock emissão/contexto vem antes do lock diagnóstico", async () => {
    await caller().visualizar(visualizarInput);
    const tables = fixture.state.locks.map(lock => lock.table);
    expect(tables.indexOf("btgCobrancasEmitidas")).toBeLessThan(tables.indexOf("btgHttpDiagnosticos"));
  });
  it("não aceita resposta cifrada copiada do payload mesmo com hash e tamanho iguais", async () => {
    Object.assign(row(), { respostaCifrada: row().payloadCifrado, respostaSha256: row().payloadSha256, respostaBytes: row().payloadBytes });
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(fixture.state.writes).toEqual([]);
  });
  it.each(["failAudit", "failCommit"] as const)("%s impede entrega e preserva captura sem vazamento de causa", async flag => {
    fixture.state[flag] = true;
    const before = structuredClone(row());
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível acessar o diagnóstico BTG agora.", cause: undefined });
    expect(fixture.state.tables.auditLogs).toEqual([]); expect(row()).toEqual(before); semMudancaFinanceira();
  });
  it.each([false, undefined])("exige confirmação explícita %s", async confirmacao => {
    await expect(caller().visualizar({ ...visualizarInput, confirmacao } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each(["     ", "  123456789  ", "a".repeat(201)])("valida finalidade após trim", async finalidade => {
    await expect(caller().visualizar({ ...visualizarInput, finalidade })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("falha de transporte não inventa resposta", async () => {
    Object.assign(row(), { respostaCifrada: null, respostaSha256: null, respostaBytes: null, respostaCompleta: 0,
      estadoCaptura: "sem_resposta", httpStatus: null, respostaRecebidaEm: null });
    expect(await caller().visualizar(visualizarInput)).toMatchObject({ payload, resposta: null, respostaCompleta: false, httpStatus: null, estadoCaptura: "sem_resposta" });
  });
  it("UTF-8 inválido e prefixo incompleto têm flags explícitas sem execução", async () => {
    Object.assign(row(), evidencia(Buffer.concat([Buffer.from("<script>não executar</script>"), Buffer.from([0xc3])]), 0));
    expect(await caller().visualizar(visualizarInput)).toMatchObject({ resposta: "<script>não executar</script>�",
      respostaCompleta: false, respostaLimitada: true, respostaUtf8Invalido: true });
  });
  it.each(["payloadCifrado", "respostaCifrada"])("adulteração de %s nega tudo antes de audit", async column => {
    const parts = row()[column].split(":"); parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1); row()[column] = parts.join(":");
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); expect(fixture.state.writes).toEqual([]);
  });
  it("AAD/chave/metadata de integridade trocados são recusados", async () => {
    row().chaveCaptura = "b71d74c3-e97c-441e-b09b-cffb15f7874c";
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    row().chaveCaptura = "a71d74c3-e97c-441e-b09b-cffb15f7874c"; row().payloadBytes++;
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    row().payloadBytes--; vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" }); expect(fixture.state.writes).toEqual([]);
  });
});

describe("btgDiagnosticos — TTL exato e expurgo manual com rollback", () => {
  it("um milissegundo antes de 30 dias permite visualizar, mas não expurgar", async () => {
    row().capturaCriadaEm = new Date(NOW.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS + 1);
    expect((await caller().visualizar(visualizarInput)).payload).toBe(payload);
    await expect(caller().expurgar(expurgarInput)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" }); semMudancaFinanceira();
  });
  it("no limite de 30 dias recusa leitura, preserva cifras e habilita só expurgo", async () => {
    row().capturaCriadaEm = new Date(NOW.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS);
    const before = structuredClone(row());
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(row()).toEqual(before); expect(fixture.state.writes).toEqual([]);
    fixture.state.reads = [];
    const list = await caller().listarPorRemessa({ remessaId: 30 }); expect(list[0]).toMatchObject({ podeVisualizar: false, podeExpurgar: true });
    semCorposNasListas(list);
  });
  it("expurga apenas corpos e conserva hashes, status, bytes e livro financeiro", async () => {
    row().capturaCriadaEm = new Date(NOW.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS);
    const before = structuredClone(row());
    expect(await caller().expurgar(expurgarInput)).toEqual({ id: 50, conteudoExpurgadoEm: NOW });
    expect(row()).toEqual({ ...before, payloadCifrado: null, respostaCifrada: null, conteudoExpurgadoEm: NOW, updatedAt: NOW });
    expect(fixture.state.tables.auditLogs[0].action).toBe("diagnostico_expurgado"); semMudancaFinanceira();
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(caller().expurgar(expurgarInput)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect((await caller().listarPorEmissao({ emissaoId: 40 }))[0]).toMatchObject({ podeVisualizar: false, podeExpurgar: false });
  });
  it.each(["failAudit", "failCommit"] as const)("%s desfaz a limpeza dos corpos", async flag => {
    row().capturaCriadaEm = new Date(NOW.getTime() - RETENCAO_DIAGNOSTICO_BTG_MS); fixture.state[flag] = true;
    const before = structuredClone(row());
    await expect(caller().expurgar(expurgarInput)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(row()).toEqual(before); expect(fixture.state.writes).toEqual([]); expect(fixture.state.tables.auditLogs).toEqual([]); semMudancaFinanceira();
  });
  it("literal errado não limpa nada", async () => {
    await expect(caller().expurgar({ ...expurgarInput, confirmacao: "EXPURGAR" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});

describe('captura histórica após reenvio autorizado',()=>{
  function cadeia(){
    fixture.state.tables.btgRemessaItens[0].btgCobrancaEmitidaId=41;
    fixture.state.tables.btgCobrancasEmitidas.push({...fixture.state.tables.btgCobrancasEmitidas[0],id:41});
    fixture.state.tables.btgRecuperacoes=[{id:1,btgIntegracaoId:1,emissaoAnteriorId:40,novaEmissaoId:41,parcelaAcordoId:20,btgRemessaId:30,condominioId:2,acao:'reenviar',estado:'consumida'}];
    antesFinanceiro=JSON.stringify(financeiro.map(table=>fixture.state.tables[table]));
  }
  it('permite metadata e leitura auditada da captura R1 apesar do item apontarR2',async()=>{
    cadeia();const list=await caller().listarPorEmissao({emissaoId:40});expect(list[0].id).toBe(50);semCorposNasListas(list);
    const content=await caller().visualizar(visualizarInput);expect(content.payload).toBe(payload);semMudancaFinanceira();
  });
  it.each(['estado','acao','condominioId','parcelaAcordoId','novaEmissaoId'])('não aceita cadeia com %s divergente',async(campo)=>{
    cadeia();fixture.state.tables.btgRecuperacoes[0][campo]=campo==='estado'?'analisada':campo==='acao'?'bloqueada':999;
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({code:'NOT_FOUND'});expect(fixture.state.writes).toEqual([]);
  });
  it('destino da recuperação deve pertencer à mesma carteira/conta/parcela',async()=>{
    cadeia();fixture.state.tables.btgCobrancasEmitidas[1].condominioId=3;
    await expect(caller().visualizar(visualizarInput)).rejects.toMatchObject({code:'NOT_FOUND'});
  });
});
