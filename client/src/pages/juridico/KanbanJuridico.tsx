import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { CheckboxConclusao } from "@/components/CheckboxConclusao";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Scale,
  Plus,
  GripVertical,
  Building2,
  UserCircle2,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CalendarClock,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Status = "aberto" | "em_andamento" | "aguardando_cliente" | "resolvido" | "cancelado";
type FiltroPrazo = "todos" | "atrasados" | "hoje" | "semana";
type FiltroPrioridade = "todos" | "urgente" | "alta" | "media" | "baixa";

const COLUNAS: { id: Status; label: string; icon: React.ElementType; color: string; headerBg: string; dot: string }[] = [
  { id: "aberto",             label: "Aberto",             icon: AlertCircle,  color: "border-yellow-400/40 bg-yellow-500/5",  headerBg: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",  dot: "bg-yellow-400" },
  { id: "em_andamento",       label: "Em Andamento",       icon: Clock,        color: "border-blue-400/40 bg-blue-500/5",      headerBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",        dot: "bg-blue-400" },
  { id: "aguardando_cliente", label: "Aguardando Cliente", icon: Clock,        color: "border-purple-400/40 bg-purple-500/5",  headerBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",  dot: "bg-purple-400" },
  { id: "resolvido",          label: "Resolvido",          icon: CheckCircle2, color: "border-emerald-400/40 bg-emerald-500/5",headerBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",dot: "bg-emerald-400" },
  { id: "cancelado",          label: "Cancelado",          icon: XCircle,      color: "border-slate-400/40 bg-slate-500/5",    headerBg: "bg-slate-500/10 text-slate-500 dark:text-slate-400",     dot: "bg-slate-400" },
];

const PRIORIDADE_COLOR: Record<string, string> = {
  baixa:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  media:   "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  alta:    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

const CATEGORIAS: Record<string, string> = {
  consultoria: "Consultoria",
  notificacao: "Notificação",
  acao_judicial: "Ação Judicial",
  cobranca_judicial: "Cobrança Judicial",
  assembleia: "Assembleia",
  contrato: "Contrato",
  outro: "Outro",
};

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

// ─── Helpers de prazo (SLA por prioridade) ───────────────────────────────────
const SLA_DIAS: Record<string, number> = {
  urgente: 1,
  alta: 3,
  media: 7,
  baixa: 14,
};

function getPrazoInfo(createdAt: Date | string | null | undefined, prioridade: string): {
  atrasado: boolean;
  hoje: boolean;
  semana: boolean;
  label: string | null;
} {
  if (!createdAt) return { atrasado: false, hoje: false, semana: false, label: null };
  const criado = new Date(createdAt);
  const diasSLA = SLA_DIAS[prioridade] ?? 7;
  const prazoDate = new Date(criado.getTime() + diasSLA * 86400000);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000 - 1);

  const atrasado = prazoDate < startOfToday;
  const hoje = prazoDate >= startOfToday && prazoDate <= endOfToday;
  const semana = prazoDate > endOfToday && prazoDate <= endOfWeek;

  const label = atrasado
    ? `SLA vencido: ${prazoDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
    : hoje
    ? `SLA vence hoje`
    : semana
    ? `SLA: ${prazoDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`
    : null;

  return { atrasado, hoje, semana, label };
}

// ─── Card de ticket (draggable) ───────────────────────────────────────────────
function TicketCard({
  ticket,
  isDragging = false,
  onConcluir,
  concluindo,
}: {
  ticket: any;
  isDragging?: boolean;
  onConcluir?: (id: number) => void;
  concluindo?: boolean;
}) {
  const [, navigate] = useLocation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: ticket.id });
  const prazoInfo = getPrazoInfo(ticket.createdAt, ticket.prioridade);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer select-none",
        isDragging ? "shadow-xl ring-2 ring-primary/40 rotate-1" : "",
        // Borda vermelha pulsante para atrasados
        prazoInfo.atrasado && ticket.status !== "resolvido" && ticket.status !== "cancelado"
          ? "border-red-400/70 animate-[pulse_2s_ease-in-out_infinite]"
          : prazoInfo.hoje && ticket.status !== "resolvido" && ticket.status !== "cancelado"
          ? "border-orange-400/60"
          : "border-border hover:border-primary/30",
        // Opacidade reduzida para concluídos
        ticket.status === "resolvido" ? "opacity-60" : ""
      )}
      onClick={() => navigate(`/juridico/solicitacoes/${ticket.id}`)}
    >
      {/* Drag handle + header */}
      <div className="flex items-start gap-2 mb-2">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </div>
        {/* Checkbox de conclusão rápida */}
        {onConcluir && (
          <div className="mt-0.5 flex-shrink-0">
            <CheckboxConclusao
              concluido={ticket.status === "resolvido"}
              onToggle={() => onConcluir(ticket.id)}
              disabled={concluindo}
              size={18}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] text-muted-foreground font-mono">#{ticket.id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORIDADE_COLOR[ticket.prioridade] ?? PRIORIDADE_COLOR.media}`}>
              {ticket.prioridade === "urgente" ? "🔴 Urgente" : ticket.prioridade === "alta" ? "Alta" : ticket.prioridade === "media" ? "Média" : "Baixa"}
            </span>
          </div>
          <p className={cn(
            "text-sm font-semibold leading-snug line-clamp-2 transition-all duration-200",
            ticket.status === "resolvido" ? "line-through text-muted-foreground/60" : "text-foreground"
          )}>{ticket.titulo}</p>
        </div>
      </div>

      {/* Indicador de prazo vencido */}
      {prazoInfo.label && ticket.status !== "resolvido" && ticket.status !== "cancelado" && (
        <div className={cn(
          "ml-6 mb-2 flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 w-fit",
          prazoInfo.atrasado
            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            : prazoInfo.hoje
            ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        )}>
          {prazoInfo.atrasado ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}
          {prazoInfo.label}
        </div>
      )}

      {/* Categoria */}
      <div className="ml-6 mb-2">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          {CATEGORIAS[ticket.categoria] ?? ticket.categoria}
        </Badge>
      </div>

      {/* Footer: condomínio + responsável + data */}
      <div className="ml-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 min-w-0">
          <Building2 className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">
            {ticket.condominioNome ?? `Cond. #${ticket.condominioId}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-muted-foreground">
            {new Date(ticket.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
          </span>
          {ticket.responsavelId && ticket.responsavelNome ? (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="h-5 w-5 ring-1 ring-primary/20">
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-bold">
                      {getInitials(ticket.responsavelNome)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">{ticket.responsavelNome}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <UserCircle2 className="h-4 w-4 text-muted-foreground/30" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Coluna do Kanban (com colapso) ──────────────────────────────────────────
function KanbanColuna({
  coluna,
  tickets,
  onConcluir,
  concluindoId,
  collapsed,
  onToggleCollapse,
}: {
  coluna: typeof COLUNAS[0];
  tickets: any[];
  onConcluir: (id: number) => void;
  concluindoId: number | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const Icon = coluna.icon;
  const urgentesCount = tickets.filter((t) => t.prioridade === "urgente").length;
  const atrasadosCount = tickets.filter((t) => {
    const p = getPrazoInfo(t.createdAt, t.prioridade);
    return p.atrasado && t.status !== "resolvido" && t.status !== "cancelado";
  }).length;

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center rounded-xl border py-3 px-2 gap-2 cursor-pointer hover:opacity-80 transition-all duration-300 select-none animate-in fade-in slide-in-from-left-2",
          coluna.color,
          "min-w-[44px] w-[44px] flex-shrink-0"
        )}
        onClick={onToggleCollapse}
        title={`Expandir coluna "${coluna.label}"`}
      >
        <span className={`w-2 h-2 rounded-full ${coluna.dot} flex-shrink-0`} />
        <span
          className="text-[10px] font-semibold writing-mode-vertical"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)", letterSpacing: "0.05em" }}
        >
          {coluna.label}
        </span>
        <span className="text-xs font-bold bg-background/60 rounded-full px-1.5 py-0.5 mt-auto">
          {tickets.length}
        </span>
        {atrasadosCount > 0 && (
          <span className="text-[9px] font-bold bg-red-500 text-white rounded-full px-1 py-0.5">
            {atrasadosCount}
          </span>
        )}
        <ChevronRight className="h-3 w-3 text-muted-foreground mt-1" />
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col rounded-xl border min-w-[260px] w-[260px] flex-shrink-0 transition-all duration-300 animate-in fade-in slide-in-from-right-2",
      coluna.color
    )}>
      {/* Header da coluna */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${coluna.headerBg}`}>
        <span className={`w-2 h-2 rounded-full ${coluna.dot}`} />
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold flex-1">{coluna.label}</span>
        {/* Badges de urgentes e atrasados */}
        <div className="flex items-center gap-1">
          {atrasadosCount > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[9px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 cursor-default">
                    {atrasadosCount} atras.
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{atrasadosCount} ticket(s) com prazo vencido</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {urgentesCount > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-[9px] font-bold bg-orange-500 text-white rounded-full px-1.5 py-0.5 cursor-default">
                    {urgentesCount} urg.
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{urgentesCount} ticket(s) urgente(s)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-xs font-bold bg-background/60 rounded-full px-2 py-0.5">
            {tickets.length}
          </span>
          {/* Botão de colapso */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(); }}
            className="ml-1 p-0.5 rounded hover:bg-background/40 transition-colors"
            title="Recolher coluna"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Icon className="h-8 w-8 mb-2" />
              <p className="text-xs">Nenhum ticket</p>
            </div>
          ) : (
            tickets.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                onConcluir={onConcluir}
                concluindo={concluindoId === t.id}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function KanbanJuridico() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [activeTicket, setActiveTicket] = useState<any | null>(null);
  const [filtroResponsavel, setFiltroResponsavel] = useState<string>("todos");
  const [filtroPrioridade, setFiltroPrioridade] = useState<FiltroPrioridade>("todos");
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>("todos");
  const [busca, setBusca] = useState("");
  const [concluindoId, setConcluindoId] = useState<number | null>(null);
  const [colunasColapsadas, setColunasColapsadas] = useState<Set<Status>>(new Set());

  const { data: tickets = [], isLoading } = trpc.juridico.listTickets.useQuery({});
  const { data: todosUsuarios = [] } = trpc.users.list.useQuery(
    undefined,
    { enabled: user?.role === "admin" }
  );
  const responsaveisOpcoes = todosUsuarios.filter(
    (u) => u.role === "admin" || u.role === "cobrador"
  );

  const updateTicket = trpc.juridico.updateTicket.useMutation({
    onSuccess: () => {
      utils.juridico.listTickets.invalidate();
    },
    onError: (err) => {
      toast.error("Erro ao mover ticket: " + err.message);
      utils.juridico.listTickets.invalidate();
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Filtros combinados
  const ticketsFiltrados = useMemo(() => {
    let lista = [...tickets];

    if (filtroResponsavel !== "todos") {
      if (filtroResponsavel === "sem_responsavel") {
        lista = lista.filter((t) => !t.responsavelId);
      } else {
        lista = lista.filter((t) => String(t.responsavelId) === filtroResponsavel);
      }
    }

    if (filtroPrioridade !== "todos") {
      lista = lista.filter((t) => t.prioridade === filtroPrioridade);
    }

    if (filtroPrazo !== "todos") {
      lista = lista.filter((t) => {
        const p = getPrazoInfo(t.createdAt, t.prioridade);
        if (filtroPrazo === "atrasados") return p.atrasado;
        if (filtroPrazo === "hoje") return p.hoje;
        if (filtroPrazo === "semana") return p.semana;
        return true;
      });
    }

    if (busca.trim()) {
      const q = busca.toLowerCase();
      lista = lista.filter(
        (t) =>
          t.titulo?.toLowerCase().includes(q) ||
          String(t.id).includes(q) ||
          t.condominioNome?.toLowerCase().includes(q)
      );
    }

    return lista;
  }, [tickets, filtroResponsavel, filtroPrioridade, filtroPrazo, busca]);

  // Agrupa por status
  const ticketsPorStatus = useMemo(() => {
    const mapa: Record<Status, any[]> = {
      aberto: [],
      em_andamento: [],
      aguardando_cliente: [],
      resolvido: [],
      cancelado: [],
    };
    for (const t of ticketsFiltrados) {
      if (t.status in mapa) mapa[t.status as Status].push(t);
    }
    return mapa;
  }, [ticketsFiltrados]);

  // Contadores para filtros rápidos
  const totalAtrasados = useMemo(
    () => tickets.filter((t) => {
      const p = getPrazoInfo(t.createdAt, t.prioridade);
      return p.atrasado && t.status !== "resolvido" && t.status !== "cancelado";
    }).length,
    [tickets]
  );
  const totalUrgentes = useMemo(
    () => tickets.filter((t) => t.prioridade === "urgente" && t.status !== "resolvido" && t.status !== "cancelado").length,
    [tickets]
  );

  function toggleColuna(id: Status) {
    setColunasColapsadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConcluir(id: number) {
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) return;
    const novoStatus: Status = ticket.status === "resolvido" ? "em_andamento" : "resolvido";
    setConcluindoId(id);
    utils.juridico.listTickets.setData({}, (old) =>
      (old ?? []).map((t) => t.id === id ? { ...t, status: novoStatus } : t)
    );
    updateTicket.mutate(
      { id, status: novoStatus },
      {
        onSuccess: () => {
          toast.success(novoStatus === "resolvido" ? "✅ Ticket concluído!" : "Ticket reaberto.");
          setConcluindoId(null);
        },
        onError: () => {
          setConcluindoId(null);
          utils.juridico.listTickets.invalidate();
        },
      }
    );
  }

  function handleDragStart(event: DragStartEvent) {
    const ticket = tickets.find((t) => t.id === event.active.id);
    setActiveTicket(ticket ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTicket(null);
    if (!over) return;

    const overId = over.id;
    const overTicket = tickets.find((t) => t.id === overId);
    const novoStatus: Status | undefined = COLUNAS.find((c) => c.id === overId)?.id
      ?? (overTicket ? overTicket.status as Status : undefined);

    if (!novoStatus) return;

    const ticket = tickets.find((t) => t.id === active.id);
    if (!ticket || ticket.status === novoStatus) return;

    utils.juridico.listTickets.setData({}, (old) =>
      (old ?? []).map((t) => t.id === ticket.id ? { ...t, status: novoStatus } : t)
    );

    updateTicket.mutate({ id: ticket.id, status: novoStatus });
    toast.success(`Ticket movido para "${COLUNAS.find((c) => c.id === novoStatus)?.label}"`);
  }

  const filtrosAtivos = filtroPrioridade !== "todos" || filtroPrazo !== "todos" || busca.trim() !== "" || filtroResponsavel !== "todos";
  const qtdFiltrosAtivos = (filtroPrioridade !== "todos" ? 1 : 0) + (filtroPrazo !== "todos" ? 1 : 0) + (busca.trim() !== "" ? 1 : 0) + (filtroResponsavel !== "todos" ? 1 : 0);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Kanban Jurídico</h1>
            <p className="text-xs text-muted-foreground">
              {ticketsFiltrados.length} ticket{ticketsFiltrados.length !== 1 ? "s" : ""}
              {filtrosAtivos && <span className="text-primary font-medium"> (filtrado)</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(user?.role === "admin" || user?.role === "colaborador") && (
            <Link href="/juridico/solicitacoes/novo">
              <Button size="sm" className="gap-1.5 h-8 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Novo Ticket
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Barra de filtros rápidos */}
      <div className={cn(
        "flex items-center gap-2 flex-wrap rounded-xl px-3 py-2.5 border transition-all duration-200",
        filtrosAtivos
          ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
          : "bg-muted/30 border-border/50"
      )}>
        {/* Busca por texto */}
        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar ticket..."
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Filtro por prioridade */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground font-medium">Prioridade:</span>
          {(["todos", "urgente", "alta", "media", "baixa"] as FiltroPrioridade[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setFiltroPrioridade(p)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium transition-all border",
                filtroPrioridade === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : p === "urgente"
                  ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                  : p === "alta"
                  ? "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800"
                  : p === "media"
                  ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800"
                  : p === "baixa"
                  ? "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {p === "todos" ? "Todas" : p === "urgente" ? "🔴 Urgente" : p.charAt(0).toUpperCase() + p.slice(1)}
              {p === "urgente" && totalUrgentes > 0 && filtroPrioridade !== "urgente" && (
                <span className="ml-1 bg-red-500 text-white rounded-full px-1 text-[8px]">{totalUrgentes}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filtro por prazo */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground font-medium">Prazo:</span>
          {([
            { id: "todos", label: "Todos" },
            { id: "atrasados", label: "⚠️ Atrasados" },
            { id: "hoje", label: "Hoje" },
            { id: "semana", label: "Esta semana" },
          ] as { id: FiltroPrazo; label: string }[]).map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => setFiltroPrazo(op.id)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full font-medium transition-all border",
                filtroPrazo === op.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : op.id === "atrasados"
                  ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {op.label}
              {op.id === "atrasados" && totalAtrasados > 0 && filtroPrazo !== "atrasados" && (
                <span className="ml-1 bg-red-500 text-white rounded-full px-1 text-[8px]">{totalAtrasados}</span>
              )}
            </button>
          ))}
        </div>

        {/* Filtro por responsável */}
        {(user?.role === "admin" || user?.role === "colaborador") && responsaveisOpcoes.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                {responsaveisOpcoes.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Limpar filtros */}
        {filtrosAtivos && (
          <button
            type="button"
            onClick={() => {
              setFiltroPrioridade("todos");
              setFiltroPrazo("todos");
              setBusca("");
              setFiltroResponsavel("todos");
            }}
            className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full text-destructive border border-destructive/30 hover:bg-destructive/10 transition-all font-medium"
          >
            <X className="h-3 w-3" />
            Limpar
            <span className="bg-destructive text-white rounded-full px-1.5 py-0 text-[9px] font-bold">
              {qtdFiltrosAtivos}
            </span>
          </button>
        )}
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUNAS.map((c) => (
            <div key={c.id} className="min-w-[260px] w-[260px] h-64 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 items-start">
            {COLUNAS.map((coluna) => (
              <KanbanColuna
                key={coluna.id}
                coluna={coluna}
                tickets={ticketsPorStatus[coluna.id]}
                onConcluir={handleConcluir}
                concluindoId={concluindoId}
                collapsed={colunasColapsadas.has(coluna.id)}
                onToggleCollapse={() => toggleColuna(coluna.id)}
              />
            ))}
          </div>

          {/* Overlay do card sendo arrastado */}
          <DragOverlay>
            {activeTicket ? (
              <TicketCard ticket={activeTicket} isDragging />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
