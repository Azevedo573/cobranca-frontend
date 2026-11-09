#!/usr/bin/env node
'use strict';
// Somente as duas tabelas/índices da migration0103. Sem DML, backfill ou API bancária.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const CONFIRMACAO = 'CONFIRMAR ESTRUTURA BOLETOS E CANCELAMENTO BTG';
const SHA256 = '85699521f75a81c9e5916186d01305e756f0a95965cbeea2e5cabf61f4993acc';
const TABELAS = {
  btgBoletoSnapshots: {
    ddl: 0,
    colunas: [
      ['id','int','NO'],['btgCobrancaEmitidaId','int','NO'],['btgIntegracaoId','int','NO'],
      ['parcelaAcordoId','int','NO'],['condominioId','int','NO'],['revisao','int','NO'],
      ['diagnosticoId','int','YES'],['usuarioId','int','NO'],['estado',"enum('completo','incompleto')",'NO'],
      ['dadosCifrados','mediumtext','YES'],['dadosSha256','varchar(64)','YES'],
      ['payloadSha256','varchar(64)','NO'],['criadoEm','timestamp','NO'],
    ],
    indices: {
      PRIMARY: { unique: true, cols: ['id'] },
      btgBoletoSnapshots_emissao_unique: { unique: true, cols: ['btgCobrancaEmitidaId'] },
      btgBoletoSnapshots_parcela_idx: { unique: false, cols: ['parcelaAcordoId','revisao'], ddl: 2 },
    },
  },
  btgCancelamentos: {
    ddl: 1,
    colunas: [
      ['id','int','NO'],['chaveOperacao','varchar(36)','NO'],['btgCobrancaEmitidaId','int','NO'],
      ['parcelaAcordoId','int','NO'],['btgIntegracaoId','int','NO'],['condominioId','int','NO'],
      ['usuarioId','int','NO'],['estado',"enum('preparada','solicitada','em_confirmacao','recusada','cancelada','conflito_pagamento')",'NO'],
      ['contextoHash','varchar(64)','NO'],['consultaCifrada','mediumtext','YES'],['motivoCifrado','text','YES'],
      ['criadaEm','timestamp','NO'],['expiraEm','timestamp','NO'],['solicitadaEm','timestamp','YES'],
      ['confirmadaEm','timestamp','YES'],['httpStatus','int','YES'],['codigo','varchar(80)','YES'],['updatedAt','timestamp','NO'],
    ],
    indices: {
      PRIMARY: { unique: true, cols: ['id'] },
      btgCancelamentos_chave_unique: { unique: true, cols: ['chaveOperacao'] },
      btgCancelamentos_emissao_idx: { unique: false, cols: ['btgCobrancaEmitidaId','id'], ddl: 3 },
    },
  },
};
function comandos(sql) {
  if (crypto.createHash('sha256').update(sql).digest('hex') !== SHA256) throw new Error('Migration diferente da revisada.');
  const result = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  const inicio = [
    'CREATE TABLE `btgBoletoSnapshots` (', 'CREATE TABLE `btgCancelamentos` (',
    'CREATE INDEX `btgBoletoSnapshots_parcela_idx` ON `btgBoletoSnapshots`',
    'CREATE INDEX `btgCancelamentos_emissao_idx` ON `btgCancelamentos`',
  ];
  if (result.length !== 4 || result.some((s,i) => !s.startsWith(inicio[i]))) throw new Error('DDL inesperada.');
  return result;
}
function planejar(tabela, colunas, indices) {
  const spec = TABELAS[tabela];
  if (!spec) throw new Error('Tabela inesperada.');
  const adicionais = Object.values(spec.indices).filter(i => i.ddl !== undefined).map(i => i.ddl);
  if (!colunas.length) {
    if (indices.length) throw new Error('Estrutura inesperada.');
    return [spec.ddl, ...adicionais];
  }
  if (colunas.length !== spec.colunas.length) throw new Error('Estrutura parcial ou diferente; pare para revisão.');
  for (const [nome,tipo,nulo] of spec.colunas) {
    const atual = colunas.find(c => c.COLUMN_NAME === nome);
    if (!atual || String(atual.COLUMN_TYPE).toLowerCase().replace(/\s+/g,'') !== tipo || atual.IS_NULLABLE !== nulo || atual.COLUMN_DEFAULT != null) throw new Error('Tipo, nulabilidade ou default incompatível.');
    const extra = String(atual.EXTRA || '').toLowerCase().trim();
    if (extra !== (nome === 'id' ? 'auto_increment' : '')) throw new Error('Definição de coluna incompatível.');
  }
  const nomes = Array.from(new Set(indices.map(i => i.INDEX_NAME)));
  for (const nome of nomes) {
    const esperado = spec.indices[nome];
    if (!esperado) throw new Error('Índice inesperado.');
    const atual = indices.filter(i => i.INDEX_NAME === nome).sort((a,b) => Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX));
    if (JSON.stringify(atual.map(i => i.COLUMN_NAME)) !== JSON.stringify(esperado.cols) || atual.some(i => Number(i.NON_UNIQUE) !== (esperado.unique ? 0 : 1) || i.SUB_PART != null || (i.INDEX_TYPE && i.INDEX_TYPE !== 'BTREE'))) throw new Error('Índice incompatível.');
  }
  if (Object.entries(spec.indices).some(([nome,i]) => i.ddl === undefined && !nomes.includes(nome))) throw new Error('Constraint ausente; pare para revisão.');
  return Object.entries(spec.indices).filter(([nome,i]) => i.ddl !== undefined && !nomes.includes(nome)).map(([,i]) => i.ddl);
}
async function conferir(db) {
  const result = [];
  for (const tabela of Object.keys(TABELAS)) {
    const [cols] = await db.query('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[tabela]);
    const [idx] = await db.query('SELECT INDEX_NAME,COLUMN_NAME,NON_UNIQUE,SEQ_IN_INDEX,SUB_PART,INDEX_TYPE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[tabela]);
    result.push(...planejar(tabela,cols,idx));
  }
  return result;
}
async function main() {
  const args = process.argv.slice(2), apply = args[0] === '--apply';
  if ((!apply && (args.length !== 1 || args[0] !== '--check')) || (apply && (args.length !== 2 || args[1] !== CONFIRMACAO))) {
    console.error(`Uso: node scripts/provisionar-btg-boletos-cancelamentos.cjs --check\nAplicar após backup: node scripts/provisionar-btg-boletos-cancelamentos.cjs --apply "${CONFIRMACAO}"`);
    process.exitCode = 1; return;
  }
  const ddl = comandos(fs.readFileSync(path.join(__dirname,'../drizzle/0103_modern_luke_cage.sql'),'utf8'));
  require('dotenv').config({ path: '.env', quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('Configuração ausente.');
  const db = await require('mysql2/promise').createConnection(process.env.DATABASE_URL);
  try {
    const pending = await conferir(db);
    if (!pending.length) { console.log('Estrutura0103 completa. Nenhuma alteração executada.'); return; }
    console.log(`DDL estruturais pendentes: ${pending.length}`);
    if (!apply) { console.log('Checagem somente leitura.'); return; }
    for (const index of pending) { await db.query(ddl[index]); console.log(`DDL aplicada: ${index}`); }
    if ((await conferir(db)).length) throw new Error('Estrutura permanece pendente.');
    console.log('Tabelas/índices verificados. Nenhum backfill, PDF, cancelamento, cobrança, token ou valor alterado.');
  } finally { await db.end(); }
}
module.exports = { CONFIRMACAO, SHA256, TABELAS, comandos, planejar };
if (require.main === module) main().catch(() => {
  console.error('Falha de estrutura. Pare para revisão de backup/DDL: MySQL pode ter aplicado parte da estrutura. Nenhuma operação bancária realizada.');
  process.exitCode = 1;
});
