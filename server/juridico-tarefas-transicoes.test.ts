import { describe, expect, it } from "vitest";
import type { TarefaDemanda } from "../drizzle/schema";
import { acaoParaStatus, transicaoTarefa, validarVersao, type TarefaCapacidades } from "./juridico-tarefas-transicoes";

const tarefa = (patch: Partial<TarefaDemanda> = {}): TarefaDemanda => ({ id: 1, demandaId: 8, titulo: "Parecer",
  descricao: null, responsavelId: 10, responsavelNome: "Executor", status: "pendente", prioridade: "media", prazo: null,
  criadoPorId: 20, criadoPorNome: "Gestora", exigeRevisao: 0, bloqueada: 0, motivoBloqueio: null, entrega: null,
  iniciadaEm: null, entregueEm: null, concluidaEm: null, aprovadaEm: null, aprovadoPorId: null,
  versao: 1, createdAt: new Date(), updatedAt: new Date(), ...patch });
const executor: TarefaCapacidades = { actorId: 10, gerencia: false, canEdit: false, canApprove: false, canExecute: true };
const gestora: TarefaCapacidades = { actorId: 20, gerencia: true, canEdit: true, canApprove: true };
const agora = new Date("2026-11-05T12:00:00Z");

describe("transições jurídicas", () => {
  it("executor inicia sem precisar da capacidade de gestão", () => {
    expect(transicaoTarefa(tarefa(), "iniciar", executor, undefined, agora)).toEqual({ status: "em_andamento", iniciadaEm: agora });
  });
  it("entrega sem revisão conclui mas não inventa aprovação", () => {
    expect(transicaoTarefa(tarefa({ status: "em_andamento" }), "entregar", executor, " Parecer entregue ", agora))
      .toEqual({ status: "concluida", entrega: "Parecer entregue", entregueEm: agora, concluidaEm: agora, aprovadaEm: null, aprovadoPorId: null });
    expect(transicaoTarefa(tarefa({ status: "em_andamento" }), "entregar", executor, undefined, agora))
      .toMatchObject({ status: "concluida", entrega: null, aprovadaEm: null, aprovadoPorId: null });
  });
  it("revisão ligada envia à revisão e exige texto", () => {
    const current = tarefa({ status: "em_andamento", exigeRevisao: 1 });
    expect(transicaoTarefa(current, "entregar", executor, "Entrega", agora)).toMatchObject({ status: "em_revisao", concluidaEm: null });
    expect(() => transicaoTarefa(current, "entregar", executor, "  ")).toThrow("Informe o texto");
  });
  it("aprovação somente por gestor autorizada", () => {
    const current = tarefa({ status: "em_revisao", exigeRevisao: 1, entrega: "Parecer" });
    expect(transicaoTarefa(current, "aprovar", gestora, undefined, agora)).toEqual({ status: "concluida", concluidaEm: agora, aprovadaEm: agora, aprovadoPorId: 20 });
    expect(() => transicaoTarefa(current, "aprovar", executor)).toThrow();
    expect(() => transicaoTarefa(current, "aprovar", { ...gestora, canApprove: false })).toThrow("Somente a gestão");
  });
  it("administrador/gestor não autoaprova nem devolve sua própria execução", () => {
    const own = tarefa({ responsavelId: 20, status: "em_revisao", exigeRevisao: 1, entrega: "Entrega" });
    for (const acao of ["aprovar", "devolver"] as const) expect(() => transicaoTarefa(own, acao, gestora, "Motivo")).toThrow("própria entrega");
  });
  it("aprovar requer entrega existente e estado em revisão", () => {
    expect(() => transicaoTarefa(tarefa({ status: "em_revisao", exigeRevisao: 1 }), "aprovar", gestora)).toThrow("entrega válida");
    expect(() => transicaoTarefa(tarefa(), "aprovar", gestora)).toThrow("Transição inválida");
  });
  it("devolução exige motivo e mantém a entrega anterior auditável", () => {
    const current = tarefa({ status: "em_revisao", exigeRevisao: 1, entrega: "Versão anterior" });
    expect(() => transicaoTarefa(current, "devolver", gestora)).toThrow("Informe o texto");
    expect(transicaoTarefa(current, "devolver", gestora, "Ajustar fundamentos")).toEqual({ status: "em_andamento", concluidaEm: null, aprovadaEm: null, aprovadoPorId: null });
  });
  it("bloqueio é marcador com motivo e impede avanço", () => {
    expect(transicaoTarefa(tarefa(), "bloquear", executor, "Aguardando documentos")).toEqual({ bloqueada: 1, motivoBloqueio: "Aguardando documentos" });
    expect(() => transicaoTarefa(tarefa(), "bloquear", executor)).toThrow("Informe o texto");
    expect(() => transicaoTarefa(tarefa({ bloqueada: 1 }), "iniciar", executor)).toThrow("Desbloqueie");
    expect(() => transicaoTarefa(tarefa({ status: "em_andamento", bloqueada: 1 }), "entregar", executor, "Entrega")).toThrow("Desbloqueie");
    expect(transicaoTarefa(tarefa({ bloqueada: 1 }), "desbloquear", executor)).toEqual({ bloqueada: 0, motivoBloqueio: null });
  });
  it("cancelamento exige gestão/motivo e reabertura limpa datas de execução", () => {
    expect(() => transicaoTarefa(tarefa(), "cancelar", executor, "Cancelamento")).toThrow("gestão autorizada");
    expect(() => transicaoTarefa(tarefa(), "cancelar", gestora)).toThrow("Informe o texto");
    expect(transicaoTarefa(tarefa(), "cancelar", gestora, "Atividade duplicada")).toEqual({ status: "cancelada" });
    expect(transicaoTarefa(tarefa({ status: "cancelada" }), "reabrir", gestora)).toMatchObject({ status: "pendente", aprovadaEm: null, entrega: null });
  });
  it("outro executor nunca executa, mesmo que consumidor passe canExecute", () => {
    expect(() => transicaoTarefa(tarefa(), "iniciar", { ...executor, actorId: 11 })).toThrow("executor atual");
  });
  it("endpoints antigos não podem pular revisão ou dar conclusão a pendente", () => {
    expect(() => acaoParaStatus(tarefa({ exigeRevisao: 1, status: "em_andamento" }), "concluida")).toThrow("para revisão");
    expect(() => transicaoTarefa(tarefa(), acaoParaStatus(tarefa(), "concluida")!, executor, "Texto")).toThrow("Transição inválida");
    expect(acaoParaStatus(tarefa({ exigeRevisao: 1, status: "em_revisao" }), "concluida")).toBe("aprovar");
    expect(() => acaoParaStatus(tarefa(), "em_revisao")).toThrow("não exige revisão");
    expect(acaoParaStatus(tarefa(), "pendente")).toBeNull();
  });
  it("versão antiga resulta CONFLICT", () => {
    expect(() => validarVersao(3, 2)).toThrow("outra sessão");
    expect(() => validarVersao(3, 3)).not.toThrow();
  });
});
