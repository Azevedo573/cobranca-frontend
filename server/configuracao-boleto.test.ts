/**
 * Testes unitários — Configuração de Boleto BTG Pactual + CNAB 240 aprimorado
 *
 * Cobre:
 * - Geração do segmento R (multa/instruções)
 * - Contagem correta de registros com P+Q+R
 * - Parser de retorno com segmento R
 * - Novos códigos de ocorrência (07, 29, 40...)
 * - CODIGOS_LIQUIDACAO
 * - gerarNomeArquivoRemessa (padrão BTG_ddmmyyyy)
 * - configParaDadosBanco
 * - incrementarSequencialArquivo (lógica isolada)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  gerarSegmentoRCNAB240,
  gerarArquivoRemessaCNAB240,
  parsearRetornoCNAB240,
  CODIGOS_LIQUIDACAO,
} from "./db-cnab";
import {
  gerarNomeArquivoRemessa,
  configParaDadosBanco,
} from "./db-configuracao-boleto";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BANCO_BTG = {
  codigoBanco: "208",
  agencia: "0050",
  digitoAgencia: "0",
  conta: "432260",
  digitoConta: "0",
  convenio: "123456",
  cedente: "CONDOMINIO TESTE",
  cnpjCedente: "12345678000195",
};

const TITULO_BASE = {
  cobrancaId: 1,
  nossoNumero: "1000000001",
  devedorNome: "JOAO DA SILVA",
  devedorCpfCnpj: "12345678901",
  devedorEndereco: "RUA TESTE 123",
  devedorCidade: "SAO PAULO",
  devedorUF: "SP",
  devedorCEP: "01310100",
  valorNominal: 150000, // R$ 1.500,00 em centavos
  dataVencimento: new Date("2026-05-15"),
  dataEmissao: new Date("2026-04-01"),
  instrucao1: "COBRAR MULTA DE 2% E JUROS DE 0,033% AO DIA",
  instrucao2: "",
  carteira: "1",
  especieDocumento: "DD",
  aceite: "N",
  taxaJurosDia: 33,
  taxaMulta: 200,
  enviarProtesto: false,
};

// ─── Segmento R ───────────────────────────────────────────────────────────────

describe("gerarSegmentoRCNAB240", () => {
  it("deve gerar uma linha com exatamente 240 caracteres", () => {
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, TITULO_BASE, 1, 3);
    expect(linha).toHaveLength(240);
  });

  it("deve ter código de banco correto nas posições 001-003", () => {
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, TITULO_BASE, 1, 3);
    expect(linha.substring(0, 3)).toBe("208");
  });

  it("deve ter tipo de registro '3' na posição 008", () => {
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, TITULO_BASE, 1, 3);
    expect(linha[7]).toBe("3");
  });

  it("deve ter identificador de segmento 'R' na posição 014", () => {
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, TITULO_BASE, 1, 3);
    expect(linha[13]).toBe("R");
  });

  it("deve ter código de multa '2' (percentual) quando taxaMulta > 0", () => {
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, TITULO_BASE, 1, 3);
    // Posição 062 (índice 61)
    expect(linha[61]).toBe("2");
  });

  it("deve ter código de multa '0' (isento) quando taxaMulta = 0", () => {
    const tituloSemMulta = { ...TITULO_BASE, taxaMulta: 0 };
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, tituloSemMulta, 1, 3);
    expect(linha[61]).toBe("0");
  });

  it("deve incluir instrução 1 nas posições 084-123", () => {
    const linha = gerarSegmentoRCNAB240(BANCO_BTG, TITULO_BASE, 1, 3);
    const instrucao = linha.substring(83, 123).trimEnd();
    expect(instrucao.length).toBeGreaterThan(0);
    expect(instrucao).toContain("COBRAR");
  });
});

// ─── Arquivo de Remessa com P+Q+R ────────────────────────────────────────────

describe("gerarArquivoRemessaCNAB240 com segmento R", () => {
  it("deve gerar arquivo com 3 segmentos por título (P, Q, R)", () => {
    const conteudo = gerarArquivoRemessaCNAB240(BANCO_BTG, [TITULO_BASE], 1);
    const linhas = conteudo.split(/\r?\n/).filter(l => l.length > 0);
    // header_arq + header_lote + P + Q + R + trailer_lote + trailer_arq = 7
    expect(linhas).toHaveLength(7);
  });

  it("deve ter segmentos na ordem P, Q, R para cada título", () => {
    const conteudo = gerarArquivoRemessaCNAB240(BANCO_BTG, [TITULO_BASE], 1);
    const linhas = conteudo.split(/\r?\n/).filter(l => l.length > 0);
    // Linha 2 (índice 2) = segmento P, 3 = Q, 4 = R
    expect(linhas[2][13]).toBe("P");
    expect(linhas[3][13]).toBe("Q");
    expect(linhas[4][13]).toBe("R");
  });

  it("deve gerar 10 segmentos de dados para 3 títulos (3 * P+Q+R = 9 + 1 header_lote + 1 trailer_lote + 2 header/trailer_arq = 13)", () => {
    const titulos = [TITULO_BASE, { ...TITULO_BASE, cobrancaId: 2, nossoNumero: "1000000002" }, { ...TITULO_BASE, cobrancaId: 3, nossoNumero: "1000000003" }];
    const conteudo = gerarArquivoRemessaCNAB240(BANCO_BTG, titulos, 1);
    const linhas = conteudo.split(/\r?\n/).filter(l => l.length > 0);
    // 2 (header/trailer arq) + 2 (header/trailer lote) + 9 (3 * P+Q+R) = 13
    expect(linhas).toHaveLength(13);
  });

  it("cada linha deve ter exatamente 240 caracteres", () => {
    const conteudo = gerarArquivoRemessaCNAB240(BANCO_BTG, [TITULO_BASE], 1);
    const linhas = conteudo.split(/\r?\n/).filter(l => l.length > 0);
    linhas.forEach((linha, i) => {
      expect(linha, `Linha ${i + 1} deve ter 240 chars`).toHaveLength(240);
    });
  });

  it("deve usar CRLF como separador de linhas", () => {
    const conteudo = gerarArquivoRemessaCNAB240(BANCO_BTG, [TITULO_BASE], 1);
    expect(conteudo).toContain("\r\n");
  });
});

// ─── Parser de Retorno ────────────────────────────────────────────────────────

describe("parsearRetornoCNAB240", () => {
  /**
   * Gera uma linha de retorno simulada com os campos mínimos
   */
  function gerarLinhaRetornoP(nossoNumero: string, codigoOcorrencia: string, valorPago = 0): string {
    let linha = " ".repeat(240);
    const arr = linha.split("");
    // Tipo registro = 3
    arr[7] = "3";
    // Segmento = P
    arr[13] = "P";
    // Código ocorrência (posições 16-17, índices 15-16)
    arr[15] = codigoOcorrencia[0];
    arr[16] = codigoOcorrencia[1];
    // Nosso número (posições 43-57, índices 42-56)
    const nn = nossoNumero.padStart(15, "0");
    for (let i = 0; i < 15; i++) arr[42 + i] = nn[i];
    // Valor pago (posições 146-159, índices 145-157)
    const vp = String(valorPago).padStart(13, "0");
    for (let i = 0; i < 13; i++) arr[145 + i] = vp[i];
    // Data ocorrência (posições 138-145, índices 137-144) = DDMMAAAA
    const hoje = "27042026";
    for (let i = 0; i < 8; i++) arr[137 + i] = hoje[i];
    return arr.join("");
  }

  function gerarLinhaRetornoQ(cpf: string, nome: string): string {
    let linha = " ".repeat(240);
    const arr = linha.split("");
    arr[7] = "3";
    arr[13] = "Q";
    // CPF (posições 19-33, índices 18-32)
    const cpfPad = cpf.padStart(15, "0");
    for (let i = 0; i < 15; i++) arr[18 + i] = cpfPad[i];
    // Nome (posições 34-73, índices 33-72)
    const nomePad = nome.substring(0, 40).padEnd(40, " ");
    for (let i = 0; i < 40; i++) arr[33 + i] = nomePad[i];
    return arr.join("");
  }

  function gerarLinhaRetornoR(): string {
    let linha = " ".repeat(240);
    const arr = linha.split("");
    arr[7] = "3";
    arr[13] = "R";
    return arr.join("");
  }

  it("deve parsear retorno com segmentos P+Q (sem R)", () => {
    const linhaP = gerarLinhaRetornoP("1000000001", "06", 150000);
    const linhaQ = gerarLinhaRetornoQ("12345678901", "JOAO DA SILVA");
    const conteudo = [linhaP, linhaQ].join("\r\n") + "\r\n";
    const titulos = parsearRetornoCNAB240(conteudo);
    expect(titulos).toHaveLength(1);
    expect(titulos[0].nossoNumero).toBe("000001000000001");
    expect(titulos[0].processado).toBe(true); // código 06 = liquidação
    expect(titulos[0].devedorNome).toBe("JOAO DA SILVA");
  });

  it("deve parsear retorno com segmentos P+Q+R", () => {
    const linhaP = gerarLinhaRetornoP("1000000002", "06", 200000);
    const linhaQ = gerarLinhaRetornoQ("98765432100", "MARIA SOUZA");
    const linhaR = gerarLinhaRetornoR();
    const conteudo = [linhaP, linhaQ, linhaR].join("\r\n") + "\r\n";
    const titulos = parsearRetornoCNAB240(conteudo);
    expect(titulos).toHaveLength(1);
    expect(titulos[0].devedorNome).toBe("MARIA SOUZA");
    expect(titulos[0].processado).toBe(true);
  });

  it("deve parsear múltiplos títulos com P+Q+R cada", () => {
    const linhas: string[] = [];
    for (let i = 1; i <= 3; i++) {
      linhas.push(gerarLinhaRetornoP(`100000000${i}`, "06", i * 100000));
      linhas.push(gerarLinhaRetornoQ(`1234567890${i}`, `DEVEDOR ${i}`));
      linhas.push(gerarLinhaRetornoR());
    }
    const conteudo = linhas.join("\r\n") + "\r\n";
    const titulos = parsearRetornoCNAB240(conteudo);
    expect(titulos).toHaveLength(3);
    expect(titulos[2].devedorNome).toBe("DEVEDOR 3");
  });

  it("deve marcar como não processado quando código é 02 (entrada confirmada)", () => {
    const linhaP = gerarLinhaRetornoP("1000000003", "02", 0);
    const linhaQ = gerarLinhaRetornoQ("11111111111", "PEDRO ALVES");
    const conteudo = [linhaP, linhaQ].join("\r\n") + "\r\n";
    const titulos = parsearRetornoCNAB240(conteudo);
    expect(titulos[0].processado).toBe(false); // 02 = entrada confirmada, não pagamento
    expect(titulos[0].descricaoOcorrencia).toBe("Entrada Confirmada");
  });

  it("deve marcar como processado para código 07 (liquidação parcial)", () => {
    const linhaP = gerarLinhaRetornoP("1000000004", "07", 75000);
    const linhaQ = gerarLinhaRetornoQ("22222222222", "ANA LIMA");
    const conteudo = [linhaP, linhaQ].join("\r\n") + "\r\n";
    const titulos = parsearRetornoCNAB240(conteudo);
    expect(titulos[0].processado).toBe(true);
    expect(titulos[0].descricaoOcorrencia).toBe("Liquidação Parcial");
  });

  it("deve retornar descrição para código desconhecido", () => {
    const linhaP = gerarLinhaRetornoP("1000000005", "99", 0);
    const linhaQ = gerarLinhaRetornoQ("33333333333", "CARLOS NETO");
    const conteudo = [linhaP, linhaQ].join("\r\n") + "\r\n";
    const titulos = parsearRetornoCNAB240(conteudo);
    expect(titulos[0].descricaoOcorrencia).toContain("99");
  });
});

