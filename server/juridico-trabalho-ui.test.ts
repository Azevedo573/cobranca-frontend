import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TarefaCard,
  TarefaColecao,
} from "../client/src/components/juridico/TarefaCards";
import { CampoSelect } from "../client/src/components/juridico/CampoSelect";
import {
  ESTADOS,
  STATUS_LABEL,
  aberta,
  acoesDisponiveis,
  agruparTarefas,
  atrasada,
  diaPrazo,
  exigeTexto,
  filtrarTarefas,
  formatarPrazo,
  indicadoresTarefas,
  type TarefaTrabalho,
} from "../client/src/components/juridico/trabalho";
import {
  TAREFA_STATUS_LABELS,
  TAREFA_STATUS_VISUAIS,
} from "../shared/juridico-tarefas";

const agora = new Date(2026, 10, 5, 15, 30);
function tarefa(overrides: Partial<TarefaTrabalho> = {}): TarefaTrabalho {
  return {
    id: 1,
    demandaId: 12,
    titulo: "Preparar manifestação",
    status: "pendente",
    prioridade: "media",
    responsavelId: 8,
    responsavelNome: "Marina",
    demandaNumero: "DEM-12",
    demandaAssunto: "Manifestação",
    demandaCondominioId: 2,
    demandaCondominioNome: "Condomínio Jardim",
    versao: 3,
    ...overrides,
  };
}
const itens: TarefaTrabalho[] = [
  tarefa({ id: 1, prazo: "2026-11-04T00:00:00.000Z" }),
  tarefa({
    id: 2,
    prazo: "2026-11-05T00:00:00.000Z",
    status: "em_andamento",
    prioridade: "alta",
  }),
  tarefa({
    id: 3,
    prazo: "2026-11-11T00:00:00.000Z",
    status: "em_revisao",
    responsavelId: 9,
    exigeRevisao: 1,
    entrega: "Minuta revisável",
    demandaId: 13,
  }),
  tarefa({ id: 4, prazo: "2026-11-12T00:00:00.000Z", responsavelId: null }),
  tarefa({ id: 5, prazo: null }),
  tarefa({ id: 6, prazo: "2026-11-01T00:00:00.000Z", status: "concluida" }),
  tarefa({ id: 7, prazo: "2026-11-01T00:00:00.000Z", status: "cancelada" }),
];
const ids = (rows: TarefaTrabalho[]) => rows.map(t => t.id);

