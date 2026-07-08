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
  MoreVertical, Bell, Filter, Wifi, WifiOff,
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

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Instancia = {
  id: number; nome: string; setor: string;
  instanceId: string; token: string; clientToken: string; ativo: number;
};

type Conversa = {
  conversa: {
    id: number; instanciaId: number; telefone: string; nomeContato: string | null;
    devedorId: number | null; ultimaMensagem: string | null;
    ultimaMensagemEm: Date | null; naoLidas: number; status: string;
  };
  instancia: { nome: string; setor: string } | null;
};

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
const setorColor = (setor: string) => {
  if (setor === "cobranca") return "bg-blue-500";
  if (setor === "juridico") return "bg-purple-500";
  return "bg-gray-500";
};

const setorLabel = (setor: string) => {
  if (setor === "cobranca") return "Cobrança";
  if (setor === "juridico") return "Jurídico";
  return "Geral";
};

const setorIcon = (setor: string) => {
  if (setor === "cobranca") return <Building2 className="h-3.5 w-3.5" />;
  if (setor === "juridico") return <Scale className="h-3.5 w-3.5" />;
  return <Globe className="h-3.5 w-3.5" />;
};

const formatTime = (date: Date | null | string) => {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const initials = (name: string | null | undefined) => {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
};

const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

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
  return diff > 0 && diff < 15 * 60 * 1000;
}

// ─── Player de áudio inline ───────────────────────────────────────────────────
function AudioPlayer({ src, isOut }: { src: string; isOut: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => toast.error("Não foi possível reproduzir o áudio"));
  };

  return (
    <div className={cn("flex items-center gap-2 min-w-[200px] py-1", isOut ? "text-white" : "text-foreground")}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          setCurrentTime(a.currentTime);
          setProgress(a.duration ? (a.currentTime / a.duration) * 100 : 0);
        }}
        onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
        preload="metadata"
      />
      <button
        onClick={toggle}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
          isOut ? "bg-white/20 hover:bg-white/30" : "bg-green-100 hover:bg-green-200"
        )}
      >
        {playing
          ? <Pause className={cn("h-3.5 w-3.5", isOut ? "text-white" : "text-green-600")} />
          : <Play className={cn("h-3.5 w-3.5", isOut ? "text-white" : "text-green-600")} />
        }
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div
          className={cn("w-full h-1.5 rounded-full cursor-pointer", isOut ? "bg-white/30" : "bg-gray-200")}
          onClick={(e) => {
            const a = audioRef.current;
            if (!a || !a.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration;
          }}
        >
          <div className={cn("h-full rounded-full transition-all", isOut ? "bg-white" : "bg-green-500")} style={{ width: `${progress}%` }} />
        </div>
        <span className={cn("text-[10px]", isOut ? "text-green-100" : "text-muted-foreground")}>
          {duration > 0 ? `${formatDuration(currentTime)} / ${formatDuration(duration)}` : "Áudio"}
        </span>
      </div>
      <Volume2 className={cn("h-3.5 w-3.5 shrink-0 opacity-60", isOut ? "text-white" : "text-muted-foreground")} />
    </div>
  );
}

// ─── Balão de mensagem ────────────────────────────────────────────────────────
function MsgBubble({ msg, onReenviar }: { msg: any; onReenviar?: (msg: any) => void }) {
  const isOut = msg.direction === "out";
  const isOtimista = msg._otimista === true;
  const isErro = msg._erro === true;
  return (
    <div className={cn("flex flex-col", isOut ? "items-end" : "items-start")}>
      <div className={cn(
        "inline-block max-w-[85%] rounded-2xl px-3 py-2 shadow-sm transition-opacity",
        isOut ? "bg-green-500 text-white rounded-br-sm" : "bg-white text-foreground rounded-bl-sm",
        isOtimista && !isErro && "opacity-70",
        isErro && "bg-red-400 text-white opacity-90",
      )}>
        {msg.tipo === "image" && msg.mediaUrl && (
          <div className="mb-1">
            <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
              <img src={msg.mediaUrl} alt={msg.nomeArquivo ?? "imagem"} className="rounded-xl max-w-full max-h-56 object-cover cursor-pointer hover:opacity-90 transition-opacity" />
            </a>
            {msg.conteudo && <p className="text-sm mt-1 whitespace-pre-wrap break-words">{msg.conteudo}</p>}
          </div>
        )}
        {msg.tipo === "audio" && msg.mediaUrl && <AudioPlayer src={msg.mediaUrl} isOut={isOut} />}
        {msg.tipo === "document" && (
          <a href={msg.mediaUrl ?? "#"} target="_blank" rel="noopener noreferrer"
            className={cn("flex items-center gap-2 rounded-xl px-3 py-2 mb-1 transition-colors",
              isOut ? "bg-white/15 hover:bg-white/25" : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
            )}>
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", isOut ? "bg-white/20" : "bg-blue-100")}>
              <FileText className={cn("h-5 w-5", isOut ? "text-white" : "text-blue-600")} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-xs font-medium truncate", isOut ? "text-white" : "text-foreground")}>{msg.nomeArquivo || "Documento"}</p>
              <p className={cn("text-[10px]", isOut ? "text-green-100" : "text-muted-foreground")}>Toque para abrir</p>
            </div>
            <Download className={cn("h-4 w-4 shrink-0", isOut ? "text-white/70" : "text-muted-foreground")} />
          </a>
        )}
        {msg.tipo === "text" && msg.conteudo && (
          <span className="text-sm whitespace-pre-wrap break-words leading-snug">
            {msg.conteudo}
            {/* Espaço reservado para o rodapé não sobrepor o texto */}
            <span className="inline-block w-14" aria-hidden />
          </span>
        )}
        <div className={cn(
          msg.tipo === "text"
            ? "flex items-center justify-end gap-1 -mt-4 whitespace-nowrap float-right ml-2"
            : "flex items-center justify-end gap-1 mt-0.5 whitespace-nowrap",
          isErro ? "text-red-100" : isOut ? "text-green-100" : "text-muted-foreground"
        )}>
          <span className="text-[10px]">
            {isOtimista ? new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isOut && !isErro && (
            isOtimista
              ? <Clock className="h-3.5 w-3.5 animate-pulse" />
              : msg.status === "lida" ? <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
              : msg.status === "entregue" ? <CheckCheck className="h-3.5 w-3.5 text-gray-400" />
              : msg.status === "enviada" ? <Check className="h-3.5 w-3.5 text-gray-400" />
              : <Clock className="h-3.5 w-3.5" />
          )}
          {isErro && <AlertTriangle className="h-3.5 w-3.5 text-red-100" />}
        </div>
      </div>
      {isErro && onReenviar && (
        <button
          onClick={() => onReenviar(msg)}
          className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 mt-0.5 px-1 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Não enviado — toque para reenviar
        </button>
      )}
    </div>
  );
}

