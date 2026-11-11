import type { Request, Response } from "express";
import { getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";

// Apenas infraestrutura é substituída: webhook, conversão, recebimento e saldo
// executam suas implementações reais, sem driver nem chamadas bancárias.
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./btg-v2/config", () => ({ getBtgV2ServerConfig: mocks.config }));
import { webhookBtgV2Handler } from "./btg-v2/webhook";

const SECRET = "integration-fixture-only-not-a-real-secret";
const INITIAL = new Date("2026-11-01T12:00:00.000Z");
const PAID_AT = "2026-11-11T15:30:00.000Z";
const DUE = new Date("2026-12-01T12:00:00.000Z");
const AMOUNT = 584; // Interno sempre em centavos; payload externo em reais.
const agreement = {
  id: 711,
  devedorId: 721,
  condominioId: 702,
  status: "ativo",
  installments: 1,
  totalAmount: 1000,
  agreedAmount: AMOUNT,
  valorPago: 0,
  valorPagoAcordo: 0,
  firstPaymentDate: DUE,
  createdAt: INITIAL,
  updatedAt: INITIAL,
};
const installment = {
  id: 731,
  acordoId: agreement.id,
  installmentNumber: 1,
  amount: AMOUNT,
  dueDate: DUE,
  status: "pendente",
  paymentDate: null,
  canalBancario: "api_btg_v2",
  snapshotPrincipal: 500,
  snapshotJuros: 30,
  snapshotMulta: 10,
  snapshotCorrecao: 20,
  snapshotHonorarios: 24,
  snapshotValorAtualizado: AMOUNT,
  snapshotDescricao: "Parcela inteiramente fictícia com encargos preservados",
  createdAt: INITIAL,
};
const origin = {
  id: 741,
  devedorId: 721,
  condominioId: 702,
  status: "em_acordo",
  description: "Cota fictícia nominal preservada, com desconto negociado",
  amount: 1000,
  custasJudiciais: 0,
  dueDate: DUE,
  paidAt: null,
  paidAmount: null,
  createdAt: INITIAL,
  updatedAt: INITIAL,
};
const debtor = {
  id: 721,
  condominioId: 702,
  name: "Devedor fictício integração",
  unitNumber: "TESTE",
  status: "acordo",
  totalDue: AMOUNT,
  createdAt: INITIAL,
  updatedAt: INITIAL,
};
const emission = {
  id: 751,
  btgIntegracaoId: 707,
  btgContaRecebedoraId: 715,
  condominioId: 702,
  origemTipo: "parcela_acordo",
  origemId: installment.id,
  revisao: 1,
  instrumento: "bolepix",
  externalId: "ficticio-731",
  idempotencyKey: "ficticio-idem-731",
  btgCollectionId: "ficticio-collection-731",
  status: "emitida",
  amount: AMOUNT,
  dueDate: DUE,
  erroCodigo: null,
  createdAt: INITIAL,
  updatedAt: INITIAL,
};
const link = {
  id: 761,
  acordoId: agreement.id,
  cobrancaId: origin.id,
  valorOriginal: 1000,
  createdAt: INITIAL,
};
const financialTables = [
  "btgCobrancasEmitidas",
  "parcelasAcordo",
  "acordos",
  "cobrancas",
  "acordoCobrancas",
  "devedores",
  "auditLogs",
];
let fixture: ReturnType<typeof criarDbWebhookBtgEmMemoria>;
let fetchMock: ReturnType<typeof vi.fn>;

function setup(overrides: Record<string, any[]> = {}) {
  fixture = criarDbWebhookBtgEmMemoria({
    btgIntegracoes: [
      {
        id: 707,
        ambiente: "producao",
        companyId: "ficticio-company",
        ativo: 1,
        emissaoHabilitada: 0,
      },
    ],
    btgContaRecebedoraCondominios: [
      {
        id: 701,
        btgIntegracaoId: 707,
        btgContaRecebedoraId: 715,
        condominioId: 702,
        ativo: 1,
      },
    ],
    condominios: [
      {
        id: 702,
        name: "Condomínio fictício integração",
        taxaJurosMensal: "0.00",
        taxaMulta: "0.00",
        taxaHonorarios: "0.00",
        correcaoMonetaria: "0.00",
        indiceCorrecao: "NENHUM",
        aplicarCorrecaoAuto: 0,
      },
    ],
    devedores: [debtor],
    acordos: [agreement],
    parcelasAcordo: [installment],
    cobrancas: [origin],
    acordoCobrancas: [link],
    btgCobrancasEmitidas: [emission],
    btgWebhookEntregas: [],
    btgCancelamentos: [],
    auditLogs: [],
    ...overrides,
  });
  mocks.getDb.mockResolvedValue(fixture.db);
}
function payment(data: Record<string, unknown> = {}) {
  return {
    event: "collections.paid",
    data: {
      collectionId: emission.btgCollectionId,
      status: "PAID",
      amountPaid: AMOUNT / 100,
      paidAt: PAID_AT,
      paymentMethod: "QRCODE",
      ...data,
    },
  };
}
async function call(payload: unknown = payment()) {
  const req = {
    params: { ambiente: "producao" },
    body: Buffer.from(JSON.stringify(payload)),
    headers: { authorization: `Bearer ${SECRET}` },
    rawHeaders: ["Authorization", `Bearer ${SECRET}`],
  } as unknown as Request;
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await webhookBtgV2Handler(req, res as unknown as Response);
  expect(res.json).toHaveBeenCalledTimes(1);
  return {
    status: res.status.mock.calls.at(-1)![0] as number,
    body: res.json.mock.calls[0][0] as Record<string, unknown>,
  };
}
function snapshot() {
  return structuredClone(
    Object.fromEntries(
      financialTables.map(table => [table, fixture.state.tables[table]])
    )
  );
}
function audits() {
  return fixture.state.tables.auditLogs.filter(
    row => row.action === "pay_parcela"
  );
}
function expectSingleReceipt() {
  expect(audits()).toHaveLength(1);
  expect(audits()[0]).toMatchObject({
    action: "pay_parcela",
    entity: "parcela",
    entityId: String(installment.id),
    condominioId: 702,
    success: 1,
  });
  expect(JSON.parse(audits()[0].metadata)).toMatchObject({
    evento: "recebimento_acordo",
    acordoId: agreement.id,
    parcelaId: installment.id,
    devedorId: debtor.id,
    canal: "btg_webhook",
    metodoPagamento: "QRCODE",
    dataPagamento: PAID_AT,
    fonteDataPagamento: "banco",
    emissaoId: emission.id,
    entregaId: expect.any(Number),
  });
  expect(JSON.parse(audits()[0].metadata).valorPagoCentavos).toBe(
    fixture.state.tables.parcelasAcordo[0].amount
  );
  expect(
    fixture.state.writes.filter(
      w => w.table === "auditLogs" && w.kind === "insert"
    )
  ).toEqual([
    expect.objectContaining({
      inTransaction: true,
      affected: 1,
      values: expect.objectContaining({ action: "pay_parcela" }),
    }),
  ]);
}
function expectSettled() {
  expect(fixture.state.tables.parcelasAcordo[0]).toMatchObject({
    ...installment,
    status: "pago",
    paymentDate: new Date(PAID_AT),
  });
  expect(fixture.state.tables.acordos[0]).toMatchObject({
    status: "pago",
    agreedAmount: AMOUNT,
    totalAmount: 1000,
    valorPago: AMOUNT,
    valorPagoAcordo: 0,
  });
  expect(fixture.state.tables.cobrancas[0]).toMatchObject({
    ...origin,
    status: "pago",
    paidAt: new Date(PAID_AT),
    paidAmount: null,
    updatedAt: expect.any(Date),
  });
  expect(fixture.state.tables.acordoCobrancas).toEqual([link]);
  expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({
    status: "paga",
    amount: AMOUNT,
  });
  expectSingleReceipt();
}
function failInsertAudit(mode: "throw" | "zero") {
  const insert = fixture.db.insert.getMockImplementation()!;
  let pending = true;
  fixture.db.insert.mockImplementation((table: any) => {
    if (getTableName(table) === "auditLogs" && pending) {
      pending = false;
      return {
        values: () =>
          mode === "throw"
            ? Promise.reject(new Error("injected audit failure"))
            : Promise.resolve([{ affectedRows: 0 }]),
      };
    }
    return insert(table);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({
    ambiente: "producao",
    companyId: "ficticio-company",
    apiBaseUrl: "https://fixture.invalid",
  });
  vi.stubEnv("BTG_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("BTG_SANDBOX_CREDENTIAL_CHECK", "false");
  fetchMock = vi.fn().mockRejectedValue(new Error("BTG real forbidden"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setup();
});
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("BTG — recebimento completo fictício, sem baixa bancária real", () => {
  it("5.84 reais quita uma parcela de 584, remove em_acordo e preserva nominal/descrição/snapshots", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expectSettled();
    expect(fixture.state.tables.devedores[0]).toMatchObject({
      status: "pago",
      totalDue: 0,
    });
    expect(
      fixture.state.writes
        .filter(w => financialTables.includes(w.table ?? ""))
        .every(w => w.inTransaction)
    ).toBe(true);
    const locks = fixture.state.operations.filter(o =>
      o.kind.startsWith("lock:")
    );
    for (const table of [
      "acordos",
      "parcelasAcordo",
      "acordoCobrancas",
      "cobrancas",
      "devedores",
      "btgCobrancasEmitidas",
    ]) {
      expect(locks.some(o => o.table === table && o.inTransaction)).toBe(true);
    }
    const position = (table: string) => locks.findIndex(o => o.table === table);
    expect(position("parcelasAcordo")).toBeGreaterThan(position("acordos"));
    expect(position("btgCobrancasEmitidas")).toBeGreaterThan(
      position("devedores")
    );
  });
  it("paidAmount comprova o mesmo recebimento decimal sem depender de amount nominal", async () => {
    expect(
      await call(payment({ amountPaid: undefined, paidAmount: 5.84 }))
    ).toEqual({ status: 200, body: { ok: true } });
    expectSettled();
  });
  it("inteiro externo 5 significa 500 centavos, sem heurística por valor local", async () => {
    setup({
      parcelasAcordo: [
        { ...installment, amount: 500, snapshotValorAtualizado: 500 },
      ],
      acordos: [{ ...agreement, agreedAmount: 500 }],
      btgCobrancasEmitidas: [{ ...emission, amount: 500 }],
      devedores: [{ ...debtor, totalDue: 500 }],
    });
    expect(await call(payment({ amountPaid: 5 }))).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(fixture.state.tables.acordos[0]).toMatchObject({
      status: "pago",
      valorPago: 500,
    });
    expectSingleReceipt();
  });
  it("outra dívida preserva saldo e impede marcar devedor pago após quitação", async () => {
    const other = {
      ...origin,
      id: 742,
      description: "Outra dívida fictícia",
      status: "pendente",
      amount: 300,
    };
    setup({
      cobrancas: [origin, other],
      devedores: [{ ...debtor, totalDue: AMOUNT + 300 }],
    });
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expectSettled();
    expect(fixture.state.tables.cobrancas[1]).toEqual(other);
    expect(fixture.state.tables.devedores[0]).toMatchObject({
      status: "ativo",
      totalDue: 300,
    });
  });
  it("duas origens ficam quitadas sem duplicar 584 recebidos nem inventar paidAmount por rateio", async () => {
    const second = {
      ...origin,
      id: 742,
      amount: 700,
      description: "Segunda origem fictícia preservada",
    };
    const secondLink = {
      ...link,
      id: 762,
      cobrancaId: second.id,
      valorOriginal: second.amount,
    };
    setup({
      acordos: [{ ...agreement, totalAmount: origin.amount + second.amount }],
      cobrancas: [origin, second],
      acordoCobrancas: [link, secondLink],
    });
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.acordos[0]).toMatchObject({
      status: "pago",
      valorPago: AMOUNT,
      agreedAmount: AMOUNT,
      totalAmount: origin.amount + second.amount,
    });
    expect(fixture.state.tables.cobrancas).toEqual([
      {
        ...origin,
        status: "pago",
        paidAt: new Date(PAID_AT),
        updatedAt: expect.any(Date),
      },
      {
        ...second,
        status: "pago",
        paidAt: new Date(PAID_AT),
        updatedAt: expect.any(Date),
      },
    ]);
    expect(fixture.state.tables.acordoCobrancas).toEqual([link, secondLink]);
    expect(fixture.state.tables.devedores[0]).toMatchObject({
      status: "pago",
      totalDue: 0,
    });
    expectSingleReceipt();
    expect(JSON.parse(audits()[0].metadata).cobrancasIds).toEqual([741, 742]);
  });
  it.each(["ativo", "inadimplente"])(
    "primeira parcela não quita origens nem encerra plano %s",
    async status => {
      setup({
        acordos: [
          {
            ...agreement,
            status,
            agreedAmount: AMOUNT * 2,
            installments: 2,
            totalAmount: 1500,
          },
        ],
        parcelasAcordo: [
          installment,
          { ...installment, id: 732, installmentNumber: 2 },
        ],
        cobrancas: [{ ...origin, amount: 1500 }],
        acordoCobrancas: [{ ...link, valorOriginal: 1500 }],
        devedores: [{ ...debtor, totalDue: AMOUNT * 2 }],
      });
      const original = structuredClone(fixture.state.tables.cobrancas);
      expect(await call()).toEqual({ status: 200, body: { ok: true } });
      expect(fixture.state.tables.acordos[0]).toMatchObject({
        status,
        valorPago: AMOUNT,
        agreedAmount: AMOUNT * 2,
      });
      expect(fixture.state.tables.parcelasAcordo.map(p => p.status)).toEqual([
        "pago",
        "pendente",
      ]);
      expect(fixture.state.tables.cobrancas).toEqual(original);
      expect(fixture.state.tables.devedores[0].totalDue).toBe(AMOUNT);
      expect(fixture.state.tables.devedores[0].status).not.toBe("pago");
      expectSingleReceipt();
    }
  );
  it("última parcela soma histórico nominal sem repetir receita ou inventar rateio nas origens", async () => {
    const oldDate = new Date("2026-11-02T12:00:00.000Z");
    const historical = {
      ...installment,
      id: 732,
      installmentNumber: 2,
      status: "pago",
      paymentDate: oldDate,
    };
    setup({
      acordos: [
        {
          ...agreement,
          agreedAmount: AMOUNT * 2,
          installments: 2,
          valorPago: AMOUNT,
        },
      ],
      parcelasAcordo: [installment, historical],
    });
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.acordos[0]).toMatchObject({
      status: "pago",
      valorPago: AMOUNT * 2,
      valorPagoAcordo: 0,
    });
    expect(fixture.state.tables.parcelasAcordo[1]).toEqual(historical);
    expect(fixture.state.tables.cobrancas[0]).toMatchObject({
      status: "pago",
      amount: origin.amount,
      description: origin.description,
      paidAmount: null,
    });
    expectSingleReceipt();
  });
  it("duplicata idêntica ou novo envelope paid não reaplica pagamento/cascata/auditoria", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    const before = snapshot();
    const count = fixture.state.writes.filter(w =>
      financialTables.includes(w.table ?? "")
    ).length;
    expect(await call()).toEqual({
      status: 200,
      body: { ok: true, duplicate: true },
    });
    expect(
      (await call(payment({ paidAt: "2026-11-11T16:00:00.000Z" }))).status
    ).toBe(200);
    expect(snapshot()).toEqual(before);
    expect(
      fixture.state.writes.filter(w => financialTables.includes(w.table ?? ""))
    ).toHaveLength(count);
    expectSingleReceipt();
  });
  it("duas entregas idênticas sobrepostas baixam uma vez (serialização mock, não prova InnoDB)", async () => {
    const results = await Promise.all([call(), call()]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(
      results.filter(result => result.body.duplicate === true)
    ).toHaveLength(1);
    expectSettled();
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
    expect(
      fixture.state.writes.filter(
        w => w.table === "parcelasAcordo" && w.kind === "update"
      )
    ).toHaveLength(1);
    expect(
      fixture.state.writes.filter(
        w => w.table === "cobrancas" && w.kind === "update"
      )
    ).toHaveLength(1);
  });
  it.each([
    ["contrato legado em centavos", { amountPaid: 584 }],
    ["inteiro externo divergente", { amountPaid: 5 }],
    ["zero não comprova recebimento", { amountPaid: 0 }],
    ["campos pagos contraditórios", { amountPaid: 5.84, paidAmount: 5.83 }],
    ["nominal isolado", { amountPaid: undefined, amount: 5.84 }],
  ])("%s é ignorado sem pagamento", async (_name, data) => {
    const before = snapshot();
    expect(await call(payment(data))).toEqual({
      status: 200,
      body: { ok: true, ignored: true },
    });
    expect(snapshot()).toEqual(before);
    expect(audits()).toEqual([]);
    expect(fixture.state.tables.btgWebhookEntregas[0].erroCodigo).toBe(
      "PAYMENT_AMOUNT_MISMATCH"
    );
  });
  it.each(["CREATED", "CANCELED", "PARTIALLY_PAID"])(
    "evento paid com status contraditório %s não quita", async status => {
      const before = snapshot();
      expect(await call(payment({ status }))).toEqual({ status: 200, body: { ok: true, ignored: true } });
      expect(snapshot()).toEqual(before);
      expect(fixture.state.tables.btgWebhookEntregas[0].erroCodigo).toBe("PAYMENT_STATUS_MISMATCH");
      expect(audits()).toEqual([]);
    }
  );
  it.each([
    [
      "flat sem event/data",
      {
        collectionId: emission.btgCollectionId,
        status: "PAID",
        amountPaid: 5.84,
      },
      ["event", "data"],
    ],
    ["negativo", payment({ amountPaid: -5.84 }), ["data.amountPaid"]],
    [
      "precisão maior que duas casas",
      payment({ amountPaid: 5.841 }),
      ["data.amountPaid"],
    ],
    [
      "tipo monetário inválido",
      payment({ amountPaid: "5.84" }),
      ["data.amountPaid"],
    ],
  ])(
    "400 %s antes do banco, sem persistir corpo ou efeitos",
    async (_name, payload, camposInvalidos) => {
      const before = snapshot();
      expect(await call(payload)).toEqual({
        status: 400,
        body: { ok: false, error: "INVALID_PAYLOAD", camposInvalidos },
      });
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(snapshot()).toEqual(before);
      expect(fixture.state.tables.btgWebhookEntregas).toEqual([]);
      expect(fixture.state.writes).toEqual([]);
    }
  );
  it("collections.processing com status PAID não infere baixa", async () => {
    const before = snapshot();
    expect(
      await call({ ...payment(), event: "collections.processing" })
    ).toEqual({ status: 200, body: { ok: true, ignored: true } });
    expect(snapshot()).toEqual(before);
  });
  it.each([
    ["devedor ausente", { devedores: [] }],
    [
      "devedor fora do condomínio",
      { devedores: [{ ...debtor, condominioId: 703 }] },
    ],
    ["origem fora do devedor", { cobrancas: [{ ...origin, devedorId: 722 }] }],
    [
      "origem fora do condomínio",
      { cobrancas: [{ ...origin, condominioId: 703 }] },
    ],
    ["origem cancelada", { cobrancas: [{ ...origin, status: "cancelado" }] }],
    ["origem ausente", { cobrancas: [] }],
    ["vínculos ausentes", { acordoCobrancas: [] }],
    ["acordo cancelado", { acordos: [{ ...agreement, status: "cancelado" }] }],
    [
      "plano nominal incoerente",
      { acordos: [{ ...agreement, agreedAmount: 585 }] },
    ],
    [
      "origem reutilizada por acordo ativo",
      {
        acordos: [agreement, { ...agreement, id: 712 }],
        acordoCobrancas: [link, { ...link, id: 762, acordoId: 712 }],
      },
    ],
  ])(
    "erro antecipado de contexto: %s preserva todos efeitos",
    async (_name, overrides) => {
      setup(overrides);
      const before = snapshot();
      const result = await call();
      expect(result).toEqual({
        status: 200,
        body: { ok: true, ignored: true },
      });
      expect(snapshot()).toEqual(before);
      expect(
        fixture.state.writes.filter(w =>
          financialTables.includes(w.table ?? "")
        )
      ).toEqual([]);
      expect(audits()).toEqual([]);
    }
  );
  it.each(["throw", "zero"] as const)(
    "auditoria %s aborta emissão/parcela/acordo/origens/saldo e permite reentrega",
    async mode => {
      const before = snapshot();
      failInsertAudit(mode);
      expect(await call()).toEqual({
        status: 500,
        body: { ok: false, error: "PROCESSING_FAILED" },
      });
      expect(snapshot()).toEqual(before);
      expect(fixture.state.rollbacks).toBe(1);
      expect(
        fixture.state.writes.filter(w =>
          financialTables.includes(w.table ?? "")
        )
      ).toEqual([]);
      expect(fixture.state.tables.btgWebhookEntregas[0]).toMatchObject({
        statusProcessamento: "falha",
        erroCodigo: "PROCESSING_FAILED",
        processadoEm: null,
      });
      expect(await call()).toEqual({ status: 200, body: { ok: true } });
      expectSettled();
      expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
    }
  );
  it.each([
    "parcelasAcordo",
    "acordos",
    "cobrancas",
    "devedores",
    "btgCobrancasEmitidas",
    "btgWebhookEntregas",
  ])("update %s falho desfaz toda a transação", async table => {
    const before = snapshot();
    fixture.state.failInjected = { table, times: 1 };
    expect(await call()).toEqual({
      status: 500,
      body: { ok: false, error: "PROCESSING_FAILED" },
    });
    expect(snapshot()).toEqual(before);
    expect(fixture.state.rollbacks).toBe(1);
    expect(
      fixture.state.writes.filter(w => financialTables.includes(w.table ?? ""))
    ).toEqual([]);
    expect(audits()).toEqual([]);
  });
  it.each(["parcelasAcordo", "acordos", "cobrancas", "devedores"])(
    "affectedRows=0 em %s não permite ACK de recebimento",
    async tableName => {
      const update = fixture.db.update.getMockImplementation()!;
      fixture.db.update.mockImplementation((table: any) =>
        getTableName(table) === tableName
          ? {
              set: () => ({
                where: () => Promise.resolve([{ affectedRows: 0 }]),
              }),
            }
          : update(table)
      );
      const before = snapshot();
      expect(await call()).toEqual({
        status: 500,
        body: { ok: false, error: "PROCESSING_FAILED" },
      });
      expect(snapshot()).toEqual(before);
      expect(fixture.state.rollbacks).toBe(1);
      expect(audits()).toEqual([]);
    }
  );
  it("evidência mínima não persiste dados pessoais arbitrários nem segredo", async () => {
    const sentinel = "fixture-private-body-never-store";
    expect(
      (
        await call(
          payment({
            cpf: sentinel,
            barcode: sentinel,
            payload: sentinel,
            reason: sentinel,
          })
        )
      ).status
    ).toBe(200);
    expectSingleReceipt();
    const observable = JSON.stringify({
      tables: fixture.state.tables,
      logs: [
        vi.mocked(console.error).mock.calls,
        vi.mocked(console.warn).mock.calls,
        vi.mocked(console.log).mock.calls,
      ],
    });
    expect(observable).not.toContain(sentinel);
    expect(observable).not.toContain(SECRET);
    expect(fixture.state.tables.btgWebhookEntregas[0]).not.toHaveProperty(
      "payload"
    );
  });
});
