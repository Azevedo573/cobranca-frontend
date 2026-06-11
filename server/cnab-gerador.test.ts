/**
 * Testes unitários para o gerador CNAB 240.
 * Valida o parsing de dueDate (Date object vs string ISO) e valorNominal (string vs number).
 */
import { describe, it, expect } from "vitest";
import {
  padLeft,
  padRight,
  formatarDataCNAB,
  formatarValorCNAB,
  gerarSegmentoPCNAB240,
  limparTexto,
} from "./db-cnab";

// ─── Utilitários ──────────────────────────────────────────────────────────────

describe("padLeft", () => {
  it("preenche número com zeros à esquerda", () => {
    expect(padLeft(42, 5)).toBe("00042");
  });

  it("preenche string com zeros à esquerda", () => {
    expect(padLeft("abc", 5)).toBe("00abc");
  });

  it("trunca se já tiver o tamanho correto", () => {
    expect(padLeft("12345", 5)).toBe("12345");
  });
});

describe("padRight", () => {
  it("preenche string com espaços à direita", () => {
    expect(padRight("abc", 5)).toBe("abc  ");
  });

  it("trunca se exceder o tamanho", () => {
    expect(padRight("abcdefgh", 5)).toBe("abcde");
  });
});

describe("formatarDataCNAB", () => {
  it("formata data no padrão DDMMAAAA", () => {
    const data = new Date(2026, 6, 10); // 10/07/2026 (mês 0-indexado)
    expect(formatarDataCNAB(data)).toBe("10072026");
  });

  it("formata data com zero à esquerda no dia e mês", () => {
    const data = new Date(2026, 0, 5); // 05/01/2026
    expect(formatarDataCNAB(data)).toBe("05012026");
  });
});

describe("formatarValorCNAB", () => {
  it("formata valor em centavos com 15 dígitos", () => {
    expect(formatarValorCNAB(3787, 15)).toBe("000000000003787");
  });

  it("formata valor zero", () => {
    expect(formatarValorCNAB(0, 15)).toBe("000000000000000");
  });

  it("formata valor grande", () => {
    expect(formatarValorCNAB(100000, 15)).toBe("000000000100000");
  });
});

// ─── Parsing de dueDate ───────────────────────────────────────────────────────

describe("parsing de dueDate para dataVencimento", () => {
  /**
   * Simula o parsing que acontece no routers.ts:
   * const raw = r.dueDate;
   * const iso = raw instanceof Date ? raw.toISOString() : String(raw);
   * const [y, m, d] = iso.substring(0, 10).split('-').map(Number);
   * return new Date(y, m - 1, d);
   */
  function parseDueDate(raw: Date | string): Date {
    const iso = raw instanceof Date ? raw.toISOString() : String(raw);
    const [y, m, d] = iso.substring(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  it("parseia string ISO completa corretamente", () => {
    const raw = "2026-07-10T15:00:00.000Z";
    const result = parseDueDate(raw);
    expect(formatarDataCNAB(result)).toBe("10072026");
  });

  it("parseia string ISO simples corretamente", () => {
    const raw = "2026-07-10";
    const result = parseDueDate(raw);
    expect(formatarDataCNAB(result)).toBe("10072026");
  });

  it("parseia objeto Date corretamente", () => {
    const raw = new Date("2026-07-10T15:00:00.000Z");
    const result = parseDueDate(raw);
    expect(formatarDataCNAB(result)).toBe("10072026");
  });

  it("não produz NaN para string ISO do banco", () => {
    // Simula o que o banco retorna: string ISO com timezone
    const raw = "2026-07-10T15:00:00.000Z";
    const result = parseDueDate(raw);
    expect(result.getFullYear()).not.toBeNaN();
    expect(result.getMonth()).not.toBeNaN();
    expect(result.getDate()).not.toBeNaN();
  });
});

// ─── Parsing de amount ────────────────────────────────────────────────────────

describe("parsing de amount para valorNominal", () => {
  /**
   * Simula o parsing que acontece no routers.ts:
   * Math.round(Number(r.amount))
   */
  function parseAmount(raw: string | number): number {
    return Math.round(Number(raw));
  }

  it("converte string '3787.00' para inteiro 3787", () => {
    expect(parseAmount("3787.00")).toBe(3787);
  });

  it("converte string '1107.00' para inteiro 1107", () => {
    expect(parseAmount("1107.00")).toBe(1107);
  });

  it("converte número 3787 sem alteração", () => {
    expect(parseAmount(3787)).toBe(3787);
  });

  it("arredonda valores com casas decimais", () => {
    expect(parseAmount("3787.50")).toBe(3788);
    expect(parseAmount("3787.49")).toBe(3787);
  });

  it("formata corretamente no CNAB após parsing", () => {
    const amount = parseAmount("3787.00");
    expect(formatarValorCNAB(amount, 15)).toBe("000000000003787");
  });

  it("não gera valor com ponto decimal no CNAB", () => {
    const amount = parseAmount("1107.00");
    const cnab = formatarValorCNAB(amount, 15);
    expect(cnab).not.toContain(".");
    expect(cnab).toBe("000000000001107");
  });
});

// ─── Segmento P completo ──────────────────────────────────────────────────────

describe("gerarSegmentoPCNAB240", () => {
  const banco = {
    codigoBanco: "208",
    agencia: "50",
    digitoAgencia: "0",
    conta: "123456",
    digitoConta: "7",
    convenio: "987654321012",
    cedente: "GOMES E SILVA ADVOCACIA",
    cnpjCedente: "12345678000195",
  };

  const titulo = {
    cobrancaId: 1,
    nossoNumero: "1000000001",
    devedorNome: "JOAO DA SILVA",
    devedorCpfCnpj: "12345678901",
    devedorEndereco: "RUA TESTE 123",
    devedorCidade: "SAO PAULO",
    devedorUF: "SP",
    devedorCEP: "01310100",
    valorNominal: 3787,
    dataVencimento: new Date(2026, 6, 10), // 10/07/2026
    dataEmissao: new Date(2026, 5, 11),    // 11/06/2026
    instrucao1: "COBRAR JUROS DE 1% AO MES",
    instrucao2: "",
    taxaJurosDia: 0,
  };

  it("gera linha com 240 caracteres", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    expect(linha.length).toBe(240);
  });

  it("posição 013 é 'P' (segmento P)", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    expect(linha[13]).toBe("P");
  });

  it("nosso número nas posições 049-068 (20 chars, zeros à esquerda)", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    const nossoNum = linha.substring(49, 69);
    expect(nossoNum).toBe("00000000001000000001");
    expect(nossoNum.length).toBe(20);
  });

  it("data de vencimento nas posições 073-080 (DDMMAAAA)", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    const vencimento = linha.substring(73, 81);
    expect(vencimento).toBe("10072026");
    expect(vencimento).not.toContain("N"); // não deve ter NaN
  });

  it("valor nas posições 081-095 (15 chars, sem ponto decimal)", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    const valor = linha.substring(81, 96);
    expect(valor).toBe("000000000003787");
    expect(valor).not.toContain(".");
    expect(valor.length).toBe(15);
  });

  it("convênio nas posições 023-034 (12 chars)", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    const convenio = linha.substring(23, 35);
    expect(convenio).toBe("987654321012");
    expect(convenio.length).toBe(12);
  });

  it("conta nas posições 035-046 (12 chars, zeros à esquerda)", () => {
    const linha = gerarSegmentoPCNAB240(banco, titulo, 1, 1);
    const conta = linha.substring(35, 47);
    expect(conta).toBe("000000123456");
    expect(conta.length).toBe(12);
  });
});
