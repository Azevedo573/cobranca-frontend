import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { criarDbBtgEmMemoria } from "./btg-v2-manual-producao-test-db";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: vi.fn(), status: vi.fn(), token: vi.fn(), bank: vi.fn(), audit: vi.fn(), accounts: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./btg-oauth", () => ({ getBtgOAuthConfig: mocks.config, getStatusOAuthBtg: mocks.status, obterAccessTokenBtg: mocks.token, consultaContasBtgHabilitada: mocks.accounts }));
vi.mock("./btg-v2/client", () => ({ criarBolePixBtgV2: mocks.bank }));
vi.mock("./audit", () => ({ logAudit: mocks.audit }));
vi.mock("./btg-v2/diagnosticos", async () => ({ criarCapturaHttpBtg: (await import("./btg-v2-http-captura-test-helper")).criarCapturaMock }));

import { BtgV2HttpError } from "./btg-v2/errors";
import { btgV2Router } from "./routers/btg-v2";
import { normalizarContaManualProducao, consultarContasRecebedorasBtg } from "./btg-v2/config";
import { emitirBolePixV2, prepararEmissaoParcelasAcordoBtgV2 } from "./btg-v2/issuance";

const cnpj = "30306294000145";
const config = { ambiente: "producao" as const, companyId: cnpj };
const dados = { rotulo: "Conta escritório", agencia: "0050", numero: "0003081850", documentoBeneficiario: "30.306.294/0001-45", nomeBeneficiario: "Escritório Teste", dadosConferidos: true as const, confirmacao: "CADASTRAR CONTA PRODUCAO" as const };
const integracao = { id: 7, ...config, ativo: 1, emissaoHabilitada: 0, diasLimitePagamento: 60, instrucoes: null };
const ctx = (role = "admin") => ({ req: { headers: { "user-agent": "vitest" }, socket: { remoteAddress: "127.0.0.1" } }, res: {}, user: { id: 10, role, name: "Admin", email: "admin@example.invalid" } } as unknown as TrpcContext);
const manual = () => ({ id: 15, ...normalizarContaManualProducao(dados, cnpj), btgIntegracaoId: 7, ativo: 1, confirmadoPorId: 10, confirmadoEm: new Date("2026-11-05T20:00:00Z"), ultimaSincronizacaoEm: new Date("2026-11-05T20:00:00Z") });
let fixture: ReturnType<typeof criarDbBtgEmMemoria>;
let fetchMock: ReturnType<typeof vi.fn>;
function setup(tables: Record<string, any[]> = {}) {
  fixture = criarDbBtgEmMemoria({ btgIntegracoes: [integracao], btgContasRecebedoras: [], condominios: [{ id: 2, name: "Condomínio" }], btgContaRecebedoraCondominios: [], ...tables });
  mocks.getDb.mockResolvedValue(fixture.db);
  return btgV2Router.createCaller(ctx());
}
function setupEmissao(overrides: Record<string, any[]> = {}) {
  return setup({
    btgIntegracoes: [{ ...integracao, emissaoHabilitada: 1 }], btgContasRecebedoras: [manual()],
    btgContaRecebedoraCondominios: [{ id: 3, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, ativo: 1 }],
    acordos: [{ id: 11, condominioId: 2, devedorId: 21, status: "ativo" }],
    parcelasAcordo: [{ id: 31, acordoId: 11, installmentNumber: 1, amount: 12599, dueDate: new Date("2026-12-01T12:00:00Z"), status: "pendente", nossoNumero: null, remessaId: null, statusRemessa: "nao_enviado", btgCollectionId: null }],
    devedores: [{ id: 21, condominioId: 2, name: "Pagador", cpfCnpj: "52998224725", address: "Rua Teste", addressNumber: "1", neighborhood: "Centro", city: "São Paulo", state: "SP", zipCode: "01001000" }],
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue(config);
  mocks.status.mockResolvedValue({ status: "conectado", consultaContasHabilitada: false });
  mocks.accounts.mockReturnValue(false);
  mocks.token.mockRejectedValue(new Error("token must not be requested"));
  mocks.bank.mockResolvedValue({ collectionId: "collection-test", status: "CREATED", bankSlipUrl: null, pixQrCode: null, pixCopiaECola: null, codigoBarras: null, linhaDigitavel: null, nossoNumero: null });
  fetchMock = vi.fn().mockRejectedValue(new Error("network forbidden"));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("BTG_WEBHOOK_SECRET", "test-only");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function semBanco() { expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.bank).not.toHaveBeenCalled(); }

describe("BTG manual Produção — router transacional", () => {
  it("admin registra sem banco/ativação e audita confirmação/ator/data com conta mascarada", async () => {
    const caller = setup();
    const registrada = await caller.cadastrarContaManualProducao(dados);
    expect(registrada).toMatchObject({ origemCadastro: "manual_producao", confirmadoPorId: 10, agencia: "0050", numeroMascarado: "••••••1850" });
    expect(registrada.confirmadoEm).toBeInstanceOf(Date);
    expect(fixture.state.tables.btgIntegracoes[0].emissaoHabilitada).toBe(0);
    expect(fixture.state.tables.btgContasRecebedoras[0]).toMatchObject({ numero: "0003081850", documentoBeneficiario: cnpj });
    expect(fixture.state.transactions).toBe(1);
    expect(fixture.state.locks).toContain("btgIntegracoes:update");
    const audit = fixture.state.tables.auditLogs[0];
    expect(audit).toMatchObject({ userId: 10, action: "config_change", severity: "warning" });
    expect(JSON.parse(audit.metadata)).toMatchObject({ dadosConferidos: true, confirmacao: dados.confirmacao, validadaPelaApi: false });
    expect(audit.afterData).not.toContain("0003081850");
    expect(audit.afterData).not.toContain(cnpj);
    semBanco();
  });

  it("rollback do cadastro se auditoria estrita falha", async () => {
    const caller = setup({ btgIntegracoes: [] });
    fixture.state.failAudit = true;
    await expect(caller.cadastrarContaManualProducao(dados)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(fixture.state.tables.btgContasRecebedoras).toEqual([]);
    expect(fixture.state.tables.btgIntegracoes).toEqual([]);
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("não-admin ou anônimo nunca chega ao banco", async () => {
    setup();
    for (const context of [ctx("cobrador"), { ...ctx(), user: null }]) {
      await expect(btgV2Router.createCaller(context).cadastrarContaManualProducao(dados)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocks.getDb).not.toHaveBeenCalled();
    semBanco();
  });

  it.each([{ confirmacao: "CADASTRAR" }, { confirmacao: undefined }, { dadosConferidos: false }, { dadosConferidos: undefined }, { agencia: "50-1" }, { numero: "" }, { nomeBeneficiario: " " }, { documentoBeneficiario: "30306294000144" }, { documentoBeneficiario: "04252011000110" }])("rejeita entrada inválida sem efeito parcial: %j", async alteracao => {
    const caller = setup();
    await expect(caller.cadastrarContaManualProducao({ ...dados, ...alteracao } as any)).rejects.toBeDefined();
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it.each(["desconectado", "expirado", "erro_configuracao"])("sem OAuth conectado (%s) não cadastra", async status => {
    const caller = setup();
    mocks.status.mockResolvedValue({ status });
    await expect(caller.cadastrarContaManualProducao(dados)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("recusa ambiente Sandbox e CNPJ histórico divergente sem migrar dados", async () => {
    const caller = setup({ btgIntegracoes: [{ ...integracao, companyId: "04252011000110" }] });
    await expect(caller.cadastrarContaManualProducao(dados)).rejects.toThrow("CNPJ");
    expect(fixture.state.tables.btgIntegracoes[0].companyId).toBe("04252011000110");
    mocks.config.mockReturnValue({ ...config, ambiente: "sandbox" });
    await expect(caller.cadastrarContaManualProducao(dados)).rejects.toThrow("Produção");
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("repetição é idempotente; nunca sobrescreve nome/rótulo de conta já usada", async () => {
    const caller = setup({ btgContasRecebedoras: [manual()], btgCobrancasEmitidas: [{ id: 8, btgContaRecebedoraId: 15 }] });
    expect((await caller.cadastrarContaManualProducao(dados)).id).toBe(15);
    await expect(caller.cadastrarContaManualProducao({ ...dados, nomeBeneficiario: "Novo titular" })).rejects.toThrow("imutável");
    await expect(caller.cadastrarContaManualProducao({ ...dados, rotulo: "Outro rótulo" })).rejects.toThrow("imutável");
    expect(fixture.state.tables.btgContasRecebedoras[0]).toEqual(manual());
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("nova conta é outro registro e não altera conta emitida nem vínculo antigo", async () => {
    const antiga = manual();
    const caller = setup({ btgContasRecebedoras: [antiga], btgContaRecebedoraCondominios: [{ id: 3, btgIntegracaoId: 7, condominioId: 2, btgContaRecebedoraId: 15, ativo: 1 }] });
    const nova = await caller.cadastrarContaManualProducao({ ...dados, numero: "0003081851" });
    expect(nova.id).not.toBe(15);
    expect(fixture.state.tables.btgContasRecebedoras[0]).toEqual(antiga);
    expect(fixture.state.tables.btgContaRecebedoraCondominios[0].btgContaRecebedoraId).toBe(15);
    semBanco();
  });

  it("vínculo consulta a conta atual e recusa Sandbox, não confirmada ou API com CNPJ divergente", async () => {
    for (const patch of [{ origemCadastro: "manual_sandbox", accountId: "manual-sandbox:old" }, { confirmadoPorId: null }, { documentoBeneficiario: "04252011000110", origemCadastro: "api", accountId: "official" }, { btgIntegracaoId: 99 }]) {
      const caller = setup({ btgContasRecebedoras: [{ ...manual(), ...patch }] });
      await expect(caller.vincularContaCondominio({ condominioId: 2, contaRecebedoraId: 15 })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(fixture.state.writes).toEqual([]);
    }
    semBanco();
  });

  it("vínculo manual confirmado audita mudança explícita sem ativar emissão", async () => {
    const caller = setup({ btgContasRecebedoras: [manual()] });
    await expect(caller.vincularContaCondominio({ condominioId: 2, contaRecebedoraId: 15 })).resolves.toEqual({ success: true });
    expect(fixture.state.tables.btgContaRecebedoraCondominios[0].btgContaRecebedoraId).toBe(15);
    expect(fixture.state.tables.btgIntegracoes[0].emissaoHabilitada).toBe(0);
    semBanco();
  });

  it("liberação continua exigindo webhook, OAuth e confirmação literal separada", async () => {
    const caller = setupEmissao({ btgIntegracoes: [integracao] });
    vi.stubEnv("BTG_WEBHOOK_SECRET", "");
    await expect(caller.habilitarEmissaoProducao({ confirmacao: "LIBERAR PRODUCAO" })).rejects.toThrow("webhook");
    vi.stubEnv("BTG_WEBHOOK_SECRET", "test-only");
    mocks.status.mockResolvedValue({ status: "desconectado" });
    await expect(caller.habilitarEmissaoProducao({ confirmacao: "LIBERAR PRODUCAO" })).rejects.toThrow("Conecte");
    await expect(caller.habilitarEmissaoProducao({ confirmacao: "HOMOLOGAR" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fixture.state.tables.btgIntegracoes[0].emissaoHabilitada).toBe(0);
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("liberação aceita manual confirmado ou API legado sem documento e rejeita origens exatas inválidas", async () => {
    for (const patch of [{}, { origemCadastro: "api", accountId: "official", documentoBeneficiario: null }]) {
      const caller = setupEmissao({ btgIntegracoes: [integracao], btgContasRecebedoras: [{ ...manual(), ...patch }] });
      await expect(caller.habilitarEmissaoProducao({ confirmacao: "LIBERAR PRODUCAO" })).resolves.toEqual({ success: true });
      expect(fixture.state.tables.btgIntegracoes[0].emissaoHabilitada).toBe(1);
    }
    for (const patch of [{ origemCadastro: "manual_sandbox" }, { confirmadoEm: null }, { confirmadoPorId: null }, { documentoBeneficiario: "04252011000110" }]) {
      const caller = setupEmissao({ btgIntegracoes: [integracao], btgContasRecebedoras: [{ ...manual(), ...patch }] });
      await expect(caller.habilitarEmissaoProducao({ confirmacao: "LIBERAR PRODUCAO" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect(fixture.state.tables.btgIntegracoes[0].emissaoHabilitada).toBe(0);
    }
    semBanco();
  });

  it("Accounts desativado recusa localmente antes de config/token/fetch e explica alternativa", async () => {
    await expect(consultarContasRecebedorasBtg(fetchMock as typeof fetch)).rejects.toThrow("cadastro manual");
    expect(mocks.config).not.toHaveBeenCalled();
    semBanco();
  });

  it("router Accounts desativado não cria integração nem consulta token/rede", async () => {
    const caller = setup({ btgIntegracoes: [] });
    await expect(caller.sincronizarContas()).rejects.toThrow("cadastro manual");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("consulta oficial não sobrescreve dados de conta API já usada e faz rollback", async () => {
    const antiga = { ...manual(), origemCadastro: "api", accountId: "official" };
    const caller = setup({ btgContasRecebedoras: [antiga], btgCobrancasEmitidas: [{ id: 8, btgContaRecebedoraId: 15 }] });
    mocks.accounts.mockReturnValue(true);
    mocks.token.mockResolvedValue("test-only-token");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accounts: [{ accountId: "official", branch: "0050", number: "0003081851", taxId: cnpj, legalName: dados.nomeBeneficiario }] }), { status: 200 }));
    await expect(caller.sincronizarContas()).rejects.toThrow("sobrescritos");
    expect(fixture.state.tables.btgContasRecebedoras[0]).toEqual(antiga);
    expect(fixture.state.writes).toEqual([]);
    expect(mocks.bank).not.toHaveBeenCalled();
  });
});

describe("BTG manual Produção — guardas de prévia/emissão", () => {
  it.each([{ origemCadastro: "manual_sandbox", accountId: "manual-sandbox:old" }, { confirmadoEm: null }, { documentoBeneficiario: "04252011000110" }, { origemCadastro: "api", accountId: "official", documentoBeneficiario: "04252011000110" }])("prévia e emissão recusam conta atual inválida antes da reserva: %j", async patch => {
    setupEmissao({ btgContasRecebedoras: [{ ...manual(), ...patch }] });
    await expect(prepararEmissaoParcelasAcordoBtgV2({ db: fixture.db, acordoId: 11 })).rejects.toBeDefined();
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toBeDefined();
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("runtime CNPJ atualizado bloqueia emissão e prévia antes da reserva sem atualizar integração antiga", async () => {
    setupEmissao();
    mocks.config.mockReturnValue({ ...config, companyId: "04252011000110" });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("CNPJ");
    await expect(prepararEmissaoParcelasAcordoBtgV2({ db: fixture.db, acordoId: 11 })).rejects.toThrow("CNPJ");
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("revalida CNPJ dentro do lock se runtime mudar entre leitura e reserva", async () => {
    setupEmissao();
    const transacao = fixture.db.transaction.getMockImplementation();
    fixture.db.transaction.mockImplementation(async (run: any) => {
      mocks.config.mockReturnValue({ ...config, companyId: "04252011000110" });
      return transacao(run);
    });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("CNPJ");
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("CNPJ muda após reserva: bloqueia POST e conserva reserva sem retry automático", async () => {
    setupEmissao();
    const transacao = fixture.db.transaction.getMockImplementation();
    fixture.db.transaction.mockImplementation(async (run: any) => {
      const result = await transacao(run);
      mocks.config.mockReturnValue({ ...config, companyId: "04252011000110" });
      return result;
    });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("CNPJ");
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("reservada");
    semBanco();
  });

  it("emissão recusa ausência OAuth/webhook antes da reserva", async () => {
    setupEmissao();
    mocks.status.mockResolvedValue({ status: "desconectado" });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("Conecte");
    mocks.status.mockResolvedValue({ status: "conectado" });
    vi.stubEnv("BTG_WEBHOOK_SECRET", "");
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("webhook");
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });

  it("preserva agência/conta no payload Collections e snapshot, sem enviar ID interno", async () => {
    setupEmissao();
    const result = await emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 });
    expect(result).toMatchObject({ status: "emitida", jaExistia: false });
    const payload = mocks.bank.mock.calls[0][0];
    expect(payload.account).toEqual({ branch: "0050", number: "0003081850" });
    expect(JSON.stringify(payload)).not.toContain("manual-producao:");
    expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({ agenciaRecebedora: "0050", contaRecebedora: "0003081850", amount: 12599, documentoBeneficiario: cnpj });
    expect(fixture.state.locks).toContain("btgIntegracoes:update");
    expect(mocks.bank).toHaveBeenCalledTimes(1);
    await emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 });
    expect(mocks.bank).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa bancária preserva estado incerto e evidência, sem retry cego", async () => {
    setupEmissao();
    mocks.bank.mockRejectedValue(new BtgV2HttpError({ httpStatus: 422, camposInvalidos: [], motivos: [] }));
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("422");
    expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({ status: "incerta", erroCodigo: "EMISSAO_SEM_CONFIRMACAO" });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).resolves.toMatchObject({ status: "incerta", jaExistia: true });
    expect(mocks.bank).toHaveBeenCalledTimes(1);
  });

  it("acordo inativo e parcela CNAB continuam bloqueados", async () => {
    setupEmissao({ acordos: [{ id: 11, condominioId: 2, devedorId: 21, status: "cancelado" }] });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow("acordo ativo");
    setupEmissao({ parcelasAcordo: [{ id: 31, acordoId: 11, status: "pendente", remessaId: 98 }] });
    await expect(emitirBolePixV2({ usuarioId: 10, db: fixture.db, parcelaId: 31 })).rejects.toThrow(/cnab/i);
    expect(fixture.state.writes).toEqual([]);
    semBanco();
  });
});
