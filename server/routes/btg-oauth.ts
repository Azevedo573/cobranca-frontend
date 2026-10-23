import type { Express, Request, Response } from "express";
import { logAuditRaw } from "../audit";
import {
  BtgOAuthError,
  concluirAutorizacaoBtg,
  getBtgOAuthConfig,
  registrarRecusaAutorizacaoBtg,
} from "../btg-oauth";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getConfigurationRedirect(result: "conectado" | "negado" | "erro"): string {
  const config = getBtgOAuthConfig();
  const url = new URL("/configuracoes/btg", config.redirectUri);
  url.searchParams.set("btgOAuth", result);
  return url.toString();
}

function sendCallbackError(res: Response, status: number): void {
  res.status(status).type("html").send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Integração BTG</title></head>
<body><main><h1>Não foi possível concluir a conexão com o BTG</h1>
<p>Volte ao Luminus e inicie a autorização novamente.</p></main></body></html>`);
}

export function registerBtgOAuthRoutes(app: Express): void {
  app.get("/api/integracoes/btg/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const authorizationError = getQueryParam(req, "error");

    if (!state) {
      sendCallbackError(res, 400);
      return;
    }

    try {
      if (authorizationError) {
        await registrarRecusaAutorizacaoBtg(state);
        res.redirect(302, getConfigurationRedirect("negado"));
        return;
      }

      if (!code) {
        sendCallbackError(res, 400);
        return;
      }

      const result = await concluirAutorizacaoBtg(code, state);
      await logAuditRaw(req, result.adminUserId, null, "admin", null, {
        action: "config_change",
        entity: "configuracao",
        entityId: `btg-oauth:${result.ambiente}`,
        metadata: { integracao: "btg", evento: "autorizacao_concluida", ambiente: result.ambiente },
        severity: "info",
      });
      res.redirect(302, getConfigurationRedirect("conectado"));
    } catch (error) {
      if (error instanceof BtgOAuthError && error.code !== "STATE_INVALID") {
        console.warn("[BTG OAuth] Falha controlada no callback:", error.code);
      } else if (!(error instanceof BtgOAuthError)) {
        console.error("[BTG OAuth] Falha inesperada no callback");
      }
      sendCallbackError(res, 400);
    }
  });
}
