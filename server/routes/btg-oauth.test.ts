import { beforeEach, describe, expect, it, vi } from "vitest";

const concluirAutorizacaoBtg = vi.fn();
const registrarRecusaAutorizacaoBtg = vi.fn();
const logAuditRaw = vi.fn();

vi.mock("../btg-oauth", async () => {
  const actual = await vi.importActual<typeof import("../btg-oauth")>("../btg-oauth");
  return {
    ...actual,
    concluirAutorizacaoBtg,
    registrarRecusaAutorizacaoBtg,
    getBtgOAuthConfig: vi.fn(() => ({
      redirectUri: "https://luminus.gomesesilvaadv.com.br/api/integracoes/btg/callback",
    })),
  };
});

vi.mock("../audit", () => ({ logAuditRaw }));

interface MockResponse {
  status: ReturnType<typeof vi.fn>;
  type: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
}

function createResponse(): MockResponse {
  const response = {} as MockResponse;
  response.status = vi.fn(() => response);
  response.type = vi.fn(() => response);
  response.send = vi.fn(() => response);
  response.redirect = vi.fn(() => response);
  return response;
}

async function getHandler() {
  const { registerBtgOAuthRoutes } = await import("./btg-oauth");
  let handler: ((req: any, res: any) => Promise<void>) | undefined;
  registerBtgOAuthRoutes({
    get: vi.fn((_path: string, routeHandler: (req: any, res: any) => Promise<void>) => {
      handler = routeHandler;
    }),
  } as any);
  if (!handler) throw new Error("Callback não registrado");
  return handler;
}

describe("Callback OAuth BTG", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("conclui callback válido e retorna o navegador à configuração sem token na URL", async () => {
    concluirAutorizacaoBtg.mockResolvedValue({ ambiente: "sandbox", adminUserId: 7 });
    const handler = await getHandler();
    const response = createResponse();

    await handler({ query: { code: "codigo-btg", state: "state-seguro" } }, response);

    expect(concluirAutorizacaoBtg).toHaveBeenCalledWith("codigo-btg", "state-seguro");
    expect(logAuditRaw).toHaveBeenCalledWith(expect.anything(), 7, null, "admin", null, expect.objectContaining({
      metadata: { integracao: "btg", evento: "autorizacao_concluida", ambiente: "sandbox" },
    }));
    expect(response.redirect).toHaveBeenCalledWith(302, "https://luminus.gomesesilvaadv.com.br/configuracoes/btg?btgOAuth=conectado");
    expect(response.redirect.mock.calls[0][1]).not.toContain("token");
  });

  it("registra consentimento negado e não tenta trocar token", async () => {
    registrarRecusaAutorizacaoBtg.mockResolvedValue(undefined);
    const handler = await getHandler();
    const response = createResponse();

    await handler({ query: { state: "state-seguro", error: "access_denied" } }, response);

    expect(registrarRecusaAutorizacaoBtg).toHaveBeenCalledWith("state-seguro");
    expect(concluirAutorizacaoBtg).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(302, "https://luminus.gomesesilvaadv.com.br/configuracoes/btg?btgOAuth=negado");
  });

  it("rejeita callback sem state sem chamar BTG", async () => {
    const handler = await getHandler();
    const response = createResponse();

    await handler({ query: { code: "codigo-btg" } }, response);

    expect(concluirAutorizacaoBtg).not.toHaveBeenCalled();
    expect(registrarRecusaAutorizacaoBtg).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith(expect.not.stringContaining("codigo-btg"));
  });
});
