import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AcaoRevisarReserva,
  FormConfirmacaoReserva,
  SituacaoCanalParcela,
} from "../client/src/components/btg/CanaisUI";
import { BTGEnviarParcelasAcordoModal } from "../client/src/components/BTGEnviarParcelasAcordoModal";
import BTGRemessas from "../client/src/pages/admin/BTGRemessas";
import CNAB240 from "../client/src/pages/admin/CNAB240";
import { CONFIRMACAO_RESERVA_LOCAL } from "../client/src/lib/btgCanaisUI";

const mocks = vi.hoisted(() => ({
  role: "admin",
  busca: "acordoId=5&condominioId=3",
  fixtures: {} as Record<string, any>,
  errors: {} as Record<string, { message: string }>,
  loading: {} as Record<string, boolean>,
  handlers: {} as Record<string, any>,
  queries: [] as Array<{ name: string; input: any; options: any }>,
  mutate: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => {
  const namespace = (name: string): any =>
    new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === "useQuery")
            return (input: any, options: any) => {
              mocks.queries.push({ name, input, options });
              return {
                data:
                  options?.enabled === false ? undefined : mocks.fixtures[name],
                error: mocks.errors[name],
                isLoading: Boolean(mocks.loading[name]),
                isFetching: false,
                refetch: mocks.refetch,
              };
            };
          if (key === "useMutation")
            return (handlers: any) => {
              mocks.handlers[name] = handlers;
              return { mutate: mocks.mutate, isPending: false };
            };
          if (key === "invalidate") return mocks.invalidate;
          return namespace(name ? `${name}.${String(key)}` : String(key));
        },
      }
    );
  return {
    trpc: new Proxy(
      {},
      {
        get: (_, key) =>
          key === "useUtils" ? () => namespace("") : namespace(String(key)),
      }
    ),
  };
});
vi.mock("../client/src/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, role: mocks.role, name: "Administrador" } }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toast, warning: mocks.toast, error: mocks.toast },
}));
vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    useSearch: () => mocks.busca,
    Link: ({ href, children, ...props }: any) =>
      React.createElement("a", { href, ...props }, children),
  };
});
// Portais Radix são omitidos em SSR. Substitui somente o host do drawer;
// controles shadcn/Radix reais continuam renderizados e verificáveis.
vi.mock("../client/src/components/ui/sheet", async () => {
  const React = await import("react");
  const shell =
    (tag: string) =>
    ({ children, className }: any) =>
      React.createElement(tag, { className }, children);
  return {
    Sheet: ({ open, children }: any) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    SheetContent: shell("section"),
    SheetHeader: shell("header"),
    SheetTitle: shell("h2"),
    SheetDescription: shell("p"),
    SheetFooter: shell("footer"),
  };
});

// Vitest esbuild respeita jsx: preserve e usa runtime classic em .tsx.
// O app usa plugin React no Vite; SSR de testes fornece o mesmo namespace.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.queries = [];
  mocks.handlers = {};
  mocks.errors = {};
  mocks.loading = {};
  mocks.busca = "acordoId=5&condominioId=3";
  const livre = {
    id: 19,
    parcelaId: 19,
    acordoId: 5,
    installmentNumber: 1,
    amount: 10000,
    dueDate: new Date("2026-12-01T12:00:00Z"),
    status: "pendente",
    statusParcela: "pendente",
    statusRemessa: "nao_enviado",
    nossoNumero: "1000000018",
    nossoNumeroOrigem: "reserva_local",
    canalBancario: null,
    elegivel: true,
    elegivelCnab: true,
    condominioId: 3,
    condominioNome: "Condomínio A",
    devedorNome: "Devedor A",
  };
  mocks.fixtures = {
    "btgV2.painel": {
      emissaoHabilitada: true,
      integracao: { ambiente: "producao" },
      oauth: { ambiente: "producao" },
    },
    "acordos.getById": { id: 5, condominioId: 3 },
    "acordos.getParcelas": [livre],
    "btgCanais.situacaoAcordo": [livre],
    "btgV2.prepararEmissaoAcordo": { acordoId: 5, parcelas: [livre] },
    "btgV2.listarRemessas": [],
    "cnab.listarRemessas": [],
    "cnab.listarRetornos": [],
    "cnab.listarParcelasParaRemessaGlobal": [livre],
    "cobrancas.list": [],
    "condominios.list": [{ id: 3, name: "Condomínio A" }],
  };
});
const render = (element: React.ReactElement) => renderToStaticMarkup(element);
const noop = () => {};

