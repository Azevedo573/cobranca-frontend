/**
 * CNAB 240 — BTG Pactual
 * Implementação de geração de remessa e parser de retorno
 * conforme manual CNAB 240 padrão Febraban / BTG Pactual
 *
 * Estrutura de um arquivo CNAB 240:
 *  - Header de Arquivo    (1 registro de 240 chars)
 *  - Header de Lote       (1 registro de 240 chars por lote)
 *  - Segmento P           (dados do título)
 *  - Segmento Q           (dados do sacado)
 *  - Segmento R           (dados adicionais, opcional)
 *  - Trailer de Lote      (1 registro de 240 chars)
 *  - Trailer de Arquivo   (1 registro de 240 chars)
 */

import { eq, desc, and } from "drizzle-orm";
import { getDb } from "./db";
import {
  remessasCNAB,
  retornosCNAB,
  cobrancas,
  devedores,
  condominios,
  parcelasAcordo,
  acordos,
  type InsertRemessaCNAB,
  type InsertRetornoCNAB,
} from "../drizzle/schema";

// ─── Utilitários de formatação CNAB ──────────────────────────────────────────

/** Preenche string com zeros à esquerda */
export function padLeft(value: string | number, length: number, char = "0"): string {
  return String(value).padStart(length, char);
}

/** Preenche string com espaços à direita */
export function padRight(value: string, length: number): string {
  return String(value).padEnd(length, " ").substring(0, length);
}

/** Remove acentos e caracteres especiais, preservando '&' conforme layout BTG */
export function limparTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .\-\/&]/g, " ")
    .toUpperCase()
    .trim();
}

/** Formata data no padrão CNAB: DDMMAAAA */
export function formatarDataCNAB(data: Date): string {
  const d = data.getDate().toString().padStart(2, "0");
  const m = (data.getMonth() + 1).toString().padStart(2, "0");
  const y = data.getFullYear().toString();
  return `${d}${m}${y}`;
}

/** Formata valor monetário em centavos para CNAB (13 dígitos) */
export function formatarValorCNAB(centavos: number, tamanho = 13): string {
  return padLeft(Math.abs(centavos), tamanho);
}

/** Remove formatação de CPF/CNPJ */
export function limparDocumento(doc: string): string {
  return doc.replace(/[.\-\/]/g, "").trim();
}

// ─── Gerador de Remessa CNAB 240 ─────────────────────────────────────────────

export interface DadosBanco {
  codigoBanco: string;        // 341 = Itaú, 033 = Santander, 208 = BTG
  agencia: string;
  digitoAgencia: string;
  conta: string;
  digitoConta: string;
  convenio: string;
  cedente: string;            // Nome da empresa
  cnpjCedente: string;
}

export interface TituloRemessa {
  cobrancaId: number;
  nossoNumero: string;
  devedorNome: string;
  devedorCpfCnpj: string;
  devedorEndereco: string;
  devedorCidade: string;
  devedorUF: string;
  devedorCEP: string;
  valorNominal: number;       // em centavos
  dataVencimento: Date;
  dataEmissao: Date;
  instrucao1: string;         // ex: "COBRAR JUROS DE 1% AO MES"
  instrucao2: string;
  // Campos opcionais vindos da configuracao de boleto
  carteira?: string;          // ex: "1" (Cobranca Simples)
  especieDocumento?: string;  // ex: "01" (DM), "12" (DD)
  aceite?: string;            // "N" ou "S"
  taxaJurosDia?: number;      // em centavos por dia
  taxaMulta?: number;         // em centavos (ex: 200 = 2,00%)
  enviarProtesto?: boolean;
}

