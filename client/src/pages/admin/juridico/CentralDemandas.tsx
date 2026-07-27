import { useState, useCallback, useEffect } from "react";
import { PrioridadeBadge, PRIORIDADE_CONFIG, prioridadeBorderClass } from "@/components/PrioridadeBadge";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Search, Filter, Kanban, List, Clock, AlertTriangle, User, Building2,
  ChevronRight, Calendar, MessageSquare, FileText, Phone, Mail, Globe, Users,
  CheckSquare, X, UserCheck, MoveRight, Flag
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CANAL_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  whatsapp:         { label: "WhatsApp",     icon: <MessageSquare className="h-3 w-3" /> },
  email:            { label: "E-mail",       icon: <Mail className="h-3 w-3" /> },
  portal:           { label: "Portal",       icon: <Globe className="h-3 w-3" /> },
  telefone:         { label: "Telefone",     icon: <Phone className="h-3 w-3" /> },
  presencial:       { label: "Presencial",   icon: <Users className="h-3 w-3" /> },
  assembleia:       { label: "Assembleia",   icon: <Building2 className="h-3 w-3" /> },
  processo_interno: { label: "Proc. Interno",icon: <FileText className="h-3 w-3" /> },
  manual:           { label: "Manual",       icon: <FileText className="h-3 w-3" /> },
};

const TIPO_OPTIONS = [
  { group: "Jurídico Consultivo", options: [
    { value: "parecer", label: "Parecer Jurídico" },
    { value: "convencao", label: "Convenção/Regimento" },
    { value: "assembleia", label: "Assembleia" },
    { value: "multa", label: "Aplicação de Multa" },
    { value: "notificacao", label: "Notificação Extrajudicial" },
    { value: "contratos", label: "Contratos" },
  ]},
  { group: "Jurídico Contencioso", options: [
    { value: "cobranca_judicial", label: "Cobrança Judicial" },
    { value: "processo", label: "Processo Judicial" },
    { value: "audiencia", label: "Audiência" },
    { value: "execucao", label: "Execução" },
    { value: "acompanhamento", label: "Acompanhamento Processual" },
  ]},
  { group: "Administrativo", options: [
    { value: "documentacao", label: "Documentação" },
    { value: "relatorio", label: "Relatório" },
    { value: "cadastro", label: "Cadastro" },
    { value: "outro", label: "Outro" },
  ]},
];

function formatDate(d: string | Date | null | undefined) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isAtrasada(prazo: string | Date | null | undefined) {
  if (!prazo) return false;
  return new Date(prazo) < new Date();
}

// ─── Modal de Criação ─────────────────────────────────────────────────────────

export interface ModalCriarDemandaInitialValues {
  assunto?: string;
  descricao?: string;
  tipo?: string;
  canal?: string;
}

