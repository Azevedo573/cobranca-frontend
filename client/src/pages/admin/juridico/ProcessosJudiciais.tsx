import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Scale,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  Calendar,
  Building2,
  User,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  civel: "Cível",
  trabalhista: "Trabalhista",
  previdenciario: "Previdenciário",
  criminal: "Criminal",
  tributario: "Tributário",
  administrativo: "Administrativo",
  outro: "Outro",
};

const FASE_LABELS: Record<string, string> = {
  distribuicao: "Distribuição",
  citacao: "Citação",
  contestacao: "Contestação",
  instrucao: "Instrução",
  audiencia: "Audiência",
  sentenca: "Sentença",
  recurso: "Recurso",
  transito_julgado: "Trânsito em Julgado",
  execucao: "Execução",
  arquivado: "Arquivado",
  outro: "Outro",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ativo:     { label: "Ativo",     color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  suspenso:  { label: "Suspenso",  color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",         icon: <Clock className="w-3 h-3" /> },
  arquivado: { label: "Arquivado", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",         icon: <XCircle className="w-3 h-3" /> },
  encerrado: { label: "Encerrado", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",             icon: <CheckCircle2 className="w-3 h-3" /> },
};

const TIPO_COLORS: Record<string, string> = {
  civel:          "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  trabalhista:    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  previdenciario: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  criminal:       "bg-red-500/15 text-red-600 dark:text-red-400",
  tributario:     "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  administrativo: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  outro:          "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

function formatarCNJ(numero: string): string {
  const n = numero.replace(/\D/g, "");
  if (n.length === 20) {
    return `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n[13]}.${n.slice(14, 16)}.${n.slice(16)}`;
  }
  return numero;
}

function formatarMoeda(centavos: number | null | undefined): string {
  if (!centavos) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

// ─── Modal: Criar/Importar Processo ──────────────────────────────────────────

interface ModalCriarProcessoProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function ModalCriarProcesso({ open, onClose, onSuccess }: ModalCriarProcessoProps) {
  const [modo, setModo] = useState<"manual" | "datajud">("datajud");
  const [buscandoDatajud, setBuscandoDatajud] = useState(false);
  const [dadosDatajud, setDadosDatajud] = useState<any>(null);

  const [form, setForm] = useState({
    numeroCNJ: "",
    tribunal: "",
    tribunalAlias: "",
    comarca: "",
    vara: "",
    classe: "",
    assunto: "",
    tipo: "civel" as const,
    faseProcessual: "distribuicao" as const,
    status: "ativo" as const,
    condominioNome: "",
    advogadoNome: "",
    valorCausa: "",
    observacoes: "",
  });

  const { data: tribunais } = trpc.processos.listarTribunais.useQuery();
  const buscarDatajud = trpc.processos.buscarDataJud.useMutation();
  const criarProcesso = trpc.processos.create.useMutation();

  const handleBuscarDatajud = async () => {
    if (!form.numeroCNJ.trim()) { toast.error("Informe o número CNJ"); return; }
    setBuscandoDatajud(true);
    try {
      const resultado = await buscarDatajud.mutateAsync({
        numeroCNJ: form.numeroCNJ.trim(),
        tribunalAlias: form.tribunalAlias || undefined,
      });
      if (!resultado.encontrado || !resultado.processo) {
        toast.error("Processo não encontrado no DataJud", { description: "Verifique o número CNJ ou selecione o tribunal manualmente." });
        return;
      }
      const p = resultado.processo;
      setDadosDatajud(resultado);
      setForm(prev => ({
        ...prev,
        tribunal: resultado.tribunal ?? p.tribunal ?? prev.tribunal,
        classe: p.classe ?? prev.classe,
        assunto: p.assunto ?? prev.assunto,
        vara: p.vara ?? prev.vara,
      }));
      toast.success("Processo encontrado no DataJud!", { description: `${p.classe ?? ""} — ${p.assunto ?? ""}` });
    } catch (err: any) {
      toast.error("Erro ao consultar DataJud", { description: err.message });
    } finally {
      setBuscandoDatajud(false);
    }
  };

  const handleSalvar = async () => {
    if (!form.numeroCNJ.trim()) { toast.error("Número CNJ é obrigatório"); return; }
    if (!form.tribunal.trim()) { toast.error("Tribunal é obrigatório"); return; }
    try {
      await criarProcesso.mutateAsync({
        numeroCNJ: form.numeroCNJ.trim(),
        tribunal: form.tribunal.trim(),
        tribunalAlias: form.tribunalAlias || undefined,
        comarca: form.comarca || undefined,
        vara: form.vara || undefined,
        classe: form.classe || undefined,
        assunto: form.assunto || undefined,
        tipo: form.tipo,
        faseProcessual: form.faseProcessual,
        status: form.status,
        condominioNome: form.condominioNome || undefined,
        advogadoNome: form.advogadoNome || undefined,
        valorCausa: form.valorCausa ? Math.round(parseFloat(form.valorCausa.replace(",", ".")) * 100) : undefined,
        observacoes: form.observacoes || undefined,
        datajudId: dadosDatajud?.processo?.datajudId ?? undefined,
        datajudSincronizadoEm: dadosDatajud ? new Date() : undefined,
      });
      toast.success("Processo criado com sucesso!");
      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      toast.error("Erro ao criar processo", { description: err.message });
    }
  };

  const resetForm = () => {
    setForm({
      numeroCNJ: "", tribunal: "", tribunalAlias: "", comarca: "", vara: "",
      classe: "", assunto: "", tipo: "civel", faseProcessual: "distribuicao",
      status: "ativo", condominioNome: "", advogadoNome: "", valorCausa: "", observacoes: "",
    });
    setDadosDatajud(null);
    setModo("datajud");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Novo Processo Judicial
          </DialogTitle>
        </DialogHeader>

        {/* Modo de entrada */}
        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setModo("datajud")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              modo === "datajud"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Download className="w-4 h-4 inline mr-1.5" />
            Importar do DataJud
          </button>
          <button
            onClick={() => setModo("manual")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              modo === "manual"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="w-4 h-4 inline mr-1.5" />
            Cadastro Manual
          </button>
        </div>

        <div className="space-y-4">
          {/* Número CNJ */}
          <div className="space-y-1.5">
            <Label>Número CNJ *</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0000000-00.0000.0.00.0000"
                value={form.numeroCNJ}
                onChange={(e) => setForm(p => ({ ...p, numeroCNJ: e.target.value }))}
                className="flex-1"
              />
              {modo === "datajud" && (
                <Button onClick={handleBuscarDatajud} disabled={buscandoDatajud} className="shrink-0">
                  {buscandoDatajud ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {buscandoDatajud ? "Buscando..." : "Buscar"}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              O tribunal é detectado automaticamente pelo número CNJ
            </p>
          </div>

          {/* Tribunal + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tribunal *</Label>
              <Select
                value={form.tribunal}
                onValueChange={(v) => {
                  const t = tribunais?.find(t => t.sigla === v);
                  setForm(p => ({ ...p, tribunal: v, tribunalAlias: t?.alias ?? "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tribunal" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {tribunais?.map(t => (
                    <SelectItem key={t.sigla} value={t.sigla}>{t.sigla} — {t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dados importados do DataJud */}
          {dadosDatajud?.processo && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Dados importados do DataJud
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {dadosDatajud.processo.classe && <span><strong>Classe:</strong> {dadosDatajud.processo.classe}</span>}
                {dadosDatajud.processo.assunto && <span><strong>Assunto:</strong> {dadosDatajud.processo.assunto}</span>}
                {dadosDatajud.processo.vara && <span><strong>Vara:</strong> {dadosDatajud.processo.vara}</span>}
                {dadosDatajud.processo.movimentos?.length > 0 && (
                  <span><strong>Movimentos:</strong> {dadosDatajud.processo.movimentos.length} importados</span>
                )}
              </div>
            </div>
          )}

          {/* Comarca + Vara */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Comarca</Label>
              <Input placeholder="Ex: São Paulo" value={form.comarca} onChange={(e) => setForm(p => ({ ...p, comarca: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vara / Juízo</Label>
              <Input placeholder="Ex: 3ª Vara Cível" value={form.vara} onChange={(e) => setForm(p => ({ ...p, vara: e.target.value }))} />
            </div>
          </div>

          {/* Classe + Assunto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Classe Processual</Label>
              <Input placeholder="Ex: Ação de Cobrança" value={form.classe} onChange={(e) => setForm(p => ({ ...p, classe: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Input placeholder="Ex: Cobrança de Cotas Condominiais" value={form.assunto} onChange={(e) => setForm(p => ({ ...p, assunto: e.target.value }))} />
            </div>
          </div>

          {/* Fase + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fase Processual</Label>
              <Select value={form.faseProcessual} onValueChange={(v: any) => setForm(p => ({ ...p, faseProcessual: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FASE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor da Causa (R$)</Label>
              <Input placeholder="Ex: 15000.00" value={form.valorCausa} onChange={(e) => setForm(p => ({ ...p, valorCausa: e.target.value }))} />
            </div>
          </div>

          {/* Condomínio + Advogado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Condomínio</Label>
              <Input placeholder="Nome do condomínio" value={form.condominioNome} onChange={(e) => setForm(p => ({ ...p, condominioNome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Advogado Responsável</Label>
              <Input placeholder="Nome do advogado" value={form.advogadoNome} onChange={(e) => setForm(p => ({ ...p, advogadoNome: e.target.value }))} />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              placeholder="Informações adicionais sobre o processo..."
              value={form.observacoes}
              onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={criarProcesso.isPending}>
            {criarProcesso.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Criar Processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ProcessosJudiciais() {
  const { can } = usePermissions();
  const podeCriar = can("juridico", "criar");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);

  const { data: processos, isLoading, refetch } = trpc.processos.listar.useQuery({
    status: filtroStatus !== "todos" ? (filtroStatus as any) : undefined,
    tipo: filtroTipo !== "todos" ? (filtroTipo as any) : undefined,
    busca: busca.trim() || undefined,
  });

  const { data: resumo } = trpc.processos.resumo.useQuery();

  const processosFiltrados = useMemo(() => processos ?? [], [processos]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Processos Judiciais</h1>
            <p className="text-sm text-muted-foreground">Gestão de processos com integração DataJud/CNJ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {podeCriar && (
            <Button onClick={() => setModalAberto(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Processo
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total", value: resumo.total, sub: "processos cadastrados", color: "text-foreground" },
            { label: "Ativos", value: resumo.ativos, sub: "em andamento", color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Suspensos", value: resumo.suspensos, sub: "aguardando", color: "text-amber-600 dark:text-amber-400" },
            { label: "Encerrados", value: resumo.encerrados, sub: "arquivados/encerrados", color: "text-muted-foreground" },
          ].map(({ label, value, sub, color }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número CNJ, comarca, vara..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="suspenso">Suspenso</SelectItem>
            <SelectItem value="arquivado">Arquivado</SelectItem>
            <SelectItem value="encerrado">Encerrado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de processos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : processosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Scale className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">Nenhum processo encontrado</p>
          <p className="text-muted-foreground/60 text-sm mt-1">Crie um novo processo ou ajuste os filtros</p>
          <Button onClick={() => setModalAberto(true)} className="mt-4">
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Processo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {processosFiltrados.map((processo) => {
            const statusCfg = STATUS_CONFIG[processo.status] ?? STATUS_CONFIG.ativo;
            return (
              <Link key={processo.id} href={`/admin/juridico/processos/${processo.id}`}>
                <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-primary">
                            {formatarCNJ(processo.numeroCNJ)}
                          </span>
                          <Badge className={`text-xs border ${statusCfg.color} flex items-center gap-1`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                          <Badge className={`text-xs ${TIPO_COLORS[processo.tipo]}`}>
                            {TIPO_LABELS[processo.tipo]}
                          </Badge>
                          {processo.datajudSincronizadoEm && (
                            <Badge className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                              DataJud
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                          {processo.tribunal && (
                            <span className="flex items-center gap-1.5">
                              <Scale className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {processo.tribunal}
                            </span>
                          )}
                          {processo.condominioNome && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {processo.condominioNome}
                            </span>
                          )}
                          {processo.advogadoNome && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {processo.advogadoNome}
                            </span>
                          )}
                        </div>

                        {(processo.classe || processo.assunto) && (
                          <p className="text-xs text-muted-foreground/70 mt-1.5 truncate">
                            {[processo.classe, processo.assunto].filter(Boolean).join(" — ")}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        {processo.valorCausa && (
                          <p className="text-sm font-semibold">{formatarMoeda(processo.valorCausa)}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {FASE_LABELS[processo.faseProcessual]}
                        </p>
                        {processo.dataUltimaMovimentacao && (
                          <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1 justify-end">
                            <Calendar className="w-3 h-3" />
                            {new Date(processo.dataUltimaMovimentacao).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                        <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors mt-2 ml-auto" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ModalCriarProcesso
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
