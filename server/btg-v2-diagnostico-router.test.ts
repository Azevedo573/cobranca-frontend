import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(), config: vi.fn(), emitir: vi.fn(), audit: vi.fn(),
  assertAcordo: vi.fn(), assertCondominio: vi.fn(), token: vi.fn(), bank: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./audit", () => ({ logAudit: mocks.audit }));
vi.mock("./tenant-guard", () => ({
  assertAcordoAcessivel: mocks.assertAcordo,
  assertCondominioAccess: mocks.assertCondominio,
}));
vi.mock("./btg-oauth", () => ({
  consultaContasBtgHabilitada: vi.fn(), getBtgOAuthConfig: vi.fn(),
  getStatusOAuthBtg: vi.fn(), obterAccessTokenBtg: mocks.token,
}));
vi.mock("./btg-v2/config", () => ({
  BtgV2ConfigurationError: class extends Error {},
  getBtgV2ServerConfig: mocks.config,
  consultarContasRecebedorasBtg: vi.fn(), mascararNumeroConta: vi.fn(),
  normalizarContaManualSandbox: vi.fn(), normalizarContaManualProducao: vi.fn(),
  validarCadastroManualSandbox: vi.fn(), validarCadastroManualProducao: vi.fn(),
  validarContaRecebedoraParaAmbiente: vi.fn(), validarIntegracaoRuntimeBtg: vi.fn(),
}));
vi.mock("./btg-v2/issuance", () => ({
  emitirParcelasAcordoBtgV2: mocks.emitir,
  prepararEmissaoParcelasAcordoBtgV2: vi.fn(), validarContaVinculadaAtualBtgV2: vi.fn(),
}));
vi.mock("./btg-v2/manual-producao", () => ({
  auditarContaBtgTransacional: vi.fn(), bloquearIntegracaoBtg: vi.fn(),
}));
vi.mock("./btg-v2/remessas", () => ({
  executarRemessaBtgV2: vi.fn(), listarFilaRemessaBtgV2: vi.fn(),
  obterInsertIdBtgV2: vi.fn(), validarSelecaoRemessaBtgV2: vi.fn(),
}));
vi.mock("./btg-v2/settlement", () => ({
  cancelarEmissaoBolePixV2: vi.fn(), conciliarEmissaoBolePixV2: vi.fn(),
}));
vi.mock("./btg-v2/client", () => ({ criarBolePixBtgV2: mocks.bank }));

import { btgV2Router } from "./routers/btg-v2";
import { BtgV2HttpError, obterDiagnosticoHttpBtg } from "./btg-v2/errors";

const input = { acordoId: 5, parcelaIds: [19, 20, 21, 22] };
const requestId = "714d74c3-e97c-441e-b09b-cffb15f7874c";
const diagnostico = {
  httpStatus: 400, camposInvalidos: ["detail.documentNumber"],
  motivos: ["O número do documento excede o limite permitido"], requestId, codigo: "BadRequest",
};
const estadoFinanceiro = Object.freeze({
  parcelaId: 19, acordoId: 5, amount: 12599,
  dueDate: "2026-12-01", status: "pendente", canalBancario: "api_btg_v2",
  nossoNumero: "1000000018", revisao: 1, emissaoId: 1, statusEmissao: "incerta",
  externalId: "v2:prd:parcela_acordo:19:r1", idempotencyKey: "chave-historica",
});
let db: {
  select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>; execute: ReturnType<typeof vi.fn>;
  estadoFinanceiro: typeof estadoFinanceiro;
};
let fetchMock: ReturnType<typeof vi.fn>;

