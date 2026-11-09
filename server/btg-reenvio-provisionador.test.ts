import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe,expect,it} from 'vitest';
const r=createRequire(import.meta.url);const p=r('../scripts/provisionar-btg-recuperacoes.cjs');
const cols=()=>p.COLUNAS.map(([COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE]:string[])=>({COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT:COLUMN_NAME==='estado'?'analisada':COLUMN_NAME==='consultaCompleta'?'0':null,EXTRA:COLUMN_NAME==='id'?'auto_increment':''}));
const idx=()=>Object.entries(p.INDICES).flatMap(([INDEX_NAME,v]:[string,any])=>v.cols.map((COLUMN_NAME:string,i:number)=>({INDEX_NAME,COLUMN_NAME,NON_UNIQUE:v.unique?0:1,SEQ_IN_INDEX:i+1,SUB_PART:null})));
const prova=[{COLUMN_NAME:'falhaAntesEnvioEm',COLUMN_TYPE:'timestamp',IS_NULLABLE:'YES',COLUMN_DEFAULT:null,EXTRA:''}];
describe('provisionador0102',()=>{
 it('executa apenas4DDL exatas e recusa SQL modificado',()=>{const sql=readFileSync(new URL('../drizzle/0102_ancient_arclight.sql',import.meta.url),'utf8');expect(p.comandos(sql)).toHaveLength(4);expect(()=>p.comandos(sql+'\n')).toThrow();expect(p.comandos(sql).join(' ')).not.toMatch(/\b(DROP|DELETE|INSERT|UPDATE|TRUNCATE)\b/);});
 it('planeja criação aditiva, não backfill',()=>expect(p.planejar([],[],[],true)).toEqual(['tabela','prova','anterior','parcela']));
 it('completa é no-op e aplicação parcial pode continuar sóADDfaltante',()=>{expect(p.planejar(cols(),idx(),prova,true)).toEqual([]);expect(p.planejar(cols(),idx(),[],true)).toEqual(['prova']);});
 it('recusa tabela de emissão ausente/coluna não nullable/default inválido',()=>{expect(()=>p.planejar([],[],[],false)).toThrow();expect(()=>p.planejar(cols(),idx(),[{...prova[0],IS_NULLABLE:'NO'}],true)).toThrow();expect(()=>p.planejar(cols().map((x:any)=>x.COLUMN_NAME==='consultaCompleta'?{...x,COLUMN_DEFAULT:1}:x),idx(),prova,true)).toThrow();});
 it('recusa colunas parciais e índices únicos ausentes/incompatíveis',()=>{expect(()=>p.planejar(cols().slice(1),idx(),prova,true)).toThrow();expect(()=>p.planejar(cols(),idx().filter((x:any)=>x.INDEX_NAME!=='btgRecuperacoes_nova_emissao_unique'),prova,true)).toThrow();expect(()=>p.planejar(cols(),idx().map((x:any)=>({...x,SUB_PART:2})),prova,true)).toThrow();});
 it('confirmação ausente é bloqueada antes de carregar dotenv/conectar',()=>{try{execFileSync(process.execPath,['scripts/provisionar-btg-recuperacoes.cjs','--apply'],{cwd:process.cwd(),env:{PATH:process.env.PATH},encoding:'utf8',stdio:'pipe'});throw new Error('não bloqueou');}catch(e:any){expect(e.status).toBe(1);expect(e.stderr).toContain(p.CONFIRMACAO);expect(e.stderr).not.toMatch(/ECONN|DATABASE_URL|password/);}});
});
