import React, { useState, useMemo } from "react";
import { CheckboxConclusao } from "@/components/CheckboxConclusao";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Bell, Eye, Clock, CheckCircle2, Archive, ArrowLeft, Plus,
  ChevronRight, Building2, Users, FileText, Gavel, Calendar,
  Scale, BookOpen, EyeOff, MoveRight, ExternalLink, Search, X, ChevronLeft,
} from "lucide-react";

// ─── Config de Colunas do Kanban ──────────────────────────────────────────────

const COLUNAS = [
  {
    id: "nova",
    label: "Nova",
    icon: <Bell className="h-4 w-4" />,
    color: "border-t-blue-500",
    headerBg: "bg-blue-50 dark:bg-blue-900/20",
    headerText: "text-blue-700 dark:text-blue-300",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    id: "analisando",
    label: "Analisando",
    icon: <Eye className="h-4 w-4" />,
    color: "border-t-amber-500",
    headerBg: "bg-amber-50 dark:bg-amber-900/20",
    headerText: "text-amber-700 dark:text-amber-300",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  },
  {
    id: "aguardando_providencia",
    label: "Aguard. Providência",
    icon: <Clock className="h-4 w-4" />,
    color: "border-t-orange-500",
    headerBg: "bg-orange-50 dark:bg-orange-900/20",
    headerText: "text-orange-700 dark:text-orange-300",
    badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  {
    id: "providenciada",
    label: "Providenciada",
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: "border-t-green-500",
    headerBg: "bg-green-50 dark:bg-green-900/20",
    headerText: "text-green-700 dark:text-green-300",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  {
    id: "arquivada",
    label: "Arquivada",
    icon: <Archive className="h-4 w-4" />,
    color: "border-t-slate-400",
    headerBg: "bg-slate-50 dark:bg-slate-800",
    headerText: "text-slate-600 dark:text-slate-400",
    badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
];

const TIPO_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  intimacao:  { label: "Intimação",  icon: <Bell className="h-3 w-3" />,       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  sentenca:   { label: "Sentença",   icon: <Gavel className="h-3 w-3" />,      color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  despacho:   { label: "Despacho",   icon: <FileText className="h-3 w-3" />,   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  audiencia:  { label: "Audiência",  icon: <Calendar className="h-3 w-3" />,   color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  decisao:    { label: "Decisão",    icon: <Scale className="h-3 w-3" />,      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  outro:      { label: "Outro",      icon: <BookOpen className="h-3 w-3" />,   color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Modal de Detalhe da Publicação ──────────────────────────────────────────

function ModalDetalhePublicacao({ id, onClose }: { id: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: pub, isLoading } = trpc.publicacoes.getById.useQuery({ id });
  const [editObs, setEditObs] = useState(false);
  const [obs, setObs] = useState("");
  const [editCNJ, setEditCNJ] = useState(false);
  const [cnj, setCnj] = useState("");

  const updateMutation = trpc.publicacoes.update.useMutation({
    onSuccess: () => {
      utils.publicacoes.getById.invalidate({ id });
      utils.publicacoes.listar.invalidate();
      utils.publicacoes.dashboard.invalidate();
      toast.success("Publicação atualizada!");
      setEditObs(false);
      setEditCNJ(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.publicacoes.updateStatus.useMutation({
    onSuccess: () => {
      utils.publicacoes.getById.invalidate({ id });
      utils.publicacoes.listar.invalidate();
      utils.publicacoes.dashboard.invalidate();
      toast.success("Status atualizado!");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !pub) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="py-12 text-center text-muted-foreground">Carregando publicação...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const tipo = TIPO_CONFIG[pub.tipo] ?? TIPO_CONFIG.outro;
  const coluna = COLUNAS.find(c => c.id === pub.status);
  const proximoStatus = COLUNAS[COLUNAS.findIndex(c => c.id === pub.status) + 1];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${tipo.color}`}>
              {tipo.icon}{tipo.label}
            </span>
            {pub.lida === 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                <EyeOff className="h-3 w-3" />Não lida
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status atual + próximo passo */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className={`flex items-center gap-1.5 text-sm font-medium ${coluna?.headerText}`}>
              {coluna?.icon}
              {coluna?.label}
            </div>
            {proximoStatus && (
              <>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => updateStatusMutation.mutate({ id, status: proximoStatus.id as any })}
                  disabled={updateStatusMutation.isPending}
                >
                  <MoveRight className="h-3 w-3 mr-1" />
                  Mover para {proximoStatus.label}
                </Button>
              </>
            )}
            {/* Select para mover para qualquer status */}
            <div className="ml-auto">
              <Select
                value={pub.status}
                onValueChange={v => updateStatusMutation.mutate({ id, status: v as any })}
              >
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUNAS.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dados do tribunal */}
          <div className="grid grid-cols-2 gap-3">
            {pub.advogadoNome && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Advogado</p>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  {pub.advogadoNome}
                  {pub.oab && <span className="text-muted-foreground font-normal">· {pub.oab}</span>}
                </p>
              </div>
            )}
            {pub.tribunal && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tribunal</p>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  {pub.tribunal}
                </p>
              </div>
            )}
            {pub.comarca && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Comarca</p>
                <p className="text-sm">{pub.comarca}</p>
              </div>
            )}
            {pub.vara && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Vara</p>
                <p className="text-sm">{pub.vara}</p>
              </div>
            )}
            {pub.dataPublicacao && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Data da Publicação</p>
                <p className="text-sm">{formatDate(pub.dataPublicacao)}</p>
              </div>
            )}
            {pub.responsavelNome && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Responsável</p>
                <p className="text-sm">{pub.responsavelNome}</p>
              </div>
            )}
          </div>

          {/* Número CNJ */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Número CNJ do Processo</p>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditCNJ(!editCNJ); setCnj(pub.numeroCNJ ?? ""); }}>
                {editCNJ ? "Cancelar" : "Editar"}
              </Button>
            </div>
            {editCNJ ? (
              <div className="flex gap-2">
                <Input
                  className="h-8 text-sm font-mono"
                  placeholder="0000000-00.0000.0.00.0000"
                  value={cnj}
                  onChange={e => setCnj(e.target.value)}
                />
                <Button size="sm" className="h-8" onClick={() => updateMutation.mutate({ id, numeroCNJ: cnj || undefined })}>
                  Salvar
                </Button>
              </div>
            ) : (
              <p className="text-sm font-mono">{pub.numeroCNJ || <span className="text-muted-foreground italic">Não identificado</span>}</p>
            )}
          </div>

          {/* Texto completo */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Texto da Publicação</p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
              {pub.textoCompleto}
            </div>
          </div>

          {/* Observações */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">Observações</p>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setEditObs(!editObs); setObs(pub.observacoes ?? ""); }}>
                {editObs ? "Cancelar" : pub.observacoes ? "Editar" : "Adicionar"}
              </Button>
            </div>
            {editObs ? (
              <div className="space-y-2">
                <Textarea
                  rows={3}
                  placeholder="Registre observações, providências tomadas..."
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                />
                <Button size="sm" onClick={() => updateMutation.mutate({ id, observacoes: obs || undefined })}>
                  Salvar Observações
                </Button>
              </div>
            ) : pub.observacoes ? (
              <p className="text-sm bg-muted/50 rounded-lg p-3">{pub.observacoes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Nenhuma observação registrada</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card do Kanban ───────────────────────────────────────────────────────────

function KanbanCard({
  pub,
  onClick,
  onConcluir,
  concluindo,
}: {
  pub: any;
  onClick: () => void;
  onConcluir?: (id: number) => void;
  concluindo?: boolean;
}) {
  const tipo = TIPO_CONFIG[pub.tipo] ?? TIPO_CONFIG.outro;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border-l-4 ${
        pub.lida === 0 ? "border-l-blue-500" : "border-l-transparent"
      }`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Tipo + Checkbox */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {onConcluir && pub.status !== "providenciada" && pub.status !== "arquivada" && (
              <CheckboxConclusao
                concluido={false}
                onToggle={() => onConcluir(pub.id)}
                disabled={concluindo}
                size={16}
              />
            )}
            <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${tipo.color}`}>
              {tipo.icon}{tipo.label}
            </span>
          </div>
          {pub.lida === 0 && (
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" title="Não lida" />
          )}
        </div>

        {/* Advogado */}
        {pub.advogadoNome && (
          <p className="text-xs font-medium truncate mb-1">
            {pub.advogadoNome}
            {pub.oab && <span className="text-muted-foreground font-normal"> · {pub.oab}</span>}
          </p>
        )}

        {/* Tribunal */}
        {pub.tribunal && (
          <p className="text-xs text-muted-foreground truncate mb-1">
            {[pub.tribunal, pub.comarca].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* CNJ */}
        {pub.numeroCNJ && (
          <p className="text-xs font-mono text-muted-foreground truncate mb-1">{pub.numeroCNJ}</p>
        )}

        {/* Trecho do texto */}
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
          {pub.textoCompleto?.substring(0, 100)}...
        </p>

        {/* Data */}
        <p className="text-xs text-muted-foreground mt-2">
          {formatDate(pub.dataPublicacao || pub.createdAt)}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function KanbanPublicacoes() {
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [concluindoId, setConcluindoId] = useState<number | null>(null);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroLida, setFiltroLida] = useState("todos");
  const [colunasColapsadas, setColunasColapsadas] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("kanban-publicacoes-collapsed");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  function toggleColapsarColuna(colId: string) {
    setColunasColapsadas(prev => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      localStorage.setItem("kanban-publicacoes-collapsed", JSON.stringify(Array.from(next)));
      return next;
    });
  }

  const utils = trpc.useUtils();
  const { data: publicacoes = [], isLoading } = trpc.publicacoes.listar.useQuery({ limit: 200 });

  const updateStatusMutation = trpc.publicacoes.updateStatus.useMutation({
    onSuccess: () => {
      utils.publicacoes.listar.invalidate();
      utils.publicacoes.dashboard.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleConcluirPublicacao(id: number) {
    setConcluindoId(id);
    updateStatusMutation.mutate(
      { id, status: "providenciada" },
      {
        onSuccess: () => {
          toast.success("✅ Publicação marcada como providenciada!");
          setConcluindoId(null);
        },
        onError: () => setConcluindoId(null),
      }
    );
  }

  // Publicações filtradas
  const publicacoesFiltradas = useMemo(() => {
    let lista = publicacoes as any[];
    if (filtroBusca.trim()) {
      const q = filtroBusca.toLowerCase();
      lista = lista.filter((p: any) =>
        p.advogadoNome?.toLowerCase().includes(q) ||
        p.tribunal?.toLowerCase().includes(q) ||
        p.numeroCNJ?.toLowerCase().includes(q) ||
        p.textoCompleto?.toLowerCase().includes(q)
      );
    }
    if (filtroTipo !== "todos") {
      lista = lista.filter((p: any) => p.tipo === filtroTipo);
    }
    if (filtroLida === "nao_lidas") {
      lista = lista.filter((p: any) => p.lida === 0);
    } else if (filtroLida === "lidas") {
      lista = lista.filter((p: any) => p.lida !== 0);
    }
    return lista;
  }, [publicacoes, filtroBusca, filtroTipo, filtroLida]);

  const porColuna = (colId: string) =>
    publicacoesFiltradas.filter((p: any) => p.status === colId);

  const totalNaoLidas = (publicacoes as any[]).filter((p: any) => p.lida === 0).length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/juridico/publicacoes")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Kanban de Publicações
            </h1>
            <p className="text-sm text-muted-foreground">
              {(publicacoes as any[]).length} publicação(ões)
              {totalNaoLidas > 0 && (
                <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">
                  · {totalNaoLidas} não lida(s)
                </span>
              )}
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/admin/juridico/publicacoes/monitoramentos")}>
          <Users className="h-4 w-4 mr-2" />
          Monitoramentos
        </Button>
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar publicação..."
            value={filtroBusca}
            onChange={e => setFiltroBusca(e.target.value)}
            className="w-full pl-8 pr-3 h-8 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {filtroBusca && (
            <button onClick={() => setFiltroBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroLida} onValueChange={setFiltroLida}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder="Leitura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="nao_lidas">🔵 Não lidas {totalNaoLidas > 0 ? `(${totalNaoLidas})` : ""}</SelectItem>
            <SelectItem value="lidas">Lidas</SelectItem>
          </SelectContent>
        </Select>
        {(filtroBusca || filtroTipo !== "todos" || filtroLida !== "todos") && (
          <button
            onClick={() => { setFiltroBusca(""); setFiltroTipo("todos"); setFiltroLida("todos"); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 h-8 rounded-md border hover:bg-muted/50 transition-colors"
          >
            <X className="h-3 w-3" /> Limpar
          </button>
        )}
      </div>

      {/* Kanban */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando publicações...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUNAS.map((col) => {
            const cards = porColuna(col.id);
            const collapsed = colunasColapsadas.has(col.id);

            if (collapsed) {
              return (
                <div
                  key={col.id}
                  className={`flex flex-col items-center w-12 shrink-0 rounded-xl border bg-card shadow-sm cursor-pointer hover:bg-muted/30 transition-colors py-3 gap-2 border-t-4 ${col.color}`}
                  onClick={() => toggleColapsarColuna(col.id)}
                  title={`Expandir: ${col.label} (${cards.length})`}
                >
                  <span className={col.headerText}>{col.icon}</span>
                  <Badge className={`text-xs px-1 py-0 h-5 w-full justify-center ${col.badgeColor}`}>{cards.length}</Badge>
                  <div className="flex-1" />
                  <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
                </div>
              );
            }

            return (
              <div key={col.id} className={`flex flex-col gap-2 min-w-[220px] w-56 shrink-0`}>
                {/* Header da coluna */}
                <div className={`rounded-lg p-3 border-t-4 ${col.color} ${col.headerBg}`}>
                  <div className={`flex items-center justify-between ${col.headerText}`}>
                    <div className="flex items-center gap-1.5 font-medium text-sm">
                      {col.icon}
                      {col.label}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-xs ${col.badgeColor}`}>{cards.length}</Badge>
                      <button
                        onClick={() => toggleColapsarColuna(col.id)}
                        className="opacity-50 hover:opacity-100 transition-opacity"
                        title="Minimizar coluna"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {cards.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground/50 border border-dashed rounded-lg">
                      Vazio
                    </div>
                  ) : (
                    cards.map((pub: any) => (
                      <KanbanCard
                        key={pub.id}
                        pub={pub}
                        onClick={() => setSelectedId(pub.id)}
                        onConcluir={handleConcluirPublicacao}
                        concluindo={concluindoId === pub.id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de detalhe */}
      {selectedId !== null && (
        <ModalDetalhePublicacao
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
