import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { DOCUMENTO_CONDOMINIO_MAX_BYTES, DOCUMENTO_CONDOMINIO_MAX_BASE64, validarArquivoDocumentoCondominio } from "../shared/documentos-condominio";
import { decodificarDocumentoCondominio } from "./condominio-documentos-upload";

const mocks = vi.hoisted(() => ({ storage: vi.fn(), update: vi.fn(), condominio: vi.fn(), audit: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
vi.mock("./db-condominios", async original => ({ ...await original<typeof import("./db-condominios")>(), getCondominioById: mocks.condominio, updateCondominio: mocks.update }));
vi.mock("./audit", async original => ({ ...await original<typeof import("./audit")>(), logAudit: mocks.audit }));
import { appRouter } from "./routers";

function pdf(tamanho: number) {
  const buffer = Buffer.alloc(tamanho, 32);
  buffer.write("%PDF-1.7\n");
  buffer.write("\n%%EOF", tamanho - 6);
  return buffer;
}
const input = (buffer = pdf(100)) => ({ condominioId: 10, tipo: "convencao" as const,
  fileName: "convenção.PDF", mimeType: "application/pdf", fileBase64: buffer.toString("base64") });
const ctx = (role = "admin"): TrpcContext => ({ user: { id: 901, role, isActive: 1 } as TrpcContext["user"],
  req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.condominio.mockResolvedValue({ id: 10 });
  mocks.storage.mockResolvedValue({ url: "https://example.com/teste.pdf" });
  mocks.update.mockResolvedValue(undefined);
});

describe("documentos condominiais — limite e PDF", () => {
  it("usa 50 MB inclusive e não depende do limite antigo de 16 MB", () => {
    expect(DOCUMENTO_CONDOMINIO_MAX_BYTES).toBe(50 * 1024 * 1024);
    for (const size of [17 * 1024 * 1024, DOCUMENTO_CONDOMINIO_MAX_BYTES]) {
      expect(validarArquivoDocumentoCondominio({ name: "CONVENCAO.PDF", type: "application/pdf", size })).toBeNull();
      expect(decodificarDocumentoCondominio(input(pdf(size))).length).toBe(size);
    }
  });
  it("recusa 50 MB + 1 byte no browser e na API mesmo com base64 de comprimento permitido", () => {
    const arquivo = pdf(DOCUMENTO_CONDOMINIO_MAX_BYTES + 1);
    expect(arquivo.toString("base64").length).toBe(DOCUMENTO_CONDOMINIO_MAX_BASE64);
    expect(validarArquivoDocumentoCondominio({ name: "regimento.pdf", type: "application/pdf", size: arquivo.length })).toContain("50 MB");
    expect(() => decodificarDocumentoCondominio(input(arquivo))).toThrow(/50 MB/);
  });
  it("valida nome, tipo e vazio igualmente para clique e arraste", () => {
    expect(validarArquivoDocumentoCondominio({ name: "regimento.PDF", type: "", size: 100 })).toBeNull();
    expect(validarArquivoDocumentoCondominio({ name: "regimento.PDF", type: "application/octet-stream", size: 100 })).toBeNull();
    expect(validarArquivoDocumentoCondominio({ name: "malicioso.exe", type: "application/pdf", size: 100 })).toContain("PDF");
    expect(validarArquivoDocumentoCondominio({ name: "arquivo.pdf", type: "image/png", size: 100 })).toContain("PDF");
    expect(validarArquivoDocumentoCondominio({ name: "arquivo.pdf", type: "application/pdf", size: 0 })).toContain("vazio");
  });
  it.each(["", "!!!!", "data:application/pdf;base64,JVBERi0=", "JVBERi0=extra", "JVBERi0", "JVBE\nRi0="])("recusa base64 inválido: %s", fileBase64 => {
    expect(() => decodificarDocumentoCondominio({ ...input(), fileBase64 })).toThrow();
  });
  it("não aceita conteúdo falso com extensão e MIME PDF", () => {
    expect(() => decodificarDocumentoCondominio(input(Buffer.from("Texto que não é PDF")))) .toThrow(/PDF/);
  });
});

describe("uploadDocumento — proteção e persistência", () => {
  it.each(["sindico", "advogado", "colaborador", "user"])("mantém upload exclusivo de administrador: %s", async role => {
    await expect(appRouter.createCaller(ctx(role)).condominios.uploadDocumento(input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("recusa sessão ausente", async () => {
    await expect(appRouter.createCaller({ ...ctx(), user: null }).condominios.uploadDocumento(input())).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("não cria arquivo órfão para condomínio inexistente", async () => {
    mocks.condominio.mockResolvedValue(undefined);
    await expect(appRouter.createCaller(ctx()).condominios.uploadDocumento(input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["convencao", "regimento"] as const)("aceita PDF >16MB, persiste somente URL e audita tamanho: %s", async tipo => {
    const bytes = pdf(17 * 1024 * 1024);
    const result = await appRouter.createCaller(ctx()).condominios.uploadDocumento({ ...input(bytes), tipo });
    expect(result.url).toBe("https://example.com/teste.pdf");
    const [key, buffer, mime] = mocks.storage.mock.calls[0];
    expect(key).toMatch(new RegExp(`^condominios/10/docs/${tipo}-.+\\.pdf$`));
    expect(buffer.equals(bytes)).toBe(true); expect(mime).toBe("application/pdf");
    expect(mocks.update).toHaveBeenCalledWith(10, { [tipo === "convencao" ? "juridicoConvencaoUrl" : "juridicoRegimentoUrl"]: result.url });
    expect(mocks.audit.mock.calls[0][1]).toMatchObject({ entity: "condominio", condominioId: 10, metadata: { tipoDocumento: tipo, tamanhoBytes: bytes.length } });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(bytes.toString("base64"));
  });
  it("mantém documento anterior quando o armazenamento falha", async () => {
    mocks.storage.mockRejectedValueOnce(new Error("Falha simulada de storage"));
    await expect(appRouter.createCaller(ctx()).condominios.uploadDocumento(input())).rejects.toThrow("Falha simulada");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("recusa arquivo maior e não PDF antes de chamar o armazenamento", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(caller.condominios.uploadDocumento(input(pdf(DOCUMENTO_CONDOMINIO_MAX_BYTES + 1)))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.condominios.uploadDocumento(input(Buffer.from("Não é PDF")))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
});
