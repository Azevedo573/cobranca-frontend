#!/usr/bin/env node
'use strict';
// Exclusivamente CREATE TABLE/INDEX da migration0101; não executa expurgo, backfill ou DML.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const CONFIRMACAO='CONFIRMAR ESTRUTURA DIAGNOSTICO BTG';
const SHA256='df5105d612f7a09723a682b750a7b62e8503c43550f8e95f524b13833237e991';
const TABELA='btgHttpDiagnosticos';
const COLUNAS=[
 ['id','int','NO'],['chaveCaptura','varchar(36)','NO'],['ambiente',"enum('sandbox','producao')",'NO'],
 ['btgIntegracaoId','int','NO'],['btgCobrancaEmitidaId','int','NO'],['btgRemessaId','int','YES'],
 ['parcelaAcordoId','int','NO'],['condominioId','int','NO'],['usuarioId','int','NO'],
 ['operacao',"enum('emissao')",'NO'],['estadoCaptura',"enum('preparado','enviando','resposta_recebida','resposta_incompleta','sem_resposta')",'NO'],
 ['httpStatus','int','YES'],['correlationId','varchar(20)','NO'],['payloadCifrado','mediumtext','YES'],['respostaCifrada','mediumtext','YES'],
 ['payloadSha256','varchar(64)','NO'],['respostaSha256','varchar(64)','YES'],['payloadBytes','int','NO'],['respostaBytes','int','YES'],
 ['respostaCompleta','int','NO'],['versaoCriptografia','varchar(20)','NO'],['capturaCriadaEm','timestamp','NO'],
 ['respostaRecebidaEm','timestamp','YES'],['conteudoExpurgadoEm','timestamp','YES'],['updatedAt','timestamp','NO'],
];
const INDICES={
 PRIMARY:{unique:true,cols:['id']},
 btgHttpDiagnosticos_chave_unique:{unique:true,cols:['chaveCaptura']},
 btgHttpDiagnosticos_emissao_unique:{unique:true,cols:['btgCobrancaEmitidaId']},
 btgHttpDiagnosticos_remessa_idx:{unique:false,cols:['btgRemessaId','id']},
 btgHttpDiagnosticos_condominio_idx:{unique:false,cols:['condominioId','capturaCriadaEm']},
};
function comandos(sql){
 if(crypto.createHash('sha256').update(sql).digest('hex')!==SHA256)throw new Error('Migration diferente da revisada.');
 const result=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
 if(result.length!==3 || !result[0].startsWith('CREATE TABLE `btgHttpDiagnosticos` (') ||
  !result[1].startsWith('CREATE INDEX `btgHttpDiagnosticos_remessa_idx` ON `btgHttpDiagnosticos`') ||
  !result[2].startsWith('CREATE INDEX `btgHttpDiagnosticos_condominio_idx` ON `btgHttpDiagnosticos`'))throw new Error('DDL inesperada.');
 return result;
}
function planejar(colunas,indices){
 if(!colunas.length){if(indices.length)throw new Error('Estrutura inesperada.');return ['tabela','btgHttpDiagnosticos_remessa_idx','btgHttpDiagnosticos_condominio_idx'];}
 if(colunas.length!==COLUNAS.length)throw new Error('Estrutura parcial ou diferente; pare para revisão.');
 for(const [nome,tipo,nulo] of COLUNAS){
  const atual=colunas.find(c=>c.COLUMN_NAME===nome);
  if(!atual || String(atual.COLUMN_TYPE).toLowerCase().replace(/\s+/g,'')!==tipo || atual.IS_NULLABLE!==nulo)throw new Error('Tipo ou nulabilidade incompatível.');
  const esperado={operacao:'emissao',estadoCaptura:'preparado',respostaCompleta:'0',versaoCriptografia:'v1'}[nome];
  if(esperado!==undefined){if(String(atual.COLUMN_DEFAULT)!==esperado)throw new Error('Default incompatível.');}
  else if(['capturaCriadaEm','updatedAt'].includes(nome)){
   if(!['current_timestamp','current_timestamp()','now()','(now())'].includes(String(atual.COLUMN_DEFAULT).toLowerCase()))throw new Error('Default temporal incompatível.');
  }else if(atual.COLUMN_DEFAULT!=null)throw new Error('Default incompatível.');
  if(nome==='id' && !String(atual.EXTRA).toLowerCase().includes('auto_increment'))throw new Error('ID incompatível.');
 }
 const nomes=[...new Set(indices.map(i=>i.INDEX_NAME))];
 for(const nome of nomes){
  const esperado=INDICES[nome];if(!esperado)throw new Error('Índice inesperado.');
  const atual=indices.filter(i=>i.INDEX_NAME===nome).sort((a,b)=>Number(a.SEQ_IN_INDEX)-Number(b.SEQ_IN_INDEX));
  if(JSON.stringify(atual.map(i=>i.COLUMN_NAME))!==JSON.stringify(esperado.cols) || atual.some(i=>Number(i.NON_UNIQUE)!==(esperado.unique?0:1) || i.SUB_PART!=null))throw new Error('Índice incompatível.');
 }
 if(['PRIMARY','btgHttpDiagnosticos_chave_unique','btgHttpDiagnosticos_emissao_unique'].some(n=>!nomes.includes(n)))throw new Error('Constraint ausente; pare para revisão.');
 return ['btgHttpDiagnosticos_remessa_idx','btgHttpDiagnosticos_condominio_idx'].filter(n=>!nomes.includes(n));
}
async function conferir(db){
 const [cols]=await db.query('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[TABELA]);
 const [idx]=await db.query('SELECT INDEX_NAME,COLUMN_NAME,NON_UNIQUE,SEQ_IN_INDEX,SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[TABELA]);
 return planejar(cols,idx);
}
async function main(){
 const args=process.argv.slice(2),apply=args[0]==='--apply';
 if((!apply && (args.length!==1 || args[0]!=='--check')) || (apply && (args.length!==2 || args[1]!==CONFIRMACAO))){
  console.error(`Uso: node scripts/provisionar-btg-diagnosticos.cjs --check\nAplicar após backup: node scripts/provisionar-btg-diagnosticos.cjs --apply "${CONFIRMACAO}"`);process.exitCode=1;return;
 }
 const ddl=comandos(fs.readFileSync(path.join(__dirname,'../drizzle/0101_workable_ronan.sql'),'utf8'));
 require('dotenv').config({path:'.env',quiet:true});
 if(!process.env.DATABASE_URL)throw new Error('Configuração ausente.');
 const db=await require('mysql2/promise').createConnection(process.env.DATABASE_URL);
 try{
  const pending=await conferir(db);
  if(!pending.length){console.log('Estrutura de diagnóstico completo. Nenhuma alteração executada.');return;}
  console.log(`Estruturas pendentes: ${pending.join(', ')}`);
  if(!apply){console.log('Checagem somente leitura; nenhuma alteração.');return;}
  for(const nome of pending){await db.query(ddl[nome==='tabela'?0:nome==='btgHttpDiagnosticos_remessa_idx'?1:2]);console.log(`DDL aplicada: ${nome}`);}
  if((await conferir(db)).length)throw new Error('Estrutura permanece pendente.');
  console.log('Tabela/índices conferidos. Nenhum corpo, token, cobrança ou dado histórico alterado; nenhuma emissão enviada.');
 }finally{await db.end();}
}
module.exports={COLUNAS,INDICES,CONFIRMACAO,comandos,planejar};
if(require.main===module)main().catch(()=>{console.error('Falha de estrutura. Pare para revisão do backup/DDL: MySQL pode ter aplicado parte da estrutura. Nenhuma operação bancária realizada.');process.exitCode=1;});
