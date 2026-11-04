import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarFetchComProgresso } from "../client/src/lib/uploadComProgresso";
import { iniciarProgressoDocumento, atualizarProgressoDocumento, textoFaseDocumento } from "../client/src/lib/progressoDocumento";
import { createTRPCClient } from "@trpc/client";
import type { AppRouter } from "./routers";
import { criarLinksTransporteTrpc } from "../client/src/lib/trpcTransport";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentoUploadProgresso } from "../client/src/components/DocumentoUploadProgresso";

class XhrFake {
  static ultima: XhrFake;
  upload: any = {}; headers: Record<string, string> = {};
  status = 200; statusText = "OK"; responseText = '{"ok":true}';
  withCredentials = false; timeout = 0; method = ""; url = ""; body: unknown;
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  onabort: (() => void) | null = null; ontimeout: (() => void) | null = null;
  constructor() { XhrFake.ultima = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  getAllResponseHeaders() { return "content-type: application/json\r\nx-teste: sim\r\n"; }
  send(body: unknown) { this.body = body; }
  abort() { this.onabort?.(); }
}
beforeEach(() => { vi.stubGlobal("XMLHttpRequest", XhrFake); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("envio de documentos com progresso real", () => {
  it("repassa corpo, método, headers, cookies e orçamento de timeout", async () => {
    const request = criarFetchComProgresso({})("/api/trpc/condominios.uploadDocumento", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
    const xhr = XhrFake.ultima;
    expect(xhr.method).toBe("POST"); expect(xhr.url).toContain("condominios.uploadDocumento");
    expect(xhr.headers["content-type"]).toBe("application/json"); expect(xhr.withCredentials).toBe(true);
    expect(xhr.timeout).toBe(600_000); expect(xhr.body).toBe("{}");
    xhr.onload?.();
    const response = await request;
    expect(response.status).toBe(200); expect(response.headers.get("x-teste")).toBe("sim");
    expect(await response.json()).toEqual({ ok: true });
  });
  it("reporta bytes transmitidos e termina transmissão antes da resposta do servidor", async () => {
    const progresso = vi.fn(); const transmitido = vi.fn();
    let finalizado = false;
    const request = criarFetchComProgresso({ onProgress: progresso, onUploaded: transmitido })("/upload", { method: "POST", body: "{}" }).then(r => { finalizado = true; return r; });
    XhrFake.ultima.upload.onprogress({ loaded: 40, total: 100, lengthComputable: true });
    expect(progresso).toHaveBeenCalledWith({ loaded: 40, total: 100, lengthComputable: true });
    XhrFake.ultima.upload.onload();
    expect(transmitido).toHaveBeenCalledTimes(1); expect(finalizado).toBe(false);
    XhrFake.ultima.onload?.(); await request;
    expect(finalizado).toBe(true);
  });
  it("retorna erro HTTP como Response para tratamento normal do tRPC, sem falso sucesso", async () => {
    const request = criarFetchComProgresso({})("/upload", { method: "POST" });
    XhrFake.ultima.status = 413; XhrFake.ultima.statusText = "Payload Too Large";
    XhrFake.ultima.responseText = '{"error":"arquivo grande"}'; XhrFake.ultima.onload?.();
    const response = await request; expect(response.ok).toBe(false); expect(response.status).toBe(413);
  });
  it.each(["onerror", "ontimeout", "onabort"] as const)("libera envio em falha: %s", async evento => {
    const request = criarFetchComProgresso({})("/upload", { method: "POST" });
    const rejected = expect(request).rejects.toThrow();
    XhrFake.ultima[evento]?.(); await rejected;
  });
  it("respeita AbortSignal durante o envio e antes de abrir a conexão", async () => {
    const controller = new AbortController();
    const request = criarFetchComProgresso({})("/upload", { method: "POST", signal: controller.signal });
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejected;
    await expect(criarFetchComProgresso({})("/upload", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
  it("usa fetch em ambiente sem XMLHttpRequest sem alterar o corpo ou cookies", async () => {
    vi.stubGlobal("XMLHttpRequest", undefined);
    const fetch = vi.fn().mockResolvedValue(new Response("{}")); vi.stubGlobal("fetch", fetch);
    await criarFetchComProgresso({})("/upload", { credentials: "include", body: "{}" });
    expect(fetch).toHaveBeenCalledWith("/upload", { credentials: "include", body: "{}" });
  });
  it("encaminha callbacks por contexto local da operação tRPC e não os transmite no JSON", async () => {
    const onProgress = vi.fn(); const onUploaded = vi.fn();
    const client = createTRPCClient<AppRouter>({ links: criarLinksTransporteTrpc() });
    const resultado = client.condominios.uploadDocumento.mutate({ condominioId: 1, tipo: "regimento", fileName: "regimento.pdf", mimeType: "application/pdf", fileBase64: "JVBERi0=" },
      { context: { documentoUpload: { onProgress, onUploaded } } });
    await vi.waitFor(() => expect(XhrFake.ultima.url).toContain("condominios.uploadDocumento"));
    const xhr = XhrFake.ultima;
    expect(xhr.url).not.toContain("batch="); expect(xhr.withCredentials).toBe(true);
    expect(String(xhr.body)).not.toContain("documentoUpload"); expect(String(xhr.body)).not.toContain("onProgress");
    xhr.upload.onprogress({ loaded: 42, total: 100, lengthComputable: true });
    xhr.upload.onload(); expect(onProgress).toHaveBeenCalledTimes(1); expect(onUploaded).toHaveBeenCalledTimes(1);
    xhr.responseText = JSON.stringify({ result: { data: { json: { url: "https://example.com/regimento.pdf", fileName: "regimento.pdf" } } } });
    xhr.onload?.(); expect(await resultado).toMatchObject({ url: "https://example.com/regimento.pdf" });
  });
});

describe("modelo visual — fases e percentuais", () => {
  it("mantém nome, tamanho e preparação baseada na leitura real", () => {
    const inicial = iniciarProgressoDocumento({ name: "convenção.pdf", size: 200 * 1024 * 1024 });
    expect(inicial).toMatchObject({ fase: "preparando", percentual: 0, nome: "convenção.pdf" });
    expect(atualizarProgressoDocumento(inicial, { tipo: "leitura", loaded: 50, total: 100, lengthComputable: true }).percentual).toBe(50);
    expect(textoFaseDocumento(inicial)).toBe("Preparando PDF");
  });
  it("não inventa percentual quando o tamanho não é conhecido", () => {
    const estado = atualizarProgressoDocumento(iniciarProgressoDocumento({ name: "regimento.pdf", size: 100 }), { tipo: "transmissao", loaded: 70, total: 0, lengthComputable: false });
    expect(estado.percentual).toBeNull(); expect(estado.fase).toBe("enviando");
  });
  it("100% enviado não é concluído, só confirma sucesso depois do servidor", () => {
    let estado = iniciarProgressoDocumento({ name: "regimento.pdf", size: 100 });
    estado = atualizarProgressoDocumento(estado, { tipo: "transmissao", loaded: 120, total: 100, lengthComputable: true });
    expect(estado.percentual).toBe(100); expect(estado.fase).toBe("enviando");
    estado = atualizarProgressoDocumento(estado, { tipo: "transmitido" });
    expect(estado.fase).toBe("salvando"); expect(textoFaseDocumento(estado)).toBe("Salvando documento");
    estado = atualizarProgressoDocumento(estado, { tipo: "sucesso" });
    expect(estado.fase).toBe("concluido"); expect(estado.percentual).toBe(100);
  });
  it("erro permanece visível, sem eventos atrasados reativarem a barra", () => {
    const erro = atualizarProgressoDocumento(iniciarProgressoDocumento({ name: "regimento.pdf", size: 100 }), { tipo: "erro", mensagem: "Falha de rede" });
    expect(erro.fase).toBe("erro"); expect(erro.erro).toBe("Falha de rede");
    expect(atualizarProgressoDocumento(erro, { tipo: "transmissao", loaded: 99, total: 100, lengthComputable: true })).toBe(erro);
  });
  it("renderiza nome, tamanho, percentual e status acessível", () => {
    const estado = atualizarProgressoDocumento(iniciarProgressoDocumento({ name: "Convenção.pdf", size: 200 * 1024 * 1024 }), { tipo: "transmissao", loaded: 42, total: 100, lengthComputable: true });
    const html = renderToStaticMarkup(createElement(DocumentoUploadProgresso, { estado }));
    expect(html).toContain("Convenção.pdf"); expect(html).toContain("200 MB"); expect(html).toContain("42%");
    expect(html).toContain('role="progressbar"'); expect(html).toContain('aria-valuenow="42"'); expect(html).toContain('aria-busy="true"');
  });
  it("processamento aparece indeterminado e não como armazenamento concluído", () => {
    const estado = atualizarProgressoDocumento(iniciarProgressoDocumento({ name: "Regimento.pdf", size: 100 }), { tipo: "transmitido" });
    const html = renderToStaticMarkup(createElement(DocumentoUploadProgresso, { estado }));
    expect(html).toContain("Salvando documento"); expect(html).toContain("Aguarde a confirmação");
    expect(html).not.toContain("Documento enviado"); expect(html).not.toContain('aria-valuenow="100"');
  });
});
