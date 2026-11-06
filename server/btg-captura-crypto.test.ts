import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aadDiagnosticoBtg, cifrarDiagnosticoBtg, decifrarDiagnosticoBtg, LIMITE_CAPTURA_BTG_BYTES } from './btg-v2/diagnosticos-crypto';
const contexto = { chaveCaptura:'ec990fe0-cbbb-433d-9883-97be6a8d11a2', ambiente:'producao', btgIntegracaoId:1, btgCobrancaEmitidaId:2 };
describe('evidência BTG cifrada', () => {
  beforeEach(()=>{ vi.stubEnv('BTG_TOKEN_ENCRYPTION_KEY',Buffer.alloc(32,3).toString('base64')); });
  it('preserva bytes UTF8, zeros e campos desconhecidos sem plaintext no envelope',()=>{
    const bytes=Buffer.from('{"payer":{"taxId":"01234567890","name":"Exemplo fictício"},"unknown":"🧪"}');
    const aad=aadDiagnosticoBtg(contexto);
    const cifrado=cifrarDiagnosticoBtg(bytes,aad);
    expect(cifrado).not.toContain('01234567890'); expect(cifrado).not.toContain('Exemplo');
    expect(decifrarDiagnosticoBtg(cifrado,aad)).toEqual(bytes);
    expect(cifrarDiagnosticoBtg(bytes,aad)).not.toBe(cifrado);
  });
  it('preserva bytes não UTF8 sem fingir que são JSON',()=>{
    const bytes=Buffer.from([255,0,195,40]); const aad=aadDiagnosticoBtg(contexto);
    expect(decifrarDiagnosticoBtg(cifrarDiagnosticoBtg(bytes,aad),aad)).toEqual(bytes);
  });
  it('nega troca de ambiente, emissão, integração e UUID',()=>{
    const aad=aadDiagnosticoBtg(contexto), cifra=cifrarDiagnosticoBtg(Buffer.from('segredo fictício'),aad);
    for(const alterado of [{...contexto,ambiente:'sandbox'},{...contexto,btgCobrancaEmitidaId:3},{...contexto,btgIntegracaoId:3},{...contexto,chaveCaptura:'ea990fe0-cbbb-433d-9883-97be6a8d11a2'}])
      expect(()=>decifrarDiagnosticoBtg(cifra,aadDiagnosticoBtg(alterado))).toThrow('Não foi possível acessar');
  });
  it('nega adulteração e chave diferente com erro sem detalhes',()=>{
    const aad=aadDiagnosticoBtg(contexto), cifra=cifrarDiagnosticoBtg(Buffer.from('CPF_FICTICIO'),aad);
    expect(()=>decifrarDiagnosticoBtg(cifra+'a',aad)).toThrow();
    vi.stubEnv('BTG_TOKEN_ENCRYPTION_KEY',Buffer.alloc(32,9).toString('base64'));
    expect(()=>decifrarDiagnosticoBtg(cifra,aad)).toThrow('Não foi possível acessar');
  });
  it('recusa chave ausente ou inválida',()=>{
    for(const chave of ['', 'invalida']) { vi.stubEnv('BTG_TOKEN_ENCRYPTION_KEY',chave); expect(()=>cifrarDiagnosticoBtg(Buffer.from('x'),aadDiagnosticoBtg(contexto))).toThrow('chave'); }
  });
  it('aceita limite binário exato e recusa limite+1 sem truncar',()=>{
    const aad=aadDiagnosticoBtg(contexto), bytes=Buffer.alloc(LIMITE_CAPTURA_BTG_BYTES,65);
    const cifrado=cifrarDiagnosticoBtg(bytes,aad); expect(cifrado.length).toBeGreaterThan(65535);
    expect(decifrarDiagnosticoBtg(cifrado,aad)).toEqual(bytes);
    expect(()=>cifrarDiagnosticoBtg(Buffer.alloc(LIMITE_CAPTURA_BTG_BYTES+1),aad)).toThrow('limite');
  });
});
