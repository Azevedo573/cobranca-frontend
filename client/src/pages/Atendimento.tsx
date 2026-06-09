import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MessageCircle, Send, Paperclip, Search, Phone, User,
  RefreshCw, Settings, Clock, CheckCheck, Check,
  Plus, X, Download, Play, Pause, Volume2,
  Tag, FileText, Image as ImageIcon, Mic,
  AlertTriangle, Zap, ArrowRight, Users, BarChart2,
  Circle, Inbox, CheckCircle2, XCircle, Star,
  ChevronDown, StickyNote, Shuffle, LogOut,
  Building2, Scale, Globe, Timer, TrendingUp,
  MoreVertical, Bell, Filter,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";

// ─── Tipos locais ─────────────────────────────────────────────────────────────
type Atendimento = {
  id: number;
  protocolo: string;
  status: string;
  prioridade: string;
  slaLimite: Date | null;
  slaViolado: number;
  iniciadoEm: Date;
  atendidoEm?: Date | null;
  conversaId: number;
  departamentoId?: number | null;
  devedorId?: number | null;
  cobrancaId?: number | null;
  telefone?: string | null;
  nomeContato?: string | null;
  ultimaMensagem?: string | null;
  naoLidas?: number;
  departamentoNome?: string | null;
  departamentoCor?: string | null;
  devedorNome?: string | null;
  operadorNome?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const prioridadeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  urgente: { label: "Urgente", color: "bg-red-500 text-white", icon: <AlertTriangle className="h-3 w-3" /> },
  alta: { label: "Alta", color: "bg-orange-500 text-white", icon: <Zap className="h-3 w-3" /> },
  normal: { label: "Normal", color: "bg-blue-500 text-white", icon: <Circle className="h-3 w-3" /> },
  baixa: { label: "Baixa", color: "bg-gray-400 text-white", icon: <ChevronDown className="h-3 w-3" /> },
};

const statusOperadorConfig: Record<string, { label: string; color: string }> = {
  online: { label: "Online", color: "bg-green-500" },
  ausente: { label: "Ausente", color: "bg-yellow-500" },
  ocupado: { label: "Ocupado", color: "bg-orange-500" },
  offline: { label: "Offline", color: "bg-gray-400" },
};

function formatElapsed(date: Date | string | null): string {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function isSlaProximo(slaLimite: Date | null | string): boolean {
  if (!slaLimite) return false;
  const diff = new Date(slaLimite).getTime() - Date.now();
  return diff > 0 && diff < 15 * 60 * 1000; // menos de 15 min
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

// ─── Componente: Card de Atendimento na Fila ──────────────────────────────────
function CardFila({
  atend,
  onAssumir,
}: {
  atend: Atendimento;
  onAssumir: (id: number) => void;
}) {
  const prio = prioridadeConfig[atend.prioridade] ?? prioridadeConfig.normal;
  const slaViolado = atend.slaViolado === 1;
  const slaProximo = isSlaProximo(atend.slaLimite);

  return (
    <div className={cn(
      "rounded-xl border p-3 bg-card hover:shadow-md transition-all cursor-pointer group",
      slaViolado && "border-red-300 bg-red-50",
      slaProximo && !slaViolado && "border-orange-300 bg-orange-50",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
              {initials(atend.nomeContato)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{atend.nomeContato || atend.telefone}</p>
            <p className="text-xs text-muted-foreground">{atend.protocolo}</p>
          </div>
        </div>
        <Badge className={cn("text-[10px] h-5 px-1.5 shrink-0 gap-1", prio.color)}>
          {prio.icon}{prio.label}
        </Badge>
      </div>

      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatElapsed(atend.iniciadoEm)}
        </span>
        {atend.departamentoNome && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: atend.departamentoCor ?? "#6366f1" }} />
            {atend.departamentoNome}
          </span>
        )}
        {atend.devedorNome && (
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            {atend.devedorNome}
          </span>
        )}
      </div>

      {(slaViolado || slaProximo) && (
        <div className={cn(
          "flex items-center gap-1 mt-1.5 text-xs font-medium",
          slaViolado ? "text-red-600" : "text-orange-600"
        )}>
          <AlertTriangle className="h-3 w-3" />
          {slaViolado ? "SLA violado" : "SLA próximo do vencimento"}
        </div>
      )}

      <Button
        size="sm"
        className="w-full mt-2 h-7 text-xs bg-green-600 hover:bg-green-700 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onAssumir(atend.id)}
      >
        Assumir atendimento
      </Button>
    </div>
  );
}

// ─── Componente: Card de Atendimento Ativo ────────────────────────────────────
function CardAtendimentoAtivo({
  atend,
  isSelected,
  onClick,
}: {
  atend: Atendimento;
  isSelected: boolean;
  onClick: () => void;
}) {
  const prio = prioridadeConfig[atend.prioridade] ?? prioridadeConfig.normal;
  const slaViolado = atend.slaViolado === 1;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/50",
        isSelected
          ? "bg-primary/10 border-l-2 border-l-primary"
          : "hover:bg-muted/50",
        slaViolado && "bg-red-50"
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
          {initials(atend.nomeContato)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">{atend.nomeContato || atend.telefone}</p>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {atend.naoLidas && atend.naoLidas > 0 ? (
              <Badge className="h-4 min-w-4 px-1 text-[10px] bg-green-500 text-white rounded-full">
                {atend.naoLidas}
              </Badge>
            ) : null}
            <Badge className={cn("text-[10px] h-4 px-1 gap-0.5", prio.color)}>
              {prio.icon}
            </Badge>
          </div>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {atend.ultimaMensagem || atend.protocolo}
          </p>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {formatElapsed(atend.atendidoEm ?? atend.iniciadoEm)}
          </span>
        </div>
        {atend.departamentoNome && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: atend.departamentoCor ?? "#6366f1" }} />
            <span className="text-[10px] text-muted-foreground">{atend.departamentoNome}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Componente: Painel de Detalhes do Atendimento ────────────────────────────
