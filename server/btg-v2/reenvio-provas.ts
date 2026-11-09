import { createHash, timingSafeEqual } from "node:crypto";
import type { BtgCobrancaEmitida, BtgHttpDiagnostico } from "../../drizzle/schema";
import { aadDiagnosticoBtg, decifrarDiagnosticoBtg, LIMITE_CAPTURA_BTG_BYTES, RETENCAO_DIAGNOSTICO_BTG_MS } from "./diagnosticos-crypto";

export type EmissaoProvaReenvioBtg = BtgCobrancaEmitida & { falhaAntesEnvioEm?: Date | null };
export type CodigoProvaReenvioBtg = "falha_local_comprovada" | "rejeicao_definitiva" | "incerta";
export interface ProvaReenvioBtg {
  codigo: CodigoProvaReenvioBtg;
  diagnosticoId: number | null;
  hashProva: string;
  motivo: "FALHA_LOCAL_COMPROVADA" | "MARCADOR_ANTES_POST_COMPROVADO" | "SEM_PROVA_PROTEGIDA"
    | "ESTADO_NAO_ELEGIVEL" | "EVIDENCIA_CONFLITANTE" | "EVIDENCIA_EXPIRADA_OU_EXPURGADA"
    | "EVIDENCIA_INVALIDA" | "RESPOSTA_NAO_DEFINITIVA" | "REJEICAO_OFICIAL_SEM_GARANTIA_DE_AUSENCIA";
}

/** Marker só pode ser escrito pelo emissor atualizado para tentativas novas.
 * Não usar updatedAt como prova nem backfill de histórico. Parent deve persistir
 * code+timestamp atomicamente antesPOST; o helper não acessa/escreve DB.
 */
export const INICIO_MARCADOR_FALHA_ANTES_POST_BTG = new Date("2026-11-09T12:00:00.000Z");
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const objeto = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const dataValida = (date: unknown): date is Date => date instanceof Date && Number.isFinite(date.getTime());
const tempo = (value: unknown): number | null => dataValida(value) ? value.getTime() : null;
const inteiroPositivo = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const ausente = (value: unknown) => value === null || value === undefined;

function marcadorValido(emissao: EmissaoProvaReenvioBtg): boolean {
  return emissao.status === "reservada" && emissao.erroCodigo === "FALHA_ANTES_POST_COMPROVADA"
    && dataValida(emissao.createdAt) && dataValida(emissao.updatedAt) && dataValida(emissao.falhaAntesEnvioEm)
    && emissao.createdAt >= INICIO_MARCADOR_FALHA_ANTES_POST_BTG
    && emissao.falhaAntesEnvioEm >= emissao.createdAt && emissao.falhaAntesEnvioEm <= emissao.updatedAt;
}

function hashEstado(emissao: EmissaoProvaReenvioBtg, diagnostico: BtgHttpDiagnostico | null): string {
  // Inclui estado/data/diaghash, não cifra, body, CPF ou frase bancária no retorno.
  return hash(JSON.stringify(["btg-reenvio-prova-v1", emissao.id, emissao.btgIntegracaoId,
    emissao.btgContaRecebedoraId, emissao.origemTipo, emissao.origemId, emissao.revisao,
    emissao.status, emissao.erroCodigo, emissao.btgCollectionId, emissao.amount,
    tempo(emissao.dueDate), emissao.agenciaRecebedora, emissao.contaRecebedora,
    emissao.documentoBeneficiario, emissao.externalId, tempo(emissao.createdAt),
    tempo(emissao.updatedAt), tempo(emissao.emitidaEm), tempo(emissao.falhaAntesEnvioEm),
    diagnostico && [diagnostico.id, diagnostico.chaveCaptura, diagnostico.ambiente,
      diagnostico.btgIntegracaoId, diagnostico.btgCobrancaEmitidaId, diagnostico.parcelaAcordoId,
      diagnostico.condominioId, diagnostico.btgRemessaId, diagnostico.operacao,
      diagnostico.correlationId, diagnostico.estadoCaptura, diagnostico.httpStatus,
      diagnostico.versaoCriptografia, diagnostico.payloadSha256, diagnostico.respostaSha256,
      diagnostico.payloadBytes, diagnostico.respostaBytes, diagnostico.respostaCompleta,
      tempo(diagnostico.capturaCriadaEm), tempo(diagnostico.respostaRecebidaEm),
      tempo(diagnostico.conteudoExpurgadoEm), tempo(diagnostico.updatedAt),
      typeof diagnostico.payloadCifrado === "string" ? hash(diagnostico.payloadCifrado) : null,
      typeof diagnostico.respostaCifrada === "string" ? hash(diagnostico.respostaCifrada) : null]]));
}

