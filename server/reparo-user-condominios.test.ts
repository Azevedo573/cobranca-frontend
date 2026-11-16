import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { CREATE_SQL, CONFIRMACAO, validarMetadata, executar } = require(
  '../scripts/reparar-user-condominios-vps.cjs',
) as {
  CREATE_SQL: string;
  CONFIRMACAO: string;
  validarMetadata: (meta: Metadata) => 'ausente' | 'compativel';
  executar: (options: {
    db: { query: (sql: string, params?: unknown) => Promise<unknown> };
    apply: boolean;
    backup: (metadata: Metadata) => Promise<string>;
    conferirEnv: () => void;
  }) => Promise<unknown>;
};

type Table = { TABLE_NAME: string; TABLE_TYPE: string; ENGINE: string | null };
type Column = {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_DEFAULT: unknown;
  EXTRA: string;
};
type Index = {
  INDEX_NAME: string;
  NON_UNIQUE: number;
  SEQ_IN_INDEX: number;
  COLUMN_NAME: string;
};
type Metadata = { tables: Table[]; columns: Column[]; indexes: Index[] };

const BACKUP = '/backup-privado/reparo-user-condominios.sql';
const SECRET = 'segredo-ficticio-NAO-EXIBIR';
const baseTables = (): Table[] => ['users', 'auditLogs'].map(TABLE_NAME => ({
  TABLE_NAME,
  TABLE_TYPE: 'BASE TABLE',
  ENGINE: 'InnoDB',
}));
const absent = (): Metadata => ({ tables: baseTables(), columns: [], indexes: [] });
const column = (
  COLUMN_NAME: string,
  COLUMN_TYPE = 'int',
  COLUMN_DEFAULT: unknown = null,
  EXTRA = '',
): Column => ({ COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE: 'NO', COLUMN_DEFAULT, EXTRA });
const index = (INDEX_NAME: string, NON_UNIQUE: number, cols: string[]): Index[] =>
  cols.map((COLUMN_NAME, i) => ({ INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX: i + 1, COLUMN_NAME }));
