export class BtgBoletoBancarioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtgBoletoBancarioError";
  }
}

export interface DadosBancariosBtgInput {
  codigoBarras: string;
  linhaDigitavel: string;
  valorCentavos: number;
  vencimento: Date;
  banco?: string;
}

export interface DadosBancariosBtgValidos {
  codigoBarras: string;
  /** Os mesmos 47 dígitos recebidos, sem separadores visuais; zeros preservados. */
  linhaDigitavel: string;
}

function falhar(message: string): never {
  throw new BtgBoletoBancarioError(message);
}

// Somente validação dos DVs recebidos. Não gerar campo livre/códigos CNAB nem
// inferir agência, conta, carteira ou nosso número a partir do código de barras.
function dvModulo10(numero: string): string {
  let soma = 0;
  for (let i = numero.length - 1, peso = 2; i >= 0; i--, peso = peso === 2 ? 1 : 2) {
    const produto = Number(numero[i]) * peso;
    soma += Math.floor(produto / 10) + produto % 10;
  }
  return String((10 - soma % 10) % 10);
}

function dvGeral(numeroSemDv: string): string {
  let soma = 0;
  for (let i = numeroSemDv.length - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) {
    soma += Number(numeroSemDv[i]) * peso;
  }
  const dv = 11 - soma % 11;
  return String(dv === 10 || dv === 11 ? 1 : dv);
}

function validarDvGeral(barras: string): void {
  if (barras[4] !== dvGeral(barras.slice(0, 4) + barras.slice(5))) {
    falhar("O DV geral dos dados bancários BTG é inválido.");
  }
}

function fatorDoDiaUtc(vencimento: Date): string {
  if (!(vencimento instanceof Date) || !Number.isFinite(vencimento.getTime())) {
    falhar("O vencimento do boleto BTG é inválido.");
  }
  const diaUtc = Date.UTC(vencimento.getUTCFullYear(), vencimento.getUTCMonth(), vencimento.getUTCDate());
  const base2025 = Date.UTC(2025, 1, 22);
  const fator = diaUtc >= base2025
    ? 1000 + (diaUtc - base2025) / 86400000
    : (diaUtc - Date.UTC(1997, 9, 7)) / 86400000;
  // Nunca converter data fora do ciclo em fator zero ou adivinhar novo ciclo.
  if (!Number.isInteger(fator) || fator <= 0 || fator > 9999) {
    falhar("O vencimento está fora do ciclo de fator de vencimento suportado para o boleto BTG.");
  }
  return String(fator).padStart(4, "0");
}

/** Confere os dados da mesma emissão com a canônica; nunca repara um código. */
export function validarDadosBancariosBtg(input: DadosBancariosBtgInput): DadosBancariosBtgValidos {
  if (typeof input.codigoBarras !== "string" || !/^[0-9]{44}$/.test(input.codigoBarras)) {
    falhar("O código de barras BTG deve conter exatamente 44 dígitos.");
  }
  if (typeof input.linhaDigitavel !== "string" || !/^[0-9 .]+$/.test(input.linhaDigitavel)) {
    falhar("A linha digitável BTG deve conter 47 dígitos, com apenas pontos e espaços como separadores visuais.");
  }
  const barras = input.codigoBarras;
  const linha = input.linhaDigitavel.replace(/[ .]/g, "");
  if (!/^[0-9]{47}$/.test(linha)) falhar("A linha digitável BTG deve conter exatamente 47 dígitos.");

  const banco = input.banco ?? "208";
  if (banco !== "208" || barras.slice(0, 3) !== banco || linha.slice(0, 3) !== banco) {
    falhar("O banco dos dados bancários deve corresponder ao BTG (208).");
  }
  if (barras[3] !== "9" || linha[3] !== "9") falhar("A moeda do boleto BTG deve ser Real (9).");

  validarDvGeral(barras);
  for (const [inicio, fim, indiceDv] of [[0, 9, 9], [10, 20, 20], [21, 31, 31]]) {
    if (dvModulo10(linha.slice(inicio, fim)) !== linha[indiceDv]) {
      falhar("O DV de um campo da linha digitável BTG é inválido.");
    }
  }
  // Reordenar os dígitos recebidos (não calcular/gerar código bancário).
  const barrasDaLinha = linha.slice(0, 4) + linha[32] + linha.slice(33, 47)
    + linha.slice(4, 9) + linha.slice(10, 20) + linha.slice(21, 31);
  validarDvGeral(barrasDaLinha);
  if (barrasDaLinha !== barras) falhar("A linha digitável não corresponde ao código de barras da mesma emissão BTG.");

  if (!Number.isSafeInteger(input.valorCentavos) || input.valorCentavos <= 0 || input.valorCentavos > 9999999999) {
    falhar("O valor do boleto BTG deve ser um inteiro positivo em centavos, representável nos dados bancários.");
  }
  if (barras.slice(9, 19) !== String(input.valorCentavos).padStart(10, "0")) {
    falhar("O valor dos dados bancários BTG diverge do valor do título em centavos.");
  }
  if (barras.slice(5, 9) !== fatorDoDiaUtc(input.vencimento)) {
    falhar("O fator de vencimento dos dados bancários BTG diverge do vencimento UTC do título.");
  }
  return { codigoBarras: barras, linhaDigitavel: linha };
}

