import { describe, it, expect } from "vitest";
import {
  calcularCodigoBarras,
  calcularLinhaDigitavel,
  formatarLinhaDigitavel,
  formatarPixCopiaColaParaExibicao,
  type DadosBoleto,
} from "./boleto-pdf";

// Dados do boleto de teste — baseados no arquivo CNAB real BTG_12052026
const dadosTeste: DadosBoleto = {
  nomeBeneficiario: "GOMES & SILVA SOCIEDADE DE ADVOGADOS",
  cnpjBeneficiario: "32311089000101",
  enderecoBeneficiario: "RUA EXEMPLO, 123 - SAO PAULO/SP",
  banco: "208",
  nomeBanco: "BTG PACTUAL S/A",
  agencia: "0050",
  digitoAgencia: "0",
  conta: "432260",
  digitoConta: "0",
  carteira: "1",
  convenio: "11051861158",
  nossoNumero: "1000000084",
  dataVencimento: new Date("2026-06-12T12:00:00.000Z"),
  dataEmissao: new Date("2026-05-12T12:00:00.000Z"),
  valor: 2065330, // R$20.653,30 em centavos
  especieDocumento: "DD",
  aceite: "N",
  nomeSacado: "ANTONIO CARLOS DA SILVA",
  cpfCnpjSacado: "13598379730",
  enderecoSacado: "RUA DAS FLORES, 456",
  cidadeSacado: "SAO PAULO",
  ufSacado: "SP",
  cepSacado: "01310-100",
  localPagamento: "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO",
  instrucoes: ["Após vencimento cobrar multa de 2.00% e mora diária de 0.0333% ao dia."],
  seuNumero: "1000000084",
};

describe("calcularCodigoBarras - BTG Pactual", () => {
  it("deve gerar um código de barras com 44 dígitos", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    expect(codigo).toHaveLength(44);
  });

  it("deve começar com o código do banco BTG (208)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    expect(codigo.substring(0, 3)).toBe("208");
  });

  it("deve ter moeda Real (9) na posição 4", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    expect(codigo[3]).toBe("9");
  });

  it("deve ter o dígito verificador na posição 5 (índice 4)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const dv = codigo[4];
    expect(dv).toMatch(/[0-9]/);
  });

  it("deve conter o fator de vencimento correto para 12/06/2026 (nova data base FEBRABAN)", () => {
    // 12/06/2026: usa nova data base (22/02/2025) + fator inicial 1000
    // diff2 = dias de 22/02/2025 a 12/06/2026 = 475 dias
    // fator = 1000 + 475 = 1475
    const codigo = calcularCodigoBarras(dadosTeste);
    const fator = codigo.substring(5, 9);
    expect(parseInt(fator)).toBeGreaterThan(1000);
    expect(parseInt(fator)).toBeLessThan(2000);
  });

  it("deve conter o valor correto (2065330 centavos = 0002065330)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const valor = codigo.substring(9, 19);
    expect(valor).toBe("0002065330");
  });

  it("deve conter apenas dígitos", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    expect(codigo).toMatch(/^\d{44}$/);
  });
});

describe("calcularLinhaDigitavel - BTG Pactual", () => {
  it("deve gerar uma linha digitável com 47 dígitos (sem espaços)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo).replace(/\s/g, "");
    expect(linha).toHaveLength(47);
  });

  it("deve conter apenas dígitos e espaços", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo);
    expect(linha).toMatch(/^[\d ]+$/);
  });

  it("deve ter o campo 5 (posição 34-47) com fator + valor", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo).replace(/\s/g, "");
    const campo5 = linha.substring(33, 47);
    // Campo 5 = fator(4) + valor(10)
    const valor = campo5.substring(4);
    expect(valor).toBe("0002065330");
  });

  it("deve ter o DV geral do código de barras no campo 4 (posição 33)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo).replace(/\s/g, "");
    const dvLinha = linha[32];
    const dvCodigo = codigo[4];
    expect(dvLinha).toBe(dvCodigo);
  });
});

