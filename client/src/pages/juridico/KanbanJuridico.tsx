import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { Link } from "wouter";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Status = "aberto" | "em_andamento" | "aguardando_cliente" | "resolvido" | "cancelado";

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

// ─── Card de ticket (draggable) ───────────────────────────────────────────────
function TicketCard({
  ticket,
  isDragging = false,
}: {
  ticket: any;
  isDragging?: boolean;
}) {
  const [, navigate] = useLocation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: ticket.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group bg-card border border-border rounded-lg p-3 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer select-none ${
        isDragging ? "shadow-xl ring-2 ring-primary/40 rotate-1" : ""
      }`}
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[10px] text-muted-foreground font-mono">#{ticket.id}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORIDADE_COLOR[ticket.prioridade] ?? PRIORIDADE_COLOR.media}`}>
              {ticket.prioridade === "urgente" ? "🔴 Urgente" : ticket.prioridade === "alta" ? "Alta" : ticket.prioridade === "media" ? "Média" : "Baixa"}
            </span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{ticket.titulo}</p>
        </div>
      </div>

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

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────
function KanbanColuna({
  coluna,
  tickets,
}: {
  coluna: typeof COLUNAS[0];
  tickets: any[];
}) {
  const Icon = coluna.icon;
  return (
    <div className={`flex flex-col rounded-xl border ${coluna.color} min-w-[260px] w-[260px] flex-shrink-0`}>
      {/* Header da coluna */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl ${coluna.headerBg}`}>
        <span className={`w-2 h-2 rounded-full ${coluna.dot}`} />
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold flex-1">{coluna.label}</span>
        <span className="text-xs font-bold bg-background/60 rounded-full px-2 py-0.5">
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
              <Icon className="h-8 w-8 mb-2" />
              <p className="text-xs">Nenhum ticket</p>
            </div>
          ) : (
            tickets.map((t) => <TicketCard key={t.id} ticket={t} />)
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

  // Filtra tickets por responsável
  const ticketsFiltrados = useMemo(() => {
    if (filtroResponsavel === "todos") return tickets;
    if (filtroResponsavel === "sem_responsavel") return tickets.filter((t) => !t.responsavelId);
    return tickets.filter((t) => String(t.responsavelId) === filtroResponsavel);
  }, [tickets, filtroResponsavel]);

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

  function handleDragStart(event: DragStartEvent) {
    const ticket = tickets.find((t) => t.id === event.active.id);
    setActiveTicket(ticket ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTicket(null);
    if (!over) return;

    // Descobre a coluna de destino
    const overId = over.id;
    // Se soltou em cima de outro ticket, descobre a coluna dele
    const overTicket = tickets.find((t) => t.id === overId);
    const novoStatus: Status | undefined = COLUNAS.find((c) => c.id === overId)?.id
      ?? (overTicket ? overTicket.status as Status : undefined);

    if (!novoStatus) return;

    const ticket = tickets.find((t) => t.id === active.id);
    if (!ticket || ticket.status === novoStatus) return;

    // Optimistic update
    utils.juridico.listTickets.setData({}, (old) =>
      (old ?? []).map((t) => t.id === ticket.id ? { ...t, status: novoStatus } : t)
    );

    updateTicket.mutate({ id: ticket.id, status: novoStatus });
    toast.success(`Ticket movido para "${COLUNAS.find((c) => c.id === novoStatus)?.label}"`);
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Kanban Jurídico</h1>
            <p className="text-xs text-muted-foreground">
              {ticketsFiltrados.length} ticket{ticketsFiltrados.length !== 1 ? "s" : ""} no total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro por responsável */}
          {(user?.role === "admin" || user?.role === "colaborador") && (
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder="Responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os responsáveis</SelectItem>
                  <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                  {responsaveisOpcoes.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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

      {/* Legenda de prioridade */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="font-medium">Prioridade:</span>
        {Object.entries(PRIORIDADE_COLOR).map(([k, cls]) => (
          <span key={k} className={`px-2 py-0.5 rounded-full ${cls}`}>
            {k.charAt(0).toUpperCase() + k.slice(1)}
          </span>
        ))}
        <span className="ml-2 text-muted-foreground/60">· Arraste os cards para mudar o status</span>
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
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUNAS.map((coluna) => (
              <KanbanColuna
                key={coluna.id}
                coluna={coluna}
                tickets={ticketsPorStatus[coluna.id]}
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