export function gerarHeaderArquivoCNAB240(
  banco: DadosBanco,
  dataGeracao: Date,
  numeroRemessa: number
): string {
  const linha = [
    padLeft(banco.codigoBanco, 3),           // 001-003: Código do banco
    "0000",                                   // 004-007: Lote de serviço (arquivo)
    "0",                                      // 008: Tipo de registro
    " ".repeat(9),                            // 009-017: Brancos
    "2",                                      // 018: Tipo de inscrição (2=CNPJ)
    padLeft(limparDocumento(banco.cnpjCedente), 14), // 019-032: CNPJ
    "0".repeat(20),                          // 033-052: Convênio (BTG usa 20 zeros no Header Arquivo)
    padLeft(banco.agencia, 5),                // 053-057: Agência (5 dígitos com zero à esquerda)
    banco.digitoAgencia.substring(0, 1),      // 058: Dígito agência
    padLeft(banco.conta, 12),                 // 059-070: Conta (12 dígitos com zero à esquerda)
    banco.digitoConta.substring(0, 1),        // 071: Dígito conta
    " ",                                      // 072: Dígito verificador ag/conta (branco BTG)
    padRight(limparTexto(banco.cedente), 30), // 073-102: Nome da empresa (30 chars)
    padRight("BTG PACTUAL S/A", 30),          // 103-132: Nome do banco
    " ".repeat(10),                           // 133-142: Brancos
    "1",                                      // 143: Código de remessa (1=remessa)
    formatarDataCNAB(dataGeracao),            // 144-151: Data de geração
    padLeft(dataGeracao.getHours().toString().padStart(2,"0") +
            dataGeracao.getMinutes().toString().padStart(2,"0") +
            dataGeracao.getSeconds().toString().padStart(2,"0"), 6), // 152-157: Hora
    padLeft(numeroRemessa, 6),                // 158-163: Número sequencial do arquivo
    "103",                                    // 164-166: Versão do layout (103 = BTG CNAB240)
    " ".repeat(5),                            // 167-171: Densidade (BTG usa 5 espaços, não zeros)
    " ".repeat(20),                           // 172-191: Reservado banco
    " ".repeat(20),                           // 192-211: Reservado empresa
    " ".repeat(29),                           // 212-240: Brancos
  ].join("");

  return linha.substring(0, 240);
}

export function gerarHeaderLoteCNAB240(
  banco: DadosBanco,
  numeroLote: number,
  totalTitulos: number
): string {
  const linha = [
    padLeft(banco.codigoBanco, 3),            // 001-003
    padLeft(numeroLote, 4),                   // 004-007: Número do lote
    "1",                                      // 008: Tipo de registro
    "R",                                      // 009: Operação (R=remessa, conforme BTG)
    "01",                                     // 010-011: Tipo de serviço (01=cobrança BTG)
    "  ",                                     // 012-013: Forma de lançamento (brancos no BTG)
    "060",                                    // 014-016: Versão do layout do lote (060=BTG)
    " ",                                      // 017: Brancos
    "2",                                      // 018: Tipo inscrição empresa
    // Pos 019-033: CNPJ no Header de Lote BTG usa 15 chars (com zero à esquerda)
    // Conforme BTG_27042026.txt: '032311089000101' (CNPJ 14 chars + zero à esquerda = 15)
    padLeft(limparDocumento(banco.cnpjCedente), 15), // 019-033: CNPJ (15 chars BTG)
    // Pos 034-053: Convênio no Header de Lote BTG = 20 espaços (brancos)
    // Conforme BTG_27042026.txt: '                    ' (20 espaços)
    " ".repeat(20),                           // 034-053: Convênio (20 espaços BTG)
    padLeft(banco.agencia, 5),                // 054-058: Agência (5 dígitos, igual Header Arquivo)
    banco.digitoAgencia.substring(0, 1),      // 059: Dígito agência
    padLeft(banco.conta, 12),                 // 060-071: Conta (12 dígitos, igual Header Arquivo)
    banco.digitoConta.substring(0, 1),        // 072: Dígito conta
    " ",                                      // 073: Dígito verificador ag/conta (branco BTG)
    padRight(limparTexto(banco.cedente), 30), // 074-103: Cedente (30 chars, sem espaço inicial)
    " ".repeat(40),                           // 103-142: Informação 1
    " ".repeat(40),                           // 143-182: Informação 2
    " ".repeat(29),                           // 183-211: Brancos
    " ".repeat(10),                           // 212-221: Ocorrências
    " ".repeat(19),                           // 222-240: Brancos
  ].join("");

  return linha.substring(0, 240);
}

