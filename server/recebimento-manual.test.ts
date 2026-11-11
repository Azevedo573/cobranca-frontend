import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { criarDbDiagnosticosTeste } from "./btg-captura-router-test-db";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  bloquear: vi.fn(),
  aplicar: vi.fn(),
  preflight: vi.fn(),
  carteira: vi.fn(),
  permission: vi.fn(),
  identidade: vi.fn(),
  legacy: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/auth-helper", () => ({
  getCurrentAuthorizationUser: mocks.identidade,
}));
vi.mock("./escopo-financeiro", () => ({
  preflightParcelaFinanceiro: mocks.preflight,
}));
vi.mock("./tenant-guard", async original => ({
  ...(await original<typeof import("./tenant-guard")>()),
  assertCondominioAccess: mocks.carteira,
}));
vi.mock("./rbac", async original => {
  const { protectedProcedure } = await import("./_core/trpc");
  const { TRPCError } = await import("@trpc/server");
  return {
    ...(await original<typeof import("./rbac")>()),
    hasPermission: mocks.permission,
    requirePermission: (modulo: string, acao: string) =>
      protectedProcedure.use(async ({ ctx, next }) => {
        const user = await mocks.identidade(ctx.user);
        if (
          !user ||
          !(await mocks.permission(user.id, user.role, modulo, acao))
        )
          throw new TRPCError({ code: "FORBIDDEN" });
        return next({ ctx: { ...ctx, user } });
      }),
  };
});
vi.mock("./recebimento-acordo", () => ({
  bloquearContextoRecebimentoAcordo: mocks.bloquear,
  aplicarRecebimentoAcordo: mocks.aplicar,
}));
vi.mock("./db-acordos", () => ({ updateParcela: mocks.legacy }));
import { appRouter } from "./routers";

const NOW = new Date("2026-11-11T20:00:00Z");
const user = {
  id: 11,
  role: "colaborador",
  condominioId: 2,
  isActive: 1,
  isDeleted: 0,
};
const ctx = () =>
  ({
    user,
    req: { headers: {}, socket: {} },
    res: {},
  }) as unknown as TrpcContext;
