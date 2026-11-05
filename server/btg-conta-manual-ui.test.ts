import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CONFIRMACAO_CONTA_PRODUCAO,
  cnpjValidoContaManual,
  dadosCadastroManualProducao,
  formatarDataBtg,
  mascararRevisaoConta,
  novaContaManual,
  podeCadastrarContaManual,
  podeConfirmarContaManual,
  rotuloOrigemConta,
  rotulosEstadoBtg,
  validarFormContaManual,
  type FormContaManual,
} from "../client/src/components/btg/contaManual";
import {
  AlertaProducaoBtg,
  ConfirmarContaManualButton,
  ContaManualForm,
  EstadoEmissaoBtg,
  ModoConsultaContasBtg,
  OrigemContaBtg,
} from "../client/src/components/btg/ContaManualUI";
import BTGConfig from "../client/src/pages/configuracoes/BTGConfig";

const mocks = vi.hoisted(() => ({
  painel: {} as any,
  handlers: {} as Record<
    string,
    {
      onSuccess: (result?: any) => void;
      onError: (error: { message: string }) => void;
    }
  >,
  pending: {} as Record<string, boolean>,
  mutate: vi.fn(),
  invalidatePainel: vi.fn(),
  invalidateVinculos: vi.fn(),
  refetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => {
  const mutation = (name: string) => ({
    useMutation: (handlers: any) => {
      mocks.handlers[name] = handlers;
      return { mutate: mocks.mutate, isPending: Boolean(mocks.pending[name]) };
    },
  });
  return {
    trpc: {
      useUtils: () => ({
        btgV2: {
          painel: { invalidate: mocks.invalidatePainel },
          vinculoCondominio: { invalidate: mocks.invalidateVinculos },
        },
      }),
      btg: { iniciarAutorizacao: mutation("iniciarAutorizacao") },
      btgV2: {
        painel: {
          useQuery: () => ({
            data: mocks.painel,
            isLoading: false,
            refetch: mocks.refetch,
          }),
        },
        listarEntregasWebhook: { useQuery: () => ({ data: [] }) },
        vinculoCondominio: {
          useQuery: () => ({ data: null, refetch: mocks.refetch }),
        },
        sincronizarContas: mutation("sincronizarContas"),
        salvarPoliticaHomologacao: mutation("salvarPoliticaHomologacao"),
        vincularContaCondominio: mutation("vincularContaCondominio"),
        cadastrarContaManualSandbox: mutation("cadastrarContaManualSandbox"),
        cadastrarContaManualProducao: mutation("cadastrarContaManualProducao"),
        habilitarEmissaoSandbox: mutation("habilitarEmissaoSandbox"),
        desabilitarEmissaoSandbox: mutation("desabilitarEmissaoSandbox"),
        habilitarEmissaoProducao: mutation("habilitarEmissaoProducao"),
      },
      condominios: { list: { useQuery: () => ({ data: [] }) } },
    },
  };
});
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("../client/src/components/AdminCondominioSelector", () => ({
  AdminCondominioSelector: () => null,
}));
// SSR normally omits inactive tab panels; forceMount retains the real Radix/shadcn rendering.
vi.mock("../client/src/components/ui/tabs", async importOriginal => {
  const original =
    await importOriginal<typeof import("../client/src/components/ui/tabs")>();
  const React = await import("react");
  return {
    ...original,
    TabsContent: (props: any) =>
      React.createElement(original.TabsContent, { ...props, forceMount: true }),
  };
});

function form(overrides: Partial<FormContaManual> = {}): FormContaManual {
  return {
    rotulo: "Conta do escritório",
    agencia: "0001",
    numero: "000012345",
    documentoBeneficiario: "11.222.333/0001-81",
    nomeBeneficiario: "Escritório de teste",
    ...overrides,
  };
}
function confirmacao(
  overrides: Partial<Parameters<typeof podeConfirmarContaManual>[0]> = {}
) {
  return {
    form: form(),
    ambiente: "producao" as const,
    confirmacao: CONFIRMACAO_CONTA_PRODUCAO,
    dadosConferidos: true,
    cadastroPermitido: true,
    enviando: false,
    ...overrides,
  };
}
function renderPagina() {
  return renderToStaticMarkup(createElement(BTGConfig));
}
function botao(html: string, texto: string) {
  return (
    [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)]
      .map(match => match[0])
      .find(button => button.includes(texto)) ?? ""
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers = {};
  mocks.pending = {};
  mocks.painel = {
    oauth: {
      ambiente: "producao",
      status: "conectado",
      configuracaoCompleta: true,
      consultaContasHabilitada: false,
      companyIdMasked: "***0181",
    },
    contas: [],
    integracao: null,
    emissaoHabilitada: false,
    prontoParaHomologacao: false,
  };
  vi.stubGlobal("window", { location: { search: "", assign: vi.fn() } });
});

describe("UI: validação e isolamento do cadastro manual", () => {
  it("Produção exige conexão e configuração pronta; Sandbox conserva a condição conectada", () => {
    expect(
      podeCadastrarContaManual({
        ambiente: "producao",
        conectado: true,
        configuracaoCompleta: true,
      })
    ).toBe(true);
    expect(
      podeCadastrarContaManual({
        ambiente: "producao",
        conectado: true,
        configuracaoCompleta: false,
      })
    ).toBe(false);
    expect(
      podeCadastrarContaManual({
        ambiente: "producao",
        conectado: false,
        configuracaoCompleta: true,
      })
    ).toBe(false);
    expect(
      podeCadastrarContaManual({
        ambiente: "sandbox",
        conectado: true,
        configuracaoCompleta: false,
      })
    ).toBe(true);
    expect(
      podeCadastrarContaManual({ conectado: true, configuracaoCompleta: true })
    ).toBe(false);
  });
  it("Não usa o gate de emissão para impedir cadastrar a primeira conta", () => {
    const html = renderPagina();
    expect(botao(html, "Cadastrar manualmente")).not.toContain('disabled=""');
    expect(botao(html, "Liberar Produção")).toContain('disabled=""');
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("Não permite cadastro em Produção com configuração incompleta ou integração inativa", () => {
    mocks.painel.oauth.configuracaoCompleta = false;
    expect(botao(renderPagina(), "Cadastrar manualmente")).toContain(
      'disabled=""'
    );
    mocks.painel.oauth.configuracaoCompleta = true;
    mocks.painel.integracao = { ativo: false };
    expect(botao(renderPagina(), "Cadastrar manualmente")).toContain(
      'disabled=""'
    );
  });
  it("Liberação continua dependente do gate do servidor, conexão e prontidão", () => {
    mocks.painel.prontoParaHomologacao = true;
    expect(botao(renderPagina(), "Liberar Produção")).not.toContain(
      'disabled=""'
    );
    mocks.painel.oauth.status = "requer_reconexao";
    expect(botao(renderPagina(), "Liberar Produção")).toContain('disabled=""');
    mocks.painel.oauth.status = "conectado";
    mocks.painel.oauth.configuracaoCompleta = false;
    expect(botao(renderPagina(), "Liberar Produção")).toContain('disabled=""');
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("Nome, CNPJ válido, agência e número são obrigatórios em Produção", () => {
    expect(validarFormContaManual(form(), "producao")).toBeNull();
    for (const campo of [
      "nomeBeneficiario",
      "documentoBeneficiario",
      "agencia",
      "numero",
    ] as const) {
      expect(
        validarFormContaManual(form({ [campo]: "" }), "producao")
      ).not.toBeNull();
    }
    expect(cnpjValidoContaManual("11.222.333/0001-81")).toBe(true);
    expect(cnpjValidoContaManual("11222333000182")).toBe(false);
    expect(cnpjValidoContaManual("11111111111111")).toBe(false);
    expect(cnpjValidoContaManual("texto11222333000181")).toBe(false);
    expect(cnpjValidoContaManual("12345678901")).toBe(false);
  });
  it("Não infere dígitos, não remove hífen silenciosamente e preserva zeros", () => {
    expect(
      validarFormContaManual(form({ agencia: "01-2" }), "producao")
    ).not.toBeNull();
    expect(
      validarFormContaManual(form({ numero: "0001-2" }), "producao")
    ).not.toBeNull();
    const payload = dadosCadastroManualProducao(
      form({ agencia: " 0001 ", numero: " 000012345 " })
    );
    expect(payload).toEqual({
      rotulo: "Conta do escritório",
      agencia: "0001",
      numero: "000012345",
      documentoBeneficiario: "11222333000181",
      nomeBeneficiario: "Escritório de teste",
      dadosConferidos: true,
      confirmacao: "CADASTRAR CONTA PRODUCAO",
    });
    expect(payload).not.toHaveProperty("emissaoHabilitada");
    expect(payload).not.toHaveProperty("accountId");
  });
  it("Confirmação Sandbox não vale para Produção; declaração e bloqueio durante envio obrigatórios", () => {
    expect(podeConfirmarContaManual(confirmacao())).toBe(true);
    expect(
      podeConfirmarContaManual(confirmacao({ confirmacao: "CADASTRAR" }))
    ).toBe(false);
    expect(
      podeConfirmarContaManual(
        confirmacao({ confirmacao: "CADASTRAR CONTA PRODUCAO " })
      )
    ).toBe(false);
    expect(
      podeConfirmarContaManual(confirmacao({ dadosConferidos: false }))
    ).toBe(false);
    expect(podeConfirmarContaManual(confirmacao({ enviando: true }))).toBe(
      false
    );
    expect(
      podeConfirmarContaManual(confirmacao({ cadastroPermitido: false }))
    ).toBe(false);
  });
  it("Sandbox mantém titular/documento opcionais e literal CADASTRAR", () => {
    const sandbox = form({ nomeBeneficiario: "", documentoBeneficiario: "" });
    expect(validarFormContaManual(sandbox, "sandbox")).toBeNull();
    expect(
      podeConfirmarContaManual(
        confirmacao({
          ambiente: "sandbox",
          form: sandbox,
          confirmacao: "CADASTRAR",
          dadosConferidos: false,
        })
      )
    ).toBe(true);
    expect(
      podeConfirmarContaManual(
        confirmacao({ ambiente: "sandbox", form: sandbox })
      )
    ).toBe(false);
  });
  it("Novo formulário é vazio e independente", () => {
    const primeiro = novaContaManual();
    primeiro.agencia = "0001";
    expect(novaContaManual().agencia).toBe("");
  });
});

describe("SSR real dos componentes usados pela configuração BTG", () => {
  it("Formulário de Produção renderiza campos requeridos, declaração e revisão mascarada", () => {
    const html = renderToStaticMarkup(
      createElement(ContaManualForm, {
        ambiente: "producao",
        form: form(),
        onFormChange: () => {},
        confirmacao: "",
        onConfirmacaoChange: () => {},
        dadosConferidos: false,
        onDadosConferidosChange: () => {},
        enviando: false,
      })
    );
    for (const id of [
      "rotulo",
      "agencia",
      "numero",
      "documento",
      "beneficiario",
    ]) {
      const input = new RegExp(`<input[^>]*id="conta-manual-${id}"[^>]*>`).exec(
        html
      )?.[0];
      expect(input).toContain('required=""');
      expect(html).toContain(`for="conta-manual-${id}"`);
    }
    expect(html).toContain('role="checkbox"');
    expect(html).toContain("fonte bancária do escritório");
    expect(html).toContain("CADASTRAR CONTA PRODUCAO");
    expect(html).toContain("Revisão antes da confirmação — Produção");
    expect(html).toContain("•••••2345");
    expect(html).toContain("••••••••••0181");
    expect(html).toContain("não acrescente dígitos por suposição");
    expect(html).toContain("O servidor verifica essa correspondência");
    expect(html).not.toContain('type="number"');
  });
  it("Formulário Sandbox não impõe CNPJ/nome nem declaração de Produção", () => {
    const html = renderToStaticMarkup(
      createElement(ContaManualForm, {
        ambiente: "sandbox",
        form: novaContaManual(),
        onFormChange: () => {},
        confirmacao: "",
        onConfirmacaoChange: () => {},
        dadosConferidos: false,
        onDadosConferidosChange: () => {},
        enviando: false,
      })
    );
    expect(html).toContain("Documento do beneficiário (opcional)");
    expect(html).toContain("Titular (opcional)");
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain("CADASTRAR CONTA PRODUCAO");
    expect(
      /<input[^>]*id="conta-manual-documento"[^>]*>/.exec(html)?.[0]
    ).not.toContain("required");
  });
  it("Botão real impede confirmação incompleta e múltiplo envio", () => {
    for (const changes of [
      { dadosConferidos: false },
      { enviando: true },
      { confirmacao: "CADASTRAR" },
      { cadastroPermitido: false },
    ]) {
      const html = renderToStaticMarkup(
        createElement(ConfirmarContaManualButton, {
          ...confirmacao(changes),
          onConfirmar: () => {},
        })
      );
      expect(html).toContain('disabled=""');
    }
    expect(
      renderToStaticMarkup(
        createElement(ConfirmarContaManualButton, {
          ...confirmacao(),
          onConfirmar: () => {},
        })
      )
    ).not.toContain('disabled=""');
  });
  it("Exibe erro sem mensagem de sucesso e bloqueia campos enquanto envia", () => {
    const html = renderToStaticMarkup(
      createElement(ContaManualForm, {
        ambiente: "producao",
        form: form(),
        onFormChange: () => {},
        confirmacao: "",
        onConfirmacaoChange: () => {},
        dadosConferidos: false,
        onDadosConferidosChange: () => {},
        enviando: true,
        erro: "CNPJ divergente do escritório",
      })
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain("Cadastro não concluído");
    expect(html).toContain("CNPJ divergente do escritório");
    expect(html).not.toContain("registrada em Produção");
  });
  it("Origem nunca confunde confirmação administrativa com validação API", () => {
    expect(rotuloOrigemConta("manual_producao")).toBe("Manual — Produção");
    expect(rotuloOrigemConta("manual_sandbox")).toBe("Manual — Sandbox");
    for (const origemCadastro of [
      "api",
      "manual_sandbox",
      "manual_producao",
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(OrigemContaBtg, {
          origemCadastro,
          confirmadoPorId: 8,
          confirmadoEm: "2026-11-05T15:00:00Z",
        })
      );
      expect(html).toContain(rotuloOrigemConta(origemCadastro));
      if (origemCadastro === "manual_producao") {
        expect(html).toContain("Confirmada pelo administrador");
        expect(html).toContain("não validada pela API BTG");
        expect(html).toContain("Administrador ID 8");
      } else expect(html).not.toContain("Confirmada pelo administrador");
    }
  });
  it("Metadados nullable/inválidos não lançam erro nem inventam confirmador/data", () => {
    for (const confirmadoEm of [null, "inválida", new Date(NaN)]) {
      expect(formatarDataBtg(confirmadoEm)).toBe("—");
      const html = renderToStaticMarkup(
        createElement(OrigemContaBtg, {
          origemCadastro: "manual_producao",
          confirmadoPorId: null,
          confirmadoEm,
        })
      );
      expect(html).not.toContain("Administrador ID");
      expect(html).not.toContain("Invalid Date");
    }
    expect(formatarDataBtg("2026-11-05T15:00:00Z")).toContain("05/11/2026");
    expect(mascararRevisaoConta("0001", 2)).toBe("••01");
    expect(mascararRevisaoConta("01")).toBe("•1");
    expect(mascararRevisaoConta("1")).toBe("•");
  });
  it("Estado usa ambiente + flag real; produção habilitada não recebe alerta de bloqueio", () => {
    expect(rotulosEstadoBtg("producao", false)).toEqual({
      ambiente: "PRODUÇÃO",
      emissao: "Emissão bloqueada",
    });
    expect(rotulosEstadoBtg("producao", true).emissao).toBe(
      "BolePix de Produção ativo"
    );
    const html = renderToStaticMarkup(
      createElement(EstadoEmissaoBtg, {
        ambiente: "producao",
        emissaoHabilitada: true,
      })
    );
    expect(html).not.toContain("homologação ativo");
    expect(html).not.toContain("PRODUÇÃO BLOQUEADA");
    const alerta = renderToStaticMarkup(
      createElement(AlertaProducaoBtg, {
        ambiente: "producao",
        emissaoHabilitada: true,
      })
    );
    expect(alerta).toContain("Emissão real em Produção habilitada");
    expect(alerta).not.toContain("Produção bloqueada");
    expect(
      renderToStaticMarkup(
        createElement(AlertaProducaoBtg, {
          ambiente: "sandbox",
          emissaoHabilitada: false,
        })
      )
    ).toBe("");
    expect(
      renderToStaticMarkup(
        createElement(AlertaProducaoBtg, {
          ambiente: undefined,
          emissaoHabilitada: false,
        })
      )
    ).toBe("");
  });
  it("Modo Accounts somente leitura explica Collections/webhook e mantém consulta desabilitada", () => {
    const modo = renderToStaticMarkup(
      createElement(ModoConsultaContasBtg, { habilitada: false })
    );
    expect(modo).toContain("BTG_ACCOUNTS_ENABLED=false");
    expect(modo).toContain("somente leitura");
    expect(modo).toContain(
      "não substitui a autorização Collections nem o webhook"
    );
    expect(modo).not.toContain("<input");
    expect(botao(renderPagina(), "Consultar contas")).toContain('disabled=""');
    mocks.painel.oauth.consultaContasHabilitada = true;
    expect(botao(renderPagina(), "Consultar contas")).not.toContain(
      'disabled=""'
    );
    mocks.painel.oauth.status = "nao_conectado";
    expect(botao(renderPagina(), "Consultar contas")).toContain('disabled=""');
    expect(botao(renderPagina(), "Cadastrar manualmente")).toContain(
      'disabled=""'
    );
  });
  it("Página mostra origem/data e Produção habilitada sem rótulos antigos", () => {
    mocks.painel.emissaoHabilitada = true;
    mocks.painel.contas = [
      {
        id: 1,
        ativo: true,
        rotulo: "Conta do escritório",
        agencia: "0001",
        numeroMascarado: "•••••2345",
        documentoBeneficiarioMascarado: "***0181",
        origemCadastro: "manual_producao",
        confirmadoPorId: 8,
        confirmadoEm: "2026-11-05T15:00:00Z",
      },
    ];
    const html = renderPagina();
    expect(html).toContain("Manual — Produção");
    expect(html).toContain("Administrador ID 8");
    expect(html).toContain("BolePix de Produção ativo");
    expect(html).not.toContain("PRODUÇÃO BLOQUEADA");
    expect(html).not.toContain("Homologação Sandbox liberada");
    expect(html).not.toContain("BolePix de homologação ativo");
    expect(html).not.toContain("Produção ainda não está liberada");
  });
  it("Campos e mensagens são escapados como texto, inclusive retorno de erro", () => {
    const html = renderToStaticMarkup(
      createElement(ContaManualForm, {
        ambiente: "producao",
        form: form({ nomeBeneficiario: "<script>segredo</script>" }),
        onFormChange: () => {},
        confirmacao: "",
        onConfirmacaoChange: () => {},
        dadosConferidos: false,
        onDadosConferidosChange: () => {},
        enviando: false,
        erro: "<script>falha</script>",
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("Callbacks reais da página: cache, sucesso e falha", () => {
  it("Cadastro bem-sucedido invalida painel e todos os vínculos, sem ativar emissão", () => {
    renderPagina();
    mocks.handlers.cadastrarContaManualProducao.onSuccess();
    expect(mocks.invalidatePainel).toHaveBeenCalledOnce();
    expect(mocks.invalidateVinculos).toHaveBeenCalledOnce();
    expect(mocks.invalidateVinculos).toHaveBeenCalledWith();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining("não validado pela API BTG")
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.painel.emissaoHabilitada).toBe(false);
  });
  it("Erro de cadastro não gera sucesso, invalidação ou liberação", () => {
    renderPagina();
    mocks.handlers.cadastrarContaManualProducao.onError({
      message: "CNPJ divergente",
    });
    expect(mocks.toastError).toHaveBeenCalledWith("CNPJ divergente");
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.invalidatePainel).not.toHaveBeenCalled();
    expect(mocks.invalidateVinculos).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("Sandbox mantém callback separado e também atualiza os vínculos", () => {
    mocks.painel.oauth.ambiente = "sandbox";
    renderPagina();
    mocks.handlers.cadastrarContaManualSandbox.onSuccess();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Conta manual cadastrada somente para a homologação Sandbox."
    );
    expect(mocks.invalidatePainel).toHaveBeenCalledOnce();
    expect(mocks.invalidateVinculos).toHaveBeenCalledOnce();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("O botão da página não reabre cadastro durante mutation pendente", () => {
    mocks.pending.cadastrarContaManualProducao = true;
    expect(botao(renderPagina(), "Cadastrar manualmente")).toContain(
      'disabled=""'
    );
  });
});