// ─── CODIGOS_LIQUIDACAO ───────────────────────────────────────────────────────

describe("CODIGOS_LIQUIDACAO", () => {
  it("deve conter os códigos de liquidação efetiva", () => {
    expect(CODIGOS_LIQUIDACAO.has("06")).toBe(true); // Liquidação Normal
    expect(CODIGOS_LIQUIDACAO.has("07")).toBe(true); // Liquidação Parcial
    expect(CODIGOS_LIQUIDACAO.has("15")).toBe(true); // Liquidação em Cartório
    expect(CODIGOS_LIQUIDACAO.has("17")).toBe(true); // Liquidação após Baixa
  });

  it("não deve conter códigos que não são liquidação", () => {
    expect(CODIGOS_LIQUIDACAO.has("02")).toBe(false); // Entrada Confirmada
    expect(CODIGOS_LIQUIDACAO.has("03")).toBe(false); // Entrada Rejeitada
    expect(CODIGOS_LIQUIDACAO.has("09")).toBe(false); // Baixa Automática
    expect(CODIGOS_LIQUIDACAO.has("10")).toBe(false); // Baixa Solicitada
  });
});

// ─── gerarNomeArquivoRemessa ──────────────────────────────────────────────────

describe("gerarNomeArquivoRemessa", () => {
  it("deve substituir ddmmyyyy pela data atual no formato correto", () => {
    const nome = gerarNomeArquivoRemessa("BTG_ddmmyyyy.txt");
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, "0");
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const yyyy = String(hoje.getFullYear());
    expect(nome).toBe(`BTG_${dd}${mm}${yyyy}.rem`);
  });

  it("deve substituir ddmmaa pela data com ano de 2 dígitos", () => {
    const nome = gerarNomeArquivoRemessa("REM_ddmmaa.rem");
    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, "0");
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const aa = String(hoje.getFullYear()).slice(-2);
    expect(nome).toBe(`REM_${dd}${mm}${aa}.rem`);
  });

  it("deve substituir .txt por .rem no nome do arquivo", () => {
    const nome = gerarNomeArquivoRemessa("remessa_fixa.txt");
    expect(nome).toBe("remessa_fixa.rem");
  });

  it("deve manter extensao .rem sem alterar", () => {
    const nome = gerarNomeArquivoRemessa("remessa_fixa.rem");
    expect(nome).toBe("remessa_fixa.rem");
  });

  it("deve lidar com padrão vazio", () => {
    const nome = gerarNomeArquivoRemessa("");
    expect(typeof nome).toBe("string");
  });
});