let f: ReturnType<typeof criarDbDiagnosticosTeste>;
let locked: any;
const caller = () => appRouter.createCaller(ctx()).acordos;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rede proibida");
    })
  );
  f = criarDbDiagnosticosTeste({
    parcelasAcordo: [
      {
        id: 5,
        acordoId: 4,
        amount: 584,
        status: "pendente",
        paymentDate: null,
      },
    ],
    acordos: [{ id: 4, condominioId: 2, devedorId: 3, status: "ativo" }],
    cobrancas: [
      {
        id: 1,
        condominioId: 2,
        devedorId: 3,
        status: "em_acordo",
        description: "Obrigação fictícia preservada",
      },
    ],
    auditLogs: [],
  });
  locked = {
    parcela: f.state.tables.parcelasAcordo[0],
    acordo: f.state.tables.acordos[0],
    parcelas: f.state.tables.parcelasAcordo,
    origens: [
      {
        vinculo: { acordoId: 4, cobrancaId: 1 },
        cobranca: f.state.tables.cobrancas[0],
      },
    ],
    devedor: { id: 3, condominioId: 2 },
  };
  mocks.getDb.mockResolvedValue(f.db);
  mocks.identidade.mockResolvedValue(user);
  mocks.permission.mockResolvedValue(true);
  mocks.preflight.mockResolvedValue(undefined);
  mocks.carteira.mockResolvedValue(undefined);
  mocks.bloquear.mockResolvedValue(locked);
  mocks.aplicar.mockResolvedValue({
    codigo: null,
    aplicado: true,
    valorPagoTotal: 584,
    statusAcordo: "pago",
    cobrancasQuitadas: true,
    cobrancasIds: [1],
  });
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.legacy).not.toHaveBeenCalled();
  expect(f.db.execute).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("baixa manual usa contexto e recebimento transacionais", () => {
  it("preserva retorno e registra ator/canal manual sem tocar banco remoto", async () => {
    expect(
      await caller().darBaixaParcela({ parcelaId: 5, dataPagamento: NOW })
    ).toEqual({
      success: true,
      valorPagoTotal: 584,
      statusAcordo: "pago",
      cobrancasQuitadas: true,
    });
    expect(f.state.transactions).toBe(1);
    expect(f.state.committed).toBe(1);
    expect(mocks.preflight).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, role: "colaborador" }),
      5,
      true
    );
    expect(mocks.bloquear).toHaveBeenCalledWith(f.db, 5);
    expect(mocks.aplicar).toHaveBeenCalledWith(f.db, locked, {
      valorPagoCentavos: 584,
      dataPagamento: NOW,
      condominioId: 2,
      canal: "manual",
      ator: { userId: 11, userRole: "colaborador" },
    });
    expect(f.state.writes).toEqual([]); // Toda escrita/audit pertence ao serviço, não ao adaptador.
  });
  it("paga anteriormente mantém erro antigo sem reescrever data", async () => {
    locked.parcela.status = "pago";
    locked.parcela.paymentDate = new Date("2026-01-01");
    await expect(caller().darBaixaParcela({ parcelaId: 5 })).rejects.toThrow(
      "Parcela já foi paga anteriormente"
    );
    expect(mocks.aplicar).not.toHaveBeenCalled();
    expect(f.state.writes).toEqual([]);
  });
  it("parcela inexistente conserva erro antigo", async () => {
    locked.parcela = undefined;
    await expect(caller().darBaixaParcela({ parcelaId: 5 })).rejects.toThrow(
      "Parcela não encontrada"
    );
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });
  it("preflight negado acontece antes de transação e serviço", async () => {
    mocks.preflight.mockRejectedValue(new Error("Negado"));
    await expect(caller().darBaixaParcela({ parcelaId: 5 })).rejects.toThrow(
      "Negado"
    );
    expect(f.state.transactions).toBe(0);
    expect(mocks.bloquear).not.toHaveBeenCalled();
  });
  it("carteira revogada durante lock impede aplicação dentro da transação", async () => {
    mocks.bloquear.mockImplementation(async () => {
      mocks.carteira.mockRejectedValue(new Error("Carteira revogada"));
      return locked;
    });
    await expect(caller().darBaixaParcela({ parcelaId: 5 })).rejects.toThrow(
      "Carteira revogada"
    );
    expect(mocks.aplicar).not.toHaveBeenCalled();
    expect(f.state.committed).toBe(0);
  });
  it("identidade/permissão revogada após lock impede baixa", async () => {
    mocks.bloquear.mockImplementation(async () => {
      mocks.permission.mockResolvedValue(false);
      return locked;
    });
    await expect(
      caller().darBaixaParcela({ parcelaId: 5 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });
  it("condomínio/devedor cruzado no contexto bloqueado não aplica", async () => {
    locked.devedor.condominioId = 99;
    await expect(
      caller().darBaixaParcela({ parcelaId: 5 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });
  it("divergência estática do serviço nunca retorna success", async () => {
    mocks.aplicar.mockResolvedValue({
      codigo: "PAYMENT_CONTEXT_MISMATCH",
      aplicado: false,
    });
    await expect(
      caller().darBaixaParcela({ parcelaId: 5 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.state.committed).toBe(0);
  });
  it("falha de serviço desfaz todas as escritas do adaptador/serviço", async () => {
    mocks.aplicar.mockImplementation(async tx => {
      const { parcelasAcordo } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await tx
        .update(parcelasAcordo)
        .set({ status: "pago" })
        .where(eq(parcelasAcordo.id, 5));
      throw new Error("RECEBIMENTO_AUDIT_FAILED");
    });
    await expect(caller().darBaixaParcela({ parcelaId: 5 })).rejects.toThrow(
      "RECEBIMENTO_AUDIT_FAILED"
    );
    expect(f.state.tables.parcelasAcordo[0].status).toBe("pendente");
    expect(f.state.writes).toEqual([]);
  });
});

describe("updateParcela não fornece bypass de recebimento", () => {
  it("pago passa pelo mesmo serviço mas conserva contrato void de update", async () => {
    expect(
      await caller().updateParcela({ id: 5, status: "pago", paymentDate: NOW })
    ).toBeUndefined();
    expect(mocks.aplicar).toHaveBeenCalledWith(
      f.db,
      locked,
      expect.objectContaining({
        valorPagoCentavos: 584,
        dataPagamento: NOW,
        canal: "manual",
        ator: { userId: 11, userRole: "colaborador" },
      })
    );
  });
  it("pago exige aprovar mesmo quando pode editar", async () => {
    mocks.permission.mockImplementation(
      async (_id, _role, _modulo, acao) => acao === "editar"
    );
    await expect(
      caller().updateParcela({ id: 5, status: "pago" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.aplicar).not.toHaveBeenCalled();
    expect(f.state.writes).toEqual([]);
  });
  it("regressão de paga para pendente é bloqueada", async () => {
    locked.parcela.status = "pago";
    await expect(
      caller().updateParcela({ id: 5, status: "pendente" })
    ).rejects.toThrow("Parcela já foi paga anteriormente");
    expect(f.state.writes).toEqual([]);
  });
  it("data histórica paga não pode ser substituída por update", async () => {
    locked.parcela.status = "pago";
    locked.parcela.paymentDate = new Date("2026-01-01");
    await expect(
      caller().updateParcela({ id: 5, paymentDate: NOW })
    ).rejects.toThrow("Parcela já foi paga anteriormente");
    expect(f.state.writes).toEqual([]);
  });
  it("data de pagamento isolada não afirma recebimento sem auditoria", async () => {
    await expect(
      caller().updateParcela({ id: 5, paymentDate: NOW })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.state.writes).toEqual([]);
  });
  it("edição não financeira pendente→atrasado usa transação e affectedRows", async () => {
    expect(
      await caller().updateParcela({ id: 5, status: "atrasado" })
    ).toBeUndefined();
    expect(f.state.tables.parcelasAcordo[0].status).toBe("atrasado");
    expect(f.state.transactions).toBe(1);
    expect(mocks.aplicar).not.toHaveBeenCalled();
  });
  it("não ressuscita parcela cancelada", async () => {
    locked.parcela.status = "cancelado";
    await expect(
      caller().updateParcela({ id: 5, status: "pendente" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.state.writes).toEqual([]);
  });
  it("update financeiro zero affectedRows falha sem commit", async () => {
    f.db.update.mockImplementation(() => ({
      set: () => ({ where: async () => [{ affectedRows: 0 }] }),
    }));
    await expect(
      caller().updateParcela({ id: 5, status: "atrasado" })
    ).rejects.toThrow("PARCELA_UPDATE_FAILED");
    expect(f.state.committed).toBe(0);
  });
});
