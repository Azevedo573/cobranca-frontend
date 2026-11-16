#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const CONFIRMACAO = 'CONFIRMAR SOMENTE ESTRUTURA USER CONDOMINIOS';
const CREATE_SQL = `CREATE TABLE \`userCondominios\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`userId\` int NOT NULL,
  \`condominioId\` int NOT NULL,
  \`isActive\` int NOT NULL DEFAULT 1,
  \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`userCondominios_user_condominio_unique\` (\`userId\`,\`condominioId\`),
  KEY \`userCondominios_user_active_idx\` (\`userId\`,\`isActive\`),
  KEY \`userCondominios_condominio_active_idx\` (\`condominioId\`,\`isActive\`)
) ENGINE=InnoDB`;
const erro = codigo => { const e = new Error(codigo); e.reparoCodigo = codigo; return e; };
const normalizar = value => String(value ?? '').toLowerCase().replace(/\s/g, '');
const nulo = value => value == null || String(value).toUpperCase() === 'NULL';
const timestamp = value => ['current_timestamp','current_timestamp()','(current_timestamp())','now()','(now())'].includes(normalizar(value));

function validarMetadata(meta) {
  if (!meta || !Array.isArray(meta.tables) || !Array.isArray(meta.columns) || !Array.isArray(meta.indexes)) throw erro('METADATA_INCOMPATIVEL');
  for (const name of ['users','auditLogs']) {
    const rows = meta.tables.filter(t => t.TABLE_NAME === name);
    if (rows.length !== 1 || rows[0].TABLE_TYPE !== 'BASE TABLE' || normalizar(rows[0].ENGINE) !== 'innodb') throw erro('BASE_NAO_TRANSACIONAL_OU_AUSENTE');
  }
  const target = meta.tables.filter(t => normalizar(t.TABLE_NAME) === 'usercondominios');
  if (!target.length) {
    if (meta.columns.length || meta.indexes.length) throw erro('METADATA_INCOMPATIVEL');
    return 'ausente';
  }
  if (target.length !== 1 || target[0].TABLE_NAME !== 'userCondominios' || target[0].TABLE_TYPE !== 'BASE TABLE' || normalizar(target[0].ENGINE) !== 'innodb' || meta.columns.length !== 6) throw erro('ESTRUTURA_INCOMPATIVEL');
  for (const name of ['id','userId','condominioId','isActive','createdAt','updatedAt']) {
    const cols = meta.columns.filter(c => c.COLUMN_NAME === name);
    if (cols.length !== 1 || cols[0].IS_NULLABLE !== 'NO') throw erro('COLUNA_INCOMPATIVEL');
    const c = cols[0], type = normalizar(c.COLUMN_TYPE), rawExtra = normalizar(c.EXTRA);
    const extra = ['createdAt','updatedAt'].includes(name) ? rawExtra.replace(/default_generated/g, '') : rawExtra;
    if (['id','userId','condominioId','isActive'].includes(name)) {
      if (!/^int(?:\(\d+\))?$/.test(type) || extra !== (name === 'id' ? 'auto_increment' : '')) throw erro('COLUNA_INCOMPATIVEL');
      if (name === 'isActive' ? !['1',"'1'",'"1"'].includes(String(c.COLUMN_DEFAULT)) : !nulo(c.COLUMN_DEFAULT)) throw erro('DEFAULT_INCOMPATIVEL');
    } else {
      if (type !== 'timestamp' || !timestamp(c.COLUMN_DEFAULT)) throw erro('COLUNA_INCOMPATIVEL');
      if (name === 'createdAt' ? extra !== '' : !['onupdatecurrent_timestamp','onupdatecurrent_timestamp()'].includes(extra)) throw erro('COLUNA_INCOMPATIVEL');
    }
  }
  const expected = {
    PRIMARY: { unique: 0, cols: ['id'] },
    userCondominios_user_condominio_unique: { unique: 0, cols: ['userId','condominioId'] },
    userCondominios_user_active_idx: { unique: 1, cols: ['userId','isActive'] },
    userCondominios_condominio_active_idx: { unique: 1, cols: ['condominioId','isActive'] },
  };
  if (new Set(meta.indexes.map(i => i.INDEX_NAME)).size !== 4) throw erro('INDICES_INCOMPATIVEIS');
  for (const [name, e] of Object.entries(expected)) {
    const rows = meta.indexes.filter(i => i.INDEX_NAME === name).sort((a,b) => Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX));
    if (rows.length !== e.cols.length || rows.some((r,i) => Number(r.NON_UNIQUE) !== e.unique || Number(r.SEQ_IN_INDEX) !== i+1 || r.COLUMN_NAME !== e.cols[i])) throw erro('INDICES_INCOMPATIVEIS');
  }
  return 'compativel';
}
async function lerMetadata(db) {
  const [tables] = await db.query('SELECT TABLE_NAME,TABLE_TYPE,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?,?,?)', ['users','auditLogs','userCondominios']);
  const [columns] = await db.query('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', ['userCondominios']);
  const [indexes] = await db.query('SELECT INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY INDEX_NAME,SEQ_IN_INDEX', ['userCondominios']);
  return { tables, columns, indexes };
}
async function executar({ db, apply, backup, conferirEnv }) {
  const metadata = await lerMetadata(db);
  const plano = validarMetadata(metadata);
  if (plano === 'compativel') return { status: 'ja_completa' };
  if (!apply) return { status: 'ausente' };
  conferirEnv();
  const backupPath = await backup(metadata);
  conferirEnv();
  const antes = validarMetadata(await lerMetadata(db));
  if (antes === 'compativel') return { status: 'ja_completa', backup: backupPath };
  conferirEnv();
  try { await db.query(CREATE_SQL); }
  catch { throw erro('CREATE_FALHOU_CONFERIR_ESTRUTURA_ANTES_DE_REPETIR'); }
  if (validarMetadata(await lerMetadata(db)) !== 'compativel') throw erro('CONFERENCIA_APOS_CREATE_FALHOU');
  await db.query('SELECT userId,condominioId,isActive FROM userCondominios LIMIT 0');
  conferirEnv();
  return { status: 'criada', backup: backupPath };
}
function configBanco(url) {
  try {
    const u = new URL(url), name = decodeURIComponent(u.pathname.slice(1));
    const conf = { host:decodeURIComponent(u.hostname.replace(/^\[|\]$/g,'')), port:u.port||'3306', user:decodeURIComponent(u.username), password:decodeURIComponent(u.password) };
    if (u.protocol !== 'mysql:' || !/^[A-Za-z0-9_]+$/.test(name) || !conf.host || !conf.user || Object.values(conf).some(v => /[\x00\r\n]/.test(v)) || u.search || u.hash) throw erro('CONFIGURACAO_INCOMPATIVEL');
    return { name, conf };
  } catch { throw erro('CONFIGURACAO_INCOMPATIVEL'); }
}
function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function backupBanco({ config, metadata, conferirEnv, onPath, run = spawnSync }) {
  const base = '/var/backups/cobranca';
  fs.mkdirSync(base, { recursive:true, mode:0o700 });
  if (!fs.lstatSync(base).isDirectory() || fs.lstatSync(base).isSymbolicLink() || fs.realpathSync(base) !== base) throw erro('DIRETORIO_BACKUP_INCOMPATIVEL');
  const baseStat = fs.lstatSync(base);
  if (baseStat.uid !== 0 || (baseStat.mode & 0o022) !== 0) throw erro('DIRETORIO_BACKUP_INCOMPATIVEL');
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  const dir = fs.mkdtempSync(path.join(base, `user-condominios-${stamp}-`));
  fs.chmodSync(dir,0o700); onPath(dir);
  const cnf = path.join(dir,'mysql-client.cnf'), dump = path.join(dir,'banco.sql');
  const opts = '[client]\nprotocol=TCP\n'+Object.entries(config.conf).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n')+'\n';
  let output, errors;
  try {
    fs.writeFileSync(cnf,opts,{ mode:0o600, flag:'wx' });
    fs.writeFileSync(path.join(dir,'estrutura-anterior.json'),JSON.stringify(metadata,null,2)+'\n',{ mode:0o600, flag:'wx' });
    conferirEnv();
    output = fs.openSync(dump,'wx',0o600);
    errors = fs.openSync(path.join(dir,'mysqldump-erro.log'),'wx',0o600);
    const env = { ...process.env }; delete env.MYSQL_PWD;
    env.MYSQL_TEST_LOGIN_FILE = path.join(dir,'login-path-inexistente');
    env.HOME = dir;
    const result = run('mysqldump',[`--defaults-file=${cnf}`,'--single-transaction','--quick','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--routines','--events','--triggers','--databases',config.name],{ stdio:['ignore',output,errors], timeout:600000, env });
    if (result.error || result.status !== 0 || result.signal) throw erro('BACKUP_FALHOU');
    fs.closeSync(output); output = undefined;
    if (!fs.statSync(dump).size) throw erro('BACKUP_VAZIO');
    const fd = fs.openSync(dump,'r');
    let tail;
    try { const size = fs.fstatSync(fd).size; tail = Buffer.alloc(Math.min(size,16384)); fs.readSync(fd,tail,0,tail.length,size-tail.length); }
    finally { fs.closeSync(fd); }
    if (!/-- Dump completed on [^\r\n]+\r?\n?$/.test(tail.toString('utf8'))) throw erro('BACKUP_SEM_CONCLUSAO');
    const sqlBackup = fs.readFileSync(dump,'utf8');
    if (!/^CREATE TABLE `users` \(/m.test(sqlBackup) || !/^CREATE TABLE `auditLogs` \(/m.test(sqlBackup)) throw erro('BACKUP_SEM_ESTRUTURAS_BASE');
    const files = ['banco.sql','estrutura-anterior.json'];
    const sums = Object.fromEntries(files.map(file => [file,hash(path.join(dir,file))]));
    fs.writeFileSync(path.join(dir,'SHA256SUMS'),files.map(file => `${sums[file]}  ${file}`).join('\n')+'\n',{ mode:0o600, flag:'wx' });
    for (const file of files) if (hash(path.join(dir,file)) !== sums[file]) throw erro('BACKUP_HASH_INCOMPATIVEL');
    conferirEnv();
    return dir;
  } finally {
    if (output !== undefined) fs.closeSync(output);
    if (errors !== undefined) fs.closeSync(errors);
    if (fs.existsSync(cnf)) fs.unlinkSync(cnf);
  }
}
async function main() {
  const args = process.argv.slice(2), apply = args[0] === '--apply';
  if ((!apply && (args.length !== 1 || args[0] !== '--check')) || (apply && (args.length !== 2 || args[1] !== CONFIRMACAO))) throw erro('ARGUMENTOS_INVALIDOS');
  if (process.getuid() !== 0 || fs.realpathSync(process.cwd()) !== '/var/www/cobranca') throw erro('EXECUTAR_COMO_ROOT_NA_VPS');
  const stat = fs.lstatSync('.env');
  if (!stat.isFile() || stat.isSymbolicLink()) throw erro('CONFIGURACAO_INCOMPATIVEL');
  const original = hash('.env');
  const conferirEnv = () => {
    const s = fs.lstatSync('.env');
    if (!s.isFile() || s.isSymbolicLink() || hash('.env') !== original) throw erro('CONFIGURACAO_MUDOU_PARE_PARA_REVISAO');
  };
  const load = createRequire(path.join(process.cwd(),'package.json'));
  const e = load('dotenv').parse(fs.readFileSync('.env','utf8'));
  const config = configBanco(e.DATABASE_URL || '');
  const mysql = load('mysql2/promise');
  let backupPath;
  const db = await mysql.createConnection({ ...config.conf, port:Number(config.conf.port), database:config.name, connectTimeout:10000 });
  const originalQuery = db.query.bind(db);
  db.query = (sql, values) => originalQuery({ sql, timeout:20000 }, values);
  try {
    await db.query('SET SESSION lock_wait_timeout=15');
    const result = await executar({ db, apply, conferirEnv, backup:metadata => backupBanco({ config, metadata, conferirEnv, onPath:dir => { backupPath=dir; console.log(`Backup privado: ${dir}`); } }) });
    console.log(result.status === 'ausente' ? 'Tabela ausente; checagem somente leitura, sem CREATE.' : result.status === 'criada' ? '\n=== ESTRUTURA CRIADA E CONFERIDA ===' : '\n=== ESTRUTURA JA COMPLETA ===');
    if (result.status !== 'ausente') console.log('userCondominios: seis campos, chave primaria, unicidade e dois indices; InnoDB.');
    if (result.backup) console.log(`Backup: ${result.backup}`);
    console.log('Sem preenchimento de vinculos, reativacao de acessos, alteracao de usuarios, deploy, reinicio ou operacao BTG.');
    console.log('O cadastro real e as carteiras antigas ainda precisam de conferencia separada.');
  } catch (error) {
    if (backupPath) console.log(`Backup preservado: ${backupPath}`);
    throw error;
  } finally { await db.end(); }
}
module.exports = { CONFIRMACAO, CREATE_SQL, validarMetadata, lerMetadata, executar, configBanco, backupBanco };
if (require.main === module) main().catch(error => {
  const codigo = typeof error?.reparoCodigo === 'string' && /^[A-Z0-9_]{1,100}$/.test(error.reparoCodigo) ? error.reparoCodigo : 'FALHA_PROTEGIDA_DE_ESTRUTURA_OU_CONEXAO';
  console.error(`ERRO: ${codigo}. Pare e envie somente esta mensagem e o caminho de backup. Nao repita cegamente: o CREATE pode ter sido aplicado.`);
  process.exitCode=1;
});
