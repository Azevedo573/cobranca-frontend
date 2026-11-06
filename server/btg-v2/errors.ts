import { BtgV2ConfigurationError } from "./config";

export interface BtgV2DiagnosticoHttp {
  httpStatus: number;
  camposInvalidos: string[];
  motivos: string[];
  requestId?: string;
  codigo?: string;
}

type OperacaoHttpBtg = "emissao" | "consulta" | "cancelamento";
const LIMITE_CORPO_BYTES = 32 * 1024;
const PRAZO_CORPO_MS = 5000;
const LIMITE_ITENS = 5;
const MOTIVO_GENERICO = "O BTG não informou um motivo seguro para este erro.";

// Nomes de campos, nunca seus valores. Sem aceitar caminhos por prefixo,
// índices arbitrários, headers ou propriedades adicionais do BancoResponse.
const CAMPOS_PERMITIDOS = new Set([
  "amount", "type", "dueDate", "overDueDate", "description",
  "account.branch", "account.number",
  "detail.documentNumber", "detail.externalId", "detail.correlationId",
  "payer.name", "payer.taxId", "payer.personType", "payer.email", "payer.phoneNumber",
  "payer.address.street", "payer.address.number", "payer.address.complement",
  "payer.address.neighborhood", "payer.address.city", "payer.address.state", "payer.address.zipCode",
  "interest.startDate", "interest.type", "interest.value",
  "fine.startDate", "fine.type", "fine.value",
  "startDate",
]);

const CODIGOS_PERMITIDOS = new Set([
  "BadRequest", "VALIDATION_ERROR", "INVALID_PARAMETER",
  "UNPROCESSABLE_ENTITY", "INTERNAL_SERVER_ERROR",
]);

// Catálogo de frases inteiras: texto desconhecido NÃO é redigido e reutilizado.
// Mesmo sem dígitos uma razão pode conter pessoa, endereço ou segredo.
const MOTIVOS_PERMITIDOS = new Map<string, string>([
  [MOTIVO_GENERICO, MOTIVO_GENERICO],
  ["O número do documento excede o limite permitido", "O número do documento excede o limite permitido"],
  ["A data de início dos juros deve ser posterior à data de vencimento", "A data de início dos juros deve ser posterior à data de vencimento"],
  ["A data de início dos juros é inválida", "A data de início dos juros é inválida"],
  ["Interest start date must be after due date", "A data de início dos juros deve ser posterior à data de vencimento"],
  ["A data de inicio do juros deve ser maior ao vencimento da cobrança", "A data de início dos juros deve ser posterior à data de vencimento"],
  ["O documento do pagador é inválido", "O documento do pagador é inválido"],
  ["Há campos inválidos na solicitação.", "Há campos inválidos na solicitação."],
  ["Dados inválidos na requisição", "Há campos inválidos na solicitação."],
  ["Invalid parameters", "Há campos inválidos na solicitação."],
  ["Invalid request parameters", "Há campos inválidos na solicitação."],
  ["Invalid request", "Há campos inválidos na solicitação."],
  ["Bad request", "Há campos inválidos na solicitação."],
  ["Campo obrigatório", "Campo obrigatório"],
  ["Field is required", "Campo obrigatório"],
  ["must not be null", "Campo obrigatório"],
  ["must not be blank", "Campo obrigatório"],
  ["Campo inválido", "Campo inválido"],
  ["Invalid field", "Campo inválido"],
  ["Formato inválido", "Formato inválido"],
  ["Invalid format", "Formato inválido"],
  ["O valor excede o limite permitido", "O valor excede o limite permitido"],
]);

const diagnosticosReconhecidos = new WeakMap<BtgV2HttpError, BtgV2DiagnosticoHttp>();

function registro(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function statusSeguro(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : 500;
}

function requestIdSeguro(value: unknown): string | undefined {
  // Apenas UUID completo de tamanho fixo (versões conhecidas e variante RFC).
  // Tokens alfanuméricos, BRN e identificadores do corpo nunca são aproveitados.
  return typeof value === "string" && value.length === 36 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) && !/\d{11}/.test(value)
    ? value
    : undefined;
}

function codigoSeguro(value: unknown): string | undefined {
  return typeof value === "string" && CODIGOS_PERMITIDOS.has(value) ? value : undefined;
}

function campoSeguro(value: unknown): string | undefined {
  return typeof value === "string" && CAMPOS_PERMITIDOS.has(value) ? value : undefined;
}

function motivoSeguro(value: unknown): string | undefined {
  return typeof value === "string" ? MOTIVOS_PERMITIDOS.get(value) : undefined;
}

function adicionarSeguro(items: string[], value: string | undefined): void {
  if (value !== undefined && items.length < LIMITE_ITENS && !items.includes(value)) items.push(value);
}

/** Sanitização também no construtor/helper; não confiar em dados internos mutáveis. */
function sanitizarDiagnostico(input: unknown): BtgV2DiagnosticoHttp {
  const camposInvalidos: string[] = [];
  const motivos: string[] = [];
  let httpStatus = 500;
  try {
    const data = registro(input);
    httpStatus = statusSeguro(data?.httpStatus);
    if (Array.isArray(data?.camposInvalidos)) {
      for (const value of data.camposInvalidos) adicionarSeguro(camposInvalidos, campoSeguro(value));
    }
    if (Array.isArray(data?.motivos)) {
      for (const value of data.motivos) adicionarSeguro(motivos, motivoSeguro(value));
    }
    if (motivos.length === 0) motivos.push(MOTIVO_GENERICO);
    const requestId = requestIdSeguro(data?.requestId);
    const codigo = codigoSeguro(data?.codigo);
    return { httpStatus, camposInvalidos, motivos, ...(requestId ? { requestId } : {}), ...(codigo ? { codigo } : {}) };
  } catch {
    // Getters/objetos não confiáveis nunca viram cause ou mensagem.
    return { httpStatus, camposInvalidos: [], motivos: [MOTIVO_GENERICO] };
  }
}

