import { useState, useRef, useCallback } from "react";
import { PrioridadeBadge, PRIORIDADE_CONFIG } from "@/components/PrioridadeBadge";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Clock, AlertTriangle, User, Building2, MessageSquare, Mail, Phone,
  Globe, Users, FileText, Calendar, Check, X, Send, Tag, Kanban, Trash2,
  Scale, ExternalLink, Loader2, Paperclip, Upload, Image, File, FileImage,
  Download, Eye,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  parecer: "Parecer Jurídico", convencao: "Convenção/Regimento", assembleia: "Assembleia",
  multa: "Aplicação de Multa", notificacao: "Notificação Extrajudicial", contratos: "Contratos",
  cobranca_judicial: "Cobrança Judicial", processo: "Processo Judicial", audiencia: "Audiência",
  execucao: "Execução", acompanhamento: "Acompanhamento Processual", documentacao: "Documentação",
  relatorio: "Relatório", cadastro: "Cadastro", outro: "Outro",
};

const CANAL_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  whatsapp:         { label: "WhatsApp",      icon: <MessageSquare className="h-4 w-4" /> },
  email:            { label: "E-mail",        icon: <Mail className="h-4 w-4" /> },
  portal:           { label: "Portal",        icon: <Globe className="h-4 w-4" /> },
  telefone:         { label: "Telefone",      icon: <Phone className="h-4 w-4" /> },
  presencial:       { label: "Presencial",    icon: <Users className="h-4 w-4" /> },
  assembleia:       { label: "Assembleia",    icon: <Building2 className="h-4 w-4" /> },
  processo_interno: { label: "Proc. Interno", icon: <FileText className="h-4 w-4" /> },
  manual:           { label: "Manual",        icon: <FileText className="h-4 w-4" /> },
};

