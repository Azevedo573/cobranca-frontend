import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  dividirOrigemEmPaginas,
  dividirParcelasEmPaginas,
  gerarPlanoCompletoAcordoPDF,
  quebrarTextoOrigemEmLinhas,
  resumirPlanoBoletoAcordo,
  type ParcelaResumoPlanoAcordo,
  type PlanoCompletoAcordoPdfInput,
} from "./plano-acordo-pdf";
import type { OrigemDividaDocumento } from "./origem-divida-acordo";

function inputPdf(overrides: Partial<PlanoCompletoAcordoPdfInput> = {}): PlanoCompletoAcordoPdfInput {
  return {
    acordo: {
      id: 1500001, totalAmount: 99999999, agreedAmount: 11301, installments: 1,
      paymentFrequency: "mensal", status: "ativo", valorPago: 0, notes: null,
      createdAt: new Date("2026-10-28T12:00:00.000Z"),
    },
    condominio: { name: "Condomínio de Teste", cnpj: null },
    devedor: { name: "Pagador de Teste", unitNumber: "101", bloco: "A", cpfCnpj: null },
    parcelas: [parcela(0, 5000, "2026-10-28"), parcela(1, 6301, "2026-11-28")],
    geradoEm: new Date("2026-10-28T12:00:00.000Z"),
    ...overrides,
  };
}

function origemPdf(overrides: Partial<OrigemDividaDocumento> = {}): OrigemDividaDocumento {
  return {
    itens: [{ cobrancaId: 27, titulo: "Cota condominial de origem", vencimento: new Date("2026-08-10T12:00:00Z"), principal: 10001 }],
    quantidade: 1,
    primeiroVencimento: new Date("2026-08-10T12:00:00Z"),
    ultimoVencimento: new Date("2026-08-10T12:00:00Z"),
    principal: 10001, juros: 501, multa: 201, correcao: 101, honorarios: 497,
    totalFechamento: 11301, avisos: [],
    ...overrides,
  };
}

/** Lê os streams reais do PDFKit (fontes padrão WinAnsi), sem ferramenta externa. */
function extrairPaginasPdf(pdf: Buffer): { paginas: string[]; quantidadePaginas: number; streams: string[] } {
  const conteudo = pdf.toString("latin1");
  const streams = [...conteudo.matchAll(/(?:^|\n)\d+ 0 obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*stream\r?\n/g)]
    .map((match) => {
      // Não procura o fim pelo conteúdo comprimido: um byte CR final é dado, não delimitador.
      const tamanho = Number(match[1].match(/\/Length\s+(\d+)/)?.[1]);
      const inicio = match.index! + match[0].length;
      const buffer = pdf.subarray(inicio, inicio + tamanho);
      return (/\/FlateDecode/.test(match[1]) ? inflateSync(buffer) : buffer).toString("latin1");
    })
    .filter((stream) => stream.includes("BT"));
  const paginas = streams.map((stream) => [...stream.matchAll(/BT\b([^]*?)\bET/g)]
    .map((bloco) => [...bloco[1].matchAll(/<([\da-f]+)>/gi)]
      .map((match) => Buffer.from(match[1], "hex").toString("latin1").replace(/\x97/g, "—").replace(/\x96/g, "–").replace(/\xa0/g, " "))
      .join(""))
    .join("\n"));
  return { paginas, streams, quantidadePaginas: [...conteudo.matchAll(/\/Type\s*\/Page\b/g)].length };
}

function parcela(
  installmentNumber: number,
  amount: number,
  dueDate: string,
  status: ParcelaResumoPlanoAcordo["status"] = "pendente",
): ParcelaResumoPlanoAcordo {
  return {
    id: installmentNumber + 100,
    installmentNumber,
    amount,
    dueDate: new Date(`${dueDate}T12:00:00.000Z`),
    status,
    paymentDate: status === "pago" ? new Date(`${dueDate}T12:00:00.000Z`) : null,
  };
}

