import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pessoa: { id: 90, role: 'advogado', condominioId: null as number | null, isActive: 1, isDeleted: 0, escopoCondominios: 'todos' as string | null },
  ativos: [1, 2], vinculados: [1], queries: [] as string[], missing: false,
}));
vi.mock('./db', () => ({ getDb: vi.fn(async () => ({
  select: (fields: Record<string, unknown>) => {
    let tableName = '';
    const q: any = {
      from: (table: unknown) => { tableName = String((table as any)[Symbol.for('drizzle:Name')]); return q; },
      innerJoin: () => q,
      where: () => q,
      limit: async () => { state.queries.push(tableName); return state.missing ? [] : [{ ...state.pessoa }]; },
      then: (resolve: (value: unknown) => unknown) => {
        state.queries.push(tableName);
        const ids = tableName === 'condominios' ? state.ativos : state.vinculados.filter(id => state.ativos.includes(id));
        return Promise.resolve(ids.map(condominioId => ({ condominioId, id: condominioId }))).then(resolve);
      },
    };
    return q;
  },
})) }));

import { getCondominiosAtivosDoUsuario, getCarteiraCondominialAtual, resolveCondominioEfetivo, assertCondominioAccess } from './tenant-guard';
import { prepararFiltroCarteira, getCarteiraExplicita } from './escopo-explicito';
const actor = () => ({ id: 90, role: state.pessoa.role, condominioId: state.pessoa.condominioId });

beforeEach(() => {
  state.pessoa = { id: 90, role: 'advogado', condominioId: null, isActive: 1, isDeleted: 0, escopoCondominios: 'todos' };
  state.ativos = [1, 2]; state.vinculados = [1]; state.queries = []; state.missing = false;
});

describe('carteira fresca — alcance explícito', () => {
  it.each(['advogado', 'colaborador'])('%s global resolve todos ativos sem vínculo obrigatório', async role => {
    state.pessoa.role = role; state.vinculados = [];
    expect(await getCondominiosAtivosDoUsuario(actor())).toEqual([1, 2]);
    expect(state.queries).toContain('users');
    expect(state.queries).not.toContain('userCondominios');
  });
  it('inclui um novo condomínio ativo sem gravar vínculos', async () => {
    expect(await getCondominiosAtivosDoUsuario(actor())).toEqual([1, 2]); state.ativos.push(3);
    expect(await getCondominiosAtivosDoUsuario(actor())).toEqual([1, 2, 3]);
  });
  it('global não ganha sentinela administrativa nem deixa contexto sem condomínio', async () => {
    const carteira = await getCarteiraCondominialAtual(actor());
    expect(carteira.actor.role).toBe('advogado'); expect(carteira.escopo).toBe('todos'); expect(carteira.ids).toEqual([1, 2]);
    expect(await resolveCondominioEfetivo(actor())).toBe(1);
  });
  it('principal global inativo é preferência e não bloqueia contexto válido', async () => {
    state.pessoa.condominioId = 8;
    expect(await resolveCondominioEfetivo(actor())).toBe(1);
  });
  it('ID inativo ou inexistente continua proibido no global', async () => {
    await expect(assertCondominioAccess(actor(), 8)).rejects.toThrow();
  });
  it('global sem ativos não ganha visão irrestrita', async () => {
    state.ativos = [];
    await expect(resolveCondominioEfetivo(actor())).rejects.toThrow();
  });
  it.each(['sindico', 'cobrador'])('%s com todos indevido falha fechado', async role => {
    state.pessoa.role = role;
    await expect(getCondominiosAtivosDoUsuario(actor())).rejects.toThrow(/escopo|perfil/i);
  });
  it.each([null, 'selecionados'])('legado/restrito %s usa só vínculos ativos', async escopo => {
    state.pessoa.escopoCondominios = escopo; state.vinculados = [1, 8];
    expect(await getCondominiosAtivosDoUsuario(actor())).toEqual([1]);
    await expect(assertCondominioAccess(actor(), 2)).rejects.toThrow();
  });
  it('vazio legado não é global', async () => {
    state.pessoa.escopoCondominios = null; state.vinculados = [];
    await expect(resolveCondominioEfetivo(actor())).rejects.toThrow();
  });
  it('sessão/contexto antigo não preserva global depois da revogação', async () => {
    const stale = { ...actor(), escopoCondominios: 'todos' as const };
    expect(await getCondominiosAtivosDoUsuario(stale)).toEqual([1, 2]);
    state.pessoa.escopoCondominios = 'selecionados';
    expect(await getCondominiosAtivosDoUsuario(stale)).toEqual([1]);
    await expect(assertCondominioAccess(stale, 2)).rejects.toThrow();
  });
  it.each(['inativo', 'excluido', 'ausente'])('identidade %s falha fechado', async motivo => {
    if (motivo === 'inativo') state.pessoa.isActive = 0;
    if (motivo === 'excluido') state.pessoa.isDeleted = 1;
    if (motivo === 'ausente') state.missing = true;
    await expect(getCondominiosAtivosDoUsuario(actor())).rejects.toThrow();
  });
  it('mudança de role no banco não usa projeção antiga', async () => {
    const stale = actor(); state.pessoa.role = 'cobrador'; state.pessoa.escopoCondominios = null;
    await expect(getCondominiosAtivosDoUsuario(stale)).rejects.toThrow();
  });
  it('legado preserva regra do principal sem vínculo, sem inventar fallback', async () => {
    state.pessoa.escopoCondominios = null; state.pessoa.condominioId = 8;
    await expect(resolveCondominioEfetivo(actor())).rejects.toThrow();
  });
  it('contexto admin antigo não conserva sentinela administrativa', async () => {
    await expect(getCondominiosAtivosDoUsuario({ id: 90, role: 'admin', condominioId: null })).rejects.toThrow();
  });
  it('identidade retornada com ID diferente falha fechado', async () => {
    await expect(getCondominiosAtivosDoUsuario({ id: 91, role: 'advogado', condominioId: null })).rejects.toThrow();
  });
  it('filtro interno limita a lista aos ativos e valida um ID solicitado', async () => {
    expect(await prepararFiltroCarteira(actor())).toEqual({ condominioIds: [1, 2] });
    expect(await prepararFiltroCarteira(actor(), 2)).toEqual({ condominioIds: [2] });
    await expect(prepararFiltroCarteira(actor(), 8)).rejects.toThrow();
  });
  it('filtro interno nunca deixa carteira explícita vazia virar consulta global', async () => {
    state.ativos = [];
    await expect(prepararFiltroCarteira(actor())).rejects.toThrow();
  });
  it('filtro omitido preserva contratos NULL legados sem reclassificação', async () => {
    state.pessoa.escopoCondominios = null;
    expect(await prepararFiltroCarteira(actor())).toBeUndefined();
    expect(await getCarteiraExplicita(actor())).toBeNull();
  });
  it('admin conserva resolução sem filtro histórico', async () => {
    state.pessoa = { id: 1, role: 'admin', condominioId: null, isActive: 1, isDeleted: 0, escopoCondominios: null };
    expect(await getCondominiosAtivosDoUsuario({ id: 1, role: 'admin', condominioId: null })).toEqual([]);
    expect(await resolveCondominioEfetivo({ id: 1, role: 'admin', condominioId: null })).toBeUndefined();
    expect(state.queries).toContain('users');
  });
});
