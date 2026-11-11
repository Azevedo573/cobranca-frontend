import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, getTableName } from "drizzle-orm";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";
import {
  aplicarRecebimentoAcordo,
  bloquearContextoRecebimentoAcordo,
  type DadosRecebimentoAcordo,
} from "./recebimento-acordo";
import { auditLogs, devedores } from "../drizzle/schema";

const saldo = vi.hoisted(() => ({ recalcular: vi.fn() }));
vi.mock("./saldo-devedor", () => ({
  recalcularSaldoDevedorTx: saldo.recalcular,
}));

const criacao = new Date("2026-10-01T12:00:00.000Z");
const pagamento = new Date("2026-11-11T20:30:00.000Z");
const anterior = new Date("2026-10-15T12:00:00.000Z");
function criarFixture(quantidade = 1) {
  return criarDbWebhookBtgEmMemoria({
    acordos: [
      {
        id: 3,
        devedorId: 4,
        condominioId: 1,
        status: "ativo",
        totalAmount: 1000,
        agreedAmount: 584 * quantidade,
        installments: quantidade,
        valorPago: 0,
        valorPagoAcordo: 77,
        notes: "Histórico sintético preservado",
        acordoOrigemId: 0,
        firstPaymentDate: criacao,
        paymentFrequency: "mensal",
        motivoQuebra: null,
        dataQuebra: null,
        createdAt: criacao,
        updatedAt: criacao,
      },
    ],
    parcelasAcordo: Array.from({ length: quantidade }, (_, i) => ({
      id: 10 + i,
      acordoId: 3,
      installmentNumber: i + 1,
      amount: 584,
      dueDate: criacao,
      paymentDate: null,
      status: "pendente",
      createdAt: criacao,
      snapshotPrincipal: 500,
      snapshotJuros: 30,
      snapshotMulta: 20,
      snapshotCorrecao: 10,
      snapshotHonorarios: 24,
      snapshotValorAtualizado: 584,
      snapshotDescricao: "Descrição sintética do snapshot",
      btgBankSlipUrl: "documento-sintetico",
      btgPixCopiaECola: null,
    })),
    acordoCobrancas: [
      {
        id: 20,
        acordoId: 3,
        cobrancaId: 30,
        valorOriginal: 700,
        createdAt: criacao,
      },
      {
        id: 21,
        acordoId: 3,
        cobrancaId: 31,
        valorOriginal: 300,
        createdAt: criacao,
      },
    ],
    cobrancas: [
      {
        id: 30,
        devedorId: 4,
        condominioId: 1,
        description: "Origem sintética A",
        amount: 700,
        custasJudiciais: 0,
        dueDate: criacao,
        status: "em_acordo",
        paidAt: null,
        paidAmount: null,
        createdAt: criacao,
        updatedAt: criacao,
      },
      {
        id: 31,
        devedorId: 4,
        condominioId: 1,
        description: "Origem sintética B",
        amount: 300,
        custasJudiciais: 0,
        dueDate: criacao,
        status: "acordo",
        paidAt: null,
        paidAmount: 5,
        createdAt: criacao,
        updatedAt: criacao,
      },
    ],
    devedores: [
      {
        id: 4,
        condominioId: 1,
        unitNumber: "fixture",
        totalDue: 584 * quantidade,
        status: "acordo",
        createdAt: criacao,
        updatedAt: criacao,
      },
    ],
    auditLogs: [],
  });
}
type Fixture = ReturnType<typeof criarFixture>;
const dados = (
  extra: Partial<DadosRecebimentoAcordo> = {}
): DadosRecebimentoAcordo => ({
  valorPagoCentavos: 584,
  dataPagamento: pagamento,
  condominioId: 1,
  canal: "btg_webhook",
  ator: { userId: null, userRole: "system" },
  emissaoId: 40,
  entregaId: 50,
  metodoPagamento: "QRCODE",
  ...extra,
});
async function receber(
  f: Fixture,
  parcelaId = 10,
  extra: Partial<DadosRecebimentoAcordo> = {}
) {
  return f.db.transaction(async (tx: any) => {
    const contexto = await bloquearContextoRecebimentoAcordo(tx, parcelaId);
    return aplicarRecebimentoAcordo(tx, contexto, dados(extra));
  });
}

