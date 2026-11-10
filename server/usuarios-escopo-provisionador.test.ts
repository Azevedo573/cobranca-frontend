import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { comandos, planejar, DDL } = require('../scripts/provisionar-usuarios-escopo-condominios.cjs');
const coluna = (COLUMN_NAME: string, COLUMN_TYPE: string, IS_NULLABLE: string, COLUMN_DEFAULT: unknown = null, EXTRA = '') => ({ COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA });
const base = () => [coluna('id', 'int', 'NO', null, 'auto_increment'), coluna('condominioId','int','YES'), coluna('profileId','int','YES'), coluna('isActive','int','NO',1), coluna('isDeleted','int','NO',0), coluna('role',"enum('admin','sindico','cobrador','colaborador','advogado')",'NO','cobrador')];
const campo = () => coluna('escopoCondominios', "enum('selecionados','todos')", 'YES');
describe('provisionador seletivo de alcance', () => {
  it('aceita somente bytes da migration revisada, com uma única adição nullable', () => {
    const sql = readFileSync(new URL('../drizzle/0104_futuristic_sersi.sql', import.meta.url), 'utf8');
    expect(comandos(sql)).toEqual([DDL]); expect(sql).not.toMatch(/DROP|UPDATE|INSERT|DEFAULT/i);
  });
  it.each(['UPDATE users SET escopoCondominios=\'todos\';', DDL + '\n', DDL + ' DROP TABLE users;'])('recusa SQL adulterado', sql => expect(() => comandos(sql)).toThrow());
  it('planeja apenas a coluna ausente', () => expect(planejar(base())).toEqual([0]));
  it.each([null,'NULL'])('idempotente com default SQL nulo %s', value => {
    const alvo = campo(); alvo.COLUMN_DEFAULT = value;
    expect(planejar([...base(), alvo])).toEqual([]);
  });
  it.each(['todos','selecionados'])('recusa default não nulo %s', value => {
    const alvo = campo(); alvo.COLUMN_DEFAULT = value;
    expect(() => planejar([...base(),alvo])).toThrow(/incompatível/i);
  });
  it('recusa nulabilidade obrigatória', () => {
    const alvo = campo(); alvo.IS_NULLABLE = 'NO'; expect(() => planejar([...base(),alvo])).toThrow();
  });
  it('recusa enum ou extras incompatíveis', () => {
    const alvo = campo(); alvo.COLUMN_TYPE = 'varchar(20)'; expect(() => planejar([...base(),alvo])).toThrow();
    alvo.COLUMN_TYPE = campo().COLUMN_TYPE; alvo.EXTRA = 'GENERATED'; expect(() => planejar([...base(),alvo])).toThrow();
  });
  it('recusa tabela/base/role ausentes sem criar estrutura não aprovada', () => {
    expect(() => planejar([])).toThrow(); expect(() => planejar(base().filter(c => c.COLUMN_NAME !== 'id'))).toThrow();
    expect(() => planejar(base().filter(c => c.COLUMN_NAME !== 'role'))).toThrow();
  });
  it('aceita largura int MySQL sem modificar a base', () => {
    const cols=base().map(c=>c.COLUMN_TYPE==='int'?{...c,COLUMN_TYPE:'int(11)'}:c);
    expect(planejar(cols)).toEqual([0]); expect(cols.some(c=>c.COLUMN_NAME==='escopoCondominios')).toBe(false);
  });
});