export function gerarSegmentoPCNAB240(
  banco: DadosBanco,
  titulo: TituloRemessa,
  numeroLote: number,
  sequencial: number
): string {
  const linha = [
    padLeft(banco.codigoBanco, 3),                    // 001-003
    padLeft(numeroLote, 4),                           // 004-007
    "3",                                              // 008: Tipo registro (detalhe)
    padLeft(sequencial, 5),                           // 009-013: Nº sequencial
    "P",                                              // 014: Código segmento
    " ",                                              // 015: Brancos
    "01",                                             // 016-017: Movimento (01=entrada)
    padLeft(banco.agencia, 5),                        // 018-022: Agência (5 dígitos)
    banco.digitoAgencia.substring(0, 1),              // 023: Dígito agência
    // Layout BTG real (confirmado pelo arquivo do banco):
    // pos 024-035: Convênio (12 chars) — campo separado da conta
    // pos 036-047: Conta (12 chars)
    // pos 048: Dígito conta (1 char)
    // pos 049: Branco (1 char)
    // pos 050-069: Nosso número (20 chars, alinhado à esquerda com espaços)
    padLeft(banco.convenio, 12),                       // 024-035: Convênio (12 chars)
    padLeft(banco.conta, 12),                         // 036-047: Conta (12 chars)
    banco.digitoConta.substring(0, 1),                // 048: Dígito conta
    " ",                                              // 049: Branco
    padLeft((titulo.nossoNumero || "").replace(/\D/g, ""), 20), // 050-069: Nosso número (20 chars, zeros à esquerda)
    // pos 070-073: Brancos (4 chars)
    " ".repeat(4),                                    // 070-073: Brancos
    formatarDataCNAB(titulo.dataVencimento),          // 074-081: Data de vencimento (DDMMAAAA)
    formatarValorCNAB(titulo.valorNominal, 15),       // 082-096: Valor nominal (15 chars)
    padLeft(banco.agencia, 5),                        // 097-101: Agência cobradora BTG
    banco.digitoAgencia.substring(0, 1),              // 102: Dígito agência cobradora
    padLeft(banco.conta, 12),                         // 103-114: Conta cobradora
    banco.digitoConta.substring(0, 1),                // 115: Dígito conta cobradora
    " ",                                              // 116: Branco
    "01",                                             // 117-118: Espécie documento (01=DM)
    "N",                                              // 119: Aceite (N=não aceite)
    formatarDataCNAB(titulo.dataEmissao),             // 120-127: Data de emissão (DDMMAAAA)
    titulo.taxaJurosDia && titulo.taxaJurosDia > 0 ? "1" : "3", // 128: Código juros (1=valor dia, 3=isento)
    formatarDataCNAB((() => { const d = new Date(titulo.dataVencimento.getFullYear(), titulo.dataVencimento.getMonth(), titulo.dataVencimento.getDate() + 1); return d; })()), // 129-136: Data início juros mora (vencimento + 1 dia, sem deslocamento UTC)
    padLeft(titulo.taxaJurosDia ?? 0, 15),            // 137-151: Valor/taxa juros (15 chars)
    "3",                                              // 152: Código desconto (3=sem desconto)
    "00000000",                                       // 153-160: Data desconto
    padLeft(0, 15),                                   // 161-175: Valor desconto (15 chars)
    padLeft(0, 15),                                   // 176-190: Valor IOF (15 chars)
    padLeft(0, 15),                                   // 191-205: Abatimento (15 chars)
    padLeft(String(titulo.cobrancaId), 25),           // 206-230: Identificação do título na empresa (alinhado à direita com zeros)
    " ",                                              // 231: Código protesto
    "00",                                             // 232-233: Prazo protesto
    " ",                                              // 234: Código baixa
    "000",                                            // 235-237: Prazo baixa
    "09",                                             // 238-239: Moeda (09=Real)
    padLeft(0, 1),                                    // 240: Brancos
  ].join("");

  return linha.substring(0, 240);
}

