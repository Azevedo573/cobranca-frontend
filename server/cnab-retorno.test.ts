import { describe, it, expect } from "vitest";
import {
  parseRetornoCNAB240,
  determinarNovoStatus,
  CODIGOS_MOVIMENTO,
} from "./db-cnab-retorno";

// Linhas extraídas diretamente do arquivo real BTG_12052026(1)-202605125454.ret
const LINHA_HEADER = "20800000         2323110890001010000000000000000000000050 00000043226000                              BANCO BTG PACTUAL                       21305202600545600000010301600                                                                     ";
const LINHA_HEADER_LOTE = "20800011T01  060 20323110890001010000000000000000000000050 00000043226000                                                                                                                      13052026                                         ";
const LINHA_SEG_T = "2080001300001T 02000500000000432260001000000084          11000000084     120620260000000020653302080005001                        091000013598379730ANTONIO CARLOS DA SILVA                 0000000000000000000000000                           ";
const LINHA_SEG_U = "2080001300002U 020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001305202600000000000000000000000000000000000                              000                           ";
const LINHA_TRAILER_LOTE = "20800015         000001000000000000002065330  000000000000000000000  00000000000000000000000000000000000000000000  00000000                                                                                                                     ";
const LINHA_TRAILER_ARQ = "20899999         000001000006000000                                                                                                                                                                                                             ";

const ARQUIVO_RETORNO_BTG = [
  LINHA_HEADER,
  LINHA_HEADER_LOTE,
  LINHA_SEG_T,
  LINHA_SEG_U,
  LINHA_TRAILER_LOTE,
  LINHA_TRAILER_ARQ,
].join("\r\n");

describe("parseRetornoCNAB240 - BTG Pactual (arquivo real)", () => {
  it("deve parsear o header do arquivo corretamente", () => {
    const retorno = parseRetornoCNAB240(ARQUIVO_RETORNO_BTG);
    expect(retorno.header.banco).toBe("208");
    expect(retorno.header.cnpjBeneficiario).toBe("32311089000101");
    expect(retorno.header.nomeBanco).toBe("BANCO BTG PACTUAL");
    expect(retorno.header.codRetorno).toBe("2");
    expect(retorno.header.dataGeracao).toBe("13052026");
  });

  it("deve retornar 1 par T+U para o arquivo de teste", () => {
    const retorno = parseRetornoCNAB240(ARQUIVO_RETORNO_BTG);
    expect(retorno.pares).toHaveLength(1);
  });

  it("deve parsear o Segmento T corretamente", () => {
    const retorno = parseRetornoCNAB240(ARQUIVO_RETORNO_BTG);
    const par = retorno.pares[0];

    expect(par.segmentoT.nossoNumero).toBe("1000000084");
    expect(par.segmentoT.codMovimento).toBe("02");
    expect(par.segmentoT.descMovimento).toBe("Entrada Confirmada");
    expect(par.segmentoT.dataVencimento).toBe("2026-06-12");
    // Valor: 000000002065330 = 2.065.330 centavos = R$20.653,30
    expect(par.segmentoT.valorTitulo).toBe(2065330);
    expect(par.segmentoT.codOcorrencia).toBe("091");
    expect(par.segmentoT.cpfCnpjPagador).toBe("13598379730");
    expect(par.segmentoT.nomePagador).toBe("ANTONIO CARLOS DA SILVA");
  });

  it("deve parsear o Segmento U com data de ocorrência correta", () => {
    const retorno = parseRetornoCNAB240(ARQUIVO_RETORNO_BTG);
    const par = retorno.pares[0];
    expect(par.segmentoU.dataOcorrencia).toBe("2026-05-13");
    // dataCredito = 00000000 para entrada confirmada
    expect(par.segmentoU.dataCredito).toBe("");
    expect(par.segmentoU.valorPago).toBe(0); // entrada confirmada ainda não tem valor pago
  });

  it("deve parsear totais do trailer corretamente", () => {
    const retorno = parseRetornoCNAB240(ARQUIVO_RETORNO_BTG);
    expect(retorno.totalLotes).toBe(1);
    expect(retorno.totalRegistros).toBe(6);
  });
});

describe("determinarNovoStatus", () => {
  it("deve retornar em_cobranca para código 02 (entrada confirmada)", () => {
    expect(determinarNovoStatus("02", "091")).toBe("em_cobranca");
  });

  it("deve retornar pago para código 06 (liquidação normal)", () => {
    expect(determinarNovoStatus("06", "006")).toBe("pago");
  });

  it("deve retornar pago para código 07 (liquidação parcial)", () => {
    expect(determinarNovoStatus("07", "007")).toBe("pago");
  });

  it("deve retornar cancelado para código 09 (baixa automática)", () => {
    expect(determinarNovoStatus("09", "009")).toBe("cancelado");
  });

  it("deve retornar cancelado para código 10 (baixa por solicitação)", () => {
    expect(determinarNovoStatus("10", "010")).toBe("cancelado");
  });

  it("deve retornar pendente para código 03 (entrada rejeitada)", () => {
    expect(determinarNovoStatus("03", "003")).toBe("pendente");
  });

  it("deve retornar null para código desconhecido", () => {
    expect(determinarNovoStatus("99", "999")).toBeNull();
  });
});

describe("CODIGOS_MOVIMENTO", () => {
  it("deve conter os principais códigos BTG", () => {
    expect(CODIGOS_MOVIMENTO["02"]).toBe("Entrada Confirmada");
    expect(CODIGOS_MOVIMENTO["06"]).toBe("Liquidação Normal");
    expect(CODIGOS_MOVIMENTO["09"]).toBe("Baixa Automática");
  });
});
