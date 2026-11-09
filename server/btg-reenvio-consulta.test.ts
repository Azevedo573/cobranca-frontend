import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), config: vi.fn() }));
vi.mock("./btg-oauth", () => ({ obterAccessTokenBtg: mocks.token }));
vi.mock("./btg-v2/config", () => ({ getBtgV2ServerConfig: mocks.config }));
import { consultarSituacaoRecuperacaoBtg, LIMITES_CONSULTA_RECUPERACAO_BTG, normalizarCobrancaRecuperacaoBtg } from "./btg-v2/reenvio-consulta";
const input = { correlationId: "btgv2-40" };
const secret = "NAO-VAZAR-NOME-ENDERECO-PAGADOR";
function record(id = "collection-1") {
  return { collectionId: id, status: "CREATED", amount: 270.87, dueDate: "2026-12-09", type: "BANKSLIP_QRCODE",
    detail: { correlationId: input.correlationId, documentNumber: "PA20R1", barCode: "123456", digitableLine: "123.456", emv: "pix-tecnico", ourNumber: "98" },
    payee: { branchCode: "0050", number: "003081850", taxId: "30306294000145", name: secret },
    payer: { name: secret, taxId: "52998224725", email: `${secret}@example.invalid`, address: { street: secret } },
    tags: { raw: secret }, description: secret };
}
const next = (cursor = "Y3Vyc29yLTE") => ({ next: { href: `?cursor=${cursor}`, method: "GET", type: "application/json" } });
function response(data: unknown[], links: unknown = {}) { return new Response(JSON.stringify({ data, _links: links }), { headers: { "content-type": "application/json" } }); }
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.token.mockResolvedValue("TOKEN-SINTETICO");
  mocks.config.mockReturnValue({ ambiente: "sandbox", companyId: "30306294000145", apiBaseUrl: "https://api.sandbox.empresas.btgpactual.com" });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede real proibida"); }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("consulta de recuperação Collections — GET bounded e fail closed", () => {
  it("consulta filtro oficial por correlação e projeta somente dados técnicos necessários", async () => {
    fetchMock.mockResolvedValue(response([record()]));
    const result = await consultarSituacaoRecuperacaoBtg(input, fetchMock);
    expect(result).toEqual({ completa: true, motivo: "CONSULTA_COMPLETA", cobrancas: [{
      collectionId: "collection-1", status: "CREATED", correlationId: input.correlationId, documentNumber: "PA20R1",
      valorCentavos: 27087, dueDate: "2026-12-09", type: "BANKSLIP_QRCODE", agencia: "0050", conta: "003081850",
      documentoBeneficiario: "30306294000145", codigoBarras: "123456", linhaDigitavel: "123.456", pixCopiaECola: "pix-tecnico", nossoNumero: "98",
    }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).searchParams.get("correlationId")).toBe(input.correlationId);
    expect(new URL(url).searchParams.get("pageSize")).toBe("50");
    expect(new URL(url).searchParams.get("pageNumber")).toBe("1");
    expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { "x-response": "success", Authorization: "Bearer TOKEN-SINTETICO" } });
    expect(init.signal).toBeInstanceOf(AbortSignal); expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(result)).not.toContain(secret); expect(JSON.stringify(result)).not.toContain("52998224725");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("ID informado usa filtro id, sem correlationId que pudesse ocultar conflito", async () => {
    fetchMock.mockResolvedValue(response([record()]));
    expect((await consultarSituacaoRecuperacaoBtg({ ...input, collectionId: "collection-1" }, fetchMock)).completa).toBe(true);
    const params = new URL(fetchMock.mock.calls[0][0]).searchParams;
    expect(params.get("id")).toBe("collection-1"); expect(params.has("correlationId")).toBe(false);
  });
  it("não envia header de Sandbox em Produção fictícia", async () => {
    mocks.config.mockReturnValue({ ambiente: "producao", companyId: "30306294000145", apiBaseUrl: "https://api.empresas.btgpactual.com" });
    fetchMock.mockResolvedValue(response([])); await consultarSituacaoRecuperacaoBtg(input, fetchMock);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("x-response");
  });
  it("percorre cursor real com mesmo filtro até próxima página final", async () => {
    fetchMock.mockResolvedValueOnce(response([record("collection-1")], next())).mockResolvedValueOnce(response([record("collection-2")], { next: null }));
    const result = await consultarSituacaoRecuperacaoBtg(input, fetchMock);
    expect(result.completa).toBe(true); expect(result.cobrancas).toHaveLength(2);
    const params = new URL(fetchMock.mock.calls[1][0]).searchParams;
    expect(params.get("cursor")).toBe("Y3Vyc29yLTE"); expect(params.get("pageNumber")).toBe("2"); expect(params.get("correlationId")).toBe(input.correlationId);
    expect(fetchMock.mock.calls.every(([, init]) => init.method === "GET" && !init.body)).toBe(true);
  });
  it("lista vazia é não localizada SEM prova de ausência ou permissão para POST", async () => {
    fetchMock.mockResolvedValue(response([]));
    expect(await consultarSituacaoRecuperacaoBtg(input, fetchMock)).toEqual({ completa: true, motivo: "NAO_LOCALIZADA_SEM_PROVA_DE_AUSENCIA", cobrancas: [] });
  });
  it("campos essenciais ausentes não são fabricados a partir do filtro, payer ou cadastro", async () => {
    fetchMock.mockResolvedValue(response([{ collectionId: "collection-1", payer: record().payer }]));
    expect(await consultarSituacaoRecuperacaoBtg(input, fetchMock)).toEqual({ completa: true, motivo: "CONSULTA_COMPLETA", cobrancas: [{ collectionId: "collection-1" }] });
  });
  it.each([400, 401, 403, 404, 422, 429, 500, 503, 204])("HTTP %i nunca prova ausência e não causa retry", async status => {
    fetchMock.mockResolvedValue(new Response(status === 204 ? null : secret, { status }));
    expect(await consultarSituacaoRecuperacaoBtg(input, fetchMock)).toEqual({ completa: false, motivo: "HTTP_NAO_CONFIRMADO", cobrancas: [] });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([new Error(secret), Object.assign(new Error(secret), { body: secret, response: secret })])("falha externa não vaza mensagem/bruto", async error => {
    fetchMock.mockRejectedValue(error);
    const result = await consultarSituacaoRecuperacaoBtg(input, fetchMock);
    expect(result).toEqual({ completa: false, motivo: "CONSULTA_INDISPONIVEL", cobrancas: [] });
    expect(JSON.stringify(result)).not.toContain(secret); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([null, [], {}, { data: {} }, { data: [null], _links: {} }, { data: [{ status: "CREATED" }], _links: {} }])("corpo inválido não equivale a vazio: %j", async body => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).completa).toBe(false);
  });
  it.each(["<html>erro sensível</html>", '{"data":[', ""])('JSON inválido bloqueia: %s', async body => {
    fetchMock.mockResolvedValue(new Response(body, { headers: { "content-type": "application/json" } }));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("RESPOSTA_INVALIDA");
  });
  it("UTF8 inválido não é decodificado permissivamente", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0xff, 0xfe]), { headers: { "content-type": "application/json" } }));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("RESPOSTA_INVALIDA");
  });
  it.each([undefined, null, [], "cursor"])("_links ausente/malformado mantém paginação incompleta: %j", async links => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [], _links: links }), { headers: { "content-type": "application/json" } }));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("PAGINACAO_INCOMPLETA");
  });
  it.each([
    { next: {} }, { next: "?cursor=x" }, { next: { ...next().next, method: "POST" } },
    { next: { ...next().next, href: "https://evil.invalid/?cursor=x" } },
    { next: { ...next().next, href: "/outro?cursor=x" } }, { next: { ...next().next, href: "?cursor=x&id=outro" } },
    { next: { ...next().next, href: "?cursor=x&cursor=y" } }, { next: { ...next().next, href: "?cursor=x#fragment" } },
    { next: { ...next().next, href: "?cursor=" } }, { next: { ...next().next, href: "?pageNumber=2" } },
    { next: { ...next().next, href: "?cursor=%3Cscript%3E" } }, { next: { ...next().next, type: "text/html" } },
  ])("link hostil/malformado é recusado, nunca seguido: %j", async links => {
    fetchMock.mockResolvedValue(response([record()], links));
    const result = await consultarSituacaoRecuperacaoBtg(input, fetchMock);
    expect(result).toEqual({ completa: false, motivo: "PAGINACAO_INVALIDA", cobrancas: [] }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("cursor repetido, IDs repetidos ou página vazia com next são inconsistentes", async () => {
    fetchMock.mockResolvedValueOnce(response([record("c1")], next())).mockResolvedValueOnce(response([record("c2")], next()));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("PAGINACAO_INVALIDA");
    fetchMock.mockReset().mockResolvedValueOnce(response([record()], next())).mockResolvedValueOnce(response([record()], {}));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("IDENTIDADE_DIVERGENTE");
    fetchMock.mockReset().mockResolvedValue(response([], next()));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("PAGINACAO_INVALIDA");
  });
  it("página cheia sem próximo link não pressupõe completude", async () => {
    fetchMock.mockResolvedValue(response(Array.from({ length: 50 }, (_, i) => record(`c${i}`))));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("PAGINACAO_INCOMPLETA");
  });
  it("atingir limite de páginas descarta resultados parciais", async () => {
    fetchMock.mockImplementation(async () => response([record(`c${fetchMock.mock.calls.length}`)], next(`Y3Vyc29y${fetchMock.mock.calls.length}`)));
    expect(await consultarSituacaoRecuperacaoBtg(input, fetchMock)).toEqual({ completa: false, motivo: "LIMITE_PAGINAS", cobrancas: [] });
    expect(fetchMock).toHaveBeenCalledTimes(LIMITES_CONSULTA_RECUPERACAO_BTG.paginas);
  });
  it("erro na segunda página impede usar a primeira como prova", async () => {
    fetchMock.mockResolvedValueOnce(response([record()], next())).mockRejectedValueOnce(new Error(secret));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).cobrancas).toEqual([]); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("filtro ignorado com outro ID/correlação ou campos conflitantes bloqueia", async () => {
    fetchMock.mockResolvedValue(response([{ ...record(), detail: { correlationId: "outro" } }]));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("IDENTIDADE_DIVERGENTE");
    fetchMock.mockResolvedValue(response([record("outro")]));
    expect((await consultarSituacaoRecuperacaoBtg({ ...input, collectionId: "collection-1" }, fetchMock)).motivo).toBe("IDENTIDADE_DIVERGENTE");
  });
  it.each([{ correlationId: "" }, { correlationId: "a".repeat(21) }, { correlationId: "a&status=PAID" }, { correlationId: "btgv2-40", collectionId: "" }, null])("entrada inválida nem solicita token: %j", async value => {
    expect((await consultarSituacaoRecuperacaoBtg(value as typeof input, fetchMock)).motivo).toBe("ENTRADA_INVALIDA");
    expect(mocks.token).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounded bytes rejeita corpo grande e content-length sem copiar bruto", async () => {
    fetchMock.mockResolvedValue(new Response("x".repeat(LIMITES_CONSULTA_RECUPERACAO_BTG.bytes + 1), { headers: { "content-type": "application/json" } }));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("LIMITE_BYTES");
    fetchMock.mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json", "content-length": String(LIMITES_CONSULTA_RECUPERACAO_BTG.bytes + 1) } }));
    expect((await consultarSituacaoRecuperacaoBtg(input, fetchMock)).motivo).toBe("LIMITE_BYTES");
  });
  it("timeout do fetch é bounded mesmo se implementação ignora AbortSignal", async () => {
    vi.useFakeTimers(); fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = consultarSituacaoRecuperacaoBtg(input, fetchMock);
    await vi.advanceTimersByTimeAsync(LIMITES_CONSULTA_RECUPERACAO_BTG.prazoMs);
    expect(await pending).toEqual({ completa: false, motivo: "PRAZO_EXCEDIDO", cobrancas: [] });
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("timeout do token não chega ao GET", async () => {
    vi.useFakeTimers(); mocks.token.mockImplementation(() => new Promise(() => {}));
    const pending = consultarSituacaoRecuperacaoBtg(input, fetchMock);
    await vi.advanceTimersByTimeAsync(LIMITES_CONSULTA_RECUPERACAO_BTG.prazoMs);
    expect((await pending).motivo).toBe("PRAZO_EXCEDIDO"); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("stream travado/cancelamento hostil não estende deadline", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"data":[')); }, cancel() { return new Promise(() => {}); } });
    fetchMock.mockResolvedValue(new Response(stream, { headers: { "content-type": "application/json" } }));
    const pending = consultarSituacaoRecuperacaoBtg(input, fetchMock);
    await vi.advanceTimersByTimeAsync(LIMITES_CONSULTA_RECUPERACAO_BTG.prazoMs);
    expect((await pending).motivo).toBe("PRAZO_EXCEDIDO");
  });
});
describe("normalização técnica BolePix sem inferência", () => {
  it.each([[0.29, 29], [1.01, 101], [270.87, 27087], [123, 12300]])("BRL %f vira inteiro %i sem erro binário", (amount, cents) => {
    expect(normalizarCobrancaRecuperacaoBtg({ ...record(), amount }).valorCentavos).toBe(cents);
  });
  it.each(["270.87", -1, 0, Infinity, NaN, 1.001, 90071992547410])("valor inválido %j não é arredondado ou adivinhado", amount => {
    expect(() => normalizarCobrancaRecuperacaoBtg({ ...record(), amount })).toThrow("RESPOSTA_INVALIDA");
  });
  it.each(["2026-02-30", "2026-2-01", "2026-12-09T00:00:00Z"])("data inválida %s não é ajustada", dueDate => {
    expect(() => normalizarCobrancaRecuperacaoBtg({ ...record(), dueDate })).toThrow("RESPOSTA_INVALIDA");
  });
  it("conta mantém zeros e variantes concretas não conflitam silenciosamente", () => {
    expect(normalizarCobrancaRecuperacaoBtg(record()).agencia).toBe("0050");
    expect(() => normalizarCobrancaRecuperacaoBtg({ ...record(), account: { branch: "50", number: "003081850" } })).toThrow("IDENTIDADE_DIVERGENTE");
    const { payee, ...base } = record();
    expect(normalizarCobrancaRecuperacaoBtg({ ...base, account: { branch: "0050", number: "003081850" } })).toMatchObject({ agencia: "0050", conta: "003081850" });
    expect(normalizarCobrancaRecuperacaoBtg(base)).not.toHaveProperty("documentoBeneficiario");
  });
  it("preserva externalId só se presente e rejeita duplicidade conflitante", () => {
    expect(normalizarCobrancaRecuperacaoBtg(record())).not.toHaveProperty("externalId");
    expect(normalizarCobrancaRecuperacaoBtg({ ...record(), externalId: "e1" }).externalId).toBe("e1");
    expect(() => normalizarCobrancaRecuperacaoBtg({ ...record(), externalId: "e1", detail: { externalId: "e2" } })).toThrow("IDENTIDADE_DIVERGENTE");
  });
  it("meios de pagamento seguem aliases já usados por bolepix", () => {
    expect(normalizarCobrancaRecuperacaoBtg({ ...record(), pdfUrl: "https://example.invalid/boleto", pixQrCode: "base64-tecnico" })).toMatchObject({ bankSlipUrl: "https://example.invalid/boleto", pixQrCode: "base64-tecnico", pixCopiaECola: "pix-tecnico" });
  });
});
