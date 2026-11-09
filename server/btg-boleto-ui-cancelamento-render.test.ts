import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BtgCancelamentoPainel } from "../client/src/components/btg/BtgCancelamentoDialog";
import { CONFIRMACAO_CANCELAMENTO_BTG } from "../client/src/lib/btgBoletoUI";

const props: React.ComponentProps<typeof BtgCancelamentoPainel> = {
  previa: { operacaoId: "00000000-0000-4000-8000-000000000001", emissaoId: 18, estado: "preparada", codigo: "PODE_CANCELAR", mensagem: "Revise a prévia.", expiraEm: new Date(200_000), solicitadaEm: null, confirmadaEm: null, resumo: { parcelaId: 12, acordoId: 4, revisao: 1, valorCentavos: 12_345, vencimento: new Date("2026-11-10T00:00:00Z"), ambiente: "producao", contaMascara: "Ag. 001 · ••••1234", naoAlteraDivida: true } },
  resultado: null, motivo: "Solicitado pelo operador", confirmacao: CONFIRMACAO_CANCELAMENTO_BTG, ciente: true, busy: null, enviado: false, erro: null, agora: 100_000,
  onMotivo: () => {}, onConfirmacao: () => {}, onCiente: () => {}, onPreparar: () => {}, onConfirmar: () => {}, onConsultar: () => {},
};
const render = (alteracoes: Partial<typeof props> = {}) => renderToStaticMarkup(React.createElement(BtgCancelamentoPainel, { ...props, ...alteracoes }));

describe("cancelamento BTG — apresentação SSR", () => {
  it("mostra ambiente real, revisão e efeitos limitados", () => {
    const html = render();
    expect(html).toContain("PRODUÇÃO");
    expect(html).not.toContain("SANDBOX");
    expect(html).toContain("Revisão 1");
    expect(html).toContain("não serão excluídos, pagos ou cancelados");
    expect(html).toContain("não pode ser retirado do dispositivo");
    expect(html).toContain("CANCELAR COBRANÇA BTG");
    expect(html).toContain("1234");
    expect(html).not.toContain("<button type=\"submit\" disabled");
  });
  it("não habilita envio em TTL vencido, busy ou literal ausente", () => {
    for (const alteracoes of [{ agora: 200_000 }, { busy: "confirmar" as const }, { confirmacao: "CANCELAR" }, { ciente: false }, { motivo: "" }]) {
      expect(render(alteracoes)).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    }
    expect(render({ agora: 200_000 })).toContain("Prévia expirada");
  });
  it("não oferece segunda solicitação quando resultado é incerto", () => {
    const html = render({ enviado: true, resultado: { ...props.previa!, estado: "em_confirmacao", codigo: "RESULTADO_INCERTO", mensagem: "Consulte o resultado, sem repetir a solicitação." } });
    expect(html).toContain("Cancelamento em confirmação");
    expect(html).toContain("Consultar resultado no BTG");
    expect(html).not.toContain("type=\"submit\"");
    expect(html).not.toContain("Cancelado no BTG");
  });
  it("cancelado confirmado só informa histórico, sem nova confirmação", () => {
    const html = render({ enviado: true, resultado: { ...props.previa!, estado: "cancelada", codigo: "CANCELED", mensagem: "Cancelamento confirmado pelo BTG." } });
    expect(html).toContain("Cancelado no BTG");
    expect(html).not.toContain("Consultar resultado no BTG");
    expect(html).not.toContain("type=\"submit\"");
  });
});
