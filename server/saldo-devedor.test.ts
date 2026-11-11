import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calcularSaldoDevedor,
  lerSaldoDevedor,
  recalcularSaldoDevedorTx,
} from "./saldo-devedor";
import { calcularValorDevido } from "../shared/calculos";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";
import {
  aplicarRecebimentoAcordo,
  bloquearContextoRecebimentoAcordo,
} from "./recebimento-acordo";
const dbMock = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("./db", () => ({ getDb: dbMock.getDb }));
import { getDevedorById, getDevedoresByCondominio } from "./db-devedores";

const NOW = new Date("2026-11-11T20:00:00Z");
const taxas = {
  taxaJurosMensal: 1,
  taxaMulta: 2,
  taxaHonorarios: 10,
  correcaoMonetaria: 0.5,
};
const cob = (id = 1, extra = {}) => ({
  id,
  condominioId: 2,
  devedorId: 3,
  amount: 10000,
  dueDate: NOW,
  custasJudiciais: 0,
  status: "em_acordo",
  ...extra,
});
const acordo = (id = 4, extra = {}) => ({
  id,
  condominioId: 2,
  devedorId: 3,
  status: "ativo",
  agreedAmount: 8000,
  totalAmount: 10000,
  valorPago: 0,
  ...extra,
});
const parcela = (id = 5, extra = {}) => ({
  id,
  acordoId: 4,
  amount: 4000,
  status: "pendente",
  ...extra,
});
function dados(extra = {}) {
  return {
    devedorId: 3,
    condominioId: 2,
    now: NOW,
    taxas,
    cobrancas: [cob()],
    acordos: [acordo()],
    parcelas: [parcela(), parcela(6)],
    vinculos: [{ id: 7, acordoId: 4, cobrancaId: 1, valorOriginal: 10000 }],
    ...extra,
  };
}
function fixture(extra = {}) {
  const d = dados(extra);
  return criarDbWebhookBtgEmMemoria({
    devedores: [{ id: 3, condominioId: 2, totalDue: 10000, status: "ativo" }],
    condominios: [{ id: 2, ...taxas }],
    cobrancas: d.cobrancas,
    acordos: d.acordos,
    parcelasAcordo: d.parcelas,
    acordoCobrancas: d.vinculos,
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Rede proibida");
    })
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saldo sem duplicação de origem e acordo", () => {
  it("desconto negociado usa nominal do plano, não encargos sobre origem", () => {
    expect(calcularSaldoDevedor(dados())).toEqual({
      totalDue: 8000,
      status: "acordo",
    });
  });
  it("parcial soma apenas parcelas pendentes/atrasadas; não inventa rateio histórico", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          parcelas: [
            parcela(5, { status: "pago" }),
            parcela(6, { status: "atrasado" }),
          ],
          acordos: [acordo(4, { valorPago: 777, valorPagoAcordo: 999 })],
        })
      )
    ).toEqual({ totalDue: 4000, status: "acordo" });
  });
  it("múltiplas origens contam plano somente uma vez", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          cobrancas: [cob(), cob(2)],
          vinculos: [
            { id: 7, acordoId: 4, cobrancaId: 1 },
            { id: 8, acordoId: 4, cobrancaId: 2 },
          ],
        })
      )
    ).toEqual({ totalDue: 8000, status: "acordo" });
  });
  it("outro acordo continua devido após quitação de um", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          cobrancas: [cob(1, { status: "pago" }), cob(2)],
          acordos: [acordo(4, { status: "pago" }), acordo(8)],
          parcelas: [
            parcela(5, { status: "pago" }),
            parcela(6, { status: "pago" }),
            parcela(9, { acordoId: 8, amount: 8000 }),
          ],
          vinculos: [
            { id: 7, acordoId: 4, cobrancaId: 1 },
            { id: 10, acordoId: 8, cobrancaId: 2 },
          ],
        })
      )
    ).toEqual({ totalDue: 8000, status: "acordo" });
  });
  it.each(["pendente", "em_cobranca", "judicial", "suspenso", "em_negociacao"])(
    "outra obrigação %s impede status pago e conserva encargos",
    status => {
      const outra = cob(2, {
        status,
        amount: 12345,
        dueDate: new Date("2026-09-10T20:00:00Z"),
      });
      const devido = Math.round(
        calcularValorDevido(outra.amount / 100, outra.dueDate, taxas)
          .valorTotal * 100
      );
      expect(
        calcularSaldoDevedor(dados({ cobrancas: [cob(), outra] }))
      ).toEqual({ totalDue: 8000 + devido, status: "ativo" });
    }
  );
  it("ausência de taxas nunca zera dívida nominal", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          taxas: null,
          cobrancas: [cob(1, { status: "pendente" })],
          acordos: [],
          parcelas: [],
          vinculos: [],
        })
      )
    ).toEqual({ totalDue: 10000, status: "ativo" });
  });
  it("origem histórica já paga não duplica receita nem invalida plano restante legítimo", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          cobrancas: [cob(), cob(2, { status: "pago", amount: 3000 })],
          vinculos: [
            { id: 7, acordoId: 4, cobrancaId: 1 },
            { id: 8, acordoId: 4, cobrancaId: 2 },
          ],
        })
      )
    ).toEqual({ totalDue: 8000, status: "acordo" });
  });
  it("custas avulsas permanecem devidas sem encargos ou acordo", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          taxas: null,
          cobrancas: [cob(1, { status: "judicial", custasJudiciais: 1500 })],
          acordos: [],
          parcelas: [],
          vinculos: [],
        })
      )
    ).toEqual({ totalDue: 11500, status: "ativo" });
  });
  it("now informado governa o atraso mesmo diferente do relógio do processamento", () => {
    const titulo = cob(1, {
      status: "pendente",
      dueDate: new Date("2026-11-10T12:00:00Z"),
    });
    const futuro = new Date("2027-01-11T20:00:00Z");
    const d = dados({
      now: futuro,
      cobrancas: [titulo],
      acordos: [],
      parcelas: [],
      vinculos: [],
    });
    const resultado = calcularSaldoDevedor(d);
    vi.setSystemTime(futuro);
    const esperado = Math.round(
      calcularValorDevido(titulo.amount / 100, titulo.dueDate, taxas)
        .valorTotal * 100
    );
    expect(resultado).toEqual({ totalDue: esperado, status: "ativo" });
  });
  it("origem em_acordo sem vínculo mantém obrigação", () => {
    expect(
      calcularSaldoDevedor(dados({ acordos: [], parcelas: [], vinculos: [] }))
    ).toEqual({ totalDue: 10000, status: "ativo" });
  });
  it("acordo histórico pago não perdoa origem ainda aberta", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          acordos: [acordo(4, { status: "pago" })],
          parcelas: [
            parcela(5, { status: "pago" }),
            parcela(6, { status: "pago" }),
          ],
        })
      )
    ).toEqual({ totalDue: 10000, status: "ativo" });
  });
  it("histórico pago com parcela ainda pendente não esconde obrigação ambígua", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          cobrancas: [cob(1, { status: "pago" })],
          acordos: [acordo(4, { status: "pago" })],
          parcelas: [parcela(5, { status: "pago" }), parcela(6)],
        })
      )
    ).toEqual({ totalDue: 4000, status: "ativo" });
  });
  it("histórico pago sem plano não presume quitação nominal coerente", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          cobrancas: [cob(1, { status: "pago" })],
          acordos: [acordo(4, { status: "pago" })],
          parcelas: [],
        })
      )
    ).toEqual({ totalDue: 8000, status: "ativo" });
  });
  it("parcela cancelada não significa quitação", () => {
    const saldo = calcularSaldoDevedor(
      dados({
        parcelas: [
          parcela(5, { status: "pago" }),
          parcela(6, { status: "cancelado" }),
        ],
      })
    );
    expect(saldo.totalDue).toBeGreaterThanOrEqual(4000);
    expect(saldo.status).toBe("ativo");
  });
  it("plano incoerente mantém saldo conservador mesmo com todas parcelas pagas", () => {
    const saldo = calcularSaldoDevedor(
      dados({ parcelas: [parcela(5, { status: "pago", amount: 1000 })] })
    );
    expect(saldo.totalDue).toBeGreaterThanOrEqual(7000);
    expect(saldo.status).toBe("ativo");
  });
  it("acordo ativo sem origens continua obrigação ambígua", () => {
    expect(
      calcularSaldoDevedor(dados({ cobrancas: [], vinculos: [] }))
    ).toEqual({ totalDue: 8000, status: "ativo" });
  });
  it("identidade cruzada nunca reduz origem legítima ao desconto", () => {
    const saldo = calcularSaldoDevedor(
      dados({ acordos: [acordo(4, { condominioId: 99 })] })
    );
    expect(saldo.totalDue).toBeGreaterThanOrEqual(10000);
    expect(saldo.status).toBe("ativo");
  });
  it("origem reutilizada em dois planos permanece ambígua, não quitada", () => {
    const saldo = calcularSaldoDevedor(
      dados({
        acordos: [acordo(), acordo(8)],
        parcelas: [
          parcela(),
          parcela(6),
          parcela(9, { acordoId: 8, amount: 8000 }),
        ],
        vinculos: [
          { id: 7, acordoId: 4, cobrancaId: 1 },
          { id: 10, acordoId: 8, cobrancaId: 1 },
        ],
      })
    );
    expect(saldo.totalDue).toBeGreaterThanOrEqual(10000);
    expect(saldo.status).toBe("ativo");
  });
  it("quitado apenas sem obrigações válidas ou ambíguas", () => {
    expect(
      calcularSaldoDevedor(
        dados({
          cobrancas: [
            cob(1, { status: "pago" }),
            cob(2, { status: "cancelado" }),
          ],
          acordos: [acordo(4, { status: "pago" })],
          parcelas: [
            parcela(5, { status: "pago" }),
            parcela(6, { status: "pago" }),
          ],
        })
      )
    ).toEqual({ totalDue: 0, status: "pago" });
  });
});

