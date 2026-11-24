import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { FormularioDocumentoView } from "../client/src/pages/PreencherModeloJuridico";
import {
  criarFormularioModelo,
  selecionarCondominioModelo,
  aplicarDadosCondominioModelo,
  editarCampoModelo,
  criarHtmlDocumentoModelo,
} from "../client/src/lib/modelo-condominio-form";
import {
  detectarVariaveisModelo,
  VARIAVEIS_CONDOMINIO,
} from "../shared/modelo-condominio";

const modelo = {
  id: 10,
  nome: "Procuração fictícia",
  tipo: "procuracao",
  conteudoHtml:
    "<p>{{ NOMECondominio }} {{cnpjCondominio}} {{representanteLegal}}</p>",
};
const lista = {
  modeloId: 10,
  condominioVinculadoId: null,
  condominios: [
    { id: 1, name: "Condomínio Alfa" },
    { id: 2, name: "Condomínio Beta" },
  ],
};
const inicial = () =>
  criarFormularioModelo(
    "identidade-teste",
    10,
    detectarVariaveisModelo(modelo.conteudoHtml)
  );
const pronto = () =>
  aplicarDadosCondominioModelo(
    selecionarCondominioModelo(inicial(), 1),
    {
      modeloId: 10,
      condominioId: 1,
      nomeCondominio: "Condomínio Alfa",
      valores: { nomeCondominio: "Condomínio Alfa", cnpjCondominio: "" },
      camposAusentes: ["cnpjCondominio"],
    },
    1,
    "identidade-teste"
  );
function render(
  overrides: Partial<React.ComponentProps<typeof FormularioDocumentoView>> = {}
) {
  const estado = pronto();
  return renderToStaticMarkup(
    React.createElement(FormularioDocumentoView, {
      modelo,
      lista,
      estado,
      htmlDocumento: criarHtmlDocumentoModelo(
        modelo.nome,
        modelo.conteudoHtml,
        estado.valores
      ),
      pendente: false,
      erro: false,
      bloqueada: false,
      gerando: false,
      onVoltar: vi.fn(),
      onEscolher: vi.fn(),
      onEditar: vi.fn(),
      onPDF: vi.fn(),
      onImprimir: vi.fn(),
      dataHoraInput: "",
      onDataHora: vi.fn(),
      ...overrides,
    })
  );
}

describe("tela documental real — renderização com dados sintéticos", () => {
  it("modelo apenas com nomeCondominio oferece seletor independente do alias legado", () => {
    const html = render();
    expect(html).toContain("Dados do condomínio");
    expect(html).toContain("fonte_condominio");
    expect(html).toContain("Nome do Condomínio");
    expect(html).toContain("cnpjCondominio");
    expect(html).not.toContain('id="condominio"');
  });
  it("nome preenchido continua sendo input editável e mostra sua origem cadastral", () => {
    const html = render();
    expect(html).toMatch(
      /<input[^>]*id="nomeCondominio"[^>]*value="Condomínio Alfa"/
    );
    expect(html.match(/<input[^>]*id="nomeCondominio"[^>]*>/)?.[0]).not.toMatch(
      /\sdisabled(?:=|\s|>)/
    );
    expect(html).toContain("Preenchido pelo cadastro");
  });
  it("campo ausente é vazio, com aviso e representante continua manual", () => {
    const html = render();
    expect(html).toContain("Não informado no cadastro");
    expect(html).toContain("Representante Legal");
    expect(html).toContain("não é presumido representante legal");
    expect(html).toContain("Eles serão apresentados para revisão");
    expect(html.match(/<input[^>]*id="cnpjCondominio"[^>]*>/)?.[0]).toContain(
      'value=""'
    );
  });
  it("texto revisado não é injetado como markup na prévia isolada", () => {
    const estado = editarCampoModelo(
      pronto(),
      "nomeCondominio",
      "<script>teste</script> **_ &amp;"
    );
    const html = render({
      estado,
      htmlDocumento: criarHtmlDocumentoModelo(
        modelo.nome,
        modelo.conteudoHtml,
        estado.valores
      ),
    });
    expect(html).toContain('sandbox=""');
    expect(html).toContain("srcDoc=");
    expect(html).not.toContain("<script>teste</script>");
    expect(html).toContain("Preenchimento manual");
  });
  it.each(["carregando", "erro"] as const)(
    "%s bloqueia ações e não mostra prévia de fonte antiga",
    status => {
      const html = render({
        pendente: status === "carregando",
        erro: status === "erro",
        bloqueada: true,
        htmlDocumento: "",
      });
      expect(html).not.toContain("<iframe");
      expect(html).toContain("fonte estiver confirmada");
      const buttons =
        html
          .match(/<button[^>]*>.*?<\/button>/g)
          ?.filter(
            button =>
              button.includes("Imprimir") || button.includes("Gerar PDF")
          ) ?? [];
      expect(buttons).toHaveLength(2);
      expect(buttons.every(button => /\sdisabled(?:=|\s|>)/.test(button))).toBe(
        true
      );
    }
  );
  it("modelo vinculado mostra fonte fixa sem oferecer troca incompatível", () => {
    const html = render({
      lista: {
        ...lista,
        condominioVinculadoId: 1,
        condominios: [lista.condominios[0]],
      },
    });
    expect(html).toContain("Este modelo está vinculado");
    expect(html.match(/<button[^>]*id="fonte_condominio"[^>]*>/)?.[0]).toMatch(
      /\sdisabled(?:=|\s|>)/
    );
  });
  it("variáveis não jurídicas e modelo estático permanecem disponíveis", () => {
    const empty = criarFormularioModelo("id", 10, []);
    expect(
      render({
        estado: empty,
        modelo: { ...modelo, conteudoHtml: "<p>Estático</p>" },
        htmlDocumento: criarHtmlDocumentoModelo(
          "Estático",
          "<p>Estático</p>",
          {}
        ),
      })
    ).toContain("Nenhuma variável detectada");
    expect(
      render({ estado: criarFormularioModelo("id", 10, ["Campo_Manual"]) })
    ).toContain("Campo_Manual");
  });
});