beforeEach(() => {
  saldo.recalcular.mockReset();
  // O cálculo real é responsabilidade do helper; aqui simula somente seu update
  // estrito para comprovar atomicidade sem novo lock em pais após emissões.
  saldo.recalcular.mockImplementation(
    async (tx, devedorId, condominioId, now) => {
      const change = await tx
        .update(devedores)
        .set({ totalDue: 0, status: "pago", updatedAt: now })
        .where(
          and(
            eq(devedores.id, devedorId),
            eq(devedores.condominioId, condominioId)
          )
        );
      if (change[0]?.affectedRows !== 1)
        throw new Error("DEBTOR_UPDATE_FAILED");
      return { totalDue: 0, status: "pago" };
    }
  );
});

describe("contexto de recebimento de acordo — locks", () => {
  it("bloqueia acordo, todas parcelas, vínculos/origens e devedor nesta ordem", async () => {
    const f = criarFixture(3);
    const contexto = await f.db.transaction((tx: any) =>
      bloquearContextoRecebimentoAcordo(tx, 11)
    );
    expect(contexto.acordo?.id).toBe(3);
    expect(contexto.parcela?.id).toBe(11);
    expect(contexto.parcelas).toHaveLength(3);
    expect(contexto.origens.map(o => o.cobranca.id)).toEqual([30, 31]);
    expect(contexto.devedor?.id).toBe(4);
    expect(f.state.locks).toEqual([
      "acordos:update",
      "parcelasAcordo:update",
      "acordoCobrancas:update",
      "cobrancas:update",
      "devedores:update",
    ]);
    expect(f.state.writes).toHaveLength(0);
  });
  it("não bloqueia parcela antes do pai para referência inexistente", async () => {
    const f = criarFixture();
    const contexto = await f.db.transaction((tx: any) =>
      bloquearContextoRecebimentoAcordo(tx, 999)
    );
    expect(contexto.parcelas).toEqual([]);
    expect(contexto.origens).toEqual([]);
    expect(f.state.locks).toEqual([]);
    expect((await receber(f, 999)).codigo).toBe("ORIGIN_NOT_FOUND");
    expect(f.state.writes).toHaveLength(0);
  });
});

