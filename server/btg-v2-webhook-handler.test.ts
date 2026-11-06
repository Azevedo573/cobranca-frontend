import { createHash, createHmac } from "crypto";
import type { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  btgCobrancasEmitidas,
  btgWebhookEntregas,
  parcelasAcordo,
} from "../drizzle/schema";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./btg-v2/config", () => ({ getBtgV2ServerConfig: mocks.config }));
import { webhookBtgV2Handler } from "./btg-v2/webhook";

const SECRET = "fixture-only-webhook-secret-not-a-real-credential";
const COMPANY_ID = "30306294000145";
const AMOUNT = 12599;
const PAID_AT = "2026-11-06T15:30:00.000Z";
const INITIAL_AT = new Date("2026-11-01T12:00:00.000Z");
const config = {
  ambiente: "producao",
  companyId: COMPANY_ID,
  apiBaseUrl: "https://btg.invalid",
};
const integration = {
  id: 7,
  ambiente: "producao",
  companyId: COMPANY_ID,
  ativo: 1,
  emissaoHabilitada: 0,
};
const emission = {
  id: 51,
  btgIntegracaoId: 7,
  btgContaRecebedoraId: 15,
  btgRemessaId: null,
  condominioId: 2,
  origemTipo: "parcela_acordo",
  origemId: 31,
  revisao: 1,
  instrumento: "bolepix",
  externalId: "fixture-external-31",
  idempotencyKey: "fixture-idempotency-31",
  btgCollectionId: "collection-fixture-31",
  status: "emitida",
  amount: AMOUNT,
  dueDate: new Date("2026-12-01T12:00:00.000Z"),
  agenciaRecebedora: "0050",
  contaRecebedora: "0003081850",
  erroCodigo: null,
  createdAt: INITIAL_AT,
  updatedAt: INITIAL_AT,
};
const installment = {
  id: 31,
  acordoId: 11,
  installmentNumber: 1,
  amount: AMOUNT,
  dueDate: new Date("2026-12-01T12:00:00.000Z"),
  status: "pendente",
  paymentDate: null,
  snapshotPrincipal: 10000,
  snapshotJuros: 1000,
  snapshotMulta: 200,
  snapshotCorrecao: 300,
  snapshotHonorarios: 1099,
  snapshotValorAtualizado: AMOUNT,
  snapshotDescricao: "Snapshot preservado",
  createdAt: INITIAL_AT,
};
const agreement = {
  id: 11,
  condominioId: 2,
  devedorId: 21,
  status: "ativo",
  installments: 2,
  totalAmount: 25198,
  agreedAmount: 25198,
  valorPago: 0,
  valorPagoAcordo: 0,
  createdAt: INITIAL_AT,
  updatedAt: INITIAL_AT,
};
const charge = {
  id: 41,
  condominioId: 2,
  devedorId: 21,
  status: "pendente",
  amount: AMOUNT,
  paidAt: null,
  paidAmount: null,
  custasJudiciais: 123,
  createdAt: INITIAL_AT,
  updatedAt: INITIAL_AT,
};
const financialTables = [
  "btgCobrancasEmitidas",
  "parcelasAcordo",
  "acordos",
  "cobrancas",
];
let fixture: ReturnType<typeof criarDbWebhookBtgEmMemoria>;
let fetchMock: ReturnType<typeof vi.fn>;