function lerParte(row: BtgHttpDiagnostico, parte: "payload" | "resposta"): Record<string, unknown> {
  const cifra = parte === "payload" ? row.payloadCifrado : row.respostaCifrada;
  const sha = parte === "payload" ? row.payloadSha256 : row.respostaSha256;
  const tamanho = parte === "payload" ? row.payloadBytes : row.respostaBytes;
  if (row.versaoCriptografia !== "v1" || typeof cifra !== "string" || cifra.length > 90_000 || typeof sha !== "string" || !/^[a-f0-9]{64}$/.test(sha) || !inteiroPositivo(tamanho) || tamanho > LIMITE_CAPTURA_BTG_BYTES) throw new Error("EVIDENCIA_INVALIDA");
  const bytes = decifrarDiagnosticoBtg(cifra, aadDiagnosticoBtg(row, parte));
  try {
    if (bytes.length !== tamanho || !timingSafeEqual(Buffer.from(hash(bytes), "hex"), Buffer.from(sha, "hex"))) throw new Error("EVIDENCIA_INVALIDA");
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!objeto(value)) throw new Error("EVIDENCIA_INVALIDA");
    return value;
  } finally { bytes.fill(0); }
}

function payloadCoerente(payload: Record<string, unknown>, emissao: EmissaoProvaReenvioBtg, diag: BtgHttpDiagnostico): boolean {
  if (!objeto(payload.detail) || !objeto(payload.account) || !dataValida(emissao.dueDate)) return false;
  return payload.type === "BANKSLIP_QRCODE" && typeof payload.amount === "number"
    && Number.isSafeInteger(emissao.amount) && emissao.amount > 0
    && payload.amount === Number((emissao.amount / 100).toFixed(2))
    && payload.dueDate === emissao.dueDate.toISOString().slice(0, 10)
    && payload.account.branch === emissao.agenciaRecebedora && payload.account.number === emissao.contaRecebedora
    && payload.detail.correlationId === diag.correlationId && diag.correlationId === `btgv2-${emissao.id}`
    && payload.detail.externalId === emissao.externalId
    && payload.detail.documentNumber === `PA${emissao.origemId}R${emissao.revisao}`;
}

/** Esquema HTTP400 oficial verificado pela aba/asset público:
 * https://developers.empresas.btgpactual.com/assets/js/b05136c2.10e8401d.js
 * Par exato de exemplos + invalidParams reais com value/name/reason strings.
 * Isto NÃO garante atomicidade da criação ou ausência de título. Logo nenhuma
 * regra de rejeicao_definitiva está habilitada sem garantia adicional do BTG.
 * Não substring de frase, HTTP400 isolado, 404 legado, FAILED ou lista vazia.
 */
function erro400OficialEstrutural(body: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  if (Object.keys(body).some(key => !["name", "brn", "reason", "invalidParams"].includes(key))) return false;
  if (body.name !== "BadRequestError" || body.brn !== "brn:empresas:banking:errors:bad-request-error"
    || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000
    || !Array.isArray(body.invalidParams) || !body.invalidParams.length || body.invalidParams.length > 100) return false;
  return body.invalidParams.every(param => {
    if (!objeto(param) || Object.keys(param).some(key => !["value", "name", "reason"].includes(key))
      || typeof param.name !== "string" || !/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(param.name) || param.name.length > 150
      || typeof param.reason !== "string" || !param.reason.trim() || param.reason.length > 2000
      || typeof param.value !== "string" || param.value.length > 4096) return false;
    // Campo concreto do payload; o exemplo oficial startDate é relativo a interest/fine.
    const paths = param.name === "startDate" ? ["interest.startDate", "fine.startDate"] : [param.name];
    return paths.some(path => {
      let atual: unknown = payload;
      for (const key of path.split(".")) {
        if (["__proto__", "constructor", "prototype"].includes(key) || !objeto(atual) || !Object.hasOwn(atual, key)) return false;
        atual = atual[key];
      }
      return (typeof atual === "string" || typeof atual === "number") && String(atual) === param.value;
    });
  });
}

