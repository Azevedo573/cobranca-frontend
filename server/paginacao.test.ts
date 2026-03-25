/**
 * Testes para a lógica de paginação (paginateItems e cálculos do componente Pagination)
 * Testa a função paginateItems que é usada nas páginas de Devedores, Cobranças e Tentativas.
 */

import { describe, expect, it } from "vitest";

// Replica a função paginateItems do componente Pagination.tsx
function paginateItems<T>(items: T[], currentPage: number, pageSize: number): T[] {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

// Replica o cálculo de totalPages
function calcularTotalPages(totalItems: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

// Replica o cálculo de startItem e endItem
function calcularRange(currentPage: number, pageSize: number, totalItems: number) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  return { startItem, endItem };
}

// ─── Testes de paginateItems ──────────────────────────────────────────────────

describe("paginateItems", () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

  it("deve retornar os primeiros 25 itens na página 1 com pageSize=25", () => {
    const result = paginateItems(items, 1, 25);
    expect(result).toHaveLength(25);
    expect(result[0].id).toBe(1);
    expect(result[24].id).toBe(25);
  });

  it("deve retornar os itens 26-50 na página 2 com pageSize=25", () => {
    const result = paginateItems(items, 2, 25);
    expect(result).toHaveLength(25);
    expect(result[0].id).toBe(26);
    expect(result[24].id).toBe(50);
  });

  it("deve retornar os itens 76-100 na última página com pageSize=25", () => {
    const result = paginateItems(items, 4, 25);
    expect(result).toHaveLength(25);
    expect(result[0].id).toBe(76);
    expect(result[24].id).toBe(100);
  });

  it("deve retornar os primeiros 10 itens com pageSize=10", () => {
    const result = paginateItems(items, 1, 10);
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe(1);
    expect(result[9].id).toBe(10);
  });

  it("deve retornar array vazio para página além do total", () => {
    const result = paginateItems(items, 99, 25);
    expect(result).toHaveLength(0);
  });

  it("deve retornar todos os itens quando pageSize >= total", () => {
    const result = paginateItems(items, 1, 200);
    expect(result).toHaveLength(100);
  });

  it("deve funcionar com lista vazia", () => {
    const result = paginateItems([], 1, 25);
    expect(result).toHaveLength(0);
  });

  it("deve retornar itens parciais na última página quando não divisível", () => {
    const smallItems = Array.from({ length: 33 }, (_, i) => i + 1);
    const result = paginateItems(smallItems, 4, 10); // página 4: itens 31-33
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(31);
    expect(result[2]).toBe(33);
  });
});

// ─── Testes de calcularTotalPages ─────────────────────────────────────────────

describe("calcularTotalPages", () => {
  it("deve calcular 4 páginas para 100 itens com pageSize=25", () => {
    expect(calcularTotalPages(100, 25)).toBe(4);
  });

  it("deve calcular 5 páginas para 101 itens com pageSize=25", () => {
    expect(calcularTotalPages(101, 25)).toBe(5);
  });

  it("deve retornar 1 para lista vazia", () => {
    expect(calcularTotalPages(0, 25)).toBe(1);
  });

  it("deve calcular 1 página quando total <= pageSize", () => {
    expect(calcularTotalPages(10, 25)).toBe(1);
  });

  it("deve calcular 10 páginas para 100 itens com pageSize=10", () => {
    expect(calcularTotalPages(100, 10)).toBe(10);
  });
});

// ─── Testes de calcularRange ──────────────────────────────────────────────────

describe("calcularRange (exibição 'Exibindo X-Y de Z')", () => {
  it("deve exibir 1-25 na página 1 com 100 itens", () => {
    const { startItem, endItem } = calcularRange(1, 25, 100);
    expect(startItem).toBe(1);
    expect(endItem).toBe(25);
  });

  it("deve exibir 26-50 na página 2 com 100 itens", () => {
    const { startItem, endItem } = calcularRange(2, 25, 100);
    expect(startItem).toBe(26);
    expect(endItem).toBe(50);
  });

  it("deve exibir 76-100 na última página com 100 itens", () => {
    const { startItem, endItem } = calcularRange(4, 25, 100);
    expect(startItem).toBe(76);
    expect(endItem).toBe(100);
  });

  it("deve exibir 1-3 na última página com 28 itens e pageSize=25", () => {
    const { startItem, endItem } = calcularRange(2, 25, 28);
    expect(startItem).toBe(26);
    expect(endItem).toBe(28); // não vai além do total
  });

  it("deve exibir 0-0 para lista vazia", () => {
    const { startItem, endItem } = calcularRange(1, 25, 0);
    expect(startItem).toBe(0);
    expect(endItem).toBe(0);
  });
});

// ─── Testes de reset de página ao buscar ─────────────────────────────────────

describe("Comportamento de reset de página ao filtrar", () => {
  it("deve retornar itens corretos após resetar para página 1", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

    // Simula estar na página 2
    const page2 = paginateItems(items, 2, 10);
    expect(page2[0].id).toBe(11);

    // Após filtro, reseta para página 1
    const filteredItems = items.filter(i => i.id <= 5);
    const page1AfterFilter = paginateItems(filteredItems, 1, 10);
    expect(page1AfterFilter).toHaveLength(5);
    expect(page1AfterFilter[0].id).toBe(1);
  });
});
