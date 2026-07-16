import React, { useState, useRef, useCallback, useEffect } from "react";
import { AbaTarefas } from "@/components/AbaTarefas";
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
import { Progress } from "@/components/ui/progress";
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
  Download, Eye, Bold, Italic, List, ListOrdered, Undo, Redo, Type,
  CheckCircle2, ArrowRight, XCircle, ListTodo,
} from "lucide-react";

// ─── TipTap ───────────────────────────────────────────────────────────────────
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";

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

const TIMELINE_TIPO_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; borderColor: string; icon: React.ReactNode }> = {
  criacao:       { label: "Criação",       bgColor: "bg-green-100 dark:bg-green-900/30",   textColor: "text-green-700 dark:text-green-400",   borderColor: "border-green-300 dark:border-green-700",   icon: <FileText className="h-3.5 w-3.5" /> },
  atribuicao:    { label: "Atribuição",    bgColor: "bg-blue-100 dark:bg-blue-900/30",     textColor: "text-blue-700 dark:text-blue-400",     borderColor: "border-blue-300 dark:border-blue-700",     icon: <User className="h-3.5 w-3.5" /> },
  movimentacao:  { label: "Movimentação",  bgColor: "bg-purple-100 dark:bg-purple-900/30", textColor: "text-purple-700 dark:text-purple-400", borderColor: "border-purple-300 dark:border-purple-700", icon: <ArrowRight className="h-3.5 w-3.5" /> },
  comentario:    { label: "Comentário",    bgColor: "bg-slate-100 dark:bg-slate-800",      textColor: "text-slate-700 dark:text-slate-300",   borderColor: "border-slate-300 dark:border-slate-600",   icon: <MessageSquare className="h-3.5 w-3.5" /> },
  email:         { label: "E-mail",        bgColor: "bg-yellow-100 dark:bg-yellow-900/30", textColor: "text-yellow-700 dark:text-yellow-400", borderColor: "border-yellow-300 dark:border-yellow-700", icon: <Mail className="h-3.5 w-3.5" /> },
  whatsapp:      { label: "WhatsApp",      bgColor: "bg-emerald-100 dark:bg-emerald-900/30", textColor: "text-emerald-700 dark:text-emerald-400", borderColor: "border-emerald-300 dark:border-emerald-700", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  conclusao:     { label: "Conclusão",     bgColor: "bg-green-100 dark:bg-green-900/30",   textColor: "text-green-700 dark:text-green-400",   borderColor: "border-green-300 dark:border-green-700",   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  cancelamento:  { label: "Cancelamento",  bgColor: "bg-red-100 dark:bg-red-900/30",       textColor: "text-red-700 dark:text-red-400",       borderColor: "border-red-300 dark:border-red-700",       icon: <XCircle className="h-3.5 w-3.5" /> },
  outro:         { label: "Outro",         bgColor: "bg-slate-100 dark:bg-slate-800",      textColor: "text-slate-700 dark:text-slate-300",   borderColor: "border-slate-300 dark:border-slate-600",   icon: <Tag className="h-3.5 w-3.5" /> },
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

// ─── Editor de Texto Rico (TipTap) ───────────────────────────────────────────

function EditorDescricao({ value, onSave }: { value: string; onSave: (html: string) => void }) {
  const [editing, setEditing] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: "Clique para adicionar uma descrição..." }),
    ],
    content: value || "",
    editable: editing,
    onUpdate: () => {},
  });

  // Atualizar conteúdo quando value mudar externamente
  useEffect(() => {
    if (editor && !editing) {
      editor.commands.setContent(value || "");
    }
  }, [value, editing, editor]);

  // Habilitar/desabilitar edição
  useEffect(() => {
    if (editor) {
      editor.setEditable(editing);
    }
  }, [editing, editor]);

  const handleSave = () => {
    if (!editor) return;
    onSave(editor.getHTML());
    setEditing(false);
  };

  const handleCancel = () => {
    if (editor) editor.commands.setContent(value || "");
    setEditing(false);
  };

  if (!editor) return null;

  return (
    <div className="space-y-2">
      {/* Toolbar — visível apenas no modo edição */}
      {editing && (
        <div className="flex items-center gap-0.5 p-1 rounded-lg border bg-muted/50 flex-wrap">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-background transition-colors ${editor.isActive("bold") ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
            title="Negrito (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-background transition-colors ${editor.isActive("italic") ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
            title="Itálico (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded hover:bg-background transition-colors ${editor.isActive("underline") ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
            title="Sublinhado (Ctrl+U)"
          >
            <span className="text-xs font-medium underline leading-none px-0.5">U</span>
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-background transition-colors ${editor.isActive("bulletList") ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
            title="Lista com marcadores"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-background transition-colors ${editor.isActive("orderedList") ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
            title="Lista numerada"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 rounded hover:bg-background transition-colors ${editor.isActive("heading", { level: 3 }) ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
            title="Título"
          >
            <Type className="h-3.5 w-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-0.5" />

          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground disabled:opacity-30"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded hover:bg-background transition-colors text-muted-foreground disabled:opacity-30"
            title="Refazer (Ctrl+Y)"
          >
            <Redo className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Área de edição */}
      <div
        className={`
          rounded-lg transition-all
          ${editing
            ? "border-2 border-primary/50 bg-background p-3 min-h-[120px] shadow-sm"
            : "border border-transparent hover:border-muted-foreground/20 hover:bg-muted/30 p-2 cursor-pointer rounded-md group"
          }
        `}
        onClick={() => !editing && setEditing(true)}
      >
        <EditorContent
          editor={editor}
          className={`
            prose prose-sm dark:prose-invert max-w-none focus:outline-none
            [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[80px]
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left
            [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0
            [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5
            [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5
            [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:mt-2
          `}
        />
        {!editing && !value && (
          <p className="text-sm text-muted-foreground italic">Clique para adicionar uma descrição...</p>
        )}
        {!editing && (
          <p className="text-xs text-muted-foreground/50 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Clique para editar
          </p>
        )}
      </div>

      {/* Botões de ação — apenas no modo edição */}
      {editing && (
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 px-3 text-xs" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />Salvar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={handleCancel}>
            <X className="h-3 w-3 mr-1" />Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Campo Editável simples ───────────────────────────────────────────────────

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
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} autoFocus />
        ) : (
          <Input type={type} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
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

// ─── Timeline Visual ──────────────────────────────────────────────────────────

function TimelineVisual({ timeline }: { timeline: any[] }) {
  if (timeline.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-10 w-10 mx-auto mb-3 opacity-25" />
        <p className="text-sm font-medium">Nenhum evento registrado ainda</p>
        <p className="text-xs mt-1">As atividades aparecerão aqui conforme forem registradas</p>
      </div>
    );
  }

  return (
    <div className="relative pl-8">
      {/* Linha vertical da spine */}
      <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

      <div className="space-y-1">
        {timeline.map((evento: any, idx: number) => {
          const tc = TIMELINE_TIPO_CONFIG[evento.tipo] ?? TIMELINE_TIPO_CONFIG.outro;
          const isLast = idx === timeline.length - 1;

          return (
            <div key={evento.id} className="relative">
              {/* Nó circular na spine */}
              <div
                className={`
                  absolute -left-8 top-3 w-7 h-7 rounded-full border-2 flex items-center justify-center z-10
                  ${tc.bgColor} ${tc.textColor} ${tc.borderColor}
                `}
              >
                {tc.icon}
              </div>

              {/* Card do evento */}
              <div className={`
                ml-2 rounded-lg border p-3 mb-3 transition-colors
                ${isLast ? "bg-muted/30" : "bg-card hover:bg-muted/20"}
              `}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${tc.bgColor} ${tc.textColor}`}>
                      {tc.label}
                    </span>
                    {evento.usuarioNome && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {evento.usuarioNome}
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {formatDateTime(evento.criadoEm)}
                  </time>
                </div>
                {evento.descricao && (
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {evento.descricao}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Aba Anexos com Barra de Progresso ───────────────────────────────────────

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

function AbaAnexos({ demandaId }: { demandaId: number }) {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: anexos = [], isLoading } = trpc.juridicoDemandas.getAnexos.useQuery({ demandaId });

  const uploadMutation = trpc.juridicoDemandas.uploadAnexoDemanda.useMutation({
    onSuccess: (_, vars) => {
      utils.juridicoDemandas.getAnexos.invalidate({ demandaId });
    },
    onError: () => {},
  });

  const deleteMutation = trpc.juridicoDemandas.deleteAnexoDemanda.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getAnexos.invalidate({ demandaId });
      toast.success("Anexo removido");
    },
    onError: (e) => toast.error(e.message),
  });

  const processFile = useCallback(async (file: File) => {
    const MAX_SIZE = 16 * 1024 * 1024;
    const itemId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (file.size > MAX_SIZE) {
      toast.error(`"${file.name}" é muito grande. Máximo 16MB.`);
      return;
    }

    // Adicionar à fila com progresso 0
    setUploadQueue(q => [...q, { id: itemId, name: file.name, progress: 0, status: "uploading" }]);

    // Simular progresso animado enquanto lê o arquivo
    const progressInterval = setInterval(() => {
      setUploadQueue(q =>
        q.map(item =>
          item.id === itemId && item.progress < 85
            ? { ...item, progress: item.progress + Math.random() * 15 }
            : item
        )
      );
    }, 200);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      clearInterval(progressInterval);
      setUploadQueue(q => q.map(item => item.id === itemId ? { ...item, progress: 90 } : item));

      await uploadMutation.mutateAsync({
        demandaId,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        tamanho: file.size,
      });

      // Progresso 100% e notificação de sucesso
      setUploadQueue(q => q.map(item => item.id === itemId ? { ...item, progress: 100, status: "done" } : item));
      toast.success(`"${file.name}" enviado com sucesso!`, {
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
        duration: 3000,
      });

      // Remover da fila após 2s
      setTimeout(() => {
        setUploadQueue(q => q.filter(item => item.id !== itemId));
      }, 2000);

    } catch (err: any) {
      clearInterval(progressInterval);
      setUploadQueue(q =>
        q.map(item => item.id === itemId ? { ...item, progress: 100, status: "error", error: err?.message ?? "Erro ao enviar" } : item)
      );
      toast.error(`Erro ao enviar "${file.name}"`);
      setTimeout(() => {
        setUploadQueue(q => q.filter(item => item.id !== itemId));
      }, 4000);
    }
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

  const isUploading = uploadQueue.some(item => item.status === "uploading");

  return (
    <div className="p-6 space-y-5">
      {/* Zona de upload */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${isDragging
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
          }
          ${isUploading ? "pointer-events-none" : ""}
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
        <div className="flex flex-col items-center gap-2">
          <Upload className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground/50"} transition-colors`} />
          <p className="text-sm font-medium">
            {isDragging ? "Solte os arquivos aqui" : "Arraste arquivos aqui ou clique para selecionar"}
          </p>
          <p className="text-xs text-muted-foreground">
            Imagens, PDFs, documentos Word/Excel — máximo 16MB por arquivo
          </p>
        </div>
      </div>

      {/* Fila de uploads com barra de progresso */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          {uploadQueue.map(item => (
            <div key={item.id} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {item.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
                  {item.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                  {item.status === "error" && <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                  <span className="text-xs font-medium truncate">{item.name}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {item.status === "uploading" ? `${Math.round(item.progress)}%` :
                   item.status === "done" ? "Concluído" : "Erro"}
                </span>
              </div>
              <Progress
                value={item.progress}
                className={`h-1.5 ${
                  item.status === "done" ? "[&>div]:bg-green-500" :
                  item.status === "error" ? "[&>div]:bg-red-500" : ""
                }`}
              />
              {item.status === "error" && item.error && (
                <p className="text-xs text-red-500">{item.error}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Galeria de anexos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (anexos as any[]).length === 0 && uploadQueue.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum anexo ainda</p>
          <p className="text-xs mt-1">Arraste arquivos ou clique na área acima para adicionar</p>
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
                {isImage ? (
                  <div
                    className="aspect-square bg-muted cursor-pointer overflow-hidden"
                    onClick={() => setPreviewUrl(anexo.url)}
                  >
                    <img src={anexo.url} alt={anexo.nome} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                  </div>
                ) : (
                  <div className="aspect-square bg-muted flex items-center justify-center">
                    <div className="text-muted-foreground">{getFileIcon(anexo.mimeType)}</div>
                  </div>
                )}
                <div className="p-2">
                  <p className="text-xs font-medium truncate" title={anexo.nome}>{anexo.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(anexo.tamanho ?? 0)}</p>
                </div>
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={anexo.url} target="_blank" rel="noopener noreferrer"
                    className="h-6 w-6 rounded bg-background/90 border flex items-center justify-center hover:bg-background"
                    title="Abrir" onClick={e => e.stopPropagation()}
                  >
                    <Eye className="h-3 w-3" />
                  </a>
                  <a
                    href={anexo.url} download={anexo.nome}
                    className="h-6 w-6 rounded bg-background/90 border flex items-center justify-center hover:bg-background"
                    title="Baixar" onClick={e => e.stopPropagation()}
                  >
                    <Download className="h-3 w-3" />
                  </a>
                  <button
                    className="h-6 w-6 rounded bg-background/90 border flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500"
                    title="Remover"
                    onClick={() => { if (confirm("Remover este anexo?")) deleteMutation.mutate({ id: anexo.id }); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <img
            src={previewUrl} alt="Preview"
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
  const [aba, setAba] = useState<"detalhes" | "historico" | "tarefas" | "anexos">("detalhes");

  const { data: contadoresTarefas } = trpc.juridicoDemandas.tarefas.contadores.useQuery(
    { demandaId: demandaId! },
    { enabled: demandaId != null }
  );

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
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === "tarefas" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAba("tarefas")}
            >
              <ListTodo className="h-3.5 w-3.5" />
              Tarefas
              {contadoresTarefas && contadoresTarefas.total > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none ${
                  contadoresTarefas.pendentes === 0
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}>
                  {contadoresTarefas.concluidas}/{contadoresTarefas.total}
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

                {/* Descrição com editor rico */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Descrição
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EditorDescricao
                      value={d.descricao || ""}
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
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      Registrar Atividade
                    </CardTitle>
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
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Kanban className="h-4 w-4 text-muted-foreground" />
                      Etapa no Kanban
                    </CardTitle>
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
                      <Select value={d.prioridade} onValueChange={v => handleUpdate("prioridade", v)}>
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
                        value={d.responsavelId ? String(d.responsavelId) : "__none__"}
                        onValueChange={v => {
                          if (v === "__none__") {
                            updateMutation.mutate({ id: demandaId!, responsavelId: null, responsavelNome: null });
                          } else {
                            const adv = (advogados as any[]).find((a: any) => String(a.id) === v);
                            if (adv) updateMutation.mutate({ id: demandaId!, responsavelId: adv.id, responsavelNome: adv.name });
                          }
                        }}
                      >
                        <SelectTrigger className="mt-0.5 h-8 text-sm">
                          <SelectValue placeholder="Selecione um advogado..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {(advogados as any[]).map((adv: any) => (
                            <SelectItem key={adv.id} value={String(adv.id)}>
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
            /* ── ABA HISTÓRICO — Timeline visual ── */
            <div className="p-6 space-y-5">
              {/* Registrar nova atividade */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Send className="h-4 w-4 text-muted-foreground" />
                    Registrar Atividade
                  </CardTitle>
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

              {/* Timeline visual */}
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Linha do Tempo
                  {(timeline as any[]).length > 0 && (
                    <span className="text-xs bg-muted rounded-full px-2 py-0.5">
                      {(timeline as any[]).length} evento{(timeline as any[]).length !== 1 ? "s" : ""}
                    </span>
                  )}
                </h3>
                <TimelineVisual timeline={timeline as any[]} />
              </div>
            </div>

          ) : aba === "tarefas" ? (
            /* ── ABA TAREFAS ── */
            <div className="p-6">
              <AbaTarefas demandaId={demandaId!} operadores={advogados as any[]} />
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
