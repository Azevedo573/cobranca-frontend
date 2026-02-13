import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "admin" | "sindico" | "cobrador" = "admin", condominioId?: number): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "custom",
    role,
    condominioId: condominioId || null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return ctx;
}

describe("Vencimentos Próximos", () => {
  it("deve retornar vencimentos próximos para admin sem filtro de condomínio", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.acordos.getVencimentosProximos({
      dias: 7,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("deve retornar vencimentos próximos para admin com filtro de condomínio", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.acordos.getVencimentosProximos({
      dias: 7,
      condominioId: 1,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("deve retornar vencimentos próximos para síndico (filtrado automaticamente)", async () => {
    const ctx = createAuthContext("sindico", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.acordos.getVencimentosProximos({
      dias: 7,
    });

    expect(Array.isArray(result)).toBe(true);
  });

  it("deve aceitar diferentes períodos (7, 15, 30 dias)", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result7 = await caller.acordos.getVencimentosProximos({ dias: 7 });
    const result15 = await caller.acordos.getVencimentosProximos({ dias: 15 });
    const result30 = await caller.acordos.getVencimentosProximos({ dias: 30 });

    expect(Array.isArray(result7)).toBe(true);
    expect(Array.isArray(result15)).toBe(true);
    expect(Array.isArray(result30)).toBe(true);
  });

  it("deve retornar estrutura correta dos dados", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.acordos.getVencimentosProximos({
      dias: 30,
    });

    expect(Array.isArray(result)).toBe(true);
    
    // Se houver resultados, validar estrutura
    if (result.length > 0) {
      const parcela = result[0];
      expect(parcela).toHaveProperty("id");
      expect(parcela).toHaveProperty("numeroParcela");
      expect(parcela).toHaveProperty("valorParcela");
      expect(parcela).toHaveProperty("dataVencimento");
      expect(parcela).toHaveProperty("status");
      expect(parcela).toHaveProperty("acordo");
      expect(parcela.acordo).toHaveProperty("devedor");
      expect(parcela.acordo.devedor).toHaveProperty("condominio");
    }
  });
});
