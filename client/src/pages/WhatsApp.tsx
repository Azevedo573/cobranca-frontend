import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  MessageCircle, Send, Paperclip, Search, Phone, User,
  Wifi, WifiOff, RefreshCw, Settings, ChevronRight,
  FileText, Image as ImageIcon, Mic, MoreVertical,
  Building2, Scale, Globe, CheckCheck, Check, Clock,
  Plus, X, Download, Play, Pause, Volume2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

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

type Mensagem = {
  id: number; conversaId: number; direction: string; tipo: string;
  conteudo: string | null; mediaUrl: string | null; nomeArquivo: string | null;
  status: string; zApiMessageId: string | null; createdAt: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const setorIcon = (setor: string) => {
  if (setor === "cobranca") return <Building2 className="h-3.5 w-3.5" />;
  if (setor === "juridico") return <Scale className="h-3.5 w-3.5" />;
  return <Globe className="h-3.5 w-3.5" />;
};

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

const formatTime = (date: Date | null | string) => {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString("pt-BR", { weekday: "short" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const initials = (name: string | null) => {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
};

// Detecta o tipo de mídia pelo mime ou nome do arquivo
const detectTipo = (file: File): "image" | "audio" | "document" => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
};

// Formata duração em segundos para mm:ss
const formatDuration = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// ─── Componente de status de mensagem ─────────────────────────────────────────
const MsgStatus = ({ status }: { status: string }) => {
  if (status === "lida") return <CheckCheck className="h-3.5 w-3.5 text-blue-400" />;
  if (status === "entregue") return <CheckCheck className="h-3.5 w-3.5 text-gray-400" />;
  if (status === "enviada") return <Check className="h-3.5 w-3.5 text-gray-400" />;
  return <Clock className="h-3.5 w-3.5 text-gray-400" />;
};

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
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => toast.error("Não foi possível reproduzir o áudio"));
    }
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
          const audio = audioRef.current;
          if (!audio) return;
          setCurrentTime(audio.currentTime);
          setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
        }}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (audio) setDuration(audio.duration);
        }}
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
            const audio = audioRef.current;
            if (!audio || !audio.duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            audio.currentTime = ratio * audio.duration;
          }}
        >
          <div
            className={cn("h-full rounded-full transition-all", isOut ? "bg-white" : "bg-green-500")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={cn("text-[10px]", isOut ? "text-green-100" : "text-muted-foreground")}>
          {duration > 0 ? `${formatDuration(currentTime)} / ${formatDuration(duration)}` : "Áudio"}
        </span>
      </div>
      <Volume2 className={cn("h-3.5 w-3.5 shrink-0 opacity-60", isOut ? "text-white" : "text-muted-foreground")} />
    </div>
  );
}

