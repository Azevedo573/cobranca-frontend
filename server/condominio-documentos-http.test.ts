import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express, { type ErrorRequestHandler } from "express";
import { createServer, type Server } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { initTRPC } from "@trpc/server";
import { createTRPCClient } from "@trpc/client";
import superjson from "superjson";
import { z } from "zod";
import type { AppRouter } from "./routers";
import { DOCUMENTO_CONDOMINIO_MAX_BASE64, DOCUMENTO_CONDOMINIO_UPLOAD_PATH } from "../shared/documentos-condominio";
import { criarLinksTransporteTrpc } from "../client/src/lib/trpcTransport";

const auth = vi.hoisted(() => ({ createContext: vi.fn() }));
vi.mock("./_core/context", () => ({ createContext: auth.createContext }));
import { registrarParserDocumentosCondominio } from "./condominio-documentos-http";

let server: Server;
let base: string;
const chamadas: { path: string; batch: unknown }[] = [];

beforeAll(async () => {
  auth.createContext.mockImplementation(async ({ req, res }) => ({ req, res,
    user: req.headers["x-test-role"] ? { id: 1, role: req.headers["x-test-role"] } : null }));
  const app = express();
  // Preservação do corpo bruto antes de qualquer parser de documento.
  app.post("/api/webhooks/btg/v2/sandbox", express.raw({ type: "application/json", limit: "1mb" }),
    (req, res) => { res.json({ bruto: Buffer.isBuffer(req.body), tamanho: req.body.length }); });
  registrarParserDocumentosCondominio(app);
  app.use(express.json({ limit: "50mb" }));
  app.post("/outro-upload", (_req, res) => { res.json({ ok: true }); });
  const t = initTRPC.create({ transformer: superjson });
  const router = t.router({ condominios: t.router({
    uploadDocumento: t.procedure.input(z.object({ fileBase64: z.string(), fileName: z.string() })).mutation(({ input }) => ({
      url: `https://example.com/${input.fileBase64.length}`, fileName: input.fileName,
    })), list: t.procedure.query(() => []),
  }) });
  app.use("/api/trpc", (req, _res, next) => { chamadas.push({ path: req.path, batch: req.query.batch }); next(); },
    createExpressMiddleware({ router, createContext: () => ({}) }));
  const error: ErrorRequestHandler = (err, _req, res, _next) => { res.status(err.status || 500).json({ error: err.type }); };
  app.use(error);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Porta local não disponível");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  vi.unstubAllGlobals();
});
const post = (path: string, body: string, role?: string, type = "application/json") => fetch(base + path, {
  method: "POST", headers: { "content-type": type, ...(role ? { "x-test-role": role } : {}) }, body,
});

describe("transporte isolado do upload administrativo", () => {
  it("autentica antes de ler JSON inválido e recusa role local", async () => {
    const semSessao = await post(DOCUMENTO_CONDOMINIO_UPLOAD_PATH, "não é JSON");
    expect(semSessao.status).toBe(401);
    expect((await semSessao.json()).error.json.data.code).toBe("UNAUTHORIZED");
    const local = await post(DOCUMENTO_CONDOMINIO_UPLOAD_PATH, "não é JSON", "sindico");
    expect(local.status).toBe(403);
  });
  it("recusa batch e tipo de corpo incompatível", async () => {
    expect((await post(`${DOCUMENTO_CONDOMINIO_UPLOAD_PATH}?batch=1`, "{}", "admin")).status).toBe(400);
    expect((await post(DOCUMENTO_CONDOMINIO_UPLOAD_PATH, "{}", "admin", "application/octet-stream")).status).toBe(400);
  });
  it("recebe 50MB em base64 pelo cliente sem batch, com cookies, mantendo batching nas outras queries", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; credentials: unknown }[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), credentials: init?.credentials });
      return originalFetch(input, { ...init, headers: { ...init?.headers, "x-test-role": "admin" } });
    });
    try {
      const client = createTRPCClient<AppRouter>({ links: criarLinksTransporteTrpc(base + "/api/trpc") });
      const encoded = "A".repeat(DOCUMENTO_CONDOMINIO_MAX_BASE64);
      const result = await client.condominios.uploadDocumento.mutate({ condominioId: 1, tipo: "regimento", fileName: "regimento.pdf", mimeType: "application/pdf", fileBase64: encoded });
      expect(result.url).toBe(`https://example.com/${encoded.length}`);
      const upload = requests.find(r => r.url.includes("condominios.uploadDocumento"));
      expect(upload?.credentials).toBe("include");
      expect(upload?.url).not.toContain("batch=");
      await client.condominios.list.query();
      const consulta = requests.find(r => r.url.includes("condominios.list"));
      expect(consulta?.credentials).toBe("include");
      expect(consulta?.url).toContain("batch=1");
      expect(chamadas.find(c => c.path === "/condominios.uploadDocumento")?.batch).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  }, 30_000);
  it("outro caminho continua limitado a 50MB de JSON", async () => {
    const response = await post("/outro-upload", JSON.stringify({ file: "A".repeat(DOCUMENTO_CONDOMINIO_MAX_BASE64) }), "admin");
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("entity.too.large");
  }, 30_000);
  it("mantém o webhook BTG com o corpo bruto e limite próprio", async () => {
    const body = '{"evento":"teste-local"}';
    const response = await post("/api/webhooks/btg/v2/sandbox", body);
    expect(await response.json()).toEqual({ bruto: true, tamanho: Buffer.byteLength(body) });
  });
});
