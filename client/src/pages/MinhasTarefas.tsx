import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ListTodo, Kanban, AlertTriangle, Calendar, User, Building2,
  ExternalLink, CheckCircle2, Circle, Clock, ChevronDown, ChevronRight,
  Send, Trash2,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente:     { label: "Pendente",     color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  em_andamento: { label: "Em Andamento", color: "text-blue-700",   bg: "bg-blue-50 border-blue-200" },
  concluida:    { label: "Concluída",    color: "text-green-700",  bg: "bg-green-50 border-green-200" },
};

const PRIORIDADE_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-100 text-slate-600 border-slate-200" },
  media: { label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  alta:  { label: "Alta",  color: "bg-red-100 text-red-700 border-red-200" },
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isAtrasada(prazo: string | Date | null | undefined, status: string) {
  if (!prazo || status === "concluida") return false;
  return new Date(prazo) < new Date();
}

// ─── Card de Tarefa ───────────────────────────────────────────────────────────

function TarefaCard({ tarefa, onStatusChange }: { tarefa: any; onStatusChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [novoComentario, setNovoComentario] = useState("");
  const utils = trpc.useUtils();

  const { data: comentarios = [], refetch: refetchComentarios } = trpc.juridicoDemandas.tarefas.getComentarios.useQuery(
    { tarefaId: tarefa.id },
    { enabled: expanded }
  );

  const moverMutation = trpc.juridicoDemandas.tarefas.moverStatus.useMutation({
    onSuccess: () => {
      onStatusChange();
      utils.juridicoDemandas.tarefas.minhasTarefas.invalidate();
      toast.success("Status atualizado");
    },
    onError: (e) => toast.error(e.message),
  });

  const addComentarioMutation = trpc.juridicoDemandas.tarefas.addComentario.useMutation({
    onSuccess: () => {
      refetchComentarios();
      setNovoComentario("");
      toast.success("Comentário adicionado");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteComentarioMutation = trpc.juridicoDemandas.tarefas.deleteComentario.useMutation({
    onSuccess: () => refetchComentarios(),
    onError: (e) => toast.error(e.message),
  });

  const statusCfg = STATUS_CONFIG[tarefa.status] ?? STATUS_CONFIG.pendente;
  const prioCfg = PRIORIDADE_CONFIG[tarefa.prioridade] ?? PRIORIDADE_CONFIG.media;
  const atrasada = isAtrasada(tarefa.prazo, tarefa.status);

  const handleToggle = () => {
    const next = tarefa.status === "concluida" ? "pendente" : tarefa.status === "pendente" ? "em_andamento" : "concluida";
    moverMutation.mutate({ id: tarefa.id, status: next });
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-card transition-all ${tarefa.status === "concluida" ? "opacity-60" : ""}`}>
      <div className="p-3 flex items-start gap-2">
        {/* Toggle de status */}
        <button
          className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
          onClick={handleToggle}
          disabled={moverMutation.isPending}
          title="Avançar status"
        >
          {tarefa.status === "concluida"
            ? <CheckCircle2 className="h-5 w-5 text-green-600" />
            : tarefa.status === "em_andamento"
              ? <Clock className="h-5 w-5 text-blue-500" />
              : <Circle className="h-5 w-5" />
          }
        </button>

        <div className="flex-1 min-w-0">
          {/* Título e badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-medium ${tarefa.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>
              {tarefa.titulo}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${prioCfg.color}`}>
              {prioCfg.label}
            </Badge>
            {atrasada && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-600 border-red-200">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Atrasada
              </Badge>
            )}
          </div>

          {/* Metadados */}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {tarefa.prazo && (
              <span className={`flex items-center gap-1 ${atrasada ? "text-red-500" : ""}`}>
                <Calendar className="h-3 w-3" />Prazo: {formatDate(tarefa.prazo)}
              </span>
            )}
            {tarefa.criadoPorNome && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />Criado por: {tarefa.criadoPorNome}
              </span>
            )}
          </div>

          {/* Demanda vinculada */}
          {tarefa.demandaNumero && (
            <Link href={`/admin/juridico/demandas/${tarefa.demandaId}`}>
              <a className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline">
                <Building2 className="h-3 w-3" />
                {tarefa.demandaNumero} — {tarefa.demandaAssunto}
    
                <ExternalLink className="h-2.5 w-2.5 ml-0.5" />
              </a>
            </Link>
          )}
        </div>

        {/* Botão expandir */}
        <button
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* Área expandida — descrição + comentários */}
      {expanded && (
        <div className="border-t bg-muted/20 p-3 space-y-3">
          {tarefa.descricao && (
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{tarefa.descricao}</p>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Observações / Comentários ({(comentarios as any[]).length})
            </p>
            {(comentarios as any[]).map((c: any) => (
              <div key={c.id} className="flex gap-2 group">
                <div className="flex-1 bg-background border rounded p-2 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{c.autorNome ?? "Sistema"}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-foreground/80">{c.texto}</p>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 flex-shrink-0"
                  onClick={() => deleteComentarioMutation.mutate({ id: c.id })}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Textarea
                placeholder="Adicionar observação..."
                rows={2}
                className="text-sm"
                value={novoComentario}
                onChange={e => setNovoComentario(e.target.value)}
              />
              <Button
                size="sm" className="self-end"
                disabled={!novoComentario.trim() || addComentarioMutation.isPending}
                onClick={() => addComentarioMutation.mutate({ tarefaId: tarefa.id, texto: novoComentario })}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

function KanbanColuna({
  status, tarefas, onStatusChange,
}: {
  status: "pendente" | "em_andamento" | "concluida";
  tarefas: any[];
  onStatusChange: () => void;
}) {
  const cfg = STATUS_CONFIG[status];
  const moverMutation = trpc.juridicoDemandas.tarefas.moverStatus.useMutation({
    onSuccess: onStatusChange,
    onError: (e) => toast.error(e.message),
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("tarefaId"));
    if (id) moverMutation.mutate({ id, status });
  };

  return (
    <div
      className="flex-1 min-w-0 flex flex-col gap-2"
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Cabeçalho da coluna */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.bg}`}>
        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
        <span className={`text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center ${cfg.color} bg-white border`}>
          {tarefas.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-[120px]">
        {tarefas.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
            Arraste tarefas aqui
          </div>
        ) : (
          tarefas.map(t => (
            <div
              key={t.id}
              draggable
              onDragStart={e => e.dataTransfer.setData("tarefaId", String(t.id))}
              className="cursor-grab active:cursor-grabbing"
            >
              <TarefaCard tarefa={t} onStatusChange={onStatusChange} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function MinhasTarefas() {
  const [visao, setVisao] = useState<"lista" | "kanban">("kanban");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todas");

  const { data: tarefas = [], refetch, isLoading } = trpc.juridicoDemandas.tarefas.minhasTarefas.useQuery({
    status: "todas",
    prioridade: "todas",
  });

  const lista = tarefas as any[];

  // Filtros client-side para não re-buscar a cada mudança de filtro
  const filtradas = useMemo(() => lista.filter(t => {
    if (filtroStatus !== "todas" && t.status !== filtroStatus) return false;
    if (filtroPrioridade !== "todas" && t.prioridade !== filtroPrioridade) return false;
    return true;
  }), [lista, filtroStatus, filtroPrioridade]);

  const pendentes = filtradas.filter(t => t.status === "pendente");
  const emAndamento = filtradas.filter(t => t.status === "em_andamento");
  const concluidas = filtradas.filter(t => t.status === "concluida");

  const totalAtrasadas = lista.filter(t => isAtrasada(t.prazo, t.status)).length;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ListTodo className="h-6 w-6 text-primary" />
              Minhas Tarefas
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tarefas atribuídas a você — {lista.length} no total
              {totalAtrasadas > 0 && (
                <span className="ml-2 text-red-500 font-medium">
                  · {totalAtrasadas} atrasada{totalAtrasadas !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Toggle lista/kanban */}
            <div className="flex border rounded-lg overflow-hidden">
              <button
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${visao === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setVisao("lista")}
              >
                <ListTodo className="h-3.5 w-3.5" />Lista
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors ${visao === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setVisao("kanban")}
              >
                <Kanban className="h-3.5 w-3.5" />Kanban
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos os status</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="concluida">Concluída</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as prioridades</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Atualizar
          </Button>
        </div>

        {/* Conteúdo */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Carregando tarefas...</div>
        ) : filtradas.length === 0 ? (
          <div className="text-center py-16">
            <ListTodo className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">Nenhuma tarefa atribuída a você</p>
            <p className="text-xs text-muted-foreground mt-1">
              Quando alguém delegar uma tarefa para você, ela aparecerá aqui.
            </p>
          </div>
        ) : visao === "lista" ? (
          /* ── VISÃO LISTA ── */
          <div className="space-y-5">
            {pendentes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Circle className="h-3 w-3" />Pendentes ({pendentes.length})
                </p>
                <div className="space-y-2">
                  {pendentes.map(t => <TarefaCard key={t.id} tarefa={t} onStatusChange={refetch} />)}
                </div>
              </div>
            )}
            {emAndamento.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />Em Andamento ({emAndamento.length})
                </p>
                <div className="space-y-2">
                  {emAndamento.map(t => <TarefaCard key={t.id} tarefa={t} onStatusChange={refetch} />)}
                </div>
              </div>
            )}
            {concluidas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />Concluídas ({concluidas.length})
                </p>
                <div className="space-y-2">
                  {concluidas.map(t => <TarefaCard key={t.id} tarefa={t} onStatusChange={refetch} />)}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── VISÃO KANBAN ── */
          <div className="flex gap-4 overflow-x-auto pb-2">
            <KanbanColuna status="pendente"     tarefas={pendentes}    onStatusChange={refetch} />
            <KanbanColuna status="em_andamento" tarefas={emAndamento}  onStatusChange={refetch} />
            <KanbanColuna status="concluida"    tarefas={concluidas}   onStatusChange={refetch} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