function setup(overrides: Record<string, any[]> = {}) {
  fixture = criarDbWebhookBtgEmMemoria({
    btgIntegracoes: [integration],
    btgWebhookEntregas: [],
    btgCobrancasEmitidas: [emission],
    parcelasAcordo: [
      installment,
      { ...installment, id: 32, installmentNumber: 2 },
    ],
    acordos: [agreement],
    cobrancas: [charge],
    ...overrides,
  });
  mocks.getDb.mockResolvedValue(fixture.db);
  return fixture;
}
function payment(overrides: Record<string, unknown> = {}) {
  return {
    webhookId: "subscription-shared-fixture",
    event: "collections.paid",
    data: {
      collectionId: emission.btgCollectionId,
      amountPaid: AMOUNT,
      paidAt: PAID_AT,
      ...overrides,
    },
  };
}
function event(name: string) {
  return {
    webhookId: "subscription-shared-fixture",
    event: name,
    data: { collectionId: emission.btgCollectionId },
  };
}
function hash(body: unknown) {
  return createHash("sha256")
    .update(Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)))
    .digest("hex");
}
function delivery(payload: unknown, statusProcessamento: string) {
  return {
    id: 81,
    btgIntegracaoId: 7,
    providerEventId: "earlier-correlation",
    payloadHash: hash(payload),
    evento: "collections.paid",
    btgCollectionId: emission.btgCollectionId,
    assinaturaValida: 1,
    statusProcessamento,
    erroCodigo: statusProcessamento === "falha" ? "PROCESSING_FAILED" : null,
    recebidoEm: INITIAL_AT,
    processadoEm: ["processado", "ignorado"].includes(statusProcessamento)
      ? INITIAL_AT
      : null,
  };
}
type RequestOptions = {
  headers?: Record<string, unknown>;
  ambiente?: string;
  rawHeaders?: string[];
  useParsedBody?: boolean;
};
async function call(
  payload: unknown = payment(),
  options: RequestOptions = {}
) {
  const headers: Record<string, unknown> = {
    authorization: `Bearer ${SECRET}`,
    ...options.headers,
  };
  const body = options.useParsedBody
    ? payload
    : Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(JSON.stringify(payload));
  const req = {
    params: { ambiente: options.ambiente ?? "producao" },
    headers,
    body,
    rawHeaders:
      options.rawHeaders ??
      Object.entries(headers).flatMap(([key, value]) =>
        typeof value === "string" ? [key, value] : []
      ),
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  await webhookBtgV2Handler(req, res as unknown as Response);
  expect(res.status).toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledTimes(1);
  return {
    status: res.status.mock.calls.at(-1)![0] as number,
    body: res.json.mock.calls[0][0] as Record<string, unknown>,
  };
}
function snapshotFinance() {
  return structuredClone(
    Object.fromEntries(
      financialTables.map(name => [name, fixture.state.tables[name]])
    )
  );
}
function expectNoFinancialChange(before: ReturnType<typeof snapshotFinance>) {
  expect(snapshotFinance()).toEqual(before);
  expect(
    fixture.state.writes.filter(write =>
      financialTables.includes(write.table ?? "")
    )
  ).toEqual([]);
}
async function expectIgnored(
  payload: unknown = payment(),
  options: RequestOptions = {}
) {
  const before = snapshotFinance();
  const result = await call(payload, options);
  expect(result).toEqual({ status: 200, body: { ok: true, ignored: true } });
  expectNoFinancialChange(before);
  return result;
}
function expectLocks(tables: string[]) {
  for (const table of tables) {
    expect(fixture.state.locks).toContain(`${table}:update`);
    expect(
      fixture.state.operations
        .filter(
          operation =>
            operation.kind === "lock:update" && operation.table === table
        )
        .every(operation => operation.inTransaction)
    ).toBe(true);
  }
}
function expectValidPayment() {
  expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({
    status: "paga",
    amount: AMOUNT,
  });
  expect(fixture.state.tables.parcelasAcordo[0]).toMatchObject({
    status: "pago",
    paymentDate: new Date(PAID_AT),
    amount: AMOUNT,
    snapshotPrincipal: 10000,
    snapshotJuros: 1000,
    snapshotMulta: 200,
    snapshotCorrecao: 300,
    snapshotHonorarios: 1099,
    snapshotValorAtualizado: AMOUNT,
    snapshotDescricao: installment.snapshotDescricao,
  });
  expect(fixture.state.tables.btgWebhookEntregas[0]).toMatchObject({
    assinaturaValida: 1,
    statusProcessamento: "processado",
    payloadHash: hash(payment()),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue(config);
  vi.stubEnv("BTG_WEBHOOK_SECRET", SECRET);
  fetchMock = vi
    .fn()
    .mockRejectedValue(new Error("network forbidden in handler tests"));
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

describe("BTG v2 — fixture transacional do handler", () => {
  it("avalia eq/and/inArray reais sem deixar passar registros fora do filtro", async () => {
    setup({
      btgCobrancasEmitidas: [
        emission,
        { ...emission, id: 52, btgIntegracaoId: 8 },
        { ...emission, id: 53, btgCollectionId: "another" },
      ],
    });
    const rows = await fixture.db
      .select()
      .from(btgCobrancasEmitidas)
      .where(
        and(
          eq(btgCobrancasEmitidas.btgIntegracaoId, 7),
          inArray(btgCobrancasEmitidas.id, [51, 52])
        )
      );
    expect(rows.map((row: any) => row.id)).toEqual([51]);
    const other = await fixture.db
      .select()
      .from(btgCobrancasEmitidas)
      .where(
        and(
          eq(btgCobrancasEmitidas.btgIntegracaoId, 7),
          eq(btgCobrancasEmitidas.btgCollectionId, "another")
        )
      );
    expect(other.map((row: any) => row.id)).toEqual([53]);
  });
  it("upsert é único por integração/hash e não reinicia uma entrega terminal", async () => {
    const payload = payment();
    setup({ btgWebhookEntregas: [delivery(payload, "processado")] });
    await fixture.db
      .insert(btgWebhookEntregas)
      .values({ ...delivery(payload, "recebido"), id: undefined })
      .onDuplicateKeyUpdate({ set: { payloadHash: hash(payload) } });
    await fixture.db
      .insert(btgWebhookEntregas)
      .values({
        ...delivery(payload, "recebido"),
        id: undefined,
        btgIntegracaoId: 8,
      });
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(2);
    expect(fixture.state.tables.btgWebhookEntregas[0]).toMatchObject({
      id: 81,
      statusProcessamento: "processado",
      providerEventId: "earlier-correlation",
      processadoEm: INITIAL_AT,
    });
  });
  it("a fixture desfaz escrita anterior quando um segundo update falha", async () => {
    const before = snapshotFinance();
    fixture.state.failInjected = { table: "parcelasAcordo", times: 1 };
    await expect(
      fixture.db.transaction(async (tx: any) => {
        await tx
          .update(btgCobrancasEmitidas)
          .set({ status: "paga" })
          .where(eq(btgCobrancasEmitidas.id, 51));
        await tx
          .update(parcelasAcordo)
          .set({ status: "pago" })
          .where(eq(parcelasAcordo.id, 31));
      })
    ).rejects.toThrow("injected update");
    expect(snapshotFinance()).toEqual(before);
    expect(fixture.state.writes).toEqual([]);
    expect(fixture.state.rollbacks).toBe(1);
  });
});

describe("BTG v2 — autenticação Bearer antes do banco", () => {
  it.each([
    ["ausente", undefined],
    ["token errado", "Bearer wrong-fixture-token"],
    ["sem esquema", SECRET],
    ["esquema errado", `Basic ${SECRET}`],
    ["token vazio", "Bearer "],
    ["sem separador", `Bearer${SECRET}`],
    ["dois tokens", `Bearer ${SECRET} second`],
    ["dois Bearers concatenados", `Bearer ${SECRET}, Bearer ${SECRET}`],
    ["cabeçalho em array", [`Bearer ${SECRET}`, `Bearer ${SECRET}`]],
    ["array de um item", [`Bearer ${SECRET}`]],
  ])(
    "recusa Authorization %s com INVALID_AUTHENTICATION e nenhuma consulta",
    async (_name, authorization) => {
      const before = snapshotFinance();
      expect(await call(payment(), { headers: { authorization } })).toEqual({
        status: 401,
        body: { ok: false, error: "INVALID_AUTHENTICATION" },
      });
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(fixture.state.tables.btgWebhookEntregas).toEqual([]);
      expectNoFinancialChange(before);
    }
  );
  it.each(["", "   "])("recusa segredo ausente/vazio (%j)", async secret => {
    vi.stubEnv("BTG_WEBHOOK_SECRET", secret);
    expect(await call()).toEqual({
      status: 401,
      body: { ok: false, error: "INVALID_AUTHENTICATION" },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("recusa múltiplos Authorization nos rawHeaders mesmo se o parser retiver apenas o primeiro", async () => {
    expect(
      await call(payment(), {
        rawHeaders: [
          "Authorization",
          `Bearer ${SECRET}`,
          "authorization",
          `Bearer ${SECRET}`,
        ],
      })
    ).toEqual({
      status: 401,
      body: { ok: false, error: "INVALID_AUTHENTICATION" },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each(["x-btg-signature", "x-signature"])(
    "HMAC válido isolado em %s não substitui Bearer",
    async header => {
      const payload = payment();
      const signature = createHmac("sha256", SECRET)
        .update(Buffer.from(JSON.stringify(payload)))
        .digest("hex");
      expect(
        await call(payload, {
          headers: { authorization: undefined, [header]: signature },
        })
      ).toEqual({
        status: 401,
        body: { ok: false, error: "INVALID_AUTHENTICATION" },
      });
      expect(mocks.getDb).not.toHaveBeenCalled();
    }
  );
  it("HMAC válido não cria fallback quando o Bearer é incorreto", async () => {
    const payload = payment();
    const signature = createHmac("sha256", SECRET)
      .update(Buffer.from(JSON.stringify(payload)))
      .digest("hex");
    expect(
      await call(payload, {
        headers: {
          authorization: "Bearer invalid",
          "x-btg-signature": signature,
        },
      })
    ).toEqual({
      status: 401,
      body: { ok: false, error: "INVALID_AUTHENTICATION" },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("Bearer correto sem HMAC processa pagamento integral e marca o campo legado como auth válida", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expectValidPayment();
  });
  it("não expõe o segredo na resposta, logs ou metadados persistidos", async () => {
    const result = await call();
    expect(result.status).toBe(200);
    const observable = JSON.stringify({
      result,
      tables: fixture.state.tables,
      writes: fixture.state.writes,
      logs: [
        vi.mocked(console.error).mock.calls,
        vi.mocked(console.warn).mock.calls,
        vi.mocked(console.log).mock.calls,
      ],
    });
    expect(observable).not.toContain(SECRET);
    const stored = fixture.state.tables.btgWebhookEntregas[0];
    expect(stored).not.toHaveProperty("authorization");
    expect(stored).not.toHaveProperty("payload");
    expect(stored).not.toHaveProperty("secret");
    expect(stored.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("BTG v2 — envelope e validação antes do banco", () => {
  it.each([Buffer.from("{"), Buffer.from(""), Buffer.from('{"event":')])(
    "rejeita JSON inválido autenticado (%j)",
    async raw => {
      const result = await call(raw);
      expect(result.status).toBe(400);
      expect(result.body).toMatchObject({ ok: false });
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(fixture.state.writes).toEqual([]);
    }
  );
  it("exige Buffer bruto, não aceita o objeto de um parser JSON", async () => {
    expect((await call(payment(), { useParsedBody: true })).status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it.each([
    ["null", null],
    ["array", []],
    ["string", "payload"],
    ["número", 1],
    ["booleano", true],
    ["sem campos", {}],
    ["event numérico", { ...payment(), event: 17 }],
    ["event vazio", { ...payment(), event: " " }],
    ["event longo", { ...payment(), event: "e".repeat(101) }],
    ["data null", { ...payment(), data: null }],
    ["data array", { ...payment(), data: [] }],
    ["data string", { ...payment(), data: "invalid" }],
    ["collectionId numérico", payment({ collectionId: 123 })],
    [
      "collectionId ausente em evento conhecido",
      payment({ collectionId: undefined }),
    ],
    ["collectionId vazio", payment({ collectionId: " " })],
    ["collectionId longo", payment({ collectionId: "c".repeat(151) })],
    ["id numérico", { ...payment(), id: 1 }],
    ["id longo", { ...payment(), id: "e".repeat(151) }],
    ["webhookId objeto", { ...payment(), webhookId: {} }],
    ["status numérico", payment({ status: 1 })],
    ["amountPaid string", payment({ amountPaid: "12599" })],
    ["amountPaid negativo", payment({ amountPaid: -1 })],
    ["amountPaid fracionário", payment({ amountPaid: 12599.5 })],
    [
      "amountPaid fora de inteiro seguro",
      payment({ amountPaid: Number.MAX_SAFE_INTEGER + 1 }),
    ],
    ["paidAmount objeto", payment({ paidAmount: {} })],
    ["amount nominal string", payment({ amount: "12599" })],
    ["paidAt numérico", payment({ paidAt: 42 })],
    ["paidAt inválido", payment({ paidAt: "not-a-date" })],
    ["paidAt dia inexistente", payment({ paidAt: "2026-02-31T15:30:00.000Z" })],
  ])("rejeita tipos/limites inválidos: %s", async (_name, payload) => {
    const result = await call(payload);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ ok: false });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fixture.state.writes).toEqual([]);
  });
  it("evento desconhecido autenticado é confirmado e não interpretado como pagamento", async () => {
    await expectIgnored({
      ...payment({ status: "PAID" }),
      event: "collections.unrecognized",
    });
  });
  it("evento desconhecido sem collectionId também é confirmado sem mutação financeira", async () => {
    await expectIgnored({
      webhookId: "subscription-shared-fixture",
      event: "collections.unrecognized",
      data: {},
    });
    expect(fixture.state.tables.btgWebhookEntregas[0]).toMatchObject({
      statusProcessamento: "ignorado",
      btgCollectionId: null,
    });
  });
  it("usa x-correlation-id para providerEventId, não webhookId nem id do payload", async () => {
    const payload = { ...payment(), id: "fallback-payload-event" };
    expect(
      (
        await call(payload, {
          headers: { "x-correlation-id": "delivery-correlation-fixture" },
        })
      ).status
    ).toBe(200);
    expect(fixture.state.tables.btgWebhookEntregas[0]).toMatchObject({
      providerEventId: "delivery-correlation-fixture",
      payloadHash: hash(payload),
    });
    expect(fixture.state.tables.btgWebhookEntregas[0].providerEventId).not.toBe(
      payload.webhookId
    );
  });
  it("faz fallback apenas para id do payload quando falta correlação", async () => {
    expect(
      (await call({ ...payment(), id: "fallback-payload-event" })).status
    ).toBe(200);
    expect(fixture.state.tables.btgWebhookEntregas[0].providerEventId).toBe(
      "fallback-payload-event"
    );
  });
  it("sem correlação/id registra null; webhookId é a inscrição compartilhada", async () => {
    expect((await call()).status).toBe(200);
    expect(
      fixture.state.tables.btgWebhookEntregas[0].providerEventId
    ).toBeNull();
  });
  it.each([
    ["first", "second"],
    "correlation-a, correlation-b",
    " ",
    "x".repeat(151),
  ])(
    "não trata correlação inválida/múltipla como eventId (%j)",
    async correlation => {
      expect(
        (
          await call(
            { ...payment(), id: "fallback-payload-event" },
            { headers: { "x-correlation-id": correlation } }
          )
        ).status
      ).toBe(200);
      expect(fixture.state.tables.btgWebhookEntregas[0].providerEventId).toBe(
        "fallback-payload-event"
      );
    }
  );
});

describe("BTG v2 — isolamento de ambiente, integração e coleção", () => {
  it("ambiente válido porém não ativo retorna 404 antes de consultar banco", async () => {
    const before = snapshotFinance();
    expect((await call(payment(), { ambiente: "sandbox" })).status).toBe(404);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expectNoFinancialChange(before);
  });
  it.each([
    ["inexistente", []],
    ["outro ambiente", [{ ...integration, ambiente: "sandbox" }]],
    ["companyId divergente", [{ ...integration, companyId: "00000000000000" }]],
  ])("integração %s nunca recebe baixa", async (_name, integrations) => {
    setup({ btgIntegracoes: integrations });
    const before = snapshotFinance();
    expect((await call()).status).toBe(404);
    expectNoFinancialChange(before);
    expect(fixture.state.tables.btgWebhookEntregas).toEqual([]);
  });
  it("coleção inexistente é ignorada com 200", async () => {
    await expectIgnored(payment({ collectionId: "missing-collection" }));
  });
  it("collectionId igual em outra integração não seleciona o título alheio", async () => {
    setup({ btgCobrancasEmitidas: [{ ...emission, btgIntegracaoId: 8 }] });
    await expectIgnored();
  });
  it("duas emissões no mesmo escopo de collectionId são ambíguas e nenhuma recebe baixa", async () => {
    setup({
      btgCobrancasEmitidas: [
        emission,
        {
          ...emission,
          id: 52,
          origemId: 32,
          externalId: "other",
          idempotencyKey: "other",
        },
      ],
    });
    await expectIgnored();
  });
  it("ignora registro alheio e paga apenas a emissão da integração configurada", async () => {
    setup({
      btgCobrancasEmitidas: [
        { ...emission, id: 61, btgIntegracaoId: 8 },
        emission,
      ],
    });
    const foreign = structuredClone(
      fixture.state.tables.btgCobrancasEmitidas[0]
    );
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.btgCobrancasEmitidas[0]).toEqual(foreign);
    expect(fixture.state.tables.btgCobrancasEmitidas[1].status).toBe("paga");
  });
});

describe("BTG v2 — pagamento integral, snapshots e estados terminais", () => {
  it.each(["amountPaid", "paidAmount"])(
    "%s integral usa paidAt informado e não recalcula principal/encargos",
    async field => {
      const data = {
        collectionId: emission.btgCollectionId,
        [field]: AMOUNT,
        paidAt: PAID_AT,
      };
      expect(
        await call({
          webhookId: "subscription-shared-fixture",
          event: "collections.paid",
          data,
        })
      ).toEqual({ status: 200, body: { ok: true } });
      expect(fixture.state.tables.parcelasAcordo[0]).toMatchObject({
        ...installment,
        status: "pago",
        paymentDate: new Date(PAID_AT),
      });
      expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({
        status: "paga",
        amount: AMOUNT,
      });
      expect(fixture.state.tables.acordos[0]).toMatchObject({
        status: "ativo",
        agreedAmount: agreement.agreedAmount,
        totalAmount: agreement.totalAmount,
      });
    }
  );
  it("amount nominal isolado não comprova pagamento", async () => {
    await expectIgnored({
      ...event("collections.paid"),
      data: {
        collectionId: emission.btgCollectionId,
        amount: AMOUNT,
        paidAt: PAID_AT,
      },
    });
  });
  it("pagamento sem amountPaid/paidAmount não recebe baixa", async () => {
    await expectIgnored(event("collections.paid"));
  });
  it.each([0, 12598, 12600])(
    "valor pago parcial/divergente %i é ignorado sem baixa",
    async amountPaid => {
      await expectIgnored(payment({ amountPaid }));
    }
  );
  it("amountPaid e paidAmount conflitantes não podem esconder uma divergência", async () => {
    await expectIgnored(
      payment({ amountPaid: AMOUNT, paidAmount: AMOUNT - 1 })
    );
  });
  it("amountPaid e paidAmount concordantes são aceitos sem duplicar a baixa", async () => {
    expect(
      await call(payment({ amountPaid: AMOUNT, paidAmount: AMOUNT }))
    ).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.parcelasAcordo[0]).toMatchObject({
      status: "pago",
      paymentDate: new Date(PAID_AT),
    });
    expect(
      fixture.state.writes.filter(
        write => write.table === "parcelasAcordo" && write.kind === "update"
      )
    ).toHaveLength(1);
  });
  it("baixa cobrança de origem cobranca preserva nominal e custas", async () => {
    setup({
      btgCobrancasEmitidas: [
        { ...emission, origemTipo: "cobranca", origemId: 41 },
      ],
    });
    const installmentsBefore = structuredClone(
      fixture.state.tables.parcelasAcordo
    );
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.cobrancas[0]).toMatchObject({
      status: "pago",
      paidAt: new Date(PAID_AT),
      paidAmount: AMOUNT,
      amount: AMOUNT,
      custasJudiciais: 123,
    });
    expect(fixture.state.tables.parcelasAcordo).toEqual(installmentsBefore);
    expectLocks(["btgWebhookEntregas", "btgCobrancasEmitidas", "cobrancas"]);
  });
  it("outra entrega paid para emissão já paga não sobrescreve data/valor da parcela", async () => {
    const oldDate = new Date("2026-11-02T12:00:00.000Z");
    setup({
      btgCobrancasEmitidas: [{ ...emission, status: "paga" }],
      parcelasAcordo: [
        { ...installment, status: "pago", paymentDate: oldDate },
      ],
      acordos: [{ ...agreement, status: "pago" }],
    });
    const before = snapshotFinance();
    const result = await call(payment({ paidAt: "2026-11-06T20:00:00.000Z" }));
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expectNoFinancialChange(before);
  });
  it("outra entrega paid para cobrança já paga não sobrescreve paidAt/paidAmount", async () => {
    setup({
      btgCobrancasEmitidas: [
        { ...emission, origemTipo: "cobranca", origemId: 41, status: "paga" },
      ],
      cobrancas: [
        {
          ...charge,
          status: "pago",
          paidAt: new Date("2026-11-02T12:00:00.000Z"),
          paidAmount: 12000,
        },
      ],
    });
    const before = snapshotFinance();
    expect((await call()).status).toBe(200);
    expectNoFinancialChange(before);
  });
  it.each([
    "collections.created",
    "collections.expired",
    "collections.cancelled",
  ])(
    "evento %s não regride emissão paga nem reescreve financeiro",
    async name => {
      setup({
        btgCobrancasEmitidas: [{ ...emission, status: "paga" }],
        parcelasAcordo: [
          { ...installment, status: "pago", paymentDate: new Date(PAID_AT) },
        ],
        acordos: [{ ...agreement, status: "pago" }],
      });
      const before = snapshotFinance();
      expect((await call(event(name))).status).toBe(200);
      expectNoFinancialChange(before);
    }
  );
  it.each(["cancelada", "expirada"])(
    "collections.created tardio não reabre emissão %s",
    async status => {
      setup({ btgCobrancasEmitidas: [{ ...emission, status }] });
      const before = snapshotFinance();
      expect((await call(event("collections.created"))).status).toBe(200);
      expectNoFinancialChange(before);
    }
  );
  it.each([
    ["collections.created", "emitida"],
    ["collections.expired", "expirada"],
    ["collections.cancelled", "cancelada"],
    ["collections.canceled", "cancelada"],
  ])(
    "evento documentado/alias %s altera só estado da emissão",
    async (name, status) => {
      setup({ btgCobrancasEmitidas: [{ ...emission, status: "incerta" }] });
      const before = structuredClone({
        parcelasAcordo: fixture.state.tables.parcelasAcordo,
        acordos: fixture.state.tables.acordos,
        cobrancas: fixture.state.tables.cobrancas,
      });
      expect(await call(event(name))).toEqual({
        status: 200,
        body: { ok: true },
      });
      expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe(status);
      expect({
        parcelasAcordo: fixture.state.tables.parcelasAcordo,
        acordos: fixture.state.tables.acordos,
        cobrancas: fixture.state.tables.cobrancas,
      }).toEqual(before);
    }
  );
});

describe("BTG v2 — origem, condomínio e conclusão do acordo", () => {
  it.each([
    ["parcela ausente", { parcelasAcordo: [] }],
    ["acordo ausente", { acordos: [] }],
    [
      "carteira/condomínio divergente",
      { acordos: [{ ...agreement, condominioId: 3 }] },
    ],
    [
      "parcela cancelada",
      { parcelasAcordo: [{ ...installment, status: "cancelado" }] },
    ],
    [
      "valor da parcela divergente",
      { parcelasAcordo: [{ ...installment, amount: AMOUNT + 1 }] },
    ],
    ["acordo cancelado", { acordos: [{ ...agreement, status: "cancelado" }] }],
  ])(
    "origem %s é ignorada antes de qualquer alteração financeira",
    async (_name, overrides) => {
      setup(overrides);
      await expectIgnored();
    }
  );
  it.each([
    ["cobrança ausente", []],
    ["cobrança de outro condomínio", [{ ...charge, condominioId: 3 }]],
  ])("origemTipo cobranca: %s não recebe baixa", async (_name, charges) => {
    setup({
      btgCobrancasEmitidas: [
        { ...emission, origemTipo: "cobranca", origemId: 41 },
      ],
      cobrancas: charges,
    });
    await expectIgnored();
  });
  it("pagar uma parcela mantém acordo ativo enquanto houver outra pendente", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.parcelasAcordo.map(row => row.status)).toEqual([
      "pago",
      "pendente",
    ]);
    expect(fixture.state.tables.acordos[0].status).toBe("ativo");
    expectLocks([
      "btgWebhookEntregas",
      "btgCobrancasEmitidas",
      "acordos",
      "parcelasAcordo",
    ]);
  });
  it("conclui acordo somente quando a última parcela fica paga, sob locks", async () => {
    setup({
      parcelasAcordo: [
        installment,
        {
          ...installment,
          id: 32,
          installmentNumber: 2,
          status: "pago",
          paymentDate: INITIAL_AT,
        },
      ],
    });
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.parcelasAcordo.map(row => row.status)).toEqual([
      "pago",
      "pago",
    ]);
    expect(fixture.state.tables.acordos[0].status).toBe("pago");
    expectLocks([
      "btgWebhookEntregas",
      "btgCobrancasEmitidas",
      "acordos",
      "parcelasAcordo",
    ]);
    const writes = fixture.state.writes.filter(write =>
      financialTables.includes(write.table ?? "")
    );
    expect(writes.every(write => write.inTransaction)).toBe(true);
  });
  it("última parcela de acordo cancelado não reviva o acordo nem altera a origem", async () => {
    setup({
      acordos: [{ ...agreement, status: "cancelado" }],
      parcelasAcordo: [
        installment,
        {
          ...installment,
          id: 32,
          installmentNumber: 2,
          status: "pago",
          paymentDate: INITIAL_AT,
        },
      ],
    });
    await expectIgnored();
    expect(fixture.state.tables.acordos[0].status).toBe("cancelado");
  });
});

describe("BTG v2 — idempotência, transação e reentrega", () => {
  it("registra entrega fora da transação e trava entrega/emissão antes da baixa atômica", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.transactions).toBe(1);
    const insert = fixture.state.operations.find(
      operation =>
        operation.kind === "insert" && operation.table === "btgWebhookEntregas"
    );
    expect(insert).toMatchObject({ inTransaction: false });
    expectLocks([
      "btgWebhookEntregas",
      "btgCobrancasEmitidas",
      "acordos",
      "parcelasAcordo",
    ]);
    const query = fixture.state.operations.find(
      operation =>
        operation.kind === "select" &&
        operation.table === "btgCobrancasEmitidas"
    );
    expect(query).toMatchObject({ inTransaction: true, limit: 2 });
    expect(query?.sql).toContain("btgIntegracaoId");
    expect(query?.sql).toContain("btgCollectionId");
    const mutations = fixture.state.writes.filter(
      operation => operation.kind === "update"
    );
    expect(mutations.length).toBeGreaterThanOrEqual(3);
    expect(mutations.every(operation => operation.inTransaction)).toBe(true);
    expect(
      mutations.find(operation => operation.table === "btgWebhookEntregas")
        ?.values
    ).toMatchObject({ statusProcessamento: "processado" });
  });
  it("segunda entrega de payload processado é duplicate 200 sem novas baixas", async () => {
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    const before = snapshotFinance(),
      financialWrites = fixture.state.writes.filter(write =>
        financialTables.includes(write.table ?? "")
      ).length;
    const recorded = structuredClone(
      fixture.state.tables.btgWebhookEntregas[0]
    );
    expect(await call()).toEqual({
      status: 200,
      body: { ok: true, duplicate: true },
    });
    expect(snapshotFinance()).toEqual(before);
    expect(
      fixture.state.writes.filter(write =>
        financialTables.includes(write.table ?? "")
      )
    ).toHaveLength(financialWrites);
    expect(fixture.state.tables.btgWebhookEntregas).toEqual([recorded]);
    const upsert = fixture.state.operations.find(
      operation => operation.kind === "upsert"
    );
    expect(upsert).toMatchObject({
      inTransaction: false,
      values: { payloadHash: hash(payment()) },
    });
    expect(Object.keys(upsert?.values ?? {})).toEqual(["payloadHash"]);
  });
  it("entrega ignorada é terminal e sua repetição é duplicate 200", async () => {
    const payload = payment({ amountPaid: AMOUNT - 1 });
    await expectIgnored(payload);
    expect(await call(payload)).toEqual({
      status: 200,
      body: { ok: true, duplicate: true },
    });
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
    expect(fixture.state.tables.btgWebhookEntregas[0].statusProcessamento).toBe(
      "ignorado"
    );
  });
  it.each(["recebido", "falha"])(
    "entrega %s existente deve reprocessar, não ser considerada duplicate",
    async status => {
      const payload = payment();
      setup({ btgWebhookEntregas: [delivery(payload, status)] });
      expect(await call(payload)).toEqual({ status: 200, body: { ok: true } });
      expectValidPayment();
      expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
      expect(fixture.state.tables.btgWebhookEntregas[0].erroCodigo).toBeNull();
    }
  );
  it("mesmo webhookId em dois eventos diferentes não causa deduplicação cruzada", async () => {
    setup({ btgCobrancasEmitidas: [{ ...emission, status: "incerta" }] });
    expect(await call(event("collections.created"))).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(2);
    expect(
      fixture.state.tables.btgWebhookEntregas.map(row => row.providerEventId)
    ).toEqual([null, null]);
    expect(
      new Set(
        fixture.state.tables.btgWebhookEntregas.map(row => row.payloadHash)
      ).size
    ).toBe(2);
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
  });
  it("falha no update da parcela desfaz baixa e reentrega idêntica consegue sucesso", async () => {
    fixture.state.failInjected = {
      table: "parcelasAcordo",
      times: 1,
      message: "driver SQL detail must stay internal",
    };
    const before = snapshotFinance();
    expect(await call()).toEqual({
      status: 500,
      body: { ok: false, error: "PROCESSING_FAILED" },
    });
    expect(snapshotFinance()).toEqual(before);
    expect(fixture.state.rollbacks).toBe(1);
    expect(
      fixture.state.writes.filter(write =>
        financialTables.includes(write.table ?? "")
      )
    ).toEqual([]);
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
    expect(["recebido", "falha"]).toContain(
      fixture.state.tables.btgWebhookEntregas[0].statusProcessamento
    );
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expectValidPayment();
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
    expect(fixture.state.tables.btgWebhookEntregas[0].erroCodigo).toBeNull();
  });
  it("falha ao concluir a entrega também desfaz emissão, parcela e conclusão do acordo", async () => {
    setup({ parcelasAcordo: [installment] });
    fixture.state.failInjected = { table: "btgWebhookEntregas", times: 1 };
    const before = snapshotFinance();
    expect(await call()).toEqual({
      status: 500,
      body: { ok: false, error: "PROCESSING_FAILED" },
    });
    expect(snapshotFinance()).toEqual(before);
    expect(fixture.state.rollbacks).toBe(1);
    expect(
      fixture.state.tables.btgWebhookEntregas[0].statusProcessamento
    ).not.toBe("processado");
    const attempts = fixture.state.operations.filter(
      operation =>
        operation.kind === "update-attempt" && operation.inTransaction
    );
    expect(attempts.map(operation => operation.table)).toEqual([
      "parcelasAcordo",
      "acordos",
      "btgCobrancasEmitidas",
      "btgWebhookEntregas",
    ]);
    expect(await call()).toEqual({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.acordos[0].status).toBe("pago");
  });
  it.each(["processado", "ignorado"])(
    "catch não rebaixa entrega %s concluída por outro trabalhador",
    async status => {
      const payload = payment();
      setup({ btgWebhookEntregas: [delivery(payload, "recebido")] });
      const before = snapshotFinance();
      let terminal: Record<string, unknown>;
      // Falha do trabalhador local depois de uma conclusão externa. Não afirma
      // concorrência MySQL: isola a cláusula condicional do catch sob essa interleaving.
      fixture.db.transaction.mockImplementationOnce(async () => {
        Object.assign(fixture.state.tables.btgWebhookEntregas[0], {
          statusProcessamento: status,
          erroCodigo: status === "ignorado" ? "EVENT_NOT_SUPPORTED" : null,
          processadoEm: new Date(PAID_AT),
        });
        terminal = structuredClone(fixture.state.tables.btgWebhookEntregas[0]);
        throw new Error(
          "worker-local transaction failed after external completion"
        );
      });
      expect(await call(payload)).toEqual({
        status: 500,
        body: { ok: false, error: "PROCESSING_FAILED" },
      });
      expect(snapshotFinance()).toEqual(before);
      expect(fixture.state.tables.btgWebhookEntregas[0]).toEqual(terminal!);
      const failureWrite = fixture.state.writes.find(
        write =>
          write.kind === "update" &&
          write.values?.statusProcessamento === "falha"
      );
      expect(failureWrite).toMatchObject({
        table: "btgWebhookEntregas",
        affected: 0,
      });
    }
  );
  it("falha do banco retorna código genérico sem segredo ou erro SQL na resposta/registro/log", async () => {
    fixture.state.failInjected = {
      table: "parcelasAcordo",
      times: 1,
      message: `SQL_ERROR with ${SECRET}`,
    };
    const result = await call();
    expect(result).toEqual({
      status: 500,
      body: { ok: false, error: "PROCESSING_FAILED" },
    });
    expect(
      JSON.stringify({
        result,
        tables: fixture.state.tables,
        logs: vi.mocked(console.error).mock.calls,
      })
    ).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain("SQL_ERROR");
    expect(
      JSON.stringify(fixture.state.tables.btgWebhookEntregas)
    ).not.toContain("SQL_ERROR");
  });
});