const TIMELINE_TIPO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  criacao:       { label: "Criação",       color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: <FileText className="h-3.5 w-3.5" /> },
  atribuicao:    { label: "Atribuição",    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",       icon: <User className="h-3.5 w-3.5" /> },
  movimentacao:  { label: "Movimentação",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: <Kanban className="h-3.5 w-3.5" /> },
  comentario:    { label: "Comentário",    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",      icon: <MessageSquare className="h-3.5 w-3.5" /> },
  email:         { label: "E-mail",        color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Mail className="h-3.5 w-3.5" /> },
  whatsapp:      { label: "WhatsApp",      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  conclusao:     { label: "Conclusão",     color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: <Check className="h-3.5 w-3.5" /> },
  cancelamento:  { label: "Cancelamento",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",           icon: <X className="h-3.5 w-3.5" /> },
  outro:         { label: "Outro",         color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",      icon: <Tag className="h-3.5 w-3.5" /> },
};

function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string | null | undefined) {
  if (!mimeType) return <File className="h-5 w-5" />;
  if (mimeType.startsWith("image/")) return <FileImage className="h-5 w-5" />;
  if (mimeType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5" />;
}

// ─── Campo Editável ───────────────────────────────────────────────────────────

function CampoEditavel({ label, value, onSave, type = "text" }: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "date" | "textarea";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1">
        {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
        {type === "textarea" ? (
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            autoFocus
          />
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
        )}
        <div className="flex gap-1">
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />Salvar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setDraft(value); setEditing(false); }}>
            <X className="h-3 w-3 mr-1" />Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-muted/50 transition-colors"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {label && <Label className="text-xs text-muted-foreground cursor-pointer">{label}</Label>}
      <p className={`text-sm mt-0.5 ${!value ? "text-muted-foreground italic" : ""}`}>
        {value || `Clique para editar ${label.toLowerCase()}`}
      </p>
    </div>
  );
}

// ─── Aba Anexos ───────────────────────────────────────────────────────────────

function AbaAnexos({ demandaId }: { demandaId: number }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: anexos = [], isLoading } = trpc.juridicoDemandas.getAnexos.useQuery({ demandaId });

  const uploadMutation = trpc.juridicoDemandas.uploadAnexoDemanda.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getAnexos.invalidate({ demandaId });
      toast.success("Anexo enviado com sucesso");
      setUploading(false);
    },
    onError: (e) => {
      toast.error(`Erro ao enviar: ${e.message}`);
      setUploading(false);
    },
  });

  const deleteMutation = trpc.juridicoDemandas.deleteAnexoDemanda.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getAnexos.invalidate({ demandaId });
      toast.success("Anexo removido");
    },
    onError: (e) => toast.error(e.message),
  });

  const processFile = useCallback(async (file: File) => {
    const MAX_SIZE = 16 * 1024 * 1024; // 16MB
    if (file.size > MAX_SIZE) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        demandaId,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        tamanho: file.size,
      });
    };
    reader.readAsDataURL(file);
  }, [demandaId, uploadMutation]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(processFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="p-6 space-y-5">
      {/* Zona de upload */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          }
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Enviando arquivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">
              Imagens, PDFs, documentos Word/Excel — máximo 16MB por arquivo
            </p>
          </div>
        )}
      </div>

      {/* Galeria de anexos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (anexos as any[]).length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum anexo ainda</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {(anexos as any[]).map((anexo: any) => {
            const isImage = anexo.mimeType?.startsWith("image/");
            return (
              <div
                key={anexo.id}
                className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md transition-all"
              >
                {/* Preview */}
                {isImage ? (
                  <div
                    className="aspect-square bg-muted cursor-pointer overflow-hidden"
                    onClick={() => setPreviewUrl(anexo.url)}
                  >
                    <img
                      src={anexo.url}
                      alt={anexo.nome}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    <div className="text-muted-foreground">
                      {getFileIcon(anexo.mimeType)}
                    </div>
                  </div>
                )}

                {/* Info */}
                <div className="p-2">
                  <p className="text-xs font-medium truncate" title={anexo.nome}>{anexo.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(anexo.tamanho ?? 0)}</p>
                </div>

                {/* Ações — aparecem no hover */}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={anexo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-6 w-6 rounded bg-background/90 border flex items-center justify-center hover:bg-background"
                    title="Abrir"
                    onClick={e => e.stopPropagation()}
                  >
                    <Eye className="h-3 w-3" />
                  </a>
                  <a
                    href={anexo.url}
                    download={anexo.nome}
                    className="h-6 w-6 rounded bg-background/90 border flex items-center justify-center hover:bg-background"
                    title="Baixar"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <button
                    className="h-6 w-6 rounded bg-background/90 border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                    title="Remover"
                    onClick={() => {
                      if (confirm("Remover este anexo?")) deleteMutation.mutate({ id: anexo.id });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox simples para imagens */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
            onClick={() => setPreviewUrl(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal Principal ──────────────────────────────────────────────────────────

interface ModalDemandaDetalhesProps {
  demandaId: number | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function ModalDemandaDetalhes({ demandaId, onClose, onDeleted }: ModalDemandaDetalhesProps) {
  const utils = trpc.useUtils();
  const [comentario, setComentario] = useState("");
  const [tipoComentario, setTipoComentario] = useState<"comentario" | "email" | "whatsapp" | "outro">("comentario");
  const [aba, setAba] = useState<"detalhes" | "historico" | "anexos">("detalhes");

  const { data: demanda, isLoading } = trpc.juridicoDemandas.getById.useQuery(
    { id: demandaId! },
    { enabled: demandaId != null }
  );
  const { data: timeline = [] } = trpc.juridicoDemandas.getTimeline.useQuery(
    { demandaId: demandaId! },
    { enabled: demandaId != null }
  );
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();
  const { data: anexos = [] } = trpc.juridicoDemandas.getAnexos.useQuery(
    { demandaId: demandaId! },
    { enabled: demandaId != null }
  );

  const updateMutation = trpc.juridicoDemandas.update.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getById.invalidate({ id: demandaId! });
      utils.juridicoDemandas.listar.invalidate();
      toast.success("Demanda atualizada");
    },
    onError: (e) => toast.error(e.message),
  });

  const moverMutation = trpc.juridicoDemandas.mover.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getById.invalidate({ id: demandaId! });
      utils.juridicoDemandas.listar.invalidate();
      toast.success("Demanda movida");
    },
    onError: (e) => toast.error(e.message),
  });

  const comentarioMutation = trpc.juridicoDemandas.addComentario.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getTimeline.invalidate({ demandaId: demandaId! });
      setComentario("");
      toast.success("Comentário adicionado");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.juridicoDemandas.delete.useMutation({
    onSuccess: () => {
      toast.success("Demanda excluída");
      onClose();
      onDeleted?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleUpdate = (field: string, value: any) => {
    if (!demandaId) return;
    updateMutation.mutate({ id: demandaId, [field]: value });
  };

  const handleEnviarComentario = () => {
    if (!comentario.trim() || !demandaId) return;
    comentarioMutation.mutate({ demandaId, descricao: comentario, tipo: tipoComentario });
  };

  const d = demanda as any;
  const canal = d ? CANAL_CONFIG[d.canal] : null;
  const atrasada = d?.prazo && new Date(d.prazo) < new Date();
  const qtdAnexos = (anexos as any[]).length;

  return (
    <Dialog open={demandaId != null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="!w-[70vw] !max-w-[70vw] h-[90vh] flex flex-col p-0 gap-0">
        {/* Header fixo */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          {isLoading ? (
            <>
              <DialogTitle className="sr-only">Carregando demanda...</DialogTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            </>
          ) : !d ? (
            <DialogTitle className="text-muted-foreground">Demanda não encontrada</DialogTitle>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">{d.numero}</span>
                  <PrioridadeBadge prioridade={d.prioridade} variant="pill" />
                  {atrasada && (
                    <Badge variant="outline" className="text-xs text-red-500 border-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />Em atraso
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-lg font-bold leading-tight">{d.assunto}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Criada em {formatDateTime(d.criadoEm)}
                  {d.condominioNome && <> · <Building2 className="h-3 w-3 inline mx-0.5" />{d.condominioNome}</>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:border-red-300"
                  onClick={() => {
                    if (confirm("Excluir esta demanda? Esta ação não pode ser desfeita.")) {
                      deleteMutation.mutate({ id: demandaId! });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Abas */}
        {d && (
          <div className="flex border-b px-6 shrink-0">
            <button
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${aba === "detalhes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAba("detalhes")}
            >
              Detalhes
            </button>
            <button
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === "historico" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAba("historico")}
            >
              Histórico
              {(timeline as any[]).length > 0 && (
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
                  {(timeline as any[]).length}
                </span>
              )}
            </button>
            <button
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === "anexos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAba("anexos")}
            >
              <Paperclip className="h-3.5 w-3.5" />
              Anexos
              {qtdAnexos > 0 && (
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
                  {qtdAnexos}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Corpo scrollável */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !d ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <p className="text-muted-foreground">Demanda não encontrada</p>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          ) : aba === "detalhes" ? (
            /* ── ABA DETALHES — duas colunas ── */
            <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">

              {/* ── COLUNA ESQUERDA (3/5) ── */}
              <div className="lg:col-span-3 space-y-4">
                {/* Descrição */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Descrição</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CampoEditavel
                      label=""
                      value={d.descricao || ""}
                      type="textarea"
                      onSave={v => handleUpdate("descricao", v)}
                    />
                  </CardContent>
                </Card>

                {/* Cobrança Vinculada */}
                {d.devedorId && (
                  <Card className="border-red-200 dark:border-red-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                        <Scale className="h-4 w-4" />
                        Cobrança Vinculada
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                            {d.nomeDevedor && (
                              <>
                                <span className="text-muted-foreground text-xs">Devedor</span>
                                <span className="font-medium text-xs">{d.nomeDevedor}</span>
                              </>
                            )}
                            {d.unidadeDevedor && (
                              <>
                                <span className="text-muted-foreground text-xs">Unidade</span>
                                <span className="font-medium text-xs">{d.unidadeDevedor}</span>
                              </>
                            )}
                            {d.valorDivida != null && (
                              <>
                                <span className="text-muted-foreground text-xs">Valor</span>
                                <span className="font-semibold text-xs text-red-700 dark:text-red-400">
                                  R$ {(d.valorDivida / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Link href={`/devedores/${d.devedorId}/detalhes`}>
                          <button
                            className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-md px-3 py-2 hover:bg-primary/5 transition-colors"
                            onClick={onClose}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver dashboard do devedor
                          </button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Registrar Atividade */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Registrar Atividade</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Select value={tipoComentario} onValueChange={v => setTipoComentario(v as any)}>
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comentario">Comentário</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="Adicionar comentário ou registro de atividade..."
                      rows={3}
                      value={comentario}
                      onChange={e => setComentario(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleEnviarComentario}
                        disabled={!comentario.trim() || comentarioMutation.isPending}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        {comentarioMutation.isPending ? "Enviando..." : "Registrar"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ── COLUNA DIREITA (2/5) — Metadados ── */}
              <div className="lg:col-span-2 space-y-4">
                {/* Etapa no Kanban */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Etapa no Kanban</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select
                      value={String(d.colunaId)}
                      onValueChange={v => moverMutation.mutate({ id: demandaId!, novaColunaId: Number(v) })}
                      disabled={moverMutation.isPending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(colunas as any[]).map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.icone} {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* Detalhes */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Detalhes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Prioridade */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Prioridade</Label>
                      <Select
                        value={d.prioridade}
                        onValueChange={v => handleUpdate("prioridade", v)}
                      >
                        <SelectTrigger className="mt-0.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORIDADE_CONFIG).map(([k]) => (
                            <SelectItem key={k} value={k}>
                              <PrioridadeBadge prioridade={k} variant="dot" />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Prazo */}
                    <CampoEditavel
                      label="Prazo (SLA)"
                      value={d.prazo ? new Date(d.prazo).toISOString().substring(0, 10) : ""}
                      type="date"
                      onSave={v => handleUpdate("prazo", v || null)}
                    />

                    <Separator />

                    {/* Responsável */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Responsável</Label>
                      <Select
                        value={d.responsavelNome || "__none__"}
                        onValueChange={v => handleUpdate("responsavelNome", v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="mt-0.5 h-8 text-sm">
                          <SelectValue placeholder="Selecione um advogado..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {advogados.map((adv: any) => (
                            <SelectItem key={adv.id} value={adv.name ?? "__none__"}>
                              {adv.name ?? "(sem nome)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Solicitante */}
                    <CampoEditavel
                      label="Solicitante"
                      value={d.solicitante || ""}
                      onSave={v => handleUpdate("solicitante", v)}
                    />

                    <Separator />

                    {/* Canal */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Canal de Origem</Label>
                      <div className="flex items-center gap-2 mt-0.5">
                        {canal?.icon}
                        <span className="text-sm">{canal?.label ?? d.canal}</span>
                      </div>
                    </div>

                    {/* Tipo */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Tipo</Label>
                      <p className="text-sm mt-0.5">{TIPO_LABEL[d.tipo] ?? d.tipo}</p>
                    </div>

                    {/* Condomínio */}
                    {d.condominioNome && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Condomínio</Label>
                        <div className="flex items-center gap-1 mt-0.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{d.condominioNome}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

          ) : aba === "historico" ? (
            /* ── ABA HISTÓRICO ── */
            <div className="p-6 space-y-4">
              {/* Adicionar comentário */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Registrar Atividade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Select value={tipoComentario} onValueChange={v => setTipoComentario(v as any)}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comentario">Comentário</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    placeholder="Adicionar comentário ou registro de atividade..."
                    rows={3}
                    value={comentario}
                    onChange={e => setComentario(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleEnviarComentario}
                      disabled={!comentario.trim() || comentarioMutation.isPending}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      {comentarioMutation.isPending ? "Enviando..." : "Registrar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <div className="space-y-3">
                {(timeline as any[]).length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum evento registrado ainda</p>
                  </div>
                ) : (
                  (timeline as any[]).map((evento: any) => {
                    const tc = TIMELINE_TIPO_CONFIG[evento.tipo] ?? TIMELINE_TIPO_CONFIG.outro;
                    return (
                      <div key={evento.id} className="flex gap-3">
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${tc.color}`}>
                          {tc.icon}
                        </div>
                        <div className="flex-1 min-w-0 pb-3 border-b last:border-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-medium">{tc.label}</span>
                            {evento.usuarioNome && (
                              <span className="text-xs text-muted-foreground">por {evento.usuarioNome}</span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(evento.criadoEm)}</span>
                          </div>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{evento.descricao}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          ) : (
            /* ── ABA ANEXOS ── */
            <AbaAnexos demandaId={demandaId!} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
