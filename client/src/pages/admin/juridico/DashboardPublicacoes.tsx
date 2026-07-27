import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Bell, BookOpen, Clock, CheckCircle2, Archive, Eye, EyeOff,
  Plus, Filter, ChevronRight, AlertTriangle, FileText, Gavel,
  Calendar, Building2, Scale, Users, Newspaper, ExternalLink,
  CheckCheck, RefreshCw
} from "lucide-react";

// ─── Config de Tipos e Status ─────────────────────────────────────────────────

const TIPO_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  intimacao:  { label: "Intimação",    icon: <Bell className="h-3.5 w-3.5" />,       color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  sentenca:   { label: "Sentença",     icon: <Gavel className="h-3.5 w-3.5" />,      color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300" },
  despacho:   { label: "Despacho",     icon: <FileText className="h-3.5 w-3.5" />,   color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300" },
  audiencia:  { label: "Audiência",    icon: <Calendar className="h-3.5 w-3.5" />,   color: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300" },
  decisao:    { label: "Decisão",      icon: <Scale className="h-3.5 w-3.5" />,      color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300" },
  outro:      { label: "Outro",        icon: <BookOpen className="h-3.5 w-3.5" />,   color: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  nova:                   { label: "Nova",                  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",     icon: <Bell className="h-3 w-3" /> },
  analisando:             { label: "Analisando",            color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: <Eye className="h-3 w-3" /> },
  aguardando_providencia: { label: "Aguard. Providência",   color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", icon: <Clock className="h-3 w-3" /> },
  providenciada:          { label: "Providenciada",         color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",  icon: <CheckCircle2 className="h-3 w-3" /> },
  arquivada:              { label: "Arquivada",             color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",    icon: <Archive className="h-3 w-3" /> },
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function truncate(text: string, max = 160) {
  if (!text) return "";
  return text.length > max ? text.substring(0, max) + "..." : text;
}

// ─── Modal Criar Publicação Manual ────────────────────────────────────────────

function ModalCriarPublicacao({ open, onClose }: { open: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: monitoramentos = [] } = trpc.publicacoes.monitoramentos.listar.useQuery();
  const [form, setForm] = useState({
    monitoramentoId: "",
    tribunal: "",
    comarca: "",
    vara: "",
    dataPublicacao: "",
    tipo: "intimacao" as string,
    textoCompleto: "",
    numeroCNJ: "",
    responsavelNome: "",
  });
  const createMutation = trpc.publicacoes.criarManual.useMutation({
    onSuccess: () => {
      toast.success("Publicação registrada!");
      utils.publicacoes.listar.invalidate();
      utils.publicacoes.dashboard.invalidate();
      onClose();
      setForm({ monitoramentoId: "", tribunal: "", comarca: "", vara: "", dataPublicacao: "", tipo: "intimacao", textoCompleto: "", numeroCNJ: "", responsavelNome: "" });
    },
    onError: (e) => toast.error(e.message),
  });
  const handleSubmit = () => {
    if (!form.textoCompleto.trim()) return toast.error("Informe o texto da publicação");
    createMutation.mutate({
      monitoramentoId: form.monitoramentoId ? Number(form.monitoramentoId) : undefined,
      tribunal: form.tribunal || undefined,
      comarca: form.comarca || undefined,
      vara: form.vara || undefined,
      dataPublicacao: form.dataPublicacao ? form.dataPublicacao : undefined,
      tipo: form.tipo as any,
      textoCompleto: form.textoCompleto,
      numeroCNJ: form.numeroCNJ || undefined,
      responsavelNome: form.responsavelNome || undefined,
    });
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar Publicação Manual</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div>
            <Label>Monitoramento (Advogado)</Label>
            <Select value={form.monitoramentoId} onValueChange={(v) => setForm(f => ({ ...f, monitoramentoId: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar (opcional)" /></SelectTrigger>
              <SelectContent>
                {(monitoramentos as any[]).map((m: any) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.advogadoNome} {m.oab ? `· ${m.oab}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={(v) => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tribunal</Label>
            <Input placeholder="Ex: TJRJ" value={form.tribunal} onChange={e => setForm(f => ({ ...f, tribunal: e.target.value }))} />
          </div>
          <div>
            <Label>Data de Publicação</Label>
            <Input type="date" value={form.dataPublicacao} onChange={e => setForm(f => ({ ...f, dataPublicacao: e.target.value }))} />
          </div>
          <div>
            <Label>Comarca</Label>
            <Input placeholder="Ex: Rio de Janeiro" value={form.comarca} onChange={e => setForm(f => ({ ...f, comarca: e.target.value }))} />
          </div>
          <div>
            <Label>Vara</Label>
            <Input placeholder="Ex: 3ª Vara Cível" value={form.vara} onChange={e => setForm(f => ({ ...f, vara: e.target.value }))} />
          </div>
          <div>
            <Label>Número CNJ do Processo</Label>
            <Input placeholder="0000000-00.0000.0.00.0000" value={form.numeroCNJ} onChange={e => setForm(f => ({ ...f, numeroCNJ: e.target.value }))} />
          </div>
          <div>
            <Label>Advogado Responsável</Label>
            <Input placeholder="Nome do responsável" value={form.responsavelNome} onChange={e => setForm(f => ({ ...f, responsavelNome: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label>Texto da Publicação *</Label>
            <Textarea
              placeholder="Cole aqui o texto completo da publicação do diário oficial..."
              rows={6}
              value={form.textoCompleto}
              onChange={e => setForm(f => ({ ...f, textoCompleto: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Registrar Publicação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card de Publicação Manual ────────────────────────────────────────────────

function CardPublicacao({ pub, onClick }: { pub: any; onClick: () => void }) {
  const tipo = TIPO_CONFIG[pub.tipo] ?? TIPO_CONFIG.outro;
  const status = STATUS_CONFIG[pub.status] ?? STATUS_CONFIG.nova;

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border-l-4 ${
        pub.lida === 0 ? "border-l-blue-500" : "border-l-transparent"
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {pub.lida === 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <EyeOff className="h-3 w-3" /> Não lida
                </span>
              )}
              <Badge variant="outline" className={`text-xs flex items-center gap-1 ${tipo.color}`}>
                {tipo.icon}{tipo.label}
              </Badge>
              <Badge variant="secondary" className={`text-xs flex items-center gap-1 ${status.color}`}>
                {status.icon}{status.label}
              </Badge>
            </div>
            {pub.advogadoNome && (
              <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                {pub.advogadoNome}
                {pub.oab && <span className="text-muted-foreground font-normal">· {pub.oab}</span>}
              </div>
            )}
            {(pub.tribunal || pub.vara) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Building2 className="h-3.5 w-3.5" />
                {[pub.tribunal, pub.comarca, pub.vara].filter(Boolean).join(" · ")}
              </div>
            )}
            {pub.numeroCNJ && (
              <div className="text-xs text-muted-foreground mb-1">
                Processo: <span className="font-mono">{pub.numeroCNJ}</span>
              </div>
            )}
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {truncate(pub.textoCompleto)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatDate(pub.dataPublicacao || pub.createdAt)}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Linha de Publicação PJe (tabela) ────────────────────────────────────────

function LinhaPjePublicacao({ pub, onMarcarLida, onClick }: { pub: any; onMarcarLida: (id: number) => void; onClick?: () => void }) {
  return (
    <tr
      className={`border-b border-border transition-colors hover:bg-muted/40 cursor-pointer ${
        pub.lida === 0 ? "bg-blue-50/40 dark:bg-blue-900/10" : ""
      }`}
      onClick={onClick}
    >
      {/* Divulgado em */}
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
        <div className="flex items-center gap-1">
          {pub.lida === 0 && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />}
          {pub.dataDisponibilizacao
            ? new Date(pub.dataDisponibilizacao + "T12:00:00").toLocaleDateString("pt-BR")
            : "—"}
        </div>
      </td>

      {/* Tipo */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          {pub.tipoComunicacao && (
            <span className="text-xs font-medium text-foreground">{pub.tipoComunicacao}</span>
          )}
          {pub.tipoDocumento && (
            <span className="text-xs text-muted-foreground">{pub.tipoDocumento}</span>
          )}
          {!pub.tipoComunicacao && !pub.tipoDocumento && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>

      {/* Processo */}
      <td className="px-3 py-2.5">
        {pub.numeroProcessoMascara ? (
          <span className="text-xs font-mono text-foreground">{pub.numeroProcessoMascara}</span>
        ) : pub.numeroProcesso ? (
          <span className="text-xs font-mono text-foreground">{pub.numeroProcesso}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Diário */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          {pub.siglaTribunal && (
            <span className="text-xs font-medium text-foreground">{pub.siglaTribunal}</span>
          )}
          {pub.nomeOrgao && (
            <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={pub.nomeOrgao}>
              {pub.nomeOrgao}
            </span>
          )}
          {!pub.siglaTribunal && !pub.nomeOrgao && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </td>

      {/* Nome pesquisado */}
      <td className="px-3 py-2.5">
        {pub.nomePesquisado ? (
          <span className="text-xs text-foreground">{pub.nomePesquisado}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {pub.lida === 0 ? (
            <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 h-5 px-1.5">
              Não lida
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground h-5 px-1.5">
              Lida
            </Badge>
          )}
          {pub.lida === 0 && (
            <button
              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
              onClick={(e) => { e.stopPropagation(); onMarcarLida(pub.id); }}
            >
              <CheckCheck className="h-3 w-3 inline mr-0.5" />
              Marcar lida
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Aba PJe (Diário Oficial RJ) ─────────────────────────────────────────────

function AbaDoerj() {
  const [filtroLida, setFiltroLida] = useState<"todas" | "nao_lidas" | "lidas">("todas");
  const utils = trpc.useUtils();
  const [, navigatePje] = useLocation();

  const { data: resultado, isLoading, refetch } = trpc.pjePublicacoes.listar.useQuery({
    lida: filtroLida,
    limite: 100,
    offset: 0,
  });

  const publicacoes = resultado?.publicacoes ?? [];
  const totalNaoLidas = resultado?.totalNaoLidas ?? 0;

  const buscarAgoraMutation = trpc.pjePublicacoes.buscarAgora.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.message}`);
      utils.pjePublicacoes.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const marcarLidaMutation = trpc.pjePublicacoes.marcarLida.useMutation({
    onSuccess: () => utils.pjePublicacoes.listar.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const marcarTodasMutation = trpc.pjePublicacoes.marcarTodasLidas.useMutation({
    onSuccess: () => {
      toast.success("Todas as publicações marcadas como lidas!");
      utils.pjePublicacoes.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Barra de ações */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filtrar:</span>
        </div>
        <Select value={filtroLida} onValueChange={(v) => setFiltroLida(v as any)}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Leitura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            <SelectItem value="nao_lidas">Não lidas</SelectItem>
            <SelectItem value="lidas">Lidas</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {publicacoes.length} publicação(ões)
          {totalNaoLidas > 0 && (
            <span className="ml-2 text-blue-600 font-medium">· {totalNaoLidas} não lida(s)</span>
          )}
        </span>
        {totalNaoLidas > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => marcarTodasMutation.mutate()}
            disabled={marcarTodasMutation.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            Marcar todas como lidas
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => buscarAgoraMutation.mutate({})}
          disabled={buscarAgoraMutation.isPending}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${buscarAgoraMutation.isPending ? "animate-spin" : ""}`} />
          {buscarAgoraMutation.isPending ? "Buscando..." : "Buscar Agora"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando publicações do PJe...</div>
      ) : publicacoes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">Nenhuma publicação encontrada</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em <strong>Buscar Agora</strong> para pesquisar publicações na API PJe,
              ou aguarde o job diário às 08h.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Divulgado em</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Tipo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Processo</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Diário</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Nome pesquisado</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {publicacoes.map((pub) => (
                <LinhaPjePublicacao
                  key={pub.id}
                  pub={pub}
                  onMarcarLida={(id: number) => marcarLidaMutation.mutate({ id })}
                  onClick={() => {
                    if (pub.lida === 0) marcarLidaMutation.mutate({ id: pub.id });
                    navigatePje(`/admin/juridico/publicacoes/${pub.id}`);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function DashboardPublicacoes() {
  const [, navigate] = useLocation();
  const [modalCriar, setModalCriar] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"manuais" | "doerj">("doerj");
  const [filtroStatus, setFiltroStatus] = useState<string>("todas");
  const [filtroLida, setFiltroLida] = useState<string>("todas");

  const { data: dashboard } = trpc.publicacoes.dashboard.useQuery();
  const { data: contadorDoerj } = trpc.doerj.contadorNaoLidas.useQuery();
  const { data: publicacoes = [], isLoading, refetch } = trpc.publicacoes.listar.useQuery({
    status: filtroStatus !== "todas" ? filtroStatus : undefined,
    lida: filtroLida === "nao_lidas" ? 0 : filtroLida === "lidas" ? 1 : undefined,
    limit: 100,
  });
  const utils = trpc.useUtils();
  const marcarLidaMutation = trpc.publicacoes.marcarLida.useMutation({
    onSuccess: () => {
      utils.publicacoes.listar.invalidate();
      utils.publicacoes.dashboard.invalidate();
    },
  });
  const updateStatusMutation = trpc.publicacoes.updateStatus.useMutation({
    onSuccess: () => {
      utils.publicacoes.listar.invalidate();
      utils.publicacoes.dashboard.invalidate();
      toast.success("Status atualizado!");
    },
    onError: (e) => toast.error(e.message),
  });
  const handleCardClick = (pub: any) => {
    if (pub.lida === 0) marcarLidaMutation.mutate({ id: pub.id });
    navigate(`/admin/juridico/publicacoes/${pub.id}`);
  };

  const naoLidasDoerj = contadorDoerj?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Publicações Jurídicas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento de diários oficiais e publicações dos tribunais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/juridico/publicacoes/kanban")}>
            <Scale className="h-4 w-4 mr-2" />
            Kanban
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/juridico/publicacoes/monitoramentos")}>
            <Users className="h-4 w-4 mr-2" />
            Monitoramentos
          </Button>
          <Button onClick={() => setModalCriar(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Publicação
          </Button>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Publicações Hoje</p>
                <p className="text-2xl font-bold text-blue-600">{dashboard?.hoje ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600">
                <Bell className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Não Lidas (manuais)</p>
                <p className="text-2xl font-bold text-red-600">{dashboard?.naoLidas ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600">
                <EyeOff className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-all" onClick={() => setAbaAtiva("doerj")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">DOERJ Não Lidas</p>
                <p className="text-2xl font-bold text-green-600">{naoLidasDoerj}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600">
                <Newspaper className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Arquivadas</p>
                <p className="text-2xl font-bold text-slate-500">{dashboard?.arquivadas ?? 0}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500">
                <Archive className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <div className="border-b border-border">
        <div className="flex gap-0">
          <button
            onClick={() => setAbaAtiva("doerj")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              abaAtiva === "doerj"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Newspaper className="h-4 w-4" />
            Diário Oficial RJ
            {naoLidasDoerj > 0 && (
              <Badge className="text-xs bg-green-500 text-white h-5 px-1.5">{naoLidasDoerj}</Badge>
            )}
          </button>
          <button
            onClick={() => setAbaAtiva("manuais")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              abaAtiva === "manuais"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileText className="h-4 w-4" />
            Publicações Manuais
            {(dashboard?.naoLidas ?? 0) > 0 && (
              <Badge className="text-xs bg-red-500 text-white h-5 px-1.5">{dashboard?.naoLidas}</Badge>
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo da aba */}
      {abaAtiva === "doerj" ? (
        <AbaDoerj />
      ) : (
        <div className="space-y-3">
          {/* Publicações por Advogado */}
          {dashboard?.porAdvogado && (dashboard.porAdvogado as any[]).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Publicações por Advogado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(dashboard.porAdvogado as any[]).map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                      <span className="text-sm font-medium">{a.advogadoNome}</span>
                      {a.oab && <span className="text-xs text-muted-foreground">{a.oab}</span>}
                      <Badge variant="secondary" className="text-xs">{a.total} pub.</Badge>
                      {a.naoLidas > 0 && (
                        <Badge className="text-xs bg-red-500 text-white">{a.naoLidas} não lidas</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filtros + Listagem */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filtrar:</span>
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroLida} onValueChange={setFiltroLida}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder="Leitura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="nao_lidas">Não lidas</SelectItem>
                <SelectItem value="lidas">Lidas</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {(publicacoes as any[]).length} publicação(ões)
            </span>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Carregando publicações...</div>
          ) : (publicacoes as any[]).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground font-medium">Nenhuma publicação encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Cadastre monitoramentos para captura automática ou registre publicações manualmente.
                </p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button variant="outline" size="sm" onClick={() => navigate("/admin/juridico/publicacoes/monitoramentos")}>
                    <Users className="h-4 w-4 mr-1" />
                    Cadastrar Monitoramento
                  </Button>
                  <Button size="sm" onClick={() => setModalCriar(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Registrar Manual
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(publicacoes as any[]).map((pub: any) => (
                <CardPublicacao key={pub.id} pub={pub} onClick={() => handleCardClick(pub)} />
              ))}
            </div>
          )}
        </div>
      )}

      <ModalCriarPublicacao open={modalCriar} onClose={() => setModalCriar(false)} />
    </div>
  );
}
