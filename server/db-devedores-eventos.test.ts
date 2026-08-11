import { describe, expect, it } from "vitest";
import { consolidarEventosAtendimento } from "./db-devedores";

describe("consolidarEventosAtendimento", () => {
  it("une e ordena eventos de fontes diferentes pela data mais recente", () => {
    const eventos = consolidarEventosAtendimento({
      tentativas: [{ id: 1, attemptDate: new Date("2026-08-01T10:00:00Z"), contactType: "telefone", result: "promessa_pagamento", notes: "Paga sexta-feira" }],
      conversas: [{ id: 2, ultimaMensagemEm: new Date("2026-08-03T10:00:00Z"), ultimaMensagem: "Vou verificar", status: "aberta", telefone: "5521999999999" }],
      atendimentos: [{ id: 3, iniciadoEm: new Date("2026-08-02T10:00:00Z"), protocolo: "ATD-001", status: "resolvido", prioridade: "normal", motivoFechamento: null }],
    });

    expect(eventos.map((evento) => evento.origem)).toEqual(["whatsapp", "atendimento", "promessa"]);
    expect(eventos[2]).toMatchObject({ titulo: "Promessa de pagamento registrada", descricao: "Paga sexta-feira" });
  });

  it("ignora conversa sem data de última mensagem", () => {
    const eventos = consolidarEventosAtendimento({
      tentativas: [],
      conversas: [{ id: 2, ultimaMensagemEm: null, ultimaMensagem: "Sem data", status: "aberta", telefone: "5521999999999" }],
      atendimentos: [],
    });
    expect(eventos).toHaveLength(0);
  });
});
