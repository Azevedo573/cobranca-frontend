/**
 * Testes unitários — Módulo de Operações de Cobrança
 * Cobre: lógica de priorização da fila ativa, busca de devedor passivo,
 *        validação de inputs e utilitários de formatação.
 */
import { describe, it, expect } from "vitest";

// ─── Utilitários de priorização ───────────────────────────────────────────────

/**
 * Ordena devedores por score decrescente (maior score = maior prioridade).
 * Empate: desempata por diasMaxAtraso decrescente.
 */
function ordenarFilaPorPrioridade(
  devedores: Array<{ id: number; score: number; diasMaxAtraso: number }>
) {
  return [...devedores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.diasMaxAtraso - a.diasMaxAtraso;
  });
}

/**
 * Calcula o score de prioridade de um devedor baseado em:
 * - Valor total devido (peso 0.4)
 * - Dias em atraso (peso 0.4)
 * - Número de cobranças pendentes (peso 0.2)
 */
function calcularScorePrioridade(
  valorTotalDevido: number,
  diasMaxAtraso: number,
  totalCobrancasPendentes: number
): number {
  const scoreValor = Math.min(valorTotalDevido / 10000, 1) * 100 * 0.4;
  const scoreDias = Math.min(diasMaxAtraso / 365, 1) * 100 * 0.4;
  const scoreCobs = Math.min(totalCobrancasPendentes / 10, 1) * 100 * 0.2;
  return Math.round(scoreValor + scoreDias + scoreCobs);
}

/**
 * Filtra devedores da fila que não tiveram tentativa nos últimos N dias.
 */
function filtrarSemTentativaRecente(
  devedores: Array<{
    id: number;
    ultimaTentativa: { attemptDate: Date } | null;
  }>,
  diasCarencia = 3
): typeof devedores {
  const agora = new Date();
  return devedores.filter((d) => {
    if (!d.ultimaTentativa) return true;
    const diffMs = agora.getTime() - new Date(d.ultimaTentativa.attemptDate).getTime();
    const diffDias = diffMs / (1000 * 60 * 60 * 24);
    return diffDias >= diasCarencia;
  });
}

/**
 * Normaliza termo de busca: remove pontuação e converte para minúsculas.
 */
function normalizarTermoBusca(termo: string): string {
  return termo
    .toLowerCase()
    .replace(/[.\-/]/g, "")
    .trim();
}

/**
 * Verifica se um devedor corresponde ao termo de busca (nome, CPF/CNPJ, unidade, telefone).
 */
function devedorCorrespondeTermo(
  devedor: { name: string; cpfCnpj: string; unitNumber: string; phone: string },
  termo: string
): boolean {
  const t = normalizarTermoBusca(termo);
  return (
    devedor.name.toLowerCase().includes(t) ||
    normalizarTermoBusca(devedor.cpfCnpj).includes(t) ||
    devedor.unitNumber.toLowerCase().includes(t) ||
    devedor.phone.replace(/\D/g, "").includes(t.replace(/\D/g, ""))
  );
}

/**
 * Formata o resultado de uma ação de cobrança ativa para exibição.
 */
function formatarResultadoAcao(result: string): string {
  const labels: Record<string, string> = {
    sem_resposta: "Sem resposta",
    promessa_pagamento: "Promessa de pagamento",
    deseja_acordo: "Deseja acordo",
    recusa: "Recusa",
    outro: "Outro",
  };
  return labels[result] ?? result;
}

/**
 * Formata o tipo de contato para exibição.
 */
function formatarTipoContato(tipo: string): string {
  const labels: Record<string, string> = {
    telefone: "Telefone",
    email: "E-mail",
    pessoal: "Pessoal",
    whatsapp: "WhatsApp",
  };
  return labels[tipo] ?? tipo;
}

/**
 * Monta nota de contato passivo com proposta do devedor.
 */
function montarNotaContatoPassivo(propostaDevedor?: string, obs?: string): string {
  if (propostaDevedor) {
    return `[CONTATO PASSIVO] Proposta do devedor: ${propostaDevedor}${obs ? ` | Obs: ${obs}` : ""}`;
  }
  return `[CONTATO PASSIVO]${obs ? ` ${obs}` : ""}`;
}

// ─── Testes: Priorização da Fila Ativa ────────────────────────────────────────

