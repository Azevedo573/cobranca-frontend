import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { and, desc, eq, getTableName } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  acordos,
  btgCancelamentos,
  btgContaRecebedoraCondominios,
  btgCobrancasEmitidas,
  btgIntegracoes,
  parcelasAcordo,
  users,
} from "../drizzle/schema";
import { criarDbWebhookBtgEmMemoria } from "./btg-v2-webhook-test-db";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), config: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./btg-v2/config", () => ({ getBtgV2ServerConfig: mocks.config }));
import { webhookBtgV2Handler } from "./btg-v2/webhook";

const SECRET = "fixture-cancel-webhook-not-real";
const NOW = new Date("2026-11-01T12:00:00.000Z");
const DUE = new Date("2026-12-01T12:00:00.000Z");
const PAID = "2026-11-06T15:30:00.000Z";
const AMOUNT = 12599;
const integration = { id: 7, ambiente: "producao", companyId: "fixture-company", ativo: 1, emissaoHabilitada: 0 };
const emission = {
  id: 51, btgIntegracaoId: 7, btgContaRecebedoraId: 15, btgRemessaId: 61,
  condominioId: 2, origemTipo: "parcela_acordo", origemId: 31, revisao: 1,
  instrumento: "bolepix", externalId: "external-fixture", idempotencyKey: "idem-fixture",
  btgCollectionId: "collection-fixture", status: "emitida", amount: AMOUNT, dueDate: DUE,
  agenciaRecebedora: "0001", contaRecebedora: "fixture-account", documentoBeneficiario: "fixture-doc",
  erroCodigo: null, createdAt: NOW, updatedAt: NOW,
};
const installment = {
  id: 31, acordoId: 11, installmentNumber: 1, amount: AMOUNT, dueDate: DUE,
  status: "pendente", paymentDate: null, canalBancario: "api_btg_v2",
  snapshotPrincipal: 10000, snapshotJuros: 1000, snapshotMulta: 200,
  snapshotCorrecao: 300, snapshotHonorarios: 1099, snapshotValorAtualizado: AMOUNT,
  snapshotDescricao: "Snapshot fictício preservado", createdAt: NOW,
};
const agreement = {
  id: 11, condominioId: 2, devedorId: 21, status: "ativo", installments: 2,
  totalAmount: 25198, agreedAmount: 25198, valorPago: 0, valorPagoAcordo: 0,
  createdAt: NOW, updatedAt: NOW,
};
const operation = {
  id: 81, chaveOperacao: "00000000-0000-4000-8000-000000000001",
  btgCobrancaEmitidaId: 51, parcelaAcordoId: 31, btgIntegracaoId: 7, condominioId: 2,
  usuarioId: 1, estado: "em_confirmacao", contextoHash: "a".repeat(64),
  consultaCifrada: "encrypted-fixture-only", motivoCifrado: "encrypted-reason-fixture-only",
  criadaEm: NOW, expiraEm: NOW, solicitadaEm: NOW, confirmadaEm: null,
  httpStatus: 204, codigo: "RESULTADO_INCERTO", updatedAt: NOW,
};
let fixture: ReturnType<typeof criarDbWebhookBtgEmMemoria>;
let fetchMock: ReturnType<typeof vi.fn>;
function setup(overrides: Record<string, any[]> = {}) {
  fixture = criarDbWebhookBtgEmMemoria({
    users: [{ id: 1, role: "admin" }],
    btgIntegracoes: [integration],
    btgContaRecebedoraCondominios: [{ id: 1, btgIntegracaoId: 7, btgContaRecebedoraId: 15, condominioId: 2, ativo: 1 }],
    btgWebhookEntregas: [], btgCobrancasEmitidas: [emission],
    parcelasAcordo: [installment, { ...installment, id: 32, installmentNumber: 2 }],
    acordos: [agreement], btgCancelamentos: [operation], auditLogs: [],
    btgRemessas: [{ id: 61, status: "concluida", codigo: "ORIGINAL_SUCCESS" }],
    btgBoletoSnapshots: [{ id: 71, dadosCifrados: "untouched-fixture" }],
    btgRecuperacoes: [], cobrancas: [],
    ...overrides,
  });
  mocks.getDb.mockResolvedValue(fixture.db);
  return fixture;
}
function event(name = "collections.cancelled", data: Record<string, unknown> = {}) {
  return { webhookId: "shared-subscription-fixture", event: name, data: { collectionId: emission.btgCollectionId, ...data } };
}
function paid(data: Record<string, unknown> = {}) {
  return event("collections.paid", { amountPaid: AMOUNT, paidAt: PAID, ...data });
}
async function call(payload = event(), token = SECRET) {
  const req = {
    params: { ambiente: "producao" }, body: Buffer.from(JSON.stringify(payload)),
    headers: { authorization: `Bearer ${token}` }, rawHeaders: ["Authorization", `Bearer ${token}`],
  } as unknown as Request;
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await webhookBtgV2Handler(req, res as unknown as Response);
  expect(res.json).toHaveBeenCalledTimes(1);
  return { status: res.status.mock.calls.at(-1)![0], body: res.json.mock.calls[0][0], statuses: res.status.mock.calls.map(([s]) => s) };
}
function financial() {
  return structuredClone(Object.fromEntries(["btgCobrancasEmitidas", "parcelasAcordo", "acordos", "cobrancas"].map(k => [k, fixture.state.tables[k]])));
}
function protectedHistory() {
  return structuredClone(Object.fromEntries(["btgRemessas", "btgBoletoSnapshots", "btgRecuperacoes"].map(k => [k, fixture.state.tables[k]])));
}
function auditMetadata() {
  return fixture.state.tables.auditLogs.map(r => JSON.parse(r.metadata));
}
function failAuditOnce(mode: "throw" | "zero" = "throw") {
  const insert = fixture.db.insert.getMockImplementation()!;
  let pending = true;
  fixture.db.insert.mockImplementation((table: any) => {
    if (getTableName(table) === "auditLogs" && pending) {
      pending = false;
      return { values: () => mode === "throw" ? Promise.reject(new Error(`SQL-fixture-sensitive-${SECRET}`)) : Promise.resolve([{ affectedRows: 0 }]) };
    }
    return insert(table);
  });
}
function assertOrderedLocks(operations = fixture.state.operations) {
  const locks = operations.filter(o => o.kind.startsWith("lock:"));
  const names = locks.map(o => o.table);
  const first = (table: string) => names.indexOf(table);
  expect(first("btgIntegracoes")).toBeGreaterThanOrEqual(0);
  expect(first("btgContaRecebedoraCondominios")).toBeGreaterThan(first("btgIntegracoes"));
  expect(first("acordos")).toBeGreaterThan(first("btgContaRecebedoraCondominios"));
  expect(first("parcelasAcordo")).toBeGreaterThan(first("acordos"));
  expect(first("btgCobrancasEmitidas")).toBeGreaterThan(first("parcelasAcordo"));
  expect(first("btgCancelamentos")).toBeGreaterThan(first("btgCobrancasEmitidas"));
  const afterEmission = locks.slice(first("btgCobrancasEmitidas"));
  expect(afterEmission.some(o => ["acordos", "parcelasAcordo", "btgIntegracoes", "btgContaRecebedoraCondominios"].includes(o.table ?? ""))).toBe(false);
  expect(locks.every(o => o.inTransaction)).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ ambiente: "producao", companyId: "fixture-company", apiBaseUrl: "https://fixture.invalid" });
  vi.stubEnv("BTG_WEBHOOK_SECRET", SECRET);
  fetchMock = vi.fn().mockRejectedValue(new Error("network forbidden"));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  setup();
});
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

