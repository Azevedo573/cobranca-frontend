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
import { readFileSync } from "node:fs";
import {
  AcaoRevisarFalhaBtg,
  BtgRecuperacaoDialogConteudo,
  BtgRecuperacaoPainel,
} from "../client/src/components/btg/BtgRecuperacaoDialog";
import BTGRemessas from "../client/src/pages/admin/BTGRemessas";
import {
  CONFIRMACAO_RECUPERACAO_BTG,
  CONFIRMACAO_REENVIO_BTG,
  ERRO_ANALISE_BTG,
  ERRO_CONFIRMACAO_BTG,
  alvoRecuperacaoDoItem,
  analiseCorrespondeAoAlvo,
  analiseRecuperacaoExpirada,
  copiarAnaliseRecuperacao,
  criarGuardaRecuperacao,
  inputAnaliseRecuperacao,
  podeConfirmarRecuperacaoUI,
  type BtgRecuperacaoAlvo,
  type BtgRecuperacaoAnalise,
} from "../client/src/components/btg/btgRecuperacaoUI";

const mocks = vi.hoisted(() => ({
  stateIndex: 0,
  seed: {} as Record<number, any>,
  stateChanges: [] as Array<{ index: number; value: any }>,
  effects: [] as Array<() => void | (() => void)>,
  buttons: [] as any[],
  forms: [] as any[],
  fixtures: {} as Record<string, any>,
  queries: [] as Array<{ name: string; input: any; options: any }>,
  mutations: {} as Record<string, any>,
  calls: [] as Array<{ name: string; input: any }>,
  options: {} as Record<string, any>,
  invalidated: [] as string[],
  reset: vi.fn(),
  mutate: vi.fn(),
  close: null as null | ((open: boolean) => void),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof React>("react");
  return {
    ...actual,
    createElement: (type: any, props: any, ...children: any[]) => {
      if (type === "form") mocks.forms.push(props);
      return actual.createElement(type, props, ...children);
    },
    useState: (initial: any) => {
      const index = mocks.stateIndex++;
      const [state, setter] = actual.useState(
        index in mocks.seed ? mocks.seed[index] : initial
      );
      return [
        state,
        (value: any) => {
          mocks.stateChanges.push({ index, value });
          setter(value);
        },
      ];
    },
    useEffect: (effect: () => void | (() => void), deps: any[]) => {
      mocks.effects.push(effect);
      actual.useEffect(effect, deps);
    },
  };
});
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
                isLoading: false,
                isFetching: false,
                refetch: vi.fn(),
              };
            };
          if (key === "useMutation")
            return (options: any) => {
              mocks.options[name] = options;
              return {
                isPending: false,
                reset: mocks.reset,
                mutate: mocks.mutate,
                mutateAsync: (input: any) => {
                  mocks.calls.push({ name, input });
                  return (
                    mocks.mutations[name]?.(input) ?? Promise.resolve(undefined)
                  );
                },
              };
            };
          if (key === "invalidate")
            return () => {
              mocks.invalidated.push(name);
              return Promise.resolve();
            };
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
vi.mock("../client/src/components/ui/button", async importOriginal => {
  const original =
    await importOriginal<typeof import("../client/src/components/ui/button")>();
  const React = await import("react");
  return {
    ...original,
    Button: (props: any) => {
      mocks.buttons.push(props);
      return React.createElement(original.Button, props);
    },
  };
});
vi.mock("../client/src/components/ui/dialog", async importOriginal => {
  const React = await import("react");
  const original =
    await importOriginal<typeof import("../client/src/components/ui/dialog")>();
  const host =
    (tag: string) =>
    ({ children, className }: any) =>
      React.createElement(tag, { className }, children);
  return {
    ...original,
    Dialog: ({ open, children, onOpenChange }: any) => {
      mocks.close = onOpenChange;
      return open ? React.createElement(React.Fragment, null, children) : null;
    },
    DialogContent: host("section"),
    DialogHeader: host("header"),
    DialogTitle: host("h2"),
    DialogDescription: host("p"),
  };
});
vi.mock("../client/src/components/ui/sheet", async () => {
  const React = await import("react");
  const host =
    (tag: string) =>
    ({ children, className }: any) =>
      React.createElement(tag, { className }, children);
  return {
    Sheet: ({ open, children }: any) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    SheetContent: host("section"),
    SheetHeader: host("header"),
    SheetTitle: host("h2"),
    SheetDescription: host("p"),
    SheetFooter: host("footer"),
  };
});
vi.mock("../client/src/components/btg/useConfirmarReservaLocal", () => ({
  useConfirmarReservaLocal: () => ({
    role: "admin",
    abrir: vi.fn(),
    dialogProps: { open: false, pendente: false, parcela: {} },
  }),
}));
vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children }: any) =>
      React.createElement("a", { href }, children),
  };
});

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
const noop = () => {};
const agora = new Date("2026-11-09T15:00:00Z").getTime();
const alvo: BtgRecuperacaoAlvo = {
  itemId: 77,
  parcelaId: 23,
  remessaId: 2,
  emissaoId: 501,
};
const itemFalha = {
  id: 77,
  parcelaAcordoId: 23,
  btgCobrancaEmitidaId: 501,
  resultado: "falha",
};
const analise = (
  override: Partial<BtgRecuperacaoAnalise> = {}
): BtgRecuperacaoAnalise => ({
  analiseId: "analise-ficticia",
  emissaoId: 501,
  revisaoAtual: 1,
  acao: "reenviar",
  codigo: "FALHA_ANTES_POST_COMPROVADA",
  mensagem: "Falha antes do envio comprovada por evidência persistida.",
  expiraEm: new Date(agora + 60_000),
  resumo: {
    parcelaId: 23,
    acordoId: 41,
    installmentNumber: 1,
    valorCentavos: 12345,
    vencimento: new Date("2026-12-01T12:00:00Z"),
    ambiente: "producao",
    contaMascara: "****1234",
  },
  novaRevisao: 2,
  ...override,
});
const basePainel = () => ({
  alvo,
  analise: analise(),
  confirmacao: "",
  ciente: false,
  pendente: null,
  erro: null,
  resultado: null,
  agora,
  onAnalisar: noop,
  onConfirmar: noop,
  onConfirmacao: noop,
  onCiente: noop,
  onClose: noop,
});
const render = (component: any, props: any) => {
  mocks.stateIndex = 0;
  return renderToStaticMarkup(React.createElement(component, props));
};
const texto = (children: any): string =>
  typeof children === "string"
    ? children
    : Array.isArray(children)
      ? children.map(texto).join("")
      : children?.props
        ? texto(children.props.children)
        : "";
