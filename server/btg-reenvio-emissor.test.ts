import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";
import { criarCapturaMock } from "./btg-v2-http-captura-test-helper";

const mocks = vi.hoisted(() => ({ config: vi.fn(), oauth: vi.fn(), token: vi.fn(), cliente: vi.fn(), captura: vi.fn(), consulta: vi.fn() }));
vi.mock("./btg-oauth", () => ({ getBtgOAuthConfig: mocks.config, getStatusOAuthBtg: mocks.oauth, obterAccessTokenBtg: mocks.token }));
vi.mock("./btg-v2/client", () => ({ criarBolePixBtgV2: mocks.cliente }));
vi.mock("./btg-v2/diagnosticos", () => ({ criarCapturaHttpBtg: mocks.captura }));
vi.mock("./db", () => ({ getDb: vi.fn(() => { throw new Error("Banco real proibido"); }) }));
vi.mock("./btg-v2/reenvio-consulta", () => ({ consultarSituacaoRecuperacaoBtg: mocks.consulta }));

import { emitirBolePixV2, emitirParcelasAcordoBtgV2, gerarExternalIdBtgV2, gerarIdempotencyKeyBtgV2 } from "./btg-v2/issuance";
import { criarAutorizacaoReenvioBtg, hashContextoEnvioBtg, type AutorizacaoReenvioBtg, type ContextoAutorizacaoReenvioBtg } from "./btg-v2/reenvio-autorizacao";
import { BtgV2ConfigurationError } from "./btg-v2/config";
import { obterVinculoEmissaoErroBtg, vincularCapturaHttpErroBtg } from "./btg-v2/errors";
import { classificarProvaReenvioBtg } from "./btg-v2/reenvio-provas";

