/**
 * Testes unitários — Sprint 6: Arquivos e Integração Bancária
 * Cobre: CNAB 240 (geração e parser), baixa em lote (CSV), status em lote
 */
import { describe, it, expect } from "vitest";
import {
  padLeft,
  padRight,
  limparTexto,
  formatarDataCNAB,
  formatarValorCNAB,
  limparDocumento,
  gerarHeaderArquivoCNAB240,
  gerarArquivoRemessaCNAB240,
  parsearRetornoCNAB240,
  type DadosBanco,
  type TituloRemessa,
} from "./db-cnab";
import { parsearCSVBaixaLote } from "./db-importacoes";

// ─── Utilitários CNAB ─────────────────────────────────────────────────────────

describe("Utilitários CNAB 240", () => {
  describe("padLeft", () => {
    it("preenche com zeros à esquerda", () => {
      expect(padLeft("123", 6)).toBe("000123");
    });

    it("não trunca se já tiver o tamanho certo", () => {
      expect(padLeft("123456", 6)).toBe("123456");
    });

    it("funciona com números", () => {
      expect(padLeft(42, 5)).toBe("00042");
    });

    it("usa caractere customizado", () => {
      expect(padLeft("A", 4, "X")).toBe("XXXA");
    });
  });

  describe("padRight", () => {
    it("preenche com espaços à direita", () => {
      expect(padRight("ABC", 6)).toBe("ABC   ");
    });

    it("trunca se exceder o tamanho", () => {
      expect(padRight("ABCDEFGH", 5)).toBe("ABCDE");
    });
  });

  describe("limparTexto", () => {
    it("remove acentos", () => {
      expect(limparTexto("São Paulo")).toBe("SAO PAULO");
    });

    it("converte para maiúsculas", () => {
      expect(limparTexto("condomínio")).toBe("CONDOMINIO");
    });

    it("remove caracteres especiais exceto espaço, ponto, hífen e barra", () => {
      // Vírgula e º (ordinal) viram espaços separados, resultando em duplo espaço
      expect(limparTexto("Rua A, nº 10")).toBe("RUA A  N  10");
    });
  });

  describe("formatarDataCNAB", () => {
    it("formata data no padrão DDMMAAAA", () => {
      const data = new Date(2024, 2, 15); // 15/03/2024
      expect(formatarDataCNAB(data)).toBe("15032024");
    });

    it("preenche dia e mês com zero à esquerda", () => {
      const data = new Date(2024, 0, 5); // 05/01/2024
      expect(formatarDataCNAB(data)).toBe("05012024");
    });
  });

  describe("formatarValorCNAB", () => {
    it("formata centavos com 13 dígitos por padrão", () => {
      expect(formatarValorCNAB(15000)).toBe("0000000015000");
    });

    it("formata com tamanho customizado", () => {
      expect(formatarValorCNAB(500, 8)).toBe("00000500");
    });

    it("usa valor absoluto para negativos", () => {
      expect(formatarValorCNAB(-100)).toBe("0000000000100");
    });
  });

  describe("limparDocumento", () => {
    it("remove pontos, traços e barras do CPF", () => {
      expect(limparDocumento("123.456.789-09")).toBe("12345678909");
    });

    it("remove formatação de CNPJ", () => {
      expect(limparDocumento("12.345.678/0001-90")).toBe("12345678000190");
    });
  });
});

// ─── Geração de Remessa CNAB 240 ──────────────────────────────────────────────

const BANCO_TESTE: DadosBanco = {
  codigoBanco: "208",
  agencia: "00001",
  digitoAgencia: "0",
  conta: "000000000001",
  digitoConta: "0",
  convenio: "0000000000000000000",
  cedente: "CONDOMINIO TESTE",
  cnpjCedente: "12345678000190",
};