describe("SSR de controles reais de canal e reserva", () => {
  it("mostra canal/reserva/número/motivo sem confundir reserva com envio", () => {
    const html = render(
      React.createElement(SituacaoCanalParcela, {
        parcela: {
          nossoNumero: "1000000018",
          nossoNumeroOrigem: "reserva_local",
          motivoBloqueio: "Origem em revisão",
        },
      })
    );
    expect(html).toContain("Reserva local · sem canal bancário");
    expect(html).toContain("1000000018");
    expect(html).toContain("Origem em revisão");
  });
  it("ação só aparece com admin e flag real", () => {
    const parcela = {
      id: 19,
      nossoNumero: "1000000018",
      podeConfirmarReserva: true,
    };
    expect(
      render(
        React.createElement(AcaoRevisarReserva, {
          parcela,
          role: "admin",
          onClick: noop,
        })
      )
    ).toContain("Confirmar reserva local");
    expect(
      render(
        React.createElement(AcaoRevisarReserva, {
          parcela,
          role: "advogado",
          onClick: noop,
        })
      )
    ).toBe("");
    expect(
      render(
        React.createElement(AcaoRevisarReserva, {
          parcela: { ...parcela, podeConfirmarReserva: false },
          role: "admin",
          onClick: noop,
        })
      )
    ).toBe("");
  });
  it("formulário tem declaração, literal, rótulos acessíveis e ação sem envio", () => {
    const props = {
      parcela: {
        id: 19,
        nossoNumero: "1000000018",
        podeConfirmarReserva: true,
      },
      role: "admin",
      confirmacao: "",
      declaracaoNaoEncaminhada: false,
      onConfirmacao: noop,
      onDeclaracao: noop,
      onSubmit: noop,
      onCancel: noop,
    };
    const html = render(React.createElement(FormConfirmacaoReserva, props));
    expect(html).toContain('for="reserva-nao-encaminhada"');
    expect(html).toContain('id="reserva-confirmacao"');
    expect(html).toContain(CONFIRMACAO_RESERVA_LOCAL);
    expect(html).toContain("não foi enviada, registrada ou distribuída");
    expect(html).toContain("Não envia cobrança");
    expect(html).toMatch(
      /<button[^>]*\sdisabled=""[^>]*>Confirmar somente a reserva/
    );
    const confirmado = render(
      React.createElement(FormConfirmacaoReserva, {
        ...props,
        confirmacao: CONFIRMACAO_RESERVA_LOCAL,
        declaracaoNaoEncaminhada: true,
      })
    );
    expect(confirmado).not.toMatch(
      /<button[^>]*\sdisabled=""[^>]*>Confirmar somente a reserva/
    );
    const erro = render(
      React.createElement(FormConfirmacaoReserva, {
        ...props,
        erro: "A numeração mudou. Revise novamente.",
      })
    );
    expect(erro).toContain("A numeração mudou. Revise novamente.");
    expect(erro).toContain('role="alert"');
  });
});

