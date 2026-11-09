import { createHash } from 'node:crypto';

/** A capacidade não viaja por tRPC, JSON ou banco. Só o service pode produzi-la. */
declare const marca: unique symbol;
export type AutorizacaoReenvioBtg = Readonly<{ [marca]: true }>;
export interface ContextoAutorizacaoReenvioBtg {
  emissaoId: number;
  emissaoAnteriorId: number;
  analiseId: number;
  revisao: number;
  parcelaId: number;
  usuarioId: number;
  contextoHash: string;
}
const capacidades = new WeakMap<object, Readonly<ContextoAutorizacaoReenvioBtg>>();
export function criarAutorizacaoReenvioBtg(contexto: ContextoAutorizacaoReenvioBtg): AutorizacaoReenvioBtg {
  if ([contexto.emissaoId,contexto.emissaoAnteriorId,contexto.analiseId,contexto.revisao,contexto.parcelaId,contexto.usuarioId].some(id => !Number.isSafeInteger(id) || id <= 0) || contexto.revisao < 2 || !/^[a-f0-9]{64}$/.test(contexto.contextoHash)) throw new Error('Autorização interna inválida.');
  const cap = Object.freeze({});
  capacidades.set(cap,Object.freeze({...contexto}));
  return cap as AutorizacaoReenvioBtg;
}
export function consumirAutorizacaoReenvioBtg(cap: unknown): Readonly<ContextoAutorizacaoReenvioBtg> | null {
  if (!cap || typeof cap !== 'object') return null;
  const contexto = capacidades.get(cap);
  capacidades.delete(cap);
  return contexto ?? null;
}
/** Snapshot do contexto de envio, nunca persistido ou devolvido em plaintext. */
export function hashContextoEnvioBtg(input: {
  parcela: unknown; acordo: unknown; devedor: unknown; integracao: unknown; conta: unknown;
}): string {
  return createHash('sha256').update(JSON.stringify([input.parcela,input.acordo,input.devedor,input.integracao,input.conta])).digest('hex');
}
