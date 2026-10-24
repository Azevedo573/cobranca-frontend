import { describe, expect, it } from "vitest";
import { consolidarResultadoRemessaBtgV2, validarLoteUnicoCondominioBtgV2, validarSelecaoRemessaBtgV2 } from "./btg-v2/remessas";

describe("BTG v2 — consolidação de remessas", () => {
  it("marca uma remessa como processada quando todos os itens foram emitidos ou já existiam", () => {
    expect(consolidarResultadoRemessaBtgV2([
      { resultado: "emitida", valorCentavos: 1000 },
      { resultado: "ja_existia", valorCentavos: 2000 },
    ])).toMatchObject({
      status: "processada",
      totalSelecionado: 2,
      totalEmitido: 2,
      totalFalha: 0,
      valorTotalCentavos: 3000,
    });
  });

  it("marca a remessa como parcial quando uma emissão falha", () => {
    expect(consolidarResultadoRemessaBtgV2([
      { resultado: "emitida", valorCentavos: 1000 },
      { resultado: "falha", valorCentavos: 2000 },
    ])).toMatchObject({ status: "processada_parcialmente", totalEmitido: 1, totalFalha: 1 });
  });

  it("marca a remessa como falha quando nenhum item foi emitido", () => {
    expect(consolidarResultadoRemessaBtgV2([
      { resultado: "falha", valorCentavos: 1000 },
    ])).toMatchObject({ status: "falha", totalEmitido: 0, totalFalha: 1 });
  });

  it("exige um único condomínio para uma remessa", () => {
    expect(validarLoteUnicoCondominioBtgV2([7, 7])).toBe(7);
    expect(() => validarLoteUnicoCondominioBtgV2([7, 8])).toThrow("único condomínio");
  });

  it("não aceita item bloqueado ou fora da fila do condomínio", () => {
    const fila = [{
      id: 10, acordoId: 4, installmentNumber: 1, amount: 1000, dueDate: new Date(), status: "pendente",
      devedorNome: "Pessoa Teste", devedorCpfCnpj: "123", elegivel: false, motivoBloqueio: "Parcela já vinculada a uma remessa CNAB, boleto legado ou emissão BolePix",
    }];
    expect(() => validarSelecaoRemessaBtgV2({ condominioId: 1, parcelaIds: [10], fila })).toThrow("não pode ser enviada");
    expect(() => validarSelecaoRemessaBtgV2({ condominioId: 1, parcelaIds: [11], fila })).toThrow("não pertencem ao condomínio");
  });
});