export function classificarProvaReenvioBtg(
  emissao: EmissaoProvaReenvioBtg,
  diagnostico: BtgHttpDiagnostico | null,
  now: Date,
): ProvaReenvioBtg {
  const hashProva = hashEstado(emissao, diagnostico);
  const diagnosticoId = diagnostico && inteiroPositivo(diagnostico.id) ? diagnostico.id : null;
  const resposta = (codigo: CodigoProvaReenvioBtg, motivo: ProvaReenvioBtg["motivo"]): ProvaReenvioBtg => ({ codigo, diagnosticoId, hashProva, motivo });
  const incerta = (motivo: ProvaReenvioBtg["motivo"]) => resposta("incerta", motivo);
  if (!dataValida(now) || !dataValida(emissao.createdAt) || !dataValida(emissao.updatedAt)
    || emissao.createdAt > emissao.updatedAt || emissao.updatedAt > now || !inteiroPositivo(emissao.id)
    || !inteiroPositivo(emissao.btgIntegracaoId) || emissao.origemTipo !== "parcela_acordo"
    || !ausente(emissao.btgCollectionId) || !ausente(emissao.emitidaEm)) return incerta("ESTADO_NAO_ELEGIVEL");
  if (!["reservada", "incerta", "falha"].includes(emissao.status)) return incerta("ESTADO_NAO_ELEGIVEL");
  if (!diagnostico) {
    if (marcadorValido(emissao)) {
      return resposta("falha_local_comprovada", "MARCADOR_ANTES_POST_COMPROVADO");
    }
    return incerta("SEM_PROVA_PROTEGIDA");
  }
  const diag = diagnostico;
  if (!inteiroPositivo(diag.id) || diag.btgCobrancaEmitidaId !== emissao.id || diag.btgIntegracaoId !== emissao.btgIntegracaoId
    || diag.parcelaAcordoId !== emissao.origemId || diag.condominioId !== emissao.condominioId
    || diag.btgRemessaId !== emissao.btgRemessaId || diag.operacao !== "emissao"
    || !dataValida(diag.capturaCriadaEm) || !dataValida(diag.updatedAt)
    || diag.capturaCriadaEm < emissao.createdAt || diag.updatedAt < diag.capturaCriadaEm || diag.updatedAt > now) return incerta("EVIDENCIA_CONFLITANTE");
  if (!ausente(diag.conteudoExpurgadoEm) || now.getTime() - diag.capturaCriadaEm.getTime() >= RETENCAO_DIAGNOSTICO_BTG_MS) return incerta("EVIDENCIA_EXPIRADA_OU_EXPURGADA");
  try {
    const payload = lerParte(diag, "payload");
    if (!payloadCoerente(payload, emissao, diag)) return incerta("EVIDENCIA_CONFLITANTE");
    if (diag.estadoCaptura === "preparado") {
      if (!ausente(diag.httpStatus) || !ausente(diag.respostaCifrada) || !ausente(diag.respostaSha256)
        || !ausente(diag.respostaBytes) || !ausente(diag.respostaRecebidaEm) || diag.respostaCompleta !== 0) return incerta("EVIDENCIA_CONFLITANTE");
      if (emissao.status === "reservada" && emissao.erroCodigo === "CAPTURA_OU_PREPARO_NAO_CONCLUIDO") return resposta("falha_local_comprovada", "FALHA_LOCAL_COMPROVADA");
      if (marcadorValido(emissao)) return resposta("falha_local_comprovada", "MARCADOR_ANTES_POST_COMPROVADO");
      return incerta("ESTADO_NAO_ELEGIVEL");
    }
    if (diag.estadoCaptura !== "resposta_recebida" || diag.httpStatus !== 400 || diag.respostaCompleta !== 1
      || !dataValida(diag.respostaRecebidaEm) || diag.respostaRecebidaEm < diag.capturaCriadaEm || diag.respostaRecebidaEm > now) return incerta("RESPOSTA_NAO_DEFINITIVA");
    const body = lerParte(diag, "resposta");
    if (!erro400OficialEstrutural(body, payload)) return incerta("EVIDENCIA_INVALIDA");
    return incerta("REJEICAO_OFICIAL_SEM_GARANTIA_DE_AUSENCIA");
  } catch {
    return incerta("EVIDENCIA_INVALIDA");
  }
}