describe("Central jurídica: filtros e indicadores reais", () => {
  it("Hoje inclui todo o dia de calendário e não vence ao meio-dia", () => {
    expect(ids(filtrarTarefas(itens, { periodo: "hoje" }, agora))).toEqual([2]);
    expect(atrasada(itens[1], agora)).toBe(false);
  });
  it("Atrasadas exclui concluídas e canceladas", () => {
    expect(ids(filtrarTarefas(itens, { periodo: "atrasadas" }, agora))).toEqual(
      [1]
    );
    expect(aberta(itens[5])).toBe(false);
    expect(aberta(itens[6])).toBe(false);
  });
  it("7 dias significa hoje até o sexto dia seguinte, sem datas vazias", () => {
    expect(ids(filtrarTarefas(itens, { periodo: "proximos7" }, agora))).toEqual(
      [2, 3]
    );
  });
  it("Todas inclui concluídas mas canceladas exige filtro explícito", () => {
    expect(ids(filtrarTarefas(itens, { periodo: "todas" }, agora))).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(
      ids(
        filtrarTarefas(itens, { periodo: "todas", status: "cancelada" }, agora)
      )
    ).toEqual([7]);
  });
  it("Combina estado, prioridade, condomínio, executor e demanda por ID", () => {
    expect(
      ids(
        filtrarTarefas(
          itens,
          {
            periodo: "todas",
            status: "em_andamento",
            prioridade: "alta",
            condominioId: "2",
            responsavelId: "8",
            demandaId: "12",
          },
          agora
        )
      )
    ).toEqual([2]);
    expect(
      filtrarTarefas(itens, { periodo: "todas", condominioId: "99" }, agora)
    ).toEqual([]);
    expect(
      ids(
        filtrarTarefas(itens, { periodo: "todas", responsavelId: "sem" }, agora)
      )
    ).toEqual([4]);
  });
  it("Busca ignora maiúsculas e inclui o contexto da demanda", () => {
    expect(
      ids(filtrarTarefas(itens, { periodo: "todas", busca: "DEM-12" }, agora))
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(
      filtrarTarefas(itens, { periodo: "todas", busca: "inexistente" }, agora)
    ).toEqual([]);
  });
  it("Quadro e lista conservam identidade dos mesmos objetos; filtro vazio zera colunas", () => {
    const filtradas = filtrarTarefas(itens, { periodo: "todas" }, agora);
    const grupos = agruparTarefas(filtradas);
    expect(grupos.pendente[0]).toBe(itens[0]);
    expect(grupos.em_revisao[0]).toBe(itens[2]);
    expect(Object.values(grupos).flat()).toHaveLength(6);
    expect(
      Object.values(agruparTarefas([])).every(col => col.length === 0)
    ).toBe(true);
  });
  it("Indicadores computam apenas o recorte exibido, sem produtividade fictícia", () => {
    expect(
      indicadoresTarefas(
        filtrarTarefas(itens, { periodo: "todas" }, agora),
        agora
      )
    ).toEqual({ semResponsavel: 1, atrasadas: 1, hoje: 1, revisao: 1 });
    expect(indicadoresTarefas([], agora)).toEqual({
      semResponsavel: 0,
      atrasadas: 0,
      hoje: 0,
      revisao: 0,
    });
  });
  it("Não altera input ao filtrar", () => {
    const original = JSON.stringify(itens);
    filtrarTarefas(itens, { periodo: "hoje" }, agora);
    expect(JSON.stringify(itens)).toBe(original);
  });
  it("Não desloca meia-noite UTC para dia anterior e tolera datas inválidas", () => {
    expect(diaPrazo("2026-11-05T00:00:00.000Z")).toBe("2026-11-05");
    expect(formatarPrazo(new Date("2026-11-05T00:00:00.000Z"))).toBe(
      "05/11/2026"
    );
    expect(formatarPrazo("inválida")).toBe("Sem prazo");
    expect(diaPrazo(null)).toBeNull();
  });
  it("As quatro colunas e rótulos permanecem coerentes com o contrato compartilhado", () => {
    expect(ESTADOS).toEqual(TAREFA_STATUS_VISUAIS);
    expect(STATUS_LABEL).toEqual(TAREFA_STATUS_LABELS);
  });
});

describe("Comandos disponíveis sem ampliar privilégios", () => {
  it("Executor inicia e entrega apenas sua própria tarefa", () => {
    expect(acoesDisponiveis(tarefa(), 8, false, false)).toContain("iniciar");
    expect(acoesDisponiveis(tarefa(), 9, false, false)).toEqual([]);
    expect(
      acoesDisponiveis(tarefa({ status: "em_andamento" }), 8, false, false)
    ).toContain("entregar");
  });
  it("Não oferece autoaprovação nem devolução própria, inclusive gestor/admin", () => {
    const t = tarefa({
      status: "em_revisao",
      exigeRevisao: 1,
      entrega: "Minuta",
    });
    expect(acoesDisponiveis(t, 8, true, true)).not.toContain("aprovar");
    expect(acoesDisponiveis(t, 8, true, true)).not.toContain("devolver");
  });
  it("Aprovação autorizada não depende de canEdit", () => {
    const acoes = acoesDisponiveis(
      tarefa({ status: "em_revisao", exigeRevisao: 1, entrega: "Minuta" }),
      9,
      false,
      true
    );
    expect(acoes).toEqual(["aprovar", "devolver"]);
    expect(acoes).not.toContain("cancelar");
  });
  it("Bloqueio não vira quinta coluna e impede iniciar/entregar/aprovar", () => {
    expect(acoesDisponiveis(tarefa({ bloqueada: 1 }), 8, false, false)).toEqual(
      ["desbloquear"]
    );
    const acoes = acoesDisponiveis(
      tarefa({
        bloqueada: 1,
        status: "em_revisao",
        exigeRevisao: 1,
        entrega: "Minuta",
      }),
      9,
      false,
      true
    );
    expect(acoes).toEqual(["devolver"]);
    expect(ESTADOS).not.toContain("bloqueada");
  });
  it("Reabertura é gerencial e cancelamento exige motivo", () => {
    expect(
      acoesDisponiveis(tarefa({ status: "cancelada" }), 8, false, false)
    ).toEqual([]);
    expect(
      acoesDisponiveis(tarefa({ status: "cancelada" }), 9, true, false)
    ).toEqual(["reabrir"]);
    expect(exigeTexto("cancelar", tarefa())).toBe(true);
    expect(exigeTexto("devolver", tarefa())).toBe(true);
    expect(exigeTexto("bloquear", tarefa())).toBe(true);
  });
  it("Entrega exige descrição somente quando revisão está habilitada", () => {
    expect(exigeTexto("entregar", tarefa({ exigeRevisao: 0 }))).toBe(false);
    expect(exigeTexto("entregar", tarefa({ exigeRevisao: 1 }))).toBe(true);
  });
});

describe("SSR dos componentes realmente compartilhados", () => {
  it("Cartão é um botão navegável por teclado e mostra responsável/contexto/prazo", () => {
    const html = renderToStaticMarkup(
      createElement(TarefaCard, {
        tarefa: tarefa({ prazo: "2026-11-05T00:00:00.000Z" }),
        onOpen: () => {},
      })
    );
    expect(html).toContain('<button type="button"');
    expect(html).toContain('aria-label="Abrir tarefa: Preparar manifestação"');
    expect(html).toContain("Marina");
    expect(html).toContain("DEM-12");
    expect(html).toContain("Condomínio Jardim");
    expect(html).toContain("05/11/2026");
    expect(html).not.toContain("/admin/juridico/demandas/");
    expect(html).not.toContain("draggable");
  });
  it("Quadro vazio renderiza quatro colunas reais sem cartões residuais", () => {
    const html = renderToStaticMarkup(
      createElement(TarefaColecao, {
        tarefas: [],
        visao: "kanban",
        onOpen: () => {},
      })
    );
    expect((html.match(/<section /g) ?? []).length).toBe(4);
    expect((html.match(/Nenhuma tarefa neste estado/g) ?? []).length).toBe(4);
    expect(html).not.toContain("Preparar manifestação");
  });
  it("Lista e Kanban renderizam a mesma tarefa em revisão e identificam bloqueio", () => {
    const t = tarefa({ status: "em_revisao", bloqueada: 1 });
    for (const visao of ["lista", "kanban"] as const) {
      const html = renderToStaticMarkup(
        createElement(TarefaColecao, { tarefas: [t], visao, onOpen: () => {} })
      );
      expect(html).toContain("Em revisão");
      expect(html).toContain("Bloqueada");
      expect((html.match(/Abrir tarefa:/g) ?? []).length).toBe(1);
    }
  });
  it("Título malicioso é escapado, não executado como HTML", () => {
    const html = renderToStaticMarkup(
      createElement(TarefaCard, {
        tarefa: tarefa({ titulo: '<script>alert("segredo")</script>' }),
        onOpen: () => {},
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("Campo de filtro tem associação label/select e não usa placeholder como rótulo", () => {
    const html = renderToStaticMarkup(
      createElement(CampoSelect, {
        label: "Responsável",
        value: "",
        onChange: () => {},
        children: createElement("option", { value: "" }, "Todos autorizados"),
      })
    );
    const id = /<select[^>]*id="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain("Todos autorizados");
  });
});