/** Segmento R: Informacoes de multa e instrucoes adicionais (recomendado pelo BTG) */
export function gerarSegmentoRCNAB240(
  banco: DadosBanco,
  titulo: TituloRemessa,
  numeroLote: number,
  sequencial: number
): string {
  const codMulta = titulo.taxaMulta && titulo.taxaMulta > 0 ? "2" : "0"; // 2=percentual
  const valorMulta = titulo.taxaMulta ?? 0;
  const dataMulta = new Date(titulo.dataVencimento);
  dataMulta.setDate(dataMulta.getDate() + 1);

  const linha = [
    padLeft(banco.codigoBanco, 3),                    // 001-003
    padLeft(numeroLote, 4),                           // 004-007
    "3",                                              // 008: Tipo registro
    padLeft(sequencial, 5),                           // 009-013
    "R",                                              // 014: Segmento R
    " ",                                              // 015: Brancos
    "01",                                             // 016-017: Movimento
    "0",                                              // 018: Cod. desconto 2 (0=sem desconto)
    "00000000",                                       // 019-026: Data desconto 2
    padLeft(0, 13),                                   // 027-039: Valor desconto 2
    "0",                                              // 040: Cod. desconto 3 (0=sem desconto)
    "0       ",                                       // 041-048: Data desconto 3 (BTG: '0       ')
    " ".repeat(13),                                   // 049-061: Valor desconto 3 (brancos no BTG)
    // Layout BTG confirmado por analise campo a campo do arquivo BTG_27042026.txt:
    // O arquivo BTG usa o layout Febraban padrao para pos 062-083 (campos de multa)
    // mas deixa esses campos em branco/zero quando nao ha instrucao de multa.
    // O concorrente coloca dados de multa no campo instrucao 3 (pos 084-123) como texto.
    // Para nosso gerador: campos de multa em branco, instrucao 3 em branco (sem multa).
    // Pos 062: cod_multa (1 char) = ' ' (branco = sem instrucao)
    // Pos 063-070: data_multa (8 chars) = '        ' (brancos)
    // Pos 071-083: valor_multa (13 chars) = '             ' (brancos)
    // Pos 084-123: instrucao 3 (40 chars) = brancos
    " ",                                              // 062: Cod. multa (branco = sem instrucao BTG)
    " ".repeat(8),                                    // 063-070: Data multa (brancos = sem data BTG)
    " ".repeat(13),                                   // 071-083: Valor multa (brancos = sem valor BTG)
    padRight(" ", 40),                                // 084-123: Instrucao 3 (brancos)
    padRight(" ", 40),                                // 124-163: Instrucao 4 (brancos)
    " ".repeat(40),                                   // 164-203: Brancos
    " ".repeat(10),                                   // 204-213: Uso exclusivo FEBRABAN
    " ",                                              // 214: Cod. ocorrencia do sacado (branco BTG)
    " ".repeat(16),                                   // 215-230: Brancos
    " ".repeat(10),                                   // 231-240: Ocorrencias
  ].join("");

  return linha.substring(0, 240);
}

export function gerarSegmentoQCNAB240(
  banco: DadosBanco,
  titulo: TituloRemessa,
  numeroLote: number,
  sequencial: number
): string {
  const tipoDoc = limparDocumento(titulo.devedorCpfCnpj).length === 11 ? "1" : "2";
  const linha = [
    padLeft(banco.codigoBanco, 3),                    // 001-003
    padLeft(numeroLote, 4),                           // 004-007
    "3",                                              // 008
    padLeft(sequencial, 5),                           // 009-013
    "Q",                                              // 014: Segmento Q
    " ",                                              // 015
    "01",                                             // 016-017: Movimento
    tipoDoc,                                          // 018: Tipo inscrição sacado
    padLeft(limparDocumento(titulo.devedorCpfCnpj), 15), // 019-033: CPF/CNPJ
    padRight(limparTexto(titulo.devedorNome), 40),    // 034-073: Nome
    padRight(limparTexto(titulo.devedorEndereco), 40),// 074-113: Endereço
    padRight(limparTexto(titulo.devedorCidade), 15),  // 114-128: Cidade
    padLeft(titulo.devedorCEP.replace("-", ""), 8),   // 129-136: CEP
    padRight(titulo.devedorUF.substring(0, 2), 2),    // 137-138: UF
    "0",                                              // 139: Tipo inscrição sacador
    padLeft(0, 15),                                   // 140-154: CPF/CNPJ sacador
    padRight(" ", 40),                                // 155-194: Nome sacador
    " ".repeat(3),                                    // 195-197: Cód. banco correspondente
    padLeft(0, 20),                                   // 198-217: Nosso número correspondente
    " ".repeat(8),                                    // 218-225: Brancos
    " ".repeat(10),                                   // 226-235: Ocorrências
    " ".repeat(5),                                    // 236-240: Brancos
  ].join("");

  return linha.substring(0, 240);
}