describe("leitura e recálculo Tx compartilham regra", () => {
  it("persiste mesmo saldo sem adquirir locks adicionais de acordos/devedor", async () => {
    const f = fixture({
      cobrancas: [cob(), cob(2, { status: "judicial", amount: 2000 })],
    });
    const esperado = await lerSaldoDevedor(f.db, 3, 2, NOW);
    expect(await recalcularSaldoDevedorTx(f.db, 3, 2, NOW)).toEqual(esperado);
    expect(f.state.tables.devedores[0]).toMatchObject(esperado);
    expect(f.state.locks).toEqual([]);
    expect(
      f.state.operations.every(op =>
        ["select", "update-attempt", "update"].includes(op.kind)
      )
    ).toBe(true);
  });
  it("nega update sem affectedRows exato e desfaz transação", async () => {
    const f = fixture();
    f.db.update.mockImplementation(() => ({
      set: () => ({ where: async () => [{ affectedRows: 0 }] }),
    }));
    await expect(
      f.db.transaction((tx: any) => recalcularSaldoDevedorTx(tx, 3, 2, NOW))
    ).rejects.toThrow("SALDO_UPDATE_FAILED");
    expect(f.state.rollbacks).toBe(1);
  });
  it("escopo do update exige condomínio e devedor corretos", async () => {
    const f = fixture();
    f.state.tables.devedores[0].condominioId = 99;
    await expect(recalcularSaldoDevedorTx(f.db, 3, 2, NOW)).rejects.toThrow(
      "SALDO_DEVEDOR_CONTEXT_MISMATCH"
    );
    expect(f.state.writes).toEqual([]);
  });
  it("listagem e detalhes exibem mesmo saldo/status sem escrever ou usar cache persistido", async () => {
    const f = fixture({
      cobrancas: [cob(), cob(2, { status: "judicial", amount: 2000 })],
    });
    dbMock.getDb.mockResolvedValue(f.db);
    const [lista] = await getDevedoresByCondominio(2);
    const detalhe = await getDevedorById(3);
    expect(lista).toMatchObject({ totalDue: 10000, status: "ativo" });
    expect(detalhe).toMatchObject({
      totalDue: lista.totalDue,
      status: lista.status,
    });
    expect(f.state.writes).toEqual([]);
  });
  it("80 origens usam consultas em lote limitadas, nunca um SELECT por origem", async () => {
    const cobrancas = Array.from({ length: 80 }, (_, i) => cob(i + 1));
    const vinculos = cobrancas.map(c => ({
      id: c.id + 100,
      acordoId: 4,
      cobrancaId: c.id,
    }));
    const f = fixture({ cobrancas, vinculos });
    expect(await lerSaldoDevedor(f.db, 3, 2, NOW)).toEqual({
      totalDue: 8000,
      status: "acordo",
    });
    expect(
      f.state.operations.filter(op => op.kind === "select").length
    ).toBeLessThanOrEqual(6);
    expect(
      f.state.operations.filter(
        op => op.kind === "select" && op.table === "acordoCobrancas"
      )
    ).toHaveLength(1);
  });
  it("devedor sem cobranças/planos não gera IN vazio", async () => {
    const f = fixture({
      cobrancas: [],
      acordos: [],
      parcelas: [],
      vinculos: [],
    });
    expect(await lerSaldoDevedor(f.db, 3, 2, NOW)).toEqual({
      totalDue: 0,
      status: "pago",
    });
    expect(f.state.operations.filter(op => op.kind === "select")).toHaveLength(
      3
    );
  });
});

