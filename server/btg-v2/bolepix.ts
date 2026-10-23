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

function dateToIso(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new BtgV2BolePixError("A data de vencimento é inválida.");
  return value.toISOString().slice(0, 10);
}

function requiredText(value: string | null | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BtgV2BolePixError(`${label} é obrigatório para emitir BolePix.`);
  return normalized;
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

  return {
    amount: valorCentavosParaReais(input.amountCentavos),
    type: "BANKSLIP_QRCODE",
    dueDate: dateToIso(input.dueDate),
    overDueDate: dateToIso(input.overDueDate),
    description: requiredText(input.description, "A descrição").slice(0, 300),
    account: { branch: agencia, number: numero },
    detail: {
      documentNumber: requiredText(input.documentNumber, "O número do documento"),
      externalId: requiredText(input.externalId, "O identificador externo"),
      correlationId: requiredText(input.correlationId, "O identificador de correlação"),
    },
    payer: {
      name,
      taxId: document,
      personType: document.length === 11 ? "F" : "J",
      ...(input.payer.email?.trim() ? { email: input.payer.email.trim() } : {}),
      ...(digits(input.payer.phone) ? { phoneNumber: `+${digits(input.payer.phone)}` } : {}),
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
