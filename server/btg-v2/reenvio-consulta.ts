import { obterAccessTokenBtg } from "../btg-oauth";
import { normalizarRespostaBolePixV2 } from "./bolepix";
import { getBtgV2ServerConfig } from "./config";

/** Contrato público verificado em 09/11/2026 (não é a consulta antiga):
 * https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/listar-cobrancas
 * https://developers.empresas.btgpactual.com/assets/js/4e04dca3.b96332a6.js
 * data: CollectionResponse[], _links.next.href: ?cursor=...; sem totalPages.
 * payee.branchCode/number/taxId são a conta/documento do beneficiário.
 * Só collectionId é obrigatório no schema: ausência dos demais campos NÃO
 * comprova correspondência. O service deve comparar todos os campos essenciais.
 * Completa significa percurso limitado concluído, nunca prova de inexistência.
 */
export const LIMITES_CONSULTA_RECUPERACAO_BTG = Object.freeze({
  paginas: 20,
  tamanhoPagina: 50,
  bytes: 1024 * 1024,
  prazoMs: 10_000,
});

export interface BtgCobrancaRecuperacao {
  collectionId: string;
  status?: string;
  correlationId?: string;
  externalId?: string;
  documentNumber?: string;
  valorCentavos?: number;
  dueDate?: string;
  type?: string;
  agencia?: string;
  conta?: string;
  documentoBeneficiario?: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixCopiaECola?: string;
  codigoBarras?: string;
  linhaDigitavel?: string;
  nossoNumero?: string;
  pagamentoDetectado?: boolean;
}

export type BtgCobrancaRecuperavel = BtgCobrancaRecuperacao;

export type MotivoConsultaRecuperacaoBtg =
  | "CONSULTA_COMPLETA" | "NAO_LOCALIZADA_SEM_PROVA_DE_AUSENCIA"
  | "ENTRADA_INVALIDA" | "CONSULTA_INDISPONIVEL" | "HTTP_NAO_CONFIRMADO"
  | "PRAZO_EXCEDIDO" | "LIMITE_BYTES" | "LIMITE_PAGINAS"
  | "RESPOSTA_INVALIDA" | "PAGINACAO_INVALIDA" | "PAGINACAO_INCOMPLETA"
  | "IDENTIDADE_DIVERGENTE";
export interface BtgConsultaRecuperacao {
  completa: boolean;
  motivo: MotivoConsultaRecuperacaoBtg;
  cobrancas: BtgCobrancaRecuperacao[];
}

class FalhaConsulta extends Error {
  constructor(readonly motivo: MotivoConsultaRecuperacaoBtg) { super(motivo); }
}
const falhar = (motivo: MotivoConsultaRecuperacaoBtg): never => { throw new FalhaConsulta(motivo); };
const objeto = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const ausente = (value: unknown) => value === undefined || value === null;
function texto(value: unknown, max: number): string | undefined {
  if (ausente(value)) return undefined;
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return falhar("RESPOSTA_INVALIDA");
  return value;
}
function opcionalObjeto(value: unknown): Record<string, unknown> {
  if (ausente(value)) return {};
  return objeto(value) ? value : falhar("RESPOSTA_INVALIDA");
}
function igualSeDuplo(a: string | undefined, b: string | undefined): string | undefined {
  if (a !== undefined && b !== undefined && a !== b) return falhar("IDENTIDADE_DIVERGENTE");
  return a ?? b;
}

