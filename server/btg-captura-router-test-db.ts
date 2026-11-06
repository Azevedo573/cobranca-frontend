import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { vi } from "vitest";

/** Exclusiva destes testes; não conecta a DB/rede e avalia eq/and reais do router. */
export function criarDbDiagnosticosTeste(initial: Record<string, Record<string, any>[]>) {
  const dialect = new MySqlDialect();
  const state = {
    tables: structuredClone(initial), failAudit: false, failCommit: false,
    transactions: 0, committed: 0,
    reads: [] as { table: string; columns: string[] | null }[],
    locks: [] as { table: string; mode: string }[],
    writes: [] as { table: string; values: Record<string, any> }[],
  };
  function matches(row: Record<string, any>, table: string, condition: any) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    const terms = Array.from(sql.matchAll(/`([^`]+)`\.`([^`]+)`\s*=\s*\?/g));
    if (terms.length !== params.length) throw new Error("Filtro de teste não suportado");
    return terms.every((term, index) => term[1] === table && row[term[2]] === params[index]);
  }
  const db: any = {
    select: vi.fn((selection?: Record<string, any>) => {
      let table = "", condition: any, limit = Infinity, descending = false;
      const chain: any = {
        from: (source: any) => { table = getTableName(source); return chain; },
        where: (where: any) => { condition = where; return chain; },
        limit: (count: number) => { limit = count; return chain; },
        orderBy: () => { descending = true; return chain; },
        for: (mode: string) => { state.locks.push({ table, mode }); return chain; },
        then: (resolve: any, reject: any) => Promise.resolve().then(() => {
          state.reads.push({ table, columns: selection ? Object.values(selection).map(col => col.name) : null });
          let rows = (state.tables[table] ?? []).filter(row => matches(row, table, condition));
          if (descending) rows = [...rows].sort((a, b) => b.id - a.id);
          return rows.slice(0, limit).map(row => selection
            ? Object.fromEntries(Object.entries(selection).map(([key, col]) => [key, row[col.name]]))
            : structuredClone(row));
        }).then(resolve, reject),
      };
      return chain;
    }),
    insert: vi.fn((source: any) => ({ values: async (values: Record<string, any>) => {
      const table = getTableName(source);
      if (table === "auditLogs" && state.failAudit) throw new Error("Banco retornou segredo fictício 52998224725");
      (state.tables[table] ??= []).push({ id: 900 + state.tables[table].length, ...structuredClone(values) });
      state.writes.push({ table, values: structuredClone(values) });
    } })),
    update: vi.fn((source: any) => ({ set: (values: Record<string, any>) => ({ where: async (condition: any) => {
      const table = getTableName(source);
      for (const row of state.tables[table] ?? []) if (matches(row, table, condition)) Object.assign(row, values);
      state.writes.push({ table, values: structuredClone(values) });
      return [{ affectedRows: 1 }];
    } }) })),
    transaction: vi.fn(async (run: (tx: any) => Promise<any>) => {
      state.transactions++;
      const before = structuredClone(state.tables), count = state.writes.length;
      try {
        const result = await run(db);
        if (state.failCommit) throw new Error("commit indisponível");
        state.committed++;
        return result;
      } catch (error) {
        state.tables = before;
        state.writes.splice(count);
        throw error;
      }
    }),
    execute: vi.fn(() => { throw new Error("DDL proibida"); }),
    delete: vi.fn(() => { throw new Error("Delete proibido"); }),
  };
  return { db, state };
}
