export class BtgV2BolePixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtgV2BolePixError";
  }
}

export interface BtgV2BolePixPayloadInput {
  amountCentavos: number;
  dueDate: Date;
  overDueDate: Date;
  description: string;
  externalId: string;
  documentNumber: string;
  correlationId: string;
  account: { agencia: string; numero: string };
  payer: {
    name: string;
    document: string;
    email?: string | null;
    phone?: string | null;
    address: {
      street: string | null | undefined;
      number: string | null | undefined;
      complement?: string | null | undefined;
      neighborhood: string | null | undefined;
      city: string | null | undefined;
      state: string | null | undefined;
      zipCode: string | null | undefined;
    };
  };
}

export interface BtgV2BolePixPayload {
  amount: number;
  type: "BANKSLIP_QRCODE";
  dueDate: string;
  overDueDate: string;
  description: string;
  account: { branch: string; number: string };
  detail: { documentNumber: string; externalId: string; correlationId: string };
  payer: {
    name: string;
    taxId: string;
    personType: "F" | "J";
    email?: string;
    phoneNumber?: string;
    address: {
      street: string;
      number: string;
      complement?: string;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    };
  };
}

function digits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

// Códigos nacionais vigentes: Anatel, cronograma de áreas locais de 2026.
const DDD_BRASILEIROS = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28", "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49", "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69", "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89", "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/** Normalização apenas do payload; não muda cadastro nem inventa DDD/nono dígito. */
export function normalizarTelefonePagadorBtgV2(phone: string | null | undefined): string | undefined {
  if (phone === null || phone === undefined) return undefined;
  const invalido = () => new BtgV2BolePixError(
    "O telefone do pagador é inválido para emissão BolePix. Informe um telefone brasileiro com DDD: fixo com 10 dígitos ou celular com 11; se usar DDI, informe +55 seguido do número completo.",
  );
  if (typeof phone !== "string") throw invalido();
  const texto = phone.trim();
  if (!texto) return undefined;
  // Não descartar letras, ramais, controles ou prefixos estrangeiros silenciosamente.
  if (!/^\+?[0-9 ().-]+$/.test(texto)) throw invalido();
  const numero = digits(texto);
  let nacional = numero;
  if (texto.startsWith("+") || numero.length === 12 || numero.length === 13) {
    if (!numero.startsWith("55") || ![12, 13].includes(numero.length)) throw invalido();
    nacional = numero.slice(2);
  }
  if (![10, 11].includes(nacional.length) || !DDD_BRASILEIROS.has(nacional.slice(0, 2))) throw invalido();
  const assinante = nacional.slice(2);
  if (nacional.length === 10 ? !/^[2-5][0-9]{7}$/.test(assinante) : !/^9[0-9]{8}$/.test(assinante)) {
    throw invalido();
  }
  return `+55${nacional}`;
}

function dateToIso(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new BtgV2BolePixError("A data de vencimento é inválida.");
  return value.toISOString().slice(0, 10);
}

function requiredText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BtgV2BolePixError(`${label} é obrigatório para emitir BolePix.`);
  return normalized;
}

function limitedText(value: string | null | undefined, label: string, maxLength: number): string {
  const normalized = requiredText(value, label);
  if (Array.from(normalized).length > maxLength) {
    throw new BtgV2BolePixError(`${label} deve ter no máximo ${maxLength} caracteres para emitir BolePix.`);
  }
  return normalized;
}

/** Referência documental, distinta do nosso número e da chave idempotente. */
export function gerarDocumentoParcelaBtgV2(parcelaId: number, revisao = 1): string {
  if (!Number.isSafeInteger(parcelaId) || parcelaId <= 0 || !Number.isSafeInteger(revisao) || revisao <= 0) {
    throw new BtgV2BolePixError("A parcela e a revisão precisam ser inteiros positivos válidos para o documento BolePix.");
  }
  // Não cortar IDs: truncamento pode fazer duas parcelas compartilharem referência.
  return limitedText(`PA${parcelaId}R${revisao}`, "O número do documento", 15);
}

