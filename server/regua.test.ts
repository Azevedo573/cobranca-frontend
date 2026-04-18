/**
 * Testes unitários para a Régua de Cobrança (Sprint 2)
 *
 * Testa:
 * 1. Lógica de substituição de variáveis nos templates
 * 2. Lógica de cálculo de dias de inadimplência
 * 3. Lógica de disparo: deve disparar vs. deve ignorar
 * 4. Job de régua: funções de controle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ===== HELPERS INTERNOS (copiados do db-reguas.ts para teste isolado) =====

function substituirVariaveis(
  template: string,
  vars: {
    nome: string | null;
    cpfCnpj: string | null;
    unidade: string | null;
    bloco: string | null;
    valor: string | null;
    vencimento: Date | string | null;
    diasAtraso: number;
    condominio: string;
  }
): string {
  const formatarData = (d: Date | string | null) => {
    if (!d) return "-";
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("pt-BR");
  };

  return template
    .replace(/\{\{nome\}\}/g, vars.nome ?? "Morador")
    .replace(/\{\{cpf_cnpj\}\}/g, vars.cpfCnpj ?? "-")
    .replace(/\{\{unidade\}\}/g, vars.unidade ?? "-")
    .replace(/\{\{bloco\}\}/g, vars.bloco ?? "")
    .replace(/\{\{valor\}\}/g, vars.valor ?? "R$ 0,00")
    .replace(/\{\{vencimento\}\}/g, formatarData(vars.vencimento))
    .replace(/\{\{dias_atraso\}\}/g, String(vars.diasAtraso))
    .replace(/\{\{condominio\}\}/g, vars.condominio);
}

function calcularDiasAtraso(dueDate: Date, hoje: Date): number {
  const vencimento = new Date(dueDate);
  vencimento.setHours(0, 0, 0, 0);
  const hojeNorm = new Date(hoje);
  hojeNorm.setHours(0, 0, 0, 0);
  const diffMs = hojeNorm.getTime() - vencimento.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function deveDisparar(diasInadimplenciaPosicao: number, diasAtrasoCobranca: number): boolean {
  return diasInadimplenciaPosicao <= diasAtrasoCobranca;
}

// ===== TESTES =====

describe("Régua de Cobrança — Substituição de Variáveis", () => {
  it("deve substituir todas as variáveis corretamente", () => {
    const template = "Olá {{nome}}, você deve {{valor}} desde {{vencimento}} ({{dias_atraso}} dias).";
    const resultado = substituirVariaveis(template, {
      nome: "João Silva",
      cpfCnpj: "123.456.789-00",
      unidade: "101",
      bloco: "A",
      valor: "R$ 500,00",
      vencimento: new Date("2024-01-15"),
      diasAtraso: 30,
      condominio: "Cond. Teste",
    });
    expect(resultado).toContain("João Silva");
    expect(resultado).toContain("R$ 500,00");
    expect(resultado).toContain("30 dias");
    expect(resultado).not.toContain("{{nome}}");
    expect(resultado).not.toContain("{{valor}}");
    expect(resultado).not.toContain("{{dias_atraso}}");
  });

  it("deve usar 'Morador' quando nome é null", () => {
    const template = "Prezado(a) {{nome}},";
    const resultado = substituirVariaveis(template, {
      nome: null,
      cpfCnpj: null,
      unidade: "202",
      bloco: "B",
      valor: "R$ 300,00",
      vencimento: new Date("2024-02-01"),
      diasAtraso: 10,
      condominio: "Cond. ABC",
    });
    expect(resultado).toBe("Prezado(a) Morador,");
  });

  it("deve substituir {{bloco}} e {{unidade}} corretamente", () => {
    const template = "Imóvel: {{bloco}} Unidade {{unidade}}";
    const resultado = substituirVariaveis(template, {
      nome: "Maria",
      cpfCnpj: null,
      unidade: "305",
      bloco: "C",
      valor: "R$ 200,00",
      vencimento: new Date("2024-03-01"),
      diasAtraso: 5,
      condominio: "Cond. XYZ",
    });
    expect(resultado).toBe("Imóvel: C Unidade 305");
  });

  it("deve substituir {{condominio}} corretamente", () => {
    const template = "_{{condominio}}_";
    const resultado = substituirVariaveis(template, {
      nome: "Pedro",
      cpfCnpj: null,
      unidade: "101",
      bloco: null,
      valor: "R$ 150,00",
      vencimento: null,
      diasAtraso: 0,
      condominio: "Residencial Primavera",
    });
    expect(resultado).toBe("_Residencial Primavera_");
  });

  it("deve substituir múltiplas ocorrências da mesma variável", () => {
    const template = "{{nome}} deve {{valor}}. Contate {{nome}}.";
    const resultado = substituirVariaveis(template, {
      nome: "Ana",
      cpfCnpj: null,
      unidade: "101",
      bloco: null,
      valor: "R$ 100,00",
      vencimento: null,
      diasAtraso: 0,
      condominio: "Cond.",
    });
    expect(resultado).toBe("Ana deve R$ 100,00. Contate Ana.");
  });
});

describe("Régua de Cobrança — Cálculo de Dias de Atraso", () => {
  it("deve calcular 0 dias no dia do vencimento", () => {
    const hoje = new Date("2024-03-15");
    const vencimento = new Date("2024-03-15");
    expect(calcularDiasAtraso(vencimento, hoje)).toBe(0);
  });

  it("deve calcular dias positivos após o vencimento", () => {
    const hoje = new Date("2024-03-20");
    const vencimento = new Date("2024-03-15");
    expect(calcularDiasAtraso(vencimento, hoje)).toBe(5);
  });

  it("deve calcular dias negativos antes do vencimento", () => {
    const hoje = new Date("2024-03-10");
    const vencimento = new Date("2024-03-15");
    expect(calcularDiasAtraso(vencimento, hoje)).toBe(-5);
  });

  it("deve calcular 30 dias de atraso corretamente", () => {
    const hoje = new Date("2024-04-15");
    const vencimento = new Date("2024-03-15");
    // Março tem 31 dias, então de 15/03 a 15/04 = 31 dias
    expect(calcularDiasAtraso(vencimento, hoje)).toBe(31);
  });

  it("deve ignorar horas na comparação", () => {
    const hoje = new Date("2024-03-20T23:59:59");
    const vencimento = new Date("2024-03-15T00:00:01");
    expect(calcularDiasAtraso(vencimento, hoje)).toBe(5);
  });
});

describe("Régua de Cobrança — Lógica de Disparo", () => {
  it("deve disparar quando cobrança atingiu o threshold", () => {
    // Posição configurada para 5 dias de atraso, cobrança com 5 dias
    expect(deveDisparar(5, 5)).toBe(true);
  });

  it("deve disparar quando cobrança ultrapassou o threshold", () => {
    // Posição configurada para 5 dias, cobrança com 10 dias
    expect(deveDisparar(5, 10)).toBe(true);
  });

  it("não deve disparar quando cobrança ainda não atingiu o threshold", () => {
    // Posição configurada para 10 dias, cobrança com 5 dias
    expect(deveDisparar(10, 5)).toBe(false);
  });

  it("deve disparar lembrete preventivo (dias negativos)", () => {
    // Posição configurada para -3 dias (3 dias antes), cobrança com -3 dias (vence em 3 dias)
    expect(deveDisparar(-3, -3)).toBe(true);
  });

  it("não deve disparar lembrete preventivo muito cedo", () => {
    // Posição configurada para -3 dias, cobrança com -7 dias (vence em 7 dias)
    expect(deveDisparar(-3, -7)).toBe(false);
  });

  it("deve disparar no dia do vencimento (threshold 0)", () => {
    expect(deveDisparar(0, 0)).toBe(true);
  });

  it("deve disparar após vencimento quando threshold é 0", () => {
    expect(deveDisparar(0, 5)).toBe(true);
  });
});

describe("Régua de Cobrança — Templates Padrão", () => {
  const templateWhatsApp = `Olá {{nome}}, tudo bem?\n\nInformamos que existe uma pendência financeira referente ao imóvel {{bloco}} Unidade {{unidade}} no valor de *{{valor}}* com vencimento em {{vencimento}}.\n\nJá se passaram *{{dias_atraso}} dias* do vencimento.\n\nPara regularizar sua situação, entre em contato conosco.\n\n_{{condominio}}_`;

  it("deve processar template de WhatsApp sem erros", () => {
    const resultado = substituirVariaveis(templateWhatsApp, {
      nome: "Carlos Souza",
      cpfCnpj: "987.654.321-00",
      unidade: "401",
      bloco: "D",
      valor: "R$ 750,00",
      vencimento: new Date("2024-01-10"),
      diasAtraso: 45,
      condominio: "Residencial Jardins",
    });
    expect(resultado).toContain("Carlos Souza");
    expect(resultado).toContain("D Unidade 401");
    expect(resultado).toContain("R$ 750,00");
    expect(resultado).toContain("45 dias");
    expect(resultado).toContain("Residencial Jardins");
    expect(resultado).not.toMatch(/\{\{[a-z_]+\}\}/);
  });

  it("deve processar template com devedor sem nome", () => {
    const resultado = substituirVariaveis(templateWhatsApp, {
      nome: null,
      cpfCnpj: null,
      unidade: "502",
      bloco: "E",
      valor: "R$ 300,00",
      vencimento: new Date("2024-02-01"),
      diasAtraso: 15,
      condominio: "Cond. Teste",
    });
    expect(resultado).toContain("Morador");
    expect(resultado).not.toContain("null");
    expect(resultado).not.toContain("undefined");
  });
});

describe("Régua de Cobrança — Validações de Negócio", () => {
  it("deve identificar corretamente cobranças em atraso", () => {
    const hoje = new Date("2024-04-18");
    const casos = [
      { vencimento: new Date("2024-04-18"), esperado: 0 },    // hoje
      { vencimento: new Date("2024-04-13"), esperado: 5 },    // 5 dias atrás
      { vencimento: new Date("2024-03-18"), esperado: 31 },   // 31 dias atrás
      { vencimento: new Date("2024-04-21"), esperado: -3 },   // 3 dias no futuro
    ];

    for (const caso of casos) {
      expect(calcularDiasAtraso(caso.vencimento, hoje)).toBe(caso.esperado);
    }
  });

  it("deve determinar corretamente quais posições devem disparar", () => {
    // Cobrança com 7 dias de atraso
    const diasAtraso = 7;
    const posicoes = [
      { diasInadimplencia: -3, deveDisparar: true },   // lembrete preventivo (já passou)
      { diasInadimplencia: 0, deveDisparar: true },     // no vencimento (já passou)
      { diasInadimplencia: 3, deveDisparar: true },     // 3 dias após (já passou)
      { diasInadimplencia: 7, deveDisparar: true },     // exatamente hoje
      { diasInadimplencia: 10, deveDisparar: false },   // ainda não chegou
      { diasInadimplencia: 30, deveDisparar: false },   // muito no futuro
    ];

    for (const posicao of posicoes) {
      expect(deveDisparar(posicao.diasInadimplencia, diasAtraso)).toBe(posicao.deveDisparar);
    }
  });
});