describe("SSR do fluxo principal API", () => {
  it("revisão mantém contexto e exige seleção sem simular produção nem enviar automaticamente", () => {
    const html = render(
      React.createElement(BTGEnviarParcelasAcordoModal, {
        open: true,
        acordoId: 5,
        onOpenChange: noop,
      })
    );
    expect(html).toContain("Enviar ao BTG pela API");
    expect(html).toContain("Produção");
    expect(html).toContain("Acordo #5");
    expect(html).toContain("Reserva local");
    expect(html).toContain("0 parcela(s)");
    expect(html).toContain("Não há envio automático ao devedor");
    expect(html).not.toContain("Resultado da simulação Sandbox");
    expect(html).toContain("/admin/cnab240?acordoId=5&amp;condominioId=3");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("bloqueios por outro canal não habilitam seleção e apresentam motivo", () => {
    const blocked = {
      ...mocks.fixtures["acordos.getParcelas"][0],
      canalBancario: "cnab240",
      elegivel: false,
      motivoBloqueio: "Parcela vinculada a remessa CNAB",
      podeConfirmarReserva: false,
    };
    mocks.fixtures["btgV2.prepararEmissaoAcordo"] = {
      acordoId: 5,
      parcelas: [blocked],
    };
    mocks.fixtures["btgCanais.situacaoAcordo"] = [blocked];
    const html = render(
      React.createElement(BTGEnviarParcelasAcordoModal, {
        open: true,
        acordoId: 5,
        onOpenChange: noop,
      })
    );
    expect(html).toContain("Parcela vinculada a remessa CNAB");
    expect(html).toContain("Nenhuma parcela elegível");
    expect(html).toMatch(
      /<button(?=[^>]*id="api-parcela-19")(?=[^>]*\sdisabled="")[^>]*>/
    );
    expect(html).not.toContain("Confirmar reserva local");
  });
  it("prévia bloqueada não é sobrescrita pela situação geral elegível", () => {
    mocks.fixtures["btgV2.prepararEmissaoAcordo"].parcelas[0] = {
      ...mocks.fixtures["acordos.getParcelas"][0],
      elegivel: false,
      motivoBloqueio: "Conta não habilitada",
    };
    const html = render(
      React.createElement(BTGEnviarParcelasAcordoModal, {
        open: true,
        acordoId: 5,
        onOpenChange: noop,
      })
    );
    expect(html).toContain("Conta não habilitada");
    expect(html).toContain("Nenhuma parcela elegível");
  });
  it("reserva antiga pode ser revista mesmo com preparação API indisponível", () => {
    const antiga = {
      ...mocks.fixtures["acordos.getParcelas"][0],
      nossoNumeroOrigem: null,
      elegivel: false,
      podeConfirmarReserva: true,
      motivoBloqueio: "Numeração de origem não confirmada",
    };
    mocks.fixtures["btgV2.prepararEmissaoAcordo"] = undefined;
    mocks.errors["btgV2.prepararEmissaoAcordo"] = {
      message: "Condomínio sem conta ativa",
    };
    mocks.fixtures["btgCanais.situacaoAcordo"] = [antiga];
    const html = render(
      React.createElement(BTGEnviarParcelasAcordoModal, {
        open: true,
        acordoId: 5,
        onOpenChange: noop,
      })
    );
    expect(html).toContain("Condomínio sem conta ativa");
    expect(html).toContain("Confirmar reserva local");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("perfil não admin não consulta situação administrativa nem oferece emissão", () => {
    mocks.role = "advogado";
    const html = render(
      React.createElement(BTGEnviarParcelasAcordoModal, {
        open: true,
        acordoId: 5,
        onOpenChange: noop,
      })
    );
    expect(html).toContain("exclusivos do administrador");
    expect(
      mocks.queries.find(q => q.name === "btgCanais.situacaoAcordo")?.options
        .enabled
    ).toBe(false);
    expect(html).not.toContain("Gerar remessa CNAB");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("invalida todos os caches após confirmar reserva e não chama emissor", async () => {
    render(
      React.createElement(BTGEnviarParcelasAcordoModal, {
        open: true,
        acordoId: 5,
        onOpenChange: noop,
      })
    );
    await mocks.handlers["btgCanais.confirmarReservaLocal"].onSuccess({
      success: true,
      parcelaId: 19,
    });
    expect(mocks.invalidate).toHaveBeenCalledTimes(4);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringContaining("Nenhuma cobrança foi enviada")
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("loading/empty/error são explícitos", () => {
    mocks.loading["btgV2.prepararEmissaoAcordo"] = true;
    expect(
      render(
        React.createElement(BTGEnviarParcelasAcordoModal, {
          open: true,
          acordoId: 5,
          onOpenChange: noop,
        })
      )
    ).toContain("Carregando revisão");
    mocks.loading = {};
    mocks.fixtures["acordos.getParcelas"] = [];
    mocks.fixtures["btgCanais.situacaoAcordo"] = [];
    mocks.fixtures["btgV2.prepararEmissaoAcordo"] = {
      acordoId: 5,
      parcelas: [],
    };
    expect(
      render(
        React.createElement(BTGEnviarParcelasAcordoModal, {
          open: true,
          acordoId: 5,
          onOpenChange: noop,
        })
      )
    ).toContain("Nenhuma parcela encontrada");
  });
  it("gestão oferece API principal e caminho CNAB real mesmo com API bloqueada", () => {
    mocks.fixtures["btgV2.painel"].emissaoHabilitada = false;
    const html = render(React.createElement(BTGRemessas));
    expect(html).toContain("Enviar ao BTG pela API");
    expect(html).toContain('href="/admin/cnab240"');
    expect(html).toContain("Conclua a configuração");
  });
});

describe("SSR CNAB existente: contexto funcional e bloqueios", () => {
  it("consome acordo/condomínio da rota e mantém fila selecionável sem emitir", () => {
    mocks.fixtures["cnab.listarParcelasParaRemessaGlobal"].push({
      ...mocks.fixtures["cnab.listarParcelasParaRemessaGlobal"][0],
      parcelaId: 77,
      acordoId: 88,
      devedorNome: "Não pertence ao contexto",
    });
    const html = render(React.createElement(CNAB240));
    expect(html).toContain("Revisando parcelas do acordo #5");
    expect(html).toContain("Devedor A");
    expect(html).not.toContain("Não pertence ao contexto");
    expect(html).toContain("Selecionar parcela 1 do acordo 5 para CNAB");
    expect(html).toContain("Um condomínio e um canal por lote");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("API incerta bloqueia CNAB e mostra motivo real do backend", () => {
    mocks.fixtures["cnab.listarParcelasParaRemessaGlobal"][0] = {
      ...mocks.fixtures["cnab.listarParcelasParaRemessaGlobal"][0],
      elegivelCnab: false,
      motivoBloqueioCnab: "Parcela reservada pela API em estado incerto",
      codigoBloqueioCnab: "api_vinculada",
    };
    const html = render(React.createElement(CNAB240));
    expect(html).toContain("Parcela reservada pela API em estado incerto");
    expect(html).toContain("Reservada/enviada pela API BTG v2");
    expect(html).toMatch(/<button[^>]*role="checkbox"[^>]*disabled/);
  });
});
