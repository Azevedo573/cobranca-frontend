/**
 * Testes para:
 * 1. Busca por CPF/CNPJ na listagem de devedores (lógica de filtragem)
 * 2. Exportação Excel nas páginas de Cobranças e Tentativas (endpoints backend)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Column, Param, SQL, StringChunk } from "drizzle-orm";
import { cobrancas, condominios, devedores, tentativasCobranca, userCondominios, users } from "../drizzle/schema";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// SPEC-usuarios-escopo-condominios-2026-11-10: identidade fresca, sem DB real.
// O mesmo principal/role do contexto é persistido; NULL conserva o ramo legado.
const fixtureRows = new Map<unknown, Record<string, unknown>[]>();
type FixtureRow = Map<unknown, Record<string, unknown>>;
type FixtureQuery = PromiseLike<Record<string, unknown>[]> & {
  from(table: unknown): FixtureQuery;
  where(condition: unknown): FixtureQuery;
  innerJoin(table: unknown, condition: unknown): FixtureQuery;
  leftJoin(table: unknown, condition: unknown): FixtureQuery;
  orderBy(): FixtureQuery;
  limit(count: number): FixtureQuery;
};

function fixtureValue(value: unknown, row: FixtureRow): unknown {
  if (value instanceof Column) return row.get(value.table)?.[value.name];
  if (value instanceof Param) return value.value;
  if (!(value instanceof SQL)) return value;
  const operands = value.queryChunks.filter(chunk => !(chunk instanceof StringChunk));
  const operator = value.queryChunks
    .filter((chunk): chunk is StringChunk => chunk instanceof StringChunk)
    .map(chunk => chunk.value.join(""))
    .join("").replace(/[()]/g, "").trim();
  if (!operator && operands.length === 1) return fixtureValue(operands[0], row);
  if (/^and(?:\s+and)*$/.test(operator)) return operands.every(chunk => fixtureValue(chunk, row));
  if (operator === "=") return fixtureValue(operands[0], row) === fixtureValue(operands[1], row);
  if (operator === "<>") return fixtureValue(operands[0], row) !== fixtureValue(operands[1], row);
  throw new Error(`Predicado não suportado pela fixture: ${operator}`);
}

const fixtureDb = {
  select(projection?: Record<string, unknown>) {
    let source: unknown;
    let rows: FixtureRow[] = [];
    let predicate: unknown;
    let maxRows = Infinity;
    const execute = () => rows
      .filter(row => predicate === undefined || fixtureValue(predicate, row))
      .slice(0, maxRows)
      .map(row => projection
        ? Object.fromEntries(Object.entries(projection).map(([alias, column]) => [alias, fixtureValue(column, row)]))
        : { ...row.get(source) });
    const join = (table: unknown, condition: unknown, left: boolean) => {
      rows = rows.flatMap(row => {
        const matched = (fixtureRows.get(table) ?? []).map(record => new Map([...row, [table, record]]))
          .filter(candidate => fixtureValue(condition, candidate));
        return matched.length || !left ? matched : [row];
      });
      return query;
    };
    const query: FixtureQuery = {
      from(table: unknown) {
        if (!fixtureRows.has(table)) throw new Error("Tabela sem fixture de exportação");
        source = table;
        rows = fixtureRows.get(table)!.map(record => new Map([[table, record]]));
        return query;
      },
      where(condition: unknown) { predicate = condition; return query; },
      innerJoin(table: unknown, condition: unknown) { return join(table, condition, false); },
      leftJoin(table: unknown, condition: unknown) { return join(table, condition, true); },
      orderBy() { return query; },
      limit(count: number) { maxRows = count; return query; },
      then<TResult1 = Record<string, unknown>[], TResult2 = never>(
        onfulfilled?: ((value: Record<string, unknown>[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) { return Promise.resolve(execute()).then(onfulfilled, onrejected); },
    };
    return query;
  },
};

vi.mock("./db", async importOriginal => {
  const original = await importOriginal<typeof import("./db")>();
  return { ...original, getDb: vi.fn(async () => fixtureDb) };
});

beforeEach(() => {
  fixtureRows.clear();
  fixtureRows.set(users, []);
  fixtureRows.set(condominios, [{ id: 1, name: "Condomínio Teste", statusCadastro: "ativo" }]);
  fixtureRows.set(userCondominios, []);
  fixtureRows.set(cobrancas, []);
  fixtureRows.set(devedores, []);
  fixtureRows.set(tentativasCobranca, []);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAuthContext(role: "admin" | "sindico" | "cobrador", condominioId?: number): TrpcContext {
  const ctx = {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      condominioId: condominioId ?? (role !== "admin" ? 1 : undefined),
      passwordHash: null,
      isPrimaryAdmin: 0,
      isActive: 1,
      isDeleted: 0,
      profileId: null,
      escopoCondominios: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
  fixtureRows.set(users, [{ ...ctx.user, condominioId: ctx.user.condominioId ?? null }]);
  fixtureRows.set(userCondominios, ctx.user.condominioId == null ? [] : [{
    id: 1, userId: ctx.user.id, condominioId: ctx.user.condominioId, isActive: 1,
  }]);
  return ctx;
}

// ─── Busca por CPF/CNPJ (lógica de filtragem no frontend) ────────────────────

describe("Busca por CPF/CNPJ - lógica de filtragem", () => {
  // Simular a função de normalização de documento
  const normalizarDocumento = (doc: string) => doc.replace(/[.\-\/]/g, "");

  // Simular a função de filtro usada no componente Devedores.tsx
  const filtrarDevedores = (devedores: any[], searchTerm: string) => {
    const termo = searchTerm.toLowerCase();
    const termoNormalizado = normalizarDocumento(searchTerm);
    return devedores.filter(dev =>
      (dev.name?.toLowerCase() || "").includes(termo) ||
      dev.unitNumber.toLowerCase().includes(termo) ||
      (dev.bloco?.toLowerCase() || "").includes(termo) ||
      (dev.cpfCnpj && (
        dev.cpfCnpj.toLowerCase().includes(termo) ||
        normalizarDocumento(dev.cpfCnpj).includes(termoNormalizado)
      ))
    );
  };

  const devedoresMock = [
    { id: 1, name: "João Silva", unitNumber: "101", bloco: "A", cpfCnpj: "123.456.789-00" },
    { id: 2, name: "Maria Santos", unitNumber: "202", bloco: "B", cpfCnpj: "987.654.321-00" },
    { id: 3, name: null, unitNumber: "303", bloco: "C", cpfCnpj: "12.345.678/0001-90" },
    { id: 4, name: "Pedro Costa", unitNumber: "404", bloco: null, cpfCnpj: null },
  ];

  it("deve encontrar devedor pelo CPF formatado (com pontos e traço)", () => {
    const resultado = filtrarDevedores(devedoresMock, "123.456.789-00");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
  });

  it("deve encontrar devedor pelo CPF sem formatação (apenas números)", () => {
    const resultado = filtrarDevedores(devedoresMock, "12345678900");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
  });

  it("deve encontrar devedor pelo CNPJ formatado", () => {
    const resultado = filtrarDevedores(devedoresMock, "12.345.678/0001-90");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(3);
  });

  it("deve encontrar devedor pelo CNPJ sem formatação", () => {
    const resultado = filtrarDevedores(devedoresMock, "12345678000190");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(3);
  });

  it("deve encontrar devedor por fragmento do CPF", () => {
    const resultado = filtrarDevedores(devedoresMock, "987.654");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(2);
  });

  it("deve continuar encontrando por nome", () => {
    const resultado = filtrarDevedores(devedoresMock, "joão");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
  });

  it("deve continuar encontrando por unidade", () => {
    const resultado = filtrarDevedores(devedoresMock, "303");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(3);
  });

  it("não deve falhar quando cpfCnpj é null", () => {
    const resultado = filtrarDevedores(devedoresMock, "Pedro");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(4);
  });

  it("deve retornar lista vazia quando não há correspondência", () => {
    const resultado = filtrarDevedores(devedoresMock, "999.999.999-99");
    expect(resultado).toHaveLength(0);
  });
});

// ─── Exportação Excel - Cobranças e Tentativas ────────────────────────────────

describe("Exportação Excel - Cobranças", () => {
  it("deve exportar cobranças para admin com condominioId", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({ condominioId: 1 });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("cobrancas");
    expect(result.filename).toContain(".xlsx");
  });

  it("deve exportar cobranças para síndico sem precisar de condominioId", async () => {
    const ctx = createAuthContext("sindico", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({});

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
  });

  it("deve incluir data atual no nome do arquivo de cobranças", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({ condominioId: 1 });
    const hoje = new Date().toISOString().split("T")[0];

    expect(result.filename).toContain(hoje);
  });
});

describe("Exportação Excel - Tentativas", () => {
  it("deve exportar tentativas para admin com condominioId", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({ condominioId: 1 });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("tentativas");
    expect(result.filename).toContain(".xlsx");
  });

  it("deve exportar tentativas para síndico sem precisar de condominioId", async () => {
    const ctx = createAuthContext("sindico", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({});

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
  });

  it("deve incluir data atual no nome do arquivo de tentativas", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({ condominioId: 1 });
    const hoje = new Date().toISOString().split("T")[0];

    expect(result.filename).toContain(hoje);
  });
});