const compatible = (): Metadata => ({
  tables: [...baseTables(), { TABLE_NAME: 'userCondominios', TABLE_TYPE: 'BASE TABLE', ENGINE: 'InnoDB' }],
  columns: [
    column('id', 'int', null, 'auto_increment'),
    column('userId'),
    column('condominioId'),
    column('isActive', 'int', 1),
    column('createdAt', 'timestamp', 'CURRENT_TIMESTAMP', 'DEFAULT_GENERATED'),
    column('updatedAt', 'timestamp', 'CURRENT_TIMESTAMP', 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP'),
  ],
  indexes: [
    ...index('PRIMARY', 0, ['id']),
    ...index('userCondominios_user_condominio_unique', 0, ['userId', 'condominioId']),
    ...index('userCondominios_user_active_idx', 1, ['userId', 'isActive']),
    ...index('userCondominios_condominio_active_idx', 1, ['condominioId', 'isActive']),
  ],
});

/** Apenas respostas mysql2 simuladas; importar o helper não deve abrir conexões. */
function simulation(snapshots: Metadata[], options: { ddlError?: Error; probeError?: Error } = {}) {
  const events: string[] = [];
  const reads = { tables: 0, columns: 0, indexes: 0 };
  const query = vi.fn(async (sql: string, _params?: unknown): Promise<unknown> => {
    const normalized = sql.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (/^SELECT\b/i.test(normalized) && /information_schema\./i.test(normalized)) {
      const key = /information_schema\.tables\b/i.test(normalized) ? 'tables'
        : /information_schema\.columns\b/i.test(normalized) ? 'columns'
          : /information_schema\.statistics\b/i.test(normalized) ? 'indexes' : undefined;
      if (!key) throw new Error('Consulta metadata não prevista no contrato');
      events.push(`metadata:${key}`);
      const snapshot = snapshots[Math.min(reads[key]++, snapshots.length - 1)];
      return [snapshot[key], []];
    }
    if (/^CREATE\s+TABLE\b/i.test(normalized)) {
      events.push('create');
      expect(sql).toBe(CREATE_SQL);
      if (options.ddlError) throw options.ddlError;
      return [{ affectedRows: 0 }, []];
    }
    if (/^SELECT\b/i.test(normalized) && /\bFROM\s+userCondominios\b/i.test(normalized)) {
      events.push('probe');
      expect(normalized).toMatch(/^SELECT\s+userId\s*,\s*condominioId\s*,\s*isActive\s+FROM\s+userCondominios\s+LIMIT\s+0\s*;?$/i);
      if (options.probeError) throw options.probeError;
      return [[], []];
    }
    throw new Error(`SQL fora do contrato de teste: ${normalized}`);
  });
  const backup = vi.fn(async (_metadata: Metadata) => { events.push('backup'); return BACKUP; });
  const conferirEnv = vi.fn(() => { events.push('env'); });
  return { db: { query }, backup, conferirEnv, events, reads };
}

function assertReadOnly(sim: ReturnType<typeof simulation>, metadataRounds: number) {
  expect(sim.reads).toEqual({ tables: metadataRounds, columns: metadataRounds, indexes: metadataRounds });
  expect(sim.db.query.mock.calls.every(([sql]) => /^\s*SELECT\b/i.test(sql))).toBe(true);
  expect(sim.events).not.toContain('create');
  expect(sim.events).not.toContain('probe');
}

function assertNoDataMutation(sim: ReturnType<typeof simulation>) {
  const statements = sim.db.query.mock.calls.map(([sql]) => sql.replace(/`/g, ''));
  expect(statements.some(sql => /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|REPLACE|GRANT)\b/i.test(sql))).toBe(false);
  expect(statements.some(sql => /\bCOUNT\s*\(/i.test(sql))).toBe(false);
  expect(statements.filter(sql => /^\s*CREATE\b/i.test(sql))).toEqual([CREATE_SQL.replace(/`/g, '')]);
}

function errorMessage(action: () => unknown) {
  try { action(); } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  }
  throw new Error('A metadata divergente deveria ter sido recusada');
}

describe('reparo userCondominios — somente CREATE autorizado', () => {
  it('exporta o literal de confirmação estritamente estrutural aprovado', () => {
    expect(CONFIRMACAO).toBe('CONFIRMAR SOMENTE ESTRUTURA USER CONDOMINIOS');
  });

  it('concentra seis colunas e quatro índices em um único CREATE TABLE InnoDB', () => {
    expect(typeof CREATE_SQL).toBe('string');
    const sql = CREATE_SQL.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    const statements = sql.split(';').filter(part => part.trim());
    expect(statements).toHaveLength(1);
    expect(sql).toMatch(/^CREATE TABLE userCondominios\s*\(/i);
    expect(sql).toMatch(/\)\s*ENGINE\s*=\s*InnoDB\s*;?$/i);
    expect(sql).not.toMatch(/\bIF\s+NOT\s+EXISTS\b/i);
    expect(sql).not.toMatch(/\b(INSERT|DELETE|ALTER|DROP|TRUNCATE|REPLACE|GRANT|SELECT)\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b(?!\s+CURRENT_TIMESTAMP)/i);
    expect(sql).not.toMatch(/\bUNSIGNED\b/i);
    const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
    const definitions = body.split(/,(?![^()]*\))/).map(part => part.trim());
    const columns = definitions.filter(part => /^(id|userId|condominioId|isActive|createdAt|updatedAt)\s/i.test(part));
    expect(columns.map(part => part.split(/\s/)[0])).toEqual(['id', 'userId', 'condominioId', 'isActive', 'createdAt', 'updatedAt']);
    expect(definitions).toHaveLength(10);
    for (const name of ['id', 'userId', 'condominioId', 'isActive']) {
      expect(columns.find(part => part.startsWith(`${name} `))).toMatch(/\bint(?:\(11\))?\b.*\bNOT NULL\b/i);
    }
    expect(columns[0]).toMatch(/\bAUTO_INCREMENT\b/i);
    expect(columns[3]).toMatch(/\bDEFAULT\s+(?:1|'1'|"1")(?:\s|$)/i);
    for (const part of columns.slice(4)) {
      expect(part).toMatch(/\btimestamp\b.*\bNOT NULL\b.*\bDEFAULT\s+CURRENT_TIMESTAMP(?:\(\))?/i);
    }
    expect(columns[4]).not.toMatch(/\bON UPDATE\b/i);
    expect(columns[5]).toMatch(/\bON UPDATE CURRENT_TIMESTAMP(?:\(\))?/i);
    expect(sql).toMatch(/\bPRIMARY KEY\s*\(\s*id\s*\)/i);
    expect(sql).toMatch(/\b(?:UNIQUE\s+(?:KEY|INDEX)?\s*|CONSTRAINT\s+)userCondominios_user_condominio_unique\s+(?:UNIQUE\s*)?\(\s*userId\s*,\s*condominioId\s*\)/i);
    expect(sql).toMatch(/\b(?:KEY|INDEX)\s+userCondominios_user_active_idx\s*\(\s*userId\s*,\s*isActive\s*\)/i);
    expect(sql).toMatch(/\b(?:KEY|INDEX)\s+userCondominios_condominio_active_idx\s*\(\s*condominioId\s*,\s*isActive\s*\)/i);
  });
});