export function gerarTrailerLoteCNAB240(
  banco: DadosBanco,
  numeroLote: number,
  totalRegistros: number,
  totalTitulos: number,
  valorTotal: number
): string {
  const linha = [
    padLeft(banco.codigoBanco, 3),
    padLeft(numeroLote, 4),
    "5",                                              // Tipo: trailer de lote
    " ".repeat(9),
    padLeft(totalRegistros + 2, 6),                   // Total de registros do lote (+2 header/trailer)
    padLeft(totalTitulos, 6),                         // Qtd de títulos
    formatarValorCNAB(valorTotal, 17),                // Valor total
    padLeft(0, 6),                                    // Qtd títulos cobrança simples
    formatarValorCNAB(0, 17),                         // Valor cobrança simples
    padLeft(0, 6),                                    // Qtd títulos cobrança vinculada
    formatarValorCNAB(0, 17),                         // Valor cobrança vinculada
    " ".repeat(8),                                    // Nº aviso de débito
    " ".repeat(130),                                  // Brancos (117 + 13 para completar 240)
    " ".repeat(10),                                   // Ocorrências
  ].join("");

  return linha.substring(0, 240);
}

export function gerarTrailerArquivoCNAB240(
  banco: DadosBanco,
  totalLotes: number,
  totalRegistros: number
): string {
  const linha = [
    padLeft(banco.codigoBanco, 3),
    "9999",
    "9",
    " ".repeat(9),
    padLeft(totalLotes, 6),
    padLeft(totalRegistros, 6),
    padLeft(0, 6),
    " ".repeat(205),
  ].join("");

  return linha.substring(0, 240);
}

/** Gera o arquivo de remessa CNAB 240 completo */
export function gerarArquivoRemessaCNAB240(
  banco: DadosBanco,
  titulos: TituloRemessa[],
  numeroRemessa: number
): string {
  const linhas: string[] = [];
  const dataGeracao = new Date();

  // Header arquivo
  linhas.push(gerarHeaderArquivoCNAB240(banco, dataGeracao, numeroRemessa));

  // Lote 1
  const numeroLote = 1;
  linhas.push(gerarHeaderLoteCNAB240(banco, numeroLote, titulos.length));

  let sequencial = 1;
  let valorTotal = 0;

  for (const titulo of titulos) {
    linhas.push(gerarSegmentoPCNAB240(banco, titulo, numeroLote, sequencial++));
    linhas.push(gerarSegmentoQCNAB240(banco, titulo, numeroLote, sequencial++));
    // Segmento R: sempre incluido para informar multa e instrucoes
    linhas.push(gerarSegmentoRCNAB240(banco, titulo, numeroLote, sequencial++));
    valorTotal += titulo.valorNominal;
  }

  // Trailer lote: 3 segmentos por titulo (P, Q, R)
  linhas.push(
    gerarTrailerLoteCNAB240(banco, numeroLote, sequencial - 1, titulos.length, valorTotal)
  );

  // Trailer arquivo: header_arq + header_lote + (3 segs * n) + trailer_lote + trailer_arq
  const totalRegistros = 2 + (titulos.length * 3) + 2;
  linhas.push(gerarTrailerArquivoCNAB240(banco, 1, totalRegistros));

  return linhas.join("\r\n") + "\r\n";
}

// ─── Parser de Retorno CNAB 240 ──────────────────────────────────────────────

export interface TituloRetorno {
  nossoNumero: string;
  cobrancaIdEmpresa: string;   // Identificação do título na empresa (campo 186-210 do seg P)
  codigoOcorrencia: string;    // 06=pago, 02=entrada confirmada, etc.
  descricaoOcorrencia: string;
  dataOcorrencia: string;
  dataPagamento: string;
  valorPago: number;           // em centavos
  valorTarifa: number;
  valorJuros: number;
  devedorNome: string;
  devedorCpfCnpj: string;
  processado: boolean;
  cobrancaId?: number;         // Preenchido após match com banco de dados
}

const OCORRENCIAS_CNAB: Record<string, string> = {
  "02": "Entrada Confirmada",
  "03": "Entrada Rejeitada",
  "06": "Liquidação Normal",
  "07": "Liquidação Parcial",
  "09": "Baixa Automática",
  "10": "Baixa Solicitada",
  "11": "Títulos em Ser",
  "14": "Vencimento Alterado",
  "15": "Liquidação em Cartório",
  "17": "Liquidação após Baixa",
  "19": "Confirmação de Instrução de Protesto",
  "20": "Confirmação de Sustação de Protesto",
  "23": "Remessa a Cartório",
  "24": "Retirada de Cartório",
  "25": "Protestado e Baixado",
  "27": "Baixa Rejeitada",
  "28": "Débito de Tarifas",
  "29": "Ocorrência do Sacado",
  "30": "Alteração de Dados Rejeitada",
  "32": "Instrução Rejeitada",
  "33": "Confirmação Pedido Alteração Outros Dados",
  "34": "Retirada de Cartório e Manutenção em Carteira",
  "35": "Desagendamento do Débito Automático",
  "40": "Estorno de Pagamento",
  "55": "Sustado Judicial",
  "73": "Confirmação Recebimento Instrução Sustação Protesto",
  "74": "Confirmação Recebimento Instrução Cancelamento Protesto",
  "75": "Confirmação Recebimento Instrução Protesto Falimentar",
};

