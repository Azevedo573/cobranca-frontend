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
import { QueryClient } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import {
  BtgDiagnosticoConfirmacao,
  BtgDiagnosticoDialogConteudo,
  BtgDiagnosticoExpurgoConfirmacao,
  BtgDiagnosticoMetadados,
  BtgDiagnosticoTexto,
  BtgDiagnosticosItem,
  criarCachePrivadoDiagnostico,
} from "../client/src/components/btg/BtgDiagnosticoDialog";
import BTGRemessas from "../client/src/pages/admin/BTGRemessas";
import {
  CONFIRMACAO_EXPURGO_BTG,
  ERRO_DIAGNOSTICO_BTG,
  RETENCAO_DIAGNOSTICO_BTG_MS,
  criarGuardaDiagnostico,
  diagnosticoExpirado,
  diagnosticosDaParcela,
  finalidadeDiagnosticoValida,
  podeExpurgarDiagnosticoUI,
  retirarConteudoDoResultado,
  type BtgDiagnosticoMeta,
} from "../client/src/components/btg/btgDiagnosticoUI";

const mocks = vi.hoisted(() => ({
  fixtures: {} as Record<string, any>,
  errors: {} as Record<string, any>,
  handlers: {} as Record<string, any>,
  queries: [] as Array<{ name: string; input: any; options: any }>,
  mutate: vi.fn(),
  reset: vi.fn(),
  refetch: vi.fn(),
  forceRemessa: false,
  usedRemessa: false,
  effects: [] as Array<() => void | (() => void)>,
  stateChanges: [] as unknown[],
  dialogChange: null as null | ((open: boolean) => void),
}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof React>("react");
  return {
    ...actual,
    useState: (initial: any) => {
      const [state, setter] = actual.useState(
        mocks.forceRemessa && initial === null && !mocks.usedRemessa
          ? ((mocks.usedRemessa = true), 2)
          : initial
      );
      return [
        state,
        (value: any) => {
          mocks.stateChanges.push(value);
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
                error: mocks.errors[name],
                isLoading: false,
                isFetching: false,
                refetch: mocks.refetch,
              };
            };
          if (key === "useMutation")
            return (options: any) => {
              mocks.handlers[name] = options;
              return {
                mutate: mocks.mutate,
                reset: mocks.reset,
                isPending: false,
              };
            };
          if (key === "invalidate") return mocks.refetch;
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
// Apenas hosts portais substituídos no SSR; formulários e primitivas reais são inspecionados.
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
      mocks.dialogChange = onOpenChange;
      return open ? React.createElement(React.Fragment, null, children) : null;
    },
    DialogContent: host("section"),
    DialogHeader: host("header"),
    DialogTitle: host("h2"),
    DialogDescription: host("p"),
  };
});

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());
const noop = () => {};
const render = (component: any, props: any) =>
  renderToStaticMarkup(React.createElement(component, props));
const atual = (): BtgDiagnosticoMeta => ({
  id: 138,
  btgCobrancaEmitidaId: 33,
  parcelaAcordoId: 20,
  estadoCaptura: "resposta_recebida",
  httpStatus: 400,
  payloadBytes: 512,
  respostaBytes: 80,
  respostaCompleta: true,
  capturaCriadaEm: new Date(),
  respostaRecebidaEm: new Date(),
  conteudoExpurgadoEm: null,
  podeVisualizar: true,
  podeExpurgar: false,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.handlers = {};
  mocks.errors = {};
  mocks.forceRemessa = false;
  mocks.usedRemessa = false;
  mocks.effects = [];
  mocks.stateChanges = [];
  mocks.dialogChange = null;
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
    "btgDiagnosticos.listarPorRemessa": [atual()],
    "btgV2.detalheRemessa": {
      remessa: {
        id: 2,
        status: "falha",
        totalSelecionado: 1,
        totalEmitido: 0,
        totalFalha: 1,
        valorTotalCentavos: 1852,
        criadaEm: new Date(),
      },
      condominioNome: "Condomínio fictício",
      conta: null,
      itens: [
        {
          item: {
            id: 19,
            parcelaAcordoId: 20,
            btgCobrancaEmitidaId: null,
            installmentNumber: 1,
            resultado: "falha",
            valorCentavos: 1852,
          },
          emissao: null,
          parcela: { id: 20, status: "pendente", dueDate: new Date() },
          acordo: { id: 6 },
          devedor: { name: "Pessoa fictícia" },
        },
      ],
    },
  };
});

