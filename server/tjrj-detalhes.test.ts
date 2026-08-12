import { describe, expect, it } from "vitest";
import { extrairCamposDetalheTJRJ, parsePayloadTJRJ, tituloMovimentacaoTJRJ } from "../client/src/lib/tjrjDetalhes";

describe("detalhes de movimentação TJRJ", () => {
  it("interpreta payload bruto salvo e mostra campos retornados pelo tribunal", () => {
    const json = JSON.stringify({
      ordem: 86,
      descrMov: "Juntada - Certidão",
      dtMovimento: "04/11/2025",
      dtAlt: "04/11/2025",
      descrTipAto: "Certidão",
    });
    const payload = parsePayloadTJRJ(json);
    const campos = extrairCamposDetalheTJRJ(payload);

    expect(tituloMovimentacaoTJRJ(json, "Movimentação")).toBe("Juntada - Certidão");
    expect(campos).toEqual(expect.arrayContaining([
      expect.objectContaining({ chave: "descrMov", valor: "Juntada - Certidão" }),
      expect.objectContaining({ chave: "dtMovimento", valor: "04/11/2025" }),
      expect.objectContaining({ chave: "ordem", valor: "86" }),
    ]));
  });

  it("não trata o formato legado de complementos como payload bruto TJRJ", () => {
    const legado = JSON.stringify([{ nome: "Código", valor: "123" }]);
    expect(parsePayloadTJRJ(legado)).toBeNull();
    expect(tituloMovimentacaoTJRJ(legado, "Movimentação manual")).toBe("Movimentação manual");
  });
});
