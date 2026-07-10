import React, { useState, useCallback, useMemo, useEffect } from "react";
import { CheckboxConclusao } from "@/components/CheckboxConclusao";
import { PrioridadeBadge, prioridadeBorderClass } from "@/components/PrioridadeBadge";
import { ModalDemandaDetalhes } from "@/components/ModalDemandaDetalhes";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
  closestCorners, rectIntersection,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, List, GripVertical, Clock, AlertTriangle, Building2,
  MessageSquare, Mail, Phone, Globe, Users, FileText, Scale,
  Lock, Settings, Pencil, Trash2, Loader2, CheckCircle2,
  ArrowRight, Inbox, MoreVertical, GripHorizontal, Search, ChevronLeft, X,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CANAL_ICON: Record<string, React.ReactNode> = {
  whatsapp:         <MessageSquare className="h-3 w-3" />,
  email:            <Mail className="h-3 w-3" />,
  portal:           <Globe className="h-3 w-3" />,
  telefone:         <Phone className="h-3 w-3" />,
  presencial:       <Users className="h-3 w-3" />,
  assembleia:       <Building2 className="h-3 w-3" />,
  processo_interno: <FileText className="h-3 w-3" />,
  manual:           <FileText className="h-3 w-3" />,
};

const ICONES_DISPONIVEIS = [
  "📋", "🔍", "📄", "⚖️", "⏳", "🏢", "💬", "📝", "🔄", "📌",
  "🎯", "💡", "🔔", "📊", "🗂️", "✏️", "🔧", "📞", "🤝", "🏛️",
];

