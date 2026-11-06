import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const LIMITE_CAPTURA_BTG_BYTES = 64 * 1024;
export const RETENCAO_DIAGNOSTICO_BTG_MS = 30 * 24 * 60 * 60 * 1000;
const DOMINIO = 'btg-diagnostico-v1';

export interface ContextoAadDiagnosticoBtg {
  chaveCaptura: string;
  ambiente: string;
  btgIntegracaoId: number;
  btgCobrancaEmitidaId: number;
}

export function aadDiagnosticoBtg(row: ContextoAadDiagnosticoBtg, parte: 'payload' | 'resposta' = 'payload'): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.chaveCaptura) ||
    !['sandbox','producao'].includes(row.ambiente) ||
    !Number.isSafeInteger(row.btgIntegracaoId) || row.btgIntegracaoId <= 0 ||
    !Number.isSafeInteger(row.btgCobrancaEmitidaId) || row.btgCobrancaEmitidaId <= 0 || !['payload','resposta'].includes(parte)) {
    throw new Error('O contexto de captura BTG é inválido.');
  }
  return JSON.stringify([DOMINIO,parte,row.ambiente,row.btgIntegracaoId,row.btgCobrancaEmitidaId,row.chaveCaptura]);
}

function chaveDerivada(): Buffer {
  const valor = process.env.BTG_TOKEN_ENCRYPTION_KEY?.trim() ?? '';
  const base = Buffer.from(valor, 'base64');
  if (base.length !== 32 || !/^[A-Za-z0-9+/]+={0,2}$/.test(valor) || base.toString('base64') !== valor) {
    throw new Error('A chave de proteção do diagnóstico BTG está ausente ou inválida.');
  }
  try { return Buffer.from(hkdfSync('sha256',base,Buffer.from(DOMINIO),Buffer.from('payload-resposta'),32)); }
  finally { base.fill(0); }
}

export function cifrarDiagnosticoBtg(bytes: Uint8Array, aad: string): string {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > LIMITE_CAPTURA_BTG_BYTES) {
    throw new Error('O diagnóstico BTG excede o limite permitido.');
  }
  const chave = chaveDerivada();
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm',chave,iv);
    cipher.setAAD(Buffer.from(aad,'utf8'));
    const cifra = Buffer.concat([cipher.update(bytes),cipher.final()]);
    return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${cifra.toString('base64url')}`;
  } catch { throw new Error('Não foi possível proteger o diagnóstico BTG.'); }
  finally { chave.fill(0); }
}

export function decifrarDiagnosticoBtg(envelope: string, aad: string): Buffer {
  const chave = chaveDerivada();
  try {
    const partes = envelope.split(':');
    if (partes.length !== 4 || partes[0] !== 'v1') throw new Error('formato');
    const [iv,tag,cifra] = partes.slice(1).map((parte) => {
      if (!/^[A-Za-z0-9_-]*$/.test(parte)) throw new Error('formato');
      const bytes = Buffer.from(parte,'base64url');
      if (bytes.toString('base64url') !== parte) throw new Error('formato');
      return bytes;
    });
    if (iv.length !== 12 || tag.length !== 16 || cifra.length > LIMITE_CAPTURA_BTG_BYTES) throw new Error('formato');
    const decipher = createDecipheriv('aes-256-gcm',chave,iv);
    decipher.setAAD(Buffer.from(aad,'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifra),decipher.final()]);
  } catch { throw new Error('Não foi possível acessar o conteúdo protegido do diagnóstico BTG.'); }
  finally { chave.fill(0); }
}
