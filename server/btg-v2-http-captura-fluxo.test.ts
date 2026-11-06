import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import { createHash } from "node:crypto";
import { getTableName } from "drizzle-orm";
import { criarDbCanaisEmMemoria } from "./btg-canais-test-db";
import { criarCapturaMock } from "./btg-v2-http-captura-test-helper";

const mocks = vi.hoisted(() => ({ config: vi.fn(), status: vi.fn(), token: vi.fn() }));
vi.mock("./btg-oauth", () => ({ getBtgOAuthConfig: mocks.config, getStatusOAuthBtg: mocks.status, obterAccessTokenBtg: mocks.token }));
vi.mock("./db", () => ({ getDb: vi.fn(() => { throw new Error("Banco externo proibido"); }) }));

import { criarBolePixBtgV2 } from "./btg-v2/client";
import { emitirBolePixV2, emitirParcelasAcordoBtgV2 } from "./btg-v2/issuance";
import { executarRemessaBtgV2 } from "./btg-v2/remessas";
import { aadDiagnosticoBtg, decifrarDiagnosticoBtg } from "./btg-v2/diagnosticos-crypto";
import { BtgV2HttpError, obterCapturaHttpErroBtg, obterDiagnosticoHttpBtg, obterVinculoEmissaoErroBtg } from "./btg-v2/errors";
import type { BtgV2BolePixPayload } from "./btg-v2/bolepix";

const utf8 = (text: string) => new TextEncoder().encode(text);
const config = { ambiente: "sandbox" as const, companyId: "30306294000145" };
const token = "TOKEN-OAUTH-NAO-PERSISTIR";
const segredo = "TOKEN-SECRETO-DESCONHECIDO";
const fallback = "O BTG não informou um motivo seguro para este erro.";
const success = { collectionId: "collection-sintetica", status: "CREATED", detail: { emv: "000201", ourNumber: "00001" } };
const payload = { amount: 18.52, type: "BANKSLIP_QRCODE", account: { branch: "0050", number: "0003081850" }, payer: { name: "João da Silva", taxId: "052998224725", address: { street: "Rua Teste", number: "0001" } } } as BtgV2BolePixPayload;
let banco: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue(config);
  mocks.status.mockResolvedValue({ status: "conectado" });
  mocks.token.mockResolvedValue(token);
  vi.stubEnv("BTG_SANDBOX", "true");
  vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 17).toString("base64"));
  banco = vi.fn().mockResolvedValue(new Response(JSON.stringify(success), { status: 201 }));
  vi.stubGlobal("fetch", banco);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function semSegredos(error: unknown, outputs: unknown[] = []) {
  const text = [inspect(error, { showHidden: true }), JSON.stringify(error), ...outputs.map(value => JSON.stringify(value))].join("\n");
  expect(text).not.toContain(token);
  expect(text).not.toContain(segredo);
  expect(text).not.toContain("52998224725");
  expect(text).not.toContain("Rua Teste");
  expect(text).not.toContain("João da Silva");
  if (error instanceof Error) expect(Object.hasOwn(error, "cause")).toBe(false);
}

function responseReader(read: ReturnType<typeof vi.fn>, status = 201) {
  const reader = { read, cancel: vi.fn(async () => {}), releaseLock: vi.fn() };
  const response = { status, ok: status >= 200 && status < 300, headers: new Headers(), body: { getReader: vi.fn(() => reader) }, json: vi.fn(), text: vi.fn() } as unknown as Response;
  return { response, reader };
}

