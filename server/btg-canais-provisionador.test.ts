import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { planejarColunas, COLUNAS, DDL, CONFIRMACAO } = require('../scripts/provisionar-btg-canais.cjs');
const base = [{ COLUMN_NAME: 'id', COLUMN_TYPE: 'int', IS_NULLABLE: 'NO' }, { COLUMN_NAME: 'nossoNumero', COLUMN_TYPE: 'varchar(30)', IS_NULLABLE: 'YES' }];
const completas = COLUNAS.map((c: any) => ({ COLUMN_NAME: c.nome, COLUMN_TYPE: c.tipo, IS_NULLABLE: 'YES', COLUMN_DEFAULT: null }));
describe('provisionador seletivo de canais bancários', () => {
  it('estrutura antiga requer exatamente os dois ADD COLUMN', () => {
    expect(planejarColunas(base)).toHaveLength(2);
    expect(Object.values(DDL).every(sql => /^ALTER TABLE `parcelasAcordo` ADD COLUMN /i.test(sql as string))).toBe(true);
    expect(Object.values(DDL).join(' ')).not.toMatch(/\b(?:DROP|DELETE|INSERT|UPDATE|MODIFY)\b/i);
  });
  it('estrutura completa é idempotente', () => expect(planejarColunas([...base, ...completas])).toEqual([]));
  it('aplicação parcial conhecida só requer o ADD que falta', () => expect(planejarColunas([...base, completas[0]])).toHaveLength(1));
  it('recusa tabela ausente ou tipo incompatível', () => {
    expect(() => planejarColunas([])).toThrow();
    expect(() => planejarColunas([...base, { ...completas[0], COLUMN_TYPE: 'varchar(50)' }])).toThrow();
  });
  it('recusa coluna non-null ou default de canal implícito', () => {
    expect(() => planejarColunas([...base, { ...completas[0], IS_NULLABLE: 'NO' }])).toThrow();
    expect(() => planejarColunas([...base, { ...completas[1], COLUMN_DEFAULT: 'cnab240' }])).toThrow();
  });
  it('confirmação de DDL é distinta da confirmação de parcela', () => expect(CONFIRMACAO).toBe('CONFIRMAR ESTRUTURA CANAIS BTG'));
  it('CLI sem confirmação recusa antes de qualquer conexão ao banco', () => {
    const script = fileURLToPath(new URL('../scripts/provisionar-btg-canais.cjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, '--apply'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Uso:');
    expect(result.stdout).toBe('');
  });
});