describe("resumirPlanoBoletoAcordo", () => {
  it("reduz entrada e 64 parcelas em um resumo sem usar o total do acordo como valor do título", () => {
    const parcelas = [
      parcela(0, 5000, "2026-10-28"),
      ...Array.from({ length: 64 }, (_, index) =>
        parcela(index + 1, 6827, `2026-${String((index % 12) + 1).padStart(2, "0")}-28`),
      ),
    ];

    const resumo = resumirPlanoBoletoAcordo(parcelas);

    expect(resumo.quantidadeEtapas).toBe(65);
    expect(resumo.entrada).toMatchObject({ valor: 5000, rotulo: "Entrada" });
    expect(resumo.quantidadeParcelasRegulares).toBe(64);
    expect(resumo.valorMinimoParcela).toBe(6827);
    expect(resumo.valorMaximoParcela).toBe(6827);
    expect(resumo.totalPlano).toBe(5000 + 64 * 6827);
    expect(resumo.parcelasQuitadas).toBe(0);
  });

  it("mantém o saldo em aberto separado das parcelas canceladas e quitadas", () => {
    const resumo = resumirPlanoBoletoAcordo([
      parcela(0, 3000, "2026-01-10", "pago"),
      parcela(1, 6000, "2026-02-10", "pago"),
      parcela(2, 6000, "2026-03-10", "pendente"),
      parcela(3, 6000, "2026-04-10", "cancelado"),
    ]);

    expect(resumo.parcelasQuitadas).toBe(2);
    expect(resumo.valorPago).toBe(9000);
    expect(resumo.saldoEmAberto).toBe(6000);
  });
});

describe("dividirParcelasEmPaginas", () => {
  it("paginar 65 etapas em blocos completos, sem criar uma página por célula", () => {
    const parcelas = Array.from({ length: 65 }, (_, index) => parcela(index, 1000, "2026-10-28"));
    const paginas = dividirParcelasEmPaginas(parcelas, 24);

    expect(paginas).toHaveLength(3);
    expect(paginas.map((pagina) => pagina.length)).toEqual([24, 24, 17]);
    expect(paginas.flat().map((item) => item.id)).toEqual(parcelas.map((item) => item.id));
  });

  it("rejeita tamanho de página inválido para prevenir loop de paginação", () => {
    expect(() => dividirParcelasEmPaginas([parcela(1, 1000, "2026-10-28")], 0))
      .toThrow("O tamanho da página deve ser maior que zero");
  });
});

describe("quebrarTextoOrigemEmLinhas", () => {
  it("preserva descrição, espaços e palavras sem separadores maiores que a coluna", () => {
    const texto = `Descrição completa: ${"A".repeat(110)} fim  com  espaços`;
    const linhas = quebrarTextoOrigemEmLinhas(texto, 21, (linha) => Array.from(linha).length);
    expect(linhas.join("")).toBe(texto);
    expect(linhas.every((linha) => Array.from(linha).length <= 21)).toBe(true);
  });

  it("preserva parágrafos, linhas vazias e caracteres Unicode sem separar pares", () => {
    expect(quebrarTextoOrigemEmLinhas("Primeira\r\n\r\nSegunda\n", 80, (linha) => linha.length))
      .toEqual(["Primeira", "", "Segunda", ""]);
    const texto = "A😀B😀C";
    const linhas = quebrarTextoOrigemEmLinhas(texto, 2, (linha) => Array.from(linha).length);
    expect(linhas.join("")).toBe(texto);
    expect(linhas).toEqual(["A😀", "B😀", "C"]);
  });

  it("rejeita dimensões e medições que poderiam provocar loop ou perda de caracteres", () => {
    expect(() => quebrarTextoOrigemEmLinhas("texto", 0, (linha) => linha.length)).toThrow();
    expect(() => quebrarTextoOrigemEmLinhas("texto", 10, () => NaN)).toThrow("Medida de texto inválida");
    expect(() => quebrarTextoOrigemEmLinhas("W", 1, () => 10)).toThrow("A coluna não comporta");
  });
});

