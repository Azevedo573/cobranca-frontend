import { getTableColumns, getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { vi } from "vitest";

type Row = Record<string, any>;
type JoinedRow = Record<string, Row | undefined>;
type Operation = {
  kind: string;
  table?: string;
  values?: Row;
  inTransaction: boolean;
  limit?: number;
  sql?: string;
  affected?: number;
};

/** Fixture exclusiva de testes; nenhum driver, conexão ou SQL real é executado. */
export function criarDbWebhookBtgEmMemoria(initial: Record<string, Row[]>) {
  const dialect = new MySqlDialect();
  const state = {
    tables: structuredClone(initial),
    writes: [] as Operation[],
    operations: [] as Operation[],
    locks: [] as string[],
    transactions: 0,
    rollbacks: 0,
    failInjected: null as null | {
      table: string;
      times: number;
      message?: string;
    },
  };
  let transactionDepth = 0;
  let transactionQueue: Promise<unknown> = Promise.resolve();
  const record = (operation: Omit<Operation, "inTransaction">): Operation => {
    const entry = { ...operation, inTransaction: transactionDepth > 0 };
    state.operations.push(entry);
    return entry;
  };

  // Interpreta o SQL do próprio Drizzle. Falha explicitamente em sintaxe não
  // suportada para que um filtro novo nunca se transforme em um match universal.
  function predicate(condition: any): (row: JoinedRow) => boolean {
    if (!condition) return () => true;
    const { sql, params } = dialect.sqlToQuery(condition);
    const tokenPattern =
      /\s*(`[^`]+`\.`[^`]+`|\?|\(|\)|,|<>|!=|>=|<=|=|>|<|\b(?:and|or|not|in|is|null|true|false)\b)/gi;
    const tokens: string[] = [];
    let offset = 0,
      match: RegExpExecArray | null;
    while ((match = tokenPattern.exec(sql))) {
      if (match.index !== offset)
        throw new Error(`Unsupported test SQL: ${sql}`);
      tokens.push(match[1]);
      offset = tokenPattern.lastIndex;
    }
    if (sql.slice(offset).trim())
      throw new Error(`Unsupported test SQL: ${sql}`);
    let index = 0,
      paramIndex = 0;
    const take = () => tokens[index++];
    const is = (value: string) => tokens[index]?.toLowerCase() === value;
    const requireToken = (value: string) => {
      if (!is(value)) throw new Error(`Expected ${value} in test SQL: ${sql}`);
      take();
    };
    type Value = (row: JoinedRow) => any;
    type Filter = (row: JoinedRow) => boolean;
    function value(): Value {
      const token = take();
      if (token === "?") {
        const expected = params[paramIndex++];
        return () => expected;
      }
      if (token?.toLowerCase() === "null") return () => null;
      const column = /^`([^`]+)`\.`([^`]+)`$/.exec(token ?? "");
      if (column) return row => row[column[1]]?.[column[2]];
      throw new Error(`Unsupported value in test SQL: ${sql}`);
    }
    function atom(): Filter {
      if (is("(")) {
        take();
        const nested = expression();
        requireToken(")");
        return nested;
      }
      if (is("false")) {
        take();
        return () => false;
      }
      if (is("true")) {
        take();
        return () => true;
      }
      const left = value();
      if (is("is")) {
        take();
        const negative = is("not");
        if (negative) take();
        requireToken("null");
        return row => (negative ? left(row) != null : left(row) == null);
      }
      const negative = is("not");
      if (negative) take();
      if (is("in")) {
        take();
        requireToken("(");
        const values = [value()];
        while (is(",")) {
          take();
          values.push(value());
        }
        requireToken(")");
        return row => negative !== values.some(item => item(row) === left(row));
      }
      if (negative) throw new Error(`Unsupported NOT in test SQL: ${sql}`);
      const operator = take(),
        right = value();
      if (!["=", "!=", "<>", ">", "<", ">=", "<="].includes(operator))
        throw new Error(`Unsupported operator in test SQL: ${sql}`);
      return row => {
        const a = left(row),
          b = right(row);
        if (operator === "=") return a === b;
        if (operator === "!=" || operator === "<>") return a !== b;
        if (operator === ">") return a > b;
        if (operator === "<") return a < b;
        if (operator === ">=") return a >= b;
        return a <= b;
      };
    }
    function conjunction(): Filter {
      let left = atom();
      while (is("and")) {
        take();
        const previous = left,
          right = atom();
        left = row => previous(row) && right(row);
      }
      return left;
    }
    function expression(): Filter {
      let left = conjunction();
      while (is("or")) {
        take();
        const previous = left,
          right = conjunction();
        left = row => previous(row) || right(row);
      }
      return left;
    }
    const result = expression();
    if (index !== tokens.length || paramIndex !== params.length)
      throw new Error(`Incomplete test SQL: ${sql}`);
    return result;
  }
  function project(selection: any, row: JoinedRow, base: string): any {
    if (!selection) return structuredClone(row[base]);
    const result: Row = {};
    for (const [key, selected] of Object.entries(selection) as [
      string,
      any,
    ][]) {
      if (selected?.table && selected?.name)
        result[key] = row[getTableName(selected.table)]?.[selected.name];
      else if (
        selected &&
        Object.getOwnPropertySymbols(selected).some(symbol =>
          String(symbol).includes("Columns")
        )
      )
        result[key] = row[getTableName(selected)];
      else if (selected && typeof selected === "object")
        result[key] = project(selected, row, base);
      else throw new Error(`Unsupported test projection: ${key}`);
    }
    return structuredClone(result);
  }
  function deferred(run: () => any) {
    let promise: Promise<any> | undefined;
    return {
      then: (resolve: any, reject: any) =>
        (promise ??= Promise.resolve().then(run)).then(resolve, reject),
    };
  }
  const db: any = {
    select: vi.fn((selection?: any) => {
      let base = "",
        condition: any,
        limit = Infinity;
      const joins: { table: string; on: any }[] = [];
      const chain: any = {
        ...deferred(() => {
          record({
            kind: "select",
            table: base,
            limit,
            sql: condition ? dialect.sqlToQuery(condition).sql : undefined,
          });
          let rows: JoinedRow[] = (state.tables[base] ?? []).map(row => ({
            [base]: row,
          }));
          for (const join of joins) {
            const match = predicate(join.on);
            rows = rows.flatMap(row =>
              (state.tables[join.table] ?? [])
                .map(other => ({ ...row, [join.table]: other }))
                .filter(match)
            );
          }
          return rows
            .filter(predicate(condition))
            .slice(0, limit)
            .map(row => project(selection, row, base));
        }),
        from: (table: any) => {
          base = getTableName(table);
          return chain;
        },
        where: (where: any) => {
          condition = where;
          return chain;
        },
        limit: (n: number) => {
          limit = n;
          return chain;
        },
        innerJoin: (table: any, on: any) => {
          joins.push({ table: getTableName(table), on });
          return chain;
        },
        orderBy: () => chain,
        for: (mode: string) => {
          state.locks.push(`${base}:${mode}`);
          record({ kind: `lock:${mode}`, table: base });
          return chain;
        },
      };
      return chain;
    }),
    insert: vi.fn((table: any) => {
      const name = getTableName(table);
      return {
        values: (values: Row | Row[]) => {
          let upsert: Row | undefined;
          const chain: any = {
            ...deferred(() => {
              const rows = (state.tables[name] ??= []);
              let insertId = 0;
              for (const data of Array.isArray(values) ? values : [values]) {
                const existing =
                  name === "btgWebhookEntregas" &&
                  rows.find(
                    row =>
                      row.btgIntegracaoId === data.btgIntegracaoId &&
                      row.payloadHash === data.payloadHash
                  );
                if (existing) {
                  if (!upsert)
                    throw new Error("duplicate unique integration/hash 1062");
                  Object.assign(existing, structuredClone(upsert));
                  insertId = existing.id;
                  state.writes.push(
                    record({
                      kind: "upsert",
                      table: name,
                      values: structuredClone(upsert),
                      affected: 1,
                    })
                  );
                } else {
                  const defaults: Row = {};
                  for (const [key, column] of Object.entries(
                    getTableColumns(table)
                  ) as [string, any][]) {
                    if (
                      column.default !== undefined &&
                      typeof column.default !== "object"
                    )
                      defaults[key] = column.default;
                    else if (!column.notNull) defaults[key] = null;
                  }
                  insertId = Math.max(0, ...rows.map(row => row.id ?? 0)) + 1;
                  rows.push({
                    ...defaults,
                    id: insertId,
                    recebidoEm: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    ...structuredClone(data),
                  });
                  state.writes.push(
                    record({
                      kind: "insert",
                      table: name,
                      values: structuredClone(data),
                      affected: 1,
                    })
                  );
                }
              }
              return [{ insertId, affectedRows: 1 }];
            }),
            onDuplicateKeyUpdate: ({ set }: { set: Row }) => {
              upsert = set;
              return chain;
            },
          };
          return chain;
        },
      };
    }),
    update: vi.fn((table: any) => ({
      set: (values: Row) => ({
        where: (condition: any) =>
          deferred(() => {
            const name = getTableName(table);
            record({
              kind: "update-attempt",
              table: name,
              values: structuredClone(values),
            });
            const failure = state.failInjected;
            if (failure && failure.table === name && failure.times > 0) {
              failure.times--;
              throw new Error(failure.message ?? "injected update unavailable");
            }
            const match = predicate(condition);
            let affected = 0;
            for (const row of state.tables[name] ?? [])
              if (match({ [name]: row })) {
                Object.assign(row, structuredClone(values));
                affected++;
              }
            state.writes.push(
              record({
                kind: "update",
                table: name,
                values: structuredClone(values),
                affected,
              })
            );
            return [{ affectedRows: affected }];
          }),
      }),
    })),
    transaction: vi.fn((run: (tx: any) => Promise<any>) => {
      // Serialização determinística apenas no mock; não substitui um teste de
      // concorrência MySQL. Os testes também verificam os locks pedidos pelo handler.
      const result = transactionQueue.then(async () => {
        state.transactions++;
        const before = structuredClone(state.tables),
          writes = state.writes.length;
        transactionDepth++;
        record({ kind: "transaction-begin" });
        try {
          const result = await run(db);
          record({ kind: "transaction-commit" });
          return result;
        } catch (error) {
          state.tables = before;
          state.writes.splice(writes);
          state.rollbacks++;
          record({ kind: "transaction-rollback" });
          throw error;
        } finally {
          transactionDepth--;
        }
      });
      transactionQueue = result.catch(() => undefined);
      return result;
    }),
  };
  return { db, state };
}
