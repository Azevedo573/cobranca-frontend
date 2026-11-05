export const TAREFA_STATUS = ["pendente", "em_andamento", "em_revisao", "concluida", "cancelada"] as const;
export type TarefaStatus = (typeof TAREFA_STATUS)[number];
export const TAREFA_STATUS_VISUAIS = ["pendente", "em_andamento", "em_revisao", "concluida"] as const;
export const TAREFA_STATUS_LABELS: Record<TarefaStatus, string> = {
  pendente: "A fazer",
  em_andamento: "Em andamento",
  em_revisao: "Em revisão",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
export const TAREFA_PRIORIDADES = ["baixa", "media", "alta"] as const;
export type TarefaPrioridade = (typeof TAREFA_PRIORIDADES)[number];
export const TAREFA_PRIORIDADE_LABELS: Record<TarefaPrioridade, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta",
};
export const TAREFA_ACOES = ["iniciar", "entregar", "aprovar", "devolver", "bloquear", "desbloquear", "cancelar", "reabrir"] as const;
export type TarefaAcao = (typeof TAREFA_ACOES)[number];
export const TAREFA_PRAZO_FILTROS = ["hoje", "atrasadas", "7dias", "todas"] as const;
export type TarefaPrazoFiltro = (typeof TAREFA_PRAZO_FILTROS)[number];