describe("Fila de Cobrança Ativa — Priorização", () => {
  describe("ordenarFilaPorPrioridade", () => {
    it("ordena por score decrescente", () => {
      const devedores = [
        { id: 1, score: 30, diasMaxAtraso: 60 },
        { id: 2, score: 90, diasMaxAtraso: 120 },
        { id: 3, score: 60, diasMaxAtraso: 90 },
      ];
      const ordenados = ordenarFilaPorPrioridade(devedores);
      expect(ordenados.map((d) => d.id)).toEqual([2, 3, 1]);
    });

    it("desempata por diasMaxAtraso quando scores são iguais", () => {
      const devedores = [
        { id: 1, score: 50, diasMaxAtraso: 30 },
        { id: 2, score: 50, diasMaxAtraso: 90 },
        { id: 3, score: 50, diasMaxAtraso: 60 },
      ];
      const ordenados = ordenarFilaPorPrioridade(devedores);
      expect(ordenados.map((d) => d.id)).toEqual([2, 3, 1]);
    });

    it("retorna lista vazia sem erros", () => {
      expect(ordenarFilaPorPrioridade([])).toEqual([]);
    });

    it("não modifica o array original", () => {
      const original = [
        { id: 1, score: 10, diasMaxAtraso: 10 },
        { id: 2, score: 50, diasMaxAtraso: 50 },
      ];
      const copia = [...original];
      ordenarFilaPorPrioridade(original);
      expect(original).toEqual(copia);
    });
  });

  describe("calcularScorePrioridade", () => {
    it("retorna 0 para devedor sem dívidas e sem atraso", () => {
      expect(calcularScorePrioridade(0, 0, 0)).toBe(0);
    });

    it("valor máximo de R$ 10.000 gera score de valor 40", () => {
      // 10000/10000 * 100 * 0.4 = 40
      const score = calcularScorePrioridade(10000, 0, 0);
      expect(score).toBe(40);
    });

    it("365 dias de atraso gera score de dias 40", () => {
      // 365/365 * 100 * 0.4 = 40
      const score = calcularScorePrioridade(0, 365, 0);
      expect(score).toBe(40);
    });

    it("10 cobranças pendentes gera score de cobranças 20", () => {
      // min(10/10, 1) * 100 * 0.2 = 20
      const score = calcularScorePrioridade(0, 0, 10);
      expect(score).toBe(20);
    });

    it("score máximo é 100 para valores extremos", () => {
      const score = calcularScorePrioridade(100000, 3650, 100);
      expect(score).toBe(100);
    });

    it("calcula corretamente para caso típico", () => {
      // Valor: 5000/10000 * 100 * 0.4 = 20
      // Dias: 180/365 * 100 * 0.4 ≈ 19.7 → arredondado
      // Cobs: 3*10 = 30 * 0.2 = 6
      const score = calcularScorePrioridade(5000, 180, 3);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe("filtrarSemTentativaRecente", () => {
    it("inclui devedor sem tentativa anterior", () => {
      const devedores = [{ id: 1, ultimaTentativa: null }];
      expect(filtrarSemTentativaRecente(devedores)).toHaveLength(1);
    });

    it("exclui devedor com tentativa há 1 dia (carência de 3 dias)", () => {
      const ontem = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const devedores = [{ id: 1, ultimaTentativa: { attemptDate: ontem } }];
      expect(filtrarSemTentativaRecente(devedores, 3)).toHaveLength(0);
    });

    it("inclui devedor com tentativa há 5 dias (carência de 3 dias)", () => {
      const cincoAtras = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const devedores = [{ id: 1, ultimaTentativa: { attemptDate: cincoAtras } }];
      expect(filtrarSemTentativaRecente(devedores, 3)).toHaveLength(1);
    });

    it("filtra corretamente lista mista", () => {
      const ontem = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const semanaAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const devedores = [
        { id: 1, ultimaTentativa: null },
        { id: 2, ultimaTentativa: { attemptDate: ontem } },
        { id: 3, ultimaTentativa: { attemptDate: semanaAtras } },
      ];
      const filtrados = filtrarSemTentativaRecente(devedores, 3);
      expect(filtrados.map((d) => d.id)).toEqual([1, 3]);
    });
  });
});

// ─── Testes: Busca de Devedor Passivo ─────────────────────────────────────────

describe("Cobrança Passiva — Busca de Devedor", () => {
  describe("normalizarTermoBusca", () => {
    it("converte para minúsculas", () => {
      expect(normalizarTermoBusca("JOÃO SILVA")).toBe("joão silva");
    });

    it("remove pontos, hífens e barras do CPF/CNPJ", () => {
      expect(normalizarTermoBusca("123.456.789-09")).toBe("12345678909");
    });

    it("remove espaços extras nas bordas", () => {
      expect(normalizarTermoBusca("  silva  ")).toBe("silva");
    });
  });

  describe("devedorCorrespondeTermo", () => {
    const devedor = {
      name: "João da Silva",
      cpfCnpj: "123.456.789-09",
      unitNumber: "101",
      phone: "(11) 99999-1234",
    };

    it("encontra por nome parcial", () => {
      expect(devedorCorrespondeTermo(devedor, "silva")).toBe(true);
    });

    it("encontra por CPF sem formatação", () => {
      expect(devedorCorrespondeTermo(devedor, "12345678909")).toBe(true);
    });

    it("encontra por CPF com formatação", () => {
      expect(devedorCorrespondeTermo(devedor, "123.456.789-09")).toBe(true);
    });

    it("encontra por número de unidade", () => {
      expect(devedorCorrespondeTermo(devedor, "101")).toBe(true);
    });

    it("encontra por telefone parcial", () => {
      expect(devedorCorrespondeTermo(devedor, "99999")).toBe(true);
    });

    it("retorna false para termo sem correspondência", () => {
      expect(devedorCorrespondeTermo(devedor, "xyz000abc")).toBe(false);
    });

    it("busca é case-insensitive", () => {
      expect(devedorCorrespondeTermo(devedor, "JOÃO")).toBe(true);
    });
  });
});

// ─── Testes: Formatação de Labels ─────────────────────────────────────────────

describe("Formatação de Labels de Operações", () => {
  describe("formatarResultadoAcao", () => {
    it("formata sem_resposta", () => {
      expect(formatarResultadoAcao("sem_resposta")).toBe("Sem resposta");
    });

    it("formata promessa_pagamento", () => {
      expect(formatarResultadoAcao("promessa_pagamento")).toBe("Promessa de pagamento");
    });

    it("formata deseja_acordo", () => {
      expect(formatarResultadoAcao("deseja_acordo")).toBe("Deseja acordo");
    });

    it("formata recusa", () => {
      expect(formatarResultadoAcao("recusa")).toBe("Recusa");
    });

    it("formata outro", () => {
      expect(formatarResultadoAcao("outro")).toBe("Outro");
    });

    it("retorna o próprio valor para resultado desconhecido", () => {
      expect(formatarResultadoAcao("desconhecido")).toBe("desconhecido");
    });
  });

  describe("formatarTipoContato", () => {
    it("formata telefone", () => {
      expect(formatarTipoContato("telefone")).toBe("Telefone");
    });

    it("formata email", () => {
      expect(formatarTipoContato("email")).toBe("E-mail");
    });

    it("formata pessoal", () => {
      expect(formatarTipoContato("pessoal")).toBe("Pessoal");
    });

    it("formata whatsapp", () => {
      expect(formatarTipoContato("whatsapp")).toBe("WhatsApp");
    });

    it("retorna o próprio valor para tipo desconhecido", () => {
      expect(formatarTipoContato("sms")).toBe("sms");
    });
  });
});

// ─── Testes: Nota de Contato Passivo ──────────────────────────────────────────

describe("Nota de Contato Passivo", () => {
  it("gera nota com proposta do devedor", () => {
    const nota = montarNotaContatoPassivo("Quer pagar em 3x");
    expect(nota).toBe("[CONTATO PASSIVO] Proposta do devedor: Quer pagar em 3x");
  });

  it("gera nota com proposta e observação", () => {
    const nota = montarNotaContatoPassivo("Quer pagar em 3x", "Ligou às 14h");
    expect(nota).toBe("[CONTATO PASSIVO] Proposta do devedor: Quer pagar em 3x | Obs: Ligou às 14h");
  });

  it("gera nota sem proposta", () => {
    const nota = montarNotaContatoPassivo(undefined, undefined);
    expect(nota).toBe("[CONTATO PASSIVO]");
  });

  it("gera nota sem proposta mas com observação", () => {
    const nota = montarNotaContatoPassivo(undefined, "Devedor veio pessoalmente");
    expect(nota).toBe("[CONTATO PASSIVO] Devedor veio pessoalmente");
  });

  it("nota sempre começa com [CONTATO PASSIVO]", () => {
    const nota1 = montarNotaContatoPassivo("proposta");
    const nota2 = montarNotaContatoPassivo();
    expect(nota1.startsWith("[CONTATO PASSIVO]")).toBe(true);
    expect(nota2.startsWith("[CONTATO PASSIVO]")).toBe(true);
  });
});

// ─── Testes: Validação de Inputs ──────────────────────────────────────────────

describe("Validação de Inputs de Operações", () => {
  const tiposContatoValidos = ["telefone", "email", "pessoal", "whatsapp"] as const;
  const resultadosValidos = [
    "sem_resposta",
    "promessa_pagamento",
    "deseja_acordo",
    "recusa",
    "outro",
  ] as const;

  it("todos os tipos de contato são válidos", () => {
    tiposContatoValidos.forEach((tipo) => {
      expect(formatarTipoContato(tipo)).not.toBe(tipo);
    });
  });

  it("todos os resultados de ação têm label", () => {
    resultadosValidos.forEach((resultado) => {
      const label = formatarResultadoAcao(resultado);
      expect(label).not.toBe(resultado); // label é diferente do valor interno
    });
  });

  it("termo de busca muito curto deve ser rejeitado (< 2 chars)", () => {
    const termoValido = (termo: string) => termo.trim().length >= 2;
    expect(termoValido("a")).toBe(false);
    expect(termoValido("ab")).toBe(true);
    expect(termoValido("")).toBe(false);
  });

  it("limite da fila deve estar entre 1 e 200", () => {
    const limiteValido = (limite: number) => limite >= 1 && limite <= 200;
    expect(limiteValido(0)).toBe(false);
    expect(limiteValido(1)).toBe(true);
    expect(limiteValido(50)).toBe(true);
    expect(limiteValido(200)).toBe(true);
    expect(limiteValido(201)).toBe(false);
  });
});
