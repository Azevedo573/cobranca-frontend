import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BtgHttpDiagnostico } from "../drizzle/schema";
import { aadDiagnosticoBtg, cifrarDiagnosticoBtg, RETENCAO_DIAGNOSTICO_BTG_MS } from "./btg-v2/diagnosticos-crypto";
import { classificarProvaReenvioBtg, INICIO_MARCADOR_FALHA_ANTES_POST_BTG, type EmissaoProvaReenvioBtg } from "./btg-v2/reenvio-provas";
const now = new Date("2026-11-09T13:00:00.000Z");
const created = new Date("2026-11-09T12:30:00.000Z");
const captured = new Date("2026-11-09T12:30:01.000Z");
const updated = new Date("2026-11-09T12:30:02.000Z");
const secret = "RETORNO-PAGADOR-NAO-VAZAR";
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function emissao(changes: Partial<EmissaoProvaReenvioBtg> = {}): EmissaoProvaReenvioBtg {
  return { id: 40, btgIntegracaoId: 1, btgContaRecebedoraId: 7, btgRemessaId: 30, condominioId: 2,
    origemTipo: "parcela_acordo", origemId: 20, revisao: 1, instrumento: "bolepix", externalId: "parcela-20-r1",
    idempotencyKey: "idempotente", btgCollectionId: null, status: "reservada", amount: 27087,
    dueDate: new Date("2026-12-09T00:00:00Z"), agenciaRecebedora: "0050", contaRecebedora: "003081850",
    documentoBeneficiario: "30306294000145", nomeBeneficiario: null, bankSlipUrl: null, pixQrCode: null,
    pixCopiaECola: null, codigoBarras: null, linhaDigitavel: null, nossoNumero: null,
    erroCodigo: "CAPTURA_OU_PREPARO_NAO_CONCLUIDO", emitidaEm: null, createdAt: created, updatedAt: updated,
    falhaAntesEnvioEm: null, ...changes };
}
function payload(changes: Record<string, unknown> = {}) {
  return { amount: 270.87, dueDate: "2026-12-09", type: "BANKSLIP_QRCODE", account: { branch: "0050", number: "003081850" },
    detail: { correlationId: "btgv2-40", externalId: "parcela-20-r1", documentNumber: "PA20R1" },
    payer: { name: secret, taxId: "52998224725" }, interest: { startDate: "1999-02-06T00:00:00Z" }, ...changes };
}
function diag(body?: unknown, payloadValue: unknown = payload()): BtgHttpDiagnostico {
  const bytes = Buffer.from(JSON.stringify(payloadValue));
  const row: BtgHttpDiagnostico = { id: 50, chaveCaptura: "a71d74c3-e97c-441e-b09b-cffb15f7874c", ambiente: "sandbox",
    btgIntegracaoId: 1, btgCobrancaEmitidaId: 40, btgRemessaId: 30, parcelaAcordoId: 20, condominioId: 2,
    usuarioId: 11, operacao: "emissao", estadoCaptura: "preparado", httpStatus: null, correlationId: "btgv2-40",
    payloadCifrado: null, respostaCifrada: null, payloadSha256: digest(bytes), respostaSha256: null,
    payloadBytes: bytes.length, respostaBytes: null, respostaCompleta: 0, versaoCriptografia: "v1",
    capturaCriadaEm: captured, respostaRecebidaEm: null, conteudoExpurgadoEm: null, updatedAt: updated };
  row.payloadCifrado = cifrarDiagnosticoBtg(bytes, aadDiagnosticoBtg(row));
  if (body !== undefined) {
    const response = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    Object.assign(row, { estadoCaptura: "resposta_recebida", httpStatus: 400, respostaCompleta: 1,
      respostaSha256: digest(response), respostaBytes: response.length, respostaRecebidaEm: updated,
      respostaCifrada: cifrarDiagnosticoBtg(response, aadDiagnosticoBtg(row, "resposta")) });
  }
  return row;
}
function official() { return { name: "BadRequestError", brn: "brn:empresas:banking:errors:bad-request-error",
  reason: "Dados inválidos na requisição", invalidParams: [{ name: "startDate", reason: "A data de inicio do juros deve ser maior ao vencimento da cobrança", value: "1999-02-06T00:00:00Z" }] }; }
