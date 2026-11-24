import { execFileSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { inflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VARIAVEIS_CONDOMINIO } from "../shared/modelo-condominio";
import {
  gerarHtmlTabelaParcelas,
  gerarPDFModelo,
  VARIAVEIS_DISPONIVEIS,
} from "./modelo-pdf";

// PDFKit real, sem DB, router, storage, imagens remotas ou mocks do gerador.
// Poppler é requisito explícito: não pula silenciosamente a prova do PDF real.
function textoPdf(pdf: Buffer): string {
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1_000);
  return execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: pdf,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }).replace(/\r/g, "");
}

/** Inspeciona fontes e texto efetivamente escritos nos streams PDFKit WinAnsi. */
function fragmentosPdf(pdf: Buffer): Array<{ fonte: string; texto: string }> {
  const bruto = pdf.toString("latin1");
  const objetos = new Map(
    [...bruto.matchAll(/(?:^|\n)(\d+) 0 obj\s*([\s\S]*?)\nendobj/g)].map(
      match => [match[1], match[2]]
    )
  );
  const fontes = new Map(
    [...bruto.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)].map(match => [
      match[1],
      objetos.get(match[2])?.match(/\/BaseFont\s*\/(\S+)/)?.[1] ?? "",
    ])
  );
  const fragmentos: Array<{ fonte: string; texto: string }> = [];
  for (const match of bruto.matchAll(
    /(?:^|\n)\d+ 0 obj\s*<<((?:(?!endobj)[\s\S])*?)>>\s*stream\r?\n/g
  )) {
    const tamanho = Number(match[1].match(/\/Length\s+(\d+)/)?.[1]);
    const inicio = match.index! + match[0].length;
    const bytes = pdf.subarray(inicio, inicio + tamanho);
    const stream = (
      /\/FlateDecode/.test(match[1]) ? inflateSync(bytes) : bytes
    ).toString("latin1");
    for (const bloco of stream.matchAll(/BT\b([\s\S]*?)\bET/g)) {
      const referencia = bloco[1].match(/\/(F\d+)\s+[\d.]+\s+Tf/)?.[1] ?? "";
      const texto = [...bloco[1].matchAll(/<([\da-f]+)>/gi)]
        .map(hex =>
          new TextDecoder("windows-1252").decode(Buffer.from(hex[1], "hex"))
        )
        .join("");
      if (texto)
        fragmentos.push({ fonte: fontes.get(referencia) ?? "", texto });
    }
  }
  expect(fragmentos.length).toBeGreaterThan(0);
  expect(
    fragmentos.every(fragmento => fragmento.fonte.startsWith("Helvetica"))
  ).toBe(true);
  return fragmentos;
}