function isAtrasada(prazo: string | Date | null | undefined) {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Card Sortável ────────────────────────────────────────────────────────────

function KanbanCard({
  demanda,
  onClick,
  isSaida,
  isOverlay = false,
  onConcluir,
  concluindo,
}: {
  demanda: any;
  onClick: () => void;
  isSaida?: boolean;
  isOverlay?: boolean;
  onConcluir?: (id: number) => void;
  concluindo?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `demanda-${demanda.id}`,
    data: { type: "demanda", demanda, colunaId: demanda.colunaId },
    disabled: isSaida,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0 : 1,
  };

  const prioBorder = prioridadeBorderClass(demanda.prioridade);
  const atrasada = isAtrasada(demanda.prazo);
  const isUrgente = demanda.prioridade === "urgente";

  const dragProps = !isSaida && !isOverlay ? { ...attributes, ...listeners } : {};

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? {} : style}
      className={`bg-card border border-l-4 ${prioBorder} rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all group select-none ${
        isSaida ? "opacity-75 cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${isUrgente ? "ring-1 ring-red-300 dark:ring-red-700" : ""} ${
        isOverlay ? "rotate-2 shadow-2xl opacity-95 scale-105 cursor-grabbing" : ""
      }`}
      {...dragProps}
      onClick={onClick}
    >
      {/* Faixa de prioridade no topo */}
      <PrioridadeBadge prioridade={demanda.prioridade} variant="strip" />

      <div className="flex items-start gap-2 p-3">
        {/* Checkbox de conclusão rápida — só para cards fora da coluna de saída */}
        {onConcluir && !isSaida && !isOverlay && (
          <div className="mt-0.5 flex-shrink-0">
            <CheckboxConclusao
              concluido={false}
              onToggle={() => onConcluir(demanda.id)}
              disabled={concluindo}
              size={18}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <span className="text-xs font-mono text-muted-foreground">{demanda.numero}</span>
            <PrioridadeBadge prioridade={demanda.prioridade} variant="pill" className="text-[10px] px-1.5 py-0.5" />
          </div>
          <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors mb-2">
            {demanda.assunto}
          </p>
          {demanda.condominioNome && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{demanda.condominioNome}</span>
            </div>
          )}
          {demanda.devedorId && demanda.valorDivida != null && (
            <div className="flex items-center gap-1 text-xs mt-1.5 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-700 dark:text-red-400">
              <Scale className="h-3 w-3 flex-shrink-0" />
              <span className="font-medium">
                R$ {(demanda.valorDivida / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </span>
              {demanda.unidadeDevedor && (
                <span className="truncate">— {demanda.unidadeDevedor}</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
            <div className="flex items-center gap-1">
              {CANAL_ICON[demanda.canal]}
              {demanda.responsavelNome ? (
                <span className="truncate max-w-[80px]">{demanda.responsavelNome}</span>
              ) : (
                <span className="text-orange-400 italic">Sem resp.</span>
              )}
            </div>
            {demanda.prazo && (
              <div className={`flex items-center gap-0.5 ${atrasada ? "text-red-500 font-semibold" : ""}`}>
                {atrasada && <AlertTriangle className="h-3 w-3" />}
                <Clock className="h-3 w-3" />
                {formatDate(demanda.prazo)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Placeholder de Drop ──────────────────────────────────────────────────────

function DropPlaceholder() {
  return (
    <div className="h-20 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center text-xs text-primary/60 font-medium">
      Soltar aqui
    </div>
  );
}

// ─── Coluna Kanban ────────────────────────────────────────────────────────────

function KanbanColuna({
  coluna,
  demandas,
  onNovaDemanda,
  onClickDemanda,
  onGerenciar,
  isDragOver,
  activeId,
  onConcluir,
  concluindoId,
  collapsed,
  onToggleCollapse,
}: {
  coluna: any;
  demandas: any[];
  onNovaDemanda: (colunaId: number) => void;
  onClickDemanda: (id: number) => void;
  onGerenciar?: () => void;
  isDragOver: boolean;
  activeId: string | null;
  onConcluir?: (id: number) => void;
  concluindoId?: number | null;
  collapsed?: boolean;
  onToggleCollapse: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `coluna-${coluna.id}`,
    data: { type: "coluna", colunaId: coluna.id },
    disabled: coluna.tipo !== "intermediaria",
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
  };

  const atrasadas = demandas.filter(d => isAtrasada(d.prazo)).length;
  const isEntrada = coluna.tipo === "entrada";
  const isSaida = coluna.tipo === "saida";
  const isFixa = isEntrada || isSaida;

  // Coluna colapsada
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex flex-col items-center w-12 shrink-0 rounded-xl border bg-card shadow-sm cursor-pointer hover:bg-muted/30 transition-colors py-3 gap-2"
        onClick={onToggleCollapse}
        title={`Expandir: ${coluna.nome} (${demandas.length})`}
      >
        <span className="text-base">{coluna.icone}</span>
        <Badge variant="secondary" className="text-xs px-1 py-0 h-5 w-full justify-center">{demandas.length}</Badge>
        {atrasadas > 0 && (
          <Badge variant="destructive" className="text-xs px-1 py-0 h-5 w-full justify-center">{atrasadas}</Badge>
        )}
        <div className="flex-1" />
        <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
      </div>
    );
  }

  const headerStyle = isEntrada
    ? "bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800"
    : isSaida
    ? "bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800"
    : "border-b";

  const headerTextStyle = isEntrada
    ? "text-blue-700 dark:text-blue-300"
    : isSaida
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-foreground";

  const columnBorder = isDragOver
    ? isEntrada
      ? "border-blue-400 ring-2 ring-blue-300/50 dark:ring-blue-600/50"
      : isSaida
      ? "border-emerald-400 ring-2 ring-emerald-300/50 dark:ring-emerald-600/50"
      : "border-primary ring-2 ring-primary/30"
    : "border-border";

  // IDs dos cards na coluna para SortableContext
  const cardIds = demandas.map(d => `demanda-${d.id}`);

  // Detectar se há um card sendo arrastado sobre esta coluna (para mostrar placeholder)
  const isDraggingCard = activeId?.startsWith("demanda-");
  const activeDemandaId = isDraggingCard ? Number(activeId!.replace("demanda-", "")) : null;
  const isActiveInThisColumn = activeDemandaId
    ? demandas.some(d => d.id === activeDemandaId)
    : false;
  const showPlaceholder = isDragOver && isDraggingCard && !isActiveInThisColumn;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col w-72 shrink-0 rounded-xl border bg-card shadow-sm transition-all duration-150 ${columnBorder} ${
        isDragOver ? "bg-muted/30" : ""
      }`}
    >
      {/* Header da coluna */}
      <div className={`px-3 py-2.5 rounded-t-xl ${headerStyle}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {/* Handle de arrastar coluna — só para colunas intermediárias */}
            {!isFixa && (
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0"
              >
                <GripHorizontal className="h-3.5 w-3.5" />
              </div>
            )}
            {isFixa && <Lock className={`h-3.5 w-3.5 shrink-0 ${isEntrada ? "text-blue-400" : "text-emerald-400"}`} />}
            <span className="text-sm">{coluna.icone}</span>
            <span className={`text-sm font-semibold truncate ${headerTextStyle}`}>{coluna.nome}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Botão de colapso */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="Minimizar coluna"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <Badge
              variant="secondary"
              className={`text-xs px-1.5 py-0 h-5 ${
                isEntrada ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : isSaida ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                : ""
              }`}
            >
              {demandas.length}
            </Badge>
            {atrasadas > 0 && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">
                {atrasadas} ⚠
              </Badge>
            )}
            {!isFixa && onGerenciar && (
              <button
                onClick={onGerenciar}
                className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {isEntrada && (
          <p className="text-[10px] text-blue-500/70 dark:text-blue-400/60 mt-0.5">
            Entrada automática de novas demandas
          </p>
        )}
        {isSaida && (
          <p className="text-[10px] text-emerald-500/70 dark:text-emerald-400/60 mt-0.5">
            Mover aqui encerra a demanda
          </p>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          <div className="p-2 space-y-2 min-h-[80px]">
            {showPlaceholder && <DropPlaceholder />}
            {demandas.map((d) => (
              <KanbanCard
                key={d.id}
                demanda={d}
                onClick={() => onClickDemanda(d.id)}
                isSaida={isSaida}
                onConcluir={onConcluir}
                concluindo={concluindoId === d.id}
              />
            ))}
            {demandas.length === 0 && !showPlaceholder && (
              <div className="h-16 flex items-center justify-center text-xs text-muted-foreground/50 italic">
                {isSaida ? "Nenhuma demanda concluída" : "Arraste cards aqui"}
              </div>
            )}
          </div>
        </SortableContext>
      </div>

      {/* Footer: botão de nova demanda */}
      {!isSaida && (
        <div className="p-2 border-t">
          <button
            onClick={() => onNovaDemanda(coluna.id)}
            className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg px-2 py-1.5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar demanda
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal: Gerenciar Colunas ─────────────────────────────────────────────────

function ModalGerenciarColunas({
  open,
  onClose,
  colunas,
  onRefresh,
  targetUserId,
  targetUserName,
}: {
  open: boolean;
  onClose: () => void;
  colunas: any[];
  onRefresh: () => void;
  targetUserId?: number;
  targetUserName?: string;
}) {
  const [novoNome, setNovoNome] = useState("");
  const [novoIcone, setNovoIcone] = useState("📋");
  const [editando, setEditando] = useState<{ id: number; nome: string; icone: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const utils = trpc.useUtils();

  const createColuna = trpc.juridicoDemandas.createColuna.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getColunas.invalidate();
      onRefresh();
      setNovoNome("");
      setNovoIcone("📋");
      toast.success("Coluna criada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateColuna = trpc.juridicoDemandas.updateColuna.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getColunas.invalidate();
      onRefresh();
      setEditando(null);
      toast.success("Coluna atualizada!");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteColuna = trpc.juridicoDemandas.deleteColuna.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getColunas.invalidate();
      onRefresh();
      setConfirmDelete(null);
      toast.success("Coluna excluída. Demandas movidas para Demandas Recebidas.");
    },
    onError: (e) => toast.error(e.message),
  });

  const colunasIntermedias = colunas.filter(c => c.tipo === "intermediaria");
  const colunaEntrada = colunas.find(c => c.tipo === "entrada");
  const colunaSaida = colunas.find(c => c.tipo === "saida");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {targetUserName
              ? `Etapas de ${targetUserName}`
              : "Gerenciar Colunas do Kanban"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Colunas fixas (informativo) */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Colunas Fixas do Sistema
            </p>
            <div className="space-y-1.5">
              {colunaEntrada && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <span>{colunaEntrada.icone}</span>
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-400 flex-1">{colunaEntrada.nome}</span>
                  <Lock className="h-3.5 w-3.5 text-blue-400" />
                  <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Entrada</Badge>
                </div>
              )}
              {colunaSaida && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                  <span>{colunaSaida.icone}</span>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex-1">{colunaSaida.nome}</span>
                  <Lock className="h-3.5 w-3.5 text-emerald-400" />
                  <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Saída</Badge>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Estas colunas são obrigatórias e não podem ser excluídas ou renomeadas.
            </p>
          </div>

          {/* Colunas intermediárias */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              {targetUserName ? `Etapas de ${targetUserName}` : "Minhas Etapas"} ({colunasIntermedias.length})
            </p>
            <p className="text-xs text-muted-foreground -mt-1 mb-2">
              {targetUserName
                ? `Você está gerenciando as etapas do advogado ${targetUserName}. Alterações afetam apenas este usuário.`
                : "Estas etapas são exclusivas do seu usuário. Cada advogado pode configurar seu próprio fluxo."}
            </p>
            {colunasIntermedias.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg">
                Nenhuma etapa intermediária. Crie abaixo.
              </div>
            ) : (
              <div className="space-y-1.5">
                {colunasIntermedias.map((col) => (
                  <div key={col.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40 border group">
                    <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/40" />
                    <span>{col.icone}</span>
                    {editando?.id === col.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex gap-1 flex-wrap">
                          {ICONES_DISPONIVEIS.slice(0, 10).map(ic => (
                            <button
                              key={ic}
                              onClick={() => setEditando(e => e ? { ...e, icone: ic } : null)}
                              className={`text-sm p-0.5 rounded hover:bg-muted ${editando?.icone === ic ? "ring-1 ring-primary" : ""}`}
                            >
                              {ic}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={editando?.nome ?? ""}
                          onChange={e => setEditando(prev => prev ? { ...prev, nome: e.target.value } : null)}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter" && editando) updateColuna.mutate({ id: editando.id, nome: editando.nome, icone: editando.icone, ...(targetUserId ? { targetUserId } : {}) });
                            if (e.key === "Escape") setEditando(null);
                          }}
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => editando && updateColuna.mutate({ id: editando.id, nome: editando.nome, icone: editando.icone, ...(targetUserId ? { targetUserId } : {}) })} disabled={updateColuna.isPending}>
                          {updateColuna.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditando(null)}>✕</Button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm flex-1">{col.nome}</span>
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setEditando({ id: col.id, nome: col.nome, icone: col.icone })}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmDelete(col)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Criar nova coluna */}
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nova Etapa Intermediária
            </p>
            <div className="flex gap-1 flex-wrap">
              {ICONES_DISPONIVEIS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setNovoIcone(ic)}
                  className={`text-sm p-1 rounded hover:bg-muted ${novoIcone === ic ? "ring-1 ring-primary bg-muted" : ""}`}
                >
                  {ic}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Ex: Em Audiência, Aguardando Cliente..."
                className="flex-1"
                onKeyDown={e => {
                  if (e.key === "Enter" && novoNome.trim()) {
                    createColuna.mutate({ nome: novoNome.trim(), icone: novoIcone, ...(targetUserId ? { targetUserId } : {}) });
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (!novoNome.trim()) return;
                  createColuna.mutate({ nome: novoNome.trim(), icone: novoIcone, ...(targetUserId ? { targetUserId } : {}) });
                }}
                disabled={!novoNome.trim() || createColuna.isPending}
                className="shrink-0"
              >
                {createColuna.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir coluna "{confirmDelete?.nome}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            As demandas desta coluna serão movidas automaticamente para <strong>Demandas Recebidas</strong>. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteColuna.mutate({ id: confirmDelete.id, ...(targetUserId ? { targetUserId } : {}) })}
              disabled={deleteColuna.isPending}
            >
              {deleteColuna.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function KanbanDemandas() {
  const [, navigate] = useLocation();
  const [activeDemanda, setActiveDemanda] = useState<any>(null);
  const [activeColuna, setActiveColuna] = useState<any>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overColunaId, setOverColunaId] = useState<number | null>(null);
  const [modalGerenciar, setModalGerenciar] = useState(false);
  const [filtroAdvogadoId, setFiltroAdvogadoId] = useState<number | null>(null);
  const [modalDemandaId, setModalDemandaId] = useState<number | null>(null);
  const [concluindoId, setConcluindoId] = useState<number | null>(null);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todos");
  const [filtroPrazo, setFiltroPrazo] = useState("todos");
  const [colunasColapsadas, setColunasColapsadas] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("kanban-demandas-collapsed");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  function toggleColapsarColuna(colunaId: number) {
    setColunasColapsadas(prev => {
      const next = new Set(prev);
      if (next.has(colunaId)) next.delete(colunaId);
      else next.add(colunaId);
      localStorage.setItem("kanban-demandas-collapsed", JSON.stringify(Array.from(next)));
      return next;
    });
  }
  const utils = trpc.useUtils();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Advogados disponíveis para filtro (apenas admin)
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery(undefined, {
    enabled: isAdmin,
  });

  // targetUserId: quando admin filtra por advogado, gerencia as etapas desse advogado
  const targetUserId = (isAdmin && filtroAdvogadoId) ? filtroAdvogadoId : undefined;
  const targetUserName = targetUserId
    ? (advogados as any[]).find((a: any) => a.id === targetUserId)?.name
    : undefined;

  // Seed automático: cria as colunas padrão na primeira vez
  const seedMutation = trpc.juridicoDemandas.seedColunas.useMutation();
  const { data: colunasRaw = [], refetch: refetchColunas } = trpc.juridicoDemandas.getColunas.useQuery(
    targetUserId ? { targetUserId } : undefined,
    {
      onSuccess: (data: any[]) => {
        if (data.length === 0) seedMutation.mutate(targetUserId ? { targetUserId } : undefined);
      },
    } as any
  );

  // Estado local das colunas para reordenamento otimista
  const [colunasOrdem, setColunasOrdem] = useState<any[]>([]);
  const colunas = colunasOrdem.length > 0 ? colunasOrdem : (colunasRaw as any[]);

  // Sincronizar quando dados do servidor chegam
  React.useEffect(() => {
    if ((colunasRaw as any[]).length > 0) {
      setColunasOrdem(colunasRaw as any[]);
    }
  }, [colunasRaw]);

  const { data: demandasRaw = [], isLoading, refetch: refetchDemandas } = trpc.juridicoDemandas.listar.useQuery(
    filtroAdvogadoId ? { responsavelId: filtroAdvogadoId } : undefined
  );

  // Estado local das demandas para reordenamento otimista
  const [demandasOrdem, setDemandasOrdem] = useState<any[]>([]);
  const demandas = demandasOrdem.length > 0 ? demandasOrdem : (demandasRaw as any[]);

  React.useEffect(() => {
    if ((demandasRaw as any[]).length > 0) {
      setDemandasOrdem(demandasRaw as any[]);
    }
  }, [demandasRaw]);

  const moverMutation = trpc.juridicoDemandas.mover.useMutation({
    onError: (e) => {
      toast.error(e.message);
      refetchDemandas();
    },
  });

  function handleConcluirDemanda(id: number) {
    const colunaSaida = colunas.find((c: any) => c.tipo === "saida");
    if (!colunaSaida) {
      toast.error("Nenhuma coluna de saída configurada.");
      return;
    }
    const demanda = demandas.find((d: any) => d.id === id);
    if (!demanda || demanda.colunaId === colunaSaida.id) return;
    setConcluindoId(id);
    // Optimistic update
    setDemandasOrdem((prev) =>
      prev.map((d: any) => d.id === id ? { ...d, colunaId: colunaSaida.id } : d)
    );
    moverMutation.mutate(
      { id, novaColunaId: colunaSaida.id, novaOrdem: 0 },
      {
        onSuccess: () => {
          toast.success("✅ Demanda concluída!");
          setConcluindoId(null);
          refetchDemandas();
        },
        onError: () => {
          setConcluindoId(null);
          refetchDemandas();
        },
      }
    );
  }

  const reordenarDemandaMutation = trpc.juridicoDemandas.reordenarDemandas.useMutation({
    onError: () => refetchDemandas(),
  });

  const reordenarColunasMutation = trpc.juridicoDemandas.reordenarColunas.useMutation({
    onError: () => refetchColunas(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Demandas filtradas
  const demandasFiltradas = useMemo(() => {
    let lista = demandas as any[];
    if (filtroBusca.trim()) {
      const q = filtroBusca.toLowerCase();
      lista = lista.filter((d: any) =>
        d.assunto?.toLowerCase().includes(q) ||
        d.numero?.toLowerCase().includes(q) ||
        d.condominioNome?.toLowerCase().includes(q)
      );
    }
    if (filtroPrioridade !== "todos") {
      lista = lista.filter((d: any) => d.prioridade === filtroPrioridade);
    }
    if (filtroPrazo !== "todos") {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);
      const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000 - 1);
      lista = lista.filter((d: any) => {
        if (!d.prazo) return filtroPrazo === "sem_prazo";
        const prazoDate = new Date(d.prazo);
        if (filtroPrazo === "atrasados") return prazoDate < startOfToday;
        if (filtroPrazo === "hoje") return prazoDate >= startOfToday && prazoDate <= endOfToday;
        if (filtroPrazo === "semana") return prazoDate > endOfToday && prazoDate <= endOfWeek;
        return true;
      });
    }
    return lista;
  }, [demandas, filtroBusca, filtroPrioridade, filtroPrazo]);

  const demandasPorColuna = useCallback((colunaId: number) => {
    return demandasFiltradas.filter((d: any) => d.colunaId === colunaId);
  }, [demandasFiltradas]);

  // Encontrar colunaId a partir de um over id
  const getColunaIdFromOver = useCallback((overId: string): number | null => {
    if (overId.startsWith("coluna-")) return Number(overId.replace("coluna-", ""));
    if (overId.startsWith("demanda-")) {
      const demandaId = Number(overId.replace("demanda-", ""));
      const d = demandas.find((x: any) => x.id === demandaId);
      return d?.colunaId ?? null;
    }
    return null;
  }, [demandas]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = String(active.id);
    setActiveId(id);
    if (active.data.current?.type === "demanda") {
      setActiveDemanda(active.data.current.demanda);
      setActiveColuna(null);
    } else if (active.data.current?.type === "coluna") {
      setActiveColuna(colunas.find((c: any) => c.id === active.data.current?.colunaId) ?? null);
      setActiveDemanda(null);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over, active } = event;
    if (!over) { setOverColunaId(null); return; }

    const overId = String(over.id);
    const activeType = active.data.current?.type;

    if (activeType === "demanda") {
      const novaColunaId = getColunaIdFromOver(overId);
      setOverColunaId(novaColunaId);

      // Reordenamento otimista ao arrastar sobre outro card na mesma coluna
      if (overId.startsWith("demanda-")) {
        const activeCardId = Number(String(active.id).replace("demanda-", ""));
        const overCardId = Number(overId.replace("demanda-", ""));
        if (activeCardId !== overCardId) {
          const activeCard = demandas.find((d: any) => d.id === activeCardId);
          const overCard = demandas.find((d: any) => d.id === overCardId);
          if (activeCard && overCard && activeCard.colunaId === overCard.colunaId) {
            const colDemandas = demandas.filter((d: any) => d.colunaId === activeCard.colunaId);
            const oldIndex = colDemandas.findIndex((d: any) => d.id === activeCardId);
            const newIndex = colDemandas.findIndex((d: any) => d.id === overCardId);
            if (oldIndex !== -1 && newIndex !== -1) {
              const reordered = arrayMove(colDemandas, oldIndex, newIndex);
              setDemandasOrdem(prev => {
                const others = prev.filter((d: any) => d.colunaId !== activeCard.colunaId);
                return [...others, ...reordered];
              });
            }
          }
        }
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const prevActiveDemanda = activeDemanda;
    const prevActiveColuna = activeColuna;

    setActiveDemanda(null);
    setActiveColuna(null);
    setActiveId(null);
    setOverColunaId(null);

    if (!over) return;

    const overId = String(over.id);
    const activeType = active.data.current?.type;

    // ── Arrastar CARD ──────────────────────────────────────────────────────
    if (activeType === "demanda" && prevActiveDemanda) {
      const novaColunaId = getColunaIdFromOver(overId);
      if (!novaColunaId) return;

      const mudouColuna = novaColunaId !== prevActiveDemanda.colunaId;

      if (mudouColuna) {
        // Mover para outra coluna
        const colunaDestino = colunas.find((c: any) => c.id === novaColunaId);
        if (colunaDestino?.tipo === "saida") {
          toast.info(`Demanda movida para "${colunaDestino.nome}" — será marcada como concluída`, { duration: 3000 });
        }

        // Calcular nova ordem: inserir no final da coluna destino
        const demandasDestino = demandas.filter((d: any) => d.colunaId === novaColunaId);
        const novaOrdem = demandasDestino.length;

        // Optimistic update
        setDemandasOrdem(prev =>
          prev.map((d: any) => d.id === prevActiveDemanda.id ? { ...d, colunaId: novaColunaId, ordemColuna: novaOrdem } : d)
        );

        moverMutation.mutate({ id: prevActiveDemanda.id, novaColunaId, novaOrdem });
      } else {
        // Reordenar dentro da mesma coluna — estado já atualizado no dragOver
        const colDemandas = demandas.filter((d: any) => d.colunaId === prevActiveDemanda.colunaId);
        const ids = colDemandas.map((d: any) => d.id);
        reordenarDemandaMutation.mutate({ ids });
      }
    }

    // ── Arrastar COLUNA ────────────────────────────────────────────────────
    if (activeType === "coluna" && prevActiveColuna) {
      if (!overId.startsWith("coluna-")) return;
      const overColunaId = Number(overId.replace("coluna-", ""));
      if (prevActiveColuna.id === overColunaId) return;

      // Só reordena colunas intermediárias
      const intermediarias = colunas.filter((c: any) => c.tipo === "intermediaria");
      const oldIndex = intermediarias.findIndex((c: any) => c.id === prevActiveColuna.id);
      const newIndex = intermediarias.findIndex((c: any) => c.id === overColunaId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(intermediarias, oldIndex, newIndex);
      const entrada = colunas.find((c: any) => c.tipo === "entrada");
      const saida = colunas.find((c: any) => c.tipo === "saida");
      const novaOrdem = [
        ...(entrada ? [entrada] : []),
        ...reordered,
        ...(saida ? [saida] : []),
      ];
      setColunasOrdem(novaOrdem);
      reordenarColunasMutation.mutate({
        colunaIds: reordered.map((c: any) => c.id),
        ...(targetUserId ? { targetUserId } : {}),
      } as any);
    }
  };

  // Estatísticas rápidas
  const totalDemandas = (demandas as any[]).length;
  const colunaEntrada = colunas.find((c: any) => c.tipo === "entrada");
  const colunaSaida = colunas.find((c: any) => c.tipo === "saida");
  const demandasRecebidas = colunaEntrada ? (demandas as any[]).filter((d: any) => d.colunaId === colunaEntrada.id).length : 0;
  const demandasResolvidas = colunaSaida ? (demandas as any[]).filter((d: any) => d.colunaId === colunaSaida.id).length : 0;
  const demandasAtrasadas = (demandas as any[]).filter((d: any) => isAtrasada(d.prazo)).length;
  const totalUrgentes = (demandas as any[]).filter((d: any) => d.prioridade === "urgente").length;

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Carregando Kanban...
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Kanban Jurídico</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span>{totalDemandas} demandas no total</span>
            {demandasRecebidas > 0 && (
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <Inbox className="h-3.5 w-3.5" />
                {demandasRecebidas} recebidas
              </span>
            )}
            {demandasResolvidas > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {demandasResolvidas} resolvidas
              </span>
            )}
            {demandasAtrasadas > 0 && (
              <span className="flex items-center gap-1 text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {demandasAtrasadas} atrasadas
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtro por advogado — apenas admin */}
          {isAdmin && (
            <Select
              value={filtroAdvogadoId ? String(filtroAdvogadoId) : "todos"}
              onValueChange={(v) => setFiltroAdvogadoId(v === "todos" ? null : Number(v))}
            >
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue placeholder="Filtrar por advogado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os advogados</SelectItem>
                {(advogados as any[]).map((adv: any) => (
                  <SelectItem key={adv.id} value={String(adv.id)}>
                    <span className="truncate">{adv.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setModalGerenciar(true)}
          >
            <Settings className="h-4 w-4 mr-1.5" />
            Gerenciar Colunas
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/juridico")}>
            <List className="h-4 w-4 mr-1.5" />
            Ver Lista
          </Button>
          <Button size="sm" onClick={() => navigate("/admin/juridico?nova=1")}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nova Demanda
          </Button>
        </div>
      </div>

      {/* Filtros rápidos */}
      {(() => {
        const qtdFiltros = (filtroBusca.trim() ? 1 : 0) + (filtroPrioridade !== "todos" ? 1 : 0) + (filtroPrazo !== "todos" ? 1 : 0);
        const temFiltro = qtdFiltros > 0;
        return (
      <div className={`flex flex-wrap items-center gap-2 mb-3 rounded-xl px-3 py-2.5 border transition-all duration-200 ${temFiltro ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "bg-muted/30 border-border/50"}`}>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors duration-200 ${filtroBusca.trim() ? "text-primary" : "text-muted-foreground"}`} />
          <input
            type="text"
            placeholder="Buscar demanda..."
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
            className={`w-full pl-8 pr-8 h-8 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 transition-all duration-200 ${filtroBusca.trim() ? "border-primary ring-1 ring-primary/40 bg-primary/5 focus:ring-primary" : "border-input focus:ring-primary"}`}
          />
          {filtroBusca && (
            <button onClick={() => setFiltroBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
          <SelectTrigger className={`w-36 h-8 text-xs transition-all duration-200 ${filtroPrioridade !== "todos" ? "border-primary ring-1 ring-primary/40 bg-primary/5 text-primary font-medium" : ""}`}>
            {filtroPrioridade !== "todos" && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0 inline-block" />}
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas prioridades</SelectItem>
            <SelectItem value="urgente">🔴 Urgente {totalUrgentes > 0 ? `(${totalUrgentes})` : ""}</SelectItem>
            <SelectItem value="alta">🟠 Alta</SelectItem>
            <SelectItem value="media">🟡 Média</SelectItem>
            <SelectItem value="baixa">🟢 Baixa</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroPrazo} onValueChange={setFiltroPrazo}>
          <SelectTrigger className={`w-36 h-8 text-xs transition-all duration-200 ${filtroPrazo !== "todos" ? "border-primary ring-1 ring-primary/40 bg-primary/5 text-primary font-medium" : ""}`}>
            {filtroPrazo !== "todos" && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0 inline-block" />}
            <SelectValue placeholder="Prazo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os prazos</SelectItem>
            <SelectItem value="atrasados">⚠️ Atrasados {demandasAtrasadas > 0 ? `(${demandasAtrasadas})` : ""}</SelectItem>
            <SelectItem value="hoje">📅 Vencem hoje</SelectItem>
            <SelectItem value="semana">📆 Esta semana</SelectItem>
            <SelectItem value="sem_prazo">— Sem prazo</SelectItem>
          </SelectContent>
        </Select>
        {temFiltro && (
          <button
            onClick={() => { setFiltroBusca(""); setFiltroPrioridade("todos"); setFiltroPrazo("todos"); }}
            className="flex items-center gap-1.5 text-xs text-destructive border border-destructive/30 hover:bg-destructive/10 px-2.5 h-8 rounded-full transition-all font-medium"
          >
            <X className="h-3 w-3" />
            Limpar
            <span className="bg-destructive text-white rounded-full px-1.5 py-0 text-[9px] font-bold">{qtdFiltros}</span>
          </button>
        )}
      </div>
        );
      })()}

      {/* Legenda do fluxo */}
      <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border">
        <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <Inbox className="h-3.5 w-3.5" />
          <span className="font-medium">Demandas Recebidas</span>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="italic">Etapas configuráveis pela equipe</span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-medium">Demandas Resolvidas</span>
        </div>
        <span className="ml-auto flex items-center gap-1">
          <GripHorizontal className="h-3 w-3" />
          Arraste colunas intermediárias para reordenar
        </span>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={colunas.map((c: any) => `coluna-${c.id}`)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {colunas.map((col: any) => (
              <KanbanColuna
                key={col.id}
                coluna={col}
                demandas={demandasPorColuna(col.id)}
                onNovaDemanda={(colunaId) => navigate(`/admin/juridico?nova=1&coluna=${colunaId}`)}
                onClickDemanda={(id) => setModalDemandaId(id)}
                onGerenciar={() => setModalGerenciar(true)}
                isDragOver={overColunaId === col.id}
                activeId={activeId}
                onConcluir={handleConcluirDemanda}
                concluindoId={concluindoId}
                collapsed={colunasColapsadas.has(col.id)}
                onToggleCollapse={() => toggleColapsarColuna(col.id)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
          {activeDemanda && (
            <KanbanCard demanda={activeDemanda} onClick={() => {}} isOverlay />
          )}
          {activeColuna && !activeDemanda && (
            <div className="w-72 rounded-xl border bg-card shadow-2xl opacity-90 rotate-1 scale-105">
              <div className="px-3 py-2.5 border-b rounded-t-xl bg-muted/50">
                <div className="flex items-center gap-2">
                  <span>{activeColuna.icone}</span>
                  <span className="text-sm font-semibold">{activeColuna.nome}</span>
                </div>
              </div>
              <div className="p-2 text-xs text-muted-foreground/50 italic text-center py-4">
                Reordenando coluna...
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modal de detalhes da demanda */}
      <ModalDemandaDetalhes
        demandaId={modalDemandaId}
        onClose={() => setModalDemandaId(null)}
        onDeleted={() => refetchDemandas()}
      />

      {/* Modal de gerenciamento de colunas */}
      <ModalGerenciarColunas
        open={modalGerenciar}
        onClose={() => setModalGerenciar(false)}
        colunas={colunas as any[]}
        onRefresh={() => {
          refetchColunas();
          refetchDemandas();
        }}
        targetUserId={targetUserId}
        targetUserName={targetUserName}
      />
    </div>
  );
}
