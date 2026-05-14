/**
 * Gerador de Pix Copia e Cola (EMV QR Code)
 * Padrão: Manual de Padrões para Iniciação do Pix - Banco Central do Brasil
 * Versão: 2.4.0
 *
 * Estrutura EMV:
 *   ID (2 chars) + Tamanho (2 chars) + Valor
 *
 * IDs principais:
 *   00 - Payload Format Indicator ("01")
 *   26 - Merchant Account Information (MAI) - contém chave Pix
 *   52 - Merchant Category Code ("0000")
 *   53 - Transaction Currency ("986" = BRL)
 *   54 - Transaction Amount (opcional, sem valor = em aberto)
 *   58 - Country Code ("BR")
 *   59 - Merchant Name (até 25 chars)
 *   60 - Merchant City (até 15 chars)
 *   62 - Additional Data Field Template (txid)
 *   63 - CRC16 (sempre o último campo)
 */

export interface DadosPix {
  chavePix: string;
  nomeBeneficiario: string;
  cidade: string;
  valor?: number;        // Em centavos. Se omitido, gera Pix sem valor fixo
  txid?: string;         // Identificador da transação (nosso número)
  descricao?: string;    // Descrição curta (até 25 chars)
}

/**
 * Formata um campo EMV: ID (2) + tamanho (2) + valor
 */
function emvField(id: string, value: string): string {
  const size = String(value.length).padStart(2, "0");
  return `${id}${size}${value}`;
}

/**
 * Calcula CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF)
 * Conforme especificação do Banco Central para Pix
 */
export function calcularCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Remove acentos e caracteres especiais não permitidos no Pix
 * Permite apenas: letras, números, espaços e alguns símbolos básicos
 */
function sanitizarTexto(texto: string, maxLen: number): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^A-Za-z0-9 .\-\/&]/g, "") // Remove chars especiais (exceto . - / &)
    .substring(0, maxLen)
    .trim();
}

/**
 * Gera o payload Pix EMV (copia e cola) conforme padrão Banco Central
 */
export function gerarPixCopiaCola(dados: DadosPix): string {
  const nomeBeneficiario = sanitizarTexto(dados.nomeBeneficiario, 25);
  const cidade = sanitizarTexto(dados.cidade, 15);
  const txid = dados.txid
    ? sanitizarTexto(dados.txid, 25).replace(/\s/g, "").substring(0, 25) || "***"
    : "***";

  // ID 00: Payload Format Indicator
  const payloadFormatIndicator = emvField("00", "01");

  // ID 26: Merchant Account Information
  // Sub-ID 00: GUI (identificador do arranjo Pix)
  // Sub-ID 01: Chave Pix
  const gui = emvField("00", "BR.GOV.BCB.PIX");
  const chave = emvField("01", dados.chavePix);
  const descricao = dados.descricao
    ? emvField("02", sanitizarTexto(dados.descricao, 25))
    : "";
  const mai = emvField("26", gui + chave + descricao);

  // ID 52: Merchant Category Code (0000 = não especificado)
  const merchantCategoryCode = emvField("52", "0000");

  // ID 53: Transaction Currency (986 = BRL)
  const transactionCurrency = emvField("53", "986");

  // ID 54: Transaction Amount (opcional)
  let transactionAmount = "";
  if (dados.valor !== undefined && dados.valor > 0) {
    const valorFormatado = (dados.valor / 100).toFixed(2);
    transactionAmount = emvField("54", valorFormatado);
  }

  // ID 58: Country Code
  const countryCode = emvField("58", "BR");

  // ID 59: Merchant Name
  const merchantName = emvField("59", nomeBeneficiario);

  // ID 60: Merchant City
  const merchantCity = emvField("60", cidade);

  // ID 62: Additional Data Field Template
  // Sub-ID 05: Reference Label (txid)
  const referenceLabel = emvField("05", txid);
  const additionalDataField = emvField("62", referenceLabel);

  // Montar payload sem CRC
  const payloadSemCRC =
    payloadFormatIndicator +
    mai +
    merchantCategoryCode +
    transactionCurrency +
    transactionAmount +
    countryCode +
    merchantName +
    merchantCity +
    additionalDataField +
    "6304"; // ID 63 + tamanho 04 (CRC tem sempre 4 chars)

  // Calcular e anexar CRC16
  const crc = calcularCRC16(payloadSemCRC);
  return payloadSemCRC + crc;
}
