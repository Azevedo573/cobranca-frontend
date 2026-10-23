import { describe, expect, it, vi } from "vitest";
import {
  BtgOAuthError,
  construirUrlAutorizacaoBtg,
  decifrarTokenBtg,
  cifrarTokenBtg,
  gerarStateBtg,
  hashStateBtg,
  isStateBtgUtilizavel,
  obterLinhasAfetadasBtg,
  renovarTokenBtg,
  trocarCodigoBtg,
  type BtgOAuthConfig,
} from "./btg-oauth";

const CHAVE_TESTE = Buffer.alloc(32, 7).toString("base64");

const CONFIG_SANDBOX: BtgOAuthConfig = {
  ambiente: "sandbox",
  authorizationUrl: "https://id.sandbox.btgpactual.com/oauth2/authorize",
  tokenUrl: "https://id.sandbox.btgpactual.com/oauth2/token",
  clientId: "client-id-teste",
  clientSecret: "client-secret-teste",
  redirectUri: "https://app.exemplo.com/api/integracoes/btg/callback",
  companyId: "30306294000145",
  encryptionKey: CHAVE_TESTE,
  scopes: ["openid", "brn:btg:empresas:banking:collections", "empresas.btgpactual.com/accounts.readonly"],
};

describe("OAuth BTG — Authorization Code", () => {
  it("gera state aleatório com hash estável e sem expor o valor no hash", () => {
    const state = gerarStateBtg();
    const outroState = gerarStateBtg();

    expect(state).not.toBe(outroState);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hashStateBtg(state)).toHaveLength(64);
    expect(hashStateBtg(state)).toBe(hashStateBtg(state));
    expect(hashStateBtg(state)).not.toContain(state);
  });

  it("constrói URL de consentimento com client ID, redirect URI, scopes e state", () => {
    const url = new URL(construirUrlAutorizacaoBtg(CONFIG_SANDBOX, "state-seguro"));

    expect(url.origin).toBe("https://id.sandbox.btgpactual.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-id-teste");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG_SANDBOX.redirectUri);
    expect(url.searchParams.get("scope")).toBe("openid brn:btg:empresas:banking:collections empresas.btgpactual.com/accounts.readonly");
    expect(url.searchParams.get("state")).toBe("state-seguro");
  });

  it("cifra tokens com AES-GCM sem manter o conteúdo em texto puro", () => {
    const token = "access-token-muito-sensivel";
    const cifrado = cifrarTokenBtg(token, CONFIG_SANDBOX.encryptionKey);

    expect(cifrado).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(cifrado).not.toContain(token);
    expect(decifrarTokenBtg(cifrado, CONFIG_SANDBOX.encryptionKey)).toBe(token);
  });

  it("rejeita chave de criptografia inválida e payload cifrado adulterado", () => {
    expect(() => cifrarTokenBtg("token", "chave-invalida")).toThrow(BtgOAuthError);

    const cifrado = cifrarTokenBtg("token", CONFIG_SANDBOX.encryptionKey);
    expect(() => decifrarTokenBtg(`${cifrado}adulterado`, CONFIG_SANDBOX.encryptionKey)).toThrow(BtgOAuthError);
  });

  it("considera state expirado ou já utilizado como inválido", () => {
    const agora = new Date("2026-10-23T18:00:00.000Z");

    expect(isStateBtgUtilizavel({ expiresAt: new Date("2026-10-23T18:01:00.000Z"), usedAt: null }, agora)).toBe(true);
    expect(isStateBtgUtilizavel({ expiresAt: new Date("2026-10-23T17:59:00.000Z"), usedAt: null }, agora)).toBe(false);
    expect(isStateBtgUtilizavel({ expiresAt: new Date("2026-10-23T18:01:00.000Z"), usedAt: new Date() }, agora)).toBe(false);
  });

  it("reconhece os formatos de affectedRows do driver MySQL", () => {
    expect(obterLinhasAfetadasBtg({ affectedRows: 1 })).toBe(1);
    expect(obterLinhasAfetadasBtg([{ affectedRows: 1 }, []])).toBe(1);
    expect(obterLinhasAfetadasBtg({ affectedRows: 0 })).toBe(0);
    expect(obterLinhasAfetadasBtg(undefined)).toBe(0);
  });

  it("troca authorization code por tokens usando Basic Auth, redirect URI e grant correto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 86400,
      scope: "openid brn:btg:empresas:banking:collections",
      token_type: "Bearer",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await trocarCodigoBtg(CONFIG_SANDBOX, "codigo-de-autorizacao", fetchMock);

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(CONFIG_SANDBOX.tokenUrl);
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe(`Basic ${Buffer.from("client-id-teste:client-secret-teste").toString("base64")}`);
    expect(request.body.toString()).toContain("grant_type=authorization_code");
    expect(request.body.toString()).toContain("code=codigo-de-autorizacao");
    expect(request.body.toString()).toContain(encodeURIComponent(CONFIG_SANDBOX.redirectUri));
  });

  it("renova access token com refresh_token sem reenviar authorization code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-renovado",
      refresh_token: "refresh-renovado",
      expires_in: 86400,
      scope: "openid brn:btg:empresas:banking:collections",
      token_type: "Bearer",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await renovarTokenBtg(CONFIG_SANDBOX, "refresh-atual", fetchMock);

    expect(result.accessToken).toBe("access-renovado");
    expect(result.refreshToken).toBe("refresh-renovado");
    const [, request] = fetchMock.mock.calls[0];
    expect(request.body.toString()).toContain("grant_type=refresh_token");
    expect(request.body.toString()).toContain("refresh_token=refresh-atual");
    expect(request.body.toString()).not.toContain("authorization_code");
  });

  it("não expõe resposta do provedor quando a troca do código falha", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: "segredo ou código interno do provedor",
    }), { status: 400, headers: { "content-type": "application/json" } }));

    await expect(trocarCodigoBtg(CONFIG_SANDBOX, "codigo-invalido", fetchMock))
      .rejects
      .toMatchObject({ code: "TOKEN_EXCHANGE_FAILED", message: "Não foi possível concluir a autorização no BTG." });
  });
});