beforeEach(() => {
  vi.spyOn(http, "get").mockImplementation(() => {
    throw new Error("Rede proibida neste teste local");
  });
  vi.spyOn(https, "get").mockImplementation(() => {
    throw new Error("Rede proibida neste teste local");
  });
});
afterEach(() => {
  expect(http.get).not.toHaveBeenCalled();
  expect(https.get).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

const literais = [
  ["markup inline", "<strong>DADO</strong> <em>ITALICO</em>"],
  [
    "markup de blocos e script",
    "</p><h1>TITULO</h1><script>CODIGO</script><p>",
  ],
  ["tabela como dado", "<table><tr><td>CELULA</td></tr></table>"],
  ["imagem não interpretada", '<img src="https://example.test/imagem.png">'],
  ["metacaracteres de replace", "$& $$ $` $' $1"],
  ["variável dentro do dado", "{{outra}} {{ nomeCondominio }}"],
  ["entidades simples", "&amp; &lt; &gt; &quot; &#39; &nbsp;"],
  ["entidades duplas", "&amp;amp; &amp;lt; &amp;gt; &amp;quot; &amp;#39;"],
  [
    "entidades numéricas e markdown codificado",
    "&#60; &#x3c; &#42;&#42; &#95;",
  ],
  ["aspas e apóstrofos", `"Condomínio" 'D'Água' & < >`],
  ["markdown literal", "**NEGRITO** _ITALICO_ A_B_C * simples *"],
  ["escapes markdown literais", String.raw`\**NEGRITO\** \_ITALICO\_ \\fim`],
  ["marcador parecido", "LUMINUSVAR0FIM LUMINUSVARX0FIM"],
] as const;

describe("PDF de modelo — modoVariaveis texto", () => {
  it.each(literais)(
    "preserva literalmente %s no PDF real",
    async (_, valor) => {
      const pdf = await gerarPDFModelo({
        conteudoHtml: "<p>INICIO {{nomeCondominio}} FIM</p>",
        modoVariaveis: "texto",
        variaveis: { nomeCondominio: valor, outra: "NAO SUBSTITUIR" },
      });
      const texto = textoPdf(pdf);
      expect(texto).toContain(`INICIO ${valor} FIM`);
      expect(texto).not.toContain("NAO SUBSTITUIR");
      const fragmentos = fragmentosPdf(pdf);
      expect(
        fragmentos.filter(fragmento => fragmento.texto.includes("INICIO"))
      ).toEqual([{ fonte: "Helvetica", texto: `INICIO ${valor} FIM` }]);
    }
  );

  it("faz uma passagem, aceita caixa/espaços/aliases, mantém desconhecidas e não altera o mapa", async () => {
    const variaveis = Object.freeze({
      nomeCondominio: "$& {{outra}}",
      condominio: "ALIAS",
      outra: "VALOR OUTRA",
      vazio: "",
      ausente: undefined,
    });
    const pdf = await gerarPDFModelo({
      conteudoHtml:
        "<p>{{ NOMECONDOMINIO }} | {{nomeCondominio}} | {{ CONDOMINIO }}</p><p>{{outra}} | [{{vazio}}] | {{inexistente}} | {{ausente}}</p>",
      modoVariaveis: "texto",
      variaveis,
    });
    const texto = textoPdf(pdf);
    expect(texto).toContain("$& {{outra}} | $& {{outra}} | ALIAS");
    expect(texto).toContain("VALOR OUTRA | [] | {{inexistente}} | {{ausente}}");
    expect(variaveis).toEqual({
      nomeCondominio: "$& {{outra}}",
      condominio: "ALIAS",
      outra: "VALOR OUTRA",
      vazio: "",
      ausente: undefined,
    });
  });

  it("normaliza só chaves conhecidas, mantendo paridade com a prévia para variáveis manuais", async () => {
    const pdf = await gerarPDFModelo({
      conteudoHtml:
        "<p>{{ Campo_Manual }} / {{campo_manual}} / {{ NOMECONDOMINIO }}</p>",
      modoVariaveis: "texto",
      variaveis: {
        Campo_Manual: "CAIXA ALTA",
        campo_manual: "caixa baixa",
        nomeCondominio: "Nome cadastral",
      },
    });
    expect(textoPdf(pdf)).toContain(
      "CAIXA ALTA / caixa baixa / Nome cadastral"
    );
  });

  it("não lê propriedades herdadas nem trata chaves do mapa como regex", async () => {
    const variaveis = Object.assign(Object.create({ herdada: "VAZAMENTO" }), {
      "nome.*": "REGEX",
      nomeCondominio: "OK",
    });
    const texto = textoPdf(
      await gerarPDFModelo({
        conteudoHtml: "<p>{{nomeCondominio}} {{nomeOutro}} {{herdada}}</p>",
        modoVariaveis: "texto",
        variaveis,
      })
    );
    expect(texto).toContain("OK {{nomeOutro}} {{herdada}}");
    expect(texto).not.toMatch(/VAZAMENTO|REGEX/);
  });

  it("preserva fonte strong/em do modelo sem formatar markdown/HTML do dado, inclusive aninhados", async () => {
    const valores = {
      normal: "**NORMAL** _dado_",
      bold: "**BOLD** _dado_",
      italic: "**ITALIC** _dado_",
      ambos: "<b>AMBOS</b> **_dado_**",
    };
    const pdf = await gerarPDFModelo({
      conteudoHtml:
        "<p>{{normal}}</p><p><strong>{{bold}}</strong></p><p><em>{{italic}}</em></p><p><strong><em>{{ambos}}</em></strong></p><p>**MODELO BOLD** e _MODELO ITALICO_</p>",
      modoVariaveis: "texto",
      variaveis: valores,
    });
    const texto = textoPdf(pdf);
    for (const valor of Object.values(valores)) expect(texto).toContain(valor);
    expect(texto).toContain("MODELO BOLD e MODELO ITALICO");
    const fragmentos = fragmentosPdf(pdf);
    expect(fragmentos).toEqual(
      expect.arrayContaining([
        { fonte: "Helvetica", texto: valores.normal },
        { fonte: "Helvetica-Bold", texto: valores.bold },
        { fonte: "Helvetica-Oblique", texto: valores.italic },
        { fonte: "Helvetica-BoldOblique", texto: valores.ambos },
        { fonte: "Helvetica-Bold", texto: "MODELO BOLD" },
        { fonte: "Helvetica-Oblique", texto: "MODELO ITALICO" },
      ])
    );
  });

  it("mantém formatação externa através de newline real e caracteres especiais", async () => {
    const valor = "LINHA UM **literal**\nLINHA DOIS &amp; 'fim'";
    const pdf = await gerarPDFModelo({
      conteudoHtml: "<p><strong>{{nomeCondominio}}</strong> FINAL NORMAL</p>",
      modoVariaveis: "texto",
      variaveis: { nomeCondominio: valor },
    });
    expect(textoPdf(pdf)).toMatch(
      /LINHA UM \*\*literal\*\*\s*\n\s*LINHA DOIS &amp; 'fim' FINAL NORMAL/
    );
    const fragmentos = fragmentosPdf(pdf);
    expect(
      fragmentos.filter(fragmento => fragmento.texto.startsWith("LINHA"))
    ).toEqual([
      { fonte: "Helvetica-Bold", texto: "LINHA UM **literal**" },
      { fonte: "Helvetica-Bold", texto: "LINHA DOIS &amp; 'fim'" },
    ]);
    expect(fragmentos).toContainEqual({
      fonte: "Helvetica",
      texto: " FINAL NORMAL",
    });
  });

  it("mantém delimitadores markdown dos dados sem atravessar variáveis nem afetar texto vizinho", async () => {
    const pdf = await gerarPDFModelo({
      conteudoHtml:
        "<p>{{inicio}}MEIO{{fim}} e <strong>{{bold}}</strong> NORMAL</p>",
      modoVariaveis: "texto",
      variaveis: { inicio: "**_", fim: "_**", bold: "**_**" },
    });
    expect(textoPdf(pdf)).toContain("**_MEIO_** e **_** NORMAL");
    expect(fragmentosPdf(pdf)).toEqual(
      expect.arrayContaining([
        { fonte: "Helvetica", texto: "**_MEIO_** e " },
        { fonte: "Helvetica-Bold", texto: "**_**" },
        { fonte: "Helvetica", texto: " NORMAL" },
      ])
    );
  });

  it("restaura valores em headings, listas, tabela do modelo e texto fora de blocos sem parser adicional", async () => {
    const pdf = await gerarPDFModelo({
      conteudoHtml:
        "<h2>{{titulo}}</h2><ul><li>{{lista}}</li></ul><ol><li>{{ordenada}}</li></ol><table><tr><th>{{cabecalho}}</th></tr><tr><td>{{celula}}</td></tr></table>{{resto}}",
      modoVariaveis: "texto",
      variaveis: {
        titulo: "<b>TITULO</b> &amp;",
        lista: "**LISTA**",
        ordenada: "_ORDEM_",
        cabecalho: '"CAB" &amp;',
        celula: '<em>CEL</em> "aspas"',
        resto: "**RESTO**",
      },
    });
    const texto = textoPdf(pdf);
    expect(texto).toContain("<b>TITULO</b> &amp;");
    expect(texto).toContain("**LISTA**");
    expect(texto).toContain("1. _ORDEM_");
    expect(texto).toContain('"CAB" &amp;');
    expect(texto).toContain('<em>CEL</em> "aspas"');
    expect(texto).toContain("**RESTO**");
    expect(texto).not.toContain("LUMINUSVAR");
    expect(fragmentosPdf(pdf)).toContainEqual({
      fonte: "Helvetica-Bold",
      texto: "<b>TITULO</b> &amp;",
    });
  });

  it("não vaza marcadores entre gerações nem mantém valores de outro condomínio", async () => {
    const conteudoHtml = "<p>{{nomeCondominio}} / {{cnpjCondominio}}</p>";
    const [primeiro, segundo] = await Promise.all([
      gerarPDFModelo({
        conteudoHtml,
        modoVariaveis: "texto",
        variaveis: {
          nomeCondominio: "ALFA **literal**",
          cnpjCondominio: "00.000.000/0001-00",
        },
      }),
      gerarPDFModelo({
        conteudoHtml,
        modoVariaveis: "texto",
        variaveis: { nomeCondominio: "BETA _literal_", cnpjCondominio: "" },
      }),
    ]);
    expect(textoPdf(primeiro)).toContain(
      "ALFA **literal** / 00.000.000/0001-00"
    );
    expect(textoPdf(segundo)).toContain("BETA _literal_ /");
    expect(textoPdf(segundo)).not.toMatch(/ALFA|00\.000|LUMINUSVAR/);
  });
});

describe("PDF de modelo — regressão sem modoVariaveis", () => {
  it("continua interpretando HTML/Markdown das variáveis e tabela HTML de parcelas", async () => {
    const tabelaParcelas = gerarHtmlTabelaParcelas([
      { numero: 1, vencimento: "10/12/2026", valor: "R$ 123,45" },
    ]);
    const pdf = await gerarPDFModelo({
      conteudoHtml:
        "<p>**MODELO BOLD** e _MODELO ITALICO_</p><p>{{nomeDevedor}}</p><p>{{nomeResponsavel}}</p><p>Parcelas abaixo {{tabelaParcelas}}</p>",
      variaveis: {
        nomeDevedor: "<strong>HTML DADO</strong> &amp; texto",
        nomeResponsavel: "**DADO BOLD** e _DADO ITALICO_",
        tabelaParcelas,
      },
    });
    const texto = textoPdf(pdf);
    expect(texto).toContain("MODELO BOLD e MODELO ITALICO");
    expect(texto).toContain("HTML DADO & texto");
    expect(texto).toContain("DADO BOLD e DADO ITALICO");
    for (const esperado of [
      "Parcelas abaixo",
      "Descrição",
      "Vencimento",
      "Valor",
      "Status",
      "Parcela 1",
      "10/12/2026",
      "R$ 123,45",
      "Em aberto",
    ]) {
      expect(texto).toContain(esperado);
    }
    expect(texto).not.toMatch(/<table|<strong|\*\*|_DADO/);
    expect(fragmentosPdf(pdf)).toEqual(
      expect.arrayContaining([
        { fonte: "Helvetica-Bold", texto: "MODELO BOLD" },
        { fonte: "Helvetica-Oblique", texto: "MODELO ITALICO" },
        { fonte: "Helvetica-Bold", texto: "HTML DADO" },
        { fonte: "Helvetica-Bold", texto: "DADO BOLD" },
        { fonte: "Helvetica-Oblique", texto: "DADO ITALICO" },
      ])
    );
  });

  it("mantém a tabela detalhada legada de oito colunas", async () => {
    const pdf = await gerarPDFModelo({
      conteudoHtml: "<p>{{tabelaParcelas}}</p>",
      variaveis: {
        tabelaParcelas: gerarHtmlTabelaParcelas([
          {
            descricao: "Cota 01",
            vencimento: "01/12/2026",
            valorOriginal: "R$ 100,00",
            juros: "R$ 2,00",
            multa: "R$ 1,00",
            honorarios: "R$ 3,00",
            correcao: "R$ 4,00",
            valorAtualizado: "R$ 110,00",
          },
        ]),
      },
    });
    const texto = textoPdf(pdf);
    for (const esperado of [
      "Descrição",
      "Vencimento",
      "Valor Original",
      "Juros",
      "Multa",
      "Honorários",
      "Correção",
      "Valor Atualizado",
      "Cota 01",
      "01/12/2026",
      "R$ 100,00",
      "R$ 2,00",
      "R$ 1,00",
      "R$ 3,00",
      "R$ 4,00",
      "R$ 110,00",
    ]) {
      expect(texto).toContain(esperado);
    }
    expect(texto).not.toContain("<table");
  });
});

describe("catálogo servido por listarVariaveis — contrato compartilhado", () => {
  it("inclui todas as variáveis de condomínio/jurídico do shared uma única vez com label/categoria corretos", () => {
    const chaves = VARIAVEIS_DISPONIVEIS.map(variavel => variavel.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const { chave, label, categoria } of VARIAVEIS_CONDOMINIO) {
      expect(
        VARIAVEIS_DISPONIVEIS.filter(variavel => variavel.chave === chave)
      ).toEqual([{ chave, descricao: label, categoria }]);
    }
  });

  it("preserva todas as demais variáveis, descrições e categorias legadas", () => {
    const chavesShared = new Set<string>(
      VARIAVEIS_CONDOMINIO.map(variavel => variavel.chave)
    );
    expect(
      VARIAVEIS_DISPONIVEIS.filter(
        variavel => !chavesShared.has(variavel.chave)
      )
    ).toEqual([
      {
        chave: "nomeDevedor",
        descricao: "Nome completo do devedor",
        categoria: "Devedor",
      },
      {
        chave: "cpfCnpjDevedor",
        descricao: "CPF ou CNPJ do devedor",
        categoria: "Devedor",
      },
      {
        chave: "unidadeDevedor",
        descricao: "Número da unidade",
        categoria: "Devedor",
      },
      {
        chave: "blocoDevedor",
        descricao: "Bloco do devedor",
        categoria: "Devedor",
      },
      {
        chave: "enderecoDevedor",
        descricao: "Endereço completo do devedor",
        categoria: "Devedor",
      },
      {
        chave: "valorOriginal",
        descricao: "Valor original da dívida",
        categoria: "Acordo",
      },
      {
        chave: "valorAcordo",
        descricao: "Valor total do acordo",
        categoria: "Acordo",
      },
      {
        chave: "valorEntrada",
        descricao: "Valor da entrada",
        categoria: "Acordo",
      },
      {
        chave: "numeroParcelas",
        descricao: "Número de parcelas",
        categoria: "Acordo",
      },
      {
        chave: "valorParcela",
        descricao: "Valor de cada parcela",
        categoria: "Acordo",
      },
      {
        chave: "dataVencimentoPrimeiraParcela",
        descricao: "Vencimento da 1ª parcela",
        categoria: "Acordo",
      },
      {
        chave: "tabelaParcelas",
        descricao: "Tabela completa de parcelas",
        categoria: "Acordo",
      },
      {
        chave: "dataAtual",
        descricao: "Data atual (dd/mm/aaaa)",
        categoria: "Data",
      },
      {
        chave: "dataAtualExtenso",
        descricao: "Data atual por extenso",
        categoria: "Data",
      },
      {
        chave: "nomeResponsavel",
        descricao: "Nome do responsável pelo acordo",
        categoria: "Responsável",
      },
    ]);
  });
});