describe("dividirOrigemEmPaginas", () => {
  const medirTexto = (linha: string) => linha.length;
  const opcoes = { alturaDisponivel: 100, larguraDescricao: 20, alturaLinha: 10, padding: 5 };

  it("ordena todos os vencimentos e IDs, sem modificar os itens de entrada ou perder principal nulo", () => {
    const itens = [
      { cobrancaId: 9, titulo: "Sem data", vencimento: null, principal: null },
      { cobrancaId: 5, titulo: "Última", vencimento: new Date("2026-10-01"), principal: 100 },
      { cobrancaId: 4, titulo: "Primeira B", vencimento: new Date("2026-01-01"), principal: 200 },
      { cobrancaId: 3, titulo: "Primeira A", vencimento: new Date("2026-01-01"), principal: 0 },
    ];
    const paginas = dividirOrigemEmPaginas(itens, medirTexto, opcoes);
    const trechos = paginas.flat();
    expect(trechos.map((trecho) => trecho.item.cobrancaId)).toEqual([3, 4, 5, 9]);
    expect(trechos.map((trecho) => trecho.item.principal)).toEqual([0, 200, 100, null]);
    expect(itens.map((item) => item.cobrancaId)).toEqual([9, 5, 4, 3]);
    expect(paginas.every((pagina) => pagina.length > 0 && pagina.reduce((altura, trecho) => altura + trecho.altura, 0) <= 100)).toBe(true);
  });

  it("mantém uma descrição curta inteira na próxima página em vez de criar continuação desnecessária", () => {
    const itens = [
      { cobrancaId: 1, titulo: "X".repeat(120), vencimento: null, principal: 100 },
      { cobrancaId: 2, titulo: "Y".repeat(40), vencimento: null, principal: 200 },
    ];
    const paginas = dividirOrigemEmPaginas(itens, medirTexto, opcoes);
    expect(paginas.map((pagina) => pagina.map((trecho) => trecho.item.cobrancaId))).toEqual([[1], [2]]);
    expect(paginas.flat().every((trecho) => !trecho.continuacao)).toBe(true);
  });

  it("continua uma única descrição por várias páginas, repetindo ID e mantendo todos os caracteres", () => {
    const item = { cobrancaId: 31, titulo: "X".repeat(860), vencimento: null, principal: 12345 };
    const paginas = dividirOrigemEmPaginas([item], medirTexto, opcoes);
    expect(paginas.length).toBeGreaterThan(4);
    expect(paginas.every((pagina) => pagina.length > 0 && pagina.reduce((altura, trecho) => altura + trecho.altura, 0) <= 100)).toBe(true);
    const trechos = paginas.flat();
    expect(trechos.flatMap((trecho) => trecho.linhasDescricao).join("")).toBe(item.titulo);
    expect(trechos.map((trecho) => trecho.continuacao)).toEqual([false, ...trechos.slice(1).map(() => true)]);
    expect(trechos.every((trecho) => trecho.item === item)).toBe(true);
  });

  it("não cria página vazia no limite exato nem para origem vazia", () => {
    const item = { cobrancaId: 1, titulo: "X".repeat(160), vencimento: null, principal: 0 };
    const paginas = dividirOrigemEmPaginas([item], medirTexto, opcoes);
    expect(paginas).toHaveLength(1);
    expect(paginas[0][0].altura).toBe(100);
    expect(dividirOrigemEmPaginas([], medirTexto, opcoes)).toEqual([]);
  });

  it("rejeita altura insuficiente e valores inválidos antes de paginar", () => {
    expect(() => dividirOrigemEmPaginas([], medirTexto, { alturaDisponivel: 1 })).toThrow();
    expect(() => dividirOrigemEmPaginas([], medirTexto, { ...opcoes, alturaLinha: 0 })).toThrow();
    expect(() => dividirOrigemEmPaginas([], medirTexto, { ...opcoes, padding: -1 })).toThrow();
  });
});