function context(role = "admin"): TrpcContext {
  return {
    user: { id: 10, name: "Administrador sintético", role, condominioId: null },
    req: { headers: {}, socket: {} }, res: {},
  } as unknown as TrpcContext;
}
function caller(role = "admin") {
  return btgV2Router.createCaller(context(role));
}
function item(parcelaId = 19, diagnosticoHttp: unknown = diagnostico) {
  return { parcelaId, installmentNumber: 1, resultado: "falha" as const,
    mensagem: "Mensagem do serviço não é fonte de auditoria.", diagnosticoHttp };
}
function configurarResultado(resultados: unknown[] = [item()]) {
  const resultado = { acordoId: 5, resultados };
  mocks.emitir.mockResolvedValue(resultado);
  return resultado;
}
function metadata() {
  expect(mocks.audit).toHaveBeenCalledTimes(1);
  return mocks.audit.mock.calls[0][1].metadata;
}
function semEfeitosFinanceirosOuRede() {
  for (const metodo of [db.select, db.insert, db.update, db.delete, db.transaction, db.execute]) {
    expect(metodo).not.toHaveBeenCalled();
  }
  expect(db.estadoFinanceiro).toEqual(estadoFinanceiro);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.bank).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  const proibido = () => vi.fn().mockRejectedValue(new Error("SQL proibido neste teste"));
  db = { select: proibido(), insert: proibido(), update: proibido(), delete: proibido(),
    transaction: proibido(), execute: proibido(), estadoFinanceiro };
  mocks.getDb.mockResolvedValue(db);
  mocks.config.mockReturnValue({ ambiente: "producao" });
  mocks.audit.mockResolvedValue(undefined);
  mocks.assertAcordo.mockResolvedValue({ id: 5, condominioId: 2 });
  mocks.assertCondominio.mockResolvedValue(undefined);
  fetchMock = vi.fn().mockRejectedValue(new Error("Rede proibida neste teste"));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { semEfeitosFinanceirosOuRede(); vi.unstubAllGlobals(); });

