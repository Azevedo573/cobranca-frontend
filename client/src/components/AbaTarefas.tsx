import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Plus, ListTodo, Kanban } from "lucide-react";
import { TarefaColecao } from "./juridico/TarefaCards";
import { TarefaPainel } from "./juridico/TarefaPainel";
import { TarefaFormDialog } from "./juridico/TarefaFormDialog";
import {
  POLLING_TRABALHO,
  aberta,
  type TarefaTrabalho,
} from "./juridico/trabalho";

// A assinatura dos detalhes é preservada; elegibilidade vem exclusivamente do servidor por demanda.
export function AbaTarefas({
  demandaId,
}: {
  demandaId: number;
  operadores?: unknown[];
}) {
  const [criando, setCriando] = useState(false);
  const [tarefaId, setTarefaId] = useState<number | null>(null);
  const [visao, setVisao] = useState<"lista" | "kanban">("lista");
  const [historico, setHistorico] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const consulta = trpc.juridicoDemandas.tarefas.listar.useQuery(
    { demandaId },
    POLLING_TRABALHO
  );
  const scope = trpc.juridicoEquipes.minhas.useQuery(
    undefined,
    POLLING_TRABALHO
  );
  const contexto = trpc.juridicoDemandas.getById.useQuery(
    { id: demandaId },
    POLLING_TRABALHO
  );
  const gerencia =
    !scope.isError &&
    !contexto.isError &&
    !!scope.data?.canManage &&
    !!contexto.data?.gerencia;
  const canceladasMinhas = trpc.juridicoDemandas.tarefas.minhasTarefas.useQuery(
    { demandaId, status: "cancelada", prioridade: "todas" },
    {
      ...POLLING_TRABALHO,
      enabled: historico && !gerencia && !scope.isError && !!scope.data,
    }
  );
  const canceladasEquipe = trpc.juridicoDemandas.tarefas.listarEquipe.useQuery(
    { demandaId, status: "cancelada", prioridade: "todas", limit, offset },
    { ...POLLING_TRABALHO, enabled: historico && gerencia }
  );
  const cancelQuery = gerencia ? canceladasEquipe : canceladasMinhas;
  const tarefas = consulta.isError
    ? []
    : ((consulta.data ?? []) as TarefaTrabalho[]);
  const canceladas =
    !historico || cancelQuery.isError
      ? []
      : ((gerencia
          ? (canceladasEquipe.data?.tarefas ?? [])
          : (canceladasMinhas.data ?? [])) as TarefaTrabalho[]);
  const visiveis = [...tarefas, ...canceladas];
  const pendentes = tarefas.filter(aberta).length;
  const revisao = tarefas.filter(t => t.status === "em_revisao").length;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {visiveis.length} tarefa(s) visível(is) · {pendentes} aberta(s) ·{" "}
            {revisao} em revisão
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Concluir uma atividade não encerra esta demanda nem seu prazo
            jurídico.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={visao === "lista" ? "secondary" : "ghost"}
            aria-pressed={visao === "lista"}
            onClick={() => setVisao("lista")}
          >
            <ListTodo className="mr-1 h-4 w-4" />
            Lista
          </Button>
          <Button
            size="sm"
            variant={visao === "kanban" ? "secondary" : "ghost"}
            aria-pressed={visao === "kanban"}
            onClick={() => setVisao("kanban")}
          >
            <Kanban className="mr-1 h-4 w-4" />
            Kanban
          </Button>
          {gerencia && scope.data?.canCreate && (
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Nova tarefa
            </Button>
          )}
        </div>
      </header>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={historico}
          onChange={e => {
            setHistorico(e.target.checked);
            setOffset(0);
          }}
          className="accent-indigo-600"
        />
        Incluir canceladas (histórico preservado)
      </label>
      {consulta.isLoading ? (
        <p role="status" className="py-6 text-center text-sm text-slate-500">
          Carregando tarefas…
        </p>
      ) : consulta.isError ? (
        <div
          role="alert"
          className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800"
        >
          {consulta.error.message}
          <Button
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={() => consulta.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          {!visiveis.length && (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
              Nenhuma tarefa autorizada neste recorte.
            </p>
          )}
          <TarefaColecao
            tarefas={visiveis}
            visao={visao}
            onOpen={setTarefaId}
          />
        </>
      )}
      {historico && cancelQuery.isLoading && (
        <p role="status" className="text-xs text-slate-500">
          Carregando canceladas autorizadas…
        </p>
      )}
      {historico && cancelQuery.isError && (
        <p role="alert" className="text-sm text-rose-700">
          {cancelQuery.error.message}
        </p>
      )}
      {historico && gerencia && !cancelQuery.isError && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {canceladasEquipe.data?.total ?? 0} cancelada(s) no contexto
            autorizado · página {Math.floor(offset / limit) + 1}. Resumo
            considera a página visível.
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!offset || cancelQuery.isFetching}
              onClick={() => setOffset(v => Math.max(0, v - limit))}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                cancelQuery.isFetching ||
                offset + limit >= (canceladasEquipe.data?.total ?? 0)
              }
              onClick={() => setOffset(v => v + limit)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
      {tarefaId != null && (
        <TarefaPainel
          key={tarefaId}
          tarefaId={tarefaId}
          onClose={() => setTarefaId(null)}
        />
      )}
      {criando && (
        <TarefaFormDialog
          open
          onOpenChange={setCriando}
          demandaId={demandaId}
          canManage={gerencia && !!scope.data?.canCreate}
          onCreated={setTarefaId}
        />
      )}
    </div>
  );
}