describe("recebimento integral e histórico", () => {
  it("quita acordo de uma parcela e origens sem rateio nem alteração nominal/snapshot", async () => {
    const f = criarFixture();
    const antes = structuredClone(f.state.tables);
    const result = await receber(f);
    expect(result).toEqual({
      codigo: null,
      aplicado: true,
      valorPagoTotal: 584,
      statusAcordo: "pago",
      cobrancasQuitadas: true,
      cobrancasIds: [30, 31],
    });
    expect(f.state.tables.parcelasAcordo[0]).toEqual({
      ...antes.parcelasAcordo[0],
      status: "pago",
      paymentDate: pagamento,
    });
    expect(f.state.tables.acordos[0]).toMatchObject({
      agreedAmount: 584,
      totalAmount: 1000,
      valorPago: 584,
      valorPagoAcordo: 77,
      notes: antes.acordos[0].notes,
      status: "pago",
    });
    for (let i = 0; i < 2; i++) {
      expect(f.state.tables.cobrancas[i]).toMatchObject({
        ...antes.cobrancas[i],
        status: "pago",
        paidAt: pagamento,
        updatedAt: f.state.tables.cobrancas[i].updatedAt,
      });
      const writes = f.state.writes.filter(w => w.table === "cobrancas");
      expect(
        writes.every(
          w =>
            !Object.hasOwn(w.values!, "paidAmount") &&
            !Object.hasOwn(w.values!, "amount") &&
            !Object.hasOwn(w.values!, "description")
        )
      ).toBe(true);
    }
    expect(f.state.tables.acordoCobrancas).toEqual(antes.acordoCobrancas);
    expect(saldo.recalcular).toHaveBeenCalledOnce();
    expect(saldo.recalcular.mock.calls[0].slice(1, 3)).toEqual([4, 1]);
    expect(f.state.writes.every(w => w.inTransaction)).toBe(true);
    expect(new Set(f.state.writes.map(w => w.table))).toEqual(
      new Set([
        "parcelasAcordo",
        "acordos",
        "cobrancas",
        "devedores",
        "auditLogs",
      ])
    );
  });
  it("primeira parcela não quita origens nem reativa acordo inadimplente", async () => {
    const f = criarFixture(3);
    f.state.tables.acordos[0].status = "inadimplente";
    const origensAntes = structuredClone(f.state.tables.cobrancas);
    const result = await receber(f);
    expect(result).toMatchObject({
      aplicado: true,
      valorPagoTotal: 584,
      statusAcordo: "inadimplente",
      cobrancasQuitadas: false,
      cobrancasIds: [],
    });
    expect(f.state.tables.cobrancas).toEqual(origensAntes);
    expect(f.state.tables.acordos[0].valorPagoAcordo).toBe(77);
  });
  it("última parcela soma nominais históricos e não altera datas/snapshots anteriores", async () => {
    const f = criarFixture(3);
    for (const p of f.state.tables.parcelasAcordo.slice(0, 2)) {
      p.status = "pago";
      p.paymentDate = anterior;
    }
    f.state.tables.acordos[0].valorPago = 2;
    f.state.tables.acordos[0].status = "inadimplente";
    const historicas = structuredClone(
      f.state.tables.parcelasAcordo.slice(0, 2)
    );
    const result = await receber(f, 12);
    expect(result).toMatchObject({
      aplicado: true,
      valorPagoTotal: 1752,
      statusAcordo: "pago",
      cobrancasQuitadas: true,
    });
    expect(f.state.tables.parcelasAcordo.slice(0, 2)).toEqual(historicas);
    expect(f.state.tables.acordos[0].valorPagoAcordo).toBe(77);
  });
  it("preserva origem já paga e sua data histórica", async () => {
    const f = criarFixture();
    Object.assign(f.state.tables.cobrancas[0], {
      status: "pago",
      paidAt: anterior,
      paidAmount: 3,
    });
    const origemAntes = structuredClone(f.state.tables.cobrancas[0]);
    expect((await receber(f)).aplicado).toBe(true);
    expect(f.state.tables.cobrancas[0]).toEqual(origemAntes);
  });
  it("duplicata paga não repara valorPago ou cascata histórica", async () => {
    const f = criarFixture();
    Object.assign(f.state.tables.parcelasAcordo[0], {
      status: "pago",
      paymentDate: anterior,
    });
    f.state.tables.acordos[0].valorPago = 9;
    const antes = structuredClone(f.state.tables);
    expect(await receber(f)).toEqual({
      codigo: null,
      aplicado: false,
      valorPagoTotal: 9,
      statusAcordo: "ativo",
      cobrancasQuitadas: false,
      cobrancasIds: [],
    });
    expect(f.state.tables).toEqual(antes);
    expect(f.state.writes).toEqual([]);
    expect(saldo.recalcular).not.toHaveBeenCalled();
  });
  it("cancelada de outra parcela nunca conta como quitação antecipada", async () => {
    const f = criarFixture(2);
    f.state.tables.parcelasAcordo[1].status = "cancelado";
    const result = await receber(f);
    expect(result).toMatchObject({
      aplicado: true,
      statusAcordo: "ativo",
      cobrancasQuitadas: false,
      valorPagoTotal: 584,
    });
    expect(f.state.tables.cobrancas.every(c => c.status !== "pago")).toBe(true);
  });
  it("plano com entrada e muitas parcelas usa todos os nominais, sem presumir contagem", async () => {
    const f = criarFixture(60);
    f.state.tables.acordos[0].installments = 59;
    f.state.tables.parcelasAcordo[0].installmentNumber = 0;
    for (const p of f.state.tables.parcelasAcordo.slice(0, 59)) {
      p.status = "pago";
      p.paymentDate = anterior;
    }
    expect(await receber(f, 69)).toMatchObject({
      aplicado: true,
      statusAcordo: "pago",
      valorPagoTotal: 35040,
    });
  });
});

