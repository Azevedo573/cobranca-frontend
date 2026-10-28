import { describe, expect, it, vi } from "vitest";
import { atualizarConsultasAposCriarDivida } from "../client/src/lib/atualizacaoDivida";

describe("atualizarConsultasAposCriarDivida", () => {
  it("invalida a lista unificada e os resumos que aparecem no detalhe do devedor", async () => {
    const atualizadores = {
      cobrancasComAcordos: vi.fn().mockResolvedValue(undefined),
      cobrancasPorDevedor: vi.fn().mockResolvedValue(undefined),
      devedor: vi.fn().mockResolvedValue(undefined),
      visao360: vi.fn().mockResolvedValue(undefined),
    };

    await atualizarConsultasAposCriarDivida(540001, atualizadores);

    expect(atualizadores.cobrancasComAcordos).toHaveBeenCalledWith(540001);
    expect(atualizadores.cobrancasPorDevedor).toHaveBeenCalledWith(540001);
    expect(atualizadores.devedor).toHaveBeenCalledWith(540001);
    expect(atualizadores.visao360).toHaveBeenCalledWith(540001);
  });

  it("aguarda as invalidações antes de permitir que o fluxo pós-cadastro continue", async () => {
    let liberouAtualizacao = false;
    const atualizadores = {
      cobrancasComAcordos: vi.fn().mockImplementation(async () => {
        await Promise.resolve();
        liberouAtualizacao = true;
      }),
      cobrancasPorDevedor: vi.fn().mockResolvedValue(undefined),
      devedor: vi.fn().mockResolvedValue(undefined),
      visao360: vi.fn().mockResolvedValue(undefined),
    };

    await atualizarConsultasAposCriarDivida(540001, atualizadores);

    expect(liberouAtualizacao).toBe(true);
  });
});
