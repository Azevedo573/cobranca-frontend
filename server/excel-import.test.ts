import { describe, expect, it } from "vitest";
import { identificarPossiveisDuplicidadesPlanilha } from "./excel-import";

describe("identificarPossiveisDuplicidadesPlanilha", () => {
  it("avisa quando o arquivo contém duas cobranças com a mesma identidade financeira", () => {
    const avisos = identificarPossiveisDuplicidadesPlanilha([
      {
        nomeCompleto: "Maria da Silva",
        cpfCnpj: "123.456.789-00",
        unidade: "101",
        bloco: "A",
        tipoCobranca: "Cota Condominial",
        mesReferencia: "01/2026",
        dataVencimento: "10/01/2026",
        valorOriginal: 500,
      },
      {
        nomeCompleto: "MARIA DA SILVA",
        cpfCnpj: "12345678900",
        unidade: "101",
        bloco: "A",
        tipoCobranca: "Cota Condominial",
        mesReferencia: "01/2026",
        dataVencimento: "10/01/2026",
        valorOriginal: 500,
      },
    ]);

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ linha: 3, campo: "Possível duplicidade", tipo: "aviso" });
  });

  it("não avisa quando a referência financeira é diferente", () => {
    const avisos = identificarPossiveisDuplicidadesPlanilha([
      { unidade: "101", bloco: "A", dataVencimento: "10/01/2026", mesReferencia: "01/2026", valorOriginal: 500 },
      { unidade: "101", bloco: "A", dataVencimento: "10/02/2026", mesReferencia: "02/2026", valorOriginal: 500 },
    ]);

    expect(avisos).toHaveLength(0);
  });
});
