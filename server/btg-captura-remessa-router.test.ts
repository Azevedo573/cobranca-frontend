import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: vi.fn(), audit: vi.fn(),
  executar: vi.fn(), fila: vi.fn(), selecao: vi.fn(), validarConta: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./audit", () => ({ logAudit: mocks.audit }));
vi.mock("./btg-oauth", () => ({ consultaContasBtgHabilitada: vi.fn(), getBtgOAuthConfig: vi.fn(), getStatusOAuthBtg: vi.fn() }));
vi.mock("./btg-v2/config", () => ({
  BtgV2ConfigurationError: class extends Error {}, getBtgV2ServerConfig: mocks.config,
  validarIntegracaoRuntimeBtg: vi.fn(), consultarContasRecebedorasBtg: vi.fn(), mascararNumeroConta: vi.fn(),
  normalizarContaManualSandbox: vi.fn(), normalizarContaManualProducao: vi.fn(),
  validarCadastroManualSandbox: vi.fn(), validarCadastroManualProducao: vi.fn(), validarContaRecebedoraParaAmbiente: vi.fn(),
}));
vi.mock("./btg-v2/issuance", () => ({ emitirParcelasAcordoBtgV2: vi.fn(), prepararEmissaoParcelasAcordoBtgV2: vi.fn(), validarContaVinculadaAtualBtgV2: mocks.validarConta }));
vi.mock("./btg-v2/manual-producao", () => ({ auditarContaBtgTransacional: vi.fn(), bloquearIntegracaoBtg: vi.fn() }));
vi.mock("./btg-v2/remessas", () => ({ executarRemessaBtgV2: mocks.executar,
  listarFilaRemessaBtgV2: mocks.fila, validarSelecaoRemessaBtgV2: mocks.selecao, obterInsertIdBtgV2: () => 30 }));
vi.mock("./btg-v2/settlement", () => ({ cancelarEmissaoBolePixV2: vi.fn(), conciliarEmissaoBolePixV2: vi.fn() }));
import { btgV2Router } from "./routers/btg-v2";

const input = { condominioId: 2, parcelaIds: [20], confirmacao: "ENVIAR REMESSA" as const };
const selecionadas = [{ id: 20, installmentNumber: 1, amount: 1852 }];
const summary = { status: "falha", totalSelecionado: 1, totalEmitido: 0, totalFalha: 1, valorTotalCentavos: 1852 };
const safe = { parcelaId: 20, emissaoId: 40, capturaId: 50, httpStatus: 400,
  camposInvalidos: ["detail.documentNumber"], motivos: ["Campo inválido"] };
let db: any;
function caller(role = "admin") {
  return btgV2Router.createCaller({ user: { id: 10, role }, req: { headers: {}, socket: {} }, res: {} } as unknown as TrpcContext);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockReturnValue({ ambiente: "sandbox", companyId: "30306294000145" });
  let read = 0;
  db = {
    select: vi.fn(() => {
      const result = read++ === 0 ? [{ id: 1, ambiente: "sandbox", ativo: 1, emissaoHabilitada: 1 }] : [{ id: 7 }];
      const chain: any = { from: () => chain, innerJoin: () => chain, where: () => chain, limit: async () => result };
      return chain;
    }),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 30 }]) })),
    update: vi.fn(() => { throw new Error("Não é permitido reescrever reserva no router"); }),
  };
  mocks.getDb.mockResolvedValue(db); mocks.fila.mockResolvedValue(selecionadas); mocks.selecao.mockReturnValue(selecionadas);
  mocks.executar.mockResolvedValue({ ...summary, diagnosticosHttp: [safe] }); mocks.audit.mockResolvedValue(undefined);
});

describe("BTG captura — ator e auditoria protegida de remessa", () => {
  it("propaga o ator sem alterar remessa/parcela e preserva IDs da tentativa na auditoria", async () => {
    const result = await caller().criarEEnviarRemessa(input);
    expect(mocks.executar).toHaveBeenCalledWith({ db, remessaId: 30, parcelas: selecionadas, usuarioId: 10 });
    expect(result).toEqual({ id: 30, ...summary, diagnosticosHttp: [safe] });
    expect(mocks.audit.mock.calls[0][1].metadata).toEqual({ integracao: "btg-v2", evento: "remessa_enviada", remessaId: 30,
      ...summary, diagnosticosHttp: [safe] }); expect(db.update).not.toHaveBeenCalled();
  });
  it("não espalha corpos/mensagens/propriedades livres do resumo nem do diagnóstico no audit", async () => {
    const secret = "CPF52998224725 Rua Particular Bearer token";
    mocks.executar.mockResolvedValue({ ...summary, payload: secret, resposta: secret, erroResumo: secret,
      diagnosticosHttp: [{ ...safe, body: secret, mensagem: secret, requestId: secret, codigo: secret,
        camposInvalidos: ["detail.documentNumber", secret], motivos: ["Campo inválido", secret] }, { ...safe, parcelaId: 999 }] });
    await caller().criarEEnviarRemessa(input);
    const audit = mocks.audit.mock.calls[0][1].metadata;
    expect(audit.diagnosticosHttp).toEqual([safe]);
    for (const key of ["payload", "resposta", "erroResumo", "body", "mensagem"]) expect(audit).not.toHaveProperty(key);
    expect(JSON.stringify(audit)).not.toContain(secret);
  });
  it("auditoria falha não reenvia nem libera emissão canônica", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    await expect(caller().criarEEnviarRemessa(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.executar).toHaveBeenCalledTimes(1); expect(db.update).not.toHaveBeenCalled();
  });
  it.each(["advogado", "colaborador", "sindico", "cobrador"])("%s não chega ao serviço nem DB", async role => {
    await expect(caller(role).criarEEnviarRemessa(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getDb).not.toHaveBeenCalled(); expect(mocks.executar).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
});