export function ModalCriarDemanda({ open, onClose, colunaInicial, initialValues }: {
  open: boolean;
  onClose: () => void;
  colunaInicial?: number;
  initialValues?: ModalCriarDemandaInitialValues;
}) {
  const utils = trpc.useUtils();
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: condominios = [] } = trpc.condominios.list.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();

  const [form, setForm] = useState({
    assunto: initialValues?.assunto ?? "",
    descricao: initialValues?.descricao ?? "",
    solicitante: "",
    solicitanteTipo: "Síndico",
    canal: (initialValues?.canal ?? "manual") as any,
    tipo: (initialValues?.tipo ?? "outro") as any,
    prioridade: "media" as const,
    prazo: "",
    responsavelId: "" as string,
    responsavelNome: "",
    condominioId: "" as string,
    colunaId: colunaInicial ? String(colunaInicial) : "",
  });

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        colunaId: colunaInicial ? String(colunaInicial) : f.colunaId,
        assunto: initialValues?.assunto ?? f.assunto,
        descricao: initialValues?.descricao ?? f.descricao,
        canal: (initialValues?.canal ?? f.canal) as any,
        tipo: (initialValues?.tipo ?? f.tipo) as any,
      }));
    }
  }, [open, colunaInicial, initialValues?.assunto, initialValues?.descricao, initialValues?.canal, initialValues?.tipo]);

  const criar = trpc.juridicoDemandas.create.useMutation({
    onSuccess: () => {
      toast.success("Demanda criada com sucesso!");
      utils.juridicoDemandas.listar.invalidate();
      onClose();
      setForm({ assunto: "", descricao: "", solicitante: "", solicitanteTipo: "Síndico", canal: "manual", tipo: "outro", prioridade: "media", prazo: "", responsavelId: "", responsavelNome: "", condominioId: "", colunaId: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.assunto.trim()) return toast.error("Informe o assunto da demanda");
    if (!form.colunaId) return toast.error("Selecione a coluna/status");
    if (!form.condominioId || form.condominioId === "none") return toast.error("Selecione o condomínio/empresa");
    const condId = parseInt(form.condominioId, 10);
    if (isNaN(condId)) return toast.error("Selecione o condomínio/empresa");
    criar.mutate({
      assunto: form.assunto,
      descricao: form.descricao || undefined,
      solicitante: form.solicitante || undefined,
      solicitanteTipo: form.solicitanteTipo || undefined,
      canal: form.canal,
      tipo: form.tipo,
      prioridade: form.prioridade,
      prazo: form.prazo || null,
      responsavelId: form.responsavelId ? Number(form.responsavelId) : undefined,
      responsavelNome: form.responsavelNome || undefined,
      condominioId: condId,
      colunaId: Number(form.colunaId),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Nova Demanda Jurídica
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          {/* Assunto */}
          <div className="col-span-2">
            <Label>Assunto *</Label>
            <Input
              placeholder="Ex: Análise de convenção condominial"
              value={form.assunto}
              onChange={e => setForm(f => ({ ...f, assunto: e.target.value }))}
            />
          </div>
          {/* Condomínio */}
          <div>
            <Label>Condomínio / Empresa <span className="text-red-500">*</span></Label>
            <Select value={form.condominioId} onValueChange={v => setForm(f => ({ ...f, condominioId: v }))}>
              <SelectTrigger className={`overflow-hidden ${!form.condominioId || form.condominioId === "none" ? "border-muted" : ""}`}>
                <span className="truncate block max-w-full">
                  <SelectValue placeholder="Selecione o condomínio/empresa" />
                </span>
              </SelectTrigger>
              <SelectContent>
                {(condominios as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Coluna/Status */}
          <div>
            <Label>Status / Coluna *</Label>
            <Select value={form.colunaId} onValueChange={v => setForm(f => ({ ...f, colunaId: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
              <SelectContent>
                {colunas.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.icone} {c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Tipo */}
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPO_OPTIONS.map(group => (
                  <div key={group.group}>
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.group}</div>
                    {group.options.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Canal */}
          <div>
            <Label>Canal de Origem</Label>
            <Select value={form.canal} onValueChange={v => setForm(f => ({ ...f, canal: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CANAL_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Prioridade */}
          <div>
            <Label>Prioridade</Label>
            <Select value={form.prioridade} onValueChange={v => setForm(f => ({ ...f, prioridade: v as any }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Prazo */}
          <div>
            <Label>Prazo (SLA)</Label>
            <Input type="date" value={form.prazo} onChange={e => setForm(f => ({ ...f, prazo: e.target.value }))} />
          </div>
          {/* Solicitante */}
          <div>
            <Label>Solicitante</Label>
            <Input placeholder="Nome do solicitante" value={form.solicitante} onChange={e => setForm(f => ({ ...f, solicitante: e.target.value }))} />
          </div>
          {/* Tipo do solicitante */}
          <div>
            <Label>Tipo do Solicitante</Label>
            <Select value={form.solicitanteTipo} onValueChange={v => setForm(f => ({ ...f, solicitanteTipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Síndico", "Morador", "Administradora", "Conselho", "Advogado", "Outro"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Responsável */}
          <div className="col-span-2">
            <Label>Responsável pelo Atendimento</Label>
            <Select
              value={form.responsavelId}
              onValueChange={v => {
                const adv = advogados.find(a => String(a.id) === v);
                setForm(f => ({ ...f, responsavelId: v === "__none__" ? "" : v, responsavelNome: adv?.name ?? "" }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um advogado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum</SelectItem>
                {advogados.map(adv => (
                  <SelectItem key={adv.id} value={String(adv.id)}>{adv.name ?? "(sem nome)"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {advogados.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Nenhum advogado cadastrado. Acesse Configurações → Usuários para adicionar.</p>
            )}
          </div>
          {/* Descrição */}
          <div className="col-span-2">
            <Label>Descrição / Detalhes</Label>
            <Textarea
              placeholder="Descreva a demanda em detalhes..."
              rows={4}
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={criar.isPending}>
            {criar.isPending ? "Criando..." : "Criar Demanda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card de Demanda ──────────────────────────────────────────────────────────

function CardDemanda({ demanda, onClick, selecionado, onToggle, modoSelecao }: {
  demanda: any;
  onClick: () => void;
  selecionado?: boolean;
  onToggle?: (e: React.MouseEvent) => void;
  modoSelecao?: boolean;
}) {
  const canal = CANAL_CONFIG[demanda.canal];
  const atrasada = isAtrasada(demanda.prazo);
  const prioBorder = prioridadeBorderClass(demanda.prioridade);
  const isUrgente = demanda.prioridade === "urgente";

  return (
    <div
      className={`bg-card border border-l-4 ${prioBorder} rounded-lg overflow-hidden hover:shadow-md transition-all cursor-pointer group ${
        isUrgente ? "ring-1 ring-red-300 dark:ring-red-700" : ""
      } ${selecionado ? "ring-2 ring-primary" : ""}`}
      onClick={modoSelecao ? onToggle as any : onClick}
    >
      {/* Faixa de prioridade no topo */}
      <PrioridadeBadge prioridade={demanda.prioridade} variant="strip" />
      <div className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {modoSelecao && (
            <Checkbox
              checked={selecionado}
              onClick={e => { e.stopPropagation(); onToggle?.(e as any); }}
              className="mt-0.5"
            />
          )}
          <span className="text-xs font-mono text-muted-foreground">{demanda.numero}</span>
        </div>
        <PrioridadeBadge prioridade={demanda.prioridade} variant="pill" />
      </div>
      <h3 className="font-medium text-sm leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
        {demanda.assunto}
      </h3>
      <div className="flex flex-wrap gap-1 mb-3">
        {demanda.condominioNome && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />{demanda.condominioNome}
          </span>
        )}
        {canal && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {canal.icon}{canal.label}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {demanda.responsavelNome ? (
            <><User className="h-3 w-3" />{demanda.responsavelNome}</>
          ) : (
            <span className="text-orange-500">Sem responsável</span>
          )}
        </div>
        {demanda.prazo && (
          <div className={`flex items-center gap-1 ${atrasada ? "text-red-500 font-medium" : ""}`}>
            {atrasada && <AlertTriangle className="h-3 w-3" />}
            <Clock className="h-3 w-3" />
            {formatDate(demanda.prazo)}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function CentralDemandas() {
  const [, navigate] = useLocation();
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todas");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const [filtroResponsavel, setFiltroResponsavel] = useState("todos");
  const [filtroCondominio, setFiltroCondominio] = useState("todos");
  const [filtroAging, setFiltroAging] = useState("todos"); // todos | vencido | hoje | 7dias | 30dias | sem_prazo
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [mostrarFiltrosAvancados, setMostrarFiltrosAvancados] = useState(false);
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [modalLote, setModalLote] = useState(false);
  const [acaoLote, setAcaoLote] = useState<"reatribuir" | "mover_coluna" | "alterar_prioridade">("reatribuir");
  const [loteResponsavelId, setLoteResponsavelId] = useState("");
  const [loteResponsavelNome, setLoteResponsavelNome] = useState("");
  const [loteColunaId, setLoteColunaId] = useState("");
  const [lotePrioridade, setLotePrioridade] = useState<"baixa" | "media" | "alta" | "urgente">("media");
  const utils = trpc.useUtils();

  // Seed colunas padrão na primeira vez
  const seedMutation = trpc.juridicoDemandas.seedColunas.useMutation();
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery(undefined, {
    onSuccess: (data: any[]) => {
      if (data.length === 0) seedMutation.mutate();
    },
  } as any);

  const { data: demandas = [], isLoading } = trpc.juridicoDemandas.listar.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();
  const { data: condominios = [] } = trpc.condominios.list.useQuery();

  // Filtrar demandas
  const hoje = new Date();
  const demandasFiltradas = (demandas as any[]).filter((d: any) => {
    const matchBusca = !busca ||
      d.assunto?.toLowerCase().includes(busca.toLowerCase()) ||
      d.numero?.toLowerCase().includes(busca.toLowerCase()) ||
      d.solicitante?.toLowerCase().includes(busca.toLowerCase()) ||
      d.responsavelNome?.toLowerCase().includes(busca.toLowerCase());
    const matchPrioridade = filtroPrioridade === "todas" || d.prioridade === filtroPrioridade;
    const matchCanal = filtroCanal === "todos" || d.canal === filtroCanal;
    const matchResponsavel = filtroResponsavel === "todos"
      ? true
      : filtroResponsavel === "sem_responsavel"
        ? !d.responsavelId
        : String(d.responsavelId) === filtroResponsavel;
    const matchCondominio = filtroCondominio === "todos"
      ? true
      : String(d.condominioId) === filtroCondominio;
    const matchTipo = filtroTipo === "todos" || d.tipo === filtroTipo;
    let matchAging = true;
    if (filtroAging === "vencido") {
      matchAging = !!d.prazo && new Date(d.prazo) < hoje;
    } else if (filtroAging === "hoje") {
      if (!d.prazo) { matchAging = false; }
      else {
        const p = new Date(d.prazo);
        matchAging = p.toDateString() === hoje.toDateString();
      }
    } else if (filtroAging === "7dias") {
      if (!d.prazo) { matchAging = false; }
      else {
        const p = new Date(d.prazo);
        const diff = (p.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
        matchAging = diff >= 0 && diff <= 7;
      }
    } else if (filtroAging === "30dias") {
      if (!d.prazo) { matchAging = false; }
      else {
        const p = new Date(d.prazo);
        const diff = (p.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
        matchAging = diff >= 0 && diff <= 30;
      }
    } else if (filtroAging === "sem_prazo") {
      matchAging = !d.prazo;
    }
    return matchBusca && matchPrioridade && matchCanal && matchResponsavel && matchCondominio && matchTipo && matchAging;
  });

  // Contadores de filtros ativos
  const filtrosAtivos = [filtroPrioridade !== "todas", filtroCanal !== "todos", filtroResponsavel !== "todos", filtroCondominio !== "todos", filtroAging !== "todos", filtroTipo !== "todos"].filter(Boolean).length;

  function limparFiltros() {
    setFiltroPrioridade("todas");
    setFiltroCanal("todos");
    setFiltroResponsavel("todos");
    setFiltroCondominio("todos");
    setFiltroAging("todos");
    setFiltroTipo("todos");
    setBusca("");
  }

  function toggleSelecao(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selecionarTodos() {
    setSelecionados(new Set(demandasFiltradas.map((d: any) => d.id)));
  }

  function limparSelecao() {
    setSelecionados(new Set());
    setModoSelecao(false);
  }

  const acaoEmLote = trpc.juridicoDemandas.acaoEmLote.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.atualizadas} demanda(s) atualizadas com sucesso!`);
      utils.juridicoDemandas.listar.invalidate();
      limparSelecao();
      setModalLote(false);
    },
    onError: () => toast.error("Erro ao executar ação em lote"),
  });

  function executarAcaoLote() {
    if (selecionados.size === 0) return;
    const ids = Array.from(selecionados);
    if (acaoLote === "reatribuir") {
      acaoEmLote.mutate({ ids, acao: "reatribuir", responsavelId: loteResponsavelId ? Number(loteResponsavelId) : null, responsavelNome: loteResponsavelNome || null });
    } else if (acaoLote === "mover_coluna") {
      if (!loteColunaId) return toast.error("Selecione uma coluna");
      acaoEmLote.mutate({ ids, acao: "mover_coluna", colunaId: Number(loteColunaId) });
    } else if (acaoLote === "alterar_prioridade") {
      acaoEmLote.mutate({ ids, acao: "alterar_prioridade", prioridade: lotePrioridade });
    }
  }

  // Agrupar por coluna
  const demandasPorColuna = (colunas as any[]).map((col: any) => ({
    coluna: col,
    demandas: demandasFiltradas.filter((d: any) => d.colunaId === col.id),
  }));

  const totalAtrasadas = (demandas as any[]).filter((d: any) => isAtrasada(d.prazo)).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Central de Demandas Jurídicas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {(demandas as any[]).length} demandas no total
            {totalAtrasadas > 0 && (
              <span className="ml-2 text-red-500 font-medium">
                · {totalAtrasadas} em atraso
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={modoSelecao ? "default" : "outline"}
            size="sm"
            onClick={() => { setModoSelecao(v => !v); setSelecionados(new Set()); }}
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            {modoSelecao ? "Cancelar seleção" : "Selecionar"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/juridico/kanban")}>
            <Kanban className="h-4 w-4 mr-2" />
            Ver Kanban
          </Button>
          <Button onClick={() => setModalAberto(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Demanda
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-3">
        {/* Barra principal */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por assunto, número, solicitante..."
              className="pl-9"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <Select value={filtroPrioridade} onValueChange={setFiltroPrioridade}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {Object.entries(PRIORIDADE_CONFIG).map(([k]) => (
                <SelectItem key={k} value={k}>
                  <PrioridadeBadge prioridade={k} variant="dot" />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={mostrarFiltrosAvancados ? "default" : "outline"}
            size="sm"
            onClick={() => setMostrarFiltrosAvancados(v => !v)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            Filtros
            {filtrosAtivos > 0 && (
              <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                {filtrosAtivos}
              </Badge>
            )}
          </Button>
          {filtrosAtivos > 0 && (
            <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground">
              Limpar filtros
            </Button>
          )}
        </div>

        {/* Filtros avançados */}
        {mostrarFiltrosAvancados && (
          <div className="flex flex-wrap gap-3 p-4 rounded-lg border bg-muted/30">
            <Select value={filtroResponsavel} onValueChange={setFiltroResponsavel}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os responsáveis</SelectItem>
                <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                {(advogados as any[]).map((a: any) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroCondominio} onValueChange={setFiltroCondominio}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Condomínio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os condomínios</SelectItem>
                {(condominios as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroAging} onValueChange={setFiltroAging}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Prazo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os prazos</SelectItem>
                <SelectItem value="vencido">⚠ Vencidos</SelectItem>
                <SelectItem value="hoje">Vencem hoje</SelectItem>
                <SelectItem value="7dias">Próximos 7 dias</SelectItem>
                <SelectItem value="30dias">Próximos 30 dias</SelectItem>
                <SelectItem value="sem_prazo">Sem prazo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filtroCanal} onValueChange={setFiltroCanal}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os canais</SelectItem>
                {Object.entries(CANAL_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                {TIPO_OPTIONS.map(group => group.options.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                )))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Chips de filtros ativos */}
        {filtrosAtivos > 0 && (
          <div className="flex flex-wrap gap-2">
            {filtroPrioridade !== "todas" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFiltroPrioridade("todas")}>
                Prioridade: {filtroPrioridade} ×
              </Badge>
            )}
            {filtroResponsavel !== "todos" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFiltroResponsavel("todos")}>
                Responsável: {filtroResponsavel === "sem_responsavel" ? "Sem responsável" : (advogados as any[]).find((a: any) => String(a.id) === filtroResponsavel)?.name ?? filtroResponsavel} ×
              </Badge>
            )}
            {filtroCondominio !== "todos" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFiltroCondominio("todos")}>
                Cond.: {(condominios as any[]).find((c: any) => String(c.id) === filtroCondominio)?.nome ?? filtroCondominio} ×
              </Badge>
            )}
            {filtroAging !== "todos" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFiltroAging("todos")}>
                Prazo: {filtroAging === "vencido" ? "Vencidos" : filtroAging === "hoje" ? "Hoje" : filtroAging === "7dias" ? "7 dias" : filtroAging === "30dias" ? "30 dias" : "Sem prazo"} ×
              </Badge>
            )}
            {filtroCanal !== "todos" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFiltroCanal("todos")}>
                Canal: {CANAL_CONFIG[filtroCanal]?.label ?? filtroCanal} ×
              </Badge>
            )}
            {filtroTipo !== "todos" && (
              <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setFiltroTipo("todos")}>
                Tipo: {TIPO_OPTIONS.flatMap(g => g.options).find(o => o.value === filtroTipo)?.label ?? filtroTipo} ×
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Barra de ações em lote */}
      {modoSelecao && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-primary/5 border-primary/20">
          <Checkbox
            checked={selecionados.size === demandasFiltradas.length && demandasFiltradas.length > 0}
            onCheckedChange={checked => checked ? selecionarTodos() : setSelecionados(new Set())}
          />
          <span className="text-sm font-medium">
            {selecionados.size === 0 ? "Nenhuma selecionada" : `${selecionados.size} selecionada(s)`}
          </span>
          {selecionados.size > 0 && (
            <>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => { setAcaoLote("reatribuir"); setModalLote(true); }}>
                <UserCheck className="h-4 w-4" />Reatribuir
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => { setAcaoLote("mover_coluna"); setModalLote(true); }}>
                <MoveRight className="h-4 w-4" />Mover coluna
              </Button>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => { setAcaoLote("alterar_prioridade"); setModalLote(true); }}>
                <Flag className="h-4 w-4" />Prioridade
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={limparSelecao}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Listagem por coluna */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando demandas...</div>
      ) : demandasFiltradas.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-muted-foreground">Nenhuma demanda encontrada</p>
          <Button className="mt-4" onClick={() => setModalAberto(true)}>
            <Plus className="h-4 w-4 mr-2" />Criar primeira demanda
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {demandasPorColuna.filter(g => g.demandas.length > 0).map(({ coluna, demandas: ds }) => (
            <div key={coluna.id}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{coluna.icone}</span>
                <h2 className="font-semibold text-sm">{coluna.nome}</h2>
                <Badge variant="secondary" className="text-xs">{ds.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {ds.map((d: any) => (
                  <CardDemanda
                    key={d.id}
                    demanda={d}
                    onClick={() => navigate(`/admin/juridico/demanda/${d.id}`)}
                    selecionado={selecionados.has(d.id)}
                    onToggle={() => toggleSelecao(d.id)}
                    modoSelecao={modoSelecao}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalCriarDemanda open={modalAberto} onClose={() => setModalAberto(false)} />

      {/* Modal de ação em lote */}
      <Dialog open={modalLote} onOpenChange={setModalLote}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acaoLote === "reatribuir" && "Reatribuir Responsável"}
              {acaoLote === "mover_coluna" && "Mover para Coluna"}
              {acaoLote === "alterar_prioridade" && "Alterar Prioridade"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta ação será aplicada a <strong>{selecionados.size}</strong> demanda(s) selecionada(s).
            </p>
            {acaoLote === "reatribuir" && (
              <div className="space-y-2">
                <Label>Novo responsável</Label>
                <Select value={loteResponsavelId} onValueChange={v => {
                  const adv = (advogados as any[]).find((a: any) => String(a.id) === v);
                  setLoteResponsavelId(v === "__none__" ? "" : v);
                  setLoteResponsavelNome(adv?.name ?? "");
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um advogado..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Remover responsável</SelectItem>
                    {(advogados as any[]).map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {acaoLote === "mover_coluna" && (
              <div className="space-y-2">
                <Label>Coluna de destino</Label>
                <Select value={loteColunaId} onValueChange={setLoteColunaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma coluna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(colunas as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.icone} {c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {acaoLote === "alterar_prioridade" && (
              <div className="space-y-2">
                <Label>Nova prioridade</Label>
                <Select value={lotePrioridade} onValueChange={v => setLotePrioridade(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalLote(false)}>Cancelar</Button>
            <Button onClick={executarAcaoLote} disabled={acaoEmLote.isPending}>
              {acaoEmLote.isPending ? "Aplicando..." : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
