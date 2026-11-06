#!/usr/bin/env node
'use strict';

// Estrutura exclusiva da migration 0100; não executa backfill, migrations históricas ou operações financeiras.
const COLUNAS = [
  { nome: 'nossoNumeroOrigem', tipo: "enum('reserva_local','legado')" },
  { nome: 'canalBancario', tipo: "enum('api_btg_v2','cnab240','legado')" },
];
const DDL = Object.fromEntries(COLUNAS.map(c => [c.nome, `ALTER TABLE \`parcelasAcordo\` ADD COLUMN \`${c.nome}\` ${c.tipo} NULL;`]));
const CONFIRMACAO = 'CONFIRMAR ESTRUTURA CANAIS BTG';
function planejarColunas(rows) {
  if (!rows.some(row => row.COLUMN_NAME === 'id') || !rows.some(row => row.COLUMN_NAME === 'nossoNumero')) {
    throw new Error('Tabela parcelasAcordo ausente ou estrutura de base inesperada.');
  }
  const pendentes = [];
  for (const c of COLUNAS) {
    const atual = rows.find(row => row.COLUMN_NAME === c.nome);
    if (!atual) { pendentes.push(c.nome); continue; }
    const tipo = String(atual.COLUMN_TYPE).toLowerCase().replace(/\s+/g, '');
    if (tipo !== c.tipo || atual.IS_NULLABLE !== 'YES' || atual.COLUMN_DEFAULT != null) {
      throw new Error(`Coluna ${c.nome} possui estrutura incompatível; pare para revisão.`);
    }
  }
  return pendentes;
}
async function conferir(db) {
  const [rows] = await db.query('SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', ['parcelasAcordo']);
  return planejarColunas(rows);
}
async function main() {
  const args = process.argv.slice(2);
  const apply = args[0] === '--apply';
  if ((!apply && (args.length !== 1 || args[0] !== '--check')) || (apply && (args.length !== 2 || args[1] !== CONFIRMACAO))) {
    console.error(`Uso: node scripts/provisionar-btg-canais.cjs --check\nAplicar após backup: node scripts/provisionar-btg-canais.cjs --apply "${CONFIRMACAO}"`);
    process.exitCode = 1;
    return;
  }
  require('dotenv').config({ path: '.env', quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
  const db = await require('mysql2/promise').createConnection(process.env.DATABASE_URL);
  try {
    const pendentes = await conferir(db);
    if (!pendentes.length) { console.log('Estrutura de origem/canal completa. Nenhuma alteração executada.'); return; }
    console.log(`Colunas estruturais pendentes: ${pendentes.join(', ')}`);
    if (!apply) { console.log('Checagem somente leitura. Nenhuma alteração executada.'); return; }
    for (const nome of pendentes) {
      await db.query(DDL[nome]);
      console.log(`DDL aplicada: ${nome}`);
    }
    if ((await conferir(db)).length) throw new Error('Estrutura permanece pendente após DDL.');
    console.log('Estrutura verificada. Números, valores, canais históricos, contas e títulos não foram alterados.');
  } finally { await db.end(); }
}
module.exports = { COLUNAS, DDL, CONFIRMACAO, planejarColunas };
if (require.main === module) main().catch(() => {
  // Não imprimir error.message/stack/connection strings: drivers podem incluir dados de conexão.
  console.error('Falha na verificação/aplicação. Nenhum envio bancário foi realizado. Confira estrutura e backup antes de prosseguir; DDL MySQL pode ter aplicado parte das colunas.');
  process.exitCode = 1;
});