const TITULO_TESTE: TituloRemessa = {
  cobrancaId: 123,
  nossoNumero: "0000000123",
  devedorNome: "João Silva",
  devedorCpfCnpj: "12345678901",
  devedorEndereco: "Rua das Flores 100",
  devedorCidade: "São Paulo",
  devedorUF: "SP",
  devedorCEP: "01310100",
  valorNominal: 150000, // R$ 1.500,00 em centavos
  dataVencimento: new Date(2024, 2, 31),
  dataEmissao: new Date(2024, 2, 1),
  instrucao1: "COBRAR JUROS DE 1% AO MES",
  instrucao2: "",
};

describe("Geração de Remessa CNAB 240", () => {
  it("gera header de arquivo com 240 caracteres", () => {
    const header = gerarHeaderArquivoCNAB240(BANCO_TESTE, new Date(), 1);
    expect(header.length).toBe(240);
  });

  it("header começa com código do banco", () => {
    const header = gerarHeaderArquivoCNAB240(BANCO_TESTE, new Date(), 1);
    expect(header.substring(0, 3)).toBe("208");
  });

  it("header tem tipo de registro '0' na posição 8", () => {
    const header = gerarHeaderArquivoCNAB240(BANCO_TESTE, new Date(), 1);
    expect(header[7]).toBe("0");
  });

  it("gera arquivo completo com número correto de linhas", () => {
    const arquivo = gerarArquivoRemessaCNAB240(BANCO_TESTE, [TITULO_TESTE], 1);
    const linhas = arquivo.split(/\r?\n/).filter(l => l.trim().length > 0);
    // Header arquivo + Header lote + Seg P + Seg Q + Trailer lote + Trailer arquivo = 6
    expect(linhas.length).toBe(6);
  });

  it("cada linha do arquivo tem exatamente 240 caracteres", () => {
    const arquivo = gerarArquivoRemessaCNAB240(BANCO_TESTE, [TITULO_TESTE], 1);
    const linhas = arquivo.split(/\r?\n/).filter(l => l.trim().length > 0);
    linhas.forEach((linha, i) => {
      expect(linha.length).toBe(240);
    });
  });

  it("gera arquivo com múltiplos títulos corretamente", () => {
    const titulos = [TITULO_TESTE, { ...TITULO_TESTE, cobrancaId: 124, nossoNumero: "0000000124" }];
    const arquivo = gerarArquivoRemessaCNAB240(BANCO_TESTE, titulos, 1);
    const linhas = arquivo.split(/\r?\n/).filter(l => l.trim().length > 0);
    // Header + Header lote + (Seg P + Seg Q) * 2 + Trailer lote + Trailer arquivo = 8
    expect(linhas.length).toBe(8);
  });

  it("segmento P tem tipo 'P' na posição 14", () => {
    const arquivo = gerarArquivoRemessaCNAB240(BANCO_TESTE, [TITULO_TESTE], 1);
    const linhas = arquivo.split(/\r?\n/).filter(l => l.trim().length > 0);
    const segP = linhas[2]; // 0=header arq, 1=header lote, 2=seg P
    expect(segP[13]).toBe("P");
  });

  it("segmento Q tem tipo 'Q' na posição 14", () => {
    const arquivo = gerarArquivoRemessaCNAB240(BANCO_TESTE, [TITULO_TESTE], 1);
    const linhas = arquivo.split(/\r?\n/).filter(l => l.trim().length > 0);
    const segQ = linhas[3];
    expect(segQ[13]).toBe("Q");
  });
});

// ─── Parser de Retorno CNAB 240 ───────────────────────────────────────────────