const botao = (label: string) =>
  mocks.buttons.find(b => texto(b.children) === label)!;
const flush = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.seed = {};
  mocks.stateIndex = 0;
  mocks.stateChanges = [];
  mocks.effects = [];
  mocks.buttons = [];
  mocks.calls = [];
  mocks.queries = [];
  mocks.options = {};
  mocks.forms = [];
  mocks.mutations = {};
  mocks.invalidated = [];
  mocks.close = null;
  mocks.fixtures = {
    "auth.me": {
      id: 1,
      role: "admin",
      isActive: 1,
      isDeleted: 0,
      profileId: null,
    },
    "btgV2.painel": {
      emissaoHabilitada: false,
      integracao: { ambiente: "sandbox" },
    },
    "condominios.list": [],
    "btgV2.listarRemessas": [],
    "btgDiagnosticos.listarPorRemessa": [],
    "btgV2.detalheRemessa": {
      remessa: {
        id: 2,
        status: "falha",
        totalSelecionado: 2,
        totalEmitido: 1,
        totalFalha: 1,
        valorTotalCentavos: 24690,
        criadaEm: new Date(agora),
      },
      condominioNome: "Condomínio sintético",
      conta: null,
      itens: [
        {
          item: { ...itemFalha, installmentNumber: 1, valorCentavos: 12345 },
          emissao: null,
          parcela: { id: 23, status: "pendente", dueDate: new Date(agora) },
          acordo: { id: 41 },
          devedor: { name: "Cadastro sintético" },
        },
        {
          item: {
            ...itemFalha,
            id: 78,
            parcelaAcordoId: 24,
            resultado: "emitida",
            installmentNumber: 2,
            valorCentavos: 12345,
          },
          emissao: null,
          parcela: { id: 24, status: "pendente", dueDate: new Date(agora) },
          acordo: { id: 41 },
          devedor: { name: "Cadastro sintético" },
        },
      ],
    },
  };
});

