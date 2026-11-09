import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";
const mock = vi.hoisted(() => ({
  db: vi.fn(),
  preparar: vi.fn(),
  confirmar: vi.fn(),
  consultar: vi.fn(),
  legacy: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mock.db }));
vi.mock("./btg-v2/cancelamento", () => ({
  CONFIRMACAO_CANCELAMENTO_BTG: "CANCELAR COBRANÇA BTG",
  prepararCancelamentoBtg: mock.preparar,
  confirmarCancelamentoBtg: mock.confirmar,
  consultarResultadoCancelamentoBtg: mock.consultar,
}));
vi.mock("./btg-v2/settlement", () => ({
  cancelarEmissaoBolePixV2: mock.legacy,
  conciliarEmissaoBolePixV2: vi.fn(),
}));
import { btgCancelamentoRouter } from "./routers/btg-cancelamento";
import { btgV2Router } from "./routers/btg-v2";
const operacaoId = "cd35ec80-c530-4cae-85cf-a144148f9371";
const valid = {
  operacaoId,
  motivo: "Motivo administrativo válido",
  confirmacao: "CANCELAR COBRANÇA BTG" as const,
  ciente: true as const,
};
const db = { fixture: true };
function context(role = "admin", id = 10) {
  return {
    user: { id, role },
    req: { headers: {}, socket: {} },
    res: {},
  } as unknown as TrpcContext;
}
function caller(role = "admin") {
  return btgCancelamentoRouter.createCaller(context(role));
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.db.mockResolvedValue(db);
  mock.preparar.mockResolvedValue({ operacaoId, estado: "preparada" });
  mock.confirmar.mockResolvedValue({ operacaoId, estado: "em_confirmacao" });
  mock.consultar.mockResolvedValue({ operacaoId, estado: "cancelada" });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rede real proibida");
    })
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(mock.legacy).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe("fronteira administrativa de cancelamento", () => {
  it("encaminha usuário da sessão e DB ao serviço sem IDs controlados pelo cliente", async () => {
    expect(await caller().preparar({ emissaoId: 20 })).toEqual({
      operacaoId,
      estado: "preparada",
    });
    expect(mock.preparar).toHaveBeenCalledWith({
      db,
      usuarioId: 10,
      emissaoId: 20,
    });
    await caller().confirmar(valid);
    expect(mock.confirmar).toHaveBeenCalledWith({
      db,
      usuarioId: 10,
      ...valid,
    });
    await caller().consultarResultado({ operacaoId });
    expect(mock.consultar).toHaveBeenCalledWith({
      db,
      usuarioId: 10,
      operacaoId,
    });
  });
  it.each(["cobrador", "colaborador", "sindico", "administradora"])(
    "nega perfil %s antes de DB/serviço",
    async role => {
      await expect(
        caller(role).preparar({ emissaoId: 20 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller(role).confirmar(valid)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller(role).consultarResultado({ operacaoId })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mock.db).not.toHaveBeenCalled();
      expect(mock.preparar).not.toHaveBeenCalled();
      expect(mock.confirmar).not.toHaveBeenCalled();
      expect(mock.consultar).not.toHaveBeenCalled();
    }
  );
  it("nega sessão inexistente", async () => {
    const anon = btgCancelamentoRouter.createCaller({
      ...context(),
      user: null,
    });
    await expect(anon.preparar({ emissaoId: 20 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mock.db).not.toHaveBeenCalled();
  });
  it.each([
    { ...valid, motivo: "abc" },
    { ...valid, motivo: "x".repeat(501) },
    { ...valid, motivo: "abc\u0000def" },
    { ...valid, confirmacao: "CANCELAR" },
    { ...valid, ciente: false },
    { ...valid, operacaoId: "20" },
  ])("nega confirmação inválida antes do serviço", async input => {
    await expect(caller().confirmar(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mock.confirmar).not.toHaveBeenCalled();
    expect(mock.db).not.toHaveBeenCalled();
  });
  it("motivo é aparado antes da chamada", async () => {
    await caller().confirmar({
      ...valid,
      motivo: "  Motivo administrativo válido  ",
    });
    expect(mock.confirmar.mock.calls[0][0].motivo).toBe(
      "Motivo administrativo válido"
    );
  });
  it("nega DB indisponível", async () => {
    mock.db.mockResolvedValue(null);
    await expect(caller().preparar({ emissaoId: 20 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco não disponível.",
    });
    expect(mock.preparar).not.toHaveBeenCalled();
  });
  it("não propaga raw/cause de erro inesperado", async () => {
    mock.confirmar.mockRejectedValue(new Error("Bearer segredo 52998224725"));
    const err = await caller()
      .confirmar(valid)
      .catch(e => e);
    expect(err.code).toBe("INTERNAL_SERVER_ERROR");
    expect(err.message).not.toMatch(/segredo|52998224725/);
  });
  it("preserva erro seguro de autorização fresca", async () => {
    mock.consultar.mockRejectedValue(
      new TRPCError({
        code: "FORBIDDEN",
        message: "Acesso administrativo indisponível.",
      })
    );
    await expect(
      caller().consultarResultado({ operacaoId })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rotas mutáveis são mutations, incluindo consulta auditada", () => {
    for (const route of Object.values(btgCancelamentoRouter._def.procedures))
      expect(route._def.type).toBe("mutation");
  });
});
describe("bloqueio de bypass legado", () => {
  it("admin com CANCELAR recebe orientação, sem DB nem serviço de cancelamento", async () => {
    await expect(
      btgV2Router
        .createCaller(context())
        .cancelarEmissao({ emissaoId: 20, confirmacao: "CANCELAR" })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("btgCancelamento.preparar"),
    });
    expect(mock.db).not.toHaveBeenCalled();
    expect(mock.confirmar).not.toHaveBeenCalled();
  });
  it("perfil não admin segue bloqueado pela permissão existente", async () => {
    await expect(
      btgV2Router
        .createCaller(context("cobrador"))
        .cancelarEmissao({ emissaoId: 20, confirmacao: "CANCELAR" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.db).not.toHaveBeenCalled();
  });
});