describe('validarMetadata — equivalência exata sem completar estruturas divergentes', () => {
  it('aceita ausência apenas com users e auditLogs InnoDB e sem colunas/índices órfãos', () => {
    expect(validarMetadata(absent())).toBe('ausente');
  });

  it('aceita os seis campos e quatro grupos de índices aprovados sem mutar fixtures', () => {
    const meta = compatible();
    const before = structuredClone(meta);
    expect(validarMetadata(meta)).toBe('compativel');
    expect(meta).toEqual(before);
  });

  it.each(['int', 'int(11)'])('aceita inteiros signed equivalentes %s', type => {
    const meta = compatible();
    meta.columns.filter(c => ['id', 'userId', 'condominioId', 'isActive'].includes(c.COLUMN_NAME)).forEach(c => { c.COLUMN_TYPE = type; });
    expect(validarMetadata(meta)).toBe('compativel');
  });

  it.each([1, '1', "'1'", '"1"'])('aceita default numérico unitário equivalente %s', value => {
    const meta = compatible();
    meta.columns[3].COLUMN_DEFAULT = value;
    expect(validarMetadata(meta)).toBe('compativel');
  });

  it.each(['CURRENT_TIMESTAMP', 'current_timestamp()', 'CURRENT_TIMESTAMP()'])('aceita default timestamp equivalente %s', value => {
    const meta = compatible();
    meta.columns.slice(4).forEach(c => { c.COLUMN_DEFAULT = value; });
    expect(validarMetadata(meta)).toBe('compativel');
  });

  it.each([
    ['', 'on update CURRENT_TIMESTAMP'],
    ['DEFAULT_GENERATED', 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP'],
    ['DEFAULT_GENERATED', 'DEFAULT_GENERATED on update CURRENT_TIMESTAMP()'],
  ])('aceita extras normais MySQL %s / %s', (created, updated) => {
    const meta = compatible();
    meta.columns[4].EXTRA = created;
    meta.columns[5].EXTRA = updated;
    expect(validarMetadata(meta)).toBe('compativel');
  });

  it('compara por nome de coluna e sequência do índice, não pela ordem dos resultados SQL', () => {
    const meta = compatible();
    meta.tables.reverse(); meta.columns.reverse(); meta.indexes.reverse();
    expect(validarMetadata(meta)).toBe('compativel');
  });

  it.each(['users', 'auditLogs'])('recusa base %s ausente mesmo quando alvo ausente', name => {
    const meta = absent();
    meta.tables = meta.tables.filter(t => t.TABLE_NAME !== name);
    expect(() => validarMetadata(meta)).toThrow();
  });

  it.each(['users', 'auditLogs', 'userCondominios'])('recusa engine não transacional de %s', name => {
    const meta = compatible();
    meta.tables.find(t => t.TABLE_NAME === name)!.ENGINE = 'MyISAM';
    expect(() => validarMetadata(meta)).toThrow();
  });

  it.each(['users', 'auditLogs', 'userCondominios'])('recusa view no lugar de %s', name => {
    const meta = compatible();
    const table = meta.tables.find(t => t.TABLE_NAME === name)!;
    table.TABLE_TYPE = 'VIEW'; table.ENGINE = null;
    expect(() => validarMetadata(meta)).toThrow();
  });

  it.each(['users', 'auditLogs', 'userCondominios'])('recusa nome com capitalização divergente %s', name => {
    const meta = compatible();
    meta.tables.find(t => t.TABLE_NAME === name)!.TABLE_NAME = name.toUpperCase();
    expect(() => validarMetadata(meta)).toThrow();
  });

  it.each(['columns', 'indexes'] as const)('recusa alvo ausente com metadata órfã %s', key => {
    const meta = absent();
    if (key === 'columns') meta.columns = compatible().columns;
    else meta.indexes = compatible().indexes;
    expect(() => validarMetadata(meta)).toThrow();
  });

  const invalidColumns: [string, (meta: Metadata) => void][] = [
    ['coluna ausente', m => { m.columns.pop(); }],
    ['coluna extra', m => { m.columns.push(column('naoAprovada')); }],
    ['coluna duplicada', m => { m.columns.push({ ...m.columns[0] }); }],
    ['nome de coluna divergente', m => { m.columns[1].COLUMN_NAME = 'USERID'; }],
    ['id unsigned', m => { m.columns[0].COLUMN_TYPE = 'int unsigned'; }],
    ['userId unsigned', m => { m.columns[1].COLUMN_TYPE = 'int(11) unsigned'; }],
    ['condominioId bigint', m => { m.columns[2].COLUMN_TYPE = 'bigint'; }],
    ['isActive tinyint', m => { m.columns[3].COLUMN_TYPE = 'tinyint'; }],
    ['createdAt datetime', m => { m.columns[4].COLUMN_TYPE = 'datetime'; }],
    ['updatedAt datetime', m => { m.columns[5].COLUMN_TYPE = 'datetime'; }],
    ['id sem auto_increment', m => { m.columns[0].EXTRA = ''; }],
    ['id default não nulo', m => { m.columns[0].COLUMN_DEFAULT = 1; }],
    ['userId default não nulo', m => { m.columns[1].COLUMN_DEFAULT = 0; }],
    ['condominioId default não nulo', m => { m.columns[2].COLUMN_DEFAULT = 0; }],
    ['userId com extra', m => { m.columns[1].EXTRA = 'auto_increment'; }],
    ['condominioId com extra', m => { m.columns[2].EXTRA = 'DEFAULT_GENERATED'; }],
    ['isActive com extra', m => { m.columns[3].EXTRA = 'auto_increment'; }],
    ['isActive default zero', m => { m.columns[3].COLUMN_DEFAULT = 0; }],
    ['isActive sem default', m => { m.columns[3].COLUMN_DEFAULT = null; }],
    ['createdAt sem default', m => { m.columns[4].COLUMN_DEFAULT = null; }],
    ['updatedAt default arbitrário', m => { m.columns[5].COLUMN_DEFAULT = '2026-11-16'; }],
    ['createdAt on update não aprovado', m => { m.columns[4].EXTRA = 'on update CURRENT_TIMESTAMP'; }],
    ['createdAt gerada', m => { m.columns[4].EXTRA = 'STORED GENERATED'; }],
    ['updatedAt sem on update', m => { m.columns[5].EXTRA = 'DEFAULT_GENERATED'; }],
    ['updatedAt on update inválido', m => { m.columns[5].EXTRA = 'on update now()'; }],
  ];
  it.each(invalidColumns)('recusa %s', (_name, mutate) => {
    const meta = compatible(); mutate(meta);
    expect(() => validarMetadata(meta)).toThrow();
  });

  it.each(['id', 'userId', 'condominioId', 'isActive', 'createdAt', 'updatedAt'])('recusa campo nullable %s', name => {
    const meta = compatible();
    meta.columns.find(c => c.COLUMN_NAME === name)!.IS_NULLABLE = 'YES';
    expect(() => validarMetadata(meta)).toThrow();
  });

  const invalidIndexes: [string, (meta: Metadata) => void][] = [
    ['PRIMARY ausente', m => { m.indexes = m.indexes.filter(i => i.INDEX_NAME !== 'PRIMARY'); }],
    ['unicidade composta ausente', m => { m.indexes = m.indexes.filter(i => i.INDEX_NAME !== 'userCondominios_user_condominio_unique'); }],
    ['índice por usuário ausente', m => { m.indexes = m.indexes.filter(i => i.INDEX_NAME !== 'userCondominios_user_active_idx'); }],
    ['índice por condomínio ausente', m => { m.indexes = m.indexes.filter(i => i.INDEX_NAME !== 'userCondominios_condominio_active_idx'); }],
    ['índice extra', m => { m.indexes.push(...index('naoAprovado', 1, ['isActive'])); }],
    ['PRIMARY não único', m => { m.indexes[0].NON_UNIQUE = 1; }],
    ['PRIMARY em coluna errada', m => { m.indexes[0].COLUMN_NAME = 'userId'; }],
    ['unicidade composta perdida', m => { m.indexes.filter(i => i.INDEX_NAME === 'userCondominios_user_condominio_unique').forEach(i => { i.NON_UNIQUE = 1; }); }],
    ['ordem composta invertida', m => { [m.indexes[1].COLUMN_NAME, m.indexes[2].COLUMN_NAME] = [m.indexes[2].COLUMN_NAME, m.indexes[1].COLUMN_NAME]; }],
    ['índice por usuário indevidamente único', m => { m.indexes.filter(i => i.INDEX_NAME === 'userCondominios_user_active_idx').forEach(i => { i.NON_UNIQUE = 0; }); }],
    ['índice por condomínio indevidamente único', m => { m.indexes.filter(i => i.INDEX_NAME === 'userCondominios_condominio_active_idx').forEach(i => { i.NON_UNIQUE = 0; }); }],
    ['índice por usuário em coluna errada', m => { m.indexes[4].COLUMN_NAME = 'condominioId'; }],
    ['sequência fora do esperado', m => { m.indexes[2].SEQ_IN_INDEX = 3; }],
    ['sequência duplicada', m => { m.indexes[2].SEQ_IN_INDEX = 1; }],
    ['linha de índice duplicada', m => { m.indexes.push({ ...m.indexes[1] }); }],
  ];
  it.each(invalidIndexes)('recusa %s', (_name, mutate) => {
    const meta = compatible(); mutate(meta);
    expect(() => validarMetadata(meta)).toThrow();
  });

  it('usa erro estático, sem interpolar nomes/tipos/defaults de metadata', () => {
    const first = compatible();
    first.columns[1].COLUMN_TYPE = `varchar(${SECRET})`;
    const second = compatible();
    second.columns[1].COLUMN_TYPE = 'varchar(outro-valor-nao-confiavel)';
    const message = errorMessage(() => validarMetadata(first));
    expect(message).toBe(errorMessage(() => validarMetadata(second)));
    expect(message).not.toContain(SECRET);
    const names = compatible();
    names.tables[2].TABLE_NAME = SECRET;
    names.columns[1].COLUMN_NAME = SECRET;
    names.indexes[1].INDEX_NAME = SECRET;
    expect(errorMessage(() => validarMetadata(names))).not.toContain(SECRET);
  });
});

describe('executar — integração simulada, sem conexão real ou backfill', () => {
  it('check da tabela ausente faz somente as três leituras de metadata', async () => {
    const sim = simulation([absent()]);
    await expect(executar({ ...sim, apply: false })).resolves.toEqual({ status: 'ausente' });
    assertReadOnly(sim, 1);
    expect(sim.db.query).toHaveBeenCalledTimes(3);
    expect(sim.backup).not.toHaveBeenCalled();
    expect(sim.conferirEnv).not.toHaveBeenCalled();
  });

  it.each([false, true])('tabela já compatível é no-op com apply=%s, sem backup/DDL', async apply => {
    const sim = simulation([compatible()]);
    await expect(executar({ ...sim, apply })).resolves.toEqual({ status: 'ja_completa' });
    assertReadOnly(sim, 1);
    expect(sim.backup).not.toHaveBeenCalled();
    expect(sim.conferirEnv).not.toHaveBeenCalled();
  });

  it.each([false, true])('recusa divergência inicial antes de backup com apply=%s', async apply => {
    const meta = compatible(); meta.columns[1].COLUMN_TYPE = 'bigint';
    const sim = simulation([meta]);
    await expect(executar({ ...sim, apply })).rejects.toThrow();
    assertReadOnly(sim, 1);
    expect(sim.backup).not.toHaveBeenCalled();
    expect(sim.conferirEnv).not.toHaveBeenCalled();
  });

  it('apply segue metadata → env → backup → env → metadata nova → CREATE → metadata final → LIMIT 0', async () => {
    const sim = simulation([absent(), absent(), compatible()]);
    await expect(executar({ ...sim, apply: true })).resolves.toEqual({ status: 'criada', backup: BACKUP });
    expect(sim.backup).toHaveBeenCalledTimes(1);
    expect(sim.backup).toHaveBeenCalledWith(absent());
    expect(sim.conferirEnv.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sim.reads).toEqual({ tables: 3, columns: 3, indexes: 3 });
    expect(sim.db.query).toHaveBeenCalledTimes(11);
    expect(sim.events.slice(0, 3).sort()).toEqual(['metadata:columns', 'metadata:indexes', 'metadata:tables']);
    expect(sim.events.slice(3, 6)).toEqual(['env', 'backup', 'env']);
    expect(sim.events.slice(6, 9).sort()).toEqual(['metadata:columns', 'metadata:indexes', 'metadata:tables']);
    const afterFresh = sim.events.slice(9).filter(event => event !== 'env');
    expect(afterFresh[0]).toBe('create');
    expect(afterFresh.slice(1, 4).sort()).toEqual(['metadata:columns', 'metadata:indexes', 'metadata:tables']);
    expect(afterFresh[4]).toBe('probe');
    expect(afterFresh).toHaveLength(5);
    assertNoDataMutation(sim);
  });

  it('criação concorrente compatível após backup evita disputar CREATE', async () => {
    const sim = simulation([absent(), compatible()]);
    await expect(executar({ ...sim, apply: true })).resolves.toMatchObject({ status: 'ja_completa' });
    assertReadOnly(sim, 2);
    expect(sim.backup).toHaveBeenCalledTimes(1);
    expect(sim.conferirEnv).toHaveBeenCalledTimes(2);
    expect(sim.events.slice(3, 6)).toEqual(['env', 'backup', 'env']);
  });

  it('metadata nova incompatível após backup interrompe sem CREATE/ALTER', async () => {
    const fresh = compatible(); fresh.indexes = fresh.indexes.filter(i => i.INDEX_NAME !== 'userCondominios_user_active_idx');
    const sim = simulation([absent(), fresh]);
    await expect(executar({ ...sim, apply: true })).rejects.toThrow();
    assertReadOnly(sim, 2);
    expect(sim.backup).toHaveBeenCalledTimes(1);
  });

  it('falha do backup propaga e bloqueia nova metadata e DDL', async () => {
    const sim = simulation([absent()]);
    const error = new Error('Backup simulado falhou');
    sim.backup.mockImplementation(async () => { sim.events.push('backup'); throw error; });
    await expect(executar({ ...sim, apply: true })).rejects.toBe(error);
    assertReadOnly(sim, 1);
    expect(sim.events.slice(3)).toEqual(['env', 'backup']);
    expect(sim.conferirEnv).toHaveBeenCalledTimes(1);
  });

  it.each([1, 2])('falha da conferência env #%s propaga e nunca cria', async failedCall => {
    const sim = simulation([absent()]);
    const error = new Error('Identidade env simulada divergente');
    let calls = 0;
    sim.conferirEnv.mockImplementation(() => {
      sim.events.push('env');
      if (++calls === failedCall) throw error;
    });
    await expect(executar({ ...sim, apply: true })).rejects.toBe(error);
    assertReadOnly(sim, 1);
    expect(sim.backup).toHaveBeenCalledTimes(failedCall - 1);
    expect(sim.conferirEnv).toHaveBeenCalledTimes(failedCall);
  });

  it('erro de CREATE propaga sem retry, restauração ou remoção automática', async () => {
    const error = new Error(`DDL simulado falhou: ${SECRET}`);
    const sim = simulation([absent(), absent()], { ddlError: error });
    await expect(executar({ ...sim, apply: true })).rejects.toThrow('CREATE_FALHOU_CONFERIR_ESTRUTURA_ANTES_DE_REPETIR');
    expect(sim.reads).toEqual({ tables: 2, columns: 2, indexes: 2 });
    expect(sim.events.filter(event => event === 'create')).toHaveLength(1);
    expect(sim.events).not.toContain('probe');
    assertNoDataMutation(sim);
  });

  it('metadata divergente após CREATE propaga recusa sem anunciar criação válida', async () => {
    const post = compatible(); post.columns[5].EXTRA = '';
    const sim = simulation([absent(), absent(), post]);
    await expect(executar({ ...sim, apply: true })).rejects.toThrow();
    expect(sim.reads).toEqual({ tables: 3, columns: 3, indexes: 3 });
    expect(sim.events).not.toContain('probe');
    assertNoDataMutation(sim);
  });

  it('pósmetadata ainda ausente não deve retornar status criada', async () => {
    const sim = simulation([absent(), absent(), absent()]);
    await expect(executar({ ...sim, apply: true })).rejects.toThrow();
    assertNoDataMutation(sim);
  });

  it('falha da leitura estrutural LIMIT 0 propaga e não repete DDL', async () => {
    const error = new Error('Projeção estrutural simulada falhou');
    const sim = simulation([absent(), absent(), compatible()], { probeError: error });
    await expect(executar({ ...sim, apply: true })).rejects.toBe(error);
    expect(sim.events.filter(event => event === 'probe')).toHaveLength(1);
    assertNoDataMutation(sim);
  });

  it('segunda execução é idempotente, não reativa vínculos nem conta cadastros concorrentes', async () => {
    const first = simulation([absent(), absent(), compatible()]);
    await executar({ ...first, apply: true });
    const second = simulation([compatible()]);
    await executar({ ...second, apply: true });
    assertReadOnly(second, 1);
    expect(second.backup).not.toHaveBeenCalled();
    assertNoDataMutation(first);
    expect([...first.db.query.mock.calls, ...second.db.query.mock.calls].some(([sql]) => /\bCOUNT\s*\(|^\s*(INSERT|UPDATE|DELETE|ALTER)\b/i.test(sql))).toBe(false);
  });
});
