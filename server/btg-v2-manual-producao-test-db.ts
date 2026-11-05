import { getTableColumns, getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { vi } from "vitest";

/** Somente testes: executa os filtros eq/and reais gerados pelo Drizzle em registros isolados. */
export function criarDbBtgEmMemoria(initial: Record<string, any[]>) {
  const dialect = new MySqlDialect();
  const state = { tables: structuredClone(initial), writes: [] as { table: string; values: any }[], locks: [] as string[], failAudit: false, transactions: 0 };
  function matches(row: any, condition: any) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let index = 0;
    return Array.from(sql.matchAll(/`([^`]+)`\.`([^`]+)`\s*=\s*\?/g)).every((match) => {
      const expected = params[index++];
      return row[match[1]]?.[match[2]] === expected;
    });
  }
  function project(selection: any, joined: any, base: string) {
    if (!selection) return joined[base];
    const result: any = {};
    for (const [key, value] of Object.entries(selection) as [string, any][]) {
      if (value?.table && value?.name) result[key] = joined[getTableName(value.table)]?.[value.name];
      else if (value && Object.getOwnPropertySymbols(value).some(s => String(s).includes("Columns"))) result[key] = joined[getTableName(value)];
      else if (value && typeof value === "object") result[key] = project(value, joined, base);
    }
    return result;
  }
  const db: any = {
    select: vi.fn((selection?: any) => {
      let base = "", condition: any, limit = Infinity;
      const joins: { table: string; on: any }[] = [];
      const run = () => {
        let rows = (state.tables[base] ?? []).map(row => ({ [base]: row }));
        for (const join of joins) {
          const { sql } = dialect.sqlToQuery(join.on);
          const equal = /`([^`]+)`\.`([^`]+)`\s*=\s*`([^`]+)`\.`([^`]+)`/.exec(sql)!;
          rows = rows.flatMap(row => (state.tables[join.table] ?? []).map(other => ({ ...row, [join.table]: other }))
            .filter(all => all[equal[1]]?.[equal[2]] === all[equal[3]]?.[equal[4]]));
        }
        return rows.filter(row => matches(row, condition)).slice(0, limit).map(row => project(selection, row, base));
      };
      const chain: any = {
        from: (table: any) => { base = getTableName(table); return chain; },
        where: (where: any) => { condition = where; return chain; },
        limit: (n: number) => { limit = n; return chain; },
        innerJoin: (table: any, on: any) => { joins.push({ table: getTableName(table), on }); return chain; },
        orderBy: () => chain,
        for: (mode: string) => { state.locks.push(`${base}:${mode}`); return chain; },
        then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
      };
      return chain;
    }),
    insert: vi.fn((table: any) => {
      const name = getTableName(table);
      return { values: (values: any) => {
        let upsert: any;
        const run = () => {
          if (name === "auditLogs" && state.failAudit) throw new Error("audit unavailable");
          const rows = state.tables[name] ??= [];
          for (const data of Array.isArray(values) ? values : [values]) {
            const existing = rows.find(row => name === "btgContaRecebedoraCondominios"
              ? row.btgIntegracaoId === data.btgIntegracaoId && row.condominioId === data.condominioId
              : name === "btgContasRecebedoras" ? row.btgIntegracaoId === data.btgIntegracaoId && row.accountId === data.accountId : false);
            if (existing) {
              if (!upsert) throw new Error("duplicate 1062");
              Object.assign(existing, upsert);
            } else {
              const defaults: any = {};
              for (const [key, col] of Object.entries(getTableColumns(table)) as [string, any][]) {
                if (col.default !== undefined && typeof col.default !== "object") defaults[key] = col.default;
                else if (!col.notNull) defaults[key] = null;
              }
              rows.push({ ...defaults, id: rows.length + 100, createdAt: new Date(), updatedAt: new Date(), ultimaSincronizacaoEm: new Date(), diasLimitePagamento: 60, ...data });
            }
            state.writes.push({ table: name, values: structuredClone(data) });
          }
          return [{ insertId: rows.at(-1)?.id ?? 0 }];
        };
        const chain: any = { onDuplicateKeyUpdate: ({ set }: any) => { upsert = set; return chain; }, then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject) };
        return chain;
      } };
    }),
    update: vi.fn((table: any) => ({ set: (values: any) => ({ where: async (condition: any) => {
      const name = getTableName(table);
      for (const row of state.tables[name] ?? []) if (matches({ [name]: row }, condition)) Object.assign(row, values);
      state.writes.push({ table: name, values: structuredClone(values) });
    } }) })),
    transaction: vi.fn(async (run: any) => {
      state.transactions++;
      const before = structuredClone(state.tables), writes = state.writes.length;
      try { return await run(db); }
      catch (error) { state.tables = before; state.writes.splice(writes); throw error; }
    }),
  };
  return { db, state };
}
