import { useState, useEffect } from "react";
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
import {
  Plus, Search, Filter, Kanban, List, Clock, AlertTriangle, User, Building2,
  ChevronRight, Calendar, MessageSquare, FileText, Phone, Mail, Globe, Users
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORIDADE_CONFIG = {
  baixa:   { label: "Baixa",   color: "bg-slate-100 text-slate-700 border-slate-200" },
  media:   { label: "Média",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  alta:    { label: "Alta",    color: "bg-orange-100 text-orange-700 border-orange-200" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700 border-red-200" },
};

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

function ModalCriarDemanda({ open, onClose, colunaInicial }: {
  open: boolean;
  onClose: () => void;
  colunaInicial?: number;
}) {
  const utils = trpc.useUtils();
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: condominios = [] } = trpc.condominios.list.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();

  const [form, setForm] = useState({
    assunto: "",
    descricao: "",
    solicitante: "",
    solicitanteTipo: "Síndico",
    canal: "manual" as const,
    tipo: "outro" as const,
    prioridade: "media" as const,
    prazo: "",
    responsavelNome: "",
    condominioId: "" as string,
    colunaId: colunaInicial ? String(colunaInicial) : "",
  });

  useEffect(() => {
    if (open && colunaInicial) setForm(f => ({ ...f, colunaId: String(colunaInicial) }));
  }, [open, colunaInicial]);

  const criar = trpc.juridicoDemandas.create.useMutation({
    onSuccess: () => {
      toast.success("Demanda criada com sucesso!");
      utils.juridicoDemandas.listar.invalidate();
      onClose();
      setForm({ assunto: "", descricao: "", solicitante: "", solicitanteTipo: "Síndico", canal: "manual", tipo: "outro", prioridade: "media", prazo: "", responsavelNome: "", condominioId: "", colunaId: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.assunto.trim()) return toast.error("Informe o assunto da demanda");
    if (!form.colunaId) return toast.error("Selecione a coluna/status");
    criar.mutate({
      assunto: form.assunto,
      descricao: form.descricao || undefined,
      solicitante: form.solicitante || undefined,
      solicitanteTipo: form.solicitanteTipo || undefined,
      canal: form.canal,
      tipo: form.tipo,
      prioridade: form.prioridade,
      prazo: form.prazo || null,
      responsavelNome: form.responsavelNome || undefined,
      condominioId: form.condominioId ? Number(form.condominioId) : null,
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
            <Label>Condomínio</Label>
            <Select value={form.condominioId} onValueChange={v => setForm(f => ({ ...f, condominioId: v }))}>
              <SelectTrigger><SelectValue placeholder="Todos os condomínios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem condomínio específico</SelectItem>
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
            <Select value={form.responsavelNome} onValueChange={v => setForm(f => ({ ...f, responsavelNome: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um advogado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum</SelectItem>
                {advogados.map(adv => (
                  <SelectItem key={adv.id} value={adv.name ?? ""}>{adv.name ?? "(sem nome)"}</SelectItem>
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

function CardDemanda({ demanda, onClick }: { demanda: any; onClick: () => void }) {
  const prio = PRIORIDADE_CONFIG[demanda.prioridade as keyof typeof PRIORIDADE_CONFIG];
  const canal = CANAL_CONFIG[demanda.canal];
  const atrasada = isAtrasada(demanda.prazo);

  return (
    <div
      className="bg-card border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-mono text-muted-foreground">{demanda.numero}</span>
        <Badge variant="outline" className={`text-xs ${prio?.color}`}>{prio?.label}</Badge>
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
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function CentralDemandas() {
  const [, navigate] = useLocation();
  const [modalAberto, setModalAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todas");
  const [filtroCanal, setFiltroCanal] = useState("todos");
  const utils = trpc.useUtils();

  // Seed colunas padrão na primeira vez
  const seedMutation = trpc.juridicoDemandas.seedColunas.useMutation();
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery(undefined, {
    onSuccess: (data: any[]) => {
      if (data.length === 0) seedMutation.mutate();
    },
  } as any);

  const { data: demandas = [], isLoading } = trpc.juridicoDemandas.listar.useQuery();

  // Filtrar demandas
  const demandasFiltradas = (demandas as any[]).filter((d: any) => {
    const matchBusca = !busca ||
      d.assunto?.toLowerCase().includes(busca.toLowerCase()) ||
      d.numero?.toLowerCase().includes(busca.toLowerCase()) ||
      d.solicitante?.toLowerCase().includes(busca.toLowerCase()) ||
      d.responsavelNome?.toLowerCase().includes(busca.toLowerCase());
    const matchPrioridade = filtroPrioridade === "todas" || d.prioridade === filtroPrioridade;
    const matchCanal = filtroCanal === "todos" || d.canal === filtroCanal;
    return matchBusca && matchPrioridade && matchCanal;
  });

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
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar demandas..."
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
            {Object.entries(PRIORIDADE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
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
      </div>

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
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalCriarDemanda open={modalAberto} onClose={() => setModalAberto(false)} />
    </div>
  );
}
