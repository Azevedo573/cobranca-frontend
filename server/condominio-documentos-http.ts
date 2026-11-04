import express, { type Express, type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import { DOCUMENTO_CONDOMINIO_JSON_LIMIT, DOCUMENTO_CONDOMINIO_UPLOAD_PATH, DOCUMENTO_CONDOMINIO_PROCEDURE } from "../shared/documentos-condominio";
import { UNAUTHED_ERR_MSG } from "../shared/const";
import { createContext } from "./_core/context";

function responderErro(res: Response, status: number, code: string, message: string) {
  const numero = status === 401 ? -32001 : status === 403 ? -32003 : status === 413 ? -32013 : -32600;
  res.status(status).json({ error: { json: { message, code: numero,
    data: { code, httpStatus: status, path: DOCUMENTO_CONDOMINIO_PROCEDURE } } } });
}

/** Antes do parser JSON global e depois dos webhooks que precisam do corpo bruto. */
export function registrarParserDocumentosCondominio(app: Express) {
  const erroParser: ErrorRequestHandler = (error, _req, res, next) => {
    if (error?.type === "entity.too.large") {
      responderErro(res, 413, "PAYLOAD_TOO_LARGE", "Documento muito grande para envio. Máximo 50 MB por PDF.");
    } else if (error?.type === "entity.parse.failed") {
      responderErro(res, 400, "BAD_REQUEST", "Requisição de documento inválida.");
    } else next(error);
  };
  app.post(DOCUMENTO_CONDOMINIO_UPLOAD_PATH, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Exatamente o mesmo resolvedor de sessão empregado pelo tRPC.
      // createContext não utiliza info antes de resolver usuário/cookies.
      const contexto = await createContext({ req, res } as Parameters<typeof createContext>[0]);
      if (!contexto.user) { responderErro(res, 401, "UNAUTHORIZED", UNAUTHED_ERR_MSG); return; }
      if (contexto.user.role !== "admin") {
        responderErro(res, 403, "FORBIDDEN", "Acesso negado. Apenas administradores podem realizar esta ação."); return;
      }
      if (req.query.batch !== undefined || !req.is("application/json")) {
        responderErro(res, 400, "BAD_REQUEST", "Envie um PDF por requisição JSON individual."); return;
      }
      next();
    } catch (error) { next(error); }
  }, express.json({ limit: DOCUMENTO_CONDOMINIO_JSON_LIMIT }), erroParser);
}
