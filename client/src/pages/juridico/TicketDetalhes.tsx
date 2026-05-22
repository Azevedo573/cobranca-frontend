import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Scale,
  Paperclip,
  User,
  Building2,
} from "lucide-react";

const CATEGORIAS: Record<string, string> = {
  consultoria: "Consultoria",
  notificacao: "Notificação",
  acao_judicial: "Ação Judicial",
  cobranca_judicial: "Cobrança Judicial",
  assembleia: "Assembleia",
  contrato: "Contrato",
  outro: "Outro",
};

const PRIORIDADES: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-100 text-slate-700" },
  media: { label: "Média", color: "bg-blue-100 text-blue-700" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-700" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700" },
};

const STATUS_OPTIONS = [
  { value: "aberto", label: "Aberto", icon: AlertCircle, color: "bg-yellow-100 text-yellow-700" },
  { value: "em_andamento", label: "Em Andamento", icon: Clock, color: "bg-blue-100 text-blue-700" },
  { value: "aguardando_cliente", label: "Aguardando Cliente", icon: Clock, color: "bg-purple-100 text-purple-700" },
  { value: "resolvido", label: "Resolvido", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  { value: "cancelado", label: "Cancelado", icon: XCircle, color: "bg-slate-100 text-slate-500" },
];

export default function TicketDetalhes() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/juridico/solicitacoes/:id");
  const ticketId = match ? parseInt(params!.id) : 0;

  const [mensagem, setMensagem] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: ticket, isLoading: loadingTicket } = trpc.juridico.getTicket.useQuery(
    { id: ticketId },
    { enabled: ticketId > 0 }
  );

  const { data: mensagens = [], isLoading: loadingMensagens } = trpc.juridico.getMensagens.useQuery(
    { ticketId },
    { enabled: ticketId > 0, refetchInterval: 10000 }
  );

  const sendMensagem = trpc.juridico.sendMensagem.useMutation({
    onSuccess: () => {
      utils.juridico.getMensagens.invalidate({ ticketId });
      utils.juridico.getTicket.invalidate({ id: ticketId });
      setMensagem("");
    },
    onError: (err) => toast.error("Erro ao enviar mensagem: " + err.message),
  });

  const updateTicket = trpc.juridico.updateTicket.useMutation({
    onSuccess: () => {
      utils.juridico.getTicket.invalidate({ id: ticketId });
      utils.juridico.listTickets.invalidate();
      toast.success("Ticket atualizado!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const handleSend = () => {
    if (!mensagem.trim()) return;
    sendMensagem.mutate({ ticketId, conteudo: mensagem.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleSend();
    }
  };

  if (loadingTicket) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
        <div className="h-64 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Solicitação não encontrada.</p>
        <Button variant="outline" onClick={() => navigate("/juridico/solicitacoes")} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const statusInfo = STATUS_OPTIONS.find((s) => s.value === ticket.status) ?? STATUS_OPTIONS[0];
  const StatusIcon = statusInfo.icon;
  const prioInfo = PRIORIDADES[ticket.prioridade] ?? PRIORIDADES.media;
  const isClosed = ticket.status === "resolvido" || ticket.status === "cancelado";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/juridico/solicitacoes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Scale className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">#{ticket.id}</span>
            <Badge variant="outline" className="text-xs">{CATEGORIAS[ticket.categoria] ?? ticket.categoria}</Badge>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prioInfo.color}`}>
              {prioInfo.label}
            </span>
            <span className={`flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
              <StatusIcon className="h-3 w-3" />
              {statusInfo.label}
            </span>
          </div>
          <h1 className="text-xl font-bold mt-0.5">{ticket.titulo}</h1>
        </div>
        {/* Admin: alterar status */}
        {user?.role === "admin" && (
          <Select
            value={ticket.status}
            onValueChange={(val) => updateTicket.mutate({ id: ticket.id, status: val as any })}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chat de mensagens */}
        <div className="lg:col-span-2 flex flex-col">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">Conversa</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Mensagem inicial (descrição do ticket) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px] max-h-[500px]">
                {/* Descrição inicial */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">Solicitação inicial</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">
                      {ticket.descricao}
                    </div>
                  </div>
                </div>

                {/* Mensagens */}
                {loadingMensagens ? (
                  <div className="space-y-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                    ))}
                  </div>
                ) : (
                  mensagens.map((msg) => {
                    const isEscritorio = msg.tipoAutor === "escritorio";
                    return (
                      <div key={msg.id} className={`flex gap-3 ${isEscritorio ? "flex-row-reverse" : ""}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isEscritorio ? "bg-primary/10" : "bg-secondary"}`}>
                          {isEscritorio ? (
                            <Scale className="h-4 w-4 text-primary" />
                          ) : (
                            <User className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className={`flex-1 ${isEscritorio ? "items-end" : "items-start"} flex flex-col`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {isEscritorio ? "Escritório" : "Condomínio"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.createdAt).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className={`rounded-lg p-3 text-sm whitespace-pre-wrap max-w-[85%] ${isEscritorio ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            {msg.conteudo}
                          </div>
                          {msg.anexos && msg.anexos.length > 0 && (
                            <div className="flex gap-2 mt-1 flex-wrap">
                              {msg.anexos.map((a: any, i: number) => (
                                <a
                                  key={i}
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {a.nome}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input de mensagem */}
              {!isClosed && (
                <div className="border-t p-4 space-y-2">
                  <Textarea
                    placeholder="Digite sua mensagem... (Ctrl+Enter para enviar)"
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    className="resize-none"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSend}
                      disabled={!mensagem.trim() || sendMensagem.isPending}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {sendMensagem.isPending ? "Enviando..." : "Enviar"}
                    </Button>
                  </div>
                </div>
              )}
              {isClosed && (
                <div className="border-t p-4 text-center text-sm text-muted-foreground">
                  Este ticket está {ticket.status === "resolvido" ? "resolvido" : "cancelado"} e não aceita mais mensagens.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Painel lateral de detalhes */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Detalhes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Categoria</p>
                <p className="font-medium">{CATEGORIAS[ticket.categoria] ?? ticket.categoria}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Prioridade</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${prioInfo.color}`}>
                  {prioInfo.label}
                </span>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Aberto em</p>
                <p className="font-medium">{new Date(ticket.createdAt).toLocaleString("pt-BR")}</p>
              </div>
              {ticket.resolvidoEm && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Resolvido em</p>
                  <p className="font-medium">{new Date(ticket.resolvidoEm).toLocaleString("pt-BR")}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Mensagens</p>
                <p className="font-medium">{mensagens.length}</p>
              </div>
            </CardContent>
          </Card>

          {/* Admin: alterar prioridade */}
          {user?.role === "admin" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Ações Admin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Alterar prioridade</p>
                  <Select
                    value={ticket.prioridade}
                    onValueChange={(val) => updateTicket.mutate({ id: ticket.id, prioridade: val as any })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORIDADES).map(([val, { label }]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!isClosed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-green-600 border-green-200 hover:bg-green-50"
                    onClick={() => updateTicket.mutate({ id: ticket.id, status: "resolvido" })}
                    disabled={updateTicket.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Resolvido
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