describe("Recuperação BTG: seleção individual e contrato de apresentação", () => {
  it("obtém FK explícita do item, nunca usa seu ID ou uma sequência como canônica", () => {
    expect(alvoRecuperacaoDoItem(itemFalha, 2)).toEqual(alvo);
    expect(
      alvoRecuperacaoDoItem({ ...itemFalha, btgCobrancaEmitidaId: null }, 2)
    ).toEqual({ ...alvo, emissaoId: null });
    expect(inputAnaliseRecuperacao(alvo)).toEqual({
      parcelaId: 23,
      remessaId: 2,
    });
    expect(inputAnaliseRecuperacao({ ...alvo, emissaoId: null })).toEqual({
      parcelaId: 23,
      remessaId: 2,
    });
  });
  it.each(["emitida", "ja_existia", "paga", "cancelada", "pendente"])(
    "não oferece revisão de %s",
    resultado => {
      expect(alvoRecuperacaoDoItem({ ...itemFalha, resultado }, 2)).toBeNull();
      expect(
        render(AcaoRevisarFalhaBtg, {
          item: { ...itemFalha, resultado },
          remessaId: 2,
          habilitada: true,
          onAbrir: noop,
        })
      ).toBe("");
    }
  );
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "falha fechada para identificador inválido %s",
    id => {
      expect(
        alvoRecuperacaoDoItem({ ...itemFalha, parcelaAcordoId: id }, 2)
      ).toBeNull();
      expect(
        alvoRecuperacaoDoItem({ ...itemFalha, btgCobrancaEmitidaId: id }, 2)
      ).toBeNull();
    }
  );
  it("item antigo sem vínculo permite consulta somente da parcela/remessa", () => {
    const onAbrir = vi.fn();
    const html = render(AcaoRevisarFalhaBtg, {
      item: { ...itemFalha, btgCobrancaEmitidaId: null },
      remessaId: 2,
      habilitada: true,
      onAbrir,
    });
    expect(html).toContain("Revisar falha / Consultar BTG");
    botao("Revisar falha / Consultar BTG").onClick();
    expect(onAbrir).toHaveBeenCalledWith({ ...alvo, emissaoId: null });
    expect(mocks.calls).toEqual([]);
  });
  it("contexto desabilitado/admin inelegível não habilita a ação", () => {
    expect(
      render(AcaoRevisarFalhaBtg, {
        item: itemFalha,
        remessaId: 2,
        habilitada: false,
        onAbrir: noop,
      })
    ).toBe("");
    const onAbrir = vi.fn();
    const html = render(AcaoRevisarFalhaBtg, {
      item: itemFalha,
      remessaId: 2,
      habilitada: true,
      disabled: true,
      onAbrir,
    });
    expect(html).toMatch(/<button[^>]*disabled=""/);
    botao("Revisar falha / Consultar BTG").onClick();
    expect(onAbrir).not.toHaveBeenCalled();
  });
  it("allowlist não transporta payload/PII inesperados para o estado local", () => {
    const response = {
      ...analise(),
      payload: "CPF-PAYLOAD",
      resposta: "RETORNO-CRU",
      resumo: {
        ...analise().resumo,
        cpf: "CPF-OCULTO",
        endereco: "ENDERECO-OCULTO",
      },
    };
    const local = copiarAnaliseRecuperacao(response);
    expect(JSON.stringify(local)).not.toMatch(
      /CPF|PAYLOAD|RETORNO-CRU|ENDERECO/
    );
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      analise: response,
    });
    expect(html).not.toMatch(
      /CPF-PAYLOAD|RETORNO-CRU|CPF-OCULTO|ENDERECO-OCULTO/
    );
    expect(html).not.toMatch(/<pre\b|<a\b|<script\b/);
  });
});