/** Códigos que indicam liquidação/pagamento efetivo */
export const CODIGOS_LIQUIDACAO = new Set(["06", "07", "15", "17"]);

export function parsearRetornoCNAB240(conteudo: string): TituloRetorno[] {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.padEnd(240, " "))
    .filter((l) => l.trim().length > 0);

  const titulos: TituloRetorno[] = [];
  let ultimoSegP: TituloRetorno | null = null;

  for (const linha of linhas) {
    if (linha.length < 240) continue;

    const tipoRegistro = linha[7];
    const segmento = linha[13];

    // Segmento P: dados do título
    if (tipoRegistro === "3" && segmento === "P") {
      const codigoOcorrencia = linha.substring(15, 17).trim();
      const nossoNumero = linha.substring(37, 57).trim();
      const dataVencimento = linha.substring(77, 85).trim();
      const cobrancaIdEmpresa = linha.substring(185, 210).trim();
      const dataOcorrencia = linha.substring(137, 145).trim();
      const valorPago = parseInt(linha.substring(145, 158).trim() || "0");
      const valorTarifa = parseInt(linha.substring(198, 211).trim() || "0");
      const valorJuros = parseInt(linha.substring(211, 224).trim() || "0");

      ultimoSegP = {
        nossoNumero,
        cobrancaIdEmpresa,
        codigoOcorrencia,
        descricaoOcorrencia: OCORRENCIAS_CNAB[codigoOcorrencia] || `Código ${codigoOcorrencia}`,
        dataOcorrencia: formatarDataDisplay(dataOcorrencia),
        dataPagamento: formatarDataDisplay(dataOcorrencia),
        valorPago,
        valorTarifa,
        valorJuros,
        devedorNome: "",
        devedorCpfCnpj: "",
        processado: CODIGOS_LIQUIDACAO.has(codigoOcorrencia),
      };
    }

    // Segmento Q: dados do sacado
    if (tipoRegistro === "3" && segmento === "Q" && ultimoSegP) {
      ultimoSegP.devedorCpfCnpj = linha.substring(18, 33).trim();
      ultimoSegP.devedorNome = linha.substring(33, 73).trim();
      // Emitir imediatamente (segmento R e opcional; sera sobrescrito se vier)
      titulos.push({ ...ultimoSegP });
      // Manter ultimoSegP para o caso de segmento R complementar
    }

    // Segmento R: instrucoes adicionais (opcional)
    // O titulo ja foi emitido no segmento Q; segmento R apenas limpa o estado
    if (tipoRegistro === "3" && segmento === "R") {
      ultimoSegP = null;
    }
  }

  return titulos;
}

/** Converte data CNAB (DDMMAAAA) para formato legível */
function formatarDataDisplay(dataCNAB: string): string {
  if (!dataCNAB || dataCNAB === "00000000") return "";
  const d = dataCNAB.substring(0, 2);
  const m = dataCNAB.substring(2, 4);
  const y = dataCNAB.substring(4, 8);
  return `${y}-${m}-${d}`;
}

// ─── Persistência no banco ────────────────────────────────────────────────────

export async function listarRemessasCNAB(condominioId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(remessasCNAB)
    .where(eq(remessasCNAB.condominioId, condominioId))
    .orderBy(desc(remessasCNAB.createdAt))
    .limit(100);
}

export async function criarRemessaCNAB(data: InsertRemessaCNAB) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(remessasCNAB).values(data);
  return result;
}

export async function listarRetornosCNAB(condominioId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(retornosCNAB)
    .where(eq(retornosCNAB.condominioId, condominioId))
    .orderBy(desc(retornosCNAB.createdAt))
    .limit(100);
}

export async function criarRetornoCNAB(data: InsertRetornoCNAB) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(retornosCNAB).values(data);
  return result;
}