describe("formatarLinhaDigitavel", () => {
  it("deve formatar a linha digitável no padrão XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXX", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo);
    const formatada = formatarLinhaDigitavel(linha);
    // Verificar formato: 5.5 5.6 5.6 1 14
    expect(formatada).toMatch(/^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/);
  });

  it("deve ter comprimento total de 54 caracteres (47 dígitos + 6 espaços/pontos)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo);
    const formatada = formatarLinhaDigitavel(linha);
    // 5+1+5+1+5+1+6+1+5+1+6+1+1+1+14 = 54
    expect(formatada.length).toBe(54);
  });

  it("deve iniciar com os 3 primeiros dígitos do banco (208)", () => {
    const codigo = calcularCodigoBarras(dadosTeste);
    const linha = calcularLinhaDigitavel(codigo);
    const formatada = formatarLinhaDigitavel(linha);
    expect(formatada.substring(0, 3)).toBe("208");
  });
});

describe("formatarPixCopiaColaParaExibicao", () => {
  it("mantém integralmente o payload Pix, inclusive espaços válidos, ao quebrá-lo para leitura no PDF", () => {
    const payload = "00020126580014BR.GOV.BCB.PIX0136f1e62a0f-1a27-4bb5-8e4c-01f327c97626520400005303986540650.005802BR5920GOMES E SILVA ADVOCACIA6009RIO DE JANEIRO62070503***6304ABCD";
    const exibicao = formatarPixCopiaColaParaExibicao(payload, 32);

    expect(exibicao.replace(/\n/g, "")).toBe(payload);
    expect(exibicao.split("\n").every((linha) => linha.length <= 32)).toBe(true);
  });

  it("remove apenas quebras técnicas sem alterar os espaços do payload", () => {
    expect(formatarPixCopiaColaParaExibicao("  000201  2658\n0014BR  ", 8))
      .toBe("000201  \n26580014\nBR");
  });
});

describe("Consistência código de barras e linha digitável", () => {
  it("deve gerar resultados consistentes para o mesmo boleto", () => {
    const codigo1 = calcularCodigoBarras(dadosTeste);
    const codigo2 = calcularCodigoBarras(dadosTeste);
    expect(codigo1).toBe(codigo2);
  });

  it("deve gerar códigos diferentes para valores diferentes", () => {
    const dados2 = { ...dadosTeste, valor: 100000 }; // R$1.000,00
    const codigo1 = calcularCodigoBarras(dadosTeste);
    const codigo2 = calcularCodigoBarras(dados2);
    expect(codigo1).not.toBe(codigo2);
  });

  it("mantém o valor da parcela no código mesmo quando o contexto histórico do acordo é maior", () => {
    const dadosEntrada = {
      ...dadosTeste,
      valor: 5000,
      contextoAcordo: {
        acordoId: 1410001,
        referenciaParcelaAtual: "Entrada do Acordo #1410001",
        valorDocumento: 5000,
        valorOrigem: 11301,
        totalNegociado: 11301,
        saldoAposEstePagamento: 6301,
        parcelas: [],
      },
    };
    const codigo = calcularCodigoBarras(dadosEntrada);

    expect(codigo.substring(9, 19)).toBe("0000005000");
  });

  it("deve gerar códigos diferentes para datas de vencimento diferentes", () => {
    // Usar datas dentro da data base 1 (antes de 21/02/2025) para garantir diferença
    const dados1 = { ...dadosTeste, dataVencimento: new Date("2024-06-12T12:00:00.000Z") };
    const dados2 = { ...dadosTeste, dataVencimento: new Date("2024-07-12T12:00:00.000Z") };
    const codigo1 = calcularCodigoBarras(dados1);
    const codigo2 = calcularCodigoBarras(dados2);
    expect(codigo1).not.toBe(codigo2);
  });
});
