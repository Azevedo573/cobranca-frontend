/**
 * Testes: Fluxo Acordo → Boleto CNAB 240
 * Cobre geração de nosso número, montagem de TituloRemessa para parcelas,
 * e lógica de baixa de parcelas no retorno.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers reutilizados do db-cnab ─────────────────────────────────────────

function padLeft(str: string, len: number, char = "0"): string {
  return str.toString().padStart(len, char);
}

function padRight(str: string, len: number, char = " "): string {
  return str.toString().padEnd(len, char);
}

// ─── Geração de Nosso Número ─────────────────────────────────────────────────

describe("Geração de Nosso Número para Parcelas de Acordo", () => {
  function gerarNossoNumero(base: number, offset: number): string {
    return String(base + offset).padStart(10, "0");
  }

  it("gera nosso número com 10 dígitos", () => {
    const nn = gerarNossoNumero(1000000001, 0);
    expect(nn).toHaveLength(10);
    expect(nn).toBe("1000000001");
  });

  it("incrementa corretamente para múltiplas parcelas", () => {
    const base = 1000000409;
    const parcelas = [0, 1, 2, 3].map(i => gerarNossoNumero(base, i));
    expect(parcelas).toEqual([
      "1000000409",
      "1000000410",
      "1000000411",
      "1000000412",
    ]);
  });

  it("mantém zeros à esquerda para números pequenos", () => {
    const nn = gerarNossoNumero(1, 0);
    expect(nn).toBe("0000000001");
    expect(nn).toHaveLength(10);
  });

  it("não excede 10 dígitos para números grandes", () => {
    const nn = gerarNossoNumero(9999999999, 0);
    expect(nn).toBe("9999999999");
    expect(nn).toHaveLength(10);
  });
});

// ─── Montagem de TituloRemessa a partir de Parcela de Acordo ─────────────────

interface TituloRemessa {
  cobrancaId: number;
  nossoNumero: string;
  devedorNome: string;
  devedorCpfCnpj: string;
  devedorEndereco: string;
  devedorCidade: string;
  devedorUF: string;
  devedorCEP: string;
  valorNominal: number;
  dataVencimento: Date;
  dataEmissao: Date;
  instrucao1: string;
  instrucao2: string;
  carteira?: string;
  especieDocumento?: string;
  aceite?: string;
  taxaJurosDia?: number;
  taxaMulta?: number;
  enviarProtesto?: boolean;
}

function montarTituloParaParcela(params: {
  parcelaId: number;
  nossoNumero: string;
  amount: number;
  dueDate: Date;
  devedorNome: string | null;
  devedorCpfCnpj: string | null;
  taxaJurosDia: number;
  taxaMulta: number;
  instrucoesCaixa: string;
  localPagamento: string;
  carteira: string;
  aceite: string;
  enviarProtesto: boolean;
}): TituloRemessa {
  return {
    cobrancaId: params.parcelaId,
    nossoNumero: params.nossoNumero,
    devedorNome: params.devedorNome || "NAO INFORMADO",
    devedorCpfCnpj: params.devedorCpfCnpj || "",
    devedorEndereco: "",
    devedorCidade: "",
    devedorUF: "",
    devedorCEP: "",
    valorNominal: params.amount,
    dataVencimento: params.dueDate,
    dataEmissao: new Date(),
    instrucao1: params.instrucoesCaixa,
    instrucao2: params.localPagamento,
    taxaJurosDia: params.taxaJurosDia,
    taxaMulta: params.taxaMulta,
    carteira: params.carteira,
    aceite: params.aceite,
    enviarProtesto: params.enviarProtesto,
  };
}

describe("Montagem de TituloRemessa para Parcelas de Acordo", () => {
  const baseParams = {
    parcelaId: 42,
    nossoNumero: "1000000409",
    amount: 150000, // R$ 1.500,00
    dueDate: new Date("2025-07-10"),
    devedorNome: "JOAO DA SILVA",
    devedorCpfCnpj: "123.456.789-00",
    taxaJurosDia: 33, // 0,033% em centavos
    taxaMulta: 200,   // 2,00% em centavos
    instrucoesCaixa: "APOS VENCIMENTO COBRAR MULTA DE 2% E MORA DE 0,033% AO DIA",
    localPagamento: "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO",
    carteira: "1",
    aceite: "N",
    enviarProtesto: false,
  };

  it("monta título com campos obrigatórios corretos", () => {
    const titulo = montarTituloParaParcela(baseParams);
    expect(titulo.cobrancaId).toBe(42);
    expect(titulo.nossoNumero).toBe("1000000409");
    expect(titulo.valorNominal).toBe(150000);
    expect(titulo.devedorNome).toBe("JOAO DA SILVA");
  });

  it("usa 'NAO INFORMADO' quando devedor não tem nome", () => {
    const titulo = montarTituloParaParcela({ ...baseParams, devedorNome: null });
    expect(titulo.devedorNome).toBe("NAO INFORMADO");
  });

  it("usa string vazia quando CPF/CNPJ não informado", () => {
    const titulo = montarTituloParaParcela({ ...baseParams, devedorCpfCnpj: null });
    expect(titulo.devedorCpfCnpj).toBe("");
  });

  it("campos de endereço ficam vazios (devedor não tem endereço no schema)", () => {
    const titulo = montarTituloParaParcela(baseParams);
    expect(titulo.devedorEndereco).toBe("");
    expect(titulo.devedorCidade).toBe("");
    expect(titulo.devedorUF).toBe("");
    expect(titulo.devedorCEP).toBe("");
  });

  it("propaga taxas de juros e multa corretamente", () => {
    const titulo = montarTituloParaParcela(baseParams);
    expect(titulo.taxaJurosDia).toBe(33);
    expect(titulo.taxaMulta).toBe(200);
  });

  it("propaga carteira e aceite da configuração", () => {
    const titulo = montarTituloParaParcela(baseParams);
    expect(titulo.carteira).toBe("1");
    expect(titulo.aceite).toBe("N");
  });

  it("instrucao1 contém as instruções de caixa", () => {
    const titulo = montarTituloParaParcela(baseParams);
    expect(titulo.instrucao1).toContain("MULTA DE 2%");
    expect(titulo.instrucao1).toContain("0,033%");
  });
});

// ─── Substituição de variáveis nas instruções de caixa ───────────────────────

describe("Substituição de variáveis nas instruções de caixa", () => {
  function resolverInstrucoes(template: string, taxaMulta: string, taxaJurosDia: string): string {
    return template
      .replace("#MULTA#", taxaMulta + "%")
      .replace("#JUROS#", taxaJurosDia + "% ao dia");
  }

  it("substitui #MULTA# e #JUROS# corretamente", () => {
    const resultado = resolverInstrucoes(
      "APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#",
      "2.00",
      "0.03330"
    );
    expect(resultado).toBe("APOS VENCIMENTO COBRAR MULTA DE 2.00% e MORA DIARIA DE 0.03330% ao dia");
  });

  it("não altera template sem variáveis", () => {
    const template = "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO";
    expect(resolverInstrucoes(template, "2", "0.033")).toBe(template);
  });

  it("substitui apenas a primeira ocorrência de cada variável", () => {
    const resultado = resolverInstrucoes("MULTA #MULTA# + #MULTA#", "2", "0.033");
    // Apenas a primeira ocorrência é substituída pelo replace padrão
    expect(resultado).toContain("2%");
  });
});

// ─── Lógica de baixa de parcelas no retorno ──────────────────────────────────

describe("Lógica de baixa de parcelas pelo nosso número no retorno", () => {
  interface Parcela {
    id: number;
    acordoId: number;
    nossoNumero: string;
    status: "pendente" | "pago" | "atrasado";
    statusRemessa: string | null;
  }

  function processarBaixaParcela(
    parcelas: Parcela[],
    nossoNumero: string,
    dataPagamento: Date
  ): { parcelas: Parcela[]; baixada: boolean; acordoPago: boolean } {
    const idx = parcelas.findIndex(p => p.nossoNumero === nossoNumero);
    if (idx === -1) return { parcelas, baixada: false, acordoPago: false };

    const parcelaAtualizada = parcelas[idx];
    if (parcelaAtualizada.status === "pago") {
      return { parcelas, baixada: false, acordoPago: false };
    }

    const novasParcelas = parcelas.map((p, i) =>
      i === idx ? { ...p, status: "pago" as const, statusRemessa: "retorno_recebido" } : p
    );

    const todasPagas = novasParcelas
      .filter(p => p.acordoId === parcelaAtualizada.acordoId)
      .every(p => p.status === "pago");

    return { parcelas: novasParcelas, baixada: true, acordoPago: todasPagas };
  }

  const parcelasBase: Parcela[] = [
    { id: 1, acordoId: 10, nossoNumero: "1000000409", status: "pendente", statusRemessa: "remessa_gerada" },
    { id: 2, acordoId: 10, nossoNumero: "1000000410", status: "pendente", statusRemessa: "remessa_gerada" },
    { id: 3, acordoId: 10, nossoNumero: "1000000411", status: "pendente", statusRemessa: "remessa_gerada" },
  ];

  it("baixa a parcela correta pelo nosso número", () => {
    const { parcelas, baixada } = processarBaixaParcela(
      parcelasBase,
      "1000000409",
      new Date()
    );
    expect(baixada).toBe(true);
    expect(parcelas[0].status).toBe("pago");
    expect(parcelas[0].statusRemessa).toBe("retorno_recebido");
    // Outras parcelas não são afetadas
    expect(parcelas[1].status).toBe("pendente");
    expect(parcelas[2].status).toBe("pendente");
  });

  it("não marca acordo como pago se ainda há parcelas pendentes", () => {
    const { acordoPago } = processarBaixaParcela(
      parcelasBase,
      "1000000409",
      new Date()
    );
    expect(acordoPago).toBe(false);
  });

  it("marca acordo como pago quando todas as parcelas são baixadas", () => {
    // Baixar as 3 parcelas sequencialmente
    let estado = [...parcelasBase];
    let acordoPago = false;

    for (const nn of ["1000000409", "1000000410", "1000000411"]) {
      const resultado = processarBaixaParcela(estado, nn, new Date());
      estado = resultado.parcelas;
      acordoPago = resultado.acordoPago;
    }

    expect(acordoPago).toBe(true);
    expect(estado.every(p => p.status === "pago")).toBe(true);
  });

  it("retorna baixada=false para nosso número inexistente", () => {
    const { baixada } = processarBaixaParcela(parcelasBase, "9999999999", new Date());
    expect(baixada).toBe(false);
  });

  it("não reprocessa parcela já paga", () => {
    const parcelasComPaga: Parcela[] = [
      { ...parcelasBase[0], status: "pago" },
      ...parcelasBase.slice(1),
    ];
    const { baixada } = processarBaixaParcela(parcelasComPaga, "1000000409", new Date());
    expect(baixada).toBe(false);
  });

  it("funciona com acordos de parcela única", () => {
    const parcelaUnica: Parcela[] = [
      { id: 1, acordoId: 20, nossoNumero: "1000000500", status: "pendente", statusRemessa: "remessa_gerada" },
    ];
    const { baixada, acordoPago } = processarBaixaParcela(parcelaUnica, "1000000500", new Date());
    expect(baixada).toBe(true);
    expect(acordoPago).toBe(true);
  });
});

// ─── Validação de nosso número no segmento P do CNAB 240 ─────────────────────

describe("Nosso número no Segmento P do CNAB 240", () => {
  // Posições 183-202 do segmento P = nosso número (20 chars)
  function extrairNossoNumeroSegP(linha: string): string {
    return linha.substring(182, 202).trim();
  }

  function montarSegPSimplificado(nossoNumero: string): string {
    // Simula apenas as posições relevantes do segmento P
    const inicio = "A".repeat(182); // 182 chars antes do nosso número
    const nn = nossoNumero.padStart(20, "0");
    const fim = "B".repeat(240 - 182 - 20); // restante
    return inicio + nn + fim;
  }

  it("extrai nosso número corretamente do segmento P", () => {
    const linha = montarSegPSimplificado("1000000409");
    // O campo bruto tem 20 chars com zeros à esquerda
    expect(linha.substring(182, 202)).toBe("00000000001000000409");
    // trim() não remove zeros, apenas espaços — o campo retorna com zeros
    const extraido = extrairNossoNumeroSegP(linha);
    expect(extraido).toBe("00000000001000000409");
    // Para comparar com o banco (10 dígitos), usar substring ou replace
    expect(extraido.replace(/^0+/, "") || "0").toBe("1000000409");
  });

  it("segmento P tem exatamente 240 caracteres", () => {
    const linha = montarSegPSimplificado("1000000409");
    expect(linha).toHaveLength(240);
  });

  it("nosso número é preenchido com zeros à esquerda no segmento P", () => {
    const linha = montarSegPSimplificado("1");
    const campo = linha.substring(182, 202);
    expect(campo).toBe("00000000000000000001");
    expect(campo).toHaveLength(20);
  });
});

// ─── Filtro de parcelas para remessa (diasAVencer) ───────────────────────────

describe("Filtro de parcelas por dias a vencer", () => {
  interface ParcelaFiltro {
    id: number;
    dueDate: Date;
    status: string;
    statusRemessa: string | null;
  }

  function filtrarParcelasParaRemessa(
    parcelas: ParcelaFiltro[],
    diasAVencer: number,
    hoje: Date
  ): ParcelaFiltro[] {
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + diasAVencer);

    return parcelas.filter(p => {
      const vencimento = new Date(p.dueDate);
      return (
        p.status !== "pago" &&
        p.statusRemessa !== "remessa_gerada" &&
        p.statusRemessa !== "enviado" &&
        vencimento <= limite
      );
    });
  }

  const hoje = new Date("2025-06-01");

  const parcelas: ParcelaFiltro[] = [
    { id: 1, dueDate: new Date("2025-06-10"), status: "pendente", statusRemessa: null },
    { id: 2, dueDate: new Date("2025-06-25"), status: "pendente", statusRemessa: null },
    { id: 3, dueDate: new Date("2025-07-15"), status: "pendente", statusRemessa: null },
    { id: 4, dueDate: new Date("2025-06-05"), status: "pago", statusRemessa: "retorno_recebido" },
    { id: 5, dueDate: new Date("2025-06-08"), status: "pendente", statusRemessa: "remessa_gerada" },
    { id: 6, dueDate: new Date("2025-06-12"), status: "pendente", statusRemessa: "enviado" },
  ];

  it("retorna apenas parcelas dentro do prazo e não enviadas", () => {
    const resultado = filtrarParcelasParaRemessa(parcelas, 30, hoje);
    const ids = resultado.map(p => p.id);
    expect(ids).toContain(1); // vence em 9 dias, pendente
    expect(ids).toContain(2); // vence em 24 dias, pendente
    expect(ids).not.toContain(3); // vence em 44 dias (além dos 30)
    expect(ids).not.toContain(4); // já pago
    expect(ids).not.toContain(5); // remessa já gerada
    expect(ids).not.toContain(6); // já enviado
  });

  it("com 7 dias não retorna parcelas com vencimento além de 7 dias", () => {
    const resultado = filtrarParcelasParaRemessa(parcelas, 7, hoje);
    const ids = resultado.map(p => p.id);
    // Parcela 1 vence em 10/06 (9 dias após 01/06) → fora dos 7 dias
    expect(ids).not.toContain(1);
    // Nenhuma parcela válida dentro de 7 dias
    expect(ids).toHaveLength(0);
  });

  it("com 60 dias inclui parcela de julho", () => {
    const resultado = filtrarParcelasParaRemessa(parcelas, 60, hoje);
    const ids = resultado.map(p => p.id);
    expect(ids).toContain(3); // vence em 44 dias
  });
});