const config = { ambiente: "sandbox" as const, companyId: "30306294000145" };
const parcela = { id: 19, acordoId: 5, installmentNumber: 1, amount: 1852, dueDate: new Date("2026-12-01T12:00:00Z"), status: "pendente", nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local", canalBancario: "api_btg_v2", remessaId: null, statusRemessa: "nao_enviado", snapshotPrincipal: 1800, snapshotJuros: 52 };
const conta = { id: 15, btgIntegracaoId: 7, accountId: "official-fixture", agencia: "0050", numero: "0003081850", documentoBeneficiario: config.companyId, nomeBeneficiario: "Beneficiário fictício", ativo: 1, origemCadastro: "api" };
const data = new Date("2026-11-09T12:00:01Z");
const resposta = { collectionId: "collection-nova-ficticia", status: "CREATED", bankSlipUrl: "https://example.invalid/boleto", pixQrCode: null, pixCopiaECola: null, codigoBarras: null, linhaDigitavel: null, nossoNumero: "novo-numero-bancario" };
let fetchProibido: ReturnType<typeof vi.fn>;

function emissao(id: number, revisao: number, patch: Record<string, unknown> = {}) {
  const externalId = gerarExternalIdBtgV2("sandbox", "parcela_acordo", 19, revisao);
  return { id, btgIntegracaoId: 7, btgContaRecebedoraId: 15, btgRemessaId: null, condominioId: 2, origemTipo: "parcela_acordo", origemId: 19, revisao, instrumento: "bolepix", externalId, idempotencyKey: gerarIdempotencyKeyBtgV2(externalId), status: "reservada", amount: 1852, dueDate: parcela.dueDate, agenciaRecebedora: conta.agencia, contaRecebedora: conta.numero, documentoBeneficiario: conta.documentoBeneficiario, nomeBeneficiario: conta.nomeBeneficiario, btgCollectionId: null, bankSlipUrl: null, pixQrCode: null, pixCopiaECola: null, codigoBarras: null, linhaDigitavel: null, nossoNumero: null, erroCodigo: null, falhaAntesEnvioEm: null, emitidaEm: null, createdAt: data, updatedAt: data, ...patch };
}
function decisao(id: number, anterior: number, nova: number, contextoHash: string, patch: Record<string, unknown> = {}) {
  return { id, chaveAnalise: `analise-ficticia-${id}`, btgIntegracaoId: 7, emissaoAnteriorId: anterior, novaEmissaoId: nova, parcelaAcordoId: 19, btgRemessaId: null, condominioId: 2, usuarioId: 10, diagnosticoId: null, acao: "reenviar", codigo: "falha_local_comprovada", estado: "consumida", contextoHash, provaHash: "a".repeat(64), consultaHash: "b".repeat(64), consultaCompleta: 1, consultaCifrada: "fixture-nao-lida-pelo-emissor", criadaEm: data, expiraEm: new Date("2026-11-09T12:05:01Z"), consumidaEm: data, ...patch };
}
function setup(revisao = 2, remessa = false) {
  const rows = Array.from({ length: revisao }, (_, index) => emissao(101 + index, index + 1, {
    btgRemessaId: remessa ? 50 : null,
    ...(index + 1 < revisao ? { erroCodigo: "FALHA_ANTES_POST_COMPROVADA", falhaAntesEnvioEm: data } : {}),
  }));
  const fixture = criarDbCanaisEmMemoria({
    users: [{ id: 10, role: "admin", isActive: 1, isDeleted: 0 }],
    btgIntegracoes: [{ id: 7, ...config, ativo: 1, emissaoHabilitada: 1, diasLimitePagamento: 60, instrucoes: null }],
    btgContasRecebedoras: [conta], btgContaRecebedoraCondominios: [{ id: 3, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, ativo: 1 }],
    acordos: [{ id: 5, condominioId: 2, devedorId: 21, status: "ativo" }], parcelasAcordo: [parcela],
    devedores: [{ id: 21, condominioId: 2, name: "Pagador fictício", cpfCnpj: "52998224725", address: "Rua Teste", addressNumber: "1", neighborhood: "Centro", city: "São Paulo", state: "SP", zipCode: "01001000" }],
    btgCobrancasEmitidas: rows, btgRecuperacoes: [], btgHttpDiagnosticos: [], auditLogs: [{ id: 1, metadata: '{"evento":"nova_revisao_autorizada"}' }],
    btgRemessas: remessa ? [{ id: 50, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, status: "falha" }] : [],
    btgRemessaItens: remessa ? [{ id: 1, btgRemessaId: 50, parcelaAcordoId: 19, valorCentavos: 1852, resultado: "falha", btgCobrancaEmitidaId: 100 + revisao }] : [],
  });
  const tables = fixture.state.tables;
  const contextoHash = hashContextoEnvioBtg({ parcela: tables.parcelasAcordo[0], acordo: tables.acordos[0], devedor: tables.devedores[0], integracao: tables.btgIntegracoes[0], conta: tables.btgContasRecebedoras[0] });
  for (let index = 1; index < revisao; index++) {
    const prova = classificarProvaReenvioBtg(tables.btgCobrancasEmitidas[index - 1], null, new Date());
    tables.btgRecuperacoes.push(decisao(700 + index, 100 + index, 101 + index, contextoHash, { btgRemessaId: remessa ? 50 : null, provaHash: prova.hashProva }));
  }
  const contexto: ContextoAutorizacaoReenvioBtg = { emissaoId: 100 + revisao, emissaoAnteriorId: 99 + revisao, analiseId: 699 + revisao, revisao, parcelaId: 19, usuarioId: 10, contextoHash };
  return { ...fixture, contexto, cap: () => criarAutorizacaoReenvioBtg(contexto) };
}
type Fixture = ReturnType<typeof setup>;
function enviar(f: Fixture, recuperacao = f.cap()) { return emitirBolePixV2({ db: f.db, parcelaId: 19, usuarioId: 10, recuperacao }); }
function antesDaTransacao(f: Fixture, numero: number, alterar: () => void) {
  const original = f.db.transaction.getMockImplementation()!;
  let count = 0;
  f.db.transaction.mockImplementation((run: unknown) => { if (++count === numero) alterar(); return original(run); });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BTG_SANDBOX", "true");
  mocks.config.mockReturnValue(config);
  mocks.oauth.mockResolvedValue({ status: "conectado" });
  mocks.token.mockResolvedValue("token-apenas-fixture");
  mocks.consulta.mockResolvedValue({ completa: true, motivo: "CONSULTA_COMPLETA", cobrancas: [] });
  mocks.captura.mockImplementation(() => criarCapturaMock());
  mocks.cliente.mockImplementation(async (payload, _fetch, captura) => {
    if (!captura) throw new Error("Captura obrigatória");
    await captura.preparar(JSON.stringify(payload)); await captura.iniciar();
    await captura.responder(201, new TextEncoder().encode(JSON.stringify(resposta)), true);
    return resposta;
  });
  fetchProibido = vi.fn(() => { throw new Error("BTG real proibido"); });
  vi.stubGlobal("fetch", fetchProibido);
});
afterEach(() => { expect(fetchProibido).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("BTG — emissor único para reserva autorizada de reenvio", () => {
  it.each([2, 3, 4])("envia revisão %s uma única vez com captura e identificadores próprios, sem alterar histórico", async revisao => {
    const f = setup(revisao);
    const antes = structuredClone(f.state.tables);
    const cap = f.cap();
    const result = await enviar(f, cap);
    expect(result).toMatchObject({ id: 100 + revisao, status: "emitida", jaExistia: false, collectionId: resposta.collectionId, capturaId: 901 });
    expect(mocks.cliente).toHaveBeenCalledOnce(); expect(mocks.captura).toHaveBeenCalledWith({ db: f.db, emissaoId: 100 + revisao, usuarioId: 10 });
    const captura = mocks.captura.mock.results[0].value;
    expect(captura.preparar).toHaveBeenCalledOnce(); expect(captura.iniciar).toHaveBeenCalledOnce();
    expect(mocks.cliente.mock.calls[0][0].detail).toEqual({ documentNumber: `PA19R${revisao}`, externalId: `v2:sbx:parcela_acordo:19:r${revisao}`, correlationId: `btgv2-${100 + revisao}` });
    expect(f.state.tables.btgCobrancasEmitidas.slice(0, -1)).toEqual(antes.btgCobrancasEmitidas.slice(0, -1));
    expect(f.state.tables.parcelasAcordo).toEqual(antes.parcelasAcordo); expect(f.state.tables.btgRecuperacoes).toEqual(antes.btgRecuperacoes);
    expect(f.state.writes.every(w => w.table === "btgCobrancasEmitidas")).toBe(true);
    expect(f.state.locks.indexOf("btgIntegracoes:update")).toBeLessThan(f.state.locks.indexOf("parcelasAcordo:update"));
    expect(f.state.locks).toContain("btgRecuperacoes:update"); expect(f.state.locks).toContain("devedores:update");
    await expect(enviar(f, cap)).rejects.toThrow("já foi utilizada");
    await expect(emitirBolePixV2({ db: f.db, parcelaId: 19 })).resolves.toMatchObject({ id: 100 + revisao, jaExistia: true });
    expect(mocks.cliente).toHaveBeenCalledOnce();
  });

  it.each(["reservada", "enviando", "incerta", "falha", "emitida", "paga", "cancelada", "expirada"])("emissor comum retorna revisão mais recente %s sem novo POST ou captura", async status => {
    const f = setup(3); f.state.tables.btgCobrancasEmitidas[2].status = status;
    // Ordem física não pode substituir ordenação por revisão.
    f.state.tables.btgCobrancasEmitidas.reverse();
    const antes = structuredClone(f.state.tables);
    await expect(emitirBolePixV2({ db: f.db, parcelaId: 19, ...({ revisao: 99, emissaoId: 101 } as object) })).resolves.toMatchObject({ id: 103, status, jaExistia: true });
    expect(f.state.tables).toEqual(antes); expect(f.state.writes).toEqual([]);
    expect(mocks.captura).not.toHaveBeenCalled(); expect(mocks.cliente).not.toHaveBeenCalled();
  });

  it.each(["reservada", "enviando", "incerta", "falha", "emitida", "paga", "cancelada", "expirada"])("resultado por parcela não considera existente %s um sucesso sem confirmação", async status => {
    const f = setup(3); f.state.tables.btgCobrancasEmitidas[2].status = status;
    const result = await emitirParcelasAcordoBtgV2({ db: f.db, acordoId: 5, parcelaIds: [19], usuarioId: 10 });
    expect(result.resultados[0]).toMatchObject({ resultado: ["emitida", "paga"].includes(status) ? "ja_existia" : "falha", emissao: { id: 103, status, jaExistia: true } });
    if (!["emitida", "paga"].includes(status)) expect(result.resultados[0].mensagem).toContain("sem sucesso confirmado");
    expect(f.state.writes).toEqual([]); expect(mocks.cliente).not.toHaveBeenCalled();
  });

  it.each([null, {}, { emissaoId: 102, revisao: 2 }, "forjada"])("não aceita autorização pública/forjada %j", async recuperacao => {
    const f = setup();
    await expect(enviar(f, recuperacao as AutorizacaoReenvioBtg)).rejects.toThrow("autorização interna");
    expect(f.state.writes).toEqual([]); expect(mocks.cliente).not.toHaveBeenCalled();
  });
  it.each([{ parcelaId: 20 }, { usuarioId: 11 }, { emissaoId: 999 }, { emissaoAnteriorId: 99 }, { analiseId: 999 }, { revisao: 3 }, { contextoHash: "f".repeat(64) }])("capacidade legítima mas contexto divergente é bloqueada: %j", async patch => {
    const f = setup(); const cap = criarAutorizacaoReenvioBtg({ ...f.contexto, ...patch });
    await expect(enviar(f, cap)).rejects.toBeDefined();
    expect(mocks.cliente).not.toHaveBeenCalled(); expect(f.state.writes).toEqual([]);
  });

  it.each([{ estado: "analisada" }, { acao: "bloqueada" }, { acao: "recuperar_vinculo" }, { usuarioId: 11 }, { novaEmissaoId: 999 }, { emissaoAnteriorId: 999 }, { btgIntegracaoId: 99 }, { condominioId: 99 }, { consumidaEm: null }, { consultaCompleta: 0 }, { codigo: "incerta_sem_prova" }, { provaHash: "" }, { contextoHash: "f".repeat(64) }])("não envia sem decisão commitada correspondente: %j", async patch => {
    const f = setup(); Object.assign(f.state.tables.btgRecuperacoes[0], patch);
    await expect(enviar(f)).rejects.toThrow("autorização de reenvio");
    expect(f.state.writes).toEqual([]); expect(mocks.cliente).not.toHaveBeenCalled(); expect(mocks.captura).not.toHaveBeenCalled();
  });
  it("não cria reserva ou decisão quando o service não commitou", async () => {
    const f = setup(); f.state.tables.btgRecuperacoes = [];
    await expect(enviar(f)).rejects.toBeDefined();
    expect(f.state.tables.btgCobrancasEmitidas).toHaveLength(2); expect(f.state.writes).toEqual([]); expect(mocks.cliente).not.toHaveBeenCalled();
  });

  it.each(["sem_decisao", "decisao_nao_consumida", "destino_errado", "outra_integracao", "revisao_futura", "revisao_duplicada", "sem_revisao1", "titulo_antigo", "antiga_enviando", "valor_antigo", "vencimento_antigo"])("todas revisões anteriores devem estar resolvidas na cadeia: %s", async caso => {
    const f = setup(3); const t = f.state.tables;
    if (caso === "sem_decisao") t.btgRecuperacoes.shift();
    if (caso === "decisao_nao_consumida") t.btgRecuperacoes[0].estado = "analisada";
    if (caso === "destino_errado") t.btgRecuperacoes[0].novaEmissaoId = 103;
    if (caso === "outra_integracao") t.btgCobrancasEmitidas.push(emissao(99, 1, { btgIntegracaoId: 99 }));
    if (caso === "revisao_futura") t.btgCobrancasEmitidas.push(emissao(104, 4));
    if (caso === "revisao_duplicada") t.btgCobrancasEmitidas.push(emissao(199, 1));
    if (caso === "sem_revisao1") t.btgCobrancasEmitidas.shift();
    if (caso === "titulo_antigo") t.btgCobrancasEmitidas[0].btgCollectionId = "titulo-existente";
    if (caso === "antiga_enviando") t.btgCobrancasEmitidas[0].status = "enviando";
    if (caso === "valor_antigo") t.btgCobrancasEmitidas[0].amount = 9999;
    if (caso === "vencimento_antigo") t.btgCobrancasEmitidas[0].dueDate = new Date("2026-12-02T12:00:00Z");
    await expect(enviar(f)).rejects.toBeDefined();
    expect(f.state.writes).toEqual([]); expect(mocks.cliente).not.toHaveBeenCalled();
  });

  it.each(["valor", "vencimento", "pagador", "endereco", "conta", "politica", "acordo", "cnab", "parcela_paga", "snapshot"])("mudança de contexto antes do emissor invalida autorização: %s", async caso => {
    const f = setup(); const t = f.state.tables;
    if (caso === "valor") t.parcelasAcordo[0].amount++;
    if (caso === "vencimento") t.parcelasAcordo[0].dueDate = new Date("2026-12-02T12:00:00Z");
    if (caso === "pagador") t.devedores[0].cpfCnpj = "11111111111";
    if (caso === "endereco") t.devedores[0].address = "Rua corrigida";
    if (caso === "conta") t.btgContasRecebedoras[0].numero = "0003081851";
    if (caso === "politica") t.btgIntegracoes[0].diasLimitePagamento = 90;
    if (caso === "acordo") t.acordos[0].status = "cancelado";
    if (caso === "cnab") t.parcelasAcordo[0].remessaId = 88;
    if (caso === "parcela_paga") t.parcelasAcordo[0].status = "pago";
    if (caso === "snapshot") t.parcelasAcordo[0].snapshotPrincipal++;
    await expect(enviar(f)).rejects.toBeDefined(); expect(mocks.cliente).not.toHaveBeenCalled(); expect(f.state.writes).toEqual([]);
  });

  it.each([1, 2])("revalida fingerprint dentro do lock da transação %s", async numero => {
    const f = setup(); antesDaTransacao(f, numero, () => { f.state.tables.devedores[0].addressComplement = "mudou dentro do lock"; });
    await expect(enviar(f)).rejects.toBeDefined(); expect(mocks.cliente).not.toHaveBeenCalled();
    expect(f.state.tables.btgCobrancasEmitidas[1].status).toBe("reservada");
    if (numero === 2) expect(f.state.tables.btgCobrancasEmitidas[1].erroCodigo).toBe("FALHA_ANTES_POST_COMPROVADA");
    else expect(f.state.writes).toEqual([]);
  });

  it.each(["falha", "processada_parcialmente"])("reenvio do item falha de remessa %s usa nova reserva sem reabrir o lote", async status => {
    const f = setup(2, true); f.state.tables.btgRemessas[0].status = status;
    const old = structuredClone(f.state.tables.btgCobrancasEmitidas[0]);
    await expect(enviar(f)).resolves.toMatchObject({ id: 102, status: "emitida" });
    expect(f.state.tables.btgCobrancasEmitidas[0]).toEqual(old);
    expect(f.state.tables.btgRemessas[0].status).toBe(status); expect(f.state.tables.btgRemessaItens[0].btgCobrancaEmitidaId).toBe(102);
  });
  it.each(["item_antigo", "item_emitido", "remessa_enviando", "remessa_processada", "remessa_cancelada", "decisao_outrolote"])("não aceita contexto de remessa sem item falha da reserva atual: %s", async caso => {
    const f = setup(2, true);
    if (caso === "item_antigo") f.state.tables.btgRemessaItens[0].btgCobrancaEmitidaId = 101;
    if (caso === "item_emitido") f.state.tables.btgRemessaItens[0].resultado = "emitida";
    if (caso.startsWith("remessa_")) f.state.tables.btgRemessas[0].status = caso.slice(8);
    if (caso === "decisao_outrolote") f.state.tables.btgRecuperacoes[0].btgRemessaId = 99;
    await expect(enviar(f)).rejects.toBeDefined(); expect(mocks.cliente).not.toHaveBeenCalled(); expect(f.state.writes).toEqual([]);
  });

  it("dois cliques com a mesma capacidade opaca resultam em no máximo um POST", async () => {
    const f = setup(); const cap = f.cap();
    const result = await Promise.allSettled([enviar(f, cap), enviar(f, cap)]);
    expect(result.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]); expect(mocks.cliente).toHaveBeenCalledOnce();
  });

  it("duas capacidades internas para a mesma reserva não liberam o envio reivindicado por outro executor", async () => {
    const f = setup();
    const original = mocks.cliente.getMockImplementation()!;
    let liberar!: () => void;
    let clienteIniciado!: () => void;
    const iniciado = new Promise<void>(resolve => { clienteIniciado = resolve; });
    const espera = new Promise<void>(resolve => { liberar = resolve; });
    mocks.cliente.mockImplementation(async (...args) => { clienteIniciado(); await espera; return original(...args); });
    const vencedor = enviar(f);
    await iniciado;
    // A fixture usa snapshot global para rollback: terminar o perdedor antes
    // da escrita final do vencedor evita simular perda que MySQL não causaria.
    await expect(enviar(f)).rejects.toBeDefined();
    liberar();
    await expect(vencedor).resolves.toMatchObject({ status: "emitida" });
    expect(f.state.tables.btgCobrancasEmitidas[1].status).toBe("emitida");
    expect(mocks.cliente).toHaveBeenCalledOnce();
  });

  it.each(["marcador_removido", "codigo_alterado", "hash_prova_alterado", "diagnostico_novo"])("revalida prova imediatamente anterior sob lock: %s", async caso => {
    const f = setup();
    antesDaTransacao(f, 2, () => {
      if (caso === "marcador_removido") f.state.tables.btgCobrancasEmitidas[0].falhaAntesEnvioEm = null;
      if (caso === "codigo_alterado") f.state.tables.btgCobrancasEmitidas[0].erroCodigo = "CAPTURA_OU_PREPARO_NAO_CONCLUIDO";
      if (caso === "hash_prova_alterado") f.state.tables.btgRecuperacoes[0].provaHash = "f".repeat(64);
      if (caso === "diagnostico_novo") f.state.tables.btgHttpDiagnosticos.push({ id: 90, btgCobrancaEmitidaId: 101 });
    });
    await expect(enviar(f)).rejects.toBeDefined(); expect(mocks.cliente).not.toHaveBeenCalled();
    expect(f.state.tables.btgCobrancasEmitidas[1]).toMatchObject({ status: "reservada", erroCodigo: "FALHA_ANTES_POST_COMPROVADA" });
  });
});

describe("BTG — prova explícita da falha local, sem inferência retrospectiva", () => {
  it("cliente confirma via WeakMap nenhum envio: preserva antiga e grava código+timestamp na nova", async () => {
    const f = setup(); const old = structuredClone(f.state.tables.btgCobrancasEmitidas[0]);
    const erro = new BtgV2ConfigurationError("Falha sintética de captura");
    vincularCapturaHttpErroBtg(erro, { capturaId: null, envioIniciado: false }); mocks.cliente.mockRejectedValue(erro);
    const resultado = await enviar(f).catch(e => e);
    expect(f.state.tables.btgCobrancasEmitidas[1]).toMatchObject({ status: "reservada", erroCodigo: "FALHA_ANTES_POST_COMPROVADA", falhaAntesEnvioEm: expect.any(Date) });
    expect(f.state.tables.btgCobrancasEmitidas[0]).toEqual(old); expect(obterVinculoEmissaoErroBtg(resultado)).toMatchObject({ emissaoId: 102, parcelaId: 19 });
    await expect(emitirBolePixV2({ db: f.db, parcelaId: 19 })).resolves.toMatchObject({ id: 102, jaExistia: true });
    expect(mocks.cliente).toHaveBeenCalledOnce();
  });
  it("falha da factory antes de invocar cliente persiste prova ainda em reservada", async () => {
    const f = setup(); mocks.captura.mockImplementation(() => { throw new Error("falha protegida"); });
    await expect(enviar(f)).rejects.toBeDefined();
    expect(f.state.tables.btgCobrancasEmitidas[1]).toMatchObject({ status: "reservada", erroCodigo: "FALHA_ANTES_POST_COMPROVADA", falhaAntesEnvioEm: expect.any(Date) });
    expect(mocks.cliente).not.toHaveBeenCalled();
  });
  it.each(["desconhecido", "post_iniciado", "objeto_forjado"])("erro %s após invocar cliente permanece incerto sem prova de não envio", async caso => {
    const f = setup(); const erro = new Error("não expor payload, CPF ou tokens");
    if (caso === "post_iniciado") vincularCapturaHttpErroBtg(erro, { capturaId: 901, envioIniciado: true });
    if (caso === "objeto_forjado") Object.assign(erro, { envioIniciado: false, capturaId: 901 });
    mocks.cliente.mockRejectedValue(erro);
    const resultado = await enviar(f).catch(e => e);
    expect(resultado.message).not.toContain(erro.message);
    expect(f.state.tables.btgCobrancasEmitidas[1]).toMatchObject({ status: "incerta", erroCodigo: "EMISSAO_SEM_CONFIRMACAO", falhaAntesEnvioEm: null });
    expect(f.state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    await expect(emitirBolePixV2({ db: f.db, parcelaId: 19 })).resolves.toMatchObject({ id: 102, status: "incerta", jaExistia: true });
    expect(mocks.cliente).toHaveBeenCalledOnce();
  });
  it.each(["emitida", "paga", "cancelada", "incerta"])("catch não sobrescreve estado terminal/concurrente %s nem cria prova", async status => {
    const f = setup(); const erro = new BtgV2ConfigurationError("falha local sintética");
    vincularCapturaHttpErroBtg(erro, { capturaId: null, envioIniciado: false });
    mocks.cliente.mockImplementation(async () => { f.state.tables.btgCobrancasEmitidas[1].status = status; throw erro; });
    await expect(enviar(f)).rejects.toBeDefined();
    expect(f.state.tables.btgCobrancasEmitidas[1]).toMatchObject({ status, erroCodigo: null, falhaAntesEnvioEm: null });
  });
  it("falha na persistência depois do POST mantém nova incerta e não repete cliente", async () => {
    const f = setup(); const original = f.db.update.getMockImplementation()!;
    f.db.update.mockImplementation((table: any) => ({ set(values: any) {
      if (getTableName(table) === "btgCobrancasEmitidas" && values.btgCollectionId) return { where: async () => { throw new Error("falha persistência"); } };
      return original(table).set(values);
    } }));
    await expect(enviar(f)).rejects.toThrow("sem confirmação local");
    expect(f.state.tables.btgCobrancasEmitidas[1]).toMatchObject({ status: "incerta", falhaAntesEnvioEm: null }); expect(mocks.cliente).toHaveBeenCalledOnce();
  });
  it("código compatível antigo sem marcador não recebe prova por consulta comum", async () => {
    const f = setup(); Object.assign(f.state.tables.btgCobrancasEmitidas[1], { erroCodigo: "CAPTURA_OU_PREPARO_NAO_CONCLUIDO", falhaAntesEnvioEm: null });
    const antes = structuredClone(f.state.tables);
    await expect(emitirBolePixV2({ db: f.db, parcelaId: 19 })).resolves.toMatchObject({ id: 102, jaExistia: true });
    expect(f.state.tables).toEqual(antes); expect(f.state.writes).toEqual([]); expect(mocks.cliente).not.toHaveBeenCalled();
  });
});

describe("BTG — integração service, emissor, captura protegida e cliente real com rede mockada", () => {
  it.each(["sucesso", "auditoria_antes_post", "timeout_apos_post"])("confirmação individual %s preserva revisão anterior e não duplica POST", async caso => {
    const f = setup(2, true);
    f.state.tables.btgCobrancasEmitidas.pop();
    f.state.tables.btgCobrancasEmitidas[0].id = 88;
    f.state.tables.btgRecuperacoes = [];
    f.state.tables.btgRemessaItens[0].btgCobrancaEmitidaId = 88;
    const anterior = structuredClone(f.state.tables.btgCobrancasEmitidas[0]);
    const parcelaAntes = structuredClone(f.state.tables.parcelasAcordo[0]);
    vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 17).toString("base64"));
    const realCaptura = await vi.importActual<typeof import("./btg-v2/diagnosticos")>("./btg-v2/diagnosticos");
    const realCliente = await vi.importActual<typeof import("./btg-v2/client")>("./btg-v2/client");
    const { analisarRecuperacaoBtg, confirmarRecuperacaoBtg } = await import("./btg-v2/reenvio");
    const { aadDiagnosticoBtg, decifrarDiagnosticoBtg } = await import("./btg-v2/diagnosticos-crypto");
    mocks.captura.mockImplementation(realCaptura.criarCapturaHttpBtg);
    const banco = vi.fn(async (_url: unknown, options: RequestInit) => {
      const row = f.state.tables.btgHttpDiagnosticos[0];
      expect(row.estadoCaptura).toBe("enviando");
      const body = decifrarDiagnosticoBtg(row.payloadCifrado, aadDiagnosticoBtg(row)).toString();
      expect(body).toBe(options.body);
      expect(JSON.parse(body).detail).toEqual({ documentNumber: "PA19R2", externalId: "v2:sbx:parcela_acordo:19:r2", correlationId: "btgv2-101" });
      if (caso === "timeout_apos_post") throw new Error("transporte fixture");
      return new Response(JSON.stringify(resposta), { status: 201 });
    });
    mocks.cliente.mockImplementation(async (payload, _fetch, captura) => {
      if (caso === "auditoria_antes_post") f.state.failAudit = true;
      try { return await realCliente.criarBolePixBtgV2(payload, banco as typeof fetch, captura); }
      finally { f.state.failAudit = false; }
    });
    const analise = await analisarRecuperacaoBtg({ db: f.db, usuarioId: 10, parcelaId: 19, remessaId: 50 });
    expect(analise.acao).toBe("reenviar");
    const resultado = await confirmarRecuperacaoBtg({ db: f.db, usuarioId: 10, analiseId: analise.analiseId, confirmacao: "REENVIAR PARCELA BTG", ciente: true });
    const nova = f.state.tables.btgCobrancasEmitidas[1];
    expect(nova.revisao).toBe(2);
    expect(nova.status).toBe(caso === "sucesso" ? "emitida" : caso === "auditoria_antes_post" ? "reservada" : "incerta");
    expect(f.state.tables.btgCobrancasEmitidas[0]).toEqual(anterior);
    expect(f.state.tables.parcelasAcordo[0]).toEqual(parcelaAntes);
    expect(banco).toHaveBeenCalledTimes(caso === "auditoria_antes_post" ? 0 : 1);
    expect(f.state.tables.btgHttpDiagnosticos).toHaveLength(caso === "auditoria_antes_post" ? 0 : 1);
    if (caso !== "auditoria_antes_post") expect(f.state.tables.btgHttpDiagnosticos[0].btgCobrancaEmitidaId).toBe(nova.id);
    else expect(nova).toMatchObject({ erroCodigo: "FALHA_ANTES_POST_COMPROVADA", falhaAntesEnvioEm: expect.any(Date) });
    expect(resultado.emissaoId).toBe(nova.id);
    await expect(emitirBolePixV2({ db: f.db, parcelaId: 19 })).resolves.toMatchObject({ id: nova.id, jaExistia: true });
    expect(mocks.cliente).toHaveBeenCalledOnce();
  });
});
