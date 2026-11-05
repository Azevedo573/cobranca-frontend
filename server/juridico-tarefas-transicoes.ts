import { TRPCError } from "@trpc/server";
import type { TarefaDemanda } from "../drizzle/schema";
import type { TarefaAcao, TarefaStatus } from "../shared/juridico-tarefas";

export type TarefaCapacidades = { actorId: number; gerencia: boolean; canEdit: boolean; canApprove: boolean; canExecute?: boolean };
const invalid = (message: string): never => { throw new TRPCError({ code: "BAD_REQUEST", message }); };
const forbidden = (message: string): never => { throw new TRPCError({ code: "FORBIDDEN", message }); };

export function exigirGestao(cap: TarefaCapacidades) {
  if (!cap.gerencia || !cap.canEdit) forbidden("Ação exclusiva da gestão autorizada desta demanda.");
}

export function validarVersao(atual: number, esperada?: number) {
  if (esperada !== undefined && atual !== esperada) {
    throw new TRPCError({ code: "CONFLICT", message: "A tarefa mudou em outra sessão. Atualize os dados antes de tentar novamente." });
  }
}

export function transicaoTarefa(
  tarefa: TarefaDemanda,
  acao: TarefaAcao,
  cap: TarefaCapacidades,
  texto?: string,
  agora = new Date(),
): Partial<TarefaDemanda> {
  if (!cap.canEdit && !cap.canExecute && !(["aprovar", "devolver"].includes(acao) && cap.canApprove)) forbidden("Sem permissão para editar tarefas.");
  if (!cap.gerencia && tarefa.responsavelId !== cap.actorId) forbidden("Somente o executor atual pode executar esta tarefa.");
  const motivo = texto?.trim();
  const exigirTexto = () => { if (!motivo) invalid("Informe o texto da entrega ou o motivo da ação."); return motivo!; };
  const exigirEstado = (...estados: TarefaStatus[]) => {
    if (!estados.includes(tarefa.status)) invalid("Transição inválida para o estado atual da tarefa.");
  };
  const exigirDesbloqueada = () => { if (tarefa.bloqueada) invalid("Desbloqueie a tarefa antes de executar esta ação."); };
  const exigirRevisor = () => {
    if (!cap.gerencia || !cap.canApprove) forbidden("Somente a gestão autorizada pode revisar esta entrega.");
    if (tarefa.responsavelId === cap.actorId) forbidden("O executor não pode aprovar nem devolver a própria entrega, inclusive administrador.");
  };
  switch (acao) {
    case "iniciar":
      exigirEstado("pendente"); exigirDesbloqueada();
      return { status: "em_andamento", iniciadaEm: agora };
    case "entregar":
      exigirEstado("em_andamento"); exigirDesbloqueada();
      return { status: tarefa.exigeRevisao ? "em_revisao" : "concluida", entrega: tarefa.exigeRevisao ? exigirTexto() : motivo || null, entregueEm: agora,
        concluidaEm: tarefa.exigeRevisao ? null : agora, aprovadaEm: null, aprovadoPorId: null };
    case "aprovar":
      exigirEstado("em_revisao"); exigirRevisor(); exigirDesbloqueada();
      if (!tarefa.exigeRevisao || !tarefa.entrega?.trim()) invalid("A tarefa não tem uma entrega válida para revisão.");
      return { status: "concluida", concluidaEm: agora, aprovadaEm: agora, aprovadoPorId: cap.actorId };
    case "devolver":
      exigirEstado("em_revisao"); exigirRevisor(); exigirTexto();
      return { status: "em_andamento", concluidaEm: null, aprovadaEm: null, aprovadoPorId: null };
    case "bloquear":
      exigirEstado("pendente", "em_andamento", "em_revisao");
      if (tarefa.bloqueada) invalid("A tarefa já está bloqueada.");
      return { bloqueada: 1, motivoBloqueio: exigirTexto() };
    case "desbloquear":
      exigirEstado("pendente", "em_andamento", "em_revisao");
      if (!tarefa.bloqueada) invalid("A tarefa não está bloqueada.");
      return { bloqueada: 0, motivoBloqueio: null };
    case "cancelar":
      exigirGestao(cap); exigirEstado("pendente", "em_andamento", "em_revisao", "concluida"); exigirTexto();
      return { status: "cancelada" };
    case "reabrir":
      exigirGestao(cap); exigirEstado("concluida", "cancelada");
      return { status: "pendente", iniciadaEm: null, entregueEm: null, concluidaEm: null,
        aprovadaEm: null, aprovadoPorId: null, entrega: null, bloqueada: 0, motivoBloqueio: null };
  }
}

/** Adaptação dos endpoints antigos, sem escrita direta de status nem bypass da revisão. */
export function acaoParaStatus(tarefa: TarefaDemanda, status: TarefaStatus): TarefaAcao | null {
  if (tarefa.status === status) return null;
  if (status === "em_andamento") return tarefa.status === "em_revisao" ? "devolver" : "iniciar";
  if (status === "em_revisao") {
    if (!tarefa.exigeRevisao) invalid("Esta tarefa não exige revisão.");
    return "entregar";
  }
  if (status === "concluida") {
    if (tarefa.status === "em_revisao") return "aprovar";
    if (tarefa.exigeRevisao) invalid("Entregue a tarefa para revisão antes de concluir.");
    return "entregar";
  }
  if (status === "cancelada") return "cancelar";
  return "reabrir";
}
