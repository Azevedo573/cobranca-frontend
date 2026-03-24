/**
 * Testes para:
 * 1. Busca por CPF/CNPJ na listagem de devedores (lógica de filtragem)
 * 2. Exportação Excel nas páginas de Cobranças e Tentativas (endpoints backend)
 */

import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAuthContext(role: "admin" | "sindico" | "cobrador", condominioId?: number): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role,
      condominioId: condominioId ?? (role !== "admin" ? 1 : undefined),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ─── Busca por CPF/CNPJ (lógica de filtragem no frontend) ────────────────────

describe("Busca por CPF/CNPJ - lógica de filtragem", () => {
  // Simular a função de normalização de documento
  const normalizarDocumento = (doc: string) => doc.replace(/[.\-\/]/g, "");

  // Simular a função de filtro usada no componente Devedores.tsx
  const filtrarDevedores = (devedores: any[], searchTerm: string) => {
    const termo = searchTerm.toLowerCase();
    const termoNormalizado = normalizarDocumento(searchTerm);
    return devedores.filter(dev =>
      (dev.name?.toLowerCase() || "").includes(termo) ||
      dev.unitNumber.toLowerCase().includes(termo) ||
      (dev.bloco?.toLowerCase() || "").includes(termo) ||
      (dev.cpfCnpj && (
        dev.cpfCnpj.toLowerCase().includes(termo) ||
        normalizarDocumento(dev.cpfCnpj).includes(termoNormalizado)
      ))
    );
  };

  const devedoresMock = [
    { id: 1, name: "João Silva", unitNumber: "101", bloco: "A", cpfCnpj: "123.456.789-00" },
    { id: 2, name: "Maria Santos", unitNumber: "202", bloco: "B", cpfCnpj: "987.654.321-00" },
    { id: 3, name: null, unitNumber: "303", bloco: "C", cpfCnpj: "12.345.678/0001-90" },
    { id: 4, name: "Pedro Costa", unitNumber: "404", bloco: null, cpfCnpj: null },
  ];

  it("deve encontrar devedor pelo CPF formatado (com pontos e traço)", () => {
    const resultado = filtrarDevedores(devedoresMock, "123.456.789-00");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
  });

  it("deve encontrar devedor pelo CPF sem formatação (apenas números)", () => {
    const resultado = filtrarDevedores(devedoresMock, "12345678900");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
  });

  it("deve encontrar devedor pelo CNPJ formatado", () => {
    const resultado = filtrarDevedores(devedoresMock, "12.345.678/0001-90");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(3);
  });

  it("deve encontrar devedor pelo CNPJ sem formatação", () => {
    const resultado = filtrarDevedores(devedoresMock, "12345678000190");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(3);
  });

  it("deve encontrar devedor por fragmento do CPF", () => {
    const resultado = filtrarDevedores(devedoresMock, "987.654");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(2);
  });

  it("deve continuar encontrando por nome", () => {
    const resultado = filtrarDevedores(devedoresMock, "joão");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(1);
  });

  it("deve continuar encontrando por unidade", () => {
    const resultado = filtrarDevedores(devedoresMock, "303");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(3);
  });

  it("não deve falhar quando cpfCnpj é null", () => {
    const resultado = filtrarDevedores(devedoresMock, "Pedro");
    expect(resultado).toHaveLength(1);
    expect(resultado[0].id).toBe(4);
  });

  it("deve retornar lista vazia quando não há correspondência", () => {
    const resultado = filtrarDevedores(devedoresMock, "999.999.999-99");
    expect(resultado).toHaveLength(0);
  });
});

// ─── Exportação Excel - Cobranças e Tentativas ────────────────────────────────

describe("Exportação Excel - Cobranças", () => {
  it("deve exportar cobranças para admin com condominioId", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({ condominioId: 1 });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("cobrancas");
    expect(result.filename).toContain(".xlsx");
  });

  it("deve exportar cobranças para síndico sem precisar de condominioId", async () => {
    const ctx = createAuthContext("sindico", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({});

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
  });

  it("deve incluir data atual no nome do arquivo de cobranças", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.cobrancas({ condominioId: 1 });
    const hoje = new Date().toISOString().split("T")[0];

    expect(result.filename).toContain(hoje);
  });
});

describe("Exportação Excel - Tentativas", () => {
  it("deve exportar tentativas para admin com condominioId", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({ condominioId: 1 });

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
    expect(result.filename).toContain("tentativas");
    expect(result.filename).toContain(".xlsx");
  });

  it("deve exportar tentativas para síndico sem precisar de condominioId", async () => {
    const ctx = createAuthContext("sindico", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({});

    expect(result.success).toBe(true);
    expect(result.base64).toBeTruthy();
  });

  it("deve incluir data atual no nome do arquivo de tentativas", async () => {
    const ctx = createAuthContext("admin");
    const caller = appRouter.createCaller(ctx);

    const result = await caller.exportacao.tentativas({ condominioId: 1 });
    const hoje = new Date().toISOString().split("T")[0];

    expect(result.filename).toContain(hoje);
  });
});
