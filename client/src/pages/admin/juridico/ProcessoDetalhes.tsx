import { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Scale,
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Building2,
  User,
  DollarSign,
  FileText,
  AlertTriangle,
  Loader2,
  Download,
  ExternalLink,
  Users,
  Activity,
  Timer,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  civel: "Cível", trabalhista: "Trabalhista", previdenciario: "Previdenciário",
  criminal: "Criminal", tributario: "Tributário", administrativo: "Administrativo", outro: "Outro",
};

const FASE_LABELS: Record<string, string> = {
  distribuicao: "Distribuição", citacao: "Citação", contestacao: "Contestação",
  instrucao: "Instrução", audiencia: "Audiência", sentenca: "Sentença",
  recurso: "Recurso", transito_julgado: "Trânsito em Julgado",
  execucao: "Execução", arquivado: "Arquivado", outro: "Outro",
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  ativo: { label: "Ativo", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  suspenso: { label: "Suspenso", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  arquivado: { label: "Arquivado", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
  encerrado: { label: "Encerrado", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

const URGENCIA_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  atrasado: { label: "Atrasado", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30" },
  hoje: { label: "Vence hoje", color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  "7dias": { label: "7 dias", color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" },
  "15dias": { label: "15 dias", color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" },
  "30dias": { label: "30 dias", color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  futuro: { label: "No prazo", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" },
};

function formatarMoeda(centavos: number | null | undefined): string {
  if (!centavos) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

function formatarCNJ(numero: string): string {
  const n = numero.replace(/\D/g, "");
  if (n.length === 20) {
    return `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n[13]}.${n.slice(14, 16)}.${n.slice(16)}`;
  }
  return numero;
}

// ─── Modal: Adicionar Movimentação ────────────────────────────────────────────

function ModalMovimentacao({ processoId, open, onClose, onSuccess }: {
  processoId: number; open: boolean; onClose: () => void; onSuccess: () => void;
}) {

  const [form, setForm] = useState({ data: "", descricao: "", tipo: "outro" as const });
  const addMov = trpc.processos.addMovimentacao.useMutation();

  const handleSalvar = async () => {
    if (!form.data || !form.descricao.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    try {
      await addMov.mutateAsync({ processoId, data: new Date(form.data), descricao: form.descricao, tipo: form.tipo });
      toast.success("Movimentação adicionada!");
      onSuccess();
      onClose();
      setForm({ data: "", descricao: "", tipo: "outro" });
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1f2e] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Nova Movimentação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-white/80">Data *</Label>
            <Input type="date" value={form.data} onChange={(e) => setForm(p => ({ ...p, data: e.target.value }))}
              className="bg-white/5 border-white/10 text-white" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Tipo</Label>
            <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1f2e] border-white/10 text-white">
                {[
                  ["distribuicao","Distribuição"],["citacao","Citação"],["contestacao","Contestação"],
                  ["audiencia","Audiência"],["sentenca","Sentença"],["recurso","Recurso"],
                  ["despacho","Despacho"],["decisao","Decisão"],["peticao","Petição"],
                  ["transito_julgado","Trânsito em Julgado"],["execucao","Execução"],["outro","Outro"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-white hover:bg-white/10">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Descrição *</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))}
              placeholder="Descreva a movimentação..." rows={3}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">Cancelar</Button>
          <Button onClick={handleSalvar} disabled={addMov.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {addMov.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Adicionar Parte ───────────────────────────────────────────────────

function ModalParte({ processoId, open, onClose, onSuccess }: {
  processoId: number; open: boolean; onClose: () => void; onSuccess: () => void;
}) {

  const [form, setForm] = useState({ tipo: "autor" as const, nome: "", cpfCnpj: "", representante: "" });
  const addParte = trpc.processos.addParte.useMutation();

  const handleSalvar = async () => {
    if (!form.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    try {
      await addParte.mutateAsync({ processoId, ...form });
      toast.success("Parte adicionada!");
      onSuccess();
      onClose();
      setForm({ tipo: "autor", nome: "", cpfCnpj: "", representante: "" });
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1f2e] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Adicionar Parte</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/80">Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10 text-white">
                  <SelectItem value="autor" className="text-white hover:bg-white/10">Autor</SelectItem>
                  <SelectItem value="reu" className="text-white hover:bg-white/10">Réu</SelectItem>
                  <SelectItem value="terceiro" className="text-white hover:bg-white/10">Terceiro</SelectItem>
                  <SelectItem value="outro" className="text-white hover:bg-white/10">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80">CPF/CNPJ</Label>
              <Input value={form.cpfCnpj} onChange={(e) => setForm(p => ({ ...p, cpfCnpj: e.target.value }))}
                placeholder="000.000.000-00" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm(p => ({ ...p, nome: e.target.value }))}
              placeholder="Nome completo" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Representante / Advogado</Label>
            <Input value={form.representante} onChange={(e) => setForm(p => ({ ...p, representante: e.target.value }))}
              placeholder="Nome do representante" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">Cancelar</Button>
          <Button onClick={handleSalvar} disabled={addParte.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {addParte.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Adicionar Prazo ───────────────────────────────────────────────────

function ModalPrazo({ processoId, open, onClose, onSuccess }: {
  processoId: number; open: boolean; onClose: () => void; onSuccess: () => void;
}) {

  const [form, setForm] = useState({ titulo: "", tipo: "processual" as const, dataLimite: "", responsavelNome: "", observacoes: "" });
  const createPrazo = trpc.prazos.create.useMutation();

  const handleSalvar = async () => {
    if (!form.titulo.trim() || !form.dataLimite) {
      toast.error("Título e data limite são obrigatórios");
      return;
    }
    try {
      await createPrazo.mutateAsync({
        titulo: form.titulo,
        tipo: form.tipo,
        processoId,
        dataLimite: new Date(form.dataLimite),
        responsavelNome: form.responsavelNome || undefined,
        observacoes: form.observacoes || undefined,
      });
      toast.success("Prazo criado!");
      onSuccess();
      onClose();
      setForm({ titulo: "", tipo: "processual", dataLimite: "", responsavelNome: "", observacoes: "" });
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1f2e] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Novo Prazo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-white/80">Título *</Label>
            <Input value={form.titulo} onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Ex: Prazo para contestação" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/80">Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10 text-white">
                  {[
                    ["processual","Processual"],["audiencia","Audiência"],["recurso","Recurso"],
                    ["contratual","Contratual"],["administrativo","Administrativo"],
                    ["interno","Interno"],["outro","Outro"],
                  ].map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-white hover:bg-white/10">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80">Data Limite *</Label>
              <Input type="date" value={form.dataLimite} onChange={(e) => setForm(p => ({ ...p, dataLimite: e.target.value }))}
                className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Responsável</Label>
            <Input value={form.responsavelNome} onChange={(e) => setForm(p => ({ ...p, responsavelNome: e.target.value }))}
              placeholder="Nome do responsável" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={2} className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">Cancelar</Button>
          <Button onClick={handleSalvar} disabled={createPrazo.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {createPrazo.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Criar Prazo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal: Adicionar Financeiro ──────────────────────────────────────────────

function ModalFinanceiro({ processoId, open, onClose, onSuccess }: {
  processoId: number; open: boolean; onClose: () => void; onSuccess: () => void;
}) {

  const [form, setForm] = useState({ tipo: "custas" as const, descricao: "", valor: "", data: "", pago: false });
  const addFin = trpc.processos.addFinanceiro.useMutation();

  const handleSalvar = async () => {
    if (!form.descricao.trim() || !form.valor || !form.data) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    try {
      await addFin.mutateAsync({
        processoId,
        tipo: form.tipo,
        descricao: form.descricao,
        valor: Math.round(parseFloat(form.valor.replace(",", ".")) * 100),
        data: new Date(form.data),
        pago: form.pago,
      });
      toast.success("Lançamento financeiro adicionado!");
      onSuccess();
      onClose();
      setForm({ tipo: "custas", descricao: "", valor: "", data: "", pago: false });
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1f2e] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Novo Lançamento Financeiro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/80">Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10 text-white">
                  {[
                    ["custas","Custas"],["honorarios","Honorários"],["despesas","Despesas"],
                    ["deposito","Depósito"],["condenacao","Condenação"],["reembolso","Reembolso"],["outro","Outro"],
                  ].map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-white hover:bg-white/10">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80">Data *</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm(p => ({ ...p, data: e.target.value }))}
                className="bg-white/5 border-white/10 text-white" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Descrição *</Label>
            <Input value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))}
              placeholder="Ex: Custas de distribuição" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/80">Valor (R$) *</Label>
              <Input value={form.valor} onChange={(e) => setForm(p => ({ ...p, valor: e.target.value }))}
                placeholder="0,00" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80">Status</Label>
              <Select value={form.pago ? "pago" : "pendente"} onValueChange={(v) => setForm(p => ({ ...p, pago: v === "pago" }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10 text-white">
                  <SelectItem value="pendente" className="text-white hover:bg-white/10">Pendente</SelectItem>
                  <SelectItem value="pago" className="text-white hover:bg-white/10">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">Cancelar</Button>
          <Button onClick={handleSalvar} disabled={addFin.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
            {addFin.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ProcessoDetalhes() {
  const [, params] = useRoute("/admin/juridico/processos/:id");
  const processoId = parseInt(params?.id ?? "0");


  const [modalMov, setModalMov] = useState(false);
  const [modalParte, setModalParte] = useState(false);
  const [modalPrazo, setModalPrazo] = useState(false);
  const [modalFin, setModalFin] = useState(false);

  const { data: processo, isLoading, refetch } = trpc.processos.getById.useQuery(
    { id: processoId },
    { enabled: processoId > 0 }
  );

  const { data: prazos, refetch: refetchPrazos } = trpc.prazos.listar.useQuery(
    { processoId },
    { enabled: processoId > 0 }
  );

  const sincronizarDatajud = trpc.processos.sincronizarDataJud.useMutation();
  const deleteMov = trpc.processos.deleteMovimentacao.useMutation();
  const removeParte = trpc.processos.removeParte.useMutation();
  const concluirPrazo = trpc.prazos.concluir.useMutation();
  const deletePrazo = trpc.prazos.delete.useMutation();
  const updateFin = trpc.processos.updateFinanceiro.useMutation();

  const handleSincronizar = async () => {
    try {
      const r = await sincronizarDatajud.mutateAsync({ processoId });
      toast.success(`Sincronizado! ${r.novasMovimentacoes} nova(s) movimentação(ões) importada(s)`);
      refetch();
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err.message });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!processo) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center text-white">
        <Scale className="w-12 h-12 text-white/20 mb-4" />
        <p className="text-white/50">Processo não encontrado</p>
        <Link href="/admin/juridico/processos">
          <Button variant="ghost" className="mt-4 text-white/60 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[processo.status] ?? STATUS_CONFIG.ativo;

  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/juridico/processos">
            <Button variant="ghost" size="sm" className="text-white/60 hover:text-white mt-0.5">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-mono text-lg font-bold text-blue-300">
                {formatarCNJ(processo.numeroCNJ)}
              </h1>
              <Badge className={`text-xs border ${statusCfg.color}`}>{statusCfg.label}</Badge>
              <Badge className="text-xs bg-blue-500/15 text-blue-400">
                {TIPO_LABELS[processo.tipo]}
              </Badge>
              {processo.datajudSincronizadoEm && (
                <Badge className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  DataJud ✓
                </Badge>
              )}
            </div>
            <p className="text-sm text-white/50 mt-1">
              {processo.tribunal} {processo.comarca ? `— ${processo.comarca}` : ""}
              {processo.vara ? ` — ${processo.vara}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {processo.tribunalAlias && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSincronizar}
              disabled={sincronizarDatajud.isPending}
              className="text-white/60 hover:text-white"
              title="Sincronizar movimentações do DataJud"
            >
              {sincronizarDatajud.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              <span className="ml-1.5 text-xs">Sincronizar DataJud</span>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-white/60 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-[#1a1f2e] border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Fase</p>
            <p className="text-sm font-semibold text-white">{FASE_LABELS[processo.faseProcessual]}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1f2e] border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Valor da Causa</p>
            <p className="text-sm font-semibold text-white">{formatarMoeda(processo.valorCausa)}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1f2e] border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 uppercase tracking-wide mb-1">A Pagar</p>
            <p className="text-sm font-semibold text-red-400">{formatarMoeda(processo.resumoFinanceiro?.totalPendente)}</p>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1f2e] border-white/10">
          <CardContent className="p-4">
            <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Pago</p>
            <p className="text-sm font-semibold text-emerald-400">{formatarMoeda(processo.resumoFinanceiro?.totalPago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="timeline">
        <TabsList className="bg-white/5 border border-white/10 mb-4">
          <TabsTrigger value="timeline" className="data-[state=active]:bg-blue-600 text-white/60 data-[state=active]:text-white">
            <Activity className="w-4 h-4 mr-1.5" />
            Timeline ({processo.movimentacoes?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="partes" className="data-[state=active]:bg-blue-600 text-white/60 data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-1.5" />
            Partes ({processo.partes?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="prazos" className="data-[state=active]:bg-blue-600 text-white/60 data-[state=active]:text-white">
            <Timer className="w-4 h-4 mr-1.5" />
            Prazos ({prazos?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="data-[state=active]:bg-blue-600 text-white/60 data-[state=active]:text-white">
            <DollarSign className="w-4 h-4 mr-1.5" />
            Financeiro ({processo.financeiro?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="info" className="data-[state=active]:bg-blue-600 text-white/60 data-[state=active]:text-white">
            <FileText className="w-4 h-4 mr-1.5" />
            Informações
          </TabsTrigger>
        </TabsList>

        {/* ─── Timeline ──────────────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-white/70">Movimentações Processuais</h3>
            <Button size="sm" onClick={() => setModalMov(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {processo.movimentacoes?.length === 0 ? (
            <div className="text-center py-10 text-white/30">
              <Activity className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-white/10" />
              <div className="space-y-4 pl-10">
                {processo.movimentacoes?.map((mov) => (
                  <div key={mov.id} className="relative">
                    <div className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 ${
                      mov.origem === "datajud" ? "bg-emerald-500 border-emerald-400" : "bg-blue-500 border-blue-400"
                    }`} />
                    <div className="bg-[#1a1f2e] border border-white/10 rounded-lg p-3 group">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs text-white/40">
                              {new Date(mov.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                            {mov.origem === "datajud" && (
                              <Badge className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20 py-0">DataJud</Badge>
                            )}
                          </div>
                          <p className="text-sm text-white">{mov.descricao}</p>
                          {mov.usuarioNome && (
                            <p className="text-xs text-white/30 mt-1">por {mov.usuarioNome}</p>
                          )}
                        </div>
                        {mov.origem === "manual" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await deleteMov.mutateAsync({ id: mov.id });
                              refetch();
                            }}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Partes ─────────────────────────────────────────────────────────── */}
        <TabsContent value="partes">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-white/70">Partes do Processo</h3>
            <Button size="sm" onClick={() => setModalParte(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar Parte
            </Button>
          </div>

          {processo.partes?.length === 0 ? (
            <div className="text-center py-10 text-white/30">
              <Users className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhuma parte cadastrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {processo.partes?.map((parte) => (
                <Card key={parte.id} className="bg-[#1a1f2e] border-white/10 group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs ${
                            parte.tipo === "autor" ? "bg-blue-500/15 text-blue-400" :
                            parte.tipo === "reu" ? "bg-red-500/15 text-red-400" :
                            "bg-slate-500/15 text-slate-400"
                          }`}>
                            {parte.tipo === "autor" ? "Autor" : parte.tipo === "reu" ? "Réu" : parte.tipo === "terceiro" ? "Terceiro" : "Outro"}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium text-white">{parte.nome}</p>
                        {parte.cpfCnpj && <p className="text-xs text-white/40 mt-0.5">CPF/CNPJ: {parte.cpfCnpj}</p>}
                        {parte.representante && <p className="text-xs text-white/40 mt-0.5">Repr.: {parte.representante}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await removeParte.mutateAsync({ id: parte.id });
                          refetch();
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Prazos ─────────────────────────────────────────────────────────── */}
        <TabsContent value="prazos">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-white/70">Prazos Vinculados ao Processo</h3>
            <Button size="sm" onClick={() => setModalPrazo(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Novo Prazo
            </Button>
          </div>

          {!prazos || prazos.length === 0 ? (
            <div className="text-center py-10 text-white/30">
              <Timer className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhum prazo cadastrado para este processo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prazos.map((prazo) => {
                const urgCfg = prazo.urgencia ? URGENCIA_CONFIG[prazo.urgencia] : null;
                return (
                  <Card key={prazo.id} className={`border ${
                    prazo.urgencia === "atrasado" ? "bg-red-500/5 border-red-500/20" :
                    prazo.urgencia === "hoje" ? "bg-orange-500/5 border-orange-500/20" :
                    "bg-[#1a1f2e] border-white/10"
                  } group`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-medium text-white">{prazo.titulo}</p>
                            {urgCfg && prazo.status === "pendente" && (
                              <Badge className={`text-xs border ${urgCfg.bg} ${urgCfg.color}`}>
                                {urgCfg.label}
                              </Badge>
                            )}
                            {prazo.status === "concluido" && (
                              <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Concluído
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-white/40">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(prazo.dataLimite).toLocaleDateString("pt-BR")}
                            </span>
                            {prazo.responsavelNome && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {prazo.responsavelNome}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {prazo.status === "pendente" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                await concluirPrazo.mutateAsync({ id: prazo.id });
                                refetchPrazos();
                              }}
                              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2 text-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Concluir
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await deletePrazo.mutateAsync({ id: prazo.id });
                              refetchPrazos();
                            }}
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ─── Financeiro ─────────────────────────────────────────────────────── */}
        <TabsContent value="financeiro">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-white/70">Lançamentos Financeiros</h3>
            <Button size="sm" onClick={() => setModalFin(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="w-4 h-4 mr-1" />
              Novo Lançamento
            </Button>
          </div>

          {processo.financeiro?.length === 0 ? (
            <div className="text-center py-10 text-white/30">
              <DollarSign className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhum lançamento financeiro</p>
            </div>
          ) : (
            <div className="space-y-2">
              {processo.financeiro?.map((item) => (
                <Card key={item.id} className="bg-[#1a1f2e] border-white/10 group">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white">{item.descricao}</span>
                          <Badge className={`text-xs ${item.pago ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                            {item.pago ? "Pago" : "Pendente"}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/40 mt-0.5">
                          {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)} — {new Date(item.data).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${item.pago ? "text-emerald-400" : "text-amber-400"}`}>
                          {formatarMoeda(item.valor)}
                        </span>
                        {!item.pago && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await updateFin.mutateAsync({ id: item.id, pago: true, dataPagamento: new Date() });
                              refetch();
                            }}
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 px-2 text-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Marcar pago
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── Informações ────────────────────────────────────────────────────── */}
        <TabsContent value="info">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-[#1a1f2e] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70">Dados do Processo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["Número CNJ", formatarCNJ(processo.numeroCNJ)],
                  ["Tribunal", processo.tribunal],
                  ["Comarca", processo.comarca],
                  ["Vara / Juízo", processo.vara],
                  ["Classe", processo.classe],
                  ["Assunto", processo.assunto],
                  ["Fase Processual", FASE_LABELS[processo.faseProcessual]],
                  ["Tipo", TIPO_LABELS[processo.tipo]],
                  ["Data de Ajuizamento", processo.dataAjuizamento ? new Date(processo.dataAjuizamento).toLocaleDateString("pt-BR") : null],
                  ["Última Movimentação", processo.dataUltimaMovimentacao ? new Date(processo.dataUltimaMovimentacao).toLocaleDateString("pt-BR") : null],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-2">
                    <span className="text-xs text-white/40">{k}</span>
                    <span className="text-xs text-white text-right">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-[#1a1f2e] border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-white/70">Responsáveis e Valores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  ["Condomínio", processo.condominioNome],
                  ["Advogado Responsável", processo.advogadoNome],
                  ["Valor da Causa", formatarMoeda(processo.valorCausa)],
                  ["Valor da Condenação", formatarMoeda(processo.valorCondenacao)],
                  ["DataJud ID", processo.datajudId],
                  ["Sincronizado em", processo.datajudSincronizadoEm ? new Date(processo.datajudSincronizadoEm).toLocaleString("pt-BR") : null],
                  ["Cadastrado em", new Date(processo.createdAt).toLocaleDateString("pt-BR")],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-2">
                    <span className="text-xs text-white/40">{k}</span>
                    <span className="text-xs text-white text-right">{v}</span>
                  </div>
                ))}
                {processo.observacoes && (
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-white/40 mb-1">Observações</p>
                    <p className="text-xs text-white/70">{processo.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modais */}
      <ModalMovimentacao processoId={processoId} open={modalMov} onClose={() => setModalMov(false)} onSuccess={refetch} />
      <ModalParte processoId={processoId} open={modalParte} onClose={() => setModalParte(false)} onSuccess={refetch} />
      <ModalPrazo processoId={processoId} open={modalPrazo} onClose={() => setModalPrazo(false)} onSuccess={refetchPrazos} />
      <ModalFinanceiro processoId={processoId} open={modalFin} onClose={() => setModalFin(false)} onSuccess={refetch} />
    </div>
  );
}