// ─── Card de Atendimento Automático (Bot) ────────────────────────────────────
function CardAutomatico({ atend, onAssumir }: { atend: any; onAssumir: (id: number) => void }) {
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 hover:shadow-md transition-all cursor-pointer group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-purple-100 text-purple-700 text-xs">{initials(atend.nomeContato)}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 text-sm">🤖</span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{atend.nomeContato || atend.telefone}</p>
            <p className="text-xs text-muted-foreground">{atend.protocolo}</p>
          </div>
        </div>
        <Badge className="text-[10px] h-5 px-1.5 shrink-0 bg-purple-100 text-purple-700 border-purple-200">🤖 Bot</Badge>
      </div>
      {atend.ultimaMensagem && (
        <p className="text-xs text-muted-foreground mt-2 truncate italic">"{atend.ultimaMensagem}"</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatElapsed(atend.iniciadoEm)}</span>
        {atend.departamentoNome && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: atend.departamentoCor ?? "#a855f7" }} />
            {atend.departamentoNome}
          </span>
        )}
      </div>
      <Button size="sm" className="w-full mt-2 h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onAssumir(atend.id)}>
        Assumir do bot
      </Button>
    </div>
  );
}

// ─── Card de Atendimento na Fila ──────────────────────────────────────────────
function CardFila({ atend, onAssumir }: { atend: Atendimento; onAssumir: (id: number) => void }) {
  const prio = prioridadeConfig[atend.prioridade] ?? prioridadeConfig.normal;
  const slaViolado = atend.slaViolado === 1;
  const slaProximo = isSlaProximo(atend.slaLimite);
  return (
    <div className={cn("rounded-xl border p-3 bg-card hover:shadow-md transition-all cursor-pointer group",
      slaViolado && "border-red-300 bg-red-50",
      slaProximo && !slaViolado && "border-orange-300 bg-orange-50",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">{initials(atend.nomeContato)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{atend.nomeContato || atend.telefone}</p>
            <p className="text-xs text-muted-foreground">{atend.protocolo}</p>
          </div>
        </div>
        <Badge className={cn("text-[10px] h-5 px-1.5 shrink-0 gap-1", prio.color)}>{prio.icon}{prio.label}</Badge>
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatElapsed(atend.iniciadoEm)}</span>
        {atend.departamentoNome && (
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: atend.departamentoCor ?? "#6366f1" }} />
            {atend.departamentoNome}
          </span>
        )}
      </div>
      {(slaViolado || slaProximo) && (
        <div className={cn("flex items-center gap-1 mt-1.5 text-xs font-medium", slaViolado ? "text-red-600" : "text-orange-600")}>
          <AlertTriangle className="h-3 w-3" />
          {slaViolado ? "SLA violado" : "SLA próximo do vencimento"}
        </div>
      )}
      <Button size="sm" className="w-full mt-2 h-7 text-xs bg-green-600 hover:bg-green-700 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onAssumir(atend.id)}>
        Assumir atendimento
      </Button>
    </div>
  );
}

