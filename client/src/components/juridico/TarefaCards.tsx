import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  UserRound,
  Building2,
  AlertTriangle,
  Ban,
  ChevronRight,
} from "lucide-react";
import {
  ESTADOS,
  STATUS_LABEL,
  STATUS_COR,
  PRIORIDADE_LABEL,
  atrasada,
  formatarPrazo,
  agruparTarefas,
  formatarDataHora,
  type TarefaTrabalho,
} from "./trabalho";

export function TarefaCard({
  tarefa: t,
  onOpen,
}: {
  tarefa: TarefaTrabalho;
  onOpen: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(t.id)}
      aria-label={`Abrir tarefa: ${t.titulo}`}
      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-5 text-slate-900 break-words">
          {t.titulo}
        </h3>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge
          variant="outline"
          className={`text-[11px] ${STATUS_COR[t.status]}`}
        >
          {STATUS_LABEL[t.status]}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[11px] ${t.prioridade === "alta" ? "border-rose-200 bg-rose-50 text-rose-700" : "text-slate-600"}`}
        >
          Prioridade {PRIORIDADE_LABEL[t.prioridade]}
        </Badge>
        {atrasada(t) && (
          <Badge
            variant="outline"
            className="border-rose-200 text-rose-700 text-[11px]"
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            Atrasada
          </Badge>
        )}
        {!!t.bloqueada && (
          <Badge
            variant="outline"
            className="border-amber-300 text-amber-800 text-[11px]"
          >
            <Ban className="mr-1 h-3 w-3" />
            Bloqueada
          </Badge>
        )}
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
        <p className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          Prazo interno: {formatarPrazo(t.prazo)}
        </p>
        <p className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          {t.responsavelNome || "Sem responsável"}
        </p>
        <p className="flex items-start gap-1.5">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-2 break-words">
            {t.demandaNumero || `Demanda #${t.demandaId}`}
            {t.demandaAssunto ? ` · ${t.demandaAssunto}` : ""}
            <span className="block text-slate-500">
              {t.demandaCondominioNome ||
                (t.demandaCondominioId
                  ? `Condomínio #${t.demandaCondominioId}`
                  : "Contexto da demanda")}
            </span>
          </span>
        </p>
      </div>
      {t.updatedAt && (
        <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
          Atualizada em {formatarDataHora(t.updatedAt)}
        </p>
      )}
    </button>
  );
}
export function TarefaColecao({
  tarefas,
  visao,
  onOpen,
}: {
  tarefas: TarefaTrabalho[];
  visao: "lista" | "kanban";
  onOpen: (id: number) => void;
}) {
  const grupos = agruparTarefas(tarefas);
  const canceladas = tarefas.filter(t => t.status === "cancelada");
  if (visao === "lista")
    return (
      <div className="space-y-4">
        {[...ESTADOS, "cancelada" as const].map(status => {
          const itens = status === "cancelada" ? canceladas : grupos[status];
          return itens.length > 0 ? (
            <section key={status} aria-label={STATUS_LABEL[status]}>
              <h2 className="mb-2 text-xs font-semibold text-slate-600">
                {STATUS_LABEL[status]} · {itens.length}
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {itens.map(t => (
                  <TarefaCard key={t.id} tarefa={t} onOpen={onOpen} />
                ))}
              </div>
            </section>
          ) : null;
        })}
      </div>
    );
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ESTADOS.map(status => (
          <section
            key={status}
            className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-2"
            aria-label={STATUS_LABEL[status]}
          >
            <div className="mb-3 flex items-center justify-between px-1 py-2">
              <h2 className="text-sm font-semibold text-slate-700">
                {STATUS_LABEL[status]}
              </h2>
              <Badge variant="outline" className="bg-white text-slate-600">
                {grupos[status].length}
              </Badge>
            </div>
            <div className="space-y-2">
              {grupos[status].map(t => (
                <TarefaCard key={t.id} tarefa={t} onOpen={onOpen} />
              ))}
              {!grupos[status].length && (
                <p className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                  Nenhuma tarefa neste estado
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      {canceladas.length > 0 && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-600">
            Canceladas · histórico preservado
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {canceladas.map(t => (
              <TarefaCard key={t.id} tarefa={t} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