function classify(e = emissao(), d: BtgHttpDiagnostico | null = diag(), n = now) { return classificarProvaReenvioBtg(e, d, n); }
beforeEach(() => { vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Rede proibida"); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("classificador puro — falha local comprovada", () => {
  it("reservada + código exato + preparado íntegro comprova falha local, sem rede/DB", () => {
    const result = classify();
    expect(result).toMatchObject({ codigo: "falha_local_comprovada", diagnosticoId: 50, motivo: "FALHA_LOCAL_COMPROVADA" });
    expect(result.hashProva).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("código legado sem captura NÃO prova falha local", () => { expect(classify(emissao(), null)).toMatchObject({ codigo: "incerta", diagnosticoId: null, motivo: "SEM_PROVA_PROTEGIDA" }); });
  it.each(["incerta", "falha", "enviando", "emitida", "paga", "cancelada", "expirada"] as const)("status %s nunca vira falha local", status => { expect(classify(emissao({ status })).codigo).toBe("incerta"); });
  it.each([null, "EMISSAO_SEM_CONFIRMACAO", "HTTP_400", "CAPTURA_OU_PREPARO_NAO_CONCLUIDO-extra"])("código %s não é aceito por substring", erroCodigo => { expect(classify(emissao({ erroCodigo })).codigo).toBe("incerta"); });
  it.each(["enviando", "resposta_incompleta", "resposta_recebida", "sem_resposta"] as const)("captura %s impede prova antesPOST", estadoCaptura => {
    expect(classify(emissao(), { ...diag(), estadoCaptura }).codigo).toBe("incerta");
    expect(classify(emissao({ erroCodigo: "FALHA_ANTES_POST_COMPROVADA", falhaAntesEnvioEm: updated }), { ...diag(), estadoCaptura }).codigo).toBe("incerta");
  });
  it.each([{ httpStatus: 400 }, { respostaCompleta: 1 }, { respostaCifrada: "v1:invalid" }, { respostaSha256: "f".repeat(64) }, { respostaBytes: 0 }, { respostaRecebidaEm: updated }])("preparado com evidência conflitante bloqueia: %j", change => { expect(classify(emissao(), { ...diag(), ...change }).codigo).toBe("incerta"); });
  it.each([{ btgCollectionId: "collection-real" }, { emitidaEm: updated }, { origemTipo: "cobranca" as const }, { createdAt: new Date(NaN) }, { updatedAt: new Date(now.getTime() + 1) }])("emissão inconsistente bloqueia: %j", change => { expect(classify(emissao(change)).codigo).toBe("incerta"); });
  it.each([{ btgCobrancaEmitidaId: 41 }, { btgIntegracaoId: 2 }, { parcelaAcordoId: 21 }, { condominioId: 3 }, { btgRemessaId: 31 }, { correlationId: "btgv2-41" }, { capturaCriadaEm: new Date(created.getTime() - 1) }])("vínculo divergente bloqueia: %j", change => { expect(classify(emissao(), { ...diag(), ...change }).codigo).toBe("incerta"); });
  it.each([{ amount: 271 }, { dueDate: "2026-12-10" }, { type: "BANKSLIP" }, { account: { branch: "50", number: "003081850" } }, { detail: { correlationId: "btgv2-40", externalId: "outro", documentNumber: "PA20R1" } }])("payload protegido divergente bloqueia: %j", change => { expect(classify(emissao(), diag(undefined, payload(change))).codigo).toBe("incerta"); });
  it("não altera os objetos recebidos", () => {
    const e = emissao(); const d = diag(); const before = JSON.stringify([e, d]);
    classify(e, d); expect(JSON.stringify([e, d])).toBe(before);
  });
});
describe("marcador novo antesPOST — sem prova retroativa", () => {
  const marked = () => emissao({ erroCodigo: "FALHA_ANTES_POST_COMPROVADA", falhaAntesEnvioEm: updated });
  it("marcador Date válido em tentativa nova reservada permite prova sem diagnóstico", () => {
    expect(classify(marked(), null)).toMatchObject({ codigo: "falha_local_comprovada", diagnosticoId: null, motivo: "MARCADOR_ANTES_POST_COMPROVADO" });
  });
  it("marcador com captura preparada íntegra também é prova local", () => { expect(classify(marked(), diag()).codigo).toBe("falha_local_comprovada"); });
  it.each([null, new Date(NaN), new Date(created.getTime() - 1), new Date(updated.getTime() + 1)])("timestamp inválido não autoriza: %j", falhaAntesEnvioEm => { expect(classify({ ...marked(), falhaAntesEnvioEm }, null).codigo).toBe("incerta"); });
  it("string de timestamp não é Date válido", () => { expect(classify({ ...marked(), falhaAntesEnvioEm: updated.toISOString() as unknown as Date }, null).codigo).toBe("incerta"); });
  it("emissão antiga não pode ser legitimada por marker posterior", () => { expect(classify({ ...marked(), createdAt: new Date(INICIO_MARCADOR_FALHA_ANTES_POST_BTG.getTime() - 1) }, null).codigo).toBe("incerta"); });
  it("marcador não vence evidência adulterada/expurgada ou título existente", () => {
    expect(classify(marked(), { ...diag(), payloadSha256: "f".repeat(64) }).codigo).toBe("incerta");
    expect(classify(marked(), { ...diag(), conteudoExpurgadoEm: updated }).codigo).toBe("incerta");
    expect(classify({ ...marked(), btgCollectionId: "existing" }, null).codigo).toBe("incerta");
  });
});
describe("integridade cifrada e TTL de 30 dias", () => {
  it.each(["payloadCifrado", "respostaCifrada"] as const)("cifra %s adulterada impede decisão", field => {
    const d = diag(official()); d[field] = d[field]!.slice(0, -1) + (d[field]!.endsWith("A") ? "B" : "A");
    expect(classify(emissao({ status: "incerta" }), d).codigo).toBe("incerta");
  });
  it.each([{ payloadSha256: "f".repeat(64) }, { payloadBytes: 1 }, { respostaSha256: "f".repeat(64) }, { respostaBytes: 1 }, { versaoCriptografia: "v2" }, { chaveCaptura: "b71d74c3-e97c-441e-b09b-cffb15f7874c" }, { ambiente: "producao" as const }])("hash/bytes/AAD versão alterados bloqueiam: %j", change => {
    expect(classify(emissao({ status: "incerta" }), { ...diag(official()), ...change })).toMatchObject({ codigo: "incerta", motivo: "EVIDENCIA_INVALIDA" });
  });
  it("chave incorreta/ausente mantém incerteza sem erro externo", () => {
    const d = diag(); vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 8).toString("base64"));
    expect(classify(emissao(), d).codigo).toBe("incerta"); vi.stubEnv("BTG_TOKEN_ENCRYPTION_KEY", "");
    expect(classify(emissao(), d).codigo).toBe("incerta");
  });
  it("TTL expira exatamente em 30 dias; metadados não reconstroem corpo", () => {
    const d = diag(); const end = new Date(captured.getTime() + RETENCAO_DIAGNOSTICO_BTG_MS);
    expect(classify(emissao(), d, new Date(end.getTime() - 1)).codigo).toBe("falha_local_comprovada");
    expect(classify(emissao(), d, end)).toMatchObject({ codigo: "incerta", motivo: "EVIDENCIA_EXPIRADA_OU_EXPURGADA" });
    expect(classify(emissao(), { ...d, conteudoExpurgadoEm: updated, payloadCifrado: null }).codigo).toBe("incerta");
  });
  it("captura futura ou data inválida não serve como prova", () => {
    expect(classify(emissao(), { ...diag(), capturaCriadaEm: new Date(now.getTime() + 1) }).codigo).toBe("incerta");
    expect(classify(emissao(), { ...diag(), updatedAt: new Date(NaN) }).codigo).toBe("incerta");
    expect(classify(emissao(), diag(), new Date(NaN)).codigo).toBe("incerta");
  });
  it("hashProva muda com estágio/código/timestamp/diaghash, mantendo corpo fora do retorno", () => {
    const e = emissao(); const d = diag(); const original = classify(e, d).hashProva;
    for (const changed of [emissao({ status: "incerta" }), emissao({ erroCodigo: "OUTRO" }), emissao({ updatedAt: new Date(updated.getTime() + 1) }), emissao({ falhaAntesEnvioEm: updated })]) expect(classify(changed, d).hashProva).not.toBe(original);
    expect(classify(e, { ...d, payloadSha256: "a".repeat(64) }).hashProva).not.toBe(original);
    const result = classify(e, diag(official())); expect(Object.keys(result).sort()).toEqual(["codigo", "diagnosticoId", "hashProva", "motivo"]);
    expect(JSON.stringify(result)).not.toContain("1999"); expect(JSON.stringify(result)).not.toContain(secret);
  });
});
describe("rejeição bancária — sem inferência financeira por HTTP400", () => {
  it("exemplo oficial válido é identificado, mas não prova ausência sem garantia contratual", () => {
    expect(classify(emissao({ status: "incerta" }), diag(official()))).toMatchObject({ codigo: "incerta", motivo: "REJEICAO_OFICIAL_SEM_GARANTIA_DE_AUSENCIA", diagnosticoId: 50 });
  });
  it.each([{}, { name: "BadRequestError" }, { ...official(), brn: "brn:outro:bad-request-error" }, { ...official(), name: "PrefixBadRequestError" }, { ...official(), invalidParams: [] }, { ...official(), invalidParams: [null] }, { ...official(), invalidParams: [{ name: "startDate", reason: "Campo inválido" }] }, { ...official(), collectionId: "existing" }, { ...official(), success: true }, { ...official(), status: "CREATED" }, { ...official(), data: { collectionId: "existing" } }, { ...official(), invalidParams: [{ name: "__proto__", reason: "Campo inválido", value: "x" }] }, { ...official(), invalidParams: [{ name: "startDate", reason: "Campo inválido", value: "valor-conflitante" }] }, { ...official(), invalidParams: [{ name: "inventado", reason: "Campo inválido", value: "x" }] }, { ...official(), invalidParams: [{ name: "startDate", reason: 123, value: "1999-02-06T00:00:00Z" }] }])("body estrutural/conflitante nunca libera: %j", body => {
    expect(classify(emissao({ status: "incerta" }), diag(body))).toMatchObject({ codigo: "incerta", motivo: "EVIDENCIA_INVALIDA" });
  });
  it.each(["HTTP 400 Dados inválidos na requisição", "<html>BadRequestError</html>", "{\"invalidParams\":[", ""])("texto/substrings não são prova: %s", body => { expect(classify(emissao({ status: "incerta" }), diag(body)).codigo).toBe("incerta"); });
  it.each([404, 422, 500, 200])("HTTP %i legado não comprova rejeição definitiva", httpStatus => { expect(classify(emissao({ status: "incerta" }), { ...diag(official()), httpStatus })).toMatchObject({ codigo: "incerta", motivo: "RESPOSTA_NAO_DEFINITIVA" }); });
  it.each([{ respostaCompleta: 0 }, { estadoCaptura: "resposta_incompleta" as const }, { estadoCaptura: "sem_resposta" as const }, { respostaRecebidaEm: null }])("400 incompleto/sem resposta bloqueia: %j", change => { expect(classify(emissao({ status: "incerta" }), { ...diag(official()), ...change }).codigo).toBe("incerta"); });
});
