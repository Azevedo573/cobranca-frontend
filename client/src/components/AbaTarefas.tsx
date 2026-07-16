import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertTriangle, User, Calendar, Clock, Edit2, Check, X, Send, Trash2,
  ListTodo, Plus, ChevronDown, ChevronRight, CheckCircle2, Circle, Loader2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_TAREFA_CONFIG: Record<string, { label: string; color: string }> = {
  pendente:     { label: "Pendente",     color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  em_andamento: { label: "Em Andamento", color: "bg-blue-100 text-blue-700 border-blue-200" },
  concluida:    { label: "Concluída",    color: "bg-green-100 text-green-700 border-green-200" },
};

const PRIORIDADE_TAREFA_CONFIG: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "bg-slate-100 text-slate-600 border-slate-200" },
  media: { label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  alta:  { label: "Alta",  color: "bg-red-100 text-red-700 border-red-200" },
};

function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isAtrasada(prazo: string | Date | null | undefined) {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

// ─── Item de Tarefa ──────────────────────────────────────────────────────────

function TarefaItem({
  tarefa,
  demandaId,
  operadores,
  onRefresh,
}: {
  tarefa: any;
  demandaId: number;
  operadores: any[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [novoComentario, setNovoComentario] = useState("");
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState({
    titulo: tarefa.titulo,
    descricao: tarefa.descricao ?? "",
    responsavelId: tarefa.responsavelId ? String(tarefa.responsavelId) : "",
    status: tarefa.status,
    prioridade: tarefa.prioridade,
    prazo: tarefa.prazo ? new Date(tarefa.prazo).toISOString().substring(0, 10) : "",
  });

  const utils = trpc.useUtils();

  const { data: comentarios = [], refetch: refetchComentarios } = trpc.juridicoDemandas.tarefas.getComentarios.useQuery(
    { tarefaId: tarefa.id },
    { enabled: expanded }
  );

  const updateMutation = trpc.juridicoDemandas.tarefas.update.useMutation({
    onSuccess: () => {
      onRefresh();
      utils.juridicoDemandas.tarefas.contadores.invalidate({ demandaId });
      setEditando(false);
      toast.success("Tarefa atualizada");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.juridicoDemandas.tarefas.delete.useMutation({
    onSuccess: () => {
      onRefresh();
      utils.juridicoDemandas.tarefas.contadores.invalidate({ demandaId });
      toast.success("Tarefa excluída");
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

  const statusCfg = STATUS_TAREFA_CONFIG[tarefa.status] ?? STATUS_TAREFA_CONFIG.pendente;
  const prioCfg = PRIORIDADE_TAREFA_CONFIG[tarefa.prioridade] ?? PRIORIDADE_TAREFA_CONFIG.media;
  const atrasada = isAtrasada(tarefa.prazo) && tarefa.status !== "concluida";

  const handleToggleConcluida = () => {
    const novoStatus = tarefa.status === "concluida" ? "pendente" : "concluida";
    updateMutation.mutate({ id: tarefa.id, status: novoStatus });
  };

  const handleSaveEdit = () => {
    const respId = editForm.responsavelId ? Number(editForm.responsavelId) : null;
    const respNome = respId
      ? (operadores.find((o: any) => o.id === respId)?.name ?? null)
      : null;
    updateMutation.mutate({
      id: tarefa.id,
      titulo: editForm.titulo,
      descricao: editForm.descricao || null,
      responsavelId: respId,
      responsavelNome: respNome,
      status: editForm.status as any,
      prioridade: editForm.prioridade as any,
      prazo: editForm.prazo || null,
    });
  };

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${tarefa.status === "concluida" ? "opacity-70" : ""}`}>
      {/* Cabeçalho */}
      <div className="flex items-start gap-2 p-3">
        <button
          className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-green-600 transition-colors"
          onClick={handleToggleConcluida}
          disabled={updateMutation.isPending}
        >
          {tarefa.status === "concluida"
            ? <CheckCircle2 className="h-5 w-5 text-green-600" />
            : <Circle className="h-5 w-5" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${tarefa.status === "concluida" ? "line-through text-muted-foreground" : ""}`}>
              {tarefa.titulo}
            </span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${prioCfg.color}`}>
              {prioCfg.label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusCfg.color}`}>
              {statusCfg.label}
            </Badge>
            {atrasada && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-600 border-red-200">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Atrasada
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {tarefa.responsavelNome && (
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{tarefa.responsavelNome}</span>
            )}
            {tarefa.prazo && (
              <span className={`flex items-center gap-1 ${atrasada ? "text-red-500" : ""}`}>
                <Calendar className="h-3 w-3" />{formatDate(tarefa.prazo)}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />{formatDateTime(tarefa.createdAt)}
              {tarefa.criadoPorNome && ` por ${tarefa.criadoPorNome}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditando(true)}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-red-400 hover:text-red-600"
            onClick={() => { if (confirm("Excluir esta tarefa?")) deleteMutation.mutate({ id: tarefa.id }); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(v => !v)}>
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Área expandida */}
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
                  variant="ghost"
                  size="icon"
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
                size="sm"
                className="self-end"
                disabled={!novoComentario.trim() || addComentarioMutation.isPending}
                onClick={() => addComentarioMutation.mutate({ tarefaId: tarefa.id, texto: novoComentario })}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog de edição */}
      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título *</Label>
              <Input value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={3} value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Select value={editForm.prioridade} onValueChange={v => setEditForm(f => ({ ...f, prioridade: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select
                  value={editForm.responsavelId || "__none__"}
                  onValueChange={v => setEditForm(f => ({ ...f, responsavelId: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {operadores.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.name ?? o.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prazo</Label>
                <Input type="date" className="h-8 text-xs" value={editForm.prazo} onChange={e => setEditForm(f => ({ ...f, prazo: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={!editForm.titulo.trim() || updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Componente Exportado ─────────────────────────────────────────────────────

export function AbaTarefas({ demandaId, operadores }: { demandaId: number; operadores: any[] }) {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    responsavelId: "",
    prioridade: "media",
    prazo: "",
  });

  const utils = trpc.useUtils();
  const { data: tarefas = [], refetch } = trpc.juridicoDemandas.tarefas.listar.useQuery({ demandaId });

  const createMutation = trpc.juridicoDemandas.tarefas.create.useMutation({
    onSuccess: () => {
      refetch();
      utils.juridicoDemandas.tarefas.contadores.invalidate({ demandaId });
      setDialogAberto(false);
      setForm({ titulo: "", descricao: "", responsavelId: "", prioridade: "media", prazo: "" });
      toast.success("Tarefa criada");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.titulo.trim()) { toast.error("Informe o título da tarefa"); return; }
    const respId = form.responsavelId ? Number(form.responsavelId) : undefined;
    const respNome = respId ? (operadores.find((o: any) => o.id === respId)?.name ?? undefined) : undefined;
    createMutation.mutate({
      demandaId,
      titulo: form.titulo,
      descricao: form.descricao || undefined,
      responsavelId: respId,
      responsavelNome: respNome,
      prioridade: form.prioridade as any,
      prazo: form.prazo || undefined,
    });
  };

  const tarefasList = tarefas as any[];
  const pendentes = tarefasList.filter(t => t.status === "pendente");
  const emAndamento = tarefasList.filter(t => t.status === "em_andamento");
  const concluidas = tarefasList.filter(t => t.status === "concluida");

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{tarefasList.length} tarefa{tarefasList.length !== 1 ? "s" : ""}</span>
          {pendentes.length > 0 && (
            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
              {pendentes.length} pendente{pendentes.length !== 1 ? "s" : ""}
            </Badge>
          )}
          {emAndamento.length > 0 && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
              {emAndamento.length} em andamento
            </Badge>
          )}
        </div>
        <Button size="sm" onClick={() => setDialogAberto(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />Nova Tarefa
        </Button>
      </div>

      {/* Lista */}
      {tarefasList.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ListTodo className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma tarefa cadastrada</p>
          <p className="text-xs mt-1">Clique em "Nova Tarefa" para delegar atividades à equipe</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendentes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2">Pendentes ({pendentes.length})</p>
              <div className="space-y-2">
                {pendentes.map(t => (
                  <TarefaItem key={t.id} tarefa={t} demandaId={demandaId} operadores={operadores} onRefresh={refetch} />
                ))}
              </div>
            </div>
          )}
          {emAndamento.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Em Andamento ({emAndamento.length})</p>
              <div className="space-y-2">
                {emAndamento.map(t => (
                  <TarefaItem key={t.id} tarefa={t} demandaId={demandaId} operadores={operadores} onRefresh={refetch} />
                ))}
              </div>
            </div>
          )}
          {concluidas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Concluídas ({concluidas.length})</p>
              <div className="space-y-2">
                {concluidas.map(t => (
                  <TarefaItem key={t.id} tarefa={t} demandaId={demandaId} operadores={operadores} onRefresh={refetch} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog de nova tarefa */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Tarefa Interna</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título *</Label>
              <Input
                placeholder="Ex: Elaborar documento, Revisar contrato..."
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                placeholder="Detalhes sobre a tarefa..."
                rows={3}
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select
                  value={form.responsavelId || "__none__"}
                  onValueChange={v => setForm(f => ({ ...f, responsavelId: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {operadores.map((o: any) => (
                      <SelectItem key={o.id} value={String(o.id)}>{o.name ?? o.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Prazo (opcional)</Label>
              <Input type="date" className="h-8 text-xs" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.titulo.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Tarefa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
