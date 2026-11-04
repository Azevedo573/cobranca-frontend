import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DocumentoCondominioCard,
  type DocumentoCondominioCardProps,
} from "../client/src/components/DocumentoCondominioCard";
import type { EstadoProgressoDocumento } from "../client/src/lib/progressoDocumento";
import { DOCUMENTO_CONDOMINIO_MAX_MB } from "../shared/documentos-condominio";

function renderCard(overrides: Partial<DocumentoCondominioCardProps> = {}) {
  const props: DocumentoCondominioCardProps = {
    tipo: "convencao",
    url: "https://example.com/convencao-atual.pdf",
    disabled: false,
    uploading: false,
    removing: false,
    canUpload: true,
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  return { props, html: renderToStaticMarkup(createElement(DocumentoCondominioCard, props)) };
}

function buttonWithLabel(html: string, label: string) {
  const button = html.match(/<button\b[\s\S]*?<\/button>/g)?.find(tag => tag.includes(`aria-label="${label}`));
  expect(button, `Botão ausente: ${label}`).toBeDefined();
  return button!;
}

function fileInput(html: string) {
  const input = html.match(/<input\b[^>]*type="file"[^>]*>/)?.[0];
  expect(input).toBeDefined();
  return input!;
}

function expectOnlyNonSubmitButtons(html: string) {
  for (const tag of html.match(/<button\b[^>]*>/g) ?? []) {
    expect(tag).toContain('type="button"');
  }
  expect(html).not.toContain('type="submit"');
}

describe("DocumentoCondominioCard — cartão controlado", () => {
  it.each([
    ["convencao", "Convenção Condominial"],
    ["regimento", "Regimento Interno"],
  ] as const)("exibe documento salvo e ações identificadas para %s", (tipo, titulo) => {
    const url = `https://example.com/${tipo}.pdf`;
    const { html, props } = renderCard({ tipo, url });
    expect(html).toContain(titulo);
    expect(html).toContain("Documento enviado");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(`aria-label="Visualizar PDF — ${titulo}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(buttonWithLabel(html, `Substituir PDF — ${titulo}`)).not.toContain('disabled=""');
    expect(buttonWithLabel(html, `Excluir documento — ${titulo}`)).not.toContain('disabled=""');
    expect(html).not.toContain("Clique ou arraste");
    expect(html).not.toContain('role="alertdialog"');
    expectOnlyNonSubmitButtons(html);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("sem URL exibe zona nativa acessível e input de PDF com limite compartilhado", () => {
    const { html } = renderCard({ tipo: "regimento", url: "" });
    expect(buttonWithLabel(html, "Enviar PDF — Regimento Interno")).not.toContain('disabled=""');
    expect(html).toContain("Clique ou arraste o PDF aqui");
    expect(html).toContain(`PDF, máx. ${DOCUMENTO_CONDOMINIO_MAX_MB} MB`);
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("aria-labelledby=");
    expect(fileInput(html)).toContain('accept=".pdf,application/pdf"');
    expect(fileInput(html)).toContain('aria-label="Selecionar PDF — Regimento Interno"');
    expect(fileInput(html)).not.toContain('disabled=""');
    expect(html).not.toContain("Substituir PDF");
    expect(html).not.toContain("Excluir documento");
    expect(html).not.toContain("Visualizar PDF");
    expectOnlyNonSubmitButtons(html);
  });

  it.each([
    { disabled: true },
    { canUpload: false },
    { uploading: true },
    { removing: true },
  ])("sem URL bloqueia zona e input quando %j", bloqueio => {
    const { html } = renderCard({ url: "", ...bloqueio });
    expect(buttonWithLabel(html, "Enviar PDF")).toContain('disabled=""');
    expect(fileInput(html)).toContain('disabled=""');
    expect(html).toContain("cursor-not-allowed");
    expectOnlyNonSubmitButtons(html);
  });

  it("orienta salvar o condomínio quando ainda não pode receber upload", () => {
    const { html } = renderCard({ url: "", canUpload: false });
    expect(html).toContain("Salve o condomínio antes de enviar documentos.");
  });

  it.each([{ disabled: true }, { uploading: true }, { removing: true }])(
    "com URL bloqueia as ações de alteração quando %j sem bloquear visualização",
    bloqueio => {
      const { html, props } = renderCard(bloqueio);
      expect(buttonWithLabel(html, "Substituir PDF")).toContain('disabled=""');
      expect(buttonWithLabel(html, "Excluir documento")).toContain('disabled=""');
      expect(fileInput(html)).toContain('disabled=""');
      const link = html.match(/<a\b[^>]*>/)?.[0];
      expect(link).toContain(`href="${props.url}"`);
      expect(link).not.toContain("disabled");
      expectOnlyNonSubmitButtons(html);
    }
  );

  it("canUpload bloqueia seleção/substituição sem bloquear remoção do documento salvo", () => {
    const { html } = renderCard({ canUpload: false });
    expect(buttonWithLabel(html, "Substituir PDF")).toContain('disabled=""');
    expect(fileInput(html)).toContain('disabled=""');
    expect(buttonWithLabel(html, "Excluir documento")).not.toContain('disabled=""');
  });

  it("mantém o PDF antigo visualizável durante o upload do substituto e exibe progresso real", () => {
    const progresso: EstadoProgressoDocumento = {
      nome: "Nova Convenção.pdf",
      tamanho: 2 * 1024 * 1024,
      fase: "enviando",
      percentual: 42,
    };
    const { html, props } = renderCard({ uploading: true, progresso });
    expect(html).toContain(`href="${props.url}"`);
    expect(html).toContain("O PDF atual permanece disponível durante a substituição.");
    expect(html).toContain("Nova Convenção.pdf");
    expect(html).toContain("2 MB");
    expect(html).toContain("Enviando PDF");
    expect(html).toContain("42%");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-busy="true"');
  });

  it("exibe progresso recebido mesmo sem URL e mantém erro visível sem inventar envio", () => {
    const progresso: EstadoProgressoDocumento = {
      nome: "Regimento.pdf",
      tamanho: 1024,
      fase: "erro",
      percentual: 12,
      erro: "Falha de rede. Selecione novamente.",
    };
    const { html } = renderCard({ tipo: "regimento", url: "", progresso });
    expect(html).toContain("Regimento.pdf");
    expect(html).toContain("Não foi possível enviar");
    expect(html).toContain('role="alert"');
    expect(html).toContain(progresso.erro);
    expect(buttonWithLabel(html, "Enviar PDF")).not.toContain('disabled=""');
  });

  it("durante remoção exibe loader e status acessível mantendo URL até retorno do pai", () => {
    const { html, props } = renderCard({ tipo: "regimento", removing: true });
    const removeButton = buttonWithLabel(html, "Excluir documento — Regimento Interno");
    expect(removeButton).toContain("Excluindo documento...");
    expect(removeButton).toContain("animate-spin");
    expect(removeButton).toContain("motion-reduce:animate-none");
    expect(removeButton).toContain('disabled=""');
    expect(html).toContain('role="status"');
    expect(html).toContain("Excluindo Regimento Interno.");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(`href="${props.url}"`);
    expect(props.onRemove).not.toHaveBeenCalled();
  });

  it("não renderiza barra de progresso quando o pai não fornece estado", () => {
    const { html } = renderCard();
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain('aria-busy="false"');
  });
});