describe("gerarPlanoCompletoAcordoPDF", () => {
  it("gera documento informativo mesmo sem configuração bancária, Pix ou nosso número", async () => {
    const pdf = await gerarPlanoCompletoAcordoPDF({
      acordo: {
        id: 1500001,
        totalAmount: 11301,
        agreedAmount: 11301,
        installments: 1,
        paymentFrequency: "mensal",
        status: "ativo",
        valorPago: 0,
        notes: null,
        createdAt: new Date("2026-10-28T12:00:00.000Z"),
      },
      condominio: { name: "Condomínio de Teste", cnpj: null },
      devedor: { name: "Pagador de Teste", unitNumber: "101", bloco: "A", cpfCnpj: null },
      parcelas: [
        parcela(0, 5000, "2026-10-28"),
        parcela(1, 6301, "2026-11-28"),
      ],
      geradoEm: new Date("2026-10-28T12:00:00.000Z"),
    });

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it("exibe resumo, valores preservados e snapshots somente agregados antes das parcelas", async () => {
    const origem = origemPdf({ totalFechamento: 11701 });
    const pdf = await gerarPlanoCompletoAcordoPDF(inputPdf({ origemDivida: origem }));
    const { paginas, quantidadePaginas } = extrairPaginasPdf(pdf);
    const texto = paginas.join("\n");
    expect(quantidadePaginas).toBe(paginas.length);
    expect(texto).toContain("Demonstrativo completo do acordo");
    expect(texto).toContain("Resumo do acordo");
    expect(texto).toContain("Principal preservado nos vínculos\nR$ 100,01");
    expect(texto).toContain("Juros — snapshot na formalização\nR$ 5,01");
    expect(texto).toContain("Multa — snapshot na formalização\nR$ 2,01");
    expect(texto).toContain("Base dos títulos na formalização\nR$ 117,01");
    expect(texto).toContain("sem snapshot próprio");
    expect(texto).toContain("não há detalhamento histórico por cobrança");
    expect(texto).toMatch(/Não é possível inferir\s+desconto/);
    expect(texto).not.toContain("999.999,99");
    expect(texto).not.toContain("Total de fechamento");
    const paginaOrigem = paginas.find((pagina) => pagina.includes("Cobrança #27"))!;
    expect(paginaOrigem).toContain("Cota condominial de origem");
    expect(paginaOrigem).toContain("10/08/2026");
    expect(paginaOrigem).toContain("R$ 100,01");
    expect(paginaOrigem).not.toContain("R$ 5,01");
    expect(texto.indexOf("Cobrança #27")).toBeLessThan(texto.indexOf("Parcelas do acordo"));
    expect(texto).not.toMatch(/Pix|linha digitável|nosso número|ficha de compensação|código de barras/i);
  });

  it("mostra nulos como indisponíveis sem substituir por zero, inferir encargos ou ocultar avisos", async () => {
    const origem = origemPdf({
      itens: [{ cobrancaId: 28, titulo: "Cobrança sem histórico", vencimento: null, principal: null }],
      principal: null, juros: null, multa: null, correcao: null, honorarios: null, totalFechamento: null,
      avisos: ["Histórico legado exige conferência."],
    });
    const { paginas } = extrairPaginasPdf(await gerarPlanoCompletoAcordoPDF(inputPdf({ origemDivida: origem })));
    const texto = paginas.join("\n");
    expect(texto).toContain("Principal preservado nos vínculos\n—");
    expect(texto).toContain("Base dos títulos na formalização\n—");
    expect(texto).toContain("Histórico legado exige conferência.");
    expect(texto).toContain("Composição financeira incompleta");
    const paginaOrigem = paginas.find((pagina) => pagina.includes("Cobrança #28"))!;
    expect(paginaOrigem).toContain("Cobrança sem histórico");
    expect(paginaOrigem.match(/\n—/g)).toHaveLength(2);
    expect(paginaOrigem).not.toContain("R$ 0,00");
  });

  it("distingue zero histórico disponível de ausência e pagina avisos extensos sem perder conteúdo", async () => {
    const origem = origemPdf({
      itens: [{ cobrancaId: 29, titulo: "Título de principal zero", vencimento: new Date("2026-01-10T12:00:00Z"), principal: 0 }],
      principal: 0, juros: 0, multa: 0, correcao: 0, honorarios: 0, totalFechamento: 0,
      avisos: Array.from({ length: 90 }, (_, indice) => `Verificação documental número ${indice}: consulte a formalização e o histórico preservado.`),
    });
    const { paginas, quantidadePaginas } = extrairPaginasPdf(await gerarPlanoCompletoAcordoPDF(inputPdf({ origemDivida: origem })));
    const texto = paginas.join("\n");
    expect(quantidadePaginas).toBe(paginas.length);
    expect(texto).toContain("Principal preservado nos vínculos\nR$ 0,00");
    expect(texto).toContain("Base dos títulos na formalização\nR$ 0,00");
    expect(texto).not.toContain("Composição financeira incompleta");
    origem.avisos.forEach((_, indice) => expect(texto.split(`Verificação documental número ${indice}:`)).toHaveLength(2));
    paginas.forEach((pagina, indice) => expect(pagina).toContain(`Página ${indice + 1}`));
    const paginaOrigem = paginas.find((pagina) => pagina.includes("Cobrança #29"))!;
    expect(paginaOrigem).toContain("R$ 0,00");
    expect(paginaOrigem).not.toMatch(/\n—/);
    expect(texto.indexOf("Verificação documental número 89:")).toBeLessThan(texto.indexOf("Cobrança #29"));
  });

  it("preserva todas as dívidas, descrição multipágina e 65 etapas com cabeçalhos e rodapés sem páginas vazias", async () => {
    const palavras = Array.from({ length: 1200 }, (_, indice) => `trecho${String(indice).padStart(4, "0")}`);
    const itens = Array.from({ length: 45 }, (_, indice) => ({
      cobrancaId: 900 + indice,
      titulo: indice === 0 ? palavras.join(" ") : `Título integral ${indice}`,
      vencimento: new Date(Date.UTC(2025, indice, 10, 12)), principal: 10001 + indice,
    }));
    const pdf = await gerarPlanoCompletoAcordoPDF(inputPdf({
      origemDivida: origemPdf({ itens: [...itens].reverse(), quantidade: itens.length }),
      parcelas: Array.from({ length: 65 }, (_, indice) => parcela(indice, 6827, "2026-10-28")).reverse(),
    }));
    const { paginas, quantidadePaginas } = extrairPaginasPdf(pdf);
    const texto = paginas.join("\n");
    expect(quantidadePaginas).toBe(paginas.length);
    expect(quantidadePaginas).toBeLessThan(20);
    expect(quantidadePaginas).toBeGreaterThan(6);
    paginas.forEach((pagina, indice) => {
      expect(pagina).toContain("Demonstrativo completo do acordo");
      expect(pagina).toContain(`Página ${indice + 1}`);
      expect(pagina).toMatch(/Resumo do acordo|Composição financeira|Cobrança #|Parcela \d+\/64/);
    });
    palavras.forEach((palavra) => expect(texto.split(palavra)).toHaveLength(2));
    expect(texto).toContain("Cobrança #900 (continuação)");
    itens.forEach((item, indice) => {
      expect(texto).toContain(`Cobrança #${item.cobrancaId}`);
      expect(texto).toContain(item.vencimento.toLocaleDateString("pt-BR"));
      if (indice) expect(texto.indexOf(`Cobrança #${item.cobrancaId}`)).toBeGreaterThan(texto.indexOf(`Cobrança #${item.cobrancaId - 1}`));
    });
    const paginasOrigem = paginas.filter((pagina) => pagina.includes("Cobrança #"));
    expect(paginasOrigem.length).toBeGreaterThan(2);
    paginasOrigem.forEach((pagina) => {
      expect(pagina).toContain("ID / descrição completa");
      expect(pagina).toContain("Vencimento");
      expect(pagina).toContain("Principal preservado");
    });
    const paginasParcelas = paginas.filter((pagina) => pagina.includes("Parcelas do acordo"));
    expect(paginasParcelas).toHaveLength(3);
    paginasParcelas.forEach((pagina) => expect(pagina).toContain("Pagamento"));
    expect(texto).toContain("Etapas 1 a 24 de 65");
    expect(texto).toContain("Etapas 25 a 48 de 65");
    expect(texto).toContain("Etapas 49 a 65 de 65");
    for (let indice = 1; indice <= 64; indice += 1) {
      expect(texto.split(`Parcela ${indice}/64`)).toHaveLength(2);
    }
    expect(texto.indexOf("Cobrança #944")).toBeLessThan(texto.indexOf("Parcelas do acordo"));
    expect(paginas.at(-1)).toContain("Total do plano ativo");
  });

  it("não acrescenta página vazia quando não há origem nem parcelas", async () => {
    const { paginas, quantidadePaginas } = extrairPaginasPdf(await gerarPlanoCompletoAcordoPDF(inputPdf({ parcelas: [] })));
    expect(quantidadePaginas).toBe(paginas.length);
    expect(paginas.every((pagina, indice) => pagina.includes(`Página ${indice + 1}`) && pagina.includes("Demonstrativo completo do acordo"))).toBe(true);
    expect(paginas.join("\n")).toContain("Origem da dívida não fornecida");
    expect(paginas.join("\n")).toContain("Não há parcelas registradas");
    expect(paginas.at(-1)).toContain("Não há parcelas registradas");
  });
});
