import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), lock: vi.fn(), set: vi.fn(), updateWhere: vi.fn(), transaction: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.db }));
import { trocarUrlDocumentoCondominio } from "./condominio-documentos-persistencia";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lock.mockResolvedValue([{ url: "https://example.com/anterior.pdf" }]);
  const tx = {
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => ({ for: mocks.lock })) })) })) })),
    update: vi.fn(() => ({ set: mocks.set })),
  };
  mocks.set.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockResolvedValue(undefined);
  mocks.transaction.mockImplementation(fn => fn(tx));
  mocks.db.mockResolvedValue({ transaction: mocks.transaction });
});

describe("vínculo documental transacional", () => {
  it.each(["convencao", "regimento"] as const)("retira somente a coluna selecionada com lock: %s", async tipo => {
    await expect(trocarUrlDocumentoCondominio(10, tipo, "https://example.com/anterior.pdf", null)).resolves.toEqual({ urlAnterior: "https://example.com/anterior.pdf", url: null });
    expect(mocks.lock).toHaveBeenCalledWith("update");
    expect(mocks.set).toHaveBeenCalledWith({ [tipo === "convencao" ? "juridicoConvencaoUrl" : "juridicoRegimentoUrl"]: null });
  });
  it("substitui somente se a URL anterior ainda for atual", async () => {
    await trocarUrlDocumentoCondominio(10, "convencao", "https://example.com/anterior.pdf", "https://example.com/nova.pdf");
    expect(mocks.set).toHaveBeenCalledWith({ juridicoConvencaoUrl: "https://example.com/nova.pdf" });
  });
  it("recusa conflito sem alterar documento novo", async () => {
    await expect(trocarUrlDocumentoCondominio(10, "regimento", "https://example.com/desatualizada.pdf", null)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("aceita inclusão quando campo vazio corresponde a null", async () => {
    mocks.lock.mockResolvedValue([{ url: "" }]);
    await trocarUrlDocumentoCondominio(10, "convencao", null, "https://example.com/nova.pdf");
    expect(mocks.set).toHaveBeenCalledOnce();
  });
  it("recusa condomínio inexistente", async () => {
    mocks.lock.mockResolvedValue([]);
    await expect(trocarUrlDocumentoCondominio(10, "convencao", null, null)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("não declara sucesso quando a atualização falha", async () => {
    mocks.updateWhere.mockRejectedValue(new Error("Falha de gravação"));
    await expect(trocarUrlDocumentoCondominio(10, "convencao", "https://example.com/anterior.pdf", null)).rejects.toThrow("Falha de gravação");
  });
});
