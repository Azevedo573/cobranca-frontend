import { describe, expect, it } from "vitest";
import { contextoPublicacaoTratamento, tituloTratamentoPublicacao } from "../client/src/lib/tratamentosPublicacao";

describe("tratamentos de publicação PJe", () => {
  const publicacao = {
    numeroProcesso: "0002295-31.2021.8.19.0208",
    tipo: "Intimação",
    tribunal: "TJRJ",
    orgao: "1ª Vara Cível",
    data: "2026-08-11",
    texto: "Apresente manifestação no prazo legal.",
  };

  it("preserva a origem e o contexto da publicação no tratamento", () => {
    const contexto = contextoPublicacaoTratamento(publicacao);
    expect(contexto).toContain("Origem: Publicação PJe");
    expect(contexto).toContain("Processo: 0002295-31.2021.8.19.0208");
    expect(contexto).toContain("Conteúdo: Apresente manifestação no prazo legal.");
  });

  it("gera título identificável para cada tratamento", () => {
    expect(tituloTratamentoPublicacao("prazo", publicacao)).toContain("Prazo originado de publicação PJe");
    expect(tituloTratamentoPublicacao("audiencia", publicacao)).toContain("0002295-31.2021.8.19.0208");
  });
});
