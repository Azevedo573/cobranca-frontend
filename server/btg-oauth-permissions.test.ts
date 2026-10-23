import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function criarContextoNaoAdmin(): TrpcContext {
  return {
    user: {
      id: 17,
      openId: "cobrador-teste",
      email: "cobrador@example.com",
      name: "Cobrador Teste",
      loginMethod: "custom",
      role: "cobrador",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("OAuth BTG — permissões", () => {
  it("impede que usuário não administrador consulte ou inicie consentimento", async () => {
    const caller = appRouter.createCaller(criarContextoNaoAdmin());

    await expect(caller.btg.getConfig()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.btg.iniciarAutorizacao()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
