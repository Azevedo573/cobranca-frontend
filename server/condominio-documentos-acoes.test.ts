import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({ storage: vi.fn(), condominio: vi.fn(), update: vi.fn(), trocar: vi.fn(), audit: vi.fn(), select: vi.fn(), users: [] as Record<string, unknown>[] }));
vi.mock("./db", async original => ({ ...await original<typeof import("./db")>(), getDb: async () => ({ select: mocks.select }) }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
vi.mock("./db-condominios", async original => ({ ...await original<typeof import("./db-condominios")>(), getCondominioById: mocks.condominio, updateCondominio: mocks.update }));
vi.mock("./condominio-documentos-persistencia", async original => ({ ...await original<typeof import("./condominio-documentos-persistencia")>(), trocarUrlDocumentoCondominio: mocks.trocar }));
vi.mock("./audit", async original => ({ ...await original<typeof import("./audit")>(), logAudit: mocks.audit }));
import { appRouter } from "./routers";
const antiga = "https://example.com/anterior.pdf";
const nova = "https://example.com/nova.pdf";
const usuariosLegados = ["admin", "sindico", "advogado", "colaborador", "user"].map(role => ({
  id: 901, role, isActive: 1, isDeleted: 0, condominioId: null,
  profileId: null, isPrimaryAdmin: 0, escopoCondominios: null,
}));
const ctx = (role = "admin"): TrpcContext => {
  const user = usuariosLegados.find(usuario => usuario.role === role);
  if (!user) throw new Error(`Usuário de teste não definido: ${role}`);
  mocks.users = [{ ...user }];
  return { user: { ...user } as TrpcContext["user"], req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"] };
};
const remover = { condominioId: 10, tipo: "convencao" as const, urlAtual: antiga, confirmado: true as const };
const upload = { condominioId: 10, tipo: "convencao" as const, urlAtual: antiga, fileName: "nova.pdf", mimeType: "application/pdf", fileBase64: Buffer.from("%PDF-1.7\n%%EOF").toString("base64") };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.users = [];
  mocks.select.mockImplementation((projection?: Record<string, { name: string }>) => ({
    from: (table: unknown) => {
      if (table !== users) throw new Error("A fixture aceita somente consultas à tabela users.");
      return { where: (condition: Parameters<MySqlDialect["sqlToQuery"]>[0]) => {
        const query = new MySqlDialect().sqlToQuery(condition);
        if (query.sql !== "`users`.`id` = ?" || query.params.length !== 1) {
          throw new Error(`Filtro de usuário não suportado pela fixture: ${query.sql}`);
        }
        const rows = mocks.users.filter(user => user.id === query.params[0]).map(user => projection
          ? Object.fromEntries(Object.entries(projection).map(([alias, column]) => [alias, user[column.name]]))
          : { ...user });
        return { limit: async (count: number) => rows.slice(0, count) };
      } };
    },
  }));
  mocks.condominio.mockResolvedValue({ id: 10, juridicoConvencaoUrl: antiga, juridicoRegimentoUrl: antiga });
  mocks.storage.mockResolvedValue({ url: nova });
  mocks.trocar.mockResolvedValue({ urlAnterior: antiga, url: null });
});

describe("ações de documentos condominiais", () => {
  it.each(["convencao", "regimento"] as const)("exclui vínculo confirmado e audita histórico sem apagar storage: %s", async tipo => {
    const result = await appRouter.createCaller(ctx()).condominios.removerDocumento({ ...remover, tipo });
    expect(result).toMatchObject({ success: true, tipo, url: null });
    expect(mocks.trocar).toHaveBeenCalledWith(10, tipo, antiga, null);
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    const campo = tipo === "convencao" ? "juridicoConvencaoUrl" : "juridicoRegimentoUrl";
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ beforeData: { [campo]: antiga }, afterData: { [campo]: null }, metadata: expect.objectContaining({ operacaoDocumento: "excluir", arquivoFisicoPreservado: true }) }));
  });
  it.each(["sindico", "advogado", "colaborador", "user"])("não permite remoção por %s", async role => {
    await expect(appRouter.createCaller(ctx(role)).condominios.removerDocumento(remover)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.trocar).not.toHaveBeenCalled();
  });
  it("exige sessão e confirmação explícita", async () => {
    await expect(appRouter.createCaller({ ...ctx(), user: null }).condominios.removerDocumento(remover)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(appRouter.createCaller(ctx()).condominios.removerDocumento({ ...remover, confirmado: false } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.trocar).not.toHaveBeenCalled();
  });
  it("recusa condomínio inexistente sem atualizar", async () => {
    mocks.condominio.mockResolvedValue(null);
    await expect(appRouter.createCaller(ctx()).condominios.removerDocumento(remover)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.trocar).not.toHaveBeenCalled();
  });
  it("não registra sucesso quando persistência falha", async () => {
    mocks.trocar.mockRejectedValue(new Error("Falha de banco"));
    await expect(appRouter.createCaller(ctx()).condominios.removerDocumento(remover)).rejects.toThrow("Falha de banco");
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("substitui após storage e preserva histórico de URLs", async () => {
    await appRouter.createCaller(ctx()).condominios.uploadDocumento(upload);
    expect(mocks.trocar).toHaveBeenCalledWith(10, "convencao", antiga, nova);
    expect(mocks.storage.mock.invocationCallOrder[0]).toBeLessThan(mocks.trocar.mock.invocationCallOrder[0]);
    expect(mocks.audit.mock.calls[0][1]).toMatchObject({ beforeData: { juridicoConvencaoUrl: antiga }, afterData: { juridicoConvencaoUrl: nova }, metadata: { operacaoDocumento: "substituir" } });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(upload.fileBase64);
  });
  it("mantém URL antiga se novo storage falhar", async () => {
    mocks.storage.mockRejectedValue(new Error("Storage indisponível"));
    await expect(appRouter.createCaller(ctx()).condominios.uploadDocumento(upload)).rejects.toThrow("Storage indisponível");
    expect(mocks.trocar).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("recusa documento desatualizado antes de iniciar novo upload", async () => {
    mocks.condominio.mockResolvedValue({ id: 10, juridicoConvencaoUrl: nova });
    await expect(appRouter.createCaller(ctx()).condominios.uploadDocumento(upload)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.storage).not.toHaveBeenCalled(); expect(mocks.trocar).not.toHaveBeenCalled();
  });
});