describe("BTG diagnóstico: metadados e associação", () => {
  it("associa por parcela mesmo sem emissão no item e não revela corpos inesperados da lista", () => {
    const meta = {
      ...atual(),
      payload: "CPF-NUNCA-LISTAR",
      resposta: "ENDERECO-NUNCA-LISTAR",
    };
    expect(diagnosticosDaParcela([meta], 20)).toHaveLength(1);
    expect(diagnosticosDaParcela([meta], 21)).toEqual([]);
    mocks.fixtures["btgDiagnosticos.listarPorRemessa"] = [meta];
    mocks.forceRemessa = true;
    const html = render(BTGRemessas, {});
    expect(html).toContain("Diagnóstico técnico #138");
    expect(html).toContain("HTTP 400");
    expect(html).toContain("Emissão canônica #33");
    expect(html).toContain("Ver diagnóstico técnico");
    expect(html).not.toContain("CPF-NUNCA-LISTAR");
    expect(html).not.toContain("ENDERECO-NUNCA-LISTAR");
    expect(mocks.mutate).not.toHaveBeenCalled();
    const query = mocks.queries.find(
      q => q.name === "btgDiagnosticos.listarPorRemessa"
    )!;
    expect(query.input).toEqual({ remessaId: 2 });
    expect(query.options).toMatchObject({
      enabled: true,
      retry: false,
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    expect(mocks.queries.some(q => q.name.includes("visualizar"))).toBe(false);
  });
  it("sem captura histórica não reconstrói, reenvia nem inventa botão", () => {
    const html = render(BtgDiagnosticosItem, {
      diagnosticos: [],
      onAbrir: noop,
    });
    expect(html).toContain("Sem captura histórica");
    expect(html).toContain("não podem ser reconstruídos");
    expect(html).not.toContain("<button");
  });
  it("indisponibilidade do backend tem erro genérico e não estado histórico falso", () => {
    mocks.errors["btgDiagnosticos.listarPorRemessa"] = {
      message: "CPF-SEGREDO-BACKEND",
    };
    mocks.forceRemessa = true;
    const html = render(BTGRemessas, {});
    expect(html).toContain(ERRO_DIAGNOSTICO_BTG);
    expect(html).not.toContain("CPF-SEGREDO-BACKEND");
    expect(html).not.toContain("Sem captura histórica");
  });
  it.each([
    { id: 1, role: "advogado", isActive: 1, isDeleted: 0 },
    { id: 1, role: "admin", isActive: 0, isDeleted: 0 },
    { id: 1, role: "admin", isActive: 1, isDeleted: 1 },
    null,
  ])("não consulta diagnóstico com auth/perfil inelegível %j", user => {
    mocks.fixtures["auth.me"] = user;
    mocks.forceRemessa = true;
    const html = render(BTGRemessas, {});
    expect(
      mocks.queries.find(q => q.name === "btgDiagnosticos.listarPorRemessa")!
        .options.enabled
    ).toBe(false);
    expect(html).not.toContain("Ver diagnóstico técnico");
  });
  it("query fica desabilitada sem remessa aberta", () => {
    render(BTGRemessas, {});
    expect(
      mocks.queries.find(q => q.name === "btgDiagnosticos.listarPorRemessa")!
        .options.enabled
    ).toBe(false);
  });
  it.each([
    ["preparado", "não comprova envio"],
    ["enviando", "recebimento não confirmado"],
    ["sem_resposta", "transporte sem confirmação"],
    ["resposta_incompleta", "Resposta limitada"],
  ])("distingue captura %s de estado financeiro", (estadoCaptura, rotulo) => {
    const html = render(BtgDiagnosticoMetadados, {
      diagnostico: {
        ...atual(),
        estadoCaptura,
        respostaCompleta: false,
        respostaRecebidaEm: null,
      },
    });
    expect(html).toContain(rotulo);
    expect(html).not.toContain("Resposta completa capturada");
  });
});

describe("Confirmações e retenção manual", () => {
  const props = {
    finalidade: "",
    confirmado: false,
    pendente: false,
    onFinalidade: noop,
    onConfirmado: noop,
    onSubmit: noop,
    onCancel: noop,
  };
  it("exige finalidade 10–200 e confirmação positiva antes de visualizar", () => {
    expect(finalidadeDiagnosticoValida("123456789")).toBe(false);
    expect(finalidadeDiagnosticoValida(" 123456789 ")).toBe(false);
    expect(finalidadeDiagnosticoValida("1234567890")).toBe(true);
    expect(finalidadeDiagnosticoValida("x".repeat(200))).toBe(true);
    expect(finalidadeDiagnosticoValida("x".repeat(201))).toBe(false);
    const html = render(BtgDiagnosticoConfirmacao, props);
    expect(html).toContain("dados pessoais e financeiros");
    expect(html).toContain('for="btg-diagnostico-finalidade"');
    expect(html).toContain('minLength="10"');
    expect(html).toContain('maxLength="200"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirmar e visualizar/);
    expect(
      render(BtgDiagnosticoConfirmacao, {
        ...props,
        finalidade: "Revisar erro de validação",
        confirmado: true,
      })
    ).not.toMatch(/<button[^>]*disabled=""[^>]*>Confirmar e visualizar/);
  });
  it("prazo exato de 30 dias bloqueia visualização e exige flag backend para expurgo", () => {
    const criadaEm = new Date("2026-01-01T00:00:00Z");
    const meta = { ...atual(), capturaCriadaEm: criadaEm, podeExpurgar: true };
    const vencimento = criadaEm.getTime() + RETENCAO_DIAGNOSTICO_BTG_MS;
    expect(diagnosticoExpirado(meta, vencimento - 1)).toBe(false);
    expect(diagnosticoExpirado(meta, vencimento)).toBe(true);
    expect(podeExpurgarDiagnosticoUI(meta, vencimento)).toBe(true);
    expect(
      podeExpurgarDiagnosticoUI({ ...meta, podeExpurgar: false }, vencimento)
    ).toBe(false);
    const html = render(BtgDiagnosticosItem, {
      diagnosticos: [meta],
      onAbrir: noop,
    });
    expect(html).toContain("Conteúdo expirado");
    expect(html).toContain("Expurgar conteúdo expirado");
    expect(html).not.toContain("Ver diagnóstico técnico");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("expurgo exige literal, mantém histórico e não promete exclusão dos backups", () => {
    const props = {
      confirmacao: "",
      pendente: false,
      onConfirmacao: noop,
      onSubmit: noop,
      onCancel: noop,
    };
    const html = render(BtgDiagnosticoExpurgoConfirmacao, props);
    expect(html).toContain(CONFIRMACAO_EXPURGO_BTG);
    expect(html).toContain("Backups podem preservar");
    expect(html).toContain("Não altera cobranças");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Confirmar expurgo manual/
    );
    expect(
      render(BtgDiagnosticoExpurgoConfirmacao, {
        ...props,
        confirmacao: CONFIRMACAO_EXPURGO_BTG,
      })
    ).not.toMatch(/<button[^>]*disabled=""[^>]*>Confirmar expurgo manual/);
    const expurgado = render(BtgDiagnosticosItem, {
      diagnosticos: [
        { ...atual(), conteudoExpurgadoEm: new Date(), podeExpurgar: true },
      ],
      onAbrir: noop,
    });
    expect(expurgado).toContain("Conteúdo expurgado");
    expect(expurgado).not.toContain("<button");
  });
});

describe("Texto inerte e descarte de plaintext", () => {
  it("HTML/script/URL renderizados em pre escapado, sem copiar/exportar/links", () => {
    const html = render(BtgDiagnosticoTexto, {
      conteudo: {
        payload: '{"cpf":"00000000000","html":"<script>alert(1)</script>"}',
        resposta:
          "<img src=x onerror=alert(1)> https://nao-executar.invalid javascript:alert(1)",
        httpStatus: 400,
        respostaCompleta: true,
        estadoCaptura: "resposta_recebida",
      },
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toMatch(/<(script|img|a)\b/);
    expect(html.match(/<pre\b/g)).toHaveLength(2);
    expect(html).not.toMatch(/Copiar|Download|Exportar/);
  });
  it("ausente/incompleta/UTF-8 inválido não declara retorno integral", () => {
    const conteudo = {
      payload: "{}",
      resposta: null,
      httpStatus: null,
      respostaCompleta: false,
      estadoCaptura: "sem_resposta",
    };
    expect(render(BtgDiagnosticoTexto, { conteudo })).toContain(
      "nenhuma resposta foi reconstruída"
    );
    for (const flags of [
      { respostaCompleta: false },
      { respostaCompleta: true, respostaLimitada: true },
      { respostaCompleta: true, respostaUtf8Invalido: true },
    ]) {
      const html = render(BtgDiagnosticoTexto, {
        conteudo: {
          ...conteudo,
          resposta: "prefixo",
          estadoCaptura: "resposta_recebida",
          ...flags,
        },
      });
      expect(html).toContain("limitada/incompleta");
      expect(html).toContain("não representa o retorno integral");
      expect(html).not.toContain("Resposta HTTP · completa");
    }
  });
  it("abrir diálogo só renderiza confirmação e não dispara mutação/query plaintext", () => {
    const html = render(BtgDiagnosticoDialogConteudo, {
      diagnostico: atual(),
      acao: "visualizar",
      onClose: noop,
      onExpurgado: noop,
      cachePrivado: criarCachePrivadoDiagnostico(),
    });
    expect(html).toContain("Finalidade do acesso");
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.queries).toEqual([]);
    expect(mocks.handlers["btgDiagnosticos.visualizar"].retry).toBe(false);
    expect(mocks.handlers["btgDiagnosticos.visualizar"].gcTime).toBe(0);
    expect(mocks.handlers["btgDiagnosticos.expurgar"].retry).toBe(false);
  });
  it("guarda invalida pedido ao cancelar, trocar contexto ou desmontar", () => {
    const guarda = criarGuardaDiagnostico();
    const primeiro = guarda.iniciar();
    expect(guarda.aceita(primeiro)).toBe(true);
    guarda.cancelar();
    expect(guarda.aceita(primeiro)).toBe(false);
    const segundo = guarda.iniciar();
    expect(guarda.aceita(segundo)).toBe(true);
    guarda.encerrar();
    expect(guarda.aceita(segundo)).toBe(false);
    const terceiro = guarda.iniciar();
    expect(guarda.aceita(terceiro)).toBe(false);
  });
  it("mutação TanStack real nunca deposita plaintext em seu cache de resultado", async () => {
    const cache = criarCachePrivadoDiagnostico();
    const guard = criarGuardaDiagnostico();
    const pedido = guard.iniciar();
    const snapshots: string[] = [];
    cache.getMutationCache().subscribe(event => {
      snapshots.push(JSON.stringify(event.mutation?.state));
    });
    let local: any;
    const response = {
      payload: "CPF-LOCAL-ONLY",
      resposta: "ENDERECO-LOCAL-ONLY",
      httpStatus: 400,
      respostaCompleta: true,
      estadoCaptura: "resposta_recebida",
    };
    const mutation = cache.getMutationCache().build(cache, {
      mutationKey: ["btg", "visualizar"],
      gcTime: 0,
      retry: false,
      mutationFn: async () => response,
      onSuccess: data => {
        const plain = retirarConteudoDoResultado(data);
        if (guard.aceita(pedido)) local = plain;
      },
    });
    await mutation.execute(undefined);
    expect(local.payload).toBe("CPF-LOCAL-ONLY");
    expect(mutation.state.data).toMatchObject({ payload: "", resposta: null });
    expect(snapshots.join(" ")).not.toContain("CPF-LOCAL-ONLY");
    expect(snapshots.join(" ")).not.toContain("ENDERECO-LOCAL-ONLY");
    cache.clear();
  });
  it("resposta tardia depois de unmount é retirada do resultado e nunca exibida", async () => {
    const cache = new QueryClient();
    const onClose = vi.fn();
    render(BtgDiagnosticoDialogConteudo, {
      diagnostico: atual(),
      acao: "visualizar",
      onClose,
      onExpurgado: noop,
      cachePrivado: cache,
    });
    const cleanups = mocks.effects.map(effect => effect());
    const handlers = mocks.handlers["btgDiagnosticos.visualizar"];
    const context = handlers.onMutate();
    cleanups.forEach(cleanup => cleanup?.());
    mocks.stateChanges = [];
    const response = {
      id: 138,
      payload: "CPF-SENSIVEL",
      resposta: "RETORNO-SENSIVEL",
      httpStatus: 400,
      respostaCompleta: true,
      estadoCaptura: "resposta_recebida",
    };
    handlers.onSuccess(response, {}, context);
    expect(response.payload).toBe("");
    expect(response.resposta).toBeNull();
    expect(mocks.stateChanges).toEqual([]);
    expect(mocks.reset).toHaveBeenCalled();
    handlers.onSettled();
    await Promise.resolve();
    expect(cache.getMutationCache().getAll()).toEqual([]);
  });
  it("fechar durante leitura limpa estado e rejeita sucesso/erro tardios", () => {
    const onClose = vi.fn();
    render(BtgDiagnosticoDialogConteudo, {
      diagnostico: atual(),
      acao: "visualizar",
      onClose,
      onExpurgado: noop,
      cachePrivado: criarCachePrivadoDiagnostico(),
    });
    mocks.effects.forEach(effect => effect());
    const handlers = mocks.handlers["btgDiagnosticos.visualizar"];
    const context = handlers.onMutate();
    mocks.dialogChange!(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.stateChanges).toContain(null);
    mocks.stateChanges = [];
    const response = {
      id: 138,
      payload: "CPF-TARDIO",
      resposta: "RESPOSTA-TARDIA",
      httpStatus: 400,
      respostaCompleta: true,
      estadoCaptura: "resposta_recebida",
    };
    handlers.onSuccess(response, {}, context);
    handlers.onError(new Error("erro não exibido"), {}, context);
    expect(response.payload).toBe("");
    expect(mocks.stateChanges).toEqual([]);
  });
  it("módulos não introduzem plaintext em storage, console, HTML, clipboard ou consultas", () => {
    const dialog = readFileSync(
      new URL(
        "../client/src/components/btg/BtgDiagnosticoDialog.tsx",
        import.meta.url
      ),
      "utf8"
    );
    expect(dialog).not.toMatch(
      /localStorage|sessionStorage|console\.|dangerouslySetInnerHTML|navigator\.clipboard|toast\./
    );
    expect(dialog).not.toMatch(/visualizar\.useQuery|setQueryData|setData\(/);
    expect(dialog).toContain("retirarConteudoDoResultado(resultado)");
    expect(dialog).toContain("guarda.encerrar()");
  });
});
