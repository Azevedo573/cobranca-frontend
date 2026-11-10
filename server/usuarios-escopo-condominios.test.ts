import { describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import {
  criarUsuarioComEscopo, atualizarUsuarioComEscopo, usuarioVisivelNoCondominio,
  listarUsuariosPorCondominio, excluirUsuarioComEscopo, restaurarUsuarioComEscopo, definirAdminPrincipalComEscopo,
} from "./user-escopo-management";

const dialect = new MySqlDialect();
const actor = { id: 1, role: "admin", isActive: 1, isDeleted: 0 };
const target = { id: 2, name: "Fixture", email: "fixture@example.invalid", role: "advogado", escopoCondominios: null, condominioId: 10, isActive: 1, isDeleted: 0, isPrimaryAdmin: 0 };
const novo = { name: "Fixture", email: "novo@example.invalid", password: "SenhaFixture2026", role: "advogado" as const };

// Somente uma fixture local; não importa banco/BTG nem faz acesso externo.
function fixture(user = target) {
  const state = { tables: {
    users: [structuredClone(actor), structuredClone(user)] as any[],
    condominios: [{ id: 10, statusCadastro: "ativo" }, { id: 20, statusCadastro: "ativo" }, { id: 30, statusCadastro: "inativo" }],
    userCondominios: [{ userId: 2, condominioId: 10, isActive: 1 }] as any[],
    auditLogs: [] as any[],
  } as Record<string, any[]>, failAudit: false, failLinks: false, locks: [] as string[] };
  const matches = (table: string, row: any, condition: any) => {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let index = 0;
    return [...sql.matchAll(/`([^`]+)`\.`([^`]+)`\s*(=\s*\?|in\s*\((?:\?\s*,?\s*)+\))/gi)].every(match => {
      const count = (match[3].match(/\?/g) ?? []).length;
      const allowed = params.slice(index, index + count); index += count;
      return allowed.includes(row[match[2]]);
    });
  };
  const db: any = {
    select: vi.fn((projection?: any) => {
      let table = "", condition: any, n = Infinity;
      const run = () => state.tables[table].filter(row => matches(table, row, condition)).slice(0, n).map(row => {
        if (!projection) return structuredClone(row);
        return Object.fromEntries(Object.entries(projection).map(([key, col]: [string, any]) => [key, row[col.name]]));
      });
      const chain: any = {
        from: (t: any) => { table = getTableName(t); return chain; },
        where: (c: any) => { condition = c; return chain; },
        limit: (limit: number) => { n = limit; return chain; },
        orderBy: () => chain,
        for: (mode: string) => { state.locks.push(`${table}:${mode}`); return chain; },
        then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
      }; return chain;
    }),
    update: (t: any) => ({ set: (values: any) => ({ where: async (condition: any) => {
      const table = getTableName(t);
      if (table === "userCondominios" && state.failLinks) throw new Error("links unavailable");
      state.tables[table].filter(row => matches(table, row, condition)).forEach(row => Object.assign(row, values));
    } }) }),
    insert: (t: any) => ({ values: (values: any) => {
      const table = getTableName(t);
      const run = async () => {
        if (table === "auditLogs" && state.failAudit) throw new Error("audit unavailable");
        if (table === "userCondominios" && state.failLinks) throw new Error("links unavailable");
        for (const row of Array.isArray(values) ? values : [values]) {
          const existing = table === "userCondominios" && state.tables[table].find(v => v.userId === row.userId && v.condominioId === row.condominioId);
          if (existing) existing.isActive = 1;
          else state.tables[table].push({ id: state.tables[table].length + 100, isActive: 1, isDeleted: 0, ...row });
        }
        return [{ insertId: state.tables[table].at(-1)?.id }];
      };
      const chain: any = { onDuplicateKeyUpdate: () => chain, then: (resolve: any, reject: any) => run().then(resolve, reject) }; return chain;
    } }),
    transaction: async (run: any) => {
      const before = structuredClone(state.tables);
      try { return await run(db); } catch (e) { state.tables = before; throw e; }
    },
  };
  return { db, state };
}

describe("CRUD transacional de escopo condominial", () => {
  it("API aceita enum e principal nullable sem liberar administrador principal", () => {
    const source = readFileSync("server/routers.ts", "utf8");
    const block = source.slice(source.indexOf("// Usuários (apenas admin)"), source.indexOf("// Relatórios (apenas admin)"));
    expect(block.match(/escopoCondominios: z.enum\(\["selecionados", "todos"\]\).optional\(\)/g)).toHaveLength(2);
    expect(block.match(/condominioId: z.number\(\).int\(\).positive\(\).nullable\(\).optional\(\)/g)).toHaveLength(2);
  });
  it.each(["advogado", "colaborador"] as const)("cria %s global sem principal e sem vínculos artificiais", async role => {
    const { db, state } = fixture();
    const result = await criarUsuarioComEscopo(db, 1, { ...novo, role, escopoCondominios: "todos", condominioIds: [], condominioId: null });
    expect(result[0].insertId).toBeGreaterThan(0);
    expect(state.tables.users.at(-1)).toMatchObject({ escopoCondominios: "todos", condominioId: null, role });
    expect(state.tables.userCondominios).toHaveLength(1);
    expect(state.tables.auditLogs).toHaveLength(1);
    expect(JSON.stringify(state.tables.auditLogs)).not.toMatch(/SenhaFixture|password|Fixture|example.invalid|\$2[aby]\$/);
  });
  it("global aceita principal ativo fora de vínculos", async () => {
    const { db, state } = fixture();
    await criarUsuarioComEscopo(db, 1, { ...novo, escopoCondominios: "todos", condominioId: 20 });
    expect(state.tables.users.at(-1)?.condominioId).toBe(20);
  });
  it("novo elegível omitido é selecionado, nunca todos", async () => {
    const { db, state } = fixture();
    await criarUsuarioComEscopo(db, 1, { ...novo, condominioIds: [10, 20] });
    expect(state.tables.users.at(-1)).toMatchObject({ escopoCondominios: "selecionados", condominioId: 10 });
  });
  it.each([
    { condominioIds: [] }, { escopoCondominios: "selecionados", condominioIds: [] },
    { escopoCondominios: "todos", condominioIds: [10] },
    { condominioIds: [10, 10] }, { condominioIds: [30] },
    { condominioIds: [10], condominioId: 20 }, { escopoCondominios: "todos", condominioId: 30 },
    { condominioIds: [999] }, { condominioIds: [10], condominioId: null },
  ])("rejeita combinação inválida %j atomicamente", async input => {
    const { db, state } = fixture(); const before = structuredClone(state.tables);
    await expect(criarUsuarioComEscopo(db, 1, { ...novo, ...input } as any)).rejects.toThrow();
    expect(state.tables).toEqual(before);
  });
  it.each(["admin", "sindico", "cobrador"] as const)("rejeita qualquer escopo explícito para %s", async role => {
    const { db } = fixture();
    for (const escopoCondominios of ["todos", "selecionados"] as const) {
      await expect(criarUsuarioComEscopo(db, 1, { ...novo, role, escopoCondominios, condominioIds: [10] })).rejects.toThrow();
    }
  });
  it("admin continua podendo criar sem carteira e sem escopo", async () => {
    const { db, state } = fixture(); await criarUsuarioComEscopo(db, 1, { ...novo, role: "admin" });
    expect(state.tables.users.at(-1)).toMatchObject({ escopoCondominios: null, condominioId: null });
  });
  it.each(["sindico", "cobrador"] as const)("%s conserva cadastro restrito", async role => {
    const { db, state } = fixture(); await criarUsuarioComEscopo(db, 1, { ...novo, role, condominioIds: [10] });
    expect(state.tables.users.at(-1)).toMatchObject({ escopoCondominios: null, condominioId: 10 });
  });
  it("update de nome e no-op preservam legado, principal e vínculos", async () => {
    const { db, state } = fixture(); const links = structuredClone(state.tables.userCondominios);
    await atualizarUsuarioComEscopo(db, 1, { id: 2, name: "Outro fixture" });
    await atualizarUsuarioComEscopo(db, 1, { id: 2 });
    expect(state.tables.users[1]).toMatchObject({ escopoCondominios: null, condominioId: 10 });
    expect(state.tables.userCondominios).toEqual(links);
  });
  it("revoga global para selecionados atomicamente e audita old/new", async () => {
    const { db, state } = fixture({ ...target, escopoCondominios: "todos", condominioId: null } as any);
    await atualizarUsuarioComEscopo(db, 1, { id: 2, escopoCondominios: "selecionados", condominioIds: [20] });
    expect(state.tables.users[1]).toMatchObject({ escopoCondominios: "selecionados", condominioId: 20 });
    expect(state.tables.userCondominios.filter(v => v.isActive === 1).map(v => v.condominioId)).toEqual([20]);
    expect(JSON.parse(state.tables.auditLogs[0].beforeData).escopoCondominios).toBe("todos");
    expect(JSON.parse(state.tables.auditLogs[0].afterData).condominioIds).toEqual([20]);
  });
  it.each(["sindico", "cobrador"] as const)("troca global para %s exige carteira e limpa escopo", async role => {
    const { db, state } = fixture({ ...target, escopoCondominios: "todos", condominioId: null } as any);
    state.tables.userCondominios = [];
    await expect(atualizarUsuarioComEscopo(db, 1, { id: 2, role })).rejects.toThrow();
    await atualizarUsuarioComEscopo(db, 1, { id: 2, role, condominioIds: [20] });
    expect(state.tables.users[1]).toMatchObject({ role, escopoCondominios: null, condominioId: 20 });
  });
  it("troca entre elegíveis preserva todos", async () => {
    const { db, state } = fixture({ ...target, escopoCondominios: "todos", condominioId: null } as any);
    await atualizarUsuarioComEscopo(db, 1, { id: 2, role: "colaborador" });
    expect(state.tables.users[1].escopoCondominios).toBe("todos");
  });
  it.each(["audit", "links"])("rollback em falha %s para create e update", async kind => {
    const { db, state } = fixture(); const before = structuredClone(state.tables);
    if (kind === "audit") state.failAudit = true; else state.failLinks = true;
    await expect(criarUsuarioComEscopo(db, 1, { ...novo, condominioIds: [20] })).rejects.toThrow();
    expect(state.tables).toEqual(before);
    await expect(atualizarUsuarioComEscopo(db, 1, { id: 2, escopoCondominios: "selecionados", condominioIds: [20] })).rejects.toThrow();
    expect(state.tables).toEqual(before);
  });
  it.each([{ role: "colaborador" }, { isActive: 0 }, { isDeleted: 1 }])("reconfirma admin atual, não aceita sessão antiga %j", async change => {
    const { db, state } = fixture(); Object.assign(state.tables.users[0], change);
    await expect(criarUsuarioComEscopo(db, 1, { ...novo, condominioIds: [10] })).rejects.toThrow();
    await expect(atualizarUsuarioComEscopo(db, 1, { id: 2, name: "Novo fixture" })).rejects.toThrow();
    expect(state.tables.auditLogs).toHaveLength(0);
  });
  it("preserva rejeição de email duplicado, senha fraca e edição de excluído", async () => {
    const { db } = fixture();
    await expect(criarUsuarioComEscopo(db, 1, { ...novo, email: target.email, condominioIds: [10] })).rejects.toThrow("e-mail");
    await expect(criarUsuarioComEscopo(db, 1, { ...novo, password: "fraca", condominioIds: [10] })).rejects.toThrow();
    const deleted = fixture({ ...target, isDeleted: 1 });
    await expect(atualizarUsuarioComEscopo(deleted.db, 1, { id: 2, name: "Outro fixture" })).rejects.toThrow("Restaure");
  });
  it("último admin e administrador principal continuam protegidos", async () => {
    const { db } = fixture({ ...target, role: "admin" });
    await expect(atualizarUsuarioComEscopo(db, 1, { id: 1, isActive: 0 })).rejects.toThrow("próprio usuário");
    const primary = fixture({ ...target, isPrimaryAdmin: 1 });
    await expect(atualizarUsuarioComEscopo(primary.db, 1, { id: 2, isActive: 0 })).rejects.toThrow("administrador principal");
  });
  it("bloqueia último admin ativo ainda que o ator seja o próprio alvo", async () => {
    const { db, state } = fixture({ ...target, role: "admin" });
    state.tables.users[1].isActive = 0;
    await expect(atualizarUsuarioComEscopo(db, 1, { id: 1, role: "sindico", condominioIds: [10] })).rejects.toThrow();
    expect(state.tables.users[0].role).toBe("admin");
  });
  it.each([
    { escopoCondominios: "todos", condominioIds: [20] },
    { escopoCondominios: "selecionados", condominioIds: [] },
    { condominioIds: [20], condominioId: 10 },
    { condominioIds: [30] }, { condominioIds: [20, 20] },
    { role: "cobrador", escopoCondominios: "selecionados", condominioIds: [10] },
  ])("nega update inválido e preserva estado %j", async input => {
    const { db, state } = fixture(); const before = structuredClone(state.tables);
    await expect(atualizarUsuarioComEscopo(db, 1, { id: 2, ...input } as any)).rejects.toThrow();
    expect(state.tables).toEqual(before);
  });
  it("delete/restore preservam escopo e histórico, restauração sempre inativa", async () => {
    const { db, state } = fixture(); const links = structuredClone(state.tables.userCondominios);
    expect(await excluirUsuarioComEscopo(db, 1, 2)).toEqual({ success: true, softDeleted: true });
    expect(await restaurarUsuarioComEscopo(db, 1, 2)).toEqual({ success: true, restored: true, isActive: 0 });
    expect(state.tables.users[1]).toMatchObject({ isActive: 0, isDeleted: 0, escopoCondominios: null });
    expect(state.tables.userCondominios).toEqual(links);
  });
  it("delete, restore e principal falham com admin revogado e rollback da auditoria", async () => {
    for (const action of ["delete", "restore", "primary"] as const) {
      const { db, state } = fixture({ ...target, isDeleted: action === "restore" ? 1 : 0 });
      const run = () => action === "delete" ? excluirUsuarioComEscopo(db, 1, 2)
        : action === "restore" ? restaurarUsuarioComEscopo(db, 1, 2) : definirAdminPrincipalComEscopo(db, 1, 2, 10);
      const before = structuredClone(state.tables); state.failAudit = true;
      await expect(run()).rejects.toThrow("audit"); expect(state.tables).toEqual(before);
      state.failAudit = false; state.tables.users[0].role = "advogado";
      const revoked = structuredClone(state.tables);
      await expect(run()).rejects.toThrow("Administrador ativo"); expect(state.tables).toEqual(revoked);
    }
  });
  it("listagem serviço inclui globals atuais/futuros e selecionados pela carteira, com DTO seguro", async () => {
    const { db, state } = fixture();
    state.tables.users.push({ ...target, id: 3, escopoCondominios: "todos", condominioId: null },
      { ...target, id: 4, escopoCondominios: "selecionados", condominioId: 10 });
    state.tables.userCondominios.push({ userId: 4, condominioId: 20, isActive: 1 });
    expect((await listarUsuariosPorCondominio(db, 20, false)).map(u => u.id)).toEqual([3, 4]);
    state.tables.condominios.push({ id: 999, statusCadastro: "ativo" });
    const futuro = await listarUsuariosPorCondominio(db, 999, false);
    expect(futuro.map(u => u.id)).toEqual([3]);
    expect(futuro[0]).toHaveProperty("escopoCondominios", "todos");
    expect(futuro[0]).not.toHaveProperty("passwordHash");
    expect(await listarUsuariosPorCondominio(db, 30, false)).toEqual([]);
  });
});

describe("visibilidade no condomínio: explícitos vs legado", () => {
  it("global elegível aparece em ativo futuro sem vínculos", () => {
    expect(usuarioVisivelNoCondominio({ ...target, escopoCondominios: "todos" } as any, 999, true, [])).toBe(true);
    expect(usuarioVisivelNoCondominio({ ...target, escopoCondominios: "todos" } as any, 999, false, [])).toBe(false);
  });
  it("selecionados só aparecem pela carteira e ativo; legado mantém principal", () => {
    const selected = { ...target, escopoCondominios: "selecionados" } as any;
    expect(usuarioVisivelNoCondominio(selected, 20, true, [20])).toBe(true);
    expect(usuarioVisivelNoCondominio(selected, 10, true, [20])).toBe(false);
    expect(usuarioVisivelNoCondominio(selected, 20, false, [20])).toBe(false);
    expect(usuarioVisivelNoCondominio(target, 10, false, [])).toBe(true);
    expect(usuarioVisivelNoCondominio(target, 20, true, [20])).toBe(false);
    expect(usuarioVisivelNoCondominio({ ...selected, role: "cobrador", escopoCondominios: "todos" }, 20, true, [])).toBe(false);
  });
});
