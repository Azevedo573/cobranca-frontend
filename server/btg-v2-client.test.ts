import { beforeEach, describe, expect, it, vi } from "vitest";

const { tokenMock, configMock } = vi.hoisted(() => ({
  tokenMock: vi.fn(),
  configMock: vi.fn(),
}));
vi.mock("./btg-oauth", () => ({ obterAccessTokenBtg: tokenMock }));
vi.mock("./btg-v2/config", () => ({
  BtgV2ConfigurationError: class BtgV2ConfigurationError extends Error {},
  getBtgV2ServerConfig: configMock,
}));

import { cancelarCobrancaBtgV2, consultarCobrancaBtgV2 } from "./btg-v2/client";

describe("BTG v2 — cliente Collections", () => {
  beforeEach(() => {
    tokenMock.mockResolvedValue("token-de-teste");
    configMock.mockReturnValue({
      ambiente: "sandbox",
      apiBaseUrl: "https://api.sandbox.empresas.btgpactual.com",
      companyId: "12345678000199",
    });
  });

  it("consulta por id com paginação obrigatória e header Sandbox", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        collectionId: "collection-1",
        status: "PAID",
        paidAt: "2026-11-16T10:00:00.000Z",
        paidAmount: 12345,
        detail: { emv: "000201", digitableLine: "123", ourNumber: "456" },
      }],
    }), { status: 200 }));

    const result = await consultarCobrancaBtgV2("collection-1", fetchMock);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("pageSize=1");
    expect(String(url)).toContain("pageNumber=1");
    expect(String(url)).toContain("id=collection-1");
    expect(options.headers["x-response"]).toBe("success");
    expect(result).toMatchObject({ collectionId: "collection-1", status: "PAID", paidAmount: 12345, pixCopiaECola: "000201" });
  });

  it("cancela somente quando o BTG confirma HTTP 204", async () => {
    const success = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(cancelarCobrancaBtgV2("collection/1", success)).resolves.toBeUndefined();
    const [url, options] = success.mock.calls[0];
    expect(String(url)).toContain("collection%2F1");
    expect(options.method).toBe("DELETE");

    const fail = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid" }), { status: 422 }));
    await expect(cancelarCobrancaBtgV2("collection-1", fail)).rejects.toThrow("HTTP 422");
  });
});
