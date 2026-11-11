import { beforeEach, describe, it, expect, vi } from "vitest";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("./db", async original => ({ ...await original<typeof import("./db")>(), getDb: mocks.db }));
import { appRouter } from "./routers";

let fixture: ReturnType<typeof criarDbWebhookBtgEmMemoria>;
function createAuthContext(role: "admin" | "sindico" | "cobrador" = "admin", condominioId?: number): TrpcContext {
  return {
    user: { id: role === "sindico" ? 2 : 1, openId: "synthetic-vencimentos", name: "Pessoa fictícia",
      loginMethod: "custom", role, condominioId: condominioId ?? null,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const due = (days: number) => { const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+days); return d; };
  fixture = criarDbWebhookBtgEmMemoria({
    users: [
      { id: 1, role: "admin", condominioId: null, escopoCondominios: null, isActive: 1, isDeleted: 0 },
      { id: 2, role: "sindico", condominioId: 1, escopoCondominios: null, isActive: 1, isDeleted: 0 },
    ],
    userCondominios: [],
    condominios: [{ id: 1, statusCadastro: "ativo" }, { id: 2, statusCadastro: "ativo" }],
    devedores: [1,2,3].map(id=>({id: id*10, name: `Devedor fictício ${id}`, unitNumber: "TESTE", condominioId: id===2 ? 2 : 1})),
    acordos: [1,2,3].map(id=>({id: id*100, devedorId: id*10, condominioId: id===2 ? 2 : 1, status: "ativo"})),
    parcelasAcordo: [1,2,3].map((id,index)=>({id, acordoId:id*100, installmentNumber:1, amount:10000,
      status:"pendente", dueDate: due([1,10,20][index])})),
  });
  mocks.db.mockResolvedValue(fixture.db);
});

describe("Vencimentos Próximos — dados fictícios, sem dependência de banco", () => {
  it("deve retornar vencimentos próximos para admin sem filtro de condomínio", async () => {
    const result=await appRouter.createCaller(createAuthContext()).acordos.getVencimentosProximos({dias:7});
    expect(Array.isArray(result)).toBe(true);
    expect(result.map(p=>p.parcelaId)).toEqual([1]);
  });
  it("deve retornar vencimentos próximos para admin com filtro de condomínio", async () => {
    const result=await appRouter.createCaller(createAuthContext()).acordos.getVencimentosProximos({dias:30,condominioId:1});
    expect(Array.isArray(result)).toBe(true);
    expect(result.map(p=>p.parcelaId)).toEqual([1,3]);
    expect(result.every(p=>p.condominioId===1)).toBe(true);
  });
  it("bloqueia síndico sem vínculo ativo persistido", async () => {
    await expect(appRouter.createCaller(createAuthContext("sindico",1)).acordos.getVencimentosProximos({dias:7}))
      .rejects.toMatchObject({code:"FORBIDDEN"});
    expect(fixture.state.writes).toEqual([]);
  });
  it("deve aceitar diferentes períodos (7, 15, 30 dias)", async () => {
    const caller=appRouter.createCaller(createAuthContext());
    const result7=await caller.acordos.getVencimentosProximos({dias:7});
    const result15=await caller.acordos.getVencimentosProximos({dias:15});
    const result30=await caller.acordos.getVencimentosProximos({dias:30});
    expect([result7,result15,result30].every(Array.isArray)).toBe(true);
    expect([result7.length,result15.length,result30.length]).toEqual([1,2,3]);
  });
  it("deve retornar estrutura correta dos dados", async () => {
    const result=await appRouter.createCaller(createAuthContext()).acordos.getVencimentosProximos({dias:30});
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    const parcela=result[0];
    for (const field of ["parcelaId","acordoId","devedorId","devedorNome","parcelaNumero","parcelaValor","dataVencimento","condominioId"])
      expect(parcela).toHaveProperty(field);
    expect(parcela).toMatchObject({parcelaId:1,acordoId:100,devedorId:10,parcelaNumero:1,parcelaValor:10000,condominioId:1});
    expect(parcela.dataVencimento).toBeInstanceOf(Date);
    expect(fixture.state.writes).toEqual([]);
  });
});
