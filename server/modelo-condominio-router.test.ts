import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({
  validar: vi.fn(),
  lista: vi.fn(),
  dados: vi.fn(),
  antigo: vi.fn(),
  pdf: vi.fn(),
  storage: vi.fn(),
  anexos: vi.fn(),
  tabela: vi.fn(),
}));
vi.mock("./modelo-condominio-dados", () => ({
  validarContextoPreenchimento: mocks.validar,
  listarCondominiosPreenchimento: mocks.lista,
  obterDadosPreenchimento: mocks.dados,
}));
vi.mock("./escopo-documentos-consumidores", () => ({
  obterModeloDocumentoAutorizado: mocks.antigo,
}));
vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./db-modelos", () => ({ listAnexosByModelo: mocks.anexos }));
vi.mock("./modelo-pdf", () => ({
  gerarPDFModelo: mocks.pdf,
  gerarHtmlTabelaParcelas: mocks.tabela,
}));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
import { appRouter } from "./routers";
const user = { id: 90, role: "advogado", isActive: 1, condominioId: null };
const caller = (authenticated = true) =>
  appRouter.createCaller({
    user: authenticated ? user : null,
    req: { headers: {} },
    res: {},
  } as unknown as TrpcContext);
const model = {
  id: 10,
  conteudoHtml: "<p>{{nomeCondominio}}</p>",
  nome: "Modelo fictício",
  condominioId: null,
  ativo: 1,
};
const request = {
  modeloId: 10,
  variaveis: { nomeCondominio: "Nome revisado <manual> **_ $& {{outro}}" },
  contextoPreenchimento: { condominioId: 2 },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.validar.mockResolvedValue(model);
  mocks.antigo.mockResolvedValue(model);
  mocks.anexos.mockResolvedValue([]);
  mocks.pdf.mockResolvedValue(Buffer.from("PDF fictício"));
  mocks.storage.mockResolvedValue({
    url: "https://example.invalid/fixture.pdf",
  });
  mocks.lista.mockResolvedValue({
    modeloId: 10,
    condominioVinculadoId: null,
    condominios: [{ id: 2, name: "Nome fictício" }],
  });
  mocks.dados.mockResolvedValue({
    modeloId: 10,
    condominioId: 2,
    nomeCondominio: "Nome fictício",
    valores: { nomeCondominio: "Nome fictício" },
    camposAusentes: [],
  });
  mocks.tabela.mockReturnValue(
    "<table><tr><td>Parcela fictícia</td></tr></table>"
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rede não autorizada");
    })
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("contrato documental contextual no router real", () => {
  it("queries novas delegam identidade e IDs, sem geração ou gravação", async () => {
    await caller().modelosDocumento.listarCondominiosPreenchimento({
      modeloId: 10,
    });
    await caller().modelosDocumento.obterDadosPreenchimento({
      modeloId: 10,
      condominioId: 2,
    });
    expect(mocks.lista).toHaveBeenCalledWith(user, 10);
    expect(mocks.dados).toHaveBeenCalledWith(user, 10, 2);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "BAD_REQUEST", "INTERNAL_SERVER_ERROR"] as const)(
    "nega %s antes de PDF/anexos/storage",
    async code => {
      mocks.validar.mockRejectedValue(
        new TRPCError({ code, message: "Mensagem protegida" })
      );
      await expect(
        caller().modelosDocumento.gerarPDF(request)
      ).rejects.toMatchObject({ code });
      expect(mocks.pdf).not.toHaveBeenCalled();
      expect(mocks.storage).not.toHaveBeenCalled();
      expect(mocks.anexos).not.toHaveBeenCalled();
      expect(mocks.antigo).not.toHaveBeenCalled();
    }
  );
  it("valores revisados chegam intactos ao modo textual; não são repopulados por consulta", async () => {
    const snapshot = structuredClone(request);
    await caller().modelosDocumento.gerarPDF(request);
    expect(mocks.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        modoVariaveis: "texto",
        variaveis: expect.objectContaining(request.variaveis),
      })
    );
    expect(mocks.validar).toHaveBeenCalledTimes(2);
    expect(mocks.validar).toHaveBeenNthCalledWith(1, user, 10, 2);
    expect(mocks.dados).not.toHaveBeenCalled();
    expect(request).toEqual(snapshot);
    expect(mocks.storage).toHaveBeenCalledTimes(1);
  });
  it("revogação durante a renderização impede armazenamento do resultado", async () => {
    mocks.validar
      .mockResolvedValueOnce(model)
      .mockRejectedValueOnce(
        new TRPCError({ code: "FORBIDDEN", message: "Acesso revogado" })
      );
    await expect(
      caller().modelosDocumento.gerarPDF(request)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.pdf).toHaveBeenCalledTimes(1);
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("falha do renderizador não persiste documento nem usa contrato antigo", async () => {
    mocks.pdf.mockRejectedValue(new Error("Falha sintética"));
    await expect(caller().modelosDocumento.gerarPDF(request)).rejects.toThrow();
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.antigo).not.toHaveBeenCalled();
  });
  it("sem contexto mantém contrato antigo, tabela HTML e ausência do modo texto", async () => {
    await caller().modelosDocumento.gerarPDF({
      modeloId: 10,
      variaveis: { representanteLegal: "<strong>Legado</strong>" },
      parcelas: [{ vencimento: "01/12/2026", valor: "100,00" }],
    });
    expect(mocks.antigo).toHaveBeenCalledWith(user, 10);
    expect(mocks.validar).not.toHaveBeenCalled();
    const opts = mocks.pdf.mock.calls[0][0];
    expect(opts.modoVariaveis).toBeUndefined();
    expect(opts.variaveis.tabelaParcelas).toContain("<table>");
    expect(opts.variaveis.representanteLegal).toBe("<strong>Legado</strong>");
  });
  it("validação para impressão é fresca, não devolve modelo/cadastro e não produz PDF", async () => {
    expect(
      await caller().modelosDocumento.validarPreenchimento({
        modeloId: 10,
        condominioId: 2,
      })
    ).toEqual({ autorizado: true });
    expect(mocks.validar).toHaveBeenCalledWith(user, 10, 2);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
    expect(mocks.dados).not.toHaveBeenCalled();
  });
  it("modelo compartilhado sem fonte envia NULL explícito para validação de impressão e PDF", async () => {
    await caller().modelosDocumento.validarPreenchimento({
      modeloId: 10,
      condominioId: null,
    });
    await caller().modelosDocumento.gerarPDF({
      ...request,
      contextoPreenchimento: { condominioId: null },
    });
    expect(mocks.validar).toHaveBeenCalledWith(user, 10, null);
  });
  it("query de impressão negada não fornece dados ou efeito documental", async () => {
    mocks.validar.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(
      caller().modelosDocumento.validarPreenchimento({
        modeloId: 10,
        condominioId: 2,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("sessão ausente rejeita antes dos helpers de contexto", async () => {
    await expect(
      caller(false).modelosDocumento.gerarPDF(request)
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller(false).modelosDocumento.listarCondominiosPreenchimento({
        modeloId: 10,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.validar).not.toHaveBeenCalled();
    expect(mocks.lista).not.toHaveBeenCalled();
  });
  it("contexto estrito rejeita IDs inválidos ou propriedades não reconhecidas", async () => {
    await expect(
      caller().modelosDocumento.gerarPDF({
        ...request,
        contextoPreenchimento: { condominioId: 0 },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().modelosDocumento.gerarPDF({
        ...request,
        contextoPreenchimento: { condominioId: 2, cadastro: "proibido" },
      } as unknown as typeof request)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.validar).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
});