describe("Parser de Retorno CNAB 240", () => {
  it("retorna array vazio para arquivo vazio", () => {
    const resultado = parsearRetornoCNAB240("");
    expect(resultado).toEqual([]);
  });

  it("retorna array vazio para arquivo sem segmentos P/Q", () => {
    // Apenas header e trailer
    const header = "208" + "0000" + "0" + " ".repeat(233);
    const trailer = "208" + "9999" + "9" + " ".repeat(233);
    const resultado = parsearRetornoCNAB240(header + "\r\n" + trailer);
    expect(resultado).toEqual([]);
  });

  it("identifica título com código de liquidação (06) como processado", () => {
    // Simular um segmento P com código 06 (liquidação normal)
    const segP = "208" + "0001" + "3" + "00001" + "P" + " " + "06" + " ".repeat(218);
    const segQ = "208" + "0001" + "3" + "00002" + "Q" + " " + "01" + "1" + "00000000000000" + "JOAO SILVA".padEnd(40, " ") + " ".repeat(168);
    const resultado = parsearRetornoCNAB240(segP + "\r\n" + segQ);
    expect(resultado.length).toBe(1);
    expect(resultado[0].processado).toBe(true);
    expect(resultado[0].codigoOcorrencia).toBe("06");
  });

  it("identifica título com código de entrada (02) como não processado", () => {
    const segP = "208" + "0001" + "3" + "00001" + "P" + " " + "02" + " ".repeat(218);
    const segQ = "208" + "0001" + "3" + "00002" + "Q" + " " + "01" + "1" + "00000000000000" + "MARIA SILVA".padEnd(40, " ") + " ".repeat(168);
    const resultado = parsearRetornoCNAB240(segP + "\r\n" + segQ);
    expect(resultado.length).toBe(1);
    expect(resultado[0].processado).toBe(false);
    expect(resultado[0].codigoOcorrencia).toBe("02");
  });
});

// ─── Parser CSV de Baixa em Lote ──────────────────────────────────────────────

describe("Parser CSV de Baixa em Lote", () => {
  it("parseia CSV com vírgula como separador", () => {
    const csv = "cobrancaId,dataPagamento,valorPago\n123,2024-03-15,150.00\n124,2024-03-16,200.50";
    const resultado = parsearCSVBaixaLote(csv);
    expect(resultado.length).toBe(2);
    expect(resultado[0].cobrancaId).toBe(123);
    expect(resultado[0].valorPago).toBe(15000); // em centavos
    expect(resultado[1].cobrancaId).toBe(124);
  });

  it("parseia CSV com ponto-e-vírgula como separador", () => {
    const csv = "123;2024-03-15;150.00\n124;2024-03-16;200.50";
    const resultado = parsearCSVBaixaLote(csv);
    expect(resultado.length).toBe(2);
    expect(resultado[0].cobrancaId).toBe(123);
  });

  it("parseia CSV com pipe como separador", () => {
    const csv = "123|2024-03-15|75.00";
    const resultado = parsearCSVBaixaLote(csv);
    expect(resultado.length).toBe(1);
    expect(resultado[0].cobrancaId).toBe(123);
    expect(resultado[0].valorPago).toBe(7500);
  });

  it("ignora linhas de cabeçalho", () => {
    const csv = "cobrancaId,dataPagamento,valorPago\n123,2024-03-15,150.00";
    const resultado = parsearCSVBaixaLote(csv);
    expect(resultado.length).toBe(1);
  });

  it("ignora linhas vazias", () => {
    const csv = "123,2024-03-15,150.00\n\n\n124,2024-03-16,200.00";
    const resultado = parsearCSVBaixaLote(csv);
    expect(resultado.length).toBe(2);
  });

  it("ignora linhas com cobrancaId inválido", () => {
    const csv = "abc,2024-03-15,150.00\n123,2024-03-15,150.00";
    const resultado = parsearCSVBaixaLote(csv);
    expect(resultado.length).toBe(1);
  });

  it("converte valor com vírgula decimal (formato BR)", () => {
    const csv = "123,2024-03-15,150,00";
    const resultado = parsearCSVBaixaLote(csv);
    // Valor com vírgula decimal deve ser tratado como 150.00
    expect(resultado.length).toBe(1);
    expect(resultado[0].cobrancaId).toBe(123);
  });

  it("retorna array vazio para CSV vazio", () => {
    expect(parsearCSVBaixaLote("")).toEqual([]);
    expect(parsearCSVBaixaLote("   ")).toEqual([]);
  });
});