describe("Captura HTTP BTG — leitura única, limites e compatibilidade", () => {
  it("serializa só uma vez e transmite exatamente a string preparada antes do fetch", async () => {
    const captura = criarCapturaMock();
    const events: string[] = [];
    const originalPrepare = vi.mocked(captura.preparar).getMockImplementation()!;
    vi.mocked(captura.preparar).mockImplementation(async body => { events.push("preparar"); return originalPrepare(body); });
    vi.mocked(captura.iniciar).mockImplementation(async () => { events.push("iniciar"); });
    const toJSON = vi.fn(() => payload);
    const bytes = utf8(JSON.stringify(success));
    const { response, reader } = responseReader(vi.fn().mockResolvedValueOnce({ done: false, value: bytes.slice(0, 7) }).mockResolvedValueOnce({ done: false, value: bytes.slice(7) }).mockResolvedValueOnce({ done: true }));
    banco.mockImplementation(async () => { events.push("fetch"); return response; });
    await expect(criarBolePixBtgV2({ toJSON } as unknown as BtgV2BolePixPayload, banco, captura)).resolves.toMatchObject({ collectionId: success.collectionId, nossoNumero: "00001" });
    expect(toJSON).toHaveBeenCalledOnce();
    expect(events).toEqual(["preparar", "iniciar", "fetch"]);
    expect(banco.mock.calls[0][1].body).toBe(vi.mocked(captura.preparar).mock.calls[0][0]);
    expect(banco.mock.calls[0][1].headers).toEqual({ Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-response": "success" });
    expect(vi.mocked(captura.responder).mock.calls[0]).toEqual([201, bytes, true]);
    expect(response.json).not.toHaveBeenCalled(); expect(response.text).not.toHaveBeenCalled();
    expect(response.body!.getReader).toHaveBeenCalledOnce(); expect(reader.read).toHaveBeenCalledTimes(3);
    expect(reader.cancel).not.toHaveBeenCalled(); expect(banco).toHaveBeenCalledOnce();
  });

  it("recusa POST sem captura antes de OAuth/fetch", async () => {
    await expect(criarBolePixBtgV2(payload, banco)).rejects.toThrow("captura protegida");
    expect(mocks.token).not.toHaveBeenCalled(); expect(banco).not.toHaveBeenCalled();
  });

  it.each(["preparar", "iniciar", "oauth"])("falha de %s impede POST e não revela erro original", async etapa => {
    const captura = criarCapturaMock();
    if (etapa === "oauth") mocks.token.mockRejectedValue(new Error(segredo));
    else vi.mocked(captura[etapa as "preparar" | "iniciar"]).mockRejectedValue(new Error(segredo));
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(error.message).toContain("nenhum envio"); expect(banco).not.toHaveBeenCalled();
    expect(obterCapturaHttpErroBtg(error)).toMatchObject({ envioIniciado: false }); semSegredos(error);
  });

  it("limita payload por bytes UTF-8, nunca corta nem transmite prefixo", async () => {
    const captura = criarCapturaMock();
    const grande = { ...payload, description: "á".repeat(33000) };
    const error = await criarBolePixBtgV2(grande, banco, captura).catch(e => e);
    expect(error.message).toContain("excede o limite"); expect(captura.preparar).not.toHaveBeenCalled(); expect(banco).not.toHaveBeenCalled();
  });

  it.each([400, 422, 500])("HTTP %s com campos desconhecidos é capturado byte a byte e sanitizado independentemente do catálogo", async httpStatus => {
    const raw = ` {"name":"DESCONHECIDO","unknown":"${segredo}","reason":"Pessoa João da Silva Rua Teste","invalidParams":[{"name":"novoCampo","value":"52998224725"}]} \n`;
    const captura = criarCapturaMock(); banco.mockResolvedValue(new Response(raw, { status: httpStatus }));
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(error).toBeInstanceOf(BtgV2HttpError);
    expect(captura.responder).toHaveBeenCalledWith(httpStatus, utf8(raw), true);
    expect(obterDiagnosticoHttpBtg(error)).toEqual({ httpStatus, camposInvalidos: [], motivos: [fallback] });
    expect(obterCapturaHttpErroBtg(error)).toEqual({ capturaId: 901, envioIniciado: true });
    semSegredos(error); expect(banco).toHaveBeenCalledOnce();
  });

  it.each(["<html><script>hostil()</script></html>", "{malformado", ""])("preserva retorno não JSON (%#) sem executar nem expor", async raw => {
    const captura = criarCapturaMock(); banco.mockResolvedValue(new Response(raw, { status: 400 }));
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(captura.responder).toHaveBeenCalledWith(400, utf8(raw), true);
    expect(obterDiagnosticoHttpBtg(error)?.motivos).toEqual([fallback]); expect(error.message).not.toContain(raw || "{malformado");
  });

  it("preserva exatamente 64 KiB, decodificando multibyte entre chunks", async () => {
    const json = utf8(JSON.stringify({ ...success, ignored: "ação" }));
    const bytes = new Uint8Array(65536).fill(32); bytes.set(json);
    const split = Array.from(bytes).findIndex(byte => byte === 0xc3) + 1;
    const { response } = responseReader(vi.fn().mockResolvedValueOnce({ done: false, value: bytes.slice(0, split) }).mockResolvedValueOnce({ done: false, value: bytes.slice(split) }).mockResolvedValueOnce({ done: true }));
    const captura = criarCapturaMock(); banco.mockResolvedValue(response);
    await expect(criarBolePixBtgV2(payload, banco, captura)).resolves.toMatchObject({ collectionId: success.collectionId });
    expect(captura.responder).toHaveBeenCalledWith(201, bytes, true);
  });

  it("trunca em bytes sem normalizar prefixo JSON válido como sucesso", async () => {
    const bytes = new Uint8Array(65537).fill(32); bytes.set(utf8(JSON.stringify(success)));
    const { response, reader } = responseReader(vi.fn().mockResolvedValueOnce({ done: false, value: bytes }));
    const captura = criarCapturaMock(); banco.mockResolvedValue(response);
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(error.message).toContain("incompleta"); expect(captura.responder).toHaveBeenCalledWith(201, bytes.slice(0, 65536), false);
    expect(reader.read).toHaveBeenCalledOnce(); expect(reader.cancel).toHaveBeenCalledOnce(); expect(banco).toHaveBeenCalledOnce();
  });

  it("prazo total de 5s preserva prefixo e não espera cancelamento hostil", async () => {
    vi.useFakeTimers();
    const bytes = utf8(JSON.stringify(success));
    const { response, reader } = responseReader(vi.fn().mockResolvedValueOnce({ done: false, value: bytes }).mockImplementation(() => new Promise(() => {})));
    reader.cancel.mockImplementation(() => new Promise(() => {}));
    const captura = criarCapturaMock(); banco.mockResolvedValue(response);
    const pending = criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    await vi.advanceTimersByTimeAsync(5000);
    const error = await pending;
    expect(error.message).toContain("incompleta"); expect(captura.responder).toHaveBeenCalledWith(201, bytes, false);
    expect(reader.cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0); expect(banco).toHaveBeenCalledOnce();
  });

  it("falha ao ler preserva bytes recebidos e nunca chama json/text como fallback", async () => {
    const bytes = utf8('{"collectionId":"abc"');
    const { response, reader } = responseReader(vi.fn().mockResolvedValueOnce({ done: false, value: bytes }).mockRejectedValue(new Error(segredo)));
    const captura = criarCapturaMock(); banco.mockResolvedValue(response);
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(captura.responder).toHaveBeenCalledWith(201, bytes, false); expect(reader.cancel).toHaveBeenCalledOnce();
    expect(response.json).not.toHaveBeenCalled(); expect(response.text).not.toHaveBeenCalled(); semSegredos(error);
  });

  it("transportes sem resposta não inventam HTTP/body nem retentam, mesmo quando semResposta falha", async () => {
    const captura = criarCapturaMock(); banco.mockRejectedValue(new Error(segredo));
    vi.mocked(captura.semResposta).mockRejectedValue(new Error(token));
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(captura.semResposta).toHaveBeenCalledOnce(); expect(captura.responder).not.toHaveBeenCalled(); expect(banco).toHaveBeenCalledOnce();
    expect(obterCapturaHttpErroBtg(error)).toEqual({ capturaId: 901, envioIniciado: true }); semSegredos(error);
  });

  it("erro de gravação após POST conserva evidência inicial e não encadeia corpo/cause", async () => {
    const captura = criarCapturaMock(); vi.mocked(captura.responder).mockRejectedValue(new Error(segredo));
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(error.message).toContain("persistir o retorno"); expect(captura.preparar).toHaveBeenCalledOnce(); expect(captura.semResposta).not.toHaveBeenCalled();
    expect(obterCapturaHttpErroBtg(error)).toEqual({ capturaId: 901, envioIniciado: true }); expect(banco).toHaveBeenCalledOnce(); semSegredos(error);
    expect(obterCapturaHttpErroBtg({ capturaId: 901, envioIniciado: true })).toBeUndefined();
    expect(obterVinculoEmissaoErroBtg(new Error("forjado"))).toBeUndefined();
  });

  it("resposta sem reader não usa fallback sem limite e continua capturando HTTP", async () => {
    const captura = criarCapturaMock();
    const response = { status: 400, ok: false, headers: new Headers(), body: {}, json: vi.fn(), text: vi.fn() } as unknown as Response;
    banco.mockResolvedValue(response);
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(captura.responder).toHaveBeenCalledWith(400, new Uint8Array(), false);
    expect(response.json).not.toHaveBeenCalled(); expect(response.text).not.toHaveBeenCalled();
    expect(obterDiagnosticoHttpBtg(error)).toEqual({ httpStatus: 400, camposInvalidos: [], motivos: [fallback] });
  });

  it("UTF-8 inválido é capturado como bytes exatos sem expor exceção de parsing", async () => {
    const bytes = new Uint8Array([123, 34, 0xff, 34, 58, 49, 125]);
    const captura = criarCapturaMock(); banco.mockResolvedValue(new Response(bytes, { status: 201 }));
    const error = await criarBolePixBtgV2(payload, banco, captura).catch(e => e);
    expect(captura.responder).toHaveBeenCalledWith(201, bytes, true);
    expect(error.message).toContain("resposta de emissão inválida"); expect(banco).toHaveBeenCalledOnce();
  });
});

const parcela = { id: 19, acordoId: 5, installmentNumber: 1, amount: 1852, dueDate: new Date("2026-12-01T12:00:00Z"), status: "pendente", nossoNumero: "1000000018", nossoNumeroOrigem: "reserva_local", canalBancario: null, remessaId: null, statusRemessa: "nao_enviado" };
function setup(extra: Record<string, any[]> = {}) {
  return criarDbCanaisEmMemoria({
    users: [{ id: 10, role: "admin", isActive: 1, isDeleted: 0 }],
    btgIntegracoes: [{ id: 7, ...config, ativo: 1, emissaoHabilitada: 1, diasLimitePagamento: 60 }],
    btgContasRecebedoras: [{ id: 15, btgIntegracaoId: 7, accountId: "official-fixture", agencia: "0050", numero: "0003081850", documentoBeneficiario: config.companyId, nomeBeneficiario: "Fixture", ativo: 1, origemCadastro: "api" }],
    btgContaRecebedoraCondominios: [{ id: 3, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, ativo: 1 }],
    acordos: [{ id: 5, condominioId: 2, devedorId: 21, status: "ativo" }],
    parcelasAcordo: [parcela],
    devedores: [{ id: 21, condominioId: 2, name: "João da Silva", cpfCnpj: "52998224725", address: "Rua Teste", addressNumber: "0001", neighborhood: "Centro", city: "São Paulo", state: "SP", zipCode: "01001000" }],
    btgCobrancasEmitidas: [], btgHttpDiagnosticos: [], btgRemessas: [], btgRemessaItens: [], auditLogs: [], ...extra,
  });
}
function bodies(fixture: ReturnType<typeof setup>) {
  const row = fixture.state.tables.btgHttpDiagnosticos[0];
  return { row, payload: decifrarDiagnosticoBtg(row.payloadCifrado, aadDiagnosticoBtg(row)), resposta: row.respostaCifrada === null ? null : decifrarDiagnosticoBtg(row.respostaCifrada, aadDiagnosticoBtg(row, "resposta")) };
}
function falharResposta(fixture: ReturnType<typeof setup>) {
  const update = fixture.db.update;
  fixture.db.update = vi.fn((table: any) => {
    const chain = update(table);
    return { set(values: any) {
      if (getTableName(table) === "btgHttpDiagnosticos" && values.respostaCifrada) return { where: async () => { throw new Error(segredo); } };
      return chain.set(values);
    } };
  });
}

describe("Captura BTG — fluxo real com repositório/crypto/DB fixture", () => {
  it.each([201, 400])("persiste corpos cifrados exatos no HTTP %s, sem tokens/PII na evidência pública", async httpStatus => {
    const fixture = setup();
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "info")];
    const raw = httpStatus === 201 ? JSON.stringify(success) : ` {"reason":"${segredo}","unknown":"João da Silva Rua Teste 52998224725"}\n`;
    banco.mockImplementation(async (_url: unknown, options: RequestInit) => {
      const row = fixture.state.tables.btgHttpDiagnosticos[0];
      expect(row.estadoCaptura).toBe("enviando");
      expect(decifrarDiagnosticoBtg(row.payloadCifrado, aadDiagnosticoBtg(row)).equals(Buffer.from(options.body as string))).toBe(true);
      return new Response(raw, { status: httpStatus });
    });
    const result = await emitirParcelasAcordoBtgV2({ db: fixture.db, acordoId: 5, parcelaIds: [19], usuarioId: 10 });
    const evidence = bodies(fixture);
    expect(evidence.resposta!.equals(Buffer.from(raw))).toBe(true);
    expect(evidence.payload.equals(Buffer.from(banco.mock.calls[0][1].body))).toBe(true);
    expect(evidence.row.payloadSha256).toBe(createHash("sha256").update(evidence.payload).digest("hex"));
    expect(evidence.row.respostaSha256).toBe(createHash("sha256").update(evidence.resposta!).digest("hex"));
    expect(JSON.parse(evidence.payload.toString()).account).toEqual({ branch: "0050", number: "0003081850" });
    expect(JSON.parse(evidence.payload.toString()).detail).toEqual({ documentNumber: "PA19R1", externalId: "v2:sbx:parcela_acordo:19:r1", correlationId: "btgv2-100" });
    expect(evidence.row).toMatchObject({ estadoCaptura: "resposta_recebida", httpStatus, respostaCompleta: 1, usuarioId: 10 });
    semSegredos(undefined, [fixture.state.tables.btgHttpDiagnosticos, fixture.state.tables.auditLogs, result]);
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe(httpStatus === 201 ? "emitida" : "incerta");
    expect(banco).toHaveBeenCalledOnce();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, -1, 1.5])("ator inválido %s bloqueia nova emissão antes de reserva", async usuarioId => {
    const fixture = setup();
    await expect(emitirBolePixV2({ db: fixture.db, parcelaId: 19, usuarioId })).rejects.toThrow("usuário autenticado");
    expect(fixture.state.writes).toEqual([]); expect(banco).not.toHaveBeenCalled();
  });

  it.each(["reservada", "enviando", "incerta", "falha", "emitida", "paga", "cancelada", "expirada"])("canônica antiga %s sem ator/chave nunca prepara captura nem envia", async status => {
    const fixture = setup({ parcelasAcordo: [{ ...parcela, canalBancario: "api_btg_v2" }],
      btgCobrancasEmitidas: [{ id: 8, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2,
        origemTipo: "parcela_acordo", origemId: 19, revisao: 1, status, amount: 1852, dueDate: parcela.dueDate, btgCollectionId: null }] });
    vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", "");
    await expect(emitirBolePixV2({ db: fixture.db, parcelaId: 19 })).resolves.toMatchObject({ id: 8, status, jaExistia: true });
    expect(fixture.state.writes).toEqual([]); expect(fixture.state.tables.btgHttpDiagnosticos).toEqual([]);
    expect(banco).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled();
  });

  it.each(["chave", "auditoria", "ator_revogado"])("falha %s antes de POST mantém canônica reservada sem captura falsa ou retry", async falha => {
    const fixture = setup();
    if (falha === "chave") vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", "");
    if (falha === "auditoria") fixture.state.failAudit = true;
    if (falha === "ator_revogado") fixture.state.tables.users[0].isActive = 0;
    const error = await emitirBolePixV2({ db: fixture.db, parcelaId: 19, usuarioId: 10 }).catch(e => e);
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("reservada");
    expect(fixture.state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
    expect(fixture.state.tables.btgHttpDiagnosticos).toEqual([]); expect(banco).not.toHaveBeenCalled();
    expect(obterVinculoEmissaoErroBtg(error)).toMatchObject({ emissaoId: 100, parcelaId: 19, capturaId: null });
    await expect(emitirBolePixV2({ db: fixture.db, parcelaId: 19 })).resolves.toMatchObject({ jaExistia: true, status: "reservada" });
    semSegredos(error);
  });

  it("persistência de resposta falha após POST: estado incerto, evidência inicial mantida e nova chamada só retorna canônica", async () => {
    const fixture = setup(); falharResposta(fixture);
    const error = await emitirBolePixV2({ db: fixture.db, parcelaId: 19, usuarioId: 10 }).catch(e => e);
    expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({ status: "incerta", erroCodigo: "EMISSAO_SEM_CONFIRMACAO" });
    expect(fixture.state.tables.btgHttpDiagnosticos[0]).toMatchObject({ estadoCaptura: "enviando", respostaCifrada: null });
    expect(obterVinculoEmissaoErroBtg(error)).toMatchObject({ emissaoId: 100, capturaId: 100, parcelaId: 19 });
    await expect(emitirBolePixV2({ db: fixture.db, parcelaId: 19 })).resolves.toMatchObject({ jaExistia: true, status: "incerta" });
    expect(banco).toHaveBeenCalledOnce(); semSegredos(error, [fixture.state.tables.auditLogs]);
  });

  it("transporte falha: sem_resposta sem HTTP inventado e canônica incerta", async () => {
    const fixture = setup(); banco.mockRejectedValue(new Error(segredo));
    const error = await emitirBolePixV2({ db: fixture.db, parcelaId: 19, usuarioId: 10 }).catch(e => e);
    expect(fixture.state.tables.btgHttpDiagnosticos[0]).toMatchObject({ estadoCaptura: "sem_resposta", httpStatus: null, respostaCifrada: null });
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("incerta"); expect(banco).toHaveBeenCalledOnce(); semSegredos(error);
  });

  it.each(["http400", "persistencia", "preparo"])("remessa preserva vínculo reservado validado na falha %s, sem inferência pelo item nulo", async falha => {
    const fixture = setup({ btgRemessas: [{ id: 50, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, status: "rascunho" }],
      btgRemessaItens: [{ id: 1, btgRemessaId: 50, parcelaAcordoId: 19, installmentNumber: 1, valorCentavos: 1852, btgCobrancaEmitidaId: null }] });
    if (falha === "http400") banco.mockResolvedValue(new Response(`{"reason":"${segredo}","unknown":"52998224725"}`, { status: 400 }));
    if (falha === "persistencia") falharResposta(fixture);
    if (falha === "preparo") vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", "");
    const result = await executarRemessaBtgV2({ db: fixture.db, remessaId: 50, parcelas: [parcela], usuarioId: 10 });
    expect(result).toMatchObject({ status: "falha", totalFalha: 1 });
    expect(fixture.state.tables.btgRemessaItens[0]).toMatchObject({ resultado: "falha", btgCobrancaEmitidaId: fixture.state.tables.btgCobrancasEmitidas[0].id });
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe(falha === "preparo" ? "reservada" : "incerta");
    expect(banco).toHaveBeenCalledTimes(falha === "preparo" ? 0 : 1);
    if (falha === "http400") expect(result.diagnosticosHttp).toEqual([{ parcelaId: 19, emissaoId: 100, capturaId: 100, httpStatus: 400, camposInvalidos: [], motivos: [fallback] }]);
    semSegredos(undefined, [result, fixture.state.tables.btgRemessaItens, fixture.state.tables.btgRemessas, fixture.state.tables.auditLogs]);
  });

  it("não vincula item a canônica que divergiu do contexto validado antes do erro", async () => {
    const fixture = setup({ btgRemessas: [{ id: 50, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, status: "rascunho" }],
      btgRemessaItens: [{ id: 1, btgRemessaId: 50, parcelaAcordoId: 19, installmentNumber: 1, valorCentavos: 1852, btgCobrancaEmitidaId: null }] });
    banco.mockImplementation(async () => {
      fixture.state.tables.btgCobrancasEmitidas[0].condominioId = 99;
      return new Response("{}", { status: 400 });
    });
    const result = await executarRemessaBtgV2({ db: fixture.db, remessaId: 50, parcelas: [parcela], usuarioId: 10 });
    expect(fixture.state.tables.btgRemessaItens[0].btgCobrancaEmitidaId).toBeNull();
    expect(result.diagnosticosHttp?.[0]).not.toHaveProperty("emissaoId");
    expect(result.diagnosticosHttp?.[0]).not.toHaveProperty("capturaId"); expect(banco).toHaveBeenCalledOnce();
  });

  it("retorno truncado é cifrado como incompleto e nunca promove emissão", async () => {
    const fixture = setup(); const bytes = new Uint8Array(65537).fill(32); bytes.set(utf8(JSON.stringify(success)));
    banco.mockResolvedValue(new Response(bytes, { status: 201 }));
    await expect(emitirBolePixV2({ db: fixture.db, parcelaId: 19, usuarioId: 10 })).rejects.toThrow("incompleta");
    const evidence = bodies(fixture);
    expect(evidence.row).toMatchObject({ estadoCaptura: "resposta_incompleta", respostaBytes: 65536, respostaCompleta: 0 });
    expect(evidence.resposta!.equals(Buffer.from(bytes.slice(0, 65536)))).toBe(true);
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("incerta"); expect(banco).toHaveBeenCalledOnce();
  });
});