interface CampoTlv { id: string; valor: Buffer; inicio: number; }

/** Comprimentos e CRC são conferidos nos bytes UTF-8, sem trim/normalização. */
function lerTlv(bytes: Buffer): CampoTlv[] {
  const campos: CampoTlv[] = [];
  const ids = new Set<string>();
  let posicao = 0;
  while (posicao < bytes.length) {
    const inicio = posicao;
    if (bytes.length - posicao < 4) falhar("O TLV do EMV Pix BTG está incompleto.");
    const cabecalho = bytes.subarray(posicao, posicao + 4).toString("latin1");
    if (!/^[0-9]{4}$/.test(cabecalho)) falhar("O TLV do EMV Pix BTG tem identificador ou tamanho inválido.");
    const id = cabecalho.slice(0, 2), tamanho = Number(cabecalho.slice(2));
    posicao += 4;
    if (tamanho === 0 || posicao + tamanho > bytes.length || ids.has(id)) {
      falhar("O TLV do EMV Pix BTG tem campo vazio, truncado ou duplicado.");
    }
    const valor = bytes.subarray(posicao, posicao + tamanho);
    if (!Buffer.from(valor.toString("utf8"), "utf8").equals(valor)) falhar("O TLV do EMV Pix BTG tem bytes UTF-8 inválidos.");
    campos.push({ id, valor, inicio });
    ids.add(id);
    posicao += tamanho;
  }
  return campos;
}

function crc16(bytes: Buffer): string {
  let crc = 0xffff;
  for (let indice = 0; indice < bytes.length; indice++) {
    crc ^= bytes[indice] << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Valida EMV Pix recebido. Retorna exatamente o payload original para o QR. */
export function validarPixBtg(payload: string): string {
  if (typeof payload !== "string" || !payload || /[\u0000-\u001f\u007f]/.test(payload)) {
    falhar("O payload EMV Pix BTG é inválido; não pode conter controles ou quebras técnicas.");
  }
  const bytes = Buffer.from(payload, "utf8");
  if (bytes.toString("utf8") !== payload) falhar("O payload EMV Pix BTG tem texto UTF-8 inválido.");
  const campos = lerTlv(bytes);
  const ultimo = campos.at(-1);
  if (!ultimo || ultimo.id !== "63" || ultimo.valor.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(ultimo.valor.toString("latin1"))) {
    falhar("O CRC do EMV Pix BTG deve ser o último campo, com identificador 63 e tamanho 04.");
  }
  if (crc16(bytes.subarray(0, ultimo.inicio + 4)) !== ultimo.valor.toString("latin1").toUpperCase()) {
    falhar("O CRC do EMV Pix BTG é inválido.");
  }
  const valores = new Map(campos.map(campo => [campo.id, campo.valor.toString("utf8")]));
  if (campos[0]?.id !== "00" || valores.get("00") !== "01" || valores.get("53") !== "986" || valores.get("58") !== "BR"
    || !valores.has("52") || !valores.has("59") || !valores.has("60")
    || (valores.has("01") && !["11", "12"].includes(valores.get("01")!))) {
    falhar("O EMV recebido não é um payload Pix BTG válido em BRL/BR.");
  }
  let contaPix = false;
  for (const campo of campos) {
    if (Number(campo.id) >= 26 && Number(campo.id) <= 51) {
      const subcampos = new Map(lerTlv(campo.valor).map(subcampo => [subcampo.id, subcampo.valor.toString("utf8")]));
      // O BTG documenta GUI minúsculo. Comparar ASCII sem alterar os bytes/CRC do EMV.
      if (/^br\.gov\.bcb\.pix$/i.test(subcampos.get("00") ?? "") && (subcampos.has("01") || subcampos.has("25"))) contaPix = true;
    } else if (campo.id === "62" || campo.id === "64") {
      lerTlv(campo.valor);
    }
  }
  if (!contaPix) falhar("O EMV recebido não contém um template de conta Pix válido.");
  return payload;
}
