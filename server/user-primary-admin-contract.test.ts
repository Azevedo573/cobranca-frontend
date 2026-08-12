import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("contrato de administrador principal", () => {
  it("aceita promoção somente pela procedure dedicada", () => {
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const usersBlock = source.slice(source.indexOf("// Usuários (apenas admin)"), source.indexOf("// Condomínios"));
    const createBlock = usersBlock.slice(usersBlock.indexOf("create: adminProcedure"), usersBlock.indexOf("update: adminProcedure"));
    const updateBlock = usersBlock.slice(usersBlock.indexOf("update: adminProcedure"), usersBlock.indexOf("delete: adminProcedure"));

    expect(usersBlock).toContain("definirAdminPrincipal: adminProcedure");
    expect(createBlock).not.toContain("isPrimaryAdmin: z.number");
    expect(updateBlock).not.toContain("isPrimaryAdmin: z.number");
  });
});