// ─── configParaDadosBanco ─────────────────────────────────────────────────────

describe("configParaDadosBanco", () => {
  const configMock = {
    id: 1,
    condominioId: 1,
    banco: "208",
    nomeBanco: "BTG PACTUAL",
    agencia: "0050",
    digitoAgencia: "0",
    conta: "432260",
    digitoConta: "0",
    convenio: "987654",
    ativo: 1 as const,
    contaRepasse: 0 as const,
    usarMinimoDias: 0 as const,
    minimosDiasAntesVencimento: 0,
    enviarParcelasApenasPrimeiraPaga: 0 as const,
    enviarParcelasApenasAnteriorPaga: 1 as const,
    carteira: "1",
    especieDocumento: "DD",
    aceite: "N",
    nomeBeneficiario: "COND JARDIM PRIMAVERA",
    cnpjBeneficiario: "12345678000195",
    enderecoBeneficiario: "RUA DAS FLORES 100",
    localPagamento: "PAGAVEL EM QUALQUER BANCO",
    instrucoesCaixa: "COBRAR MULTA DE 2% E JUROS DE 0,033% AO DIA",
    taxaJurosDia: "0.03330",
    taxaMulta: "2.00",
    padraoNomeArquivo: "BTG_ddmmyyyy.txt",
    layoutArquivo: "CNAB240",
    enviarInstrucoesProtesto: 0 as const,
    habilitarBoleto: 1 as const,
    habilitarPix: 1 as const,
    taxaCobrancaValor: "3.50",
    taxaCobrancaPercentual: "0.00",
    despesaValor: "0.00",
    despesaPercentual: "0.00",
    numeroSequencialArquivo: 126,
    nossoNumeroAtual: 1000000409,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("deve converter configuração para DadosBanco corretamente", () => {
    const dados = configParaDadosBanco(configMock, "COND JARDIM PRIMAVERA");
    expect(dados).not.toBeNull();
    expect(dados!.codigoBanco).toBe("208");
    expect(dados!.agencia).toBe("0050");
    expect(dados!.conta).toBe("432260");
    expect(dados!.convenio).toBe("987654");
  });

  it("deve usar o nome do condomínio como cedente quando nomeBeneficiario está vazio", () => {
    const configSemNome = { ...configMock, nomeBeneficiario: null };
    const dados = configParaDadosBanco(configSemNome, "COND CENTRAL");
    expect(dados!.cedente).toBe("COND CENTRAL");
  });

  it("deve usar nomeBeneficiario da config quando disponível", () => {
    const dados = configParaDadosBanco(configMock, "OUTRO NOME");
    expect(dados!.cedente).toBe("COND JARDIM PRIMAVERA");
  });

  it("deve usar cnpjBeneficiario da config como cnpjCedente", () => {
    const dados = configParaDadosBanco(configMock, "COND");
    expect(dados!.cnpjCedente).toBe("12345678000195");
  });
});