export function normalizarCobrancaRecuperacaoBtg(value: unknown): BtgCobrancaRecuperacao {
  if (!objeto(value)) return falhar("RESPOSTA_INVALIDA");
  const collectionId = texto(value.collectionId, 150);
  if (!collectionId) return falhar("RESPOSTA_INVALIDA");
  const detail = opcionalObjeto(value.detail);
  const account = opcionalObjeto(value.account);
  const payee = opcionalObjeto(value.payee);
  const status = texto(value.status, 30);
  if (status && !["OVERDUE", "CREATED", "PROCESSING", "PAID", "CANCELED", "FAILED", "CANCELING", "CANCEL_FAILED"].includes(status)) return falhar("RESPOSTA_INVALIDA");
  const type = texto(value.type, 30);
  if (type && !["BANKSLIP_QRCODE", "BANKSLIP", "DUE_DATE_PIX"].includes(type)) return falhar("RESPOSTA_INVALIDA");
  const correlationId = igualSeDuplo(texto(value.correlationId, 20), texto(detail.correlationId, 20));
  // externalId não está garantido no schema; preservar somente se presente.
  const externalId = igualSeDuplo(texto(value.externalId, 180), texto(detail.externalId, 180));
  const documentNumber = igualSeDuplo(texto(value.documentNumber, 15), texto(detail.documentNumber, 15));
  let valorCentavos: number | undefined;
  if (!ausente(value.amount)) {
    if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0) return falhar("RESPOSTA_INVALIDA");
    valorCentavos = Math.round(value.amount * 100);
    if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0 || Number((valorCentavos / 100).toFixed(2)) !== value.amount) return falhar("RESPOSTA_INVALIDA");
  }
  const dueDate = texto(value.dueDate, 10);
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(`${dueDate}T00:00:00Z`)) || new Date(`${dueDate}T00:00:00Z`).toISOString().slice(0, 10) !== dueDate)) return falhar("RESPOSTA_INVALIDA");
  const agencia = igualSeDuplo(texto(payee.branchCode, 30), texto(account.branch, 30));
  const conta = igualSeDuplo(texto(payee.number, 50), texto(account.number, 50));
  const documentoBeneficiario = texto(payee.taxId, 20);
  if ((agencia && !/^\d+$/.test(agencia)) || (conta && !/^\d+(?:-[\dXx])?$/.test(conta)) || (documentoBeneficiario && !/^(?:\d{11}|\d{14})$/.test(documentoBeneficiario))) return falhar("RESPOSTA_INVALIDA");
  // payee é o schema oficial da resposta; account só se concretamente presente
  // e coerente. Nunca usar payer ou fabricar conta a partir do cadastro.
  const projected: BtgCobrancaRecuperacao = { collectionId };
  Object.assign(projected, Object.fromEntries(Object.entries({ status, correlationId, externalId, documentNumber, valorCentavos, dueDate, type, agencia, conta, documentoBeneficiario }).filter(([, v]) => v !== undefined)));
  // Somente sinal conservador; não converte unidade monetária nem realiza baixa.
  if (['paidAt', 'paymentDate', 'paidAmount', 'amountPaid', 'paidAmountCentavos', 'paymentAmount', 'hasPayment'].some(key => value[key] !== undefined && value[key] !== null && value[key] !== 0 && value[key] !== false)) projected.pagamentoDetectado = true;
  // Compatibilidade com a normalização BolePix, sem fabricar nulls ausentes.
  if (status) {
    for (const key of ["bankSlipUrl", "pdfUrl", "pixQrCode", "pixCopyPaste", "emv", "barCode", "digitableLine", "ourNumber"] as const) texto(value[key], 16_384);
    for (const key of ["emv", "barCode", "digitableLine", "ourNumber"] as const) texto(detail[key], 16_384);
    const normalized = normalizarRespostaBolePixV2(value);
    for (const key of ["bankSlipUrl", "pixQrCode", "pixCopiaECola", "codigoBarras", "linhaDigitavel", "nossoNumero"] as const) {
      if (normalized[key] !== null) projected[key] = normalized[key];
    }
  }
  return projected;
}

/** Nunca segue um href do banco diretamente: retém só cursor opaco validado,
 * fixa origem/path/filtro e mantém GET. Sem redirecionamentos ou retries.
 */
function proximoCursor(links: unknown, base: URL): string | null {
  if (!objeto(links)) return falhar("PAGINACAO_INCOMPLETA");
  if (!Object.hasOwn(links, "next") || links.next === null) return null;
  if (!objeto(links.next)) return falhar("PAGINACAO_INVALIDA");
  const next = links.next;
  if (next.method !== "GET" || next.type !== "application/json" || typeof next.href !== "string" || next.href.length > 8192 || !next.href || /[\u0000-\u0020\u007f\\]/.test(next.href)) return falhar("PAGINACAO_INVALIDA");
  let url: URL;
  try { url = new URL(next.href, base); } catch { return falhar("PAGINACAO_INVALIDA"); }
  if (url.origin !== base.origin || url.pathname !== base.pathname || url.username || url.password || url.hash) return falhar("PAGINACAO_INVALIDA");
  const keys = Array.from(url.searchParams.keys());
  if (keys.length !== 1 || keys[0] !== "cursor") return falhar("PAGINACAO_INVALIDA");
  const cursor = url.searchParams.get("cursor");
  if (!cursor || cursor.length > 4096 || !/^[A-Za-z0-9_-]+={0,2}$/.test(cursor)) return falhar("PAGINACAO_INVALIDA");
  return cursor;
}