describe("BTG v2 — diagnóstico protegido na auditoria de emitirParcelasAcordo", () => {
  it("admin preserva contagens, diagnósticos por parcela e retorno exato do serviço", async () => {
    const resultados = [
      Object.freeze(item()),
      Object.freeze({ ...item(20, undefined), resultado: "emitida", emissao: Object.freeze({ id: 2, status: "emitida", amount: 12599 }) }),
      Object.freeze({ ...item(21, undefined), resultado: "ja_existia", emissao: Object.freeze({ id: 1, status: "incerta" }) }),
      Object.freeze({ ...item(22, undefined), resultado: "simulada" }),
    ];
    // Retira o default dos itens sem diagnóstico, simulando o contrato opcional.
    const resultado = configurarResultado(resultados.map((valor, index) => index === 0 ? valor : Object.freeze({ ...valor, diagnosticoHttp: undefined })));
    Object.freeze(resultado.resultados);
    Object.freeze(resultado);
    const retornado = await caller().emitirParcelasAcordo(input);
    expect(retornado).toBe(resultado);
    expect(mocks.emitir).toHaveBeenCalledTimes(1);
    expect(mocks.emitir).toHaveBeenCalledWith({ db, ...input, usuarioId: 10 });
    expect(mocks.audit.mock.calls[0][0].user.id).toBe(10);
    expect(mocks.audit.mock.calls[0][1]).toEqual({
      action: "generate_boleto", entity: "acordo", entityId: "5", severity: "warning",
      metadata: {
        integracao: "btg-v2", instrumento: "bolepix", evento: "emissao_parcelas_acordo_solicitada",
        ambiente: "producao", parcelasSelecionadas: 4,
        simulada: 1, emitida: 1, ja_existia: 1, falha: 1,
        diagnosticosHttp: [{ parcelaId: 19, ...diagnostico }],
      },
    });
  });

  it.each(["advogado", "colaborador", "sindico", "cobrador"])("perfil %s é bloqueado antes do serviço, configuração, DB, carteira e audit", async role => {
    configurarResultado();
    await expect(caller(role).emitirParcelasAcordo(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const mock of [mocks.emitir, mocks.config, mocks.getDb, mocks.audit, mocks.assertAcordo, mocks.assertCondominio]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it("anônimo também é bloqueado sem efeitos", async () => {
    const ctx = { ...context(), user: null };
    await expect(btgV2Router.createCaller(ctx).emitirParcelasAcordo(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.emitir).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("ausência de diagnóstico mantém metadata anterior e não interrompe emissão", async () => {
    const { diagnosticoHttp: _ignorado, ...semDiagnostico } = item();
    const resultado = configurarResultado([semDiagnostico]);
    expect(await caller().emitirParcelasAcordo(input)).toBe(resultado);
    expect(metadata()).toEqual({
      integracao: "btg-v2", instrumento: "bolepix", evento: "emissao_parcelas_acordo_solicitada",
      ambiente: "producao", parcelasSelecionadas: 4, simulada: 0, emitida: 0, ja_existia: 0, falha: 1,
    });
  });

  it("não copia mensagem, corpo, valores de invalidParams nem propriedades arbitrárias", async () => {
    const sensiveis = ["52998224725", "30306294000145", "pessoa@example.invalid", "+5511998765432",
      "0003081850", "00020101021226850014br.gov.bcb.pix", "Bearer segredo-token", "Ana da Silva", "Rua Particular"];
    const raw = sensiveis.join(" | ");
    const malicioso = { ...item(), mensagem: raw, rawfields: { value: raw }, payload: raw,
      emissao: { pixCopiaECola: raw, account: raw },
      diagnosticoHttp: {
        ...diagnostico, camposInvalidos: ["detail.documentNumber", ...sensiveis, `payer.taxId=${sensiveis[0]}`, { name: "payer.email", value: raw }],
        motivos: ["O número do documento excede o limite permitido", ...sensiveis, `Formato inválido ${raw}`],
        requestId: raw, codigo: raw, invalidParams: [{ name: "payer.taxId", value: raw }],
        body: raw, authorization: raw, account: raw, oauth: raw,
      },
    };
    const resultado = configurarResultado([malicioso]);
    expect(await caller().emitirParcelasAcordo(input)).toBe(resultado);
    expect(metadata().diagnosticosHttp).toEqual([{
      parcelaId: 19, httpStatus: 400, camposInvalidos: ["detail.documentNumber"],
      motivos: ["O número do documento excede o limite permitido"],
    }]);
    const registro = JSON.stringify(mocks.audit.mock.calls[0][1]);
    for (const valor of sensiveis) expect(registro).not.toContain(valor);
    for (const chave of ["mensagem", "rawfields", "invalidParams", "value", "payload", "authorization", "oauth"]) {
      expect(registro).not.toContain(`"${chave}"`);
    }
  });

  it.each([null, {}, "HTTP 400", { ...diagnostico, httpStatus: "400" },
    { ...diagnostico, httpStatus: 200 }, { ...diagnostico, httpStatus: 600 },
    { ...diagnostico, httpStatus: 400.5 }, { ...diagnostico, camposInvalidos: "detail.documentNumber" },
    { ...diagnostico, motivos: null }])("diagnóstico malformado não quebra nem muda estado: %j", async invalido => {
    const resultado = configurarResultado([item(19, invalido)]);
    expect(await caller().emitirParcelasAcordo(input)).toBe(resultado);
    expect(metadata()).not.toHaveProperty("diagnosticosHttp");
    expect(metadata().falha).toBe(1);
  });

  it("aceita apenas nomes allowlisted e no máximo cinco campos/motivos sem duplicatas", async () => {
    configurarResultado([item(19, { ...diagnostico,
      camposInvalidos: ["amount", "amount", "dueDate", "detail.documentNumber", "payer.email", "payer.address.city", "payer.address.street"],
      motivos: ["Campo obrigatório", "Campo obrigatório", "Campo inválido", "Formato inválido", "O documento do pagador é inválido", "Há campos inválidos na solicitação.", "O valor excede o limite permitido"],
    })]);
    await caller().emitirParcelasAcordo(input);
    expect(metadata().diagnosticosHttp[0]).toMatchObject({
      camposInvalidos: ["amount", "dueDate", "detail.documentNumber", "payer.email", "payer.address.city"],
      motivos: ["Campo obrigatório", "Campo inválido", "Formato inválido", "O documento do pagador é inválido", "Há campos inválidos na solicitação."],
    });
  });

  it("identificadores opcionais desconhecidos são omitidos, não truncados ou redigidos parcialmente", async () => {
    configurarResultado([item(19, { ...diagnostico, requestId: "request-pessoa@example.invalid", codigo: "segredo-semdigitos" })]);
    await caller().emitirParcelasAcordo(input);
    expect(metadata().diagnosticosHttp[0]).not.toHaveProperty("requestId");
    expect(metadata().diagnosticosHttp[0]).not.toHaveProperty("codigo");
  });

  it.each([
    "00000000-0000-0000-0000-529982247250",
    "714d74c3-e97c-441e-b09b-529982247250",
    "714d74c3-e97c-441e-b09b-cffb15f7874c pessoa@example.invalid",
    "714d74c3-e97c-441e-b09b-cffb15f7874c\n",
  ])("requestId com UUID falso ou dado pessoal é omitido: %j", async falso => {
    configurarResultado([item(19, { ...diagnostico, requestId: falso })]);
    await caller().emitirParcelasAcordo(input);
    expect(metadata().diagnosticosHttp[0]).not.toHaveProperty("requestId");
  });

  it("não aceita motivos ou códigos livres mesmo sem dígitos, nem campos prefixados com valores", async () => {
    configurarResultado([item(19, {
      ...diagnostico, camposInvalidos: ["payer.name=Ana da Silva", "payer.address.street=Rua Particular"],
      motivos: ["Ana da Silva", "Rua Particular", "segredo-semdigitos", "must be less than secret", "Valor inválido. Ana da Silva"],
      codigo: "ErrorAnaDaSilva",
    })]);
    await caller().emitirParcelasAcordo(input);
    expect(metadata().diagnosticosHttp[0]).toEqual({
      parcelaId: 19, httpStatus: 400, camposInvalidos: [], motivos: [], requestId,
    });
  });

  it("preserva motivos canônicos vindos de BtgV2HttpError e rejeita frases canônicas com nomes anexados", async () => {
    const motivoJuros = "A data de início dos juros deve ser posterior à data de vencimento";
    const seguro = obterDiagnosticoHttpBtg(new BtgV2HttpError({
      httpStatus: 422, camposInvalidos: ["detail.documentNumber", "interest.startDate"],
      motivos: ["Há campos inválidos na solicitação.", ...diagnostico.motivos, motivoJuros],
      codigo: "INVALID_PARAMETER", requestId,
    }))!;
    const resultado = configurarResultado([item(19, seguro), item(20, {
      ...seguro, motivos: seguro.motivos.map((motivo) => `${motivo} Ana da Silva`),
    })]);
    expect(await caller().emitirParcelasAcordo(input)).toBe(resultado);
    expect(metadata().diagnosticosHttp).toEqual([
      { parcelaId: 19, ...seguro }, { parcelaId: 20, ...seguro, motivos: [] },
    ]);
  });

  it("diagnóstico com getter que lança erro é omitido sem falhar ou registrar exceção", async () => {
    const hostil = Object.defineProperty({}, "httpStatus", {
      get() { throw new Error("Ana da Silva segredo-token"); },
    });
    const resultado = configurarResultado([item(19, hostil)]);
    expect(await caller().emitirParcelasAcordo(input)).toBe(resultado);
    expect(metadata()).not.toHaveProperty("diagnosticosHttp");
    expect(JSON.stringify(mocks.audit.mock.calls[0][1])).not.toContain("segredo-token");
  });

  it("não audita diagnóstico de parcela não selecionada ou ID inválido", async () => {
    configurarResultado([item(999), item(-1), item(19.5), item(Number.NaN), item(19)]);
    await caller().emitirParcelasAcordo(input);
    expect(metadata().diagnosticosHttp).toEqual([{ parcelaId: 19, ...diagnostico }]);
    expect(metadata().falha).toBe(5);
  });

  it("limita o metadata a 50 itens mesmo se o serviço retornar além da seleção", async () => {
    const resultado = configurarResultado(Array.from({ length: 60 }, () => item()));
    expect(await caller().emitirParcelasAcordo(input)).toBe(resultado);
    expect(metadata().diagnosticosHttp).toHaveLength(50);
    expect(metadata().falha).toBe(60);
  });

  it("continua recusando seleção superior a 50 antes do serviço", async () => {
    await expect(caller().emitirParcelasAcordo({ acordoId: 5, parcelaIds: Array.from({ length: 51 }, (_, i) => i + 1) }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.emitir).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("erro do serviço mantém semântica original e não grava audit com corpo da exceção", async () => {
    mocks.emitir.mockRejectedValue(new Error("corpo bancário sensível"));
    await expect(caller().emitirParcelasAcordo(input)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a operação BTG agora.",
    });
    expect(mocks.emitir).toHaveBeenCalledTimes(1);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("erro de audit não reemite, não reescreve resultado nem reserva incerta", async () => {
    const resultado = configurarResultado([Object.freeze(item())]);
    const antes = structuredClone(resultado);
    mocks.audit.mockRejectedValue(new Error("falha audit"));
    await expect(caller().emitirParcelasAcordo(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.emitir).toHaveBeenCalledTimes(1);
    expect(resultado).toEqual(antes);
  });
});