describe("Recuperação BTG: gates puros e prévia SSR", () => {
  const valido = () => ({
    analise: analise(),
    alvo,
    confirmacao: CONFIRMACAO_REENVIO_BTG,
    ciente: true,
    pendente: false,
    agora,
  });
  it("exige literal exato e ciência positiva para cada ação", () => {
    expect(podeConfirmarRecuperacaoUI(valido())).toBe(true);
    for (const confirmacao of [
      "",
      "REENVIAR REMESSA",
      "reenviar parcela btg",
      ` ${CONFIRMACAO_REENVIO_BTG}`,
      `${CONFIRMACAO_REENVIO_BTG} `,
      CONFIRMACAO_RECUPERACAO_BTG,
    ]) {
      expect(podeConfirmarRecuperacaoUI({ ...valido(), confirmacao })).toBe(
        false
      );
    }
    expect(podeConfirmarRecuperacaoUI({ ...valido(), ciente: false })).toBe(
      false
    );
    expect(podeConfirmarRecuperacaoUI({ ...valido(), pendente: true })).toBe(
      false
    );
    expect(podeConfirmarRecuperacaoUI({ ...valido(), analise: null })).toBe(
      false
    );
    const recuperacao = analise({
      acao: "recuperar_vinculo",
      novaRevisao: null,
    });
    expect(
      podeConfirmarRecuperacaoUI({ ...valido(), analise: recuperacao })
    ).toBe(false);
    expect(
      podeConfirmarRecuperacaoUI({
        ...valido(),
        analise: recuperacao,
        confirmacao: CONFIRMACAO_RECUPERACAO_BTG,
      })
    ).toBe(true);
  });
  it("bloqueada nunca habilita confirmação, inclusive com literal e ciente", () => {
    const bloqueada = analise({
      acao: "bloqueada",
      codigo: "HISTORICO_SEM_PROVA",
      mensagem:
        "Retorno antigo descartado; lista vazia não comprova inexistência.",
      novaRevisao: null,
    });
    expect(
      podeConfirmarRecuperacaoUI({ ...valido(), analise: bloqueada })
    ).toBe(false);
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      analise: bloqueada,
      confirmacao: CONFIRMACAO_REENVIO_BTG,
      ciente: true,
    });
    expect(html).toContain("Reenvio bloqueado");
    expect(html).toContain("consulta vazia não libera");
    expect(html).not.toContain('id="btg-recuperacao-literal"');
    expect(html).not.toContain("Confirmar reenvio individual");
  });
  it("expiração exata e prazo inválido bloqueiam sem depender de revalidação do navegador", () => {
    expect(analiseRecuperacaoExpirada(analise(), agora + 59_999)).toBe(false);
    expect(analiseRecuperacaoExpirada(analise(), agora + 60_000)).toBe(true);
    expect(
      analiseRecuperacaoExpirada(analise({ expiraEm: new Date(NaN) }), agora)
    ).toBe(true);
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      confirmacao: CONFIRMACAO_REENVIO_BTG,
      ciente: true,
      agora: agora + 60_000,
    });
    expect(html).toContain("Prévia expirada");
    expect(botao("Confirmar reenvio individual").disabled).toBe(true);
    expect(html).toContain("O servidor revalida expiração");
  });
  it("contexto da parcela divergente, revisão incoerente e ação desconhecida falham fechados", () => {
    for (const invalida of [
      analise({ resumo: { ...analise().resumo, parcelaId: 99 } }),
      analise({ novaRevisao: 1 }),
      analise({ revisaoAtual: 0 }),
      analise({ acao: "desconhecida" as any }),
      analise({
        resumo: { ...analise().resumo, ambiente: "desconhecido" as any },
      }),
    ]) {
      expect(analiseCorrespondeAoAlvo(invalida, alvo)).toBe(false);
      expect(
        podeConfirmarRecuperacaoUI({ ...valido(), analise: invalida })
      ).toBe(false);
    }
    // A canônica pode avançar entre revisões. O backend resolve, não a UI histórica.
    expect(
      analiseCorrespondeAoAlvo(
        analise({ emissaoId: 900, revisaoAtual: 2, novaRevisao: 3 }),
        alvo
      )
    ).toBe(true);
  });
  it("Produção expõe risco de título real e todos os campos controlados", () => {
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      confirmacao: CONFIRMACAO_REENVIO_BTG,
      ciente: true,
    });
    for (const text of [
      "PRODUÇÃO",
      "título real",
      "Acordo #41",
      "Parcela 1",
      "123,45",
      "****1234",
      "revisão 1",
      "Nova revisão",
      "Decisão da análise",
      "FALHA_ANTES_POST_COMPROVADA",
    ])
      expect(html).toContain(text);
    expect(html).toContain('for="btg-recuperacao-literal"');
    expect(html).toContain('for="btg-recuperacao-ciente"');
    expect(botao("Confirmar reenvio individual").disabled).toBe(false);
    expect(mocks.calls).toEqual([]);
  });
  it("sandbox é explícito e não apresentado como Produção", () => {
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      analise: analise({
        resumo: {
          ...analise().resumo,
          ambiente: "sandbox",
          installmentNumber: 0,
        },
      }),
    });
    expect(html).toContain("SANDBOX: confirmar");
    expect(html).toContain("Entrada");
    expect(html).not.toContain("ATENÇÃO — PRODUÇÃO");
    expect(botao("Confirmar reenvio individual").disabled).toBe(true);
  });
  it("recuperação de vínculo usa outro literal e informa ausência de novo POST", () => {
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      analise: analise({ acao: "recuperar_vinculo", novaRevisao: null }),
      confirmacao: CONFIRMACAO_RECUPERACAO_BTG,
      ciente: true,
    });
    expect(html).toContain(CONFIRMACAO_RECUPERACAO_BTG);
    expect(html).toContain("Não cria outro título nem executa novo POST");
    expect(html).not.toContain("Confirmar reenvio individual");
    expect(botao("Confirmar recuperação do vínculo").disabled).toBe(false);
  });
  it("busy bloqueia confirmação e consulta dupla, mas permite fechar sem prometer cancelamento", () => {
    render(BtgRecuperacaoPainel, {
      ...basePainel(),
      pendente: "confirmacao",
      confirmacao: CONFIRMACAO_REENVIO_BTG,
      ciente: true,
    });
    expect(botao("Confirmar reenvio individual").disabled).toBe(true);
    expect(botao("Analisar / Consultar novamente").disabled).toBe(true);
    expect(botao("Fechar (não cancela a operação)").disabled).toBeUndefined();
  });
  it("resultado incerto não é transformado em sucesso financeiro nem oferece outra confirmação", () => {
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      analise: null,
      resultado: {
        acao: "reenviar",
        emissaoId: 900,
        status: "incerta",
        mensagem: "Situação incerta; consulta necessária.",
      },
    });
    expect(html).toContain("Estado: incerta");
    expect(html).not.toMatch(/sucesso|Estado: paga|baixa registrada/);
    expect(html).not.toContain("Confirmar reenvio individual");
  });
  it.each(["reservada", "falha", "incerta", "pendente"])(
    "resultado %s permanece sem confirmação bancária e sem verde de sucesso",
    status => {
      const html = render(BtgRecuperacaoPainel, {
        ...basePainel(),
        analise: null,
        resultado: {
          acao: "reenviar",
          emissaoId: 900,
          status,
          mensagem: "Tentativa preservada para revisão.",
        },
      });
      expect(html).toContain(`Estado: ${status}`);
      expect(html).toContain("Sem confirmação de emissão pelo banco");
      expect(html).not.toMatch(
        /text-emerald|bg-emerald|sucesso|baixa registrada/
      );
      expect(html).not.toContain("Confirmar reenvio individual");
    }
  );
  it("recuperar título já pago não declara baixa automática", () => {
    const html = render(BtgRecuperacaoPainel, {
      ...basePainel(),
      analise: null,
      resultado: {
        acao: "recuperar_vinculo",
        emissaoId: 501,
        status: "emitida",
        mensagem: "Vínculo recuperado.",
      },
    });
    expect(html).toContain("Vínculo recuperado sem novo POST");
    expect(html).toContain("esta ação não aplica baixa");
    expect(html).toContain("pagamento exige conciliação própria");
    expect(html).not.toContain("baixa registrada");
  });
});

