#!/usr/bin/env node
'use strict';
// Somente users.escopoCondominios nullable; sem DML, backfill ou concessão de acesso.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CONFIRMACAO = 'CONFIRMAR CAMPO ESCOPO CONDOMINIOS';
const SHA256 = '31387fa9e6902617bc13d4b86786294cfa5b4cf28fb06cf62221a9d86d82dd82';
const DDL = "ALTER TABLE `users` ADD `escopoCondominios` enum('selecionados','todos');";
function comandos(sql) {
  if (crypto.createHash('sha256').update(sql).digest('hex') !== SHA256 || sql.trim() !== DDL) {
    throw new Error('Migration diferente da revisada; nenhuma alteração permitida.');
  }
  return [DDL];
}
function normalizarTipo(tipo) { return String(tipo).toLowerCase().replace(/\s/g, ''); }
function defaultNull(value) { return value == null || String(value).toUpperCase() === 'NULL'; }
function planejar(colunas) {
  if (!Array.isArray(colunas) || colunas.length === 0) throw new Error('Tabela users ausente; pare para revisão.');
  const obrigatorias = [
    ['id', false], ['condominioId', true], ['profileId', true], ['isActive', false], ['isDeleted', false],
  ];
  for (const [nome, nullable] of obrigatorias) {
    const coluna = colunas.find(c => c.COLUMN_NAME === nome);
    if (!coluna || !/^int(?:\(\d+\))?$/.test(normalizarTipo(coluna.COLUMN_TYPE)) || coluna.IS_NULLABLE !== (nullable ? 'YES' : 'NO')) {
      throw new Error('Estrutura base de users incompatível; nenhuma alteração.');
    }
  }
  const role = colunas.find(c => c.COLUMN_NAME === 'role');
  if (!role || normalizarTipo(role.COLUMN_TYPE) !== "enum('admin','sindico','cobrador','colaborador','advogado')" || role.IS_NULLABLE !== 'NO') {
    throw new Error('Perfis de users incompatíveis; nenhuma alteração.');
  }
  const alvo = colunas.filter(c => c.COLUMN_NAME === 'escopoCondominios');
  if (!alvo.length) return [0];
  if (alvo.length !== 1 || normalizarTipo(alvo[0].COLUMN_TYPE) !== "enum('selecionados','todos')" || alvo[0].IS_NULLABLE !== 'YES' || !defaultNull(alvo[0].COLUMN_DEFAULT) || String(alvo[0].EXTRA ?? '').trim() !== '') {
    throw new Error('Campo escopoCondominios já existe com definição incompatível; nenhuma alteração.');
  }
  return [];
}
async function conferir(db) {
  const [colunas] = await db.query('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', ['users']);
  return planejar(colunas);
}
async function main() {
  const args = process.argv.slice(2);
  const apply = args[0] === '--apply';
  if ((!apply && (args.length !== 1 || args[0] !== '--check')) || (apply && (args.length !== 2 || args[1] !== CONFIRMACAO))) {
    console.error(`Uso: node scripts/provisionar-usuarios-escopo-condominios.cjs --check\nAplicar somente após autorização: node scripts/provisionar-usuarios-escopo-condominios.cjs --apply "${CONFIRMACAO}"`);
    process.exitCode = 1; return;
  }
  const ddl = comandos(fs.readFileSync(path.join(__dirname, '../drizzle/0104_futuristic_sersi.sql'), 'utf8'));
  require('dotenv').config({ path: '.env', quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('Configuração de banco ausente.');
  const db = await require('mysql2/promise').createConnection(process.env.DATABASE_URL);
  try {
    const pendentes = await conferir(db);
    if (!pendentes.length) { console.log('Campo de escopo já completo; nenhuma alteração executada.'); return; }
    console.log('Campo users.escopoCondominios pendente.');
    if (!apply) { console.log('Checagem somente leitura; nenhuma permissão alterada.'); return; }
    await db.query(ddl[0]);
    if ((await conferir(db)).length) throw new Error('Campo permanece pendente.');
    console.log('Campo nullable conferido; usuários existentes permanecem legados. Nenhum backfill, vínculo, concessão, título ou valor alterado.');
  } finally { await db.end(); }
}
module.exports = { CONFIRMACAO, SHA256, DDL, comandos, planejar };
if (require.main === module) main().catch(() => {
  console.error('Falha na conferência de estrutura. Pare para revisão: MySQL pode ter aplicado o DDL. Nenhuma concessão ou operação financeira executada.');
  process.exitCode = 1;
});
