import { beforeEach, describe, expect, it, vi } from "vitest";

const { configMock, accessTokenMock } = vi.hoisted(() => ({
  configMock: vi.fn(),
  accessTokenMock: vi.fn(),
}));

vi.mock("./btg-oauth", () => ({
  getBtgOAuthConfig: configMock,
  obterAccessTokenBtg: accessTokenMock,
}));

import { consultarContasRecebedorasBtg } from "./btg-v2/config";

describe("BTG v2 — consulta de contas", () => {
  beforeEach(() => {
    configMock.mockReturnValue({
      ambiente: "sandbox",
      companyId: "30306294000145",
    });
    accessTokenMock.mockResolvedValue("token-de-teste");
  });

  it("consulta manualmente e normaliza o envelope data com header Sandbox", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ accountId: "conta-1", branch: "50", number: "003081850", taxId: "30.306.294/0001-45", legalName: "Escritório" }],
    }), { status: 200 }));

    const contas = await consultarContasRecebedorasBtg(fetchMock);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.sandbox.empresas.btgpactual.com/30306294000145/banking/accounts");
    expect(options.headers["x-response"]).toBe("success");
    expect(contas).toEqual([{
      accountId: "conta-1",
      agencia: "50",
      numero: "003081850",
      documentoBeneficiario: "30306294000145",
      nomeBeneficiario: "Escritório",
    }]);
  });
});