// ─── Preview de arquivo antes de enviar ──────────────────────────────────────
function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const tipo = detectTipo(file);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tipo === "image") {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file, tipo]);

  return (
    <div className="relative flex items-center gap-2 bg-muted rounded-xl px-3 py-2 border border-border max-w-xs">
      {tipo === "image" && previewUrl ? (
        <img src={previewUrl} alt="preview" className="w-12 h-12 rounded-lg object-cover shrink-0" />
      ) : tipo === "audio" ? (
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <Mic className="h-5 w-5 text-green-600" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-blue-600" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{file.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {(file.size / 1024).toFixed(0)} KB · {tipo === "image" ? "Imagem" : tipo === "audio" ? "Áudio" : "Documento"}
        </p>
      </div>
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Balão de mensagem ────────────────────────────────────────────────────────
function MsgBubble({ msg }: { msg: Mensagem }) {
  const isOut = msg.direction === "out";

  return (
    <div className={cn(
      "max-w-[72%] rounded-2xl px-3 py-2 shadow-sm",
      isOut
        ? "bg-green-500 text-white rounded-br-sm"
        : "bg-white text-foreground rounded-bl-sm"
    )}>
      {/* Imagem */}
      {msg.tipo === "image" && msg.mediaUrl && (
        <div className="mb-1">
          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={msg.mediaUrl}
              alt={msg.nomeArquivo ?? "imagem"}
              className="rounded-xl max-w-full max-h-56 object-cover cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
          {msg.conteudo && (
            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{msg.conteudo}</p>
          )}
        </div>
      )}

      {/* Áudio */}
      {msg.tipo === "audio" && msg.mediaUrl && (
        <AudioPlayer src={msg.mediaUrl} isOut={isOut} />
      )}

      {/* Documento */}
      {msg.tipo === "document" && (
        <a
          href={msg.mediaUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 mb-1 transition-colors",
            isOut ? "bg-white/15 hover:bg-white/25" : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
          )}
        >
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", isOut ? "bg-white/20" : "bg-blue-100")}>
            <FileText className={cn("h-5 w-5", isOut ? "text-white" : "text-blue-600")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn("text-xs font-medium truncate", isOut ? "text-white" : "text-foreground")}>
              {msg.nomeArquivo || "Documento"}
            </p>
            <p className={cn("text-[10px]", isOut ? "text-green-100" : "text-muted-foreground")}>Toque para abrir</p>
          </div>
          <Download className={cn("h-4 w-4 shrink-0", isOut ? "text-white/70" : "text-muted-foreground")} />
        </a>
      )}

      {/* Texto simples */}
      {msg.tipo === "text" && msg.conteudo && (
        <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
      )}

      {/* Rodapé: hora + status */}
      <div className={cn("flex items-center justify-end gap-1 mt-0.5", isOut ? "text-green-100" : "text-muted-foreground")}>
        <span className="text-[10px]">
          {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {isOut && <MsgStatus status={msg.status} />}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function WhatsApp() {
  const { user } = useAuth();
  const [instanciaSelecionada, setInstanciaSelecionada] = useState<Instancia | null>(null);
  const [conversaSelecionada, setConversaSelecionada] = useState<Conversa | null>(null);
  const [busca, setBusca] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0 = idle, 1-100 = uploading
  const [arquivoSelecionado, setArquivoSelecionado] = useState<File | null>(null);
  // Modal nova conversa
  const [novaConversaAberta, setNovaConversaAberta] = useState(false);
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaInstanciaId, setNovaInstanciaId] = useState<string>("");
  const [criandoConversa, setCriandoConversa] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: instancias = [], isLoading: loadingInst } = trpc.whatsapp.listarInstancias.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const { data: conversas = [], refetch: refetchConversas } = trpc.whatsapp.listarConversas.useQuery(
    { instanciaId: instanciaSelecionada?.id, busca: busca || undefined },
    { enabled: true, refetchInterval: 3000 }
  );

  const { data: mensagens = [], refetch: refetchMensagens } = trpc.whatsapp.listarMensagens.useQuery(
    { conversaId: conversaSelecionada?.conversa.id ?? 0 },
    { enabled: !!conversaSelecionada, refetchInterval: 3000 }
  );

  const { data: statusInstancia } = trpc.whatsapp.statusInstancia.useQuery(
    { instanciaId: instanciaSelecionada?.id ?? 0 },
    { enabled: !!instanciaSelecionada, refetchInterval: 15000 }
  );

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const enviarMutation = trpc.whatsapp.enviarMensagem.useMutation({
    onSuccess: () => {
      setTexto("");
      setArquivoSelecionado(null);
      refetchMensagens();
      refetchConversas();
    },
    onError: (err) => toast.error("Erro ao enviar: " + err.message),
  });

  const uploadMidiaMutation = trpc.whatsapp.uploadMidia.useMutation({
    onError: (err) => toast.error("Erro no upload: " + err.message),
  });

  const marcarLidaMutation = trpc.whatsapp.marcarLida.useMutation({
    onSuccess: () => refetchConversas(),
  });

  const criarConversaMutation = trpc.whatsapp.criarConversa.useMutation({
    onSuccess: (novaConversa) => {
      toast.success("Conversa iniciada com sucesso!");
      setNovaConversaAberta(false);
      setNovoTelefone("");
      setNovoNome("");
      refetchConversas();
      if (novaConversa) {
        const instancia = instancias.find((i: any) => i.id === novaConversa.instanciaId) as Instancia | undefined;
        setConversaSelecionada({
          conversa: novaConversa as any,
          instancia: instancia ? { nome: instancia.nome, setor: instancia.setor } : null,
        });
      }
    },
    onError: (err) => toast.error("Erro ao criar conversa: " + err.message),
  });

  // ─── Efeitos ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (instancias.length > 0 && !instanciaSelecionada) {
      setInstanciaSelecionada(instancias[0] as Instancia);
    }
  }, [instancias]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    if (conversaSelecionada?.conversa.naoLidas && conversaSelecionada.conversa.naoLidas > 0) {
      marcarLidaMutation.mutate({ conversaId: conversaSelecionada.conversa.id });
    }
  }, [conversaSelecionada?.conversa.id]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleEnviar = useCallback(async () => {
    if (!conversaSelecionada || enviando) return;

    // Se há arquivo selecionado, fazer upload primeiro
    if (arquivoSelecionado) {
      setEnviando(true);
      setUploadProgress(10);
      try {
        const tipo = detectTipo(arquivoSelecionado);
        // Converter arquivo para base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remover prefixo "data:...;base64,"
            resolve(result.split(",")[1]);
          };
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
          conversaId: conversaSelecionada.conversa.id,
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
        inputRef.current?.focus();
      }
      return;
    }

    // Envio de texto simples
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await enviarMutation.mutateAsync({
        conversaId: conversaSelecionada.conversa.id,
        tipo: "text",
        conteudo: texto.trim(),
      });
    } finally {
      setEnviando(false);
      inputRef.current?.focus();
    }
  }, [texto, conversaSelecionada, enviando, arquivoSelecionado]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  };

  const handleSelecionarArquivo = (tipo: "image" | "document" | "audio") => {
    if (tipo === "image") imageInputRef.current?.click();
    else if (tipo === "audio") audioInputRef.current?.click();
    else fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Limite: 16 MB");
      return;
    }
    setArquivoSelecionado(file);
    // Limpar o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = "";
  };

  const handleCriarConversa = async () => {
    const instId = novaInstanciaId || (instanciaSelecionada?.id?.toString() ?? "");
    if (!novoTelefone.trim() || !instId) {
      toast.error("Preencha o número de telefone e selecione uma instância");
      return;
    }
    setCriandoConversa(true);
    try {
      await criarConversaMutation.mutateAsync({
        instanciaId: parseInt(instId),
        telefone: novoTelefone.trim(),
        nomeContato: novoNome.trim() || undefined,
      });
    } finally {
      setCriandoConversa(false);
    }
  };

  const handleSelecionarConversa = (c: Conversa) => {
    setConversaSelecionada(c);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="flex h-full bg-background overflow-hidden">

      {/* ── Coluna 1: Instâncias ─────────────────────────────────────────────── */}
      <div className="w-16 flex flex-col items-center py-3 gap-2 border-r bg-muted/30 shrink-0">
        <div className="mb-2">
          <MessageCircle className="h-6 w-6 text-green-500" />
        </div>
        {loadingInst ? (
          <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
        ) : instancias.length === 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/configuracoes/whatsapp">
                <Button variant="ghost" size="icon" className="w-10 h-10 rounded-full border-2 border-dashed border-muted-foreground/30">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Configurar instâncias</TooltipContent>
          </Tooltip>
        ) : (
          instancias.map((inst: any) => (
            <Tooltip key={inst.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setInstanciaSelecionada(inst); setConversaSelecionada(null); }}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all",
                    setorColor(inst.setor),
                    instanciaSelecionada?.id === inst.id
                      ? "ring-2 ring-offset-2 ring-green-500 scale-110"
                      : "opacity-70 hover:opacity-100"
                  )}
                >
                  {inst.nome.charAt(0).toUpperCase()}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <div className="flex items-center gap-1.5">
                  {setorIcon(inst.setor)}
                  <span>{inst.nome} — {setorLabel(inst.setor)}</span>
                </div>
              </TooltipContent>
            </Tooltip>
          ))
        )}
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Link href="/configuracoes/whatsapp">
              <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </Button>
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">Configurações</TooltipContent>
        </Tooltip>
      </div>

      {/* ── Coluna 2: Lista de conversas ─────────────────────────────────────── */}
      <div className="w-80 flex flex-col border-r shrink-0">
        {/* Header */}
        <div className="p-3 border-b bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-sm">
                {instanciaSelecionada ? instanciaSelecionada.nome : "WhatsApp"}
              </h2>
              {instanciaSelecionada && (
                <div className="flex items-center gap-1 mt-0.5">
                  {statusInstancia?.connected ? (
                    <><Wifi className="h-3 w-3 text-green-500" /><span className="text-xs text-green-600">Conectado</span></>
                  ) : (
                    <><WifiOff className="h-3 w-3 text-red-500" /><span className="text-xs text-red-500">Desconectado</span></>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => {
                      setNovaInstanciaId(instanciaSelecionada?.id?.toString() ?? "");
                      setNovaConversaAberta(true);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Nova conversa</TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetchConversas()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {(conversas as Conversa[]).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma conversa ainda</p>
              <p className="text-xs text-muted-foreground mt-1">Clique em + para iniciar</p>
            </div>
          ) : (
            (conversas as Conversa[]).map((c) => {
              const isActive = conversaSelecionada?.conversa.id === c.conversa.id;
              return (
                <button
                  key={c.conversa.id}
                  onClick={() => handleSelecionarConversa(c)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-border/50",
                    isActive ? "bg-green-50 border-l-2 border-l-green-500" : "hover:bg-muted/50"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className={cn("text-white text-xs", c.instancia ? setorColor(c.instancia.setor) : "bg-gray-400")}>
                      {initials(c.conversa.nomeContato)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">
                        {c.conversa.nomeContato || c.conversa.telefone}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                        {formatTime(c.conversa.ultimaMensagemEm)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-muted-foreground truncate">
                        {c.conversa.ultimaMensagem || "Sem mensagens"}
                      </p>
                      {c.conversa.naoLidas > 0 && (
                        <Badge className="h-4 min-w-4 px-1 text-[10px] bg-green-500 text-white rounded-full shrink-0 ml-1">
                          {c.conversa.naoLidas}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Coluna 3: Painel de mensagens ────────────────────────────────────── */}
      {conversaSelecionada ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header da conversa */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarFallback className={cn(
                "text-white text-xs",
                conversaSelecionada.instancia ? setorColor(conversaSelecionada.instancia.setor) : "bg-gray-400"
              )}>
                {initials(conversaSelecionada.conversa.nomeContato)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {conversaSelecionada.conversa.nomeContato || conversaSelecionada.conversa.telefone}
              </p>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">{conversaSelecionada.conversa.telefone}</p>
                {conversaSelecionada.instancia && (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px] gap-1">
                    {setorIcon(conversaSelecionada.instancia.setor)}
                    {setorLabel(conversaSelecionada.instancia.setor)}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {conversaSelecionada.conversa.devedorId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={`/devedores/${conversaSelecionada.conversa.devedorId}/detalhes`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <User className="h-4 w-4" />
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>Ver perfil do devedor</TooltipContent>
                </Tooltip>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Área de mensagens */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-1"
            style={{ backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)", backgroundSize: "20px 20px" }}
          >
            {(mensagens as Mensagem[]).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageCircle className="h-12 w-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                <p className="text-xs text-muted-foreground mt-1">Envie a primeira mensagem abaixo</p>
              </div>
            ) : (
              (mensagens as Mensagem[]).map((msg, idx) => {
                const isOut = msg.direction === "out";
                const showDate = idx === 0 || (
                  new Date(msg.createdAt).toDateString() !==
                  new Date((mensagens as Mensagem[])[idx - 1].createdAt).toDateString()
                );
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="bg-white/80 text-xs text-muted-foreground px-3 py-1 rounded-full shadow-sm">
                          {new Date(msg.createdAt).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                        </span>
                      </div>
                    )}
                    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
                      <MsgBubble msg={msg} />
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Barra de progresso de upload */}
          {uploadProgress > 0 && (
            <div className="px-4 py-1 shrink-0">
              <div className="flex items-center gap-2">
                <Progress value={uploadProgress} className="flex-1 h-1.5" />
                <span className="text-xs text-muted-foreground">{uploadProgress}%</span>
              </div>
            </div>
          )}

          {/* Preview do arquivo selecionado */}
          {arquivoSelecionado && (
            <div className="px-4 py-2 border-t shrink-0">
              <FilePreview file={arquivoSelecionado} onRemove={() => setArquivoSelecionado(null)} />
            </div>
          )}

          {/* Campo de envio */}
          <div className="flex items-end gap-2 p-3 border-t bg-background shrink-0">
            {/* Inputs ocultos para seleção de arquivo */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Botão de anexo com menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground"
                  disabled={enviando}
                >
                  <Paperclip className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                <DropdownMenuItem onClick={() => handleSelecionarArquivo("image")} className="gap-2 cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <ImageIcon className="h-4 w-4 text-purple-600" />
                  </div>
                  <span>Foto / Imagem</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelecionarArquivo("audio")} className="gap-2 cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                    <Mic className="h-4 w-4 text-orange-600" />
                  </div>
                  <span>Áudio</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSelecionarArquivo("document")} className="gap-2 cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <span>Documento</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Campo de texto */}
            <div className="flex-1 flex items-center gap-2 bg-muted rounded-2xl px-3 py-2">
              <Input
                ref={inputRef}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={arquivoSelecionado ? "Adicionar legenda (opcional)..." : "Digite uma mensagem..."}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 p-0 text-sm"
                disabled={enviando}
              />
            </div>

            {/* Botão de envio */}
            <Button
              onClick={handleEnviar}
              disabled={(!texto.trim() && !arquivoSelecionado) || enviando}
              size="icon"
              className="h-10 w-10 rounded-full bg-green-500 hover:bg-green-600 shrink-0"
            >
              {enviando
                ? <RefreshCw className="h-4 w-4 animate-spin" />
                : <Send className="h-4 w-4" />
              }
            </Button>
          </div>
        </div>
      ) : (
        /* Estado vazio — nenhuma conversa selecionada */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <MessageCircle className="h-10 w-10 text-green-500" />
          </div>
          <h3 className="text-lg font-semibold mb-1">WhatsApp Integrado</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Selecione uma conversa na lista ao lado para começar a atender.
            Use os ícones à esquerda para alternar entre os setores.
          </p>
          {instancias.length === 0 && (
            <Link href="/configuracoes/whatsapp">
              <Button className="mt-4 gap-2" variant="outline">
                <Settings className="h-4 w-4" />
                Configurar instâncias Z-API
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>

    {/* ── Modal: Nova Conversa ─────────────────────────────────────────────── */}
    <Dialog open={novaConversaAberta} onOpenChange={setNovaConversaAberta}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-500" />
            Nova Conversa
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Instância *</Label>
            <Select value={novaInstanciaId} onValueChange={setNovaInstanciaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância" />
              </SelectTrigger>
              <SelectContent>
                {(instancias as Instancia[]).map((inst) => (
                  <SelectItem key={inst.id} value={inst.id.toString()}>
                    <div className="flex items-center gap-2">
                      {setorIcon(inst.setor)}
                      <span>{inst.nome}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">{setorLabel(inst.setor)}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Número de telefone *</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Ex: 21999998888 ou +5521999998888"
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                className="pl-9"
                onKeyDown={(e) => e.key === "Enter" && handleCriarConversa()}
              />
            </div>
            <p className="text-xs text-muted-foreground">DDD + número, sem espaços ou traços. O código do Brasil (55) é adicionado automaticamente.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nome do contato <span className="text-muted-foreground">(opcional)</span></Label>
            <Input
              placeholder="Ex: João Silva"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCriarConversa()}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setNovaConversaAberta(false)} disabled={criandoConversa}>
            Cancelar
          </Button>
          <Button
            onClick={handleCriarConversa}
            disabled={criandoConversa || !novoTelefone.trim() || !novaInstanciaId}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            {criandoConversa ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Iniciando...</>
            ) : (
              <><MessageCircle className="h-4 w-4" /> Iniciar Conversa</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