// ─── Card de Atendimento Ativo ────────────────────────────────────────────────
function CardAtendimentoAtivo({ atend, isSelected, onClick }: { atend: Atendimento; isSelected: boolean; onClick: () => void }) {
  const prio = prioridadeConfig[atend.prioridade] ?? prioridadeConfig.normal;
  const slaViolado = atend.slaViolado === 1;
  return (
    <button onClick={onClick} className={cn(
      "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/50",
      isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50",
      slaViolado && "bg-red-50"
    )}>
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">{initials(atend.nomeContato)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">{atend.nomeContato || atend.telefone}</p>
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {atend.naoLidas && atend.naoLidas > 0 ? (
              <Badge className="h-4 min-w-4 px-1 text-[10px] bg-green-500 text-white rounded-full">{atend.naoLidas}</Badge>
            ) : null}
            <Badge className={cn("text-[10px] h-4 px-1 gap-0.5", prio.color)}>{prio.icon}</Badge>
          </div>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground truncate">{atend.ultimaMensagem || atend.protocolo}</p>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{formatElapsed(atend.atendidoEm ?? atend.iniciadoEm)}</span>
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

// ─── Painel de Detalhes ───────────────────────────────────────────────────────
function PainelDetalhes({ atendimentoId, conversaId, onTransferir, onFinalizar }: {
  atendimentoId: number; conversaId: number; onTransferir: () => void; onFinalizar: () => void;
}) {
  const [novaNotaTexto, setNovaNotaTexto] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);

  const { data: atend } = trpc.atendimento.atendimentoPorConversa.useQuery({ conversaId }, { refetchInterval: 5000 });
  const { data: notas = [], refetch: refetchNotas } = trpc.atendimento.listarNotas.useQuery({ atendimentoId }, { enabled: !!atendimentoId });
  const { data: etiquetasAtend = [], refetch: refetchEtiquetas } = trpc.atendimento.etiquetasDoAtendimento.useQuery({ atendimentoId }, { enabled: !!atendimentoId });
  const { data: todasEtiquetas = [] } = trpc.atendimento.listarEtiquetas.useQuery();

  const criarNotaMutation = trpc.atendimento.criarNota.useMutation({ onSuccess: () => { setNovaNotaTexto(""); refetchNotas(); }, onError: (e) => toast.error("Erro: " + e.message) });
  const aplicarEtiquetaMutation = trpc.atendimento.aplicarEtiqueta.useMutation({ onSuccess: () => refetchEtiquetas() });
  const removerEtiquetaMutation = trpc.atendimento.removerEtiqueta.useMutation({ onSuccess: () => refetchEtiquetas() });
  const atualizarPrioridadeMutation = trpc.atendimento.atualizarPrioridade.useMutation({ onSuccess: () => toast.success("Prioridade atualizada") });

  if (!atend) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Carregando...</div>;

  const prio = prioridadeConfig[atend.prioridade] ?? prioridadeConfig.normal;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono text-muted-foreground">{atend.protocolo}</span>
          <Badge className={cn("text-[10px] h-5 px-1.5 gap-1", prio.color)}>{prio.icon}{prio.label}</Badge>
        </div>
        {atend.devedorNome && (
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">{atend.devedorNome}</p>
              {atend.devedorId && (
                <Link href={`/devedores/${atend.devedorId}/detalhes`}>
                  <span className="text-xs text-primary hover:underline">Ver perfil →</span>
                </Link>
              )}
            </div>
          </div>
        )}
        {atend.slaLimite && (
          <div className={cn("flex items-center gap-1.5 text-xs rounded-lg px-2 py-1",
            atend.slaViolado ? "bg-red-100 text-red-700" : isSlaProximo(atend.slaLimite) ? "bg-orange-100 text-orange-700" : "bg-green-50 text-green-700"
          )}>
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span>{atend.slaViolado ? "SLA violado" : `SLA: ${new Date(atend.slaLimite).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</span>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={onTransferir}>
            <Shuffle className="h-3 w-3" />Transferir
          </Button>
          <Button size="sm" className="flex-1 h-7 text-xs gap-1 bg-green-600 hover:bg-green-700" onClick={onFinalizar}>
            <CheckCircle2 className="h-3 w-3" />Finalizar
          </Button>
        </div>
        <div className="mt-2">
          <Select value={atend.prioridade} onValueChange={(v) => atualizarPrioridadeMutation.mutate({ atendimentoId, prioridade: v as any })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(prioridadeConfig).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">
                  <div className="flex items-center gap-1.5">{v.icon}{v.label}</div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Tabs defaultValue="notas" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-3 mt-2 shrink-0">
          <TabsTrigger value="notas" className="flex-1 text-xs gap-1"><StickyNote className="h-3 w-3" />Notas ({notas.length})</TabsTrigger>
          <TabsTrigger value="etiquetas" className="flex-1 text-xs gap-1"><Tag className="h-3 w-3" />Etiquetas</TabsTrigger>
        </TabsList>
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
                    <span className="text-[10px] text-muted-foreground">{new Date(nota.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="mt-2 shrink-0">
            <Textarea placeholder="Nota interna (visível apenas para operadores)..." value={novaNotaTexto} onChange={(e) => setNovaNotaTexto(e.target.value)} className="text-xs min-h-[60px] resize-none" rows={2} />
            <Button size="sm" className="w-full mt-1 h-7 text-xs" onClick={async () => { if (!novaNotaTexto.trim()) return; setSalvandoNota(true); try { await criarNotaMutation.mutateAsync({ atendimentoId, conteudo: novaNotaTexto.trim() }); } finally { setSalvandoNota(false); } }} disabled={!novaNotaTexto.trim() || salvandoNota}>
              {salvandoNota ? <RefreshCw className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}Salvar nota
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="etiquetas" className="flex-1 overflow-auto mx-3 mt-2">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {etiquetasAtend.map((et) => (
                <button key={et.id} onClick={() => removerEtiquetaMutation.mutate({ atendimentoId, etiquetaId: et.id })}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: et.cor }}>
                  {et.nome}<X className="h-2.5 w-2.5" />
                </button>
              ))}
              {etiquetasAtend.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma etiqueta aplicada</p>}
            </div>
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">Adicionar etiqueta:</p>
            <div className="flex flex-wrap gap-1">
              {(todasEtiquetas as any[]).filter(et => !etiquetasAtend.some(ea => ea.id === et.id)).map((et) => (
                <button key={et.id} onClick={() => aplicarEtiquetaMutation.mutate({ atendimentoId, etiquetaId: et.id })}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium border-2 border-dashed opacity-60 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: et.cor, borderColor: et.cor }}>
                  <Plus className="h-2.5 w-2.5" />{et.nome}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Modal de Transferência ───────────────────────────────────────────────────
type ModoTransferencia = "fila" | "operador" | "departamento";
function ModalTransferencia({ atendimentoId, open, onClose, onSuccess }: { atendimentoId: number; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [modo, setModo] = useState<ModoTransferencia>("fila");
  const [paraOperadorId, setParaOperadorId] = useState<string>("");
  const [paraDepartamentoId, setParaDepartamentoId] = useState<string>("");
  const [motivo, setMotivo] = useState("");
  const [transferindo, setTransferindo] = useState(false);
  const { data: operadores = [] } = trpc.atendimento.listarOperadores.useQuery();
  const { data: departamentos = [] } = trpc.atendimento.listarDepartamentos.useQuery();
  const transferirMutation = trpc.atendimento.transferirAtendimento.useMutation({
    onSuccess: () => { toast.success(modo === "fila" ? "Devolvido para a fila!" : "Transferido com sucesso!"); onSuccess(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const handleConfirmar = async () => {
    if (modo === "operador" && !paraOperadorId) { toast.error("Selecione um operador"); return; }
    if (modo === "departamento" && !paraDepartamentoId) { toast.error("Selecione um departamento"); return; }
    setTransferindo(true);
    try {
      await transferirMutation.mutateAsync({
        atendimentoId,
        paraOperadorId: modo === "operador" && paraOperadorId ? parseInt(paraOperadorId) : undefined,
        paraDepartamentoId: modo === "departamento" && paraDepartamentoId ? parseInt(paraDepartamentoId) : undefined,
        motivo: motivo.trim() || undefined,
      });
    } finally {
      setTransferindo(false);
    }
  };

  // Reset ao abrir
  const handleOpenChange = (v: boolean) => { if (!v) { setModo("fila"); setParaOperadorId(""); setParaDepartamentoId(""); setMotivo(""); onClose(); } };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-primary" />Transferir Atendimento
          </DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">Escolha para onde deseja encaminhar este atendimento.</p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Opções de modo */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setModo("fila")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-colors ${
                modo === "fila" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <Users className="h-5 w-5" />
              <span className="font-medium">Devolver à Fila</span>
            </button>
            <button
              onClick={() => setModo("operador")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-colors ${
                modo === "operador" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <ArrowRight className="h-5 w-5" />
              <span className="font-medium">Para Operador</span>
            </button>
            <button
              onClick={() => setModo("departamento")}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-sm transition-colors ${
                modo === "departamento" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground/40"
              }`}
            >
              <BarChart2 className="h-5 w-5" />
              <span className="font-medium">Departamento</span>
            </button>
          </div>

          {/* Descrição do modo selecionado */}
          {modo === "fila" && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">O atendimento voltará para a fila de espera e poderá ser assumido por qualquer operador disponível.</p>
            </div>
          )}

          {modo === "operador" && (
            <div className="space-y-1.5">
              <Label>Selecione o operador</Label>
              <Select value={paraOperadorId} onValueChange={setParaOperadorId}>
                <SelectTrigger><SelectValue placeholder="Escolha um operador online" /></SelectTrigger>
                <SelectContent>
                  {(operadores as any[]).filter(op => op.status === "online").map((op) => (
                    <SelectItem key={op.userId} value={op.userId.toString()}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>{op.nome}</span>
                        <span className="text-xs text-muted-foreground ml-auto">({op.chatsAtivos}/{op.limiteChats} chats)</span>
                      </div>
                    </SelectItem>
                  ))}
                  {(operadores as any[]).filter(op => op.status === "online").length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum operador online no momento</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {modo === "departamento" && (
            <div className="space-y-1.5">
              <Label>Selecione o departamento</Label>
              <Select value={paraDepartamentoId} onValueChange={setParaDepartamentoId}>
                <SelectTrigger><SelectValue placeholder="Escolha um departamento" /></SelectTrigger>
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
          )}

          <div className="space-y-1.5">
            <Label>Motivo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Textarea placeholder="Ex: Questão jurídica, cliente solicitou..." value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="resize-none text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={transferindo}>Cancelar</Button>
          <Button onClick={handleConfirmar} disabled={transferindo} className={modo === "fila" ? "bg-amber-600 hover:bg-amber-700" : ""}>
            {transferindo ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Shuffle className="h-4 w-4 mr-2" />}
            {modo === "fila" ? "Devolver à Fila" : "Transferir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de Finalização ─────────────────────────────────────────────────────
function ModalFinalizacao({ atendimentoId, open, onClose, onSuccess }: { atendimentoId: number; open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const finalizarMutation = trpc.atendimento.finalizarAtendimento.useMutation({
    onSuccess: () => { toast.success("Atendimento finalizado!"); onSuccess(); onClose(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" />Finalizar Atendimento</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">O atendimento será marcado como resolvido.</p>
          <div className="space-y-1.5">
            <Label>Motivo / Resolução <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea placeholder="Ex: Acordo firmado, boleto enviado..." value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="resize-none text-sm" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={finalizando}>Cancelar</Button>
          <Button onClick={async () => { setFinalizando(true); try { await finalizarMutation.mutateAsync({ atendimentoId, motivo: motivo.trim() || undefined, status: "resolvido" }); } finally { setFinalizando(false); } }} disabled={finalizando} className="bg-green-600 hover:bg-green-700">
            {finalizando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal Nova Conversa ──────────────────────────────────────────────────────
function ModalNovaConversa({ open, onClose, instancias, instanciaAtualId, onConversaCriada }: {
  open: boolean; onClose: () => void; instancias: Instancia[]; instanciaAtualId?: number;
  onConversaCriada?: (conversa: { id: number; telefone: string; nomeContato: string | null; instanciaId: number }) => void;
}) {
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [instanciaId, setInstanciaId] = useState<string>(instanciaAtualId?.toString() ?? "");
  const [criando, setCriando] = useState(false);
  const utils = trpc.useUtils();

  const abrirAtendimentoMutation = trpc.atendimento.abrirAtendimento.useMutation();

  const criarMutation = trpc.whatsapp.criarConversa.useMutation({
    onSuccess: async (conversa) => {
      toast.success("Conversa iniciada!");
      utils.whatsapp.listarConversas.invalidate();
      // Cria atendimento vinculado automaticamente
      try {
        await abrirAtendimentoMutation.mutateAsync({ conversaId: conversa.id, atribuirAoOperador: true });
        utils.atendimento.meusAtendimentos.invalidate();
      } catch (_) { /* ignora se já existe */ }
      onConversaCriada?.(conversa as any);
      onClose();
      setTelefone(""); setNome(""); setInstanciaId("");
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-green-600" />Nova Conversa</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Instância WhatsApp</Label>
            <Select value={instanciaId} onValueChange={setInstanciaId}>
              <SelectTrigger><SelectValue placeholder="Selecione a instância" /></SelectTrigger>
              <SelectContent>
                {instancias.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id.toString()}>
                    <div className="flex items-center gap-2">{setorIcon(inst.setor)}{inst.nome} — {setorLabel(inst.setor)}</div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Número de telefone <span className="text-red-500">*</span></Label>
            <Input placeholder="5511999999999 (com código do país)" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            <p className="text-xs text-muted-foreground">Formato: código do país + DDD + número (sem espaços ou símbolos)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nome do contato <span className="text-muted-foreground">(opcional)</span></Label>
            <Input placeholder="Ex: João Silva" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={criando}>Cancelar</Button>
          <Button onClick={async () => {
            if (!telefone.trim() || !instanciaId) { toast.error("Preencha o telefone e selecione a instância"); return; }
            setCriando(true);
            try { await criarMutation.mutateAsync({ instanciaId: parseInt(instanciaId), telefone: telefone.trim(), nomeContato: nome.trim() || undefined }); }
            finally { setCriando(false); }
          }} disabled={criando || !telefone.trim() || !instanciaId} className="bg-green-600 hover:bg-green-700">
            {criando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}Iniciar Conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Painel do Supervisor ─────────────────────────────────────────────────────
function PainelSupervisor() {
  const { data: painel, isLoading } = trpc.atendimento.painelSupervisao.useQuery(undefined, { refetchInterval: 10000 });
  if (isLoading) return <div className="flex items-center justify-center h-full"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  const totais = painel?.totais;
  const operadores = painel?.operadores ?? [];
  const emAndamento = painel?.emAndamento ?? [];
  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
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
              <div><p className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</p><p className="text-xs text-muted-foreground">{kpi.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Operadores ({operadores.length})</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {operadores.map((op: any) => {
              const stConf = statusOperadorConfig[op.status] ?? statusOperadorConfig.offline;
              const carga = op.limiteChats > 0 ? (op.chatsAtivos / op.limiteChats) * 100 : 0;
              return (
                <div key={op.userId} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border">
                  <div className="relative">
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs bg-slate-200">{initials(op.nome)}</AvatarFallback></Avatar>
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
            {operadores.length === 0 && <p className="text-xs text-muted-foreground col-span-full text-center py-2">Nenhum operador configurado</p>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4" />Em andamento ({emAndamento.length})</CardTitle></CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-2">
            {emAndamento.length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Nenhum atendimento em andamento</p>
              : emAndamento.map((a: any) => {
                const prio = prioridadeConfig[a.prioridade] ?? prioridadeConfig.normal;
                return (
                  <div key={a.id} className={cn("flex items-center gap-3 p-2 rounded-lg border text-xs", a.slaViolado ? "bg-red-50 border-red-200" : "bg-card")}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">{a.protocolo}</span>
                        <Badge className={cn("text-[10px] h-4 px-1 gap-0.5", prio.color)}>{prio.icon}{prio.label}</Badge>
                        {a.status === "automatico" && <Badge className="text-[10px] h-4 px-1 bg-purple-500 text-white gap-0.5">🤖 Bot</Badge>}
                        {a.slaViolado ? <Badge className="text-[10px] h-4 px-1 bg-red-500 text-white">SLA!</Badge> : null}
                      </div>
                      <p className="font-medium truncate mt-0.5">{a.nomeContato || a.telefone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-muted-foreground">{a.operadorNome || "Na fila"}</p>
                      <p className="text-muted-foreground">{formatElapsed(a.iniciadoEm)}</p>
                    </div>
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

  // Modo de visualização da coluna esquerda
  const [abaSelecionada, setAbaSelecionada] = useState<"meus" | "fila" | "automatico" | "supervisor" | "grupos">("meus");

  // Estado da aba de grupos
  const [grupoSelecionado, setGrupoSelecionado] = useState<{ phone: string; name: string; instanciaId: number } | null>(null);
  const [conversaGrupoSelecionada, setConversaGrupoSelecionada] = useState<{ id: number; nomeGrupo: string | null; telefone: string; naoLidas: number } | null>(null);
  const [mensagemGrupo, setMensagemGrupo] = useState("");
  const [instanciaGrupoId, setInstanciaGrupoId] = useState<number | null>(null);
  const [buscaGrupo, setBuscaGrupo] = useState("");
  const messagesGrupoEndRef = useRef<HTMLDivElement>(null);

  // Atendimento selecionado (modo "meus" e "fila")
  const [atendimentoSelecionado, setAtendimentoSelecionado] = useState<Atendimento | null>(null);


  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  const [mensagensOtimistas, setMensagensOtimistas] = useState<any[]>([]);
  const [modalTransferencia, setModalTransferencia] = useState(false);
  const [modalFinalizacao, setModalFinalizacao] = useState(false);
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const [buscaConversa, setBuscaConversa] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: meuStatus, refetch: refetchStatus } = trpc.atendimento.meuStatusOperador.useQuery();
  const { data: meusAtendimentos = [], refetch: refetchMeus } = trpc.atendimento.meusAtendimentos.useQuery(undefined, { refetchInterval: 3000 });
  const { data: fila = [], refetch: refetchFila } = trpc.atendimento.filaAtendimento.useQuery(undefined, { refetchInterval: 3000 });
  const { data: automaticos = [] } = trpc.atendimento.automaticosAtendimento.useQuery(undefined, { refetchInterval: 3000 });
  const { data: mensagensRapidas = [] } = trpc.atendimento.listarMensagensRapidas.useQuery();

  // Instâncias WhatsApp
  const { data: instancias = [] } = trpc.whatsapp.listarInstancias.useQuery(undefined, { refetchInterval: 30000 });

  // Grupos da aba de grupos — via Z-API (para lista de grupos disponíveis)
  const { data: gruposDaInstancia = [], isLoading: loadingGrupos } =
    trpc.whatsapp.listarGrupos.useQuery(
      { instanciaId: instanciaGrupoId ?? 0, pageSize: 200 },
      { enabled: !!instanciaGrupoId && abaSelecionada === "grupos" }
    );

  const gruposFiltrados = (gruposDaInstancia as any[]).filter((g: any) =>
    g.name?.toLowerCase().includes(buscaGrupo.toLowerCase()) ||
    g.phone?.toLowerCase().includes(buscaGrupo.toLowerCase())
  );

  // Conversas de grupo salvas no banco (para histórico)
  const { data: conversasGrupo = [], refetch: refetchConversasGrupo } =
    trpc.whatsapp.listarConversasGrupo.useQuery(
      { instanciaId: instanciaGrupoId ?? 0 },
      { enabled: !!instanciaGrupoId && abaSelecionada === "grupos", refetchInterval: 5000 }
    );

  // Mensagens da conversa de grupo selecionada (busca pelo telefone do grupo)
  const { data: dadosGrupoSelecionado, refetch: refetchMensagensGrupo } =
    trpc.whatsapp.getMensagensGrupoPorTelefone.useQuery(
      {
        instanciaId: instanciaGrupoId ?? 0,
        telefone: grupoSelecionado?.phone ?? "",
        nomeGrupo: grupoSelecionado?.name,
      },
      { enabled: !!grupoSelecionado && !!instanciaGrupoId, refetchInterval: 3000 }
    );
  const mensagensGrupo = dadosGrupoSelecionado?.mensagens ?? [];

  const marcarGrupoLidoMutation = trpc.whatsapp.marcarGrupoLido.useMutation({
    onSuccess: () => refetchConversasGrupo(),
  });

  // Scroll automático nas mensagens de grupo
  useEffect(() => {
    messagesGrupoEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagensGrupo]);

  const enviarMensagemGrupoMutation = trpc.whatsapp.enviarMensagemGrupo.useMutation({
    onSuccess: () => {
      setMensagemGrupo("");
      refetchMensagensGrupo();
      refetchConversasGrupo();
    },
    onError: (e) => toast.error("Erro ao enviar: " + e.message),
  });



  // Mensagens do atendimento selecionado
  const conversaIdAtiva = atendimentoSelecionado?.conversaId;

  const { data: mensagens = [], refetch: refetchMensagens } = trpc.whatsapp.listarMensagens.useQuery(
    { conversaId: conversaIdAtiva ?? 0 },
    { enabled: !!conversaIdAtiva, refetchInterval: 3000 }
  );


  // ─── Mutations ────────────────────────────────────────────────────────────────
  const atualizarStatusMutation = trpc.atendimento.atualizarStatusOperador.useMutation({
    onSuccess: (data) => { toast.success(`Status: ${statusOperadorConfig[data.status]?.label}`); refetchStatus(); },
  });

  const utils = trpc.useUtils();

  const assumirMutation = trpc.atendimento.assumirAtendimento.useMutation({
    onSuccess: async (_data, variables) => {
      toast.success("Atendimento assumido!");
      setAbaSelecionada("meus");
      // Remove otimisticamente da lista local antes do refetch
      // Invalida e refaz as queries com pequeno delay para garantir que o banco confirmou
      setTimeout(async () => {
        await utils.atendimento.filaAtendimento.invalidate();
        await utils.atendimento.meusAtendimentos.invalidate();
        refetchFila();
        refetchMeus().then(({ data }) => {
          const assumido = (data as Atendimento[] | undefined)?.find(a => a.id === variables.atendimentoId);
          if (assumido) setAtendimentoSelecionado(assumido);
        });
      }, 500);
    },
    onError: (e) => toast.error("Erro: " + e.message),
  });


  const enviarMutation = trpc.whatsapp.enviarMensagem.useMutation({
    onSuccess: () => { refetchMensagens(); },
    onError: () => {},
  });

  const uploadMidiaMutation = trpc.whatsapp.uploadMidia.useMutation({
    onError: () => {},
  });

  // ─── Efeitos ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, mensagensOtimistas]);

  // Limpa mensagens otimistas que já chegaram via polling
  useEffect(() => {
    if (mensagensOtimistas.length === 0) return;
    setMensagensOtimistas(prev =>
      prev.filter(ot => !ot._erro && !(mensagens as any[]).some(
        (m: any) => m.conteudo === ot.conteudo && m.direction === "out" && !ot._erro
      ))
    );
  }, [mensagens]);

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const handleEnviarOtimista = useCallback(async (
    conversaId: number,
    tipo: string,
    conteudo: string | undefined,
    mediaUrl?: string,
    nomeArquivo?: string,
    tempId?: string,
  ) => {
    try {
      await enviarMutation.mutateAsync({ conversaId, tipo: tipo as any, conteudo, mediaUrl, nomeArquivo });
      // Remove da lista otimista após sucesso (o polling vai trazer a mensagem real)
      setMensagensOtimistas(prev => prev.filter(m => m._tempId !== tempId));
      refetchMensagens();
    } catch (e: any) {
      // Marca como erro
      setMensagensOtimistas(prev =>
        prev.map(m => m._tempId === tempId ? { ...m, _otimista: false, _erro: true } : m)
      );
    }
  }, [enviarMutation, refetchMensagens]);

  const handleEnviar = useCallback(async () => {
    const conversaId = atendimentoSelecionado?.conversaId;
    if (!conversaId) return;

    if (arquivoSelecionado) {
      const tipo = arquivoSelecionado.type.startsWith("image/") ? "image" : arquivoSelecionado.type.startsWith("audio/") ? "audio" : "document";
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const previewUrl = tipo === "image" ? URL.createObjectURL(arquivoSelecionado) : undefined;
      const msgOtimista = {
        _tempId: tempId, _otimista: true, _erro: false,
        id: tempId, direction: "out", tipo,
        conteudo: texto.trim() || undefined,
        mediaUrl: previewUrl,
        nomeArquivo: arquivoSelecionado.name,
        createdAt: new Date().toISOString(),
        status: "enviando",
      };
      setMensagensOtimistas(prev => [...prev, msgOtimista]);
      // Libera o campo imediatamente
      const arquivoParaEnviar = arquivoSelecionado;
      const textoCaption = texto.trim();
      setArquivoSelecionado(null);
      setTexto("");
      setUploadProgress(10);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(arquivoParaEnviar);
        });
        setUploadProgress(40);
        const { url } = await uploadMidiaMutation.mutateAsync({ base64, mimeType: arquivoParaEnviar.type || "application/octet-stream", nomeArquivo: arquivoParaEnviar.name });
        setUploadProgress(80);
        await handleEnviarOtimista(conversaId, tipo, textoCaption || undefined, url, arquivoParaEnviar.name, tempId);
        setUploadProgress(0);
      } catch {
        setUploadProgress(0);
        setMensagensOtimistas(prev =>
          prev.map(m => m._tempId === tempId ? { ...m, _otimista: false, _erro: true } : m)
        );
      }
      return;
    }

    if (!texto.trim()) return;
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const textoParaEnviar = texto.trim();
    const msgOtimista = {
      _tempId: tempId, _otimista: true, _erro: false,
      id: tempId, direction: "out", tipo: "text",
      conteudo: textoParaEnviar,
      createdAt: new Date().toISOString(),
      status: "enviando",
    };
    setMensagensOtimistas(prev => [...prev, msgOtimista]);
    // Libera o campo imediatamente
    setTexto("");
    inputRef.current?.focus();
    handleEnviarOtimista(conversaId, "text", textoParaEnviar, undefined, undefined, tempId);
  }, [texto, atendimentoSelecionado, arquivoSelecionado, handleEnviarOtimista]);

  const handleReenviar = useCallback((msgErro: any) => {
    const conversaId = atendimentoSelecionado?.conversaId;
    if (!conversaId) return;
    // Volta para estado enviando
    setMensagensOtimistas(prev =>
      prev.map(m => m._tempId === msgErro._tempId ? { ...m, _otimista: true, _erro: false } : m)
    );
    handleEnviarOtimista(conversaId, msgErro.tipo, msgErro.conteudo, msgErro.mediaUrl, msgErro.nomeArquivo, msgErro._tempId);
  }, [atendimentoSelecionado, handleEnviarOtimista]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnviar(); } };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("Arquivo muito grande. Limite: 16 MB"); return; }
    setArquivoSelecionado(file);
    e.target.value = "";
  };

  const atendimentosFiltrados = (meusAtendimentos as Atendimento[]).filter(a =>
    !buscaConversa || (a.nomeContato?.toLowerCase().includes(buscaConversa.toLowerCase())) ||
    (a.telefone?.includes(buscaConversa)) || (a.protocolo.toLowerCase().includes(buscaConversa.toLowerCase()))
  );

  const statusAtual = meuStatus?.status ?? "offline";
  const stConf = statusOperadorConfig[statusAtual] ?? statusOperadorConfig.offline;

  // Determina se há chat ativo para mostrar
  const chatAtivo = !!atendimentoSelecionado;
  const nomeAtivo = atendimentoSelecionado?.nomeContato || atendimentoSelecionado?.telefone;
  const telefoneAtivo = atendimentoSelecionado?.telefone;

  return (
    <div className="flex h-full bg-background overflow-hidden">


      {/* ── Coluna 1: Lista de atendimentos ─────────────────────────────────────── */}
      <div className="w-80 flex flex-col border-r shrink-0">
        {/* Header do operador */}
        <div className="p-3 border-b bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials(user?.name)}</AvatarFallback>
                </Avatar>
                <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background", stConf.color)} />
              </div>
              <div>
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{stConf.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Botão Nova Conversa */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => setNovaConversaAberta(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nova Conversa</TooltipContent>
              </Tooltip>
              {/* Status do operador */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">Meu status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(["online", "ausente", "ocupado", "offline"] as const).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => atualizarStatusMutation.mutate({ status: s })} className="gap-2 text-sm">
                      <div className={cn("w-2.5 h-2.5 rounded-full", statusOperadorConfig[s].color)} />
                      {statusOperadorConfig[s].label}
                      {statusAtual === s && <Check className="h-3 w-3 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Abas */}
          <div className="flex gap-1 flex-wrap">
            {([
              { key: "meus", label: "Meus", count: meusAtendimentos.length },
              { key: "fila", label: "Fila", count: fila.length },
              { key: "automatico", label: "Automático", count: automaticos.length },
              { key: "grupos", label: "Grupos", count: null },
              { key: "supervisor", label: "Supervisão", count: null },
            ] as const).map((aba) => (
              <button key={aba.key} onClick={() => setAbaSelecionada(aba.key)}
                className={cn(
                  "flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors min-w-[60px]",
                  abaSelecionada === aba.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                )}>
                {aba.label}
                {aba.count !== null && aba.count > 0 && (
                  <span className={cn("ml-1 px-1 rounded-full text-[10px]", abaSelecionada === aba.key ? "bg-white/20" : "bg-muted-foreground/20")}>{aba.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Busca */}
          {(abaSelecionada === "meus" || abaSelecionada === "fila" || abaSelecionada === "automatico") && (
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar..." value={buscaConversa} onChange={(e) => setBuscaConversa(e.target.value)} className="pl-8 h-7 text-xs" />
            </div>
          )}
          {/* Seletor de instância para grupos */}
          {abaSelecionada === "grupos" && (
            <div className="mt-2 space-y-1.5">
              <Select value={instanciaGrupoId?.toString() ?? ""} onValueChange={(v) => { setInstanciaGrupoId(Number(v)); setGrupoSelecionado(null); }}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Selecionar instância..." />
                </SelectTrigger>
                <SelectContent>
                  {(instancias as Instancia[]).map((inst) => (
                    <SelectItem key={inst.id} value={inst.id.toString()} className="text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", inst.ativo ? "bg-green-500" : "bg-gray-400")} />
                        {inst.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {instanciaGrupoId && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar grupos..." value={buscaGrupo} onChange={(e) => setBuscaGrupo(e.target.value)} className="pl-8 h-7 text-xs" />
                </div>
              )}
            </div>
          )}

        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {/* Meus atendimentos */}
          {abaSelecionada === "meus" && (
            <>
              {atendimentosFiltrados.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <Inbox className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum atendimento ativo</p>
                  <p className="text-xs text-muted-foreground mt-1">Assuma atendimentos da fila</p>
                </div>
              ) : atendimentosFiltrados.map((a) => (
                <CardAtendimentoAtivo key={a.id} atend={a} isSelected={atendimentoSelecionado?.id === a.id} onClick={() => setAtendimentoSelecionado(a)} />
              ))}
            </>
          )}

          {/* Fila */}
          {abaSelecionada === "fila" && (
            <div className="p-3 space-y-2">
              {(fila as Atendimento[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-400 mb-3" />
                  <p className="text-sm text-muted-foreground">Fila vazia!</p>
                </div>
              ) : (fila as Atendimento[]).map((a) => (
                <CardFila key={a.id} atend={a} onAssumir={(id) => assumirMutation.mutate({ atendimentoId: id })} />
              ))}
            </div>
          )}

          {/* Automático */}
          {abaSelecionada === "automatico" && (
            <div className="p-3 space-y-2">
              {(automaticos as any[]).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="text-4xl mb-3">🤖</div>
                  <p className="text-sm text-muted-foreground">Nenhum atendimento automático</p>
                  <p className="text-xs text-muted-foreground mt-1">O bot não está respondendo nenhuma conversa</p>
                </div>
              ) : (automaticos as any[]).filter(a =>
                !buscaConversa ||
                (a.nomeContato ?? "").toLowerCase().includes(buscaConversa.toLowerCase()) ||
                (a.telefone ?? "").includes(buscaConversa) ||
                (a.protocolo ?? "").toLowerCase().includes(buscaConversa.toLowerCase())
              ).map((a: any) => (
                <CardAutomatico key={a.id} atend={a} onAssumir={(id) => assumirMutation.mutate({ atendimentoId: id })} />
              ))}
            </div>
          )}

          {/* Grupos */}
          {abaSelecionada === "grupos" && (
            <div className="flex flex-col h-full">
              {!instanciaGrupoId ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Selecione uma instância acima</p>
                </div>
              ) : (
                <div className="divide-y overflow-y-auto flex-1">
                  {/* Grupos com histórico no banco */}
                  {(conversasGrupo as any[]).filter((c: any) =>
                    !buscaGrupo ||
                    (c.nomeGrupo ?? "").toLowerCase().includes(buscaGrupo.toLowerCase())
                  ).map((conversa: any) => (
                    <button
                      key={conversa.id}
                      onClick={() => {
                        setConversaGrupoSelecionada({ id: conversa.id, nomeGrupo: conversa.nomeGrupo, telefone: conversa.telefone, naoLidas: conversa.naoLidas });
                        setGrupoSelecionado({ phone: conversa.telefone, name: conversa.nomeGrupo || "Grupo", instanciaId: instanciaGrupoId });
                        if (conversa.naoLidas > 0) marcarGrupoLidoMutation.mutate({ conversaId: conversa.id });
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-2.5",
                        conversaGrupoSelecionada?.id === conversa.id ? "bg-accent" : ""
                      )}
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{conversa.nomeGrupo || "Grupo sem nome"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{conversa.ultimaMensagem || "Nenhuma mensagem"}</p>
                      </div>
                      {Number(conversa.naoLidas) > 0 && (
                        <Badge className="bg-green-500 text-white text-[10px] h-4 px-1 shrink-0">{conversa.naoLidas}</Badge>
                      )}
                    </button>
                  ))}
                  {/* Grupos disponíveis via Z-API que ainda não têm histórico */}
                  {gruposFiltrados.filter((g: any) =>
                    !(conversasGrupo as any[]).some((c: any) => c.telefone === g.phone)
                  ).map((grupo: any) => (
                    <button
                      key={grupo.phone}
                      onClick={() => {
                        setConversaGrupoSelecionada(null);
                        setGrupoSelecionado({ phone: grupo.phone, name: grupo.name || "Grupo", instanciaId: instanciaGrupoId });
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-accent transition-colors flex items-center gap-2.5",
                        grupoSelecionado?.phone === grupo.phone && !conversaGrupoSelecionada ? "bg-accent" : ""
                      )}
                    >
                      <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                        <Users className="h-4 w-4 text-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{grupo.name || "Grupo sem nome"}</p>
                        <p className="text-[10px] text-muted-foreground truncate">Sem mensagens ainda</p>
                      </div>
                    </button>
                  ))}
                  {(conversasGrupo as any[]).length === 0 && gruposFiltrados.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                      <Users className="h-7 w-7 text-muted-foreground/30 mb-2" />
                      <p className="text-xs text-muted-foreground">{buscaGrupo ? "Nenhum grupo encontrado" : "Nenhum grupo disponível"}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Supervisão — placeholder */}
          {abaSelecionada === "supervisor" && (
            <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
              Painel de supervisão exibido à direita
            </div>
          )}
        </div>
      </div>

      {/* ── Coluna 3: Chat / Supervisão ──────────────────────────────────────── */}
      {abaSelecionada === "grupos" ? (
        <div className="flex-1 flex flex-col min-w-0">
          {!grupoSelecionado ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-base font-semibold mb-1">Conversas de Grupos</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                Selecione um grupo na lista ao lado para ver o histórico e enviar mensagens.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Para gerenciar participantes, renomear ou criar grupos, acesse{" "}
                <Link href="/whatsapp/grupos" className="text-primary hover:underline">Configurações de Grupos</Link>.
              </p>
            </div>
          ) : (
            <>
              {/* Header do grupo */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
                <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{grupoSelecionado.name}</p>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500/15 text-green-700 border border-green-500/30 shrink-0">
                      <Users className="h-2.5 w-2.5" />GRUPO
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{grupoSelecionado.phone?.replace(/-group$/, "").replace(/@g\.us$/, "")}</p>
                </div>
                <Link href="/whatsapp/grupos">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Settings className="h-3.5 w-3.5" />Gerenciar
                  </Button>
                </Link>
              </div>

              {/* Área de mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/5">
                {(mensagensGrupo as any[]).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                    <p className="text-xs text-muted-foreground mt-1">Envie uma mensagem para iniciar a conversa</p>
                  </div>
                ) : (
                  (mensagensGrupo as any[]).map((msg: any) => (
                    <div key={msg.id} className={cn("flex", msg.direction === "out" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                        msg.direction === "out"
                          ? "bg-green-600 text-white rounded-br-sm"
                          : "bg-background border rounded-bl-sm"
                      )}>
                        {msg.tipo === "image" && msg.mediaUrl && (
                          <img src={msg.mediaUrl} alt="imagem" className="rounded-lg max-w-full mb-1" />
                        )}
                        {msg.tipo === "document" && msg.mediaUrl && (
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 underline text-xs">
                            <FileText className="h-3.5 w-3.5" />{msg.nomeArquivo || "Documento"}
                          </a>
                        )}
                        {msg.direction === "in" && msg.nomeContato && (
                          <p className="text-[10px] font-semibold text-green-700 mb-0.5">{msg.nomeContato}</p>
                        )}
                        {msg.conteudo && <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>}
                        <p className={cn("text-[10px] mt-0.5", msg.direction === "out" ? "text-green-100" : "text-muted-foreground")}>
                          {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesGrupoEndRef} />
              </div>

              {/* Campo de envio */}
              <div className="px-4 py-3 border-t bg-background shrink-0">
                <div className="flex items-end gap-2">
                  <Textarea
                    placeholder="Digite uma mensagem para o grupo..."
                    value={mensagemGrupo}
                    onChange={(e) => setMensagemGrupo(e.target.value)}
                    rows={2}
                    className="resize-none flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (mensagemGrupo.trim()) {
                          enviarMensagemGrupoMutation.mutate({ instanciaId: grupoSelecionado.instanciaId, groupPhone: grupoSelecionado.phone, message: mensagemGrupo.trim() });
                        }
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 bg-green-600 hover:bg-green-700 shrink-0"
                    disabled={!mensagemGrupo.trim() || enviarMensagemGrupoMutation.isPending}
                    onClick={() => enviarMensagemGrupoMutation.mutate({ instanciaId: grupoSelecionado.instanciaId, groupPhone: grupoSelecionado.phone, message: mensagemGrupo.trim() })}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Enter para enviar · Shift+Enter para nova linha</p>
              </div>
            </>
          )}
        </div>
      ) : abaSelecionada === "supervisor" ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-background shrink-0">
            <BarChart2 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Painel de Supervisão em Tempo Real</h2>
          </div>
          <PainelSupervisor />
        </div>
      ) : chatAtivo ? (
        <>
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header do chat */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-slate-200 text-slate-700 text-xs">
                  {initials(nomeAtivo)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{nomeAtivo}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{telefoneAtivo}</p>
                  {atendimentoSelecionado && (
                    <>
                      <span className="text-xs font-mono text-muted-foreground">{atendimentoSelecionado.protocolo}</span>
                      {atendimentoSelecionado.departamentoNome && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">{atendimentoSelecionado.departamentoNome}</Badge>
                      )}
                    </>
                  )}
                </div>
              </div>
              {atendimentoSelecionado && (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setModalTransferencia(true)}>
                    <Shuffle className="h-3.5 w-3.5" />Transferir
                  </Button>
                  <Button size="sm" className="h-8 text-xs gap-1.5 bg-red-500 hover:bg-red-600 text-white font-semibold px-3" onClick={() => setModalFinalizacao(true)}>
                    <XCircle className="h-3.5 w-3.5" />Finalizar
                  </Button>
                </div>
              )}
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1"
              style={{ backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
              {(mensagens as any[]).length === 0 && mensagensOtimistas.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageCircle className="h-12 w-12 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <>
                  {(mensagens as any[]).map((msg) => (
                    <div key={msg.id} className={cn("flex", msg.direction === "out" ? "justify-end" : "justify-start")}>
                      <MsgBubble msg={msg} onReenviar={handleReenviar} />
                    </div>
                  ))}
                  {mensagensOtimistas.map((msg) => (
                    <div key={msg._tempId} className="flex justify-end">
                      <MsgBubble msg={msg} onReenviar={handleReenviar} />
                    </div>
                  ))}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Progresso de upload */}
            {uploadProgress > 0 && (
              <div className="px-4 py-1 shrink-0"><Progress value={uploadProgress} className="h-1.5" /></div>
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
                    <DropdownMenuItem key={mr.id} onClick={() => setTexto(mr.conteudo)} className="flex flex-col items-start gap-0.5 cursor-pointer">
                      <span className="text-xs font-medium text-primary">{mr.atalho}</span>
                      <span className="text-xs text-muted-foreground truncate w-full">{mr.titulo}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Anexo */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full shrink-0 text-muted-foreground">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-44">
                  <DropdownMenuItem onClick={() => imageInputRef.current?.click()} className="gap-2 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center"><ImageIcon className="h-3.5 w-3.5 text-purple-600" /></div>
                    Foto / Imagem
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => audioInputRef.current?.click()} className="gap-2 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center"><Mic className="h-3.5 w-3.5 text-orange-600" /></div>
                    Áudio
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2 cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center"><FileText className="h-3.5 w-3.5 text-blue-600" /></div>
                    Documento
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex-1 flex items-center gap-2 bg-muted rounded-2xl px-3 py-2">
                <Input ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={arquivoSelecionado ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 text-sm" />
              </div>

              <Button onClick={handleEnviar} disabled={!texto.trim() && !arquivoSelecionado}
                size="icon" className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* ── Coluna 4: Detalhes (apenas em atendimentos, não em conversas livres) */}
          {atendimentoSelecionado && (
            <div className="w-64 border-l flex flex-col shrink-0 bg-muted/10">
              <PainelDetalhes
                atendimentoId={atendimentoSelecionado.id}
                conversaId={atendimentoSelecionado.conversaId}
                onTransferir={() => setModalTransferencia(true)}
                onFinalizar={() => setModalFinalizacao(true)}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <MessageCircle className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Central de Atendimento</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {abaSelecionada === "fila" ? "Selecione um atendimento da fila para assumir."
: "Selecione um atendimento na lista ao lado."}
          </p>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => atualizarStatusMutation.mutate({ status: "online" })}>
              <div className="w-2 h-2 rounded-full bg-green-500" />Ficar Online
            </Button>
          </div>
        </div>
      )}

      {/* Modais */}
      <ModalNovaConversa
        open={novaConversaAberta}
        onClose={() => setNovaConversaAberta(false)}
        instancias={instancias as Instancia[]}
        onConversaCriada={async (conversa) => {
          // Aguarda o banco confirmar e busca o atendimento criado
          setTimeout(async () => {
            await utils.atendimento.meusAtendimentos.invalidate();
            const { data } = await refetchMeus();
            const novo = (data as Atendimento[] | undefined)?.find(a => a.conversaId === conversa.id);
            if (novo) {
              setAtendimentoSelecionado(novo);
              setAbaSelecionada("meus");
            } else {
              setAbaSelecionada("meus");
            }
          }, 800);
        }}
      />
      {atendimentoSelecionado && (
        <>
          <ModalTransferencia atendimentoId={atendimentoSelecionado.id} open={modalTransferencia} onClose={() => setModalTransferencia(false)} onSuccess={() => { refetchMeus(); setAtendimentoSelecionado(null); }} />
          <ModalFinalizacao atendimentoId={atendimentoSelecionado.id} open={modalFinalizacao} onClose={() => setModalFinalizacao(false)} onSuccess={() => { refetchMeus(); setAtendimentoSelecionado(null); }} />
        </>
      )}
    </div>
  );
}