describe("Recuperação BTG: tela existente e controlador sem rede", () => {
  it("remessa mista expõe somente revisão da falha e preserva detalhe e diagnóstico", () => {
    mocks.seed[7] = 2;
    const html = render(BTGRemessas, {});
    expect(html.match(/Revisar falha \/ Consultar BTG/g)).toHaveLength(1);
    expect(html).toContain("Itens da remessa");
    expect(html).toContain("Cadastro sintético");
    expect(html).toContain("Sem captura histórica");
    expect(html).toContain("Parcela 2");
    expect(mocks.calls).toEqual([]);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each(["remessa", "ambiente", "parcela", "emissao", "versao", "resultado"])(
    "contexto antigo de %s nunca monta a análise selecionada",
    mudanca => {
      const selecionada = {
        alvo: { ...alvo },
        contexto: "1:admin:1:0:null:todos:SANDBOX",
        versaoItem: "undefined",
      };
      if (mudanca === "remessa") selecionada.alvo.remessaId = 1;
      if (mudanca === "ambiente")
        selecionada.contexto = "1:admin:1:0:null:todos:PRODUÇÃO";
      if (mudanca === "parcela") selecionada.alvo.parcelaId = 99;
      if (mudanca === "emissao") selecionada.alvo.emissaoId = 999;
      if (mudanca === "versao") selecionada.versaoItem = "ontem";
      if (mudanca === "resultado")
        mocks.fixtures["btgV2.detalheRemessa"].itens[0].item.resultado =
          "emitida";
      mocks.seed = { 7: 2, 9: selecionada };
      const html = render(BTGRemessas, {});
      expect(html).not.toContain(
        "Análise administrativa individual e auditada."
      );
      expect(mocks.options["btgRecuperacao.analisar"]).toBeUndefined();
      expect(mocks.calls).toEqual([]);
    }
  );
  it.each([
    { id: 1, role: "advogado", isActive: 1, isDeleted: 0 },
    { id: 1, role: "admin", isActive: 0, isDeleted: 0 },
    { id: 1, role: "admin", isActive: 1, isDeleted: 1 },
    null,
  ])("não oferece revisão a contexto inelegível %j", user => {
    mocks.fixtures["auth.me"] = user;
    mocks.seed[7] = 2;
    const html = render(BTGRemessas, {});
    expect(html).not.toContain("Revisar falha / Consultar BTG");
    expect(mocks.calls).toEqual([]);
  });
  it("montar diálogo não consulta ou emite; os dois endpoints são mutações sem retry", () => {
    const html = render(BtgRecuperacaoDialogConteudo, {
      alvo: { ...alvo, emissaoId: null },
      contexto: "admin:2",
      onClose: noop,
    });
    expect(html).toContain("Item histórico sem vínculo");
    expect(html).toContain("somente leitura");
    expect(mocks.calls).toEqual([]);
    expect(mocks.queries).toEqual([]);
    expect(mocks.options["btgRecuperacao.analisar"]).toEqual({
      retry: false,
      gcTime: 0,
    });
    expect(mocks.options["btgRecuperacao.confirmar"]).toEqual({
      retry: false,
      gcTime: 0,
    });
  });
  it("resposta divergente da parcela é descartada mesmo que marque reenvio elegível", async () => {
    mocks.mutations["btgRecuperacao.analisar"] = () =>
      Promise.resolve(
        analise({
          resumo: { ...analise().resumo, parcelaId: 99 },
        })
      );
    render(BtgRecuperacaoDialogConteudo, {
      alvo,
      contexto: "admin:2",
      onClose: noop,
    });
    botao("Analisar falha / Consultar BTG").onClick();
    await flush();
    expect(mocks.stateChanges).toContainEqual({
      index: 4,
      value: ERRO_ANALISE_BTG,
    });
    expect(
      mocks.stateChanges.some(
        s => s.index === 0 && s.value?.acao === "reenviar"
      )
    ).toBe(false);
    expect(mocks.calls).toHaveLength(1);
  });
  it("reserva síncrona barra double click antes do rerender e input só contém parcela/remessa", async () => {
    const request = deferred<BtgRecuperacaoAnalise>();
    mocks.mutations["btgRecuperacao.analisar"] = () => request.promise;
    render(BtgRecuperacaoDialogConteudo, {
      alvo: { ...alvo, emissaoId: null },
      contexto: "admin:2",
      onClose: noop,
    });
    const click = botao("Analisar falha / Consultar BTG").onClick;
    click();
    click();
    expect(mocks.calls).toEqual([
      {
        name: "btgRecuperacao.analisar",
        input: { parcelaId: 23, remessaId: 2 },
      },
    ]);
    request.resolve(analise());
    await flush();
    expect(
      mocks.stateChanges.some(
        s => s.index === 0 && s.value?.analiseId === "analise-ficticia"
      )
    ).toBe(true);
    expect(mocks.calls.some(c => c.name.endsWith("confirmar"))).toBe(false);
  });
  it.each(["sucesso", "erro"])(
    "fechar limpa análise/literal/ciência e descarta resposta tardia de %s",
    async modo => {
      const request = deferred<BtgRecuperacaoAnalise>();
      const onClose = vi.fn();
      mocks.mutations["btgRecuperacao.analisar"] = () => request.promise;
      render(BtgRecuperacaoDialogConteudo, {
        alvo,
        contexto: "admin:2",
        onClose,
      });
      mocks.effects.forEach(effect => effect());
      botao("Analisar falha / Consultar BTG").onClick();
      mocks.close!(false);
      expect(onClose).toHaveBeenCalledOnce();
      expect(mocks.stateChanges).toContainEqual({ index: 0, value: null });
      expect(mocks.stateChanges).toContainEqual({ index: 1, value: "" });
      expect(mocks.stateChanges).toContainEqual({ index: 2, value: false });
      mocks.stateChanges = [];
      if (modo === "sucesso") request.resolve(analise());
      else request.reject(new Error("CPF-SEGREDO"));
      await flush();
      expect(mocks.stateChanges).toEqual([]);
    }
  );
  it("unmount/troca de contexto invalida resultados tardios e nova ativação não aceita pedido antigo", async () => {
    const guarda = criarGuardaRecuperacao();
    const pedido = guarda.iniciar()!;
    expect(guarda.iniciar()).toBeNull();
    guarda.encerrar();
    guarda.ativar();
    expect(guarda.aceita(pedido)).toBe(false);
    const novo = guarda.iniciar()!;
    guarda.finalizar(pedido);
    expect(guarda.iniciar()).toBeNull();
    guarda.finalizar(novo);
    expect(guarda.iniciar()).not.toBeNull();
    const request = deferred<BtgRecuperacaoAnalise>();
    mocks.mutations["btgRecuperacao.analisar"] = () => request.promise;
    render(BtgRecuperacaoDialogConteudo, {
      alvo,
      contexto: "admin:2",
      onClose: noop,
    });
    const cleanups = mocks.effects.map(effect => effect());
    botao("Analisar falha / Consultar BTG").onClick();
    cleanups.forEach(cleanup => cleanup?.());
    mocks.stateChanges = [];
    request.resolve(analise());
    await flush();
    expect(mocks.stateChanges).toEqual([]);
  });
  it("erro de análise mostra somente mensagem segura e nunca libera envio", async () => {
    mocks.mutations["btgRecuperacao.analisar"] = () =>
      Promise.reject(new Error("CPF-SEGREDO"));
    render(BtgRecuperacaoDialogConteudo, {
      alvo,
      contexto: "admin:2",
      onClose: noop,
    });
    botao("Analisar falha / Consultar BTG").onClick();
    await flush();
    expect(mocks.stateChanges).toContainEqual({
      index: 4,
      value: ERRO_ANALISE_BTG,
    });
    expect(JSON.stringify(mocks.stateChanges)).not.toContain("CPF-SEGREDO");
    expect(mocks.calls).toHaveLength(1);
  });
  it.each(["reenviar", "recuperar_vinculo"] as const)(
    "confirmar %s consome prévia, envia um token/literal e invalida caches",
    async acao => {
      const literal =
        acao === "reenviar"
          ? CONFIRMACAO_REENVIO_BTG
          : CONFIRMACAO_RECUPERACAO_BTG;
      mocks.seed = {
        0: analise({
          acao,
          novaRevisao: acao === "reenviar" ? 2 : null,
          expiraEm: new Date(Date.now() + 60_000),
        }),
        1: literal,
        2: true,
      };
      const request = deferred<any>();
      mocks.mutations["btgRecuperacao.confirmar"] = () => request.promise;
      render(BtgRecuperacaoDialogConteudo, {
        alvo,
        contexto: "admin:2",
        onClose: noop,
      });
      // O form é inspecionado pelo React SSR: botão submit não chama backend durante render.
      const button = botao(
        acao === "reenviar"
          ? "Confirmar reenvio individual"
          : "Confirmar recuperação do vínculo"
      );
      expect(button.disabled).toBe(false);
      mocks.forms[0].onSubmit({ preventDefault: noop });
      mocks.forms[0].onSubmit({ preventDefault: noop });
      expect(mocks.calls).toEqual([
        {
          name: "btgRecuperacao.confirmar",
          input: {
            analiseId: "analise-ficticia",
            confirmacao: literal,
            ciente: true,
          },
        },
      ]);
      expect(mocks.stateChanges).toContainEqual({ index: 0, value: null });
      expect(mocks.stateChanges).toContainEqual({ index: 1, value: "" });
      expect(mocks.stateChanges).toContainEqual({ index: 2, value: false });
      request.resolve({
        acao,
        emissaoId: 900,
        status: "incerta",
        mensagem: "Situação incerta; consulte o banco.",
      });
      await flush();
      expect(mocks.stateChanges).toContainEqual({
        index: 5,
        value: {
          acao,
          emissaoId: 900,
          status: "incerta",
          mensagem: "Situação incerta; consulte o banco.",
        },
      });
      expect(mocks.invalidated).toEqual(
        expect.arrayContaining([
          "btgV2",
          "btgDiagnosticos",
          "acordos",
          "btgCanais",
        ])
      );
    }
  );
  it.each(["sucesso", "erro"])(
    "confirmação tardia de %s não atualiza tela fechada, mas invalida caches",
    async modo => {
      const request = deferred<any>();
      mocks.seed = {
        0: analise({ expiraEm: new Date(Date.now() + 60_000) }),
        1: CONFIRMACAO_REENVIO_BTG,
        2: true,
      };
      mocks.mutations["btgRecuperacao.confirmar"] = () => request.promise;
      render(BtgRecuperacaoDialogConteudo, {
        alvo,
        contexto: "admin:2",
        onClose: noop,
      });
      mocks.forms[0].onSubmit({ preventDefault: noop });
      mocks.close!(false);
      mocks.stateChanges = [];
      if (modo === "sucesso")
        request.resolve({
          acao: "reenviar",
          emissaoId: 900,
          status: "incerta",
          mensagem: "Incerta",
        });
      else request.reject(new Error("CPF-SEGREDO"));
      await flush();
      expect(mocks.stateChanges).toEqual([]);
      expect(mocks.invalidated).toEqual(
        expect.arrayContaining(["btgV2", "btgDiagnosticos", "acordos"])
      );
      expect(mocks.calls).toHaveLength(1);
    }
  );
  it("timeout de confirmação descarta token/literal, mostra erro seguro e não repete", async () => {
    mocks.seed = {
      0: analise({ expiraEm: new Date(Date.now() + 60_000) }),
      1: CONFIRMACAO_REENVIO_BTG,
      2: true,
    };
    mocks.mutations["btgRecuperacao.confirmar"] = () =>
      Promise.reject(new Error("RETORNO-BANCARIO-CPF"));
    render(BtgRecuperacaoDialogConteudo, {
      alvo,
      contexto: "admin:2",
      onClose: noop,
    });
    mocks.forms[0].onSubmit({ preventDefault: noop });
    await flush();
    expect(mocks.stateChanges).toContainEqual({ index: 0, value: null });
    expect(mocks.stateChanges).toContainEqual({
      index: 4,
      value: ERRO_CONFIRMACAO_BTG,
    });
    expect(JSON.stringify(mocks.stateChanges)).not.toContain(
      "RETORNO-BANCARIO-CPF"
    );
    expect(mocks.calls).toHaveLength(1);
  });
  it("módulos locais não introduzem storage/SQL/rede paralela/PII livre/automação", () => {
    const source = readFileSync(
      new URL(
        "../client/src/components/btg/BtgRecuperacaoDialog.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(source).not.toMatch(
      /localStorage|sessionStorage|console\.|dangerouslySetInnerHTML|navigator\.clipboard|toast\.|fetch\(|axios|\.useQuery\(/
    );
    expect(source).toContain("setAnalise(null)");
    expect(source).toContain("guarda.encerrar()");
    expect(source).toContain("key={`${contexto}:");
    expect(source).toContain("utils.btgV2.invalidate()");
    expect(source).toContain("utils.btgDiagnosticos.invalidate()");
    expect(source).toContain("utils.acordos.invalidate()");
  });
});
