import { useState, useCallback } from "react";
import { PrioridadeBadge, prioridadeBorderClass } from "@/components/PrioridadeBadge";
import { useLocation } from "wouter";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Plus, List, GripVertical, Clock, AlertTriangle, Building2,
  MessageSquare, Mail, Phone, Globe, Users, FileText, Scale,
  Lock, Settings, Pencil, Trash2, Loader2, CheckCircle2,
  ArrowRight, Inbox, MoreVertical, GripHorizontal,
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

function KanbanCard({ demanda, onClick, isSaida }: {
  demanda: any;
  onClick: () => void;
  isSaida?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `demanda-${demanda.id}`,
    data: { type: "demanda", demanda },
    disabled: isSaida, // cards na coluna de saída não são arrastáveis de volta
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const prioBorder = prioridadeBorderClass(demanda.prioridade);
  const atrasada = isAtrasada(demanda.prazo);
  const isUrgente = demanda.prioridade === "urgente";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border border-l-4 ${prioBorder} rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer group ${
        isSaida ? "opacity-75" : ""
      } ${isUrgente ? "ring-1 ring-red-300 dark:ring-red-700" : ""}`}
      onClick={onClick}
    >
      {/* Faixa de prioridade no topo */}
      <PrioridadeBadge prioridade={demanda.prioridade} variant="strip" />

      <div className="flex items-start gap-1 p-3">
        {!isSaida && (
          <div
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
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

// ─── Coluna Kanban ────────────────────────────────────────────────────────────

function KanbanColuna({
  coluna,
  demandas,
  onNovaDemanda,
  onClickDemanda,
  onEditColuna,
  onDeleteColuna,
}: {
  coluna: any;
  demandas: any[];
  onNovaDemanda: (colunaId: number) => void;
  onClickDemanda: (id: number) => void;
  onEditColuna?: (coluna: any) => void;
  onDeleteColuna?: (coluna: any) => void;
}) {
  const { setNodeRef } = useSortable({
    id: `coluna-${coluna.id}`,
    data: { type: "coluna", colunaId: coluna.id },
  });

  const atrasadas = demandas.filter(d => isAtrasada(d.prazo)).length;
  const isEntrada = coluna.tipo === "entrada";
  const isSaida = coluna.tipo === "saida";
  const isFixa = isEntrada || isSaida;

  // Estilos diferenciados por tipo de coluna
  const headerStyle = isEntrada
    ? "bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800"
    : isSaida
    ? "bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-800"
    : "border-b";

  const containerStyle = isEntrada
    ? "bg-blue-50/50 dark:bg-blue-950/10 border border-blue-200 dark:border-blue-800/50"
    : isSaida
    ? "bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-800/50"
    : "bg-muted/30 border";

  const titleStyle = isEntrada
    ? "text-blue-700 dark:text-blue-400"
    : isSaida
    ? "text-emerald-700 dark:text-emerald-400"
    : "";

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col ${containerStyle} rounded-xl min-w-[280px] max-w-[280px] h-full`}
    >
      {/* Header da coluna */}
      <div className={`flex items-center justify-between p-3 ${headerStyle} rounded-t-xl`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base shrink-0">{coluna.icone}</span>
          <span className={`font-semibold text-sm truncate ${titleStyle}`}>{coluna.nome}</span>
          <Badge variant="secondary" className="text-xs shrink-0">{demandas.length}</Badge>
          {atrasadas > 0 && (
            <Badge variant="outline" className="text-xs text-red-500 border-red-200 shrink-0">
              {atrasadas}⚠
            </Badge>
          )}
          {isFixa && (
            <Lock className={`h-3 w-3 shrink-0 ${isEntrada ? "text-blue-400" : "text-emerald-400"}`} aria-label="Coluna fixa do sistema" />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {!isSaida && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onNovaDemanda(coluna.id)}
              title="Nova demanda"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          {!isFixa && (onEditColuna || onDeleteColuna) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEditColuna && (
                  <DropdownMenuItem onClick={() => onEditColuna(coluna)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Renomear
                  </DropdownMenuItem>
                )}
                {onDeleteColuna && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDeleteColuna(coluna)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Excluir coluna
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Legenda da coluna fixa */}
      {isEntrada && (
        <div className="px-3 py-1.5 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900">
          Toda nova demanda entra aqui automaticamente
        </div>
      )}
      {isSaida && (
        <div className="px-3 py-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900">
          Demanda encerrada ao chegar aqui
        </div>
      )}

      {/* Cards */}
      <ScrollArea className="flex-1 p-2">
        <SortableContext
          items={demandas.map(d => `demanda-${d.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2 min-h-[60px]">
            {demandas.map(d => (
              <KanbanCard
                key={d.id}
                demanda={d}
                isSaida={isSaida}
                onClick={() => onClickDemanda(d.id)}
              />
            ))}
            {demandas.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {isSaida ? (
                  <div className="flex flex-col items-center gap-1">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto" />
                    <span>Nenhuma demanda resolvida</span>
                  </div>
                ) : isEntrada ? (
                  <div className="flex flex-col items-center gap-1">
                    <Inbox className="h-5 w-5 text-blue-400 mx-auto" />
                    <span>Nenhuma demanda recebida</span>
                  </div>
                ) : (
                  <span>Nenhuma demanda</span>
                )}
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// ─── Modal: Gerenciar Colunas ─────────────────────────────────────────────────

function ModalGerenciarColunas({
  open,
  onClose,
  colunas,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  colunas: any[];
  onRefresh: () => void;
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
            Gerenciar Colunas do Kanban
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
              Etapas Intermediárias ({colunasIntermedias.length})
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
                            if (e.key === "Enter" && editando) updateColuna.mutate({ id: editando.id, nome: editando.nome, icone: editando.icone });
                            if (e.key === "Escape") setEditando(null);
                          }}
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => editando && updateColuna.mutate({ id: editando.id, nome: editando.nome, icone: editando.icone })} disabled={updateColuna.isPending}>
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
                    createColuna.mutate({ nome: novoNome.trim(), icone: novoIcone });
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (!novoNome.trim()) return;
                  createColuna.mutate({ nome: novoNome.trim(), icone: novoIcone });
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
              onClick={() => confirmDelete && deleteColuna.mutate({ id: confirmDelete.id })}
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
  const [overColunaId, setOverColunaId] = useState<number | null>(null);
  const [modalGerenciar, setModalGerenciar] = useState(false);
  const utils = trpc.useUtils();

  // Seed automático: cria as colunas padrão na primeira vez
  const seedMutation = trpc.juridicoDemandas.seedColunas.useMutation();
  const { data: colunas = [], refetch: refetchColunas } = trpc.juridicoDemandas.getColunas.useQuery(undefined, {
    onSuccess: (data: any[]) => {
      if (data.length === 0) seedMutation.mutate();
    },
  } as any);
  const { data: demandas = [], isLoading, refetch: refetchDemandas } = trpc.juridicoDemandas.listar.useQuery();

  const moverMutation = trpc.juridicoDemandas.mover.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const demandasPorColuna = useCallback((colunaId: number) => {
    return (demandas as any[]).filter((d: any) => d.colunaId === colunaId);
  }, [demandas]);

  const handleDragStart = (event: DragStartEvent) => {
    const { data } = event.active;
    if (data.current?.type === "demanda") {
      setActiveDemanda(data.current.demanda);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    if (!over) { setOverColunaId(null); return; }
    const overId = String(over.id);
    if (overId.startsWith("coluna-")) {
      setOverColunaId(Number(overId.replace("coluna-", "")));
    } else if (overId.startsWith("demanda-")) {
      const demandaId = Number(overId.replace("demanda-", ""));
      const d = (demandas as any[]).find((x: any) => x.id === demandaId);
      if (d) setOverColunaId(d.colunaId);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDemanda(null);
    setOverColunaId(null);
    const { active, over } = event;
    if (!over || !activeDemanda) return;

    const overId = String(over.id);
    let novaColunaId: number | null = null;

    if (overId.startsWith("coluna-")) {
      novaColunaId = Number(overId.replace("coluna-", ""));
    } else if (overId.startsWith("demanda-")) {
      const demandaId = Number(overId.replace("demanda-", ""));
      const d = (demandas as any[]).find((x: any) => x.id === demandaId);
      if (d) novaColunaId = d.colunaId;
    }

    if (novaColunaId && novaColunaId !== activeDemanda.colunaId) {
      // Verifica se está movendo para a coluna de saída
      const colunaDestino = (colunas as any[]).find((c: any) => c.id === novaColunaId);
      if (colunaDestino?.tipo === "saida") {
        // Confirmação visual antes de concluir
        toast.info(`Movendo para "${colunaDestino.nome}" — demanda será marcada como concluída`, {
          duration: 3000,
        });
      }

      // Optimistic update
      utils.juridicoDemandas.listar.setData(undefined, (old: any) =>
        old?.map((d: any) => d.id === activeDemanda.id ? { ...d, colunaId: novaColunaId } : d)
      );
      moverMutation.mutate({ id: activeDemanda.id, novaColunaId });
    }
  };

  // Estatísticas rápidas
  const totalDemandas = (demandas as any[]).length;
  const colunaEntrada = (colunas as any[]).find((c: any) => c.tipo === "entrada");
  const colunaSaida = (colunas as any[]).find((c: any) => c.tipo === "saida");
  const demandasRecebidas = colunaEntrada ? demandasPorColuna(colunaEntrada.id).length : 0;
  const demandasResolvidas = colunaSaida ? demandasPorColuna(colunaSaida.id).length : 0;
  const demandasAtrasadas = (demandas as any[]).filter((d: any) => isAtrasada(d.prazo)).length;

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
        <div className="flex gap-2">
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
          <Lock className="h-3 w-3" />
          Colunas com cadeado são fixas e não podem ser excluídas
        </span>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          <SortableContext
            items={(colunas as any[]).map((c: any) => `coluna-${c.id}`)}
            strategy={verticalListSortingStrategy}
          >
            {(colunas as any[]).map((col: any) => (
              <KanbanColuna
                key={col.id}
                coluna={col}
                demandas={demandasPorColuna(col.id)}
                onNovaDemanda={(colunaId) => navigate(`/admin/juridico?nova=1&coluna=${colunaId}`)}
                onClickDemanda={(id) => navigate(`/admin/juridico/demanda/${id}`)}
                onEditColuna={col.tipo === "intermediaria" ? (c) => setModalGerenciar(true) : undefined}
                onDeleteColuna={col.tipo === "intermediaria" ? (c) => setModalGerenciar(true) : undefined}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay>
          {activeDemanda && (
            <div className="rotate-2 shadow-xl opacity-90">
              <KanbanCard demanda={activeDemanda} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Modal de gerenciamento de colunas */}
      <ModalGerenciarColunas
        open={modalGerenciar}
        onClose={() => setModalGerenciar(false)}
        colunas={colunas as any[]}
        onRefresh={() => {
          refetchColunas();
          refetchDemandas();
        }}
      />
    </div>
  );
}
