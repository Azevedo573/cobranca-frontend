import { beforeEach, describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

// Entrada: SPEC-usuarios-escopo-condominios-2026-11-10.md. As identidades
// fictícias preservam papel/principal legados; nenhum acesso a banco real.
const fixtures = vi.hoisted(() => ({ users: new Map<number, AuthenticatedUser>() }));

vi.mock("./db", async (original) => {
  const { getTableName } = await import("drizzle-orm");
  const { MySqlDialect } = await import("drizzle-orm/mysql-core");
  const dialect = new MySqlDialect();
  type Row = Record<string, unknown>;
  type JoinedRow = Record<string, Row>;
  const rowsFor = (table: string): Row[] => {
    switch (table) {
      case "users": return Array.from(fixtures.users.values());
      case "condominios": return [{ id: 1, name: "Condomínio Teste", statusCadastro: "ativo" }];
      case "userCondominios": return Array.from(fixtures.users.values())
        .filter(user => user.condominioId !== null)
        .map(user => ({ userId: user.id, condominioId: user.condominioId, isActive: 1 }));
      case "devedores": case "cobrancas": case "acordos":
      case "tentativasCobranca": case "parcelasAcordo": return [];
      default: throw new Error(`Tabela sem fixture Excel: ${table}`);
    }
  };
  const matches = (condition: any, row: JoinedRow): boolean => {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let paramIndex = 0;
    return sql.replace(/[()]/g, "").split(/\s+and\s+/i).map(clause => {
      const match = clause.trim().match(/^`([^`]+)`\.`([^`]+)`\s*(=|<>|>=|<=)\s*(\?|`([^`]+)`\.`([^`]+)`)$/);
      if (!match) throw new Error(`Filtro sem suporte na fixture Excel: ${clause}`);
      const [, table, column, operator, rhs, otherTable, otherColumn] = match;
      const left = row[table]?.[column];
      const right = rhs === "?" ? params[paramIndex++] : row[otherTable]?.[otherColumn];
      if (operator === "=") return left === right;
      if (operator === "<>") return left !== right;
      if (operator === ">=") return (left as number) >= (right as number);
      return (left as number) <= (right as number);
    }).every(Boolean);
  };
  return {
    ...await original<typeof import("./db")>(),
    getDb: async () => ({ select: (projection?: Record<string, any>) => {
      let source = "";
      let rows: JoinedRow[] = [];
      const results = () => rows.map(row => projection
        ? Object.fromEntries(Object.entries(projection).map(([alias, column]) =>
          [alias, row[getTableName(column.table)]?.[column.name]]))
        : { ...row[source] });
      const query: any = {
        from: (table: any) => {
          source = getTableName(table);
          rows = rowsFor(source).map(row => ({ [source]: row }));
          return query;
        },
        innerJoin: (table: any, condition: any) => {
          const name = getTableName(table);
          rows = rows.flatMap(row => rowsFor(name).map(joined => ({ ...row, [name]: joined })))
            .filter(row => matches(condition, row));
          return query;
        },
        leftJoin: (table: any, condition: any) => {
          const name = getTableName(table);
          rows = rows.flatMap(row => {
            const joined = rowsFor(name).map(item => ({ ...row, [name]: item }))
              .filter(item => matches(condition, item));
            return joined.length ? joined : [{ ...row, [name]: {} }];
          });
          return query;
        },
        where: (condition: any) => { rows = rows.filter(row => matches(condition, row)); return query; },
        orderBy: () => query,
        limit: (count: number) => { rows = rows.slice(0, count); return query; },
        then: (resolve: any, reject: any) => Promise.resolve(results()).then(resolve, reject),
      };
      return query;
    } }),
  };
});

beforeEach(() => fixtures.users.clear());

function createAuthContext(role: "admin" | "sindico" | "cobrador" = "admin", condominioId?: number): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "custom",
    role,
    condominioId: condominioId || null,
    escopoCondominios: null,
    passwordHash: null,
    isPrimaryAdmin: 0,
    isActive: 1,
    isDeleted: 0,
    profileId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  fixtures.users.set(user.id, { ...user });

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
