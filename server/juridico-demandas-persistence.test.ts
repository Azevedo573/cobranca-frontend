import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), rows: [] as any[][], writes: [] as any[], commits: [] as any[], transaction: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.db }));
import { assertEstadoDemandaAtual, executarDemandasAtomico, deleteDemanda, reordenarColunas, getAdvogados } from "./db-demandas";

const state = (id = 20, extra = {}) => ({ id, condominioId: 1, equipeId: 5, colunaId: 1, responsavelId: 10, assunto: "Caso", updatedAt: new Date("2026-01-01T00:00:00Z"), ...extra }) as any;
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows.length = 0; mocks.writes.length = 0; mocks.commits.length = 0;
  const tx: any = {
    select: () => {
      const result = Promise.resolve(mocks.rows.shift() ?? []);
      const query: any = { from: () => query, where: () => query, orderBy: () => query, limit: () => query, for: () => result, then: result.then.bind(result) };
      return query;
    },
    update: (table: any) => ({ set: (data: any) => ({ where: () => { mocks.writes.push({ operation: "update", table, data }); return Promise.resolve([{ affectedRows: 1 }]); } }) }),
    insert: (table: any) => ({ values: (data: any) => { mocks.writes.push({ operation: "insert", table, data }); return Promise.resolve([{ insertId: 1 }]); } }),
    delete: (table: any) => ({ where: () => { mocks.writes.push({ operation: "delete", table }); return Promise.resolve([]); } }),
  };
  mocks.transaction.mockImplementation(async fn => {
    const result = await fn(tx);
    mocks.commits.push(...mocks.writes);
    return result;
  });
  mocks.db.mockResolvedValue({ ...tx, transaction: mocks.transaction });
});

describe("demandas — transação e consistência do contexto", () => {
  it("valida todos os snapshots antes da primeira escrita", async () => {
    mocks.rows.push([state(20)]);
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: { prioridade: "alta" } }, { id: 99, esperada: state(99), data: { prioridade: "alta" } }], { id: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.writes).toEqual([]); expect(mocks.commits).toEqual([]);
  });
  it("alteração concorrente no mesmo segundo causa conflito pelo snapshot completo", async () => {
    mocks.rows.push([state(20, { responsavelId: 11 })]);
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: { prioridade: "alta" } }], { id: 10 })).rejects.toMatchObject({ code: "CONFLICT" }); expect(mocks.writes).toEqual([]);
  });
  it("mesma data em instâncias diferentes não gera conflito falso", () => {
    expect(() => assertEstadoDemandaAtual(state(), state())).not.toThrow();
  });
  it("revalidação de permissão acontece antes de qualquer escrita", async () => {
    mocks.rows.push([state(20)]);
    const revalidar = vi.fn().mockRejectedValue(Object.assign(new Error("Revogado"), { code: "FORBIDDEN" }));
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: { prioridade: "alta" } }], { id: 10 }, revalidar)).rejects.toThrow("Revogado");
    expect(revalidar).toHaveBeenCalledTimes(1); expect(mocks.writes).toEqual([]);
  });
  it("valida todas as colunas antes de atualizar qualquer caso", async () => {
    mocks.rows.push([state(20), state(21)], [{ name: "Ator" }], [{ id: 2, tipo: "intermediaria", userId: 10 }], []);
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: { colunaId: 2 } }, { id: 21, esperada: state(21), data: { colunaId: 99 } }], { id: 10 })).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.writes).toEqual([]);
  });
  it("movimento para saída mantém política de conclusão e grava evento na mesma transação", async () => {
    mocks.rows.push([state(20)], [{ name: "Ator" }], [{ id: 2, tipo: "saida", nome: "Resolvidas", userId: null }]);
    await executarDemandasAtomico([{ id: 20, esperada: state(20), data: { colunaId: 2 } }], { id: 10 });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.commits).toEqual([expect.objectContaining({ operation: "update", data: expect.objectContaining({ status: "concluida", resolvidoEm: expect.any(Date), colunaId: 2 }) }), expect.objectContaining({ operation: "insert", data: expect.objectContaining({ tipo: "conclusao", demandaId: 20, usuarioNome: "Ator" }) })]);
  });
  it("troca de equipe com tarefa detectada após bloqueio impede gravação", async () => {
    mocks.rows.push([state(20)], [{ id: 9 }]);
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: { equipeId: 6 } }], { id: 10 })).rejects.toMatchObject({ code: "CONFLICT" }); expect(mocks.writes).toEqual([]);
  });
  it("troca de condomínio com tarefa também preserva o contexto", async () => {
    mocks.rows.push([state(20)], [{ id: 9 }]);
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: { condominioId: 2 } }], { id: 10 })).rejects.toMatchObject({ code: "CONFLICT" }); expect(mocks.writes).toEqual([]);
  });
  it("demanda com tarefa não pode ser apagada e não altera tarefa/histórico/anexo", async () => {
    mocks.rows.push([state(20)], [{ id: 9 }]);
    await expect(deleteDemanda(20, { id: 10 }, state(20))).rejects.toMatchObject({ code: "CONFLICT" }); expect(mocks.writes).toEqual([]);
  });
  it("demanda sem tarefas é cancelada e mantém histórico e anexos", async () => {
    mocks.rows.push([state(20)], [], [{ name: "Ator" }]);
    await deleteDemanda(20, { id: 10 }, state(20));
    expect(mocks.commits).toEqual([expect.objectContaining({ operation: "update", data: { status: "cancelada" } }), expect.objectContaining({ operation: "insert", data: expect.objectContaining({ tipo: "cancelamento", usuarioId: 10 }) })]);
    expect(mocks.writes.some(w => w.operation === "delete")).toBe(false);
  });
  it("reordenação de coluna alheia não altera nem colunas globais nem pessoais válidas", async () => {
    mocks.rows.push([{ id: 1, tipo: "entrada", userId: null }, { id: 2, tipo: "intermediaria", userId: 10 }, { id: 99, tipo: "intermediaria", userId: 11 }]);
    await expect(reordenarColunas([1, 2, 99], 10)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(mocks.writes).toEqual([]);
  });
  it("reordenação pessoal mantém entrada e saída globais intocadas", async () => {
    mocks.rows.push([{ id: 1, tipo: "entrada", userId: null }, { id: 2, tipo: "intermediaria", userId: 10 }, { id: 3, tipo: "saida", userId: null }]);
    await reordenarColunas([1, 2, 3], 10);
    expect(mocks.writes).toHaveLength(1); expect(mocks.writes[0]).toMatchObject({ data: { ordem: 1 } });
  });
  it("recusa IDs repetidos antes de criar transação", async () => {
    await expect(executarDemandasAtomico([{ id: 20, esperada: state(20), data: {} }, { id: 20, esperada: state(20), data: {} }], { id: 10 })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("chooser não retorna email, hash, carteira ou campos internos do candidato", async () => {
    mocks.rows.push([{ id: 10, name: "Administrador", role: "admin", condominioId: 1, email: "secret@example.com", passwordHash: "secret" }]);
    expect(await getAdvogados({ admin: true, actorId: 10, equipeIds: [], condominioIds: [] })).toEqual([{ id: 10, name: "Administrador", role: "admin" }]);
  });
});
