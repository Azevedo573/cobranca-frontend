import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, MessageSquare, User, CheckCircle2, XCircle, Clock, FileText, Handshake, Scale, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Tipos de evento suportados na timeline unificada
export type EventoTimeline =
  | { tipo: "tentativa"; id: number; contactType: string; result: string | null; attemptDate: Date; notes?: string | null; userName?: string }
  | { tipo: "boleto"; id: number; attemptDate: Date; nossoNumero?: string | null; status?: string }
  | { tipo: "acordo"; id: number; attemptDate: Date; totalAmount?: number; installments?: number; status?: string }
  | { tipo: "juridico"; id: number; attemptDate: Date; notes?: string | null };

// Mantém compatibilidade com a interface antiga
interface Tentativa {
  id: number;
  contactType: string;
  result: string | null;
  attemptDate: Date;
  notes?: string | null;
  userName?: string;
}

interface TimelineTentativasProps {
  tentativas: Tentativa[];
  eventos?: EventoTimeline[];
  limite?: number;
}

const RESULTADO_CONFIG: Record<string, { icone: React.ReactNode; cor: string; label: string }> = {
  sucesso:           { icone: <CheckCircle2 className="h-3.5 w-3.5" />, cor: "text-emerald-600", label: "Sucesso" },
  promessa_pagamento:{ icone: <CheckCircle2 className="h-3.5 w-3.5" />, cor: "text-blue-600",    label: "Promessa de Pagamento" },
  promessa:          { icone: <CheckCircle2 className="h-3.5 w-3.5" />, cor: "text-blue-600",    label: "Promessa" },
  deseja_acordo:     { icone: <Handshake    className="h-3.5 w-3.5" />, cor: "text-emerald-600", label: "Deseja Acordo" },
  sem_resposta:      { icone: <Clock        className="h-3.5 w-3.5" />, cor: "text-amber-600",   label: "Sem Resposta" },
  recusa:            { icone: <XCircle      className="h-3.5 w-3.5" />, cor: "text-red-600",     label: "Recusa" },
  recusado:          { icone: <XCircle      className="h-3.5 w-3.5" />, cor: "text-red-600",     label: "Recusado" },
  outro:             { icone: <Clock        className="h-3.5 w-3.5" />, cor: "text-slate-500",   label: "Outro" },
};

const CONTATO_ICON: Record<string, React.ReactNode> = {
  telefone: <Phone       className="h-3.5 w-3.5" />,
  email:    <Mail        className="h-3.5 w-3.5" />,
  whatsapp: <MessageSquare className="h-3.5 w-3.5" />,
  pessoal:  <User        className="h-3.5 w-3.5" />,
};

const CONTATO_BG: Record<string, string> = {
  telefone: "bg-blue-500",
  email:    "bg-violet-500",
  whatsapp: "bg-emerald-500",
  pessoal:  "bg-slate-500",
};

const RESULTADO_BG: Record<string, string> = {
  sucesso:            "bg-emerald-500",
  promessa_pagamento: "bg-blue-500",
  promessa:           "bg-blue-500",
  deseja_acordo:      "bg-emerald-500",
  sem_resposta:       "bg-amber-500",
  recusa:             "bg-red-500",
  recusado:           "bg-red-500",
};

