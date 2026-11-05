import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BtgOAuthError,
  cifrarTokenBtg,
  construirUrlAutorizacaoBtg,
  consultaContasBtgHabilitada,
  getBtgOAuthConfig,
  getStatusOAuthBtg,
  obterAccessTokenBtg,
  renovarTokenBtg,
  trocarCodigoBtg,
} from "./btg-oauth";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

const ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
const CLIENT_ID = "client-id-apenas-fixture";
const CLIENT_SECRET = "client-secret-apenas-fixture";
const COMPANY_ID = "12345678000190";
const MINIMAL_SCOPES = ["openid", "brn:btg:empresas:banking:collections"];
const FULL_SCOPES = [...MINIMAL_SCOPES, "empresas.btgpactual.com/accounts.readonly"];
const fetchGuard = vi.fn();
const dbMock = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

function mockDatabase(rows: unknown[]) {
  dbMock.select.mockReturnValue(dbMock);
  dbMock.from.mockReturnValue(dbMock);
  dbMock.where.mockReturnValue(dbMock);
  dbMock.limit.mockResolvedValue(rows);
  getDbMock.mockResolvedValue(dbMock);
}

function expectSafeStatus(status: Awaited<ReturnType<typeof getStatusOAuthBtg>>) {
  expect(Object.keys(status).sort()).toEqual([
    "ambiente",
    "companyIdMasked",
    "configuracaoCompleta",
    "consultaContasHabilitada",
    "redirectUri",
    "status",
    "tokenExpiresAt",
  ]);
  expect(typeof status.consultaContasHabilitada).toBe("boolean");
  const serialized = JSON.stringify(status);
  for (const value of [CLIENT_ID, CLIENT_SECRET, ENCRYPTION_KEY, COMPANY_ID,
    "access-token-fixture", "refresh-token-fixture"]) {
    expect(serialized).not.toContain(value);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BTG_ACCOUNTS_ENABLED", undefined);
  vi.stubEnv("BTG_SANDBOX", "true");
  vi.stubEnv("BTG_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("BTG_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("BTG_REDIRECT_URI", "https://app.example.com/api/integracoes/btg/callback");
  vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", ENCRYPTION_KEY);
  vi.stubEnv("BTG_COMPANY_ID", COMPANY_ID);
  getDbMock.mockResolvedValue(null);
  fetchGuard.mockRejectedValue(new Error("Chamadas bancárias não permitidas neste teste"));
  vi.stubGlobal("fetch", fetchGuard);
});

afterEach(() => {
  try {
    expect(fetchGuard).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
    expect(dbMock.delete).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

describe.each([
  { ambiente: "sandbox", sandbox: "true", origin: "https://id.sandbox.btgpactual.com", companyId: "30306294000145" },
  { ambiente: "producao", sandbox: "false", origin: "https://id.btgpactual.com", companyId: COMPANY_ID },
])("OAuth BTG — opção Accounts em $ambiente", ({ ambiente, sandbox, origin, companyId }) => {
  beforeEach(() => {
    vi.stubEnv("BTG_SANDBOX", sandbox);
  });

  it.each([
    { flag: undefined, enabled: true, scopes: FULL_SCOPES, label: "ausente preserva compatibilidade" },
    { flag: "false", enabled: false, scopes: MINIMAL_SCOPES, label: "false solicita só openid e Collections" },
    { flag: "true", enabled: true, scopes: FULL_SCOPES, label: "true inclui Accounts" },
  ])("$label no próximo consentimento", ({ flag, enabled, scopes }) => {
    vi.stubEnv("BTG_ACCOUNTS_ENABLED", flag);
    expect(consultaContasBtgHabilitada()).toBe(enabled);
    const config = getBtgOAuthConfig();
    expect(config.ambiente).toBe(ambiente);
    expect(config.companyId).toBe(companyId);
    expect(config.scopes).toEqual(scopes);
    const url = new URL(construirUrlAutorizacaoBtg(config, "state-fixture"));
    expect(url.origin).toBe(origin);
    expect(config.tokenUrl).toBe(`${origin}/oauth2/token`);
    expect(url.searchParams.get("scope")).toBe(scopes.join(" "));
    expect(url.searchParams.get("state")).toBe("state-fixture");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it("true restaura Accounts em uma nova configuração, sem modificar a anterior", () => {
    vi.stubEnv("BTG_ACCOUNTS_ENABLED", "false");
    const previousConfig = getBtgOAuthConfig();
    vi.stubEnv("BTG_ACCOUNTS_ENABLED", "true");
    const nextConfig = getBtgOAuthConfig();
    expect(previousConfig.scopes).toEqual(MINIMAL_SCOPES);
    expect(nextConfig.scopes).toEqual(FULL_SCOPES);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it.each(["", "TRUE", "0", "1", " false ", "valor-sensivel-nao-expor"])(
    "rejeita opção explícita não booleana (%j) sem divulgar seu valor", async (value) => {
      vi.stubEnv("BTG_ACCOUNTS_ENABLED", value);
      const safeError = {
        code: "CONFIG_INVALID",
        message: "BTG_ACCOUNTS_ENABLED deve ser true ou false, ou estar ausente para manter a consulta de contas habilitada.",
      };
      expect(consultaContasBtgHabilitada).toThrow(BtgOAuthError);
      expect(consultaContasBtgHabilitada).toThrow(safeError.message);
      expect(getBtgOAuthConfig).toThrow(safeError.message);
      await expect(getStatusOAuthBtg()).rejects.toMatchObject(safeError);
      vi.stubEnv("BTG_CLIENT_ID", undefined);
      await expect(getStatusOAuthBtg()).rejects.toMatchObject(safeError);
      expect(getDbMock).not.toHaveBeenCalled();
    },
  );

  describe.each([
    { flag: undefined, enabled: true, label: "padrão" },
    { flag: "false", enabled: false, label: "sem Accounts" },
    { flag: "true", enabled: true, label: "com Accounts" },
  ])("status seguro — $label", ({ flag, enabled }) => {
    beforeEach(() => {
      vi.stubEnv("BTG_ACCOUNTS_ENABLED", flag);
    });

    it("publica a flag quando não configurado, sem acessar banco ou BTG", async () => {
      vi.stubEnv("BTG_CLIENT_ID", undefined);
      const status = await getStatusOAuthBtg();
      expect(status).toMatchObject({ ambiente, configuracaoCompleta: false,
        consultaContasHabilitada: enabled, status: "nao_configurado", companyIdMasked: null });
      expectSafeStatus(status);
      expect(getDbMock).not.toHaveBeenCalled();
      expect(dbMock.select).not.toHaveBeenCalled();
    });

    it("publica a flag quando não há banco disponível", async () => {
      const status = await getStatusOAuthBtg();
      expect(status).toMatchObject({ ambiente, configuracaoCompleta: true,
        consultaContasHabilitada: enabled, status: "nao_conectado", companyIdMasked: `***${companyId.slice(-4)}` });
      expectSafeStatus(status);
      expect(getDbMock).toHaveBeenCalledOnce();
      expect(dbMock.select).not.toHaveBeenCalled();
    });

    it("publica a flag quando há banco, mas não há token", async () => {
      mockDatabase([]);
      const status = await getStatusOAuthBtg();
      expect(status).toMatchObject({ ambiente, configuracaoCompleta: true,
        consultaContasHabilitada: enabled, status: "nao_conectado", tokenExpiresAt: null });
      expectSafeStatus(status);
      expect(dbMock.select).toHaveBeenCalledOnce();
    });

    it("publica a flag conectado sem alterar tokens ou escopos consentidos", async () => {
      const token = Object.freeze({
        ambiente,
        status: "conectado",
        tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        scopes: FULL_SCOPES.join(" "),
        accessTokenCifrado: "access-token-fixture",
        refreshTokenCifrado: "refresh-token-fixture",
      });
      mockDatabase([token]);
      const before = JSON.stringify(token);
      const status = await getStatusOAuthBtg();
      expect(status).toMatchObject({ ambiente, configuracaoCompleta: true,
        consultaContasHabilitada: enabled, status: "conectado", tokenExpiresAt: token.tokenExpiresAt });
      expectSafeStatus(status);
      expect(JSON.stringify(token)).toBe(before);
      expect(dbMock.select).toHaveBeenCalledOnce();
    });
  });

  it("não reconecta ou muda token existente ao alternar a flag por leitura", async () => {
    const token = Object.freeze({
      ambiente,
      status: "conectado",
      tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scopes: FULL_SCOPES.join(" "),
      accessTokenCifrado: cifrarTokenBtg("access-token-fixture", ENCRYPTION_KEY),
      refreshTokenCifrado: cifrarTokenBtg("refresh-token-fixture", ENCRYPTION_KEY),
    });
    mockDatabase([token]);
    const before = JSON.stringify(token);
    for (const flag of ["false", "true", undefined]) {
      vi.stubEnv("BTG_ACCOUNTS_ENABLED", flag);
      const status = await getStatusOAuthBtg();
      expect(status.status).toBe("conectado");
      expect(status.consultaContasHabilitada).toBe(flag !== "false");
      expectSafeStatus(status);
      expect(await obterAccessTokenBtg()).toBe("access-token-fixture");
    }
    expect(JSON.stringify(token)).toBe(before);
  });

  it("preserva status requer_reconexao, sem renovação causada pela leitura", async () => {
    vi.stubEnv("BTG_ACCOUNTS_ENABLED", "false");
    mockDatabase([{ status: "requer_reconexao", tokenExpiresAt: new Date(0), scopes: FULL_SCOPES.join(" ") }]);
    const status = await getStatusOAuthBtg();
    expect(status.status).toBe("requer_reconexao");
    expect(status.consultaContasHabilitada).toBe(false);
    expectSafeStatus(status);
  });

  it("não acrescenta escopos nas requisições existentes de troca ou renovação de token", async () => {
    vi.stubEnv("BTG_ACCOUNTS_ENABLED", "false");
    const config = getBtgOAuthConfig();
    const fetchMock = vi.fn(async (_url: string | URL | Request, _request?: RequestInit) => new Response(JSON.stringify({
      access_token: "access-token-fixture",
      refresh_token: "refresh-token-fixture",
      expires_in: 3600,
      scope: FULL_SCOPES.join(" "),
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const exchange = await trocarCodigoBtg(config, "code-fixture", fetchMock);
    const renewal = await renovarTokenBtg(config, "refresh-token-fixture", fetchMock);
    expect(exchange.scope).toBe(FULL_SCOPES.join(" "));
    expect(renewal.scope).toBe(FULL_SCOPES.join(" "));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, request] of fetchMock.mock.calls) {
      expect(url).toBe(config.tokenUrl);
      expect(request?.method).toBe("POST");
      expect(request?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}` });
      expect(new URLSearchParams(request?.body as string).has("scope")).toBe(false);
    }
    expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[0][1]?.body as string))).toEqual({
      grant_type: "authorization_code", code: "code-fixture", redirect_uri: config.redirectUri,
    });
    expect(Object.fromEntries(new URLSearchParams(fetchMock.mock.calls[1][1]?.body as string))).toEqual({
      grant_type: "refresh_token", refresh_token: "refresh-token-fixture",
    });
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
