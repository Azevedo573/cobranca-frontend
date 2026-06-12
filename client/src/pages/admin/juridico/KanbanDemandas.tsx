import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, List, GripVertical, Clock, AlertTriangle, User, Building2, MessageSquare, Mail, Phone, Globe, Users, FileText } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORIDADE_CONFIG = {
  baixa:   { label: "Baixa",   color: "bg-slate-100 text-slate-600 border-slate-200" },
  media:   { label: "Média",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  alta:    { label: "Alta",    color: "bg-orange-100 text-orange-700 border-orange-200" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700 border-red-200" },
};

const PRIORIDADE_BORDER = {
  baixa:   "border-l-slate-300",
  media:   "border-l-blue-400",
  alta:    "border-l-orange-400",
  urgente: "border-l-red-500",
};

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

function isAtrasada(prazo: string | Date | null | undefined) {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ─── Card Sortável ────────────────────────────────────────────────────────────

function KanbanCard({ demanda, onClick }: { demanda: any; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `demanda-${demanda.id}`,
    data: { type: "demanda", demanda },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const prio = PRIORIDADE_CONFIG[demanda.prioridade as keyof typeof PRIORIDADE_CONFIG];
  const prioBorder = PRIORIDADE_BORDER[demanda.prioridade as keyof typeof PRIORIDADE_BORDER] ?? "border-l-slate-300";
  const atrasada = isAtrasada(demanda.prazo);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border border-l-4 ${prioBorder} rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer group`}
      onClick={onClick}
    >
      <div className="flex items-start gap-1">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-1">
            <span className="text-xs font-mono text-muted-foreground">{demanda.numero}</span>
            <Badge variant="outline" className={`text-[10px] px-1 py-0 ${prio?.color}`}>{prio?.label}</Badge>
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
}: {
  coluna: any;
  demandas: any[];
  onNovaDemanda: (colunaId: number) => void;
  onClickDemanda: (id: number) => void;
}) {
  const { setNodeRef } = useSortable({
    id: `coluna-${coluna.id}`,
    data: { type: "coluna", colunaId: coluna.id },
  });

  const atrasadas = demandas.filter(d => isAtrasada(d.prazo)).length;

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col bg-muted/30 rounded-xl border min-w-[280px] max-w-[280px] h-full"
    >
      {/* Header da coluna */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <span className="text-base">{coluna.icone}</span>
          <span className="font-semibold text-sm">{coluna.nome}</span>
          <Badge variant="secondary" className="text-xs">{demandas.length}</Badge>
          {atrasadas > 0 && (
            <Badge variant="outline" className="text-xs text-red-500 border-red-200">
              {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onNovaDemanda(coluna.id)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

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
                onClick={() => onClickDemanda(d.id)}
              />
            ))}
            {demandas.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-xs">
                Nenhuma demanda
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function KanbanDemandas() {
  const [, navigate] = useLocation();
  const [activeDemanda, setActiveDemanda] = useState<any>(null);
  const [overColunaId, setOverColunaId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: demandas = [], isLoading } = trpc.juridicoDemandas.listar.useQuery();

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
      // Optimistic update
      utils.juridicoDemandas.listar.setData(undefined, (old: any) =>
        old?.map((d: any) => d.id === activeDemanda.id ? { ...d, colunaId: novaColunaId } : d)
      );
      moverMutation.mutate({ id: activeDemanda.id, novaColunaId });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-muted-foreground">Carregando Kanban...</div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Kanban Jurídico</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {(demandas as any[]).length} demandas · arraste para mover entre colunas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/juridico")}>
            <List className="h-4 w-4 mr-2" />
            Ver Lista
          </Button>
          <Button onClick={() => navigate("/admin/juridico?nova=1")}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Demanda
          </Button>
        </div>
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
    </div>
  );
}