function formatMoeda(v: number) {
  return (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function TentativaItem({ ev }: { ev: Extract<EventoTimeline, { tipo: "tentativa" }> }) {
  const resultado = RESULTADO_CONFIG[ev.result ?? ""] ?? { icone: <Clock className="h-3.5 w-3.5" />, cor: "text-slate-500", label: (ev.result ?? "desconhecido").replace(/_/g, " ") };
  const bgColor = RESULTADO_BG[ev.result ?? ""] ?? CONTATO_BG[ev.contactType] ?? "bg-slate-400";

  return (
    <div className="relative flex gap-3 pb-5">
      <div className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background ${bgColor} text-white`}>
        {CONTATO_ICON[ev.contactType] ?? <Phone className="h-3.5 w-3.5" />}
      </div>
      <div className="flex-1 space-y-1 pt-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs h-5 px-1.5">
            {CONTATO_ICON[ev.contactType] ?? <Phone className="h-3 w-3" />}
            {ev.contactType.charAt(0).toUpperCase() + ev.contactType.slice(1)}
          </Badge>
          <span className={`flex items-center gap-1 text-xs font-medium ${resultado.cor}`}>
            {resultado.icone} {resultado.label}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {format(new Date(ev.attemptDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
        {ev.notes && <p className="text-xs text-muted-foreground leading-snug">{ev.notes}</p>}
        {ev.userName && <p className="text-xs text-muted-foreground/70">Por: {ev.userName}</p>}
      </div>
    </div>
  );
}

function BoletoItem({ ev }: { ev: Extract<EventoTimeline, { tipo: "boleto" }> }) {
  return (
    <div className="relative flex gap-3 pb-5">
      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-indigo-500 text-white">
        <FileText className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 space-y-1 pt-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs h-5 px-1.5 border-indigo-300 text-indigo-600 dark:text-indigo-400">
            <FileText className="h-3 w-3" /> Boleto Gerado
          </Badge>
          {ev.nossoNumero && <span className="text-xs text-muted-foreground">Nº {ev.nossoNumero}</span>}
          <span className="text-xs text-muted-foreground ml-auto">
            {format(new Date(ev.attemptDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>
    </div>
  );
}

function AcordoItem({ ev }: { ev: Extract<EventoTimeline, { tipo: "acordo" }> }) {
  const statusColor = ev.status === "ativo" ? "text-emerald-600" : ev.status === "cancelado" ? "text-red-600" : "text-slate-500";
  return (
    <div className="relative flex gap-3 pb-5">
      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-white">
        <Handshake className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 space-y-1 pt-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs h-5 px-1.5 border-emerald-300 text-emerald-600 dark:text-emerald-400">
            <Handshake className="h-3 w-3" /> Acordo Fechado
          </Badge>
          {ev.totalAmount && <span className="text-xs font-medium">{formatMoeda(ev.totalAmount)}</span>}
          {ev.installments && <span className="text-xs text-muted-foreground">em {ev.installments}x</span>}
          {ev.status && <span className={`text-xs font-medium capitalize ${statusColor}`}>{ev.status}</span>}
          <span className="text-xs text-muted-foreground ml-auto">
            {format(new Date(ev.attemptDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
      </div>
    </div>
  );
}

function JuridicoItem({ ev }: { ev: Extract<EventoTimeline, { tipo: "juridico" }> }) {
  return (
    <div className="relative flex gap-3 pb-5">
      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-background bg-red-600 text-white">
        <Scale className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 space-y-1 pt-0.5 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs h-5 px-1.5 border-red-300 text-red-600 dark:text-red-400">
            <Scale className="h-3 w-3" /> Ação Jurídica
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {format(new Date(ev.attemptDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </span>
        </div>
        {ev.notes && <p className="text-xs text-muted-foreground leading-snug">{ev.notes}</p>}
      </div>
    </div>
  );
}

export function TimelineTentativas({ tentativas, eventos, limite = 10 }: TimelineTentativasProps) {
  // Construir lista unificada de eventos
  const todosEventos: EventoTimeline[] = eventos
    ? eventos
    : tentativas.map(t => ({ tipo: "tentativa" as const, ...t }));

  const eventosOrdenados = [...todosEventos]
    .sort((a, b) => new Date(b.attemptDate).getTime() - new Date(a.attemptDate).getTime())
    .slice(0, limite);

  if (todosEventos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de Atividades</CardTitle>
          <CardDescription>Timeline unificada de eventos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma atividade registrada</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Histórico de Atividades
        </CardTitle>
        <CardDescription>
          {todosEventos.length} evento(s) registrado(s)
          {todosEventos.length > limite && ` • Mostrando os ${limite} mais recentes`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative pl-1">
          {/* Linha vertical */}
          <div className="absolute left-[13px] top-0 bottom-0 w-0.5 bg-border" />

          {eventosOrdenados.map((ev, i) => {
            if (ev.tipo === "tentativa")  return <TentativaItem key={`t-${ev.id}-${i}`} ev={ev} />;
            if (ev.tipo === "boleto")     return <BoletoItem    key={`b-${ev.id}-${i}`} ev={ev} />;
            if (ev.tipo === "acordo")     return <AcordoItem    key={`a-${ev.id}-${i}`} ev={ev} />;
            if (ev.tipo === "juridico")   return <JuridicoItem  key={`j-${ev.id}-${i}`} ev={ev} />;
            return null;
          })}
        </div>
      </CardContent>
    </Card>
  );
}
