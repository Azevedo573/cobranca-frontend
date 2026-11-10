import { getTableColumns, getTableName } from 'drizzle-orm';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import { vi } from 'vitest';

/** Identidade persistida dos cenários legados; nenhum privilégio é inferido do contexto. */
export function usuarioCanaisFixture(role = 'admin', condominioId: number | null = null) {
  return { id: 10, name: 'Teste', role, condominioId, isActive: 1, isDeleted: 0,
    isPrimaryAdmin: 0, profileId: null, escopoCondominios: null };
}

/** Fixture isolada: eq/IN/AND, joins, ordenação e rollback. Não simula um servidor MySQL completo. */
export function criarDbCanaisEmMemoria(initial: Record<string, any[]>) {
  const dialect = new MySqlDialect();
  const state = { tables: structuredClone(initial), writes: [] as { table: string; values: any }[], locks: [] as string[], failAudit: false, transactions: 0 };
  let queue = Promise.resolve();
  function matches(row: any, condition: any) {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let index = 0;
    const clauses = Array.from(sql.matchAll(/`([^`]+)`\.`([^`]+)`\s*(=\s*\?|in\s*\((?:\?\s*,?\s*)+\))/gi));
    if (!clauses.length && params.length) throw new Error('Filtro não suportado nesta fixture');
    return clauses.map(match => {
      const count = (match[3].match(/\?/g) ?? []).length;
      const values = params.slice(index, index + count);
      index += count;
      return values.includes(row[match[1]]?.[match[2]]);
    }).every(Boolean);
  }
  function project(selection: any, joined: any, base: string): any {
    if (!selection) return joined[base];
    const result: any = {};
    for (const [key, value] of Object.entries(selection) as [string, any][]) {
      if (value?.table && value?.name) result[key] = joined[getTableName(value.table)]?.[value.name];
      else if (value && Object.getOwnPropertySymbols(value).some(s => String(s).includes('Columns'))) result[key] = joined[getTableName(value)];
      else if (value && typeof value === 'object') result[key] = project(value, joined, base);
    }
    return result;
  }
  const db: any = {
    select: vi.fn((selection?: any) => {
      let base = '', condition: any, limit = Infinity, order: any;
      const joins: { table: string; on: any; left: boolean }[] = [];
      const run = () => {
        let rows = (state.tables[base] ?? []).map(row => ({ [base]: row }));
        for (const join of joins) {
          const { sql } = dialect.sqlToQuery(join.on);
          const equal = /`([^`]+)`\.`([^`]+)`\s*=\s*`([^`]+)`\.`([^`]+)`/.exec(sql);
          if (!equal) throw new Error('Join não suportado nesta fixture');
          rows = rows.flatMap(row => {
            const found = (state.tables[join.table] ?? []).map(other => ({ ...row, [join.table]: other }))
              .filter(all => all[equal[1]]?.[equal[2]] === all[equal[3]]?.[equal[4]] && matches(all, join.on));
            return found.length ? found : join.left ? [{ ...row, [join.table]: null }] : [];
          });
        }
        rows = rows.filter(row => matches(row, condition));
        if (order) {
          const { sql } = dialect.sqlToQuery(order);
          const col = /`([^`]+)`\.`([^`]+)`/.exec(sql);
          if (col) rows.sort((a, b) => (a[col[1]]?.[col[2]] - b[col[1]]?.[col[2]]) * (/desc/i.test(sql) ? -1 : 1));
        }
        return rows.slice(0, limit).map(row => structuredClone(project(selection, row, base)));
      };
      const chain: any = {
        from: (table: any) => { base = getTableName(table); return chain; },
        where: (where: any) => { condition = where; return chain; },
        limit: (n: number) => { limit = n; return chain; },
        innerJoin: (table: any, on: any) => { joins.push({ table: getTableName(table), on, left: false }); return chain; },
        leftJoin: (table: any, on: any) => { joins.push({ table: getTableName(table), on, left: true }); return chain; },
        orderBy: (o: any) => { order = o; return chain; },
        for: (mode: string) => { state.locks.push(`${base}:${mode}`); return chain; },
        then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
      };
      return chain;
    }),
    insert: vi.fn((table: any) => ({ values: (values: any) => {
      const name = getTableName(table);
      if (name === 'auditLogs' && state.failAudit) throw new Error('audit unavailable');
      const rows = state.tables[name] ??= [];
      for (const data of Array.isArray(values) ? values : [values]) {
        const defaults: any = {};
        for (const [key, col] of Object.entries(getTableColumns(table)) as [string, any][]) {
          if (col.default !== undefined && typeof col.default !== 'object') defaults[key] = col.default;
          else if (!col.notNull) defaults[key] = null;
        }
        const existing = name === 'btgCobrancasEmitidas' && rows.find(row => row.btgIntegracaoId === data.btgIntegracaoId && row.origemTipo === data.origemTipo && row.origemId === data.origemId && row.revisao === data.revisao);
        if (existing) throw new Error('duplicate 1062');
        rows.push({ ...defaults, id: rows.length + 100, createdAt: new Date(), updatedAt: new Date(), ...data });
        state.writes.push({ table: name, values: structuredClone(data) });
      }
      return Promise.resolve([{ insertId: rows.at(-1)?.id ?? 0 }]);
    } })),
    update: vi.fn((table: any) => ({ set: (values: any) => ({ where: async (condition: any) => {
      const name = getTableName(table);
      for (const row of state.tables[name] ?? []) if (matches({ [name]: row }, condition)) Object.assign(row, values);
      state.writes.push({ table: name, values: structuredClone(values) });
      return [{ affectedRows: 1 }];
    } }) })),
    transaction: vi.fn(async (run: any) => {
      let release!: () => void;
      const beforeTx = queue;
      queue = new Promise<void>(resolve => { release = resolve; });
      await beforeTx;
      state.transactions++;
      const before = structuredClone(state.tables), writes = state.writes.length;
      try { return await run(db); }
      catch (error) { state.tables = before; state.writes.splice(writes); throw error; }
      finally { release(); }
    }),
  };
  return { db, state };
}
