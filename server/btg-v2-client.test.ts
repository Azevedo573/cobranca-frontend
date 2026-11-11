import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { tokenMock, configMock } = vi.hoisted(() => ({
  tokenMock: vi.fn(),
  configMock: vi.fn(),
}));
vi.mock("./btg-oauth", () => ({ obterAccessTokenBtg: tokenMock }));
vi.mock("./btg-v2/config", async (importOriginal) => ({
  ...await importOriginal<typeof import("./btg-v2/config")>(),
  getBtgV2ServerConfig: configMock,
}));

import { cancelarCobrancaBtgV2, consultarCobrancaBtgV2, criarBolePixBtgV2 } from "./btg-v2/client";
import { BtgV2ConfigurationError } from "./btg-v2/config";
import { BtgV2HttpError, obterDiagnosticoHttpBtg } from "./btg-v2/errors";
import type { BtgV2BolePixPayload } from "./btg-v2/bolepix";
import { criarCapturaMock } from "./btg-v2-http-captura-test-helper";

const documento = "O número do documento excede o limite permitido";
const fallback = "O BTG não informou um motivo seguro para este erro.";
const api = "https://api.sandbox.empresas.btgpactual.com";
const companyId = "12345678000199";
const token = "token-de-teste";
const segredo = "Maria Teste da Silva CPF 123.456.789-09 maria@example.invalid Bearer TOKEN-SEGREDO";

function assertHeaders(headers: Record<string, string>, contentType = false, sandbox = true) {
  expect(headers).toEqual({
    Accept: "application/json", Authorization: `Bearer ${token}`,
    ...(contentType ? { "Content-Type": "application/json" } : {}),
    ...(sandbox ? { "x-response": "success" } : {}),
  });
}

async function capturarErro(pending: Promise<unknown>): Promise<BtgV2HttpError> {
  const error = await pending.catch((error: unknown) => error);
  expect(error).toBeInstanceOf(BtgV2HttpError);
  expect(error).toBeInstanceOf(BtgV2ConfigurationError);
  return error as BtgV2HttpError;
}