function PainelDetalhes({
  atendimentoId,
  conversaId,
  onTransferir,
  onFinalizar,
}: {
  atendimentoId: number;
  conversaId: number;
  onTransferir: () => void;
  onFinalizar: () => void;
}) {
  const [novaNotaTexto, setNovaNotaTexto] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);

  const { data: atend } = trpc.atendimento.atendimentoPorConversa.useQuery(
    { conversaId },
    { refetchInterval: 5000 }
  );
  const { data: notas = [], refetch: refetchNotas } = trpc.atendimento.listarNotas.useQuery(
    { atendimentoId },
    { enabled: !!atendimentoId }
  );
  const { data: etiquetasAtend = [], refetch: refetchEtiquetas } = trpc.atendimento.etiquetasDoAtendimento.useQuery(
    { atendimentoId },
    { enabled: !!atendimentoId }
  );
  const { data: todasEtiquetas = [] } = trpc.atendimento.listarEtiquetas.useQuery();

  const criarNotaMutation = trpc.atendimento.criarNota.useMutation({
    onSuccess: () => { setNovaNotaTexto(""); refetchNotas(); },
    onError: (e) => toast.error("Erro ao salvar nota: " + e.message),
  });

  const aplicarEtiquetaMutation = trpc.atendimento.aplicarEtiqueta.useMutation({
    onSuccess: () => refetchEtiquetas(),
  });

  const removerEtiquetaMutation = trpc.atendimento.removerEtiqueta.useMutation({
    onSuccess: () => refetchEtiquetas(),
  });

  const atualizarPrioridadeMutation = trpc.atendimento.atualizarPrioridade.useMutation({
    onSuccess: () => toast.success("Prioridade atualizada"),
  });

  const handleSalvarNota = async () => {
    if (!novaNotaTexto.trim()) return;
    setSalvandoNota(true);
    try {
      await criarNotaMutation.mutateAsync({ atendimentoId, conteudo: novaNotaTexto.trim() });
    } finally {
      setSalvandoNota(false);
    }
  };

  if (!atend) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      Carregando detalhes...
    </div>
  );

  const prio = prioridadeConfig[atend.prioridade] ?? prioridadeConfig.normal;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-muted-foreground">{atend.protocolo}</span>
          <Badge className={cn("text-[10px] h-5 px-1.5 gap-1", prio.color)}>
            {prio.icon}{prio.label}
          </Badge>
        </div>

        {/* Info do devedor */}
        {atend.devedorNome && (
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{atend.devedorNome}</p>
              {atend.devedorId && (
                <Link href={`/devedores/${atend.devedorId}/detalhes`}>
                  <span className="text-xs text-primary hover:underline">Ver perfil completo →</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* SLA */}
        {atend.slaLimite && (
          <div className={cn(
            "flex items-center gap-1.5 text-xs rounded-lg px-2 py-1",
            atend.slaViolado ? "bg-red-100 text-red-700" :
            isSlaProximo(atend.slaLimite) ? "bg-orange-100 text-orange-700" :
            "bg-green-50 text-green-700"
          )}>
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span>
              {atend.slaViolado
                ? "SLA violado"
                : `SLA: ${new Date(atend.slaLimite).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
              }
            </span>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-7 text-xs gap-1"
            onClick={onTransferir}
          >
            <Shuffle className="h-3 w-3" />
            Transferir
          </Button>
          <Button
            size="sm"
            className="flex-1 h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
            onClick={onFinalizar}
          >
            <CheckCircle2 className="h-3 w-3" />
            Finalizar
          </Button>
        </div>

        {/* Prioridade */}
        <div className="mt-2">
          <Select
            value={atend.prioridade}
            onValueChange={(v) => atualizarPrioridadeMutation.mutate({
              atendimentoId,
              prioridade: v as any
            })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(prioridadeConfig).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">
                  <div className="flex items-center gap-1.5">
                    {v.icon}
                    {v.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs: Etiquetas / Notas */}
      <Tabs defaultValue="notas" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 shrink-0">
          <TabsTrigger value="notas" className="flex-1 text-xs gap-1">
            <StickyNote className="h-3 w-3" />
            Notas ({notas.length})
          </TabsTrigger>
          <TabsTrigger value="etiquetas" className="flex-1 text-xs gap-1">
            <Tag className="h-3 w-3" />
            Etiquetas
          </TabsTrigger>
        </TabsList>

        {/* Notas internas */}
        <TabsContent value="notas" className="flex-1 flex flex-col overflow-hidden mx-3 mt-2">
          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-1">
              {notas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma nota ainda</p>
              ) : notas.map((nota) => (
                <div key={nota.id} className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
                  <p className="text-xs text-foreground whitespace-pre-wrap">{nota.conteudo}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{nota.autorNome}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(nota.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="mt-2 shrink-0">
            <Textarea
              placeholder="Adicionar nota interna (visível apenas para operadores)..."
              value={novaNotaTexto}
              onChange={(e) => setNovaNotaTexto(e.target.value)}
              className="text-xs min-h-[60px] resize-none"
              rows={2}
            />
            <Button
              size="sm"
              className="w-full mt-1 h-7 text-xs"
              onClick={handleSalvarNota}
              disabled={!novaNotaTexto.trim() || salvandoNota}
            >
              {salvandoNota ? <RefreshCw className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}
              Salvar nota
            </Button>
          </div>
        </TabsContent>

        {/* Etiquetas */}
        <TabsContent value="etiquetas" className="flex-1 overflow-auto mx-3 mt-2">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {etiquetasAtend.map((et) => (
                <button
                  key={et.id}
                  onClick={() => removerEtiquetaMutation.mutate({ atendimentoId, etiquetaId: et.id })}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: et.cor }}
                >
                  {et.nome}
                  <X className="h-2.5 w-2.5" />
                </button>
              ))}
              {etiquetasAtend.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma etiqueta aplicada</p>
              )}
            </div>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Adicionar etiqueta:</p>
            <div className="flex flex-wrap gap-1">
              {(todasEtiquetas as any[])
                .filter(et => !etiquetasAtend.some(ea => ea.id === et.id))
                .map((et) => (
                  <button
                    key={et.id}
                    onClick={() => aplicarEtiquetaMutation.mutate({ atendimentoId, etiquetaId: et.id })}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium border-2 border-dashed opacity-60 hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: et.cor, borderColor: et.cor }}
                  >
                    <Plus className="h-2.5 w-2.5" />
                    {et.nome}
                  </button>
                ))
              }
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Componente: Modal de Transferência ───────────────────────────────────────
function ModalTransferencia({
  atendimentoId,
  open,
  onClose,
  onSuccess,
}: {
  atendimentoId: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [paraOperadorId, setParaOperadorId] = useState<string>("");
  const [paraDepartamentoId, setParaDepartamentoId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [transferindo, setTransferindo] = useState(false);

  const { data: operadores = [] } = trpc.atendimento.listarOperadores.useQuery();
  const { data: departamentos = [] } = trpc.atendimento.listarDepartamentos.useQuery();

  const transferirMutation = trpc.atendimento.transferirAtendimento.useMutation({
    onSuccess: () => {
      toast.success("Atendimento transferido com sucesso!");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error("Erro ao transferir: " + e.message),
  });

  const handleTransferir = async () => {
    if (!paraOperadorId && !paraDepartamentoId) {
      toast.error("Selecione um operador ou departamento de destino");
      return;
    }
    setTransferindo(true);
    try {
      await transferirMutation.mutateAsync({
        atendimentoId,
        paraOperadorId: paraOperadorId ? parseInt(paraOperadorId) : undefined,
        paraDepartamentoId: paraDepartamentoId ? parseInt(paraDepartamentoId) : undefined,
        motivo: motivo.trim() || undefined,
      });
    } finally {
      setTransferindo(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />
            Transferir Atendimento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Transferir para operador</Label>
            <Select value={paraOperadorId} onValueChange={setParaOperadorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um operador (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {(operadores as any[]).filter(op => op.status === "online").map((op) => (
                  <SelectItem key={op.userId} value={op.userId.toString()}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span>{op.nome}</span>
                      <span className="text-xs text-muted-foreground">({op.chatsAtivos}/{op.limiteChats} chats)</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ou transferir para departamento</Label>
            <Select value={paraDepartamentoId} onValueChange={setParaDepartamentoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um departamento (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {(departamentos as any[]).map((dep) => (
                  <SelectItem key={dep.id} value={dep.id.toString()}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dep.cor }} />
                      {dep.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo da transferência <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              placeholder="Ex: Questão jurídica, fora do meu escopo..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={transferindo}>Cancelar</Button>
          <Button onClick={handleTransferir} disabled={transferindo || (!paraOperadorId && !paraDepartamentoId)}>
            {transferindo ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Shuffle className="h-4 w-4 mr-2" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Componente: Modal de Finalização ─────────────────────────────────────────
function ModalFinalizacao({
  atendimentoId,
  open,
  onClose,
  onSuccess,
}: {
  atendimentoId: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [finalizando, setFinalizando] = useState(false);

  const finalizarMutation = trpc.atendimento.finalizarAtendimento.useMutation({
    onSuccess: () => {
      toast.success("Atendimento finalizado!");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error("Erro ao finalizar: " + e.message),
  });

  const handleFinalizar = async () => {
    setFinalizando(true);
    try {
      await finalizarMutation.mutateAsync({
        atendimentoId,
        motivo: motivo.trim() || undefined,
        status: "resolvido",
      });
    } finally {
      setFinalizando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Finalizar Atendimento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            O atendimento será marcado como resolvido e a conversa será fechada.
          </p>
          <div className="space-y-1.5">
            <Label>Motivo / Resolução <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              placeholder="Ex: Acordo firmado, boleto enviado, questão resolvida..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={finalizando}>Cancelar</Button>
          <Button
            onClick={handleFinalizar}
            disabled={finalizando}
            className="bg-green-600 hover:bg-green-700"
          >
            {finalizando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Confirmar Finalização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Painel do Supervisor ─────────────────────────────────────────────────────
function PainelSupervisor() {
  const { data: painel, isLoading, refetch } = trpc.atendimento.painelSupervisao.useQuery(undefined, {
    refetchInterval: 10000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const totais = painel?.totais;
  const operadores = painel?.operadores ?? [];
  const emAndamento = painel?.emAndamento ?? [];

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Na fila", value: totais?.aguardando ?? 0, color: "text-orange-600", bg: "bg-orange-50", icon: <Inbox className="h-5 w-5" /> },
          { label: "Em atendimento", value: totais?.emAtendimento ?? 0, color: "text-blue-600", bg: "bg-blue-50", icon: <MessageCircle className="h-5 w-5" /> },
          { label: "SLA violados", value: totais?.slaViolados ?? 0, color: "text-red-600", bg: "bg-red-50", icon: <AlertTriangle className="h-5 w-5" /> },
          { label: "Resolvidos hoje", value: totais?.resolvidosHoje ?? 0, color: "text-green-600", bg: "bg-green-50", icon: <CheckCircle2 className="h-5 w-5" /> },
        ].map((kpi) => (
          <Card key={kpi.label} className={cn("border-0 shadow-sm", kpi.bg)}>
            <CardContent className="p-3 flex items-center gap-3">
              <div className={kpi.color}>{kpi.icon}</div>
              <div>
                <p className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Operadores */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Operadores ({operadores.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {operadores.map((op: any) => {
              const stConf = statusOperadorConfig[op.status] ?? statusOperadorConfig.offline;
              const carga = op.limiteChats > 0 ? (op.chatsAtivos / op.limiteChats) * 100 : 0;
              return (
                <div key={op.userId} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border">
                  <div className="relative">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="text-xs bg-slate-200">{initials(op.nome)}</AvatarFallback>
                    </Avatar>
                    <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", stConf.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{op.nome}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{stConf.label}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{op.chatsAtivos}/{op.limiteChats} chats</span>
                    </div>
                    <Progress value={carga} className="h-1 mt-1" />
                  </div>
                </div>
              );
            })}
            {operadores.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-full text-center py-2">Nenhum operador configurado</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Atendimentos em andamento */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Atendimentos em andamento ({emAndamento.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-2">
            {emAndamento.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">Nenhum atendimento em andamento</p>
            ) : emAndamento.map((a: any) => {
              const prio = prioridadeConfig[a.prioridade] ?? prioridadeConfig.normal;
              return (
                <div key={a.id} className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border text-xs",
                  a.slaViolado ? "bg-red-50 border-red-200" : "bg-card"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-muted-foreground">{a.protocolo}</span>
                      <Badge className={cn("text-[10px] h-4 px-1 gap-0.5", prio.color)}>
                        {prio.icon}{prio.label}
                      </Badge>
                      {a.slaViolado ? <Badge className="text-[10px] h-4 px-1 bg-red-500 text-white">SLA!</Badge> : null}
                    </div>
                    <p className="font-medium truncate mt-0.5">{a.nomeContato || a.telefone}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-muted-foreground">{a.operadorNome || "Na fila"}</p>
                    <p className="text-muted-foreground">{formatElapsed(a.iniciadoEm)}</p>
                  </div>
                  {a.departamentoNome && (
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.departamentoCor ?? "#6366f1" }} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function Atendimento() {
  const { user } = useAuth();
  const [abaSelecionada, setAbaSelecionada] = useState<"meus" | "fila" | "supervisor">("meus");
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<Atendimento | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [modalFinalizacao, setModalFinalizacao] = useState(false);
  const [buscaConversa, setBuscaConversa] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Status do operador
  const { data: meuStatus, refetch: refetchStatus } = trpc.atendimento.meuStatusOperador.useQuery();
  const atualizarStatusMutation = trpc.atendimento.atualizarStatusOperador.useMutation({
    onSuccess: (data) => {
      toast.success(`Status: ${statusOperadorConfig[data.status]?.label}`);
      refetchStatus();
    },
  });

  // Meus atendimentos
  const { data: meusAtendimentos = [], refetch: refetchMeus } = trpc.atendimento.meusAtendimentos.useQuery(undefined, {
    refetchInterval: 3000,
  });

  // Fila
  const { data: fila = [], refetch: refetchFila } = trpc.atendimento.filaAtendimento.useQuery(undefined, {
    refetchInterval: 3000,
  });

  // Mensagens da conversa selecionada
  const { data: mensagens = [], refetch: refetchMensagens } = trpc.whatsapp.listarMensagens.useQuery(
    { conversaId: atendimentoSelecionado?.conversaId ?? 0 },
    { enabled: !!atendimentoSelecionado, refetchInterval: 3000 }
  );

  // Mensagens rápidas
  const { data: mensagensRapidas = [] } = trpc.atendimento.listarMensagensRapidas.useQuery();

  // Mutations
  const assumirMutation = trpc.atendimento.assumirAtendimento.useMutation({
    onSuccess: () => { toast.success("Atendimento assumido!"); refetchMeus(); refetchFila(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const enviarMutation = trpc.whatsapp.enviarMensagem.useMutation({
    onSuccess: () => { setTexto(""); setArquivoSelecionado(null); refetchMensagens(); },
    onError: (e) => toast.error("Erro ao enviar: " + e.message),
  });

  const uploadMidiaMutation = trpc.whatsapp.uploadMidia.useMutation({
    onError: (e) => toast.error("Erro no upload: " + e.message),
  });

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const handleEnviar = useCallback(async () => {
    if (!atendimentoSelecionado || enviando) return;

    if (arquivoSelecionado) {
      setEnviando(true);
      setUploadProgress(10);
      try {
        const tipo = arquivoSelecionado.type.startsWith("image/") ? "image" :
                     arquivoSelecionado.type.startsWith("audio/") ? "audio" : "document";
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(arquivoSelecionado);
        });
        setUploadProgress(40);
        const { url } = await uploadMidiaMutation.mutateAsync({
          base64,
          mimeType: arquivoSelecionado.type || "application/octet-stream",
          nomeArquivo: arquivoSelecionado.name,
        });
        setUploadProgress(80);
        await enviarMutation.mutateAsync({
          conversaId: atendimentoSelecionado.conversaId,
          tipo,
          mediaUrl: url,
          nomeArquivo: arquivoSelecionado.name,
          conteudo: texto.trim() || undefined,
        });
        setUploadProgress(0);
      } catch {
        setUploadProgress(0);
      } finally {
        setEnviando(false);
      }
      return;
    }

    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await enviarMutation.mutateAsync({
        conversaId: atendimentoSelecionado.conversaId,
        tipo: "text",
        conteudo: texto.trim(),
      });
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  }, [texto, atendimentoSelecionado, enviando, arquivoSelecionado]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnviar(); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("Arquivo muito grande. Limite: 16 MB"); return; }
    setArquivoSelecionado(file);
    e.target.value = "";
  };

  // Filtrar atendimentos por busca
  const atendimentosFiltrados = (meusAtendimentos as Atendimento[]).filter(a =>
    !buscaConversa ||
    (a.nomeContato?.toLowerCase().includes(buscaConversa.toLowerCase())) ||
    (a.telefone?.includes(buscaConversa)) ||
    (a.protocolo.toLowerCase().includes(buscaConversa.toLowerCase()))
  );

  const statusAtual = meuStatus?.status ?? "offline";
  const stConf = statusOperadorConfig[statusAtual] ?? statusOperadorConfig.offline;

  return (
    <div className="flex h-full bg-background overflow-hidden">

      {/* ── Coluna 1: Sidebar de atendimentos ─────────────────────────────── */}
      <div className="w-80 flex flex-col border-r shrink-0">
        {/* Header do operador */}
        <div className="p-3 border-b bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                    {initials(user?.name)}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", stConf.color)} />
              </div>
              <div>
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{stConf.label}</p>
              </div>
            </div>
            {/* Seletor de status */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Meu status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["online", "ausente", "ocupado", "offline"] as const).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => atualizarStatusMutation.mutate({ status: s })}
                    className="gap-2 text-sm"
                  >
                    <div className={cn("w-2.5 h-2.5 rounded-full", statusOperadorConfig[s].color)} />
                    {statusOperadorConfig[s].label}
                    {statusAtual === s && <Check className="h-3 w-3 ml-auto" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Abas */}
          <div className="flex gap-1">
            {([
              { key: "meus", label: "Meus", count: meusAtendimentos.length },
              { key: "fila", label: "Fila", count: fila.length },
              { key: "supervisor", label: "Supervisão", count: null },
            ] as const).map((aba) => (
              <button
                key={aba.key}
                onClick={() => setAbaSelecionada(aba.key)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors",
                  abaSelecionada === aba.key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {aba.label}
                {aba.count !== null && aba.count > 0 && (
                  <span className={cn(
                    "ml-1 px-1 rounded-full text-[10px]",
                    abaSelecionada === aba.key ? "bg-white/20" : "bg-muted-foreground/20"
                  )}>
                    {aba.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Busca */}
          {abaSelecionada === "meus" && (
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={buscaConversa}
                onChange={(e) => setBuscaConversa(e.target.value)}
                className="pl-8 h-7 text-xs"
              />
            </div>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {abaSelecionada === "meus" && (
            <>
              {atendimentosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum atendimento ativo</p>
                  <p className="text-xs text-muted-foreground mt-1">Assuma atendimentos da fila</p>
                </div>
              ) : atendimentosFiltrados.map((a) => (
                <CardAtendimentoAtivo
                  key={a.id}
                  atend={a}
                  isSelected={atendimentoSelecionado?.id === a.id}
                  onClick={() => setAtendimentoSelecionado(a)}
                />
              ))}
            </>
          )}

          {abaSelecionada === "fila" && (
            <div className="p-3 space-y-2">
              {(fila as Atendimento[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-400 mb-3" />
                  <p className="text-sm text-muted-foreground">Fila vazia!</p>
                  <p className="text-xs text-muted-foreground mt-1">Todos os atendimentos foram assumidos</p>
                </div>
              ) : (fila as Atendimento[]).map((a) => (
                <CardFila
                  key={a.id}
                  atend={a}
                  onAssumir={(id) => assumirMutation.mutate({ atendimentoId: id })}
                />
              ))}
            </div>
          )}

          {abaSelecionada === "supervisor" && (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
              Selecione "Supervisão" para ver o painel completo no lado direito
            </div>
          )}
        </div>
      </div>

      {/* ── Coluna 2: Chat ────────────────────────────────────────────────── */}
      {abaSelecionada === "supervisor" ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-background shrink-0">
            <BarChart2 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Painel de Supervisão em Tempo Real</h2>
            <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" onClick={() => {}}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <PainelSupervisor />
        </div>
      ) : atendimentoSelecionado ? (
        <>
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header do chat */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs bg-slate-200">
                  {initials(atendimentoSelecionado.nomeContato)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">
                  {atendimentoSelecionado.nomeContato || atendimentoSelecionado.telefone}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{atendimentoSelecionado.telefone}</p>
                  <span className="text-xs font-mono text-muted-foreground">{atendimentoSelecionado.protocolo}</span>
                  {atendimentoSelecionado.departamentoNome && (
                    <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                      {atendimentoSelecionado.departamentoNome}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setModalTransferencia(true)}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Transferir
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700"
                  onClick={() => setModalFinalizacao(true)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Finalizar
                </Button>
              </div>
            </div>

            {/* Mensagens */}
            <div
              className="flex-1 overflow-y-auto p-4 space-y-1"
              style={{ backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)", backgroundSize: "20px 20px" }}
            >
              {(mensagens as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                </div>
              ) : (mensagens as any[]).map((msg, idx) => {
                const isOut = msg.direction === "out";
                return (
                  <div key={msg.id} className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[72%] rounded-2xl px-3 py-2 shadow-sm",
                      isOut ? "bg-green-500 text-white rounded-br-sm" : "bg-white text-foreground rounded-bl-sm"
                    )}>
                      {msg.tipo === "image" && msg.mediaUrl && (
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
                          <img src={msg.mediaUrl} alt="imagem" className="rounded-xl max-w-full max-h-48 object-cover" />
                        </a>
                      )}
                      {msg.tipo === "document" && (
                        <a href={msg.mediaUrl ?? "#"} target="_blank" rel="noopener noreferrer"
                          className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", isOut ? "bg-white/15" : "bg-gray-50 border")}>
                          <FileText className={cn("h-4 w-4", isOut ? "text-white" : "text-blue-600")} />
                          <span className="text-xs truncate">{msg.nomeArquivo || "Documento"}</span>
                          <Download className="h-3.5 w-3.5 ml-auto shrink-0 opacity-60" />
                        </a>
                      )}
                      {msg.tipo === "audio" && msg.mediaUrl && (
                        <audio controls src={msg.mediaUrl} className="max-w-full h-8" />
                      )}
                      {(msg.tipo === "text" || (!msg.mediaUrl && msg.conteudo)) && (
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
                      )}
                      <div className={cn("flex items-center justify-end gap-1 mt-0.5", isOut ? "text-green-100" : "text-muted-foreground")}>
                        <span className="text-[10px]">
                          {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isOut && (
                          msg.status === "lida" ? <CheckCheck className="h-3 w-3 text-blue-300" /> :
                          msg.status === "entregue" ? <CheckCheck className="h-3 w-3" /> :
                          <Check className="h-3 w-3" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Progresso de upload */}
            {uploadProgress > 0 && (
              <div className="px-4 py-1 shrink-0">
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}

            {/* Preview de arquivo */}
            {arquivoSelecionado && (
              <div className="px-4 py-2 border-t shrink-0 flex items-center gap-2">
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 flex-1">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-xs truncate">{arquivoSelecionado.name}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setArquivoSelecionado(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Campo de envio */}
            <div className="flex items-end gap-2 p-3 border-t bg-background shrink-0">
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden" onChange={handleFileChange} />

              {/* Mensagens rápidas */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full shrink-0 text-muted-foreground">
                    <Zap className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-72 max-h-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Mensagens Rápidas</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(mensagensRapidas as any[]).length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma mensagem rápida cadastrada</div>
                  ) : (mensagensRapidas as any[]).map((mr) => (
                    <DropdownMenuItem
                      key={mr.id}
                      onClick={() => setTexto(mr.conteudo)}
                      className="flex flex-col items-start gap-0.5 cursor-pointer"
                    >
                      <span className="text-xs font-medium text-primary">{mr.atalho}</span>
                      <span className="text-xs text-muted-foreground truncate w-full">{mr.titulo}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Anexo */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full shrink-0 text-muted-foreground" disabled={enviando}>
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-44">
                  <DropdownMenuItem onClick={() => imageInputRef.current?.click()} className="gap-2 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
                      <ImageIcon className="h-3.5 w-3.5 text-purple-600" />
                    </div>
                    Foto / Imagem
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => audioInputRef.current?.click()} className="gap-2 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center">
                      <Mic className="h-3.5 w-3.5 text-orange-600" />
                    </div>
                    Áudio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    Documento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex-1 flex items-center gap-2 bg-muted rounded-2xl px-3 py-2">
                <Input
                  ref={inputRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={arquivoSelecionado ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 text-sm"
                  disabled={enviando}
                />
              </div>

              <Button
                onClick={handleEnviar}
                disabled={(!texto.trim() && !arquivoSelecionado) || enviando}
                size="icon"
                className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 shrink-0"
              >
                {enviando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* ── Coluna 3: Detalhes do atendimento ─────────────────────────── */}
          <div className="w-64 border-l flex flex-col shrink-0 bg-muted/10">
            <PainelDetalhes
              atendimentoId={atendimentoSelecionado.id}
              conversaId={atendimentoSelecionado.conversaId}
              onTransferir={() => setModalTransferencia(true)}
              onFinalizar={() => setModalFinalizacao(true)}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MessageCircle className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Central de Atendimento</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {abaSelecionada === "fila"
              ? "Selecione um atendimento da fila para assumir e iniciar o atendimento."
              : "Selecione um atendimento na lista ao lado para começar a conversar."
            }
          </p>
          <div className="flex gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => atualizarStatusMutation.mutate({ status: "online" })}
            >
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Ficar Online
            </Button>
          </div>
        </div>
      )}

      {/* Modais */}
      {atendimentoSelecionado && (
        <>
          <ModalTransferencia
            atendimentoId={atendimentoSelecionado.id}
            open={modalTransferencia}
            onClose={() => setModalTransferencia(false)}
            onSuccess={() => { refetchMeus(); setAtendimentoSelecionado(null); }}
          />
          <ModalFinalizacao
            atendimentoId={atendimentoSelecionado.id}
            open={modalFinalizacao}
            onClose={() => setModalFinalizacao(false)}
            onSuccess={() => { refetchMeus(); setAtendimentoSelecionado(null); }}
          />
        </>
      )}
    </div>
  );
}
