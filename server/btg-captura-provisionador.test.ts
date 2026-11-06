import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
const require=createRequire(import.meta.url);
const p=require('../scripts/provisionar-btg-diagnosticos.cjs');
function rows(){return p.COLUNAS.map(([COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE]:string[])=>({COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT:{operacao:'emissao',estadoCaptura:'preparado',respostaCompleta:'0',versaoCriptografia:'v1',capturaCriadaEm:'CURRENT_TIMESTAMP',updatedAt:'CURRENT_TIMESTAMP'}[COLUMN_NAME]??null,EXTRA:COLUMN_NAME==='id'?'auto_increment':''}));}
function indexes(){return Object.entries(p.INDICES).flatMap(([INDEX_NAME,v]:[string,any])=>v.cols.map((COLUMN_NAME:string,i:number)=>({INDEX_NAME,COLUMN_NAME,NON_UNIQUE:v.unique?0:1,SEQ_IN_INDEX:i+1,SUB_PART:null})));}
describe('provisionador exclusivo0101',()=>{
 it('SQL revisado só cria uma tabela e dois índices',()=>{
  const sql=readFileSync(new URL('../drizzle/0101_workable_ronan.sql',import.meta.url),'utf8');const ddl=p.comandos(sql);
  expect(ddl).toHaveLength(3);expect(ddl.every((s:string)=>s.startsWith('CREATE '))).toBe(true);expect(sql).not.toMatch(/\b(ALTER|DROP|INSERT|DELETE|UPDATE)\s+(TABLE|INTO|FROM|`)/i);
  expect(()=>p.comandos(sql+'\n')).toThrow('diferente');
 });
 it('ausente prepara criação; completa não faz nada',()=>{expect(p.planejar([],[])).toHaveLength(3);expect(p.planejar(rows(),indexes())).toEqual([]);});
 it('pode completar índices seguros sem refazer tabela',()=>{expect(p.planejar(rows(),indexes().filter((i:any)=>i.INDEX_NAME!=='btgHttpDiagnosticos_remessa_idx'))).toEqual(['btgHttpDiagnosticos_remessa_idx']);});
 it('recusa tabela parcial e constraint ausente',()=>{expect(()=>p.planejar(rows().slice(1),indexes())).toThrow('parcial');expect(()=>p.planejar(rows(),indexes().filter((i:any)=>i.INDEX_NAME!=='PRIMARY'))).toThrow('Constraint');});
 it.each(['tipo','null','default','auto_increment','indice','prefixo','extra'])('recusa estrutura divergente %s',(caso)=>{
  const cols=rows(),idx=indexes();
  if(caso==='tipo')cols.find((c:any)=>c.COLUMN_NAME==='payloadCifrado').COLUMN_TYPE='text';
  if(caso==='null')cols[0].IS_NULLABLE='YES';if(caso==='default')cols.find((c:any)=>c.COLUMN_NAME==='respostaCompleta').COLUMN_DEFAULT='1';
  if(caso==='auto_increment')cols[0].EXTRA='';if(caso==='indice')idx[0].NON_UNIQUE=1;if(caso==='prefixo')idx[0].SUB_PART=3;
  if(caso==='extra')idx.push({...idx[0],INDEX_NAME:'nao_esperado'});
  expect(()=>p.planejar(cols,idx)).toThrow();
 });
 it('recusa apply sem literal antes de conexão',()=>{
  try{execFileSync(process.execPath,['scripts/provisionar-btg-diagnosticos.cjs','--apply'],{cwd:process.cwd(),encoding:'utf8',env:{...process.env,DATABASE_URL:'invalida'},stdio:'pipe'});throw new Error('não bloqueou');}
  catch(e){expect(String((e as {stderr?:string}).stderr)).toContain('CONFIRMAR ESTRUTURA DIAGNOSTICO BTG');}
 });
});