/** Processa retorno CNAB: faz match com cobranças e marca como pagas */
export async function processarTitulosRetorno(
  titulos: TituloRetorno[],
  condominioId: number
): Promise<{ pagos: number; erros: number; detalhes: TituloRetorno[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let pagos = 0;
  let erros = 0;
  const detalhes: TituloRetorno[] = [];

  for (const titulo of titulos) {
    // Apenas processar títulos com código de liquidação
    if (!titulo.processado) {
      detalhes.push({ ...titulo });
      continue;
    }

    // Tentar encontrar a cobrança pelo ID da empresa
    const cobrancaId = parseInt(titulo.cobrancaIdEmpresa.trim());

    if (!isNaN(cobrancaId) && cobrancaId > 0) {
      try {
        const [cobranca] = await db
          .select()
          .from(cobrancas)
          .where(
            and(
              eq(cobrancas.id, cobrancaId),
              eq(cobrancas.condominioId, condominioId)
            )
          )
          .limit(1);

        if (cobranca && cobranca.status !== "pago") {
          const dataPag = titulo.dataPagamento
            ? new Date(titulo.dataPagamento)
            : new Date();

          await db
            .update(cobrancas)
            .set({
              status: "pago",
              paidAt: dataPag,
              paidAmount: titulo.valorPago || cobranca.amount,
            })
            .where(eq(cobrancas.id, cobrancaId));

          pagos++;
          titulo.cobrancaId = cobrancaId;
        } else if (cobranca?.status === "pago") {
          erros++;
          titulo.descricaoOcorrencia += " (já estava paga)";
        } else {
          erros++;
          titulo.descricaoOcorrencia += " (cobrança não encontrada)";
        }
      } catch {
        erros++;
      }
    } else {
      // Tentar pelo nosso número — primeiro em cobranças avulsas
      const [cobranca] = await db
        .select()
        .from(cobrancas)
        .where(
          and(
            eq(cobrancas.nossoNumero, titulo.nossoNumero),
            eq(cobrancas.condominioId, condominioId)
          )
        )
        .limit(1);

      if (cobranca && cobranca.status !== "pago") {
        await db
          .update(cobrancas)
          .set({
            status: "pago",
            paidAt: titulo.dataPagamento ? new Date(titulo.dataPagamento) : new Date(),
            paidAmount: titulo.valorPago || cobranca.amount,
          })
          .where(eq(cobrancas.id, cobranca.id));

        pagos++;
        titulo.cobrancaId = cobranca.id;
      } else if (!cobranca) {
        // Tentar pelo nosso número em parcelas de acordo
        const [parcela] = await db
          .select({
            id: parcelasAcordo.id,
            acordoId: parcelasAcordo.acordoId,
            amount: parcelasAcordo.amount,
            status: parcelasAcordo.status,
          })
          .from(parcelasAcordo)
          .innerJoin(acordos, eq(parcelasAcordo.acordoId, acordos.id))
          .where(
            and(
              eq(parcelasAcordo.nossoNumero, titulo.nossoNumero),
              eq(acordos.condominioId, condominioId)
            )
          )
          .limit(1);

        if (parcela && parcela.status !== "pago") {
          const dataPag = titulo.dataPagamento ? new Date(titulo.dataPagamento) : new Date();

          // Baixar a parcela
          await db
            .update(parcelasAcordo)
            .set({
              status: "pago",
              paymentDate: dataPag,
              statusRemessa: "retorno_recebido",
            })
            .where(eq(parcelasAcordo.id, parcela.id));

          // Verificar se todas as parcelas do acordo foram pagas
          const todasParcelas = await db
            .select({ status: parcelasAcordo.status })
            .from(parcelasAcordo)
            .where(eq(parcelasAcordo.acordoId, parcela.acordoId));

          const todasPagas = todasParcelas.every(p => p.status === "pago");
          if (todasPagas) {
            await db
              .update(acordos)
              .set({ status: "pago" })
              .where(eq(acordos.id, parcela.acordoId));
          }

          pagos++;
          titulo.descricaoOcorrencia += " (parcela de acordo)"; 
        } else if (parcela?.status === "pago") {
          erros++;
          titulo.descricaoOcorrencia += " (parcela já estava paga)";
        } else {
          erros++;
          titulo.descricaoOcorrencia += " (título não encontrado)";
        }
      } else {
        erros++;
      }
    }

    detalhes.push({ ...titulo });
  }

  return { pagos, erros, detalhes };
}
