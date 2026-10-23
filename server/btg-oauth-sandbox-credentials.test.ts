import { describe, expect, it } from "vitest";
import { getBtgOAuthConfig } from "./btg-oauth";

// A consulta usa credenciais reais e chama um endpoint externo. Ela só deve ser
// executada de forma explícita durante a homologação manual do Sandbox.
const describeSandboxCredentialCheck = process.env.BTG_SANDBOX_CREDENTIAL_CHECK === "true"
  ? describe
  : describe.skip;

describeSandboxCredentialCheck("OAuth BTG Sandbox — credenciais", () => {
  it("deve ter Client Secret reconhecido pelo endpoint de token sem emitir token", async () => {
    const config = getBtgOAuthConfig();
    expect(config.ambiente).toBe("sandbox");

    const response = await fetch(config.tokenUrl, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      // Código deliberadamente inválido: esta chamada só verifica que o cliente é
      // autenticado; não pode gerar access token, refresh token ou cobrança.
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "credential-probe-invalid-code",
        redirect_uri: config.redirectUri,
      }).toString(),
    });

    const payload = await response.text();
    expect(payload).not.toMatch(/client secret presented by the client does not match/i);
    expect(payload).not.toMatch(/invalid_client/i);
  }, 30_000);
});
