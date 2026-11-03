import { describe, expect, it } from "vitest";
import { montarOrigemDividaAcordo, deveResumirOrigem, type VinculoOrigemDocumento } from "./origem-divida-acordo";

const vinculo = (id: number, valorOriginal = 10000): VinculoOrigemDocumento => ({
  cobrancaId: id, valorOriginal, titulo: `Dívida ${id}`, vencimento: new Date(`2026-01-${String(id).padStart(2, "0")}T12:00:00Z`),
});
const snapshot = { snapshotPrincipal: 20000, snapshotJuros: 101, snapshotMulta: 400, snapshotCorrecao: 0, snapshotHonorarios: 2050, snapshotValorAtualizado: 22551 };

describe("origem documental do acordo", () => {
  it("usa principal preservado nos vínculos e snapshot único, sem somar snapshots repetidos por parcela", () => {
    const origem = montarOrigemDividaAcordo([vinculo(2), vinculo(1)], [snapshot, snapshot]);
    expect(origem.principal).toBe(20000);
    expect(origem.totalFechamento).toBe(22551);
    expect(origem.juros).toBe(101);
    expect(origem.itens.map(i => i.cobrancaId)).toEqual([1, 2]);
    expect(origem.avisos).toEqual([]);
  });
  it("não inventa encargos nem total histórico no legado sem snapshot", () => {
    const origem = montarOrigemDividaAcordo([vinculo(1)], []);
    expect(origem.principal).toBe(10000);
    expect(origem.totalFechamento).toBeNull();
    expect(origem.multa).toBeNull();
    expect(origem.avisos.length).toBeGreaterThan(0);
  });
  it("rejeita snapshots rateados antigos mesmo quando repetidos", () => {
    const origem = montarOrigemDividaAcordo([vinculo(1), vinculo(2)], [{ ...snapshot, snapshotPrincipal: 10000 }, { ...snapshot, snapshotPrincipal: 10000 }]);
    expect(origem.totalFechamento).toBeNull();
    expect(origem.principal).toBe(20000);
  });
  it("sinaliza snapshots divergentes e não escolhe um valor arbitrário", () => {
    const origem = montarOrigemDividaAcordo([vinculo(1), vinculo(2)], [snapshot, { ...snapshot, snapshotJuros: 102 }]);
    expect(origem.juros).toBeNull();
    expect(origem.totalFechamento).toBeNull();
  });
  it("deduplica vínculos iguais sem perder dívidas diferentes do mesmo valor", () => {
    const origem = montarOrigemDividaAcordo([vinculo(1), vinculo(1), vinculo(2)], [snapshot]);
    expect(origem.quantidade).toBe(2);
    expect(origem.principal).toBe(20000);
  });
  it("não inventa data ou valor para dívida ausente ou vínculo conflitante", () => {
    const origem = montarOrigemDividaAcordo([{ ...vinculo(1), vencimento: null }, { ...vinculo(1), valorOriginal: 20000 }], []);
    expect(origem.itens[0].principal).toBeNull();
    expect(origem.principal).toBeNull();
    expect(origem.primeiroVencimento).toBeNull();
    expect(origem.avisos.length).toBeGreaterThan(0);
  });
  it("sinaliza principal zero do legado, descrição ausente e snapshots parcialmente ausentes", () => {
    const vazia = montarOrigemDividaAcordo([{ ...vinculo(1, 0), titulo: null }], []);
    expect(vazia.principal).toBeNull();
    expect(vazia.itens[0].titulo).toContain("indisponível");
    const parcial = montarOrigemDividaAcordo([vinculo(1), vinculo(2)], [snapshot, {}]);
    expect(parcial.totalFechamento).toBe(22551);
    expect(parcial.avisos.join(" ")).toContain("Algumas parcelas");
  });
  it("mantém centavos e não atribui encargos agregados às dívidas", () => {
    const origem = montarOrigemDividaAcordo([vinculo(1, 101), vinculo(2, 202)], []);
    expect(origem.principal).toBe(303);
    expect(origem.itens[0]).not.toHaveProperty("juros");
  });
});

describe("layout adaptativo da origem", () => {
  it("mantém até cinco títulos somente quando toda a tabela e ficha couberem", () => {
    expect(deveResumirOrigem(5, 160, 480, 320)).toBe(false);
    expect(deveResumirOrigem(5, 161, 480, 320)).toBe(true);
    expect(deveResumirOrigem(2, 250, 480, 320)).toBe(true);
    expect(deveResumirOrigem(6, 30, 480, 320)).toBe(true);
    expect(deveResumirOrigem(0, 30, 480, 320)).toBe(true);
  });
});