export async function consultarSituacaoRecuperacaoBtg(
  input: { correlationId: string; collectionId?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<BtgConsultaRecuperacao> {
  const incompleta = (motivo: MotivoConsultaRecuperacaoBtg): BtgConsultaRecuperacao => ({ completa: false, motivo, cobrancas: [] });
  if (!input || typeof input.correlationId !== "string" || !/^[A-Za-z0-9_-]{1,20}$/.test(input.correlationId) || (input.collectionId !== undefined && (typeof input.collectionId !== "string" || !/^[A-Za-z0-9_-]{1,150}$/.test(input.collectionId)))) return incompleta("ENTRADA_INVALIDA");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const prazo = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new FalhaConsulta("PRAZO_EXCEDIDO")); }, LIMITES_CONSULTA_RECUPERACAO_BTG.prazoMs);
  });
  const limitado = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, prazo]);
  try {
    const config = getBtgV2ServerConfig();
    const token = await limitado(obterAccessTokenBtg());
    const base = new URL(`${config.apiBaseUrl}/${encodeURIComponent(config.companyId)}/banking/collections`);
    const headers: Record<string, string> = { Accept: "application/json", Authorization: `Bearer ${token}` };
    if (config.ambiente === "sandbox") headers["x-response"] = "success";
    const cursors = new Set<string>();
    const ids = new Set<string>();
    const cobrancas: BtgCobrancaRecuperacao[] = [];
    let cursor: string | null = null;
    let bytesTotal = 0;
    for (let pagina = 1; pagina <= LIMITES_CONSULTA_RECUPERACAO_BTG.paginas; pagina++) {
      const url = new URL(base);
      url.searchParams.set("pageSize", String(LIMITES_CONSULTA_RECUPERACAO_BTG.tamanhoPagina));
      url.searchParams.set("pageNumber", String(pagina));
      // Consulta por ID não adiciona filtro de correlação que ocultaria conflito.
      url.searchParams.set(input.collectionId ? "id" : "correlationId", input.collectionId ?? input.correlationId);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await limitado(fetchImpl(url.toString(), { method: "GET", headers, redirect: "error", signal: controller.signal }));
      if (response.status !== 200) return incompleta("HTTP_NAO_CONFIRMADO");
      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (contentType !== "application/json" || !response.body) return incompleta("RESPOSTA_INVALIDA");
      const declared = response.headers.get("content-length");
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > LIMITES_CONSULTA_RECUPERACAO_BTG.bytes - bytesTotal)) return incompleta("LIMITE_BYTES");
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const chunk = await limitado(reader.read());
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) return incompleta("RESPOSTA_INVALIDA");
        bytesTotal += chunk.value.byteLength;
        if (bytesTotal > LIMITES_CONSULTA_RECUPERACAO_BTG.bytes) return incompleta("LIMITE_BYTES");
        chunks.push(chunk.value); size += chunk.value.byteLength;
      }
      reader.releaseLock(); reader = undefined;
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return incompleta("RESPOSTA_INVALIDA"); }
      if (!objeto(body) || !Array.isArray(body.data) || body.data.length > LIMITES_CONSULTA_RECUPERACAO_BTG.tamanhoPagina) return incompleta("RESPOSTA_INVALIDA");
      for (const record of body.data) {
        const normalized = normalizarCobrancaRecuperacaoBtg(record);
        if ((input.collectionId && normalized.collectionId !== input.collectionId) || (normalized.correlationId !== undefined && normalized.correlationId !== input.correlationId) || ids.has(normalized.collectionId)) return incompleta("IDENTIDADE_DIVERGENTE");
        ids.add(normalized.collectionId); cobrancas.push(normalized);
      }
      cursor = proximoCursor(body._links, base);
      if (cursor === null) {
        // Página cheia sem next é ambígua: não presumir que a API não truncou.
        if (body.data.length === LIMITES_CONSULTA_RECUPERACAO_BTG.tamanhoPagina) return incompleta("PAGINACAO_INCOMPLETA");
        return { completa: true, motivo: cobrancas.length ? "CONSULTA_COMPLETA" : "NAO_LOCALIZADA_SEM_PROVA_DE_AUSENCIA", cobrancas };
      }
      if (!body.data.length || cursors.has(cursor)) return incompleta("PAGINACAO_INVALIDA");
      cursors.add(cursor);
    }
    return incompleta("LIMITE_PAGINAS");
  } catch (error) {
    return incompleta(error instanceof FalhaConsulta ? error.motivo : controller.signal.aborted ? "PRAZO_EXCEDIDO" : "CONSULTA_INDISPONIVEL");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (reader) {
      try { void reader.cancel().catch(() => {}); } catch { /* Não aguardar cancelamento hostil. */ }
      try { reader.releaseLock(); } catch { /* read ainda pendente. */ }
    }
  }
}
