export type EstadoProgressoDocumento = {
  nome: string; tamanho: number;
  fase: "preparando" | "enviando" | "salvando" | "concluido" | "erro";
  percentual: number | null; erro?: string;
};
export type EventoProgressoDocumento =
  | { tipo: "leitura" | "transmissao"; loaded: number; total: number; lengthComputable: boolean }
  | { tipo: "iniciarEnvio" }
  | { tipo: "transmitido" }
  | { tipo: "sucesso" }
  | { tipo: "erro"; mensagem: string };

export function iniciarProgressoDocumento(arquivo: { name: string; size: number }): EstadoProgressoDocumento {
  return { nome: arquivo.name, tamanho: arquivo.size, fase: "preparando", percentual: 0 };
}
export function atualizarProgressoDocumento(estado: EstadoProgressoDocumento, evento: EventoProgressoDocumento): EstadoProgressoDocumento {
  if (estado.fase === "erro" || estado.fase === "concluido") return estado;
  if (evento.tipo === "erro") return { ...estado, fase: "erro", erro: evento.mensagem };
  if (evento.tipo === "sucesso") return { ...estado, fase: "concluido", percentual: 100 };
  if (evento.tipo === "transmitido") return { ...estado, fase: "salvando", percentual: 100 };
  if (evento.tipo === "iniciarEnvio") return { ...estado, fase: "enviando", percentual: 0 };
  // Não regredir ao envio depois que o browser já concluiu a transmissão.
  if (estado.fase === "salvando") return estado;
  const percentual = evento.lengthComputable && evento.total > 0
    ? Math.floor(Math.min(100, Math.max(0, evento.loaded / evento.total * 100))) : null;
  return { ...estado, fase: evento.tipo === "leitura" ? "preparando" : "enviando", percentual };
}
export function textoFaseDocumento(estado: EstadoProgressoDocumento): string {
  return { preparando: "Preparando PDF", enviando: "Enviando PDF", salvando: "Salvando documento", concluido: "Documento enviado", erro: "Não foi possível enviar" }[estado.fase];
}
