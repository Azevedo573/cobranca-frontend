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

describe("Exportação Excel", () => {
  it("deve exportar devedores para Excel (admin)", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.devedores({
      condominioId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("devedores_");
    expect(result.filename.endsWith(".xlsx")).toBe(true);
  });

  it("deve exportar cobranças para Excel (admin)", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({
      condominioId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("cobrancas_");
    expect(result.filename.endsWith(".xlsx")).toBe(true);
  });

  it("deve exportar acordos para Excel (admin)", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.acordos({
      condominioId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("acordos_");
    expect(result.filename.endsWith(".xlsx")).toBe(true);
  });

  it("deve exportar tentativas para Excel (admin)", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({
      condominioId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("tentativas_");
    expect(result.filename.endsWith(".xlsx")).toBe(true);
  });

  it("deve exportar vencimentos para Excel (admin)", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.vencimentos({
      dias: 7,
      condominioId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("vencimentos_");
    expect(result.filename).toContain("7dias");
    expect(result.filename.endsWith(".xlsx")).toBe(true);
  });

  it("deve exportar devedores para síndico (filtrado automaticamente)", async () => {
    const ctx = createAuthContext("sindico", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.devedores({});

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("devedores_");
  });

  it("deve aceitar diferentes períodos para vencimentos", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result7 = await caller.exportacao.vencimentos({ dias: 7, condominioId: 1 });
    const result15 = await caller.exportacao.vencimentos({ dias: 15, condominioId: 1 });
    const result30 = await caller.exportacao.vencimentos({ dias: 30, condominioId: 1 });

    expect(result7.filename).toContain("7dias");
    expect(result15.filename).toContain("15dias");
    expect(result30.filename).toContain("30dias");
  });

  it("deve gerar nome de arquivo com data atual", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.devedores({ condominioId: 1 });
    
    const hoje = new Date().toISOString().split('T')[0];
    expect(result.filename).toContain(hoje);
  });
});