describe("BTG — webhook de cancelamento com operação autenticada", () => {
  it.each(["solicitada", "em_confirmacao"])("confirma %s antes de pagamento sem cancelar dívida nem alterar valores", async estado => {
    setup({ btgCancelamentos: [{ ...operation, estado }] });
    const before = financial(), history = protectedHistory();
    expect(await call(event("collections.cancelled", { status: "CANCELED" }))).toMatchObject({ status: 200, body: { ok: true } });
    expect(fixture.state.tables.btgCobrancasEmitidas[0]).toMatchObject({ ...emission, status: "cancelada", updatedAt: expect.any(Date) });
    expect(fixture.state.tables.parcelasAcordo).toEqual(before.parcelasAcordo);
    expect(fixture.state.tables.acordos).toEqual(before.acordos);
    expect(protectedHistory()).toEqual(history);
    expect(fixture.state.tables.btgCancelamentos[0]).toMatchObject({
      ...operation, estado: "cancelada", codigo: "CANCELED", confirmadaEm: expect.any(Date), updatedAt: expect.any(Date),
    });
    expect(auditMetadata()).toEqual([expect.objectContaining({ evento: "webhook_cancelamento_confirmado", estado: "cancelada", codigo: "CANCELED", emissaoId: 51, parcelaId: 31, ambiente: "producao" })]);
    expect(fixture.state.writes.filter(w => ["auditLogs", "btgCancelamentos", "btgCobrancasEmitidas"].includes(w.table ?? "")).every(w => w.inTransaction)).toBe(true);
    assertOrderedLocks();
  });
  it.each(["collections.canceled", "colections.cancelled"])("alias %s confirma o mesmo estado final", async name => {
    expect((await call(event(name))).status).toBe(200);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("cancelada");
  });
  it("payload não autenticado não consulta banco nem muda operação", async () => {
    const before = structuredClone(fixture.state.tables);
    expect(await call(event(), "wrong-fixture")).toMatchObject({ status: 401 });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(fixture.state.tables).toEqual(before);
  });
  it("paid integral → cancel tardio preserva baixa, snapshots e conflito operacional", async () => {
    expect((await call(paid())).status).toBe(200);
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect(fixture.state.tables.parcelasAcordo[0]).toMatchObject({ ...installment, status: "pago", paymentDate: new Date(PAID) });
    expect(ops[0]).toMatchObject({ estado: "conflito_pagamento", codigo: "CONFLITO_PAGAMENTO", confirmadaEm: null });
    expect((await call(event())).status).toBe(200);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toHaveLength(1);
  });
  it("cancel confirmado → paid integral mantém prioridade paga e converte operação em conflito", async () => {
    await call();
    const confirmed = fixture.state.tables.btgCancelamentos[0].confirmadaEm;
    await call(paid());
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
    expect(fixture.state.tables.parcelasAcordo[0].paymentDate).toEqual(new Date(PAID));
    expect(fixture.state.tables.btgCancelamentos[0]).toMatchObject({ estado: "conflito_pagamento", codigo: "CONFLITO_PAGAMENTO", confirmadaEm: confirmed });
    const before = financial();
    await call(event("collections.canceled"));
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("conflito_pagamento");
  });
  it.each([0, AMOUNT - 1, AMOUNT + 1])("partial/divergente %i + cancel tardio continua revisão sem baixa", async amountPaid => {
    const before = financial();
    expect(await call(paid({ amountPaid }))).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos[0]).toMatchObject({ estado: "conflito_pagamento", codigo: "CONFLITO_PAGAMENTO" });
    expect(await call()).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgWebhookEntregas[1].erroCodigo).toBe("CANCELLATION_PAYMENT_CONFLICT");
    expect(fixture.state.tables.auditLogs).toHaveLength(1);
  });
  it("paid conflitante/sem valor não usa amount nominal nem cancela após entrega tardia", async () => {
    const before = financial();
    await call(paid({ paidAmount: AMOUNT - 1 }));
    await call();
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("conflito_pagamento");
  });
  it("livro de entrega parcial sem operação também impede cancelamento tardio", async () => {
    setup({ btgCancelamentos: [] });
    const before = financial();
    await call(paid({ amountPaid: 1 }));
    await call();
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual([]);
  });
  it.each([
    { status: "PARTIALLY_PAID" }, { paidAt: PAID }, { paidAmount: 1 },
    { hasPayment: true }, { paymentDate: PAID }, { pagamentoDetectado: true },
  ])("cancel com indício %j continua conflito sem baixa", async data => {
    const before = financial();
    expect(await call(event("collections.cancelled", data))).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("conflito_pagamento");
  });
  it("indício em cancel anterior sem operação não se perde na entrega seguinte", async () => {
    setup({ btgCancelamentos: [] });
    const before = financial();
    await call(event("collections.cancelled", { status: "PARTIALLY_PAID" }));
    await call(event("collections.canceled"));
    expect(financial()).toEqual(before);
  });
  it.each([
    { parcelasAcordo: [{ ...installment, status: "pago", paymentDate: new Date(PAID) }] },
    { parcelasAcordo: [{ ...installment, paymentDate: new Date(PAID) }] },
    { acordos: [{ ...agreement, status: "pago" }] },
    { btgCobrancasEmitidas: [{ ...emission, erroCodigo: "PAYMENT_PARTIAL_REVIEW" }] },
  ])("indício local impede cancelada e marca conflito operacional", async overrides => {
    setup(overrides);
    const before = financial();
    await call();
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("conflito_pagamento");
  });
  it.each(["preparada", "recusada", "cancelada", "conflito_pagamento"])("cancel não consome/regride operação %s", async estado => {
    setup({ btgCancelamentos: [{ ...operation, estado, codigo: estado === "conflito_pagamento" ? "CONFLITO_PAGAMENTO" : "FIXTURE_CODE" }] });
    const before = structuredClone(fixture.state.tables.btgCancelamentos);
    await call();
    expect(fixture.state.tables.btgCancelamentos).toEqual(before);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("created tardio não reabre cancelada nem remove a confirmação operacional", async () => {
    await call();
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    await call(event("collections.created", { status: "CREATED" }));
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
  });
  it("created durante operação pendente não altera estado/código nem snapshots/documentos", async () => {
    const ops = structuredClone(fixture.state.tables.btgCancelamentos), history = protectedHistory();
    await call(event("collections.created"));
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(protectedHistory()).toEqual(history);
    expect(fixture.state.tables.parcelasAcordo[0].canalBancario).toBe("api_btg_v2");
  });
  it.each(["CREATED", "CANCELING", "CANCEL_FAILED", "UNKNOWN"])("status contraditório %s exige consulta sem confirmação", async status => {
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect(await call(event("collections.cancelled", { status }))).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it.each([
    { externalId: "other-fixture" }, { correlationId: "other-fixture" },
    { documentNumber: "PA32R1" }, { type: "OTHER" }, { amount: AMOUNT + 1 },
  ])("identidade opcional contraditória %j não confirma a operação", async data => {
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect(await call(event("collections.cancelled", data))).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("identidade opcional concordante confirma sem persistir seus campos", async () => {
    expect((await call(event("collections.cancelled", {
      externalId: emission.externalId, correlationId: "btgv2-51", documentNumber: "PA31R1", type: "BANKSLIP_QRCODE", amount: AMOUNT,
    }))).status).toBe(200);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("cancelada");
    expect(auditMetadata()[0]).not.toHaveProperty("externalId");
  });
  it("nominal local divergente não impede registrar conflito, mas mantém regra de não baixa", async () => {
    setup({ parcelasAcordo: [{ ...installment, amount: AMOUNT + 1 }] });
    const before = financial();
    expect(await call(paid())).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("conflito_pagamento");
    await call();
    expect(financial()).toEqual(before);
  });
  it.each([
    { parcelasAcordo: [{ ...installment, amount: AMOUNT + 1 }] },
    { parcelasAcordo: [{ ...installment, dueDate: new Date("2027-01-01") }] },
    { parcelasAcordo: [{ ...installment, status: "cancelado" }] },
    { acordos: [{ ...agreement, status: "cancelado" }] },
  ])("contexto divergente não confirma cancelamento sem consulta", async overrides => {
    setup(overrides);
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect(await call()).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
  });
});

describe("BTG — escopo operacional, rollback, selfduplicates e locks", () => {
  it.each([
    { btgIntegracaoId: 8 }, { condominioId: 3 }, { parcelaAcordoId: 32 }, { btgCobrancaEmitidaId: 52 },
  ])("operação fora do escopo %j não é alterada", async override => {
    setup({ btgCancelamentos: [{ ...operation, ...override }] });
    const before = structuredClone(fixture.state.tables.btgCancelamentos);
    await call();
    expect(fixture.state.tables.btgCancelamentos).toEqual(before);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it.each([
    { links: [] }, { links: [{ id: 1, btgIntegracaoId: 7, condominioId: 2, btgContaRecebedoraId: 99, ativo: 1 }] },
    { links: [{ id: 1, btgIntegracaoId: 7, condominioId: 2, btgContaRecebedoraId: 15, ativo: 0 }] },
  ])("vínculo desconhecido/divergente/inativo não sofre reparo nem bookkeeping", async ({ links }) => {
    setup({ btgContaRecebedoraCondominios: links });
    const ops = structuredClone(fixture.state.tables.btgCancelamentos);
    await call(paid());
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.btgContaRecebedoraCondominios).toEqual(links);
    expect(fixture.state.tables.auditLogs).toEqual([]);
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
  });
  it("evento de revisão antiga não confirma operação nem atinge a emissão atual", async () => {
    const latest = { ...emission, id: 52, revisao: 2, btgCollectionId: "latest-fixture" };
    setup({ btgCobrancasEmitidas: [emission, latest] });
    const ops = structuredClone(fixture.state.tables.btgCancelamentos);
    await call();
    expect(fixture.state.tables.btgCobrancasEmitidas[1]).toEqual(latest);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("collection ambígua não modifica emissão nem operação", async () => {
    setup({ btgCobrancasEmitidas: [emission, { ...emission, id: 52, origemId: 32 }] });
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect(await call()).toMatchObject({ status: 200, body: { ok: true, ignored: true } });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
  });
  it.each([event(), paid()])("falha de auditoria desfaz operação/financeiro e nunca pré-envia ACK 200", async payload => {
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    failAuditOnce();
    expect(await call(payload)).toEqual({ status: 500, body: { ok: false, error: "PROCESSING_FAILED" }, statuses: [500] });
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
    expect(fixture.state.rollbacks).toBe(1);
    expect(fixture.state.tables.btgWebhookEntregas[0]).toMatchObject({ statusProcessamento: "falha", erroCodigo: "PROCESSING_FAILED", processadoEm: null });
    expect((await call(payload)).status).toBe(200);
    expect(fixture.state.tables.auditLogs).toHaveLength(1);
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
  });
  it("auditoria sem affectedRows=1 também aborta e preserva operação", async () => {
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    failAuditOnce("zero");
    expect((await call()).statuses).toEqual([500]);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
  });
  it("update operacional sem linha afetada não confirma nem audita", async () => {
    const update = fixture.db.update.getMockImplementation()!;
    fixture.db.update.mockImplementation((table: any) => getTableName(table) === "btgCancelamentos"
      ? { set: () => ({ where: () => Promise.resolve([{ affectedRows: 0 }]) }) } : update(table));
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect((await call()).statuses).toEqual([500]);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("falha ao finalizar entrega desfaz confirmação, auditoria e emissão", async () => {
    fixture.state.failInjected = { table: "btgWebhookEntregas", times: 1 };
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect((await call()).statuses).toEqual([500]);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("emissão sem linha afetada desfaz operação e auditoria, sem ACK de sucesso", async () => {
    const update = fixture.db.update.getMockImplementation()!;
    fixture.db.update.mockImplementation((table: any) => getTableName(table) === "btgCobrancasEmitidas"
      ? { set: () => ({ where: () => Promise.resolve([{ affectedRows: 0 }]) }) } : update(table));
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect((await call()).statuses).toEqual([500]);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("finalização sem linha afetada aborta operação/auditoria e não envia ACK 200", async () => {
    const update = fixture.db.update.getMockImplementation()!;
    let skip = true;
    fixture.db.update.mockImplementation((table: any) => {
      if (getTableName(table) === "btgWebhookEntregas" && skip) {
        skip = false;
        return { set: () => ({ where: () => Promise.resolve([{ affectedRows: 0 }]) }) };
      }
      return update(table);
    });
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect((await call()).statuses).toEqual([500]);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it("entrega legada não autenticada não confirma operação mesmo em reenvio", async () => {
    const payload = event();
    setup({ btgWebhookEntregas: [{
      id: 91, btgIntegracaoId: 7, payloadHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      evento: payload.event, btgCollectionId: emission.btgCollectionId, assinaturaValida: 0,
      statusProcessamento: "recebido", erroCodigo: null, processadoEm: null,
    }] });
    const before = financial(), ops = structuredClone(fixture.state.tables.btgCancelamentos);
    expect((await call(payload)).statuses).toEqual([500]);
    expect(financial()).toEqual(before);
    expect(fixture.state.tables.btgCancelamentos).toEqual(ops);
    expect(fixture.state.tables.auditLogs).toEqual([]);
  });
  it.each([event(), paid({ amountPaid: 1 })])("selfduplicate idêntica e simultânea não repete operação/auditoria", async payload => {
    const results = await Promise.all([call(payload), call(payload)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(results.filter(r => r.body.duplicate)).toHaveLength(1);
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(1);
    expect(fixture.state.tables.auditLogs).toHaveLength(1);
    const before = structuredClone(fixture.state.tables);
    expect((await call(payload)).body).toEqual({ ok: true, duplicate: true });
    expect(fixture.state.tables).toEqual(before);
  });
  it("payload cancel diferente da mesma coleção não reaudita confirmação terminal", async () => {
    await call();
    const op = structuredClone(fixture.state.tables.btgCancelamentos);
    await call(event("collections.canceled", { status: "CANCELED" }));
    expect(fixture.state.tables.btgWebhookEntregas).toHaveLength(2);
    expect(fixture.state.tables.btgCancelamentos).toEqual(op);
    expect(fixture.state.tables.auditLogs).toHaveLength(1);
  });
  it("sobreposição cancel/paid solicita locks na ordem compatível (mock; não InnoDB)", async () => {
    const cancellation = fixture.db.transaction(async (tx: any) => {
      await tx.select().from(users).where(eq(users.id, 1)).limit(1).for("update");
      await tx.select().from(btgIntegracoes).where(eq(btgIntegracoes.id, 7)).limit(1).for("update");
      await tx.select().from(btgContaRecebedoraCondominios).where(eq(btgContaRecebedoraCondominios.condominioId, 2)).limit(1).for("share");
      await tx.select().from(acordos).where(eq(acordos.id, 11)).limit(1).for("update");
      await tx.select().from(parcelasAcordo).where(eq(parcelasAcordo.id, 31)).limit(1).for("update");
      await tx.select().from(btgCobrancasEmitidas).where(and(eq(btgCobrancasEmitidas.origemTipo, "parcela_acordo"), eq(btgCobrancasEmitidas.origemId, 31))).orderBy(desc(btgCobrancasEmitidas.revisao)).for("update");
      await tx.select().from(btgCancelamentos).where(eq(btgCancelamentos.btgCobrancaEmitidaId, 51)).for("update");
      await tx.update(btgCancelamentos).set({ estado: "em_confirmacao", codigo: "RESULTADO_INCERTO" }).where(eq(btgCancelamentos.id, 81));
    });
    const results = await Promise.all([cancellation, call(paid()), call()]);
    expect(results.slice(1).every(r => r.status === 200)).toBe(true);
    expect(fixture.state.tables.btgCobrancasEmitidas[0].status).toBe("paga");
    expect(fixture.state.tables.btgCancelamentos[0].estado).toBe("conflito_pagamento");
    const segments: typeof fixture.state.operations[] = [];
    for (const entry of fixture.state.operations) {
      if (entry.kind === "transaction-begin") segments.push([]);
      if (entry.inTransaction) segments.at(-1)?.push(entry);
    }
    expect(segments).toHaveLength(3);
    segments.forEach(assertOrderedLocks);
    expect(fixture.state.locks.filter(l => l.startsWith("btgWebhookEntregas:"))).toHaveLength(2);
  });
  it("dados arbitrários, motivo, segredo e meios de pagamento não entram em auditoria/log", async () => {
    const sentinel = "never-store-fixture-sensitive-body";
    const result = await call(event("collections.cancelled", { reason: sentinel, cpf: sentinel, barcode: sentinel, payload: sentinel }));
    const observable = JSON.stringify({ result, tables: fixture.state.tables, logs: [vi.mocked(console.error).mock.calls, vi.mocked(console.warn).mock.calls, vi.mocked(console.log).mock.calls] });
    expect(observable).not.toContain(sentinel);
    expect(observable).not.toContain(SECRET);
    const metadata = auditMetadata()[0];
    expect(Object.keys(metadata).sort()).toEqual(["ambiente", "codigo", "emissaoId", "entregaId", "estado", "evento", "operacaoId", "parcelaId"].sort());
    expect(fixture.state.tables.btgCancelamentos[0].motivoCifrado).toBe(operation.motivoCifrado);
    expect(fixture.state.tables.btgCancelamentos[0].consultaCifrada).toBe(operation.consultaCifrada);
    expect(fixture.state.tables.btgCancelamentos[0].httpStatus).toBe(204);
    expect(fixture.state.tables.btgWebhookEntregas[0].payloadHash).toBe(createHash("sha256").update(JSON.stringify(event("collections.cancelled", { reason: sentinel, cpf: sentinel, barcode: sentinel, payload: sentinel }))).digest("hex"));
  });
});