describe("BTG v2 — cliente Collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tokenMock.mockResolvedValue(token);
    configMock.mockReturnValue({ ambiente: "sandbox", apiBaseUrl: api, companyId });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("consulta por id com paginação obrigatória e headers Sandbox sem retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        collectionId: "collection-1", status: "PAID", paidAt: "2026-11-16T10:00:00.000Z", paidAmount: 123.45,
        detail: { emv: "000201", digitableLine: "123", ourNumber: "456" },
      }],
    }), { status: 200 }));

    const result = await consultarCobrancaBtgV2("collection-1", fetchMock);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${api}/${companyId}/banking/collections?pageSize=1&pageNumber=1&id=collection-1`);
    expect(options.method).toBe("GET");
    assertHeaders(options.headers);
    expect(result).toMatchObject({ collectionId: "collection-1", status: "PAID", paidAmount: 12345, pixCopiaECola: "000201" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserva consulta vazia e respostas em array com amountPaid", async () => {
    const empty = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await expect(consultarCobrancaBtgV2("collection-1", empty)).resolves.toBeNull();
    expect(empty).toHaveBeenCalledOnce();
    const found = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { collectionId: "collection-1", status: "PAID", amountPaid: 2.50 },
    ]), { status: 200 }));
    await expect(consultarCobrancaBtgV2("collection-1", found)).resolves.toMatchObject({ paidAt: null, paidAmount: 250 });
    expect(found).toHaveBeenCalledOnce();
  });

  it.each([
    [{ amountPaid: 5.84 }, 584],
    [{ paidAmount: 5.84 }, 584],
    [{ amountPaid: 5 }, 500],
    [{ paidAmount: 584 }, 58400],
    [{ amountPaid: 5.84, paidAmount: 5.84 }, 584],
    [{ amountPaid: 0 }, 0],
    [{ amount: 5.84 }, null],
    [{}, null],
    [{ amountPaid: 5.84, paidAmount: 5.83 }, null],
    [{ amountPaid: 5.841 }, null],
    [{ amountPaid: -5.84 }, null],
    [{ amountPaid: "5.84" }, null],
    [{ amountPaid: null }, null],
    [{ amountPaid: 5.84, paidAmount: null }, null],
    [{ amountPaid: Number.MAX_SAFE_INTEGER }, null],
  ])(
    "normaliza valores externos %j em centavos sem nominal/heurística",
    async (data, expected) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ collectionId: "collection-1", status: "PAID", ...data }],
          }),
          { status: 200 }
        )
      );
      const result = await consultarCobrancaBtgV2("collection-1", fetchMock);
      expect(result).not.toBeNull();
      expect(result!.paidAmount).toBe(expected);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("GET");
      assertHeaders(options.headers);
    }
  );

  it("cria BolePix preservando payload e normalização da resposta de sucesso", async () => {
    const response = {
      collectionId: "stub-collection-1", status: "CREATED", pdfUrl: "https://example.invalid/boleto",
      pixQrCode: "qr-sintetico", detail: { emv: "pix-sintetico", barCode: "barras", digitableLine: "linha", ourNumber: "nosso" },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 201 }));
    const payload = { amount: 123.45, type: "BANKSLIP_QRCODE", detail: { documentNumber: "PA19R1" } } as BtgV2BolePixPayload;

    await expect(criarBolePixBtgV2(payload, fetchMock, criarCapturaMock())).resolves.toEqual({
      collectionId: "stub-collection-1", status: "CREATED", bankSlipUrl: "https://example.invalid/boleto",
      pixQrCode: "qr-sintetico", pixCopiaECola: "pix-sintetico", codigoBarras: "barras", linhaDigitavel: "linha", nossoNumero: "nosso",
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${api}/${companyId}/banking/collections`);
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(payload));
    assertHeaders(options.headers, true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(tokenMock).toHaveBeenCalledOnce();
  });

  it("cancela somente com HTTP 204, sem ler o corpo", async () => {
    const json = vi.fn();
    const text = vi.fn();
    const getReader = vi.fn();
    const success = vi.fn().mockResolvedValue({ status: 204, ok: true, json, text, body: { getReader } });
    await expect(cancelarCobrancaBtgV2("collection/1", success)).resolves.toBeUndefined();
    const [url, options] = success.mock.calls[0];
    expect(String(url)).toBe(`${api}/${companyId}/banking/collections/collection%2F1`);
    expect(options.method).toBe("DELETE");
    assertHeaders(options.headers);
    expect(success).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(getReader).not.toHaveBeenCalled();
  });

  it("mantém recusa de DELETE HTTP 200, não confundindo-o com confirmação 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reason: segredo }), { status: 200 }));
    const error = await capturarErro(cancelarCobrancaBtgV2("collection-1", fetchMock));
    expect(error.message).toContain("cancelamento da cobrança (HTTP 200)");
    expect(obterDiagnosticoHttpBtg(error)?.httpStatus).toBe(200);
    expect(error.message).not.toContain(segredo);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([400, 422, 500])("captura HTTP %i no POST com diagnóstico e exatamente um fetch", async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      name: "VALIDATION_ERROR", brn: segredo, reason: segredo,
      invalidParams: [{ name: "detail.documentNumber", reason: documento, value: segredo }],
    }), { status }));
    const payload = { amount: 123.45, detail: { documentNumber: "PA19R1" } } as BtgV2BolePixPayload;
    const error = await capturarErro(criarBolePixBtgV2(payload, fetchMock, criarCapturaMock()));
    expect(error.message).toContain(`emissão BolePix (HTTP ${status})`);
    expect(error.message).toContain(documento);
    expect(error.message).not.toContain(segredo);
    expect(obterDiagnosticoHttpBtg(error)).toEqual({
      httpStatus: status, camposInvalidos: ["detail.documentNumber"], motivos: [documento], codigo: "VALIDATION_ERROR",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${api}/${companyId}/banking/collections`);
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify(payload));
    assertHeaders(options.headers, true);
  });

  it.each(["", "<html>erro</html>", "{malformed", "a".repeat(32769)])(
    "mantém fallback seguro para corpo inválido no POST (%#)", async (body) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 400 }));
      const error = await capturarErro(criarBolePixBtgV2({} as BtgV2BolePixPayload, fetchMock, criarCapturaMock()));
      expect(obterDiagnosticoHttpBtg(error)).toEqual({ httpStatus: 400, camposInvalidos: [], motivos: [fallback] });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("o POST não aguarda stream pendente além de 5 segundos e não reenvia", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ reason: documento }))); },
      cancel,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 400 }));
    const pending = capturarErro(criarBolePixBtgV2({} as BtgV2BolePixPayload, fetchMock, criarCapturaMock()));
    await vi.advanceTimersByTimeAsync(5000);
    const error = await pending;
    expect(error.diagnostico.motivos).toEqual([fallback]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["GET", "DELETE"])("reutiliza o diagnóstico no %s sem mudar URL/headers ou reconsultar", async (method) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      invalidParams: [{ name: "payer.address.street", reason: "Campo obrigatório", value: segredo }],
    }), { status: 422 }));
    const collectionId = "collection/1?teste=1";
    const error = await capturarErro(method === "GET"
      ? consultarCobrancaBtgV2(collectionId, fetchMock)
      : cancelarCobrancaBtgV2(collectionId, fetchMock));
    expect(error.diagnostico).toEqual({ httpStatus: 422, camposInvalidos: ["payer.address.street"], motivos: ["Campo obrigatório"] });
    expect(error.message).toContain(method === "GET" ? "consulta de cobrança" : "cancelamento da cobrança");
    expect(error.message).not.toContain(segredo);
    const [url, options] = fetchMock.mock.calls[0];
    const query = new URLSearchParams({ pageSize: "1", pageNumber: "1", id: collectionId });
    expect(String(url)).toBe(method === "GET"
      ? `${api}/${companyId}/banking/collections?${query.toString()}`
      : `${api}/${companyId}/banking/collections/${encodeURIComponent(collectionId)}`);
    expect(options.method).toBe(method);
    assertHeaders(options.headers);
    expect(options.body).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["POST", "GET", "DELETE"])("não envia x-response em Produção no %s", async (method) => {
    const prodApi = "https://api.empresas.btgpactual.com";
    configMock.mockReturnValue({ ambiente: "producao", apiBaseUrl: prodApi, companyId });
    const body = { collectionId: "collection-1", status: "CREATED" };
    const fetchMock = vi.fn().mockResolvedValue(method === "DELETE"
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(method === "GET" ? [body] : body), { status: 200 }));
    if (method === "POST") await criarBolePixBtgV2({} as BtgV2BolePixPayload, fetchMock, criarCapturaMock());
    else if (method === "GET") await consultarCobrancaBtgV2("collection-1", fetchMock);
    else await cancelarCobrancaBtgV2("collection-1", fetchMock);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`${prodApi}/${companyId}/banking/collections`);
    assertHeaders(options.headers, method === "POST", false);
  });
});
