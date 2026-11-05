export const ESTADOS = [
  "pendente",
  "em_andamento",
  "em_revisao",
  "concluida",
] as const;
export type EstadoTarefa = (typeof ESTADOS)[number] | "cancelada";
export type Prioridade = "baixa" | "media" | "alta";
export type Periodo = "hoje" | "atrasadas" | "proximos7" | "todas";
export type AcaoTarefa =
  | "iniciar"
  | "entregar"
  | "aprovar"
  | "devolver"
  | "bloquear"
  | "desbloquear"
  | "cancelar"
  | "reabrir";
export interface TarefaTrabalho {
  id: number;
  demandaId: number;
  titulo: string;
  descricao?: string | null;
  status: EstadoTarefa;
  prioridade: Prioridade;
  prazo?: string | Date | null;
  responsavelId?: number | null;
  responsavelNome?: string | null;
  demandaNumero?: string | null;
  demandaAssunto?: string | null;
  demandaCondominioId?: number | null;
  demandaCondominioNome?: string | null;
  exigeRevisao?: number | boolean;
  bloqueada?: number | boolean;
  motivoBloqueio?: string | null;
  entrega?: string | null;
  versao?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  aprovadaEm?: string | Date | null;
  concluidaEm?: string | Date | null;
}
export const STATUS_LABEL: Record<EstadoTarefa, string> = {
  pendente: "A fazer",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export const STATUS_COR: Record<EstadoTarefa, string> = {
  pendente: "bg-slate-100 text-slate-700 border-slate-200",
  em_andamento: "bg-indigo-50 text-indigo-700 border-indigo-200",
  em_revisao: "bg-amber-50 text-amber-800 border-amber-200",
  concluida: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelada: "bg-slate-100 text-slate-600 border-slate-300",
};
export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};
export const ACAO_LABEL: Record<AcaoTarefa, string> = {
  iniciar: "Iniciar",
  entregar: "Entregar",
  aprovar: "Aprovar entrega",
  devolver: "Devolver com ajustes",
  bloquear: "Informar impedimento",
  desbloquear: "Remover impedimento",
  cancelar: "Cancelar tarefa",
  reabrir: "Reabrir tarefa",
};
export const PERIODO_LABEL: Record<Periodo, string> = {
  hoje: "Hoje",
  atrasadas: "Atrasadas",
  proximos7: "Próximos 7 dias",
  todas: "Todas",
};

// Prazos internos são datas de calendário; meia-noite UTC não deve virar o dia anterior.
export function diaPrazo(value: TarefaTrabalho["prazo"]): string | null {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : value;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(raw);
  if (match && !Number.isNaN(Date.parse(match[1] + "T12:00:00")))
    return match[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function diaLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function formatarPrazo(value: TarefaTrabalho["prazo"]) {
  const dia = diaPrazo(value);
  return dia ? dia.split("-").reverse().join("/") : "Sem prazo";
}
export function formatarDataHora(value?: string | Date | null) {
  if (!value) return "Não registrado";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não registrado"
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
export function aberta(t: Pick<TarefaTrabalho, "status">) {
  return t.status !== "concluida" && t.status !== "cancelada";
}
export function atrasada(t: TarefaTrabalho, now = new Date()) {
  const dia = diaPrazo(t.prazo);
  return aberta(t) && !!dia && dia < diaLocal(now);
}
export interface FiltrosTarefa {
  periodo: Periodo;
  status?: EstadoTarefa | "todas";
  prioridade?: Prioridade | "todas";
  condominioId?: string;
  responsavelId?: string;
  demandaId?: string;
  busca?: string;
}
export function filtrarTarefas(
  tarefas: readonly TarefaTrabalho[],
  filtros: FiltrosTarefa,
  now = new Date()
): TarefaTrabalho[] {
  const hoje = diaLocal(now);
  const fim = new Date(now);
  fim.setDate(fim.getDate() + 6);
  return tarefas.filter(t => {
    if (
      filtros.status &&
      filtros.status !== "todas" &&
      t.status !== filtros.status
    )
      return false;
    if (
      (!filtros.status || filtros.status === "todas") &&
      t.status === "cancelada"
    )
      return false;
    if (
      filtros.prioridade &&
      filtros.prioridade !== "todas" &&
      t.prioridade !== filtros.prioridade
    )
      return false;
    if (
      filtros.condominioId &&
      String(t.demandaCondominioId) !== filtros.condominioId
    )
      return false;
    if (filtros.demandaId && String(t.demandaId) !== filtros.demandaId)
      return false;
    if (
      filtros.responsavelId === "sem"
        ? !!t.responsavelId
        : filtros.responsavelId &&
          String(t.responsavelId) !== filtros.responsavelId
    )
      return false;
    if (
      filtros.busca &&
      !`${t.titulo} ${t.demandaNumero ?? ""} ${t.demandaAssunto ?? ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(filtros.busca.toLocaleLowerCase("pt-BR"))
    )
      return false;
    const prazo = diaPrazo(t.prazo);
    if (filtros.periodo === "atrasadas") return atrasada(t, now);
    if (filtros.periodo === "hoje") return aberta(t) && prazo === hoje;
    if (filtros.periodo === "proximos7")
      return aberta(t) && !!prazo && prazo >= hoje && prazo <= diaLocal(fim);
    return true;
  });
}
export function agruparTarefas(tarefas: readonly TarefaTrabalho[]) {
  return Object.fromEntries(
    ESTADOS.map(s => [s, tarefas.filter(t => t.status === s)])
  ) as Record<(typeof ESTADOS)[number], TarefaTrabalho[]>;
}
export function indicadoresTarefas(
  tarefas: readonly TarefaTrabalho[],
  now = new Date()
) {
  return {
    semResponsavel: tarefas.filter(t => aberta(t) && !t.responsavelId).length,
    atrasadas: tarefas.filter(t => atrasada(t, now)).length,
    hoje: tarefas.filter(t => aberta(t) && diaPrazo(t.prazo) === diaLocal(now))
      .length,
    revisao: tarefas.filter(t => t.status === "em_revisao").length,
  };
}
export function acoesDisponiveis(
  t: TarefaTrabalho,
  userId: number,
  canManage: boolean,
  canApprove: boolean
): AcaoTarefa[] {
  const executor = t.responsavelId === userId;
  const acoes: AcaoTarefa[] = [];
  if (executor && !t.bloqueada && t.status === "pendente")
    acoes.push("iniciar");
  if (executor && !t.bloqueada && t.status === "em_andamento")
    acoes.push("entregar");
  if (t.status === "em_revisao" && canApprove && !executor) {
    if (!t.bloqueada && t.exigeRevisao && t.entrega?.trim())
      acoes.push("aprovar");
    acoes.push("devolver");
  }
  if ((executor || canManage) && aberta(t))
    acoes.push(t.bloqueada ? "desbloquear" : "bloquear");
  if (canManage && aberta(t)) acoes.push("cancelar");
  if (canManage && !aberta(t)) acoes.push("reabrir");
  return acoes;
}
export function exigeTexto(acao: AcaoTarefa, t: TarefaTrabalho) {
  return (
    ["devolver", "bloquear", "cancelar"].includes(acao) ||
    (acao === "entregar" && !!t.exigeRevisao)
  );
}
export const POLLING_TRABALHO = {
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  retry: false,
} as const;