describe("serviço comum com saldo real e fixture transacional", () => {
  function integrado(extra = {}) {
    const d = dados(extra);
    return criarDbWebhookBtgEmMemoria({
      condominios: [{ id: 2, ...taxas }],
      devedores: [{ id: 3, condominioId: 2, totalDue: 8000, status: "acordo" }],
      cobrancas: d.cobrancas.map(c => ({
        ...c,
        paidAt: null,
        paidAmount: null,
        description: "Origem sintética intacta",
      })),
      acordos: d.acordos,
      parcelasAcordo: d.parcelas.map(p => ({
        ...p,
        dueDate: NOW,
        paymentDate: null,
      })),
      acordoCobrancas: d.vinculos,
      auditLogs: [],
    });
  }
  async function receber(f: ReturnType<typeof integrado>, id = 5) {
    return f.db.transaction(async (tx: any) => {
      const ctx = await bloquearContextoRecebimentoAcordo(tx, id);
      return aplicarRecebimentoAcordo(tx, ctx, {
        valorPagoCentavos: ctx.parcela!.amount,
        dataPagamento: NOW,
        condominioId: 2,
        canal: "manual",
        ator: { userId: 11, userRole: "colaborador" },
      });
    });
  }
  it("primeira parcela recalcula só saldo negociado, última quita nominal sem rateio", async () => {
    const f = integrado();
    expect(await receber(f)).toMatchObject({
      aplicado: true,
      statusAcordo: "ativo",
      valorPagoTotal: 4000,
    });
    expect(f.state.tables.devedores[0]).toMatchObject({
      totalDue: 4000,
      status: "acordo",
    });
    expect(await receber(f, 6)).toMatchObject({
      aplicado: true,
      statusAcordo: "pago",
      valorPagoTotal: 8000,
    });
    expect(f.state.tables.devedores[0]).toMatchObject({
      totalDue: 0,
      status: "pago",
    });
    expect(f.state.tables.cobrancas[0]).toMatchObject({
      amount: 10000,
      description: "Origem sintética intacta",
      paidAmount: null,
      status: "pago",
    });
    expect(f.state.locks).toEqual([
      "acordos:update",
      "parcelasAcordo:update",
      "acordoCobrancas:update",
      "cobrancas:update",
      "devedores:update",
      "acordos:update",
      "parcelasAcordo:update",
      "acordoCobrancas:update",
      "cobrancas:update",
      "devedores:update",
    ]);
    expect(f.state.writes.every(w => w.inTransaction)).toBe(true);
  });
  it("quitar plano nunca zera outra dívida judicial do devedor", async () => {
    const f = integrado({
      cobrancas: [cob(), cob(2, { status: "judicial", amount: 2500 })],
      parcelas: [parcela(5, { amount: 8000 })],
    });
    expect(await receber(f)).toMatchObject({
      aplicado: true,
      statusAcordo: "pago",
    });
    expect(f.state.tables.devedores[0]).toMatchObject({
      totalDue: 2500,
      status: "ativo",
    });
    expect(f.state.tables.cobrancas[1].status).toBe("judicial");
  });
  it("quitar plano nunca quita nem duplica saldo do segundo acordo", async () => {
    const f = integrado({
      cobrancas: [cob(), cob(2)],
      acordos: [acordo(), acordo(8)],
      parcelas: [
        parcela(5, { amount: 8000 }),
        parcela(9, { acordoId: 8, amount: 8000 }),
      ],
      vinculos: [
        { id: 7, acordoId: 4, cobrancaId: 1 },
        { id: 10, acordoId: 8, cobrancaId: 2 },
      ],
    });
    expect(await receber(f)).toMatchObject({
      aplicado: true,
      statusAcordo: "pago",
    });
    expect(f.state.tables.devedores[0]).toMatchObject({
      totalDue: 8000,
      status: "acordo",
    });
    expect(f.state.tables.cobrancas[1].status).toBe("em_acordo");
  });
  it("falha de update do saldo desfaz parcela/acordo/origens e auditoria", async () => {
    const f = integrado({ parcelas: [parcela(5, { amount: 8000 })] });
    const antes = structuredClone(f.state.tables);
    f.state.failInjected = {
      table: "devedores",
      times: 1,
      message: "SALDO_UPDATE_FAILED",
    };
    await expect(receber(f)).rejects.toThrow("SALDO_UPDATE_FAILED");
    expect(f.state.tables).toEqual(antes);
    expect(f.state.rollbacks).toBe(1);
  });
});