function mensagemSegura(diagnostico: BtgV2DiagnosticoHttp, operacao: OperacaoHttpBtg): string {
  const descricao = operacao === "consulta" ? "consulta de cobrança"
    : operacao === "cancelamento" ? "cancelamento da cobrança" : "emissão BolePix";
  let mensagem = `O BTG recusou a ${descricao} (HTTP ${diagnostico.httpStatus}).`;
  if (diagnostico.camposInvalidos.length > 0) mensagem += ` Campos: ${diagnostico.camposInvalidos.join(", ")}.`;
  // Não corta uma frase ao meio nem inclui metadados raw. O diagnóstico mantém
  // até cinco motivos mesmo quando todos não cabem na mensagem persistível.
  for (const motivo of diagnostico.motivos) {
    if (mensagem.length + motivo.length + 1 <= 500) mensagem += ` ${motivo}`;
  }
  return mensagem;
}

/** Não contém body, response, headers, invalidParams.value nem cause. */
export class BtgV2HttpError extends BtgV2ConfigurationError {
  readonly diagnostico!: BtgV2DiagnosticoHttp;

  constructor(diagnostico: BtgV2DiagnosticoHttp, operacao: OperacaoHttpBtg = "emissao") {
    const seguro = sanitizarDiagnostico(diagnostico);
    super(mensagemSegura(seguro, operacao));
    this.name = "BtgV2HttpError";
    Object.freeze(seguro.camposInvalidos);
    Object.freeze(seguro.motivos);
    Object.freeze(seguro);
    Object.defineProperty(this, "diagnostico", { value: seguro, enumerable: true, writable: false, configurable: false });
    diagnosticosReconhecidos.set(this, seguro);
  }
}

/** Só aceita instâncias construídas pela classe, nunca objetos look-alike. */
export function obterDiagnosticoHttpBtg(error: unknown): BtgV2DiagnosticoHttp | undefined {
  try {
    if (!(error instanceof BtgV2HttpError)) return undefined;
    const diagnostico = diagnosticosReconhecidos.get(error);
    return diagnostico ? sanitizarDiagnostico(diagnostico) : undefined;
  } catch {
    return undefined;
  }
}

function obterRequestId(response: Response): string | undefined {
  try {
    for (const header of ["x-request-id", "x-correlation-id"]) {
      const id = requestIdSeguro(response.headers.get(header));
      if (id) return id;
    }
  } catch {
    // Headers não são copiados nem têm suas falhas registradas.
  }
  return undefined;
}

function cancelarReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    // Não aguardar cancel(): um stream hostil pode nunca resolver o cancelamento.
    void reader.cancel().catch(() => {});
  } catch {
    // A falha de cancelamento não substitui o erro HTTP seguro.
  }
}

async function lerJsonLimitado(response: Response): Promise<unknown> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let concluido = false;
  try {
    // Sem body streaming não chamar text()/json(): essas APIs não limitam bytes.
    reader = response.body?.getReader();
    if (!reader) return undefined;
    const inicio = Date.now();
    const expirado = Symbol("prazo-corpo");
    const prazo = new Promise<typeof expirado>((resolve) => {
      timer = setTimeout(() => resolve(expirado), PRAZO_CORPO_MS);
    });
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let totalBytes = 0;
    let texto = "";
    while (true) {
      if (Date.now() - inicio >= PRAZO_CORPO_MS) return undefined;
      const chunk = await Promise.race([reader.read(), prazo]);
      if (chunk === expirado) return undefined;
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) return undefined;
      totalBytes += chunk.value.byteLength;
      if (totalBytes > LIMITE_CORPO_BYTES) return undefined;
      texto += decoder.decode(chunk.value, { stream: true });
    }
    texto += decoder.decode();
    if (!texto.trim()) return undefined;
    const data: unknown = JSON.parse(texto);
    concluido = true;
    return data;
  } catch {
    // Vazio, UTF-8 inválido, não JSON, JSON malformado e leitura falha: fallback.
    // O erro original nunca é retido, encadeado, interpolado ou registrado.
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (reader) {
      if (!concluido) cancelarReader(reader);
      try { reader.releaseLock(); } catch { /* Reader pendente/falho: sem vazamento. */ }
    }
  }
}

/** Uma leitura da resposta já recebida; nenhum fetch, retry ou ação financeira. */
export async function criarErroHttpBtgV2(
  response: Response,
  operacao: OperacaoHttpBtg = "emissao",
): Promise<BtgV2HttpError> {
  const httpStatus = statusSeguro(response.status);
  const requestId = obterRequestId(response);
  const data = registro(await lerJsonLimitado(response));
  const camposInvalidos: string[] = [];
  const motivos: string[] = [];
  // BancoResponse oficial: name/brn/reason/invalidParams[{value,name,reason}].
  // brn e value são deliberadamente ignorados. Nenhum nested payer/header é lido.
  const codigo = codigoSeguro(data?.name);
  adicionarSeguro(motivos, motivoSeguro(data?.reason));
  if (Array.isArray(data?.invalidParams)) {
    for (const item of data.invalidParams) {
      const param = registro(item);
      const campo = campoSeguro(param?.name);
      if (!campo) continue;
      adicionarSeguro(camposInvalidos, campo);
      adicionarSeguro(motivos, motivoSeguro(param?.reason));
    }
  }
  return new BtgV2HttpError({
    httpStatus, camposInvalidos, motivos,
    ...(requestId ? { requestId } : {}), ...(codigo ? { codigo } : {}),
  }, operacao);
}