describe("fronteiras da integração da tela", () => {
  const source = readFileSync(
    new URL("../client/src/pages/PreencherModeloJuridico.tsx", import.meta.url),
    "utf8"
  );
  it("usa queries mínimas, não consulta condominios.list nem getById administrativo", () => {
    expect(source).toContain(
      "trpc.modelosDocumento.listarCondominiosPreenchimento.useQuery"
    );
    expect(source).toContain(
      "trpc.modelosDocumento.obterDadosPreenchimento.useQuery"
    );
    expect(source).not.toMatch(/trpc\.condominios\.(list|getById)/);
  });
  it("protege identidade, revisão, respostas de cache e não persiste formulário no browser", () => {
    expect(source).toContain("key={`${identidade}:${modeloId}`}");
    expect(source).toContain("key={`${identidade}:${estado.revisao}`}");
    expect(source).toContain("isFetchedAfterMount");
    expect(source).toContain("abortOnUnmount: true");
    expect(source).not.toMatch(
      /localStorage|sessionStorage|dangerouslySetInnerHTML/
    );
  });
  it("confirma troca e campos ausentes explicitamente, sem geração automática na seleção", () => {
    expect(source).toContain("precisaConfirmarTroca");
    expect(source).toContain("Manter condomínio atual");
    expect(source).toContain("Trocar e preencher");
    expect(source).toContain("Continuar com campos vazios");
    const selection = source
      .split("const escolher =")[1]
      .split("const renderizar =")[0];
    expect(selection).not.toContain("mutate");
    expect(selection).not.toContain("executar(");
  });
  it("PDF tem contexto e impressão confirma autorização sem refazer valores ou produzir PDF remoto", () => {
    expect(source).toContain(
      "contextoPreenchimento: { condominioId: estado.condominioId }"
    );
    expect(source).toContain(
      "client.modelosDocumento.validarPreenchimento.query"
    );
    expect(source).toContain("janela.document.write(htmlDocumento)");
    expect(source).toContain("srcDoc={htmlDocumento}");
  });
  it("editor usa catálogo comum e não duplica os campos jurídicos mapeados", () => {
    const editor = readFileSync(
      new URL("../client/src/pages/ModeloEditor.tsx", import.meta.url),
      "utf8"
    );
    expect(editor).toContain("VARIAVEIS_CONDOMINIO.filter");
    for (const v of VARIAVEIS_CONDOMINIO.filter(
      v => v.categoria === "Jurídico"
    ))
      expect(editor).not.toContain(`{ chave: "${v.chave}"`);
    expect(editor).toContain('{ chave: "representanteLegal"');
    expect(editor).toContain('{ chave: "tabelaParcelas"');
  });
});
