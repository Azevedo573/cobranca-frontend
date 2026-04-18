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

/** Remove acentos e caracteres especiais */
export function limparTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .\-\/]/g, " ")
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
    padLeft(banco.convenio, 20),              // 033-052: Convênio
    padLeft(banco.agencia, 5),                // 053-057: Agência
    banco.digitoAgencia.substring(0, 1),      // 058: Dígito agência
    padLeft(banco.conta, 12),                 // 059-070: Conta
    banco.digitoConta.substring(0, 1),        // 071: Dígito conta
    " ",                                      // 072: Dígito verificador ag/conta
    padRight(limparTexto(banco.cedente), 30), // 073-102: Nome da empresa
    padRight(limparTexto(`BANCO ${banco.codigoBanco}`), 30), // 103-132: Nome do banco
    " ".repeat(10),                           // 133-142: Brancos
    "1",                                      // 143: Código de remessa (1=remessa)
    formatarDataCNAB(dataGeracao),            // 144-151: Data de geração
    padLeft(dataGeracao.getHours().toString().padStart(2,"0") +
            dataGeracao.getMinutes().toString().padStart(2,"0") +
            dataGeracao.getSeconds().toString().padStart(2,"0"), 6), // 152-157: Hora
    padLeft(numeroRemessa, 6),                // 158-163: Número sequencial do arquivo
    "089",                                    // 164-166: Versão do layout (089 = CNAB240)
    "01600",                                  // 167-171: Densidade de gravação
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
    "C",                                      // 009: Operação (C=crédito/cobrança)
    "03",                                     // 010-011: Tipo de serviço (03=cobrança)
    "01",                                     // 012-013: Forma de lançamento
    "040",                                    // 014-016: Versão do layout do lote
    " ",                                      // 017: Brancos
    "2",                                      // 018: Tipo inscrição empresa
    padLeft(limparDocumento(banco.cnpjCedente), 14), // 019-032
    padLeft(banco.convenio, 20),              // 033-052
    padLeft(banco.agencia, 5),                // 053-057
    banco.digitoAgencia.substring(0, 1),      // 058
    padLeft(banco.conta, 12),                 // 059-070
    banco.digitoConta.substring(0, 1),        // 071
    " ",                                      // 072
    padRight(limparTexto(banco.cedente), 30), // 073-102
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
    padLeft(banco.agencia, 5),                        // 018-022
    banco.digitoAgencia.substring(0, 1),              // 023
    padLeft(banco.conta, 12),                         // 024-035
    banco.digitoConta.substring(0, 1),                // 036
    " ",                                              // 037
    padLeft(titulo.nossoNumero, 20),                  // 038-057: Nosso número
    "1",                                              // 058: Carteira (1=cobrança simples)
    "1",                                              // 059: Forma de cadastramento
    "0",                                              // 060: Tipo de documento
    "2",                                              // 061: Emissão do boleto (2=cedente)
    "2",                                              // 062: Distribuição (2=cedente)
    padLeft(titulo.nossoNumero, 15),                  // 063-077: Número do documento
    formatarDataCNAB(titulo.dataVencimento),          // 078-085: Data de vencimento
    formatarValorCNAB(titulo.valorNominal),           // 086-098: Valor nominal
    "00000",                                          // 099-103: Agência cobradora
    " ",                                              // 104: Dígito agência cobradora
    "01",                                             // 105-106: Espécie do título (01=DM)
    "N",                                              // 107: Aceite (N=não)
    formatarDataCNAB(titulo.dataEmissao),             // 108-115: Data de emissão
    "1",                                              // 116: Código de juros (1=% ao mês)
    formatarDataCNAB(titulo.dataVencimento),          // 117-124: Data de juros
    padLeft(100, 13),                                 // 125-137: Juros (1% = 100 centavos por 10000)
    "0",                                              // 138: Código de desconto
    "00000000",                                       // 139-146: Data de desconto
    padLeft(0, 13),                                   // 147-159: Valor de desconto
    padLeft(0, 13),                                   // 160-172: Valor IOF
    padLeft(0, 13),                                   // 173-185: Abatimento
    padLeft(titulo.cobrancaId, 25),                   // 186-210: Identificação do título na empresa
    "3",                                              // 211: Protesto (3=não protestar)
    "00",                                             // 212-213: Prazo para protesto
    "3",                                              // 214: Baixa/devolução (3=não baixar)
    padLeft(0, 3),                                    // 215-217: Prazo para baixa
    "09",                                             // 218-219: Moeda (09=real)
    padLeft(0, 10),                                   // 220-229: Número contrato
    " ",                                              // 230: Brancos
    " ".repeat(10),                                   // 231-240: Brancos
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
    valorTotal += titulo.valorNominal;
  }

  // Trailer lote
  linhas.push(
    gerarTrailerLoteCNAB240(banco, numeroLote, sequencial - 1, titulos.length, valorTotal)
  );

  // Trailer arquivo: total de registros = header + header_lote + (2 segs * n) + trailer_lote + trailer_arquivo
  const totalRegistros = 2 + (titulos.length * 2) + 2;
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
  "30": "Alteração de Dados Rejeitada",
};

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
        processado: codigoOcorrencia === "06" || codigoOcorrencia === "17",
      };
    }

    // Segmento Q: dados do sacado
    if (tipoRegistro === "3" && segmento === "Q" && ultimoSegP) {
      ultimoSegP.devedorCpfCnpj = linha.substring(18, 33).trim();
      ultimoSegP.devedorNome = linha.substring(33, 73).trim();
      titulos.push({ ...ultimoSegP });
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
      // Tentar pelo nosso número
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
      } else {
        erros++;
      }
    }

    detalhes.push({ ...titulo });
  }

  return { pagos, erros, detalhes };
}