function validarEndereco(input: BtgV2BolePixPayloadInput["payer"]["address"]) {
  const street = input.street?.trim();
  const number = input.number?.trim();
  const neighborhood = input.neighborhood?.trim();
  const city = input.city?.trim();
  const state = input.state?.trim().toUpperCase();
  const zipCode = digits(input.zipCode);

  if (!street || !number || !neighborhood || !city || !state || state.length !== 2 || zipCode.length !== 8) {
    throw new BtgV2BolePixError("O pagador precisa ter endereço completo para emissão BolePix.");
  }

  limitedText(street, "O logradouro do pagador", 40);
  limitedText(number, "O número do endereço do pagador", 10);
  limitedText(neighborhood, "O bairro do pagador", 20);
  limitedText(city, "A cidade do pagador", 50);

  const complement = input.complement?.trim();
  return {
    street,
    number,
    ...(complement ? { complement } : {}),
    neighborhood,
    city,
    state,
    zipCode,
  };
}

/** Valor interno é sempre inteiro em centavos; BTG Collections recebe BRL decimal. */
export function valorCentavosParaReais(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BtgV2BolePixError("O valor da cobrança deve ser um inteiro positivo em centavos.");
  }
  return Number((value / 100).toFixed(2));
}

export function montarPayloadBolePixV2(input: BtgV2BolePixPayloadInput): BtgV2BolePixPayload {
  const document = digits(input.payer.document);
  if (![11, 14].includes(document.length)) {
    throw new BtgV2BolePixError("CPF/CNPJ válido do pagador é obrigatório para emitir BolePix.");
  }
  const agencia = requiredText(input.account.agencia, "A agência recebedora");
  const numero = requiredText(input.account.numero, "A conta recebedora");
  const name = requiredText(input.payer.name, "O nome do pagador");
  const phoneNumber = normalizarTelefonePagadorBtgV2(input.payer.phone);

  return {
    amount: valorCentavosParaReais(input.amountCentavos),
    type: "BANKSLIP_QRCODE",
    dueDate: dateToIso(input.dueDate),
    overDueDate: dateToIso(input.overDueDate),
    description: requiredText(input.description, "A descrição").slice(0, 300),
    account: { branch: agencia, number: numero },
    detail: {
      documentNumber: limitedText(input.documentNumber, "O número do documento", 15),
      externalId: requiredText(input.externalId, "O identificador externo"),
      correlationId: limitedText(input.correlationId, "O identificador de correlação", 20),
    },
    payer: {
      name,
      taxId: document,
      personType: document.length === 11 ? "F" : "J",
      ...(input.payer.email?.trim() ? { email: input.payer.email.trim() } : {}),
      ...(phoneNumber ? { phoneNumber } : {}),
      address: validarEndereco(input.payer.address),
    },
  };
}

export interface BtgV2BolePixResponse {
  collectionId: string;
  status: string;
  bankSlipUrl: string | null;
  pixQrCode: string | null;
  pixCopiaECola: string | null;
  codigoBarras: string | null;
  linhaDigitavel: string | null;
  nossoNumero: string | null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Aceita tanto campos no topo quanto detail, documentados nos eventos Collections. */
export function normalizarRespostaBolePixV2(payload: Record<string, unknown>): BtgV2BolePixResponse {
  const detail = payload.detail && typeof payload.detail === "object" && !Array.isArray(payload.detail)
    ? payload.detail as Record<string, unknown>
    : {};
  const collectionId = optionalString(payload.collectionId);
  const status = optionalString(payload.status);
  if (!collectionId || !status) {
    throw new BtgV2BolePixError("A resposta do BTG não contém collectionId e status válidos.");
  }

  return {
    collectionId,
    status,
    bankSlipUrl: optionalString(payload.bankSlipUrl) ?? optionalString(payload.pdfUrl),
    pixQrCode: optionalString(payload.pixQrCode),
    pixCopiaECola: optionalString(payload.pixCopyPaste) ?? optionalString(payload.emv) ?? optionalString(detail.emv),
    codigoBarras: optionalString(payload.barCode) ?? optionalString(detail.barCode),
    linhaDigitavel: optionalString(payload.digitableLine) ?? optionalString(detail.digitableLine),
    nossoNumero: optionalString(payload.ourNumber) ?? optionalString(detail.ourNumber),
  };
}
