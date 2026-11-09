import { describe, expect, it } from "vitest";
import { paginarOrigemBoleto } from "./boleto-origem-paginacao";
import type { OrigemDividaDocumento } from "./origem-divida-acordo";

const item = (id: number, titulo = `Origem ${id}`): OrigemDividaDocumento["itens"][number] => ({
  cobrancaId: id, titulo, vencimento: new Date("2026-11-09T12:00:00Z"), principal: id * 100,
});
const medir = (texto: string) => Array.from(texto).length;
const opcoes = { larguraDescricao: 100, alturaPrimeiraPagina: 44, alturaPaginasSeguintes: 66 };

describe("planejador de origem integral do boleto", () => {
  it("aproveita o restante da primeira página e não perde nem reordena itens", () => {
    const itens = [item(5), item(1), item(3), item(4)], antes = structuredClone(itens);
    const paginas = paginarOrigemBoleto(itens, medir, opcoes);
    expect(paginas.map(p => p.novaPagina)).toEqual([false, true]);
    expect(paginas.map(p => p.trechos.length)).toEqual([2, 2]);
    expect(paginas.flatMap(p => p.trechos.map(t => t.item.cobrancaId))).toEqual([5, 1, 3, 4]);
    expect(itens).toEqual(antes);
  });
  it("não cria página adicional no limite exato", () => {
    const paginas = paginarOrigemBoleto([item(1), item(2)], medir, opcoes);
    expect(paginas).toHaveLength(1);
    expect(paginas[0].trechos.reduce((s, t) => s + t.altura, 0)).toBe(44);
  });
  it("move uma linha inteira sem criar fragmento ou cabeçalho vazio", () => {
    const paginas = paginarOrigemBoleto([item(1)], medir, { ...opcoes, alturaPrimeiraPagina: 21 });
    expect(paginas).toHaveLength(1);
    expect(paginas[0].novaPagina).toBe(true);
    expect(paginas[0].trechos[0].continuacao).toBe(false);
  });
  it("origem vazia não produz páginas ou linhas", () => {
    expect(paginarOrigemBoleto([], medir, opcoes)).toEqual([]);
  });
  it("divide palavra longa sem truncar caracteres e repete identificação só nas continuações", () => {
    const origem = item(17, "ABCDEFGHIJKLMNOPQRSTUVWXYZ".repeat(10));
    const paginas = paginarOrigemBoleto([origem], medir, { ...opcoes, larguraDescricao: 30, alturaPrimeiraPagina: 40, alturaPaginasSeguintes: 60 });
    expect(paginas.length).toBeGreaterThan(2);
    const trechos = paginas.flatMap(p => p.trechos);
    expect(trechos[0].continuacao).toBe(false);
    expect(trechos.slice(1).every(t => t.continuacao && t.linhas[0] === "#17 — (continuação)")).toBe(true);
    const reconstruido = trechos.flatMap(t => t.continuacao ? t.linhas.slice(1) : t.linhas).join("");
    expect(reconstruido).toBe(`#17 — ${origem.titulo}`);
    paginas.forEach((p, indice) => expect(p.trechos.reduce((s, t) => s + t.altura, 0)).toBeLessThanOrEqual(indice === 0 ? 40 : 60));
  });
  it("mantém parágrafos, espaços e Unicode sem separar pares", () => {
    const origem = item(1, "Texto  com  espaços\nÁrvore 😀".repeat(12));
    const antes = structuredClone(origem);
    const paginas = paginarOrigemBoleto([origem], medir, { ...opcoes, larguraDescricao: 24, alturaPaginasSeguintes: 70 });
    const linhas = paginas.flatMap(p => p.trechos.flatMap(t => t.continuacao ? t.linhas.slice(1) : t.linhas));
    expect(linhas.join("")).toBe(`#1 — ${origem.titulo.replace(/\n/g, "")}`);
    expect(origem).toEqual(antes);
    expect(linhas.some(l => /[\uD800-\uDBFF]$/.test(l))).toBe(false);
  });
  it.each([0, -1, NaN, Infinity])("rejeita altura de linha inválida %s sem loop", alturaLinha => {
    expect(() => paginarOrigemBoleto([item(1)], medir, { ...opcoes, alturaLinha })).toThrow();
  });
  it("rejeita página incapaz de conter identificação e conteúdo", () => {
    expect(() => paginarOrigemBoleto([item(1)], medir, { ...opcoes, alturaPaginasSeguintes: 29 })).toThrow();
  });
  it("capacidade inicial negativa avança sem página vazia", () => {
    const paginas = paginarOrigemBoleto([item(1)], medir, { ...opcoes, alturaPrimeiraPagina: -10 });
    expect(paginas).toHaveLength(1);
    expect(paginas[0].novaPagina).toBe(true);
  });
});
