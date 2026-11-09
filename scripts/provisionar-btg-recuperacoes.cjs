#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const CONFIRMACAO='CONFIRMAR ESTRUTURA RECUPERACAO BTG';
const SHA='0faf0dc3bfa522392403154a304134c7695d9b98b4f762f18c5117799648fd02';
const COLUNAS=[['id','int','NO'],['chaveAnalise','varchar(36)','NO'],['btgIntegracaoId','int','NO'],['emissaoAnteriorId','int','NO'],['novaEmissaoId','int','YES'],['parcelaAcordoId','int','NO'],['btgRemessaId','int','YES'],['condominioId','int','NO'],['usuarioId','int','NO'],['diagnosticoId','int','YES'],['acao',"enum('bloqueada','reenviar','recuperar_vinculo')",'NO'],['codigo','varchar(80)','NO'],['estado',"enum('analisada','consumida')",'NO'],['contextoHash','varchar(64)','NO'],['provaHash','varchar(64)','NO'],['consultaHash','varchar(64)','NO'],['consultaCompleta','int','NO'],['consultaCifrada','mediumtext','NO'],['criadaEm','timestamp','NO'],['expiraEm','timestamp','NO'],['consumidaEm','timestamp','YES']];
const INDICES={PRIMARY:{unique:1,cols:['id']},btgRecuperacoes_chave_unique:{unique:1,cols:['chaveAnalise']},btgRecuperacoes_nova_emissao_unique:{unique:1,cols:['novaEmissaoId']},btgRecuperacoes_anterior_idx:{unique:0,cols:['emissaoAnteriorId','estado']},btgRecuperacoes_parcela_idx:{unique:0,cols:['parcelaAcordoId','id']}};
function comandos(sql){
 if(crypto.createHash('sha256').update(sql).digest('hex')!==SHA)throw new Error('SQL diferente da revisão.');
 const cmds=sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
 if(cmds.length!==4 || !cmds[0].startsWith('CREATE TABLE `btgRecuperacoes` (') || cmds[1]!=='ALTER TABLE `btgCobrancasEmitidas` ADD `falhaAntesEnvioEm` timestamp;' || !cmds[2].startsWith('CREATE INDEX `btgRecuperacoes_anterior_idx` ON `btgRecuperacoes`') || !cmds[3].startsWith('CREATE INDEX `btgRecuperacoes_parcela_idx` ON `btgRecuperacoes`'))throw new Error('DDL inesperada.');
 return cmds;
}
function planejar(cols,idx,prova,emissaoExiste){
 if(!emissaoExiste)throw new Error('Tabela de emissão ausente; inventarie as migrations anteriores.');
 const pending=[];
 if(prova.length>1)throw new Error('Coluna de prova inesperada.');
 if(prova.length){const c=prova[0];if(String(c.COLUMN_TYPE).toLowerCase()!=='timestamp' || c.IS_NULLABLE!=='YES' || c.COLUMN_DEFAULT!==null || String(c.EXTRA||''))throw new Error('Prova local incompatível.');}
 else pending.push('prova');
 if(!cols.length){if(idx.length)throw new Error('Estrutura parcial.');return ['tabela',...pending,'anterior','parcela'];}
 if(cols.length!==COLUNAS.length)throw new Error('Estrutura parcial ou diferente.');
 for(const [nome,tipo,nulo] of COLUNAS){const c=cols.find(c=>c.COLUMN_NAME===nome);if(!c || String(c.COLUMN_TYPE).toLowerCase().replace(/\s+/g,'')!==tipo || c.IS_NULLABLE!==nulo)throw new Error('Tipo ou nulabilidade diferente.');
 const padrao=nome==='estado'?'analisada':nome==='consultaCompleta'?'0':null;
 if(padrao===null?c.COLUMN_DEFAULT!==null:String(c.COLUMN_DEFAULT)!==padrao)throw new Error('Default incompatível.');
 if(nome==='id'&&!String(c.EXTRA).includes('auto_increment'))throw new Error('ID incompatível.');}
 const nomes=[...new Set(idx.map(i=>i.INDEX_NAME))];
 for(const nome of nomes){const esperado=INDICES[nome];if(!esperado)throw new Error('Índice inesperado.');const rows=idx.filter(i=>i.INDEX_NAME===nome).sort((a,b)=>a.SEQ_IN_INDEX-b.SEQ_IN_INDEX);if(JSON.stringify(rows.map(i=>i.COLUMN_NAME))!==JSON.stringify(esperado.cols)||rows.some(i=>Number(i.NON_UNIQUE)!==(esperado.unique?0:1)||i.SUB_PART!==null))throw new Error('Índice incompatível.');}
 if(['PRIMARY','btgRecuperacoes_chave_unique','btgRecuperacoes_nova_emissao_unique'].some(n=>!nomes.includes(n)))throw new Error('Constraint ausente.');
 if(!nomes.includes('btgRecuperacoes_anterior_idx'))pending.push('anterior');if(!nomes.includes('btgRecuperacoes_parcela_idx'))pending.push('parcela');return pending;
}
async function conferir(db){
 const [cols]=await db.query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='btgRecuperacoes'");
 const [idx]=await db.query("SELECT INDEX_NAME,COLUMN_NAME,NON_UNIQUE,SEQ_IN_INDEX,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='btgRecuperacoes'");
 const [prova]=await db.query("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='btgCobrancasEmitidas' AND COLUMN_NAME='falhaAntesEnvioEm'");
 const [tables]=await db.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='btgCobrancasEmitidas'");
 return planejar(cols,idx,prova,tables.length===1);
}
async function main(){
 const args=process.argv.slice(2),apply=args[0]==='--apply';
 if(!((!apply&&args.length===1&&args[0]==='--check')||(apply&&args.length===2&&args[1]===CONFIRMACAO))){console.error(`Uso: node scripts/provisionar-btg-recuperacoes.cjs --check\nApós backup: --apply "${CONFIRMACAO}"`);process.exitCode=1;return;}
 const ddl=comandos(fs.readFileSync(path.join(__dirname,'../drizzle/0102_ancient_arclight.sql'),'utf8'));
 require('dotenv').config({path:'.env',quiet:true});if(!process.env.DATABASE_URL)throw new Error('Configuração ausente.');
 const db=await require('mysql2/promise').createConnection(process.env.DATABASE_URL);
 try{const pending=await conferir(db);if(!pending.length){console.log('Estrutura0102 completa. Nenhuma alteração executada.');return;}
 console.log(`Estruturas pendentes: ${pending.join(', ')}`);if(!apply){console.log('Checagem somente leitura.');return;}
 for(const p of pending){await db.query(ddl[{tabela:0,prova:1,anterior:2,parcela:3}[p]]);console.log(`DDL aplicada: ${p}`);}
 if((await conferir(db)).length)throw new Error('Estrutura pendente.');console.log('Estrutura verificada. Nenhum backfill, recuperação, reenvio, token, número ou valor alterado.');}finally{await db.end();}
}
module.exports={COLUNAS,INDICES,CONFIRMACAO,comandos,planejar};
if(require.main===module)main().catch(()=>{console.error('Falha estrutural. Pare para revisar backup e DDL; MySQL pode ter aplicado parte da estrutura. Nenhuma operação bancária executada.');process.exitCode=1;});