describe("guardas — divergência retorna código estático e ZERO writes", () => {
  const casos: Array<[string, (f: Fixture) => void, string]> = [
    [
      "acordo ausente",
      f => {
        f.state.tables.acordos = [];
      },
      "ORIGIN_NOT_FOUND",
    ],
    [
      "devedor ausente",
      f => {
        f.state.tables.devedores = [];
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "acordo cancelado",
      f => {
        f.state.tables.acordos[0].status = "cancelado";
      },
      "ORIGIN_NOT_ELIGIBLE",
    ],
    [
      "acordo pago com parcela aberta",
      f => {
        f.state.tables.acordos[0].status = "pago";
      },
      "ORIGIN_NOT_ELIGIBLE",
    ],
    [
      "parcela cancelada",
      f => {
        f.state.tables.parcelasAcordo[0].status = "cancelado";
      },
      "ORIGIN_NOT_ELIGIBLE",
    ],
    [
      "data histórica suspeita em parcela aberta",
      f => {
        f.state.tables.parcelasAcordo[0].paymentDate = anterior;
      },
      "ORIGIN_NOT_ELIGIBLE",
    ],
    [
      "condomínio do acordo cruzado",
      f => {
        f.state.tables.acordos[0].condominioId = 2;
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "condomínio do devedor cruzado",
      f => {
        f.state.tables.devedores[0].condominioId = 2;
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "condomínio da origem cruzado",
      f => {
        f.state.tables.cobrancas[1].condominioId = 2;
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "devedor da origem cruzado",
      f => {
        f.state.tables.cobrancas[1].devedorId = 5;
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "vínculo sem origem",
      f => {
        f.state.tables.cobrancas.pop();
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "sem vínculos",
      f => {
        f.state.tables.acordoCobrancas = [];
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "origem cancelada",
      f => {
        f.state.tables.cobrancas[1].status = "cancelado";
      },
      "ORIGIN_NOT_ELIGIBLE",
    ],
    [
      "origem duplicada no vínculo",
      f => {
        f.state.tables.acordoCobrancas[1].cobrancaId = 30;
      },
      "ORIGIN_SCOPE_MISMATCH",
    ],
    [
      "plano nominal divergente",
      f => {
        f.state.tables.acordos[0].agreedAmount = 585;
      },
      "AGREEMENT_PLAN_MISMATCH",
    ],
    [
      "nominal inválido",
      f => {
        f.state.tables.parcelasAcordo[0].amount = -1;
      },
      "ORIGIN_AMOUNT_MISMATCH",
    ],
  ];
  it.each(casos)("%s", async (_nome, alterar, codigo) => {
    const f = criarFixture();
    alterar(f);
    const antes = structuredClone(f.state.tables);
    expect((await receber(f)).codigo).toBe(codigo);
    expect(f.state.tables).toEqual(antes);
    expect(f.state.writes).toHaveLength(0);
    expect(saldo.recalcular).not.toHaveBeenCalled();
  });
  it.each([0, -1, 583, 585, 5.84, Number.NaN, Number.MAX_SAFE_INTEGER])(
    "valor recebido inválido ou divergente: %s",
    async valor => {
      const f = criarFixture();
      expect((await receber(f, 10, { valorPagoCentavos: valor })).codigo).toBe(
        "PAYMENT_AMOUNT_MISMATCH"
      );
      expect(f.state.writes).toHaveLength(0);
    }
  );
  it("data inválida e condomínio do caller inválido não gravam", async () => {
    const f = criarFixture();
    expect(
      (await receber(f, 10, { dataPagamento: new Date("invalid") })).codigo
    ).toBe("PAYMENT_DATE_INVALID");
    expect((await receber(f, 10, { condominioId: 2 })).codigo).toBe(
      "ORIGIN_SCOPE_MISMATCH"
    );
    expect(f.state.writes).toHaveLength(0);
  });
  it.each(["ativo", "inadimplente"])(
    "reutilização em outro acordo %s é recusada sem lock inverso",
    async status => {
      const f = criarFixture();
      f.state.tables.acordos.push({
        ...f.state.tables.acordos[0],
        id: 8,
        status,
      });
      f.state.tables.acordoCobrancas.push({
        id: 22,
        acordoId: 8,
        cobrancaId: 30,
        valorOriginal: 700,
      });
      expect((await receber(f)).codigo).toBe(
        "ORIGIN_REUSED_BY_ACTIVE_AGREEMENT"
      );
      expect(f.state.writes).toHaveLength(0);
      expect(f.state.locks.filter(l => l === "acordos:update")).toHaveLength(1);
      const lastLock = f.state.operations.findLastIndex(o =>
        o.kind.startsWith("lock:")
      );
      expect(
        f.state.operations
          .slice(lastLock + 1)
          .every(o => !o.kind.startsWith("lock:"))
      ).toBe(true);
    }
  );
  it("vínculo com acordo cancelado anterior não bloqueia o acordo atual", async () => {
    const f = criarFixture();
    f.state.tables.acordos.push({
      ...f.state.tables.acordos[0],
      id: 8,
      status: "cancelado",
    });
    f.state.tables.acordoCobrancas.push({
      id: 22,
      acordoId: 8,
      cobrancaId: 30,
      valorOriginal: 700,
    });
    expect((await receber(f)).aplicado).toBe(true);
  });
  it("revalida parcela pertencente ao conjunto bloqueado", async () => {
    const f = criarFixture();
    const result = await f.db.transaction(async (tx: any) => {
      const contexto = await bloquearContextoRecebimentoAcordo(tx, 10);
      contexto.parcela = { ...contexto.parcela!, acordoId: 8 };
      return aplicarRecebimentoAcordo(tx, contexto, dados());
    });
    expect(result.codigo).toBe("ORIGIN_SCOPE_MISMATCH");
    expect(f.state.writes).toHaveLength(0);
  });
});

describe("auditoria mínima e rollback", () => {
  it.each(["btg_webhook", "btg_conciliacao", "manual"] as const)(
    "canal %s audita IDs, valor, data e método seguro",
    async canal => {
      const f = criarFixture();
      await receber(f, 10, {
        canal,
        ator: {
          userId: canal === "manual" ? 2 : null,
          userRole: canal === "manual" ? "admin" : "system",
        },
      });
      expect(f.state.tables.auditLogs).toHaveLength(1);
      const audit = f.state.tables.auditLogs[0];
      expect(audit).toMatchObject({
        action: "pay_parcela",
        entity: "parcela",
        entityId: "10",
        condominioId: 1,
        success: 1,
        severity: "info",
      });
      const metadata = JSON.parse(audit.metadata);
      expect(metadata).toMatchObject({
        evento: "recebimento_acordo",
        acordoId: 3,
        parcelaId: 10,
        devedorId: 4,
        valorPagoCentavos: 584,
        valorPagoTotal: 584,
        dataPagamento: pagamento.toISOString(),
        canal,
        metodoPagamento: "QRCODE",
        emissaoId: 40,
        entregaId: 50,
        cobrancasIds: [30, 31],
      });
      expect(audit.userName).toBeNull();
      expect(audit.userEmail).toBeNull();
      expect(audit.beforeData).toBeNull();
      expect(audit.afterData).toBeNull();
      expect(audit.metadata).not.toContain("Descrição");
      expect(audit.metadata).not.toContain("Histórico");
    }
  );
  it("não copia texto arbitrário de método/role para auditoria", async () => {
    const f = criarFixture();
    await receber(f, 10, {
      metodoPagamento: "texto-sintetico-nao-enum",
      ator: { userId: null, userRole: "texto-sintetico-nao-role" },
    });
    expect(f.state.tables.auditLogs[0].userRole).toBe("unknown");
    expect(
      JSON.parse(f.state.tables.auditLogs[0].metadata).metodoPagamento
    ).toBeNull();
    expect(JSON.stringify(f.state.tables.auditLogs)).not.toContain(
      "texto-sintetico"
    );
  });
  it.each(["parcelasAcordo", "acordos", "cobrancas", "devedores"])(
    "falha em update %s desfaz toda a transação",
    async table => {
      const f = criarFixture();
      const antes = structuredClone(f.state.tables);
      f.state.failInjected = { table, times: 1 };
      await expect(receber(f)).rejects.toThrow();
      expect(f.state.tables).toEqual(antes);
      expect(f.state.writes).toHaveLength(0);
      expect(f.state.rollbacks).toBe(1);
    }
  );
  it.each(["parcelasAcordo", "acordos", "cobrancas", "devedores"])(
    "affectedRows zero em %s não aceita sucesso",
    async table => {
      const f = criarFixture();
      const antes = structuredClone(f.state.tables);
      const update = f.db.update.bind(f.db);
      f.db.update = (target: any) =>
        getTableName(target) === table
          ? { set: () => ({ where: async () => [{ affectedRows: 0 }] }) }
          : update(target);
      await expect(receber(f)).rejects.toThrow();
      expect(f.state.tables).toEqual(antes);
      expect(f.state.rollbacks).toBe(1);
    }
  );
  it.each(["throw", "zero", "two"])(
    "falha de auditoria (%s) reverte parcela/acordo/origens/saldo",
    async mode => {
      const f = criarFixture();
      const antes = structuredClone(f.state.tables);
      const insert = f.db.insert.bind(f.db);
      f.db.insert = (table: any) =>
        table === auditLogs
          ? {
              values: async () => {
                if (mode === "throw") throw new Error("INJECTED_AUDIT_FAILURE");
                return [{ affectedRows: mode === "zero" ? 0 : 2 }];
              },
            }
          : insert(table);
      await expect(receber(f)).rejects.toThrow();
      expect(f.state.tables).toEqual(antes);
      expect(f.state.writes).toHaveLength(0);
      expect(f.state.rollbacks).toBe(1);
    }
  );
  it("helper falha e provoca rollback sem auditoria parcial", async () => {
    const f = criarFixture();
    const antes = structuredClone(f.state.tables);
    saldo.recalcular.mockRejectedValueOnce(new Error("SALDO_FAILED"));
    await expect(receber(f)).rejects.toThrow("SALDO_FAILED");
    expect(f.state.tables).toEqual(antes);
    expect(f.state.rollbacks).toBe(1);
  });
  it("canais concorrentes serializados aplicam apenas uma vez na fixture", async () => {
    const f = criarFixture();
    const result = await Promise.all([
      receber(f),
      receber(f, 10, { canal: "manual" }),
      receber(f, 10, { canal: "btg_conciliacao" }),
    ]);
    expect(result.filter(r => r.aplicado)).toHaveLength(1);
    expect(f.state.tables.auditLogs).toHaveLength(1);
    expect(saldo.recalcular).toHaveBeenCalledOnce();
    expect(f.state.tables.parcelasAcordo[0].paymentDate).toEqual(pagamento);
  });
  it("outras dívidas não são zeradas pelo serviço; delega ao helper", async () => {
    const f = criarFixture();
    f.state.tables.cobrancas.push({
      ...f.state.tables.cobrancas[0],
      id: 90,
      status: "pendente",
      amount: 900,
    });
    saldo.recalcular.mockResolvedValueOnce({ totalDue: 900, status: "ativo" });
    const outra = structuredClone(f.state.tables.cobrancas[2]);
    expect((await receber(f)).aplicado).toBe(true);
    expect(f.state.tables.cobrancas[2]).toEqual(outra);
    expect(f.state.writes.filter(w => w.table === "devedores")).toHaveLength(0);
    expect(saldo.recalcular.mock.calls[0][3]).toBeInstanceOf(Date);
  });
});

describe("fonte/data, entradas inválidas e helper de saldo real", () => {
  it.each(["banco", "processamento"] as const)(
    "audita fonte %s sem inferir momento bancário",
    async fonteDataPagamento => {
      const f = criarFixture();
      await receber(f, 10, { fonteDataPagamento, liquidadoEm: pagamento });
      expect(JSON.parse(f.state.tables.auditLogs[0].metadata)).toMatchObject({
        fonteDataPagamento,
        liquidadoEm: pagamento.toISOString(),
        dataPagamento: pagamento.toISOString(),
      });
    }
  );
  it("manual tem fonte manual padrão; banco sem fonte não é inventado", async () => {
    const f = criarFixture();
    await receber(f, 10, { canal: "manual" });
    expect(
      JSON.parse(f.state.tables.auditLogs[0].metadata).fonteDataPagamento
    ).toBe("manual");
    const f2 = criarFixture();
    await receber(f2);
    expect(
      JSON.parse(f2.state.tables.auditLogs[0].metadata).fonteDataPagamento
    ).toBeNull();
  });
  it.each([
    { liquidadoEm: new Date("invalid") },
    { fonteDataPagamento: "texto-nao-enum" },
    { canal: "texto-nao-canal" },
    { ator: { userId: -1, userRole: "admin" } },
    { emissaoId: 0 },
    { entregaId: Number.MAX_SAFE_INTEGER },
  ])("entrada inválida %j retorna sem writes", async extra => {
    const f = criarFixture();
    const result = await receber(
      f,
      10,
      extra as Partial<DadosRecebimentoAcordo>
    );
    expect(result.codigo).toMatch(/^PAYMENT_(DATE_INVALID|CONTEXT_INVALID)$/);
    expect(f.state.writes).toHaveLength(0);
  });
  it.each([
    "valor acima do int",
    "plano com decimal",
    "parcela de outro acordo",
  ])("plano inválido: %s não grava", async caso => {
    const f = criarFixture(2);
    if (caso === "valor acima do int")
      f.state.tables.acordos[0].agreedAmount = 2_147_483_648;
    if (caso === "plano com decimal")
      f.state.tables.parcelasAcordo[1].amount = 1.5;
    if (caso === "parcela de outro acordo")
      f.state.tables.parcelasAcordo[1].acordoId = 8;
    expect((await receber(f)).aplicado).toBe(false);
    expect(f.state.writes).toHaveLength(0);
  });
  it("origem cancelada e plano incoerente são recusados mesmo antes da última parcela", async () => {
    const f = criarFixture(2);
    f.state.tables.cobrancas[0].status = "cancelado";
    expect((await receber(f)).codigo).toBe("ORIGIN_NOT_ELIGIBLE");
    const f2 = criarFixture(2);
    f2.state.tables.acordos[0].agreedAmount++;
    expect((await receber(f2)).codigo).toBe("AGREEMENT_PLAN_MISMATCH");
    expect(f.state.writes).toHaveLength(0);
    expect(f2.state.writes).toHaveLength(0);
  });
  it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
    "parcelaId inválido %s não solicita locks ou writes",
    async parcelaId => {
      const f = criarFixture();
      expect((await receber(f, parcelaId)).codigo).toBe("ORIGIN_NOT_FOUND");
      expect(f.state.locks).toEqual([]);
      expect(f.state.writes).toEqual([]);
    }
  );
  it.each([1, 2])(
    "helper real conserva saldo correto para plano com %s parcela(s) e outra dívida",
    async quantidade => {
      const real =
        await vi.importActual<typeof import("./saldo-devedor")>(
          "./saldo-devedor"
        );
      saldo.recalcular.mockImplementationOnce(real.recalcularSaldoDevedorTx);
      const f = criarFixture(quantidade);
      f.state.tables.cobrancas.push({
        ...f.state.tables.cobrancas[0],
        id: 90,
        amount: 900,
        status: "pendente",
      });
      await receber(f);
      expect(f.state.tables.devedores[0]).toMatchObject({
        totalDue: quantidade === 1 ? 900 : 1484,
        status: "ativo",
      });
      expect(f.state.tables.cobrancas[2]).toMatchObject({
        status: "pendente",
        amount: 900,
      });
      expect(f.state.locks).toEqual([
        "acordos:update",
        "parcelasAcordo:update",
        "acordoCobrancas:update",
        "cobrancas:update",
        "devedores:update",
      ]);
    }
  );
  it("helper real mantém outro acordo sem duplicar suas origens", async () => {
    const real =
      await vi.importActual<typeof import("./saldo-devedor")>(
        "./saldo-devedor"
      );
    saldo.recalcular.mockImplementationOnce(real.recalcularSaldoDevedorTx);
    const f = criarFixture();
    f.state.tables.acordos.push({
      ...f.state.tables.acordos[0],
      id: 8,
      agreedAmount: 200,
      valorPago: 0,
    });
    f.state.tables.parcelasAcordo.push({
      ...f.state.tables.parcelasAcordo[0],
      id: 80,
      acordoId: 8,
      amount: 200,
    });
    f.state.tables.cobrancas.push({
      ...f.state.tables.cobrancas[0],
      id: 90,
      amount: 900,
    });
    f.state.tables.acordoCobrancas.push({
      id: 22,
      acordoId: 8,
      cobrancaId: 90,
      valorOriginal: 900,
    });
    await receber(f);
    expect(f.state.tables.devedores[0]).toMatchObject({
      totalDue: 200,
      status: "acordo",
    });
    expect(f.state.tables.acordos[1]).toMatchObject({
      status: "ativo",
      valorPago: 0,
    });
    expect(f.state.tables.parcelasAcordo[1].status).toBe("pendente");
    expect(f.state.tables.cobrancas[2].status).toBe("em_acordo");
    expect(f.state.locks.filter(l => l === "acordos:update")).toHaveLength(1);
  });
});
