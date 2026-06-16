import { useState, useMemo } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Timer,
  Plus,
  RefreshCw,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Trash2,
  Scale,
  ExternalLink,
  Filter,
} from "lucide-react";

// ─── Configurações de urgência ────────────────────────────────────────────────

const URGENCIA_CONFIG: Record<string, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode; ordem: number;
}> = {
  atrasado: {
    label: "Atrasado", color: "text-red-400",
    bg: "bg-red-500/10", border: "border-red-500/30",
    icon: <AlertTriangle className="w-3.5 h-3.5" />, ordem: 0,
  },
  hoje: {
    label: "Vence hoje", color: "text-orange-400",
    bg: "bg-orange-500/10", border: "border-orange-500/30",
    icon: <Clock className="w-3.5 h-3.5" />, ordem: 1,
  },
  "7dias": {
    label: "7 dias", color: "text-amber-400",
    bg: "bg-amber-500/10", border: "border-amber-500/30",
    icon: <Timer className="w-3.5 h-3.5" />, ordem: 2,
  },
  "15dias": {
    label: "15 dias", color: "text-yellow-400",
    bg: "bg-yellow-500/10", border: "border-yellow-500/30",
    icon: <Timer className="w-3.5 h-3.5" />, ordem: 3,
  },
  "30dias": {
    label: "30 dias", color: "text-blue-400",
    bg: "bg-blue-500/10", border: "border-blue-500/30",
    icon: <Timer className="w-3.5 h-3.5" />, ordem: 4,
  },
  futuro: {
    label: "No prazo", color: "text-emerald-400",
    bg: "bg-emerald-500/10", border: "border-emerald-500/30",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />, ordem: 5,
  },
};

const TIPO_PRAZO_LABELS: Record<string, string> = {
  processual: "Processual", contratual: "Contratual", administrativo: "Administrativo",
  audiencia: "Audiência", recurso: "Recurso", interno: "Interno", outro: "Outro",
};

// ─── Modal: Criar Prazo ───────────────────────────────────────────────────────

function ModalCriarPrazo({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void;
}) {

  const [form, setForm] = useState({
    titulo: "",
    tipo: "processual" as const,
    dataLimite: "",
    condominioNome: "",
    responsavelNome: "",
    observacoes: "",
  });

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
        dataLimite: new Date(form.dataLimite),
        condominioNome: form.condominioNome || undefined,
        responsavelNome: form.responsavelNome || undefined,
        observacoes: form.observacoes || undefined,
      });
      toast.success("Prazo criado com sucesso!");
      onSuccess();
      onClose();
      setForm({ titulo: "", tipo: "processual", dataLimite: "", condominioNome: "", responsavelNome: "", observacoes: "" });
    } catch (err: any) {
      toast.error("Erro ao criar prazo", { description: err.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#1a1f2e] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Timer className="w-5 h-5 text-blue-400" />
            Novo Prazo Jurídico
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-white/80">Título *</Label>
            <Input
              value={form.titulo}
              onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Ex: Prazo para contestação"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/80">Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1f2e] border-white/10 text-white">
                  {Object.entries(TIPO_PRAZO_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-white hover:bg-white/10">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80">Data Limite *</Label>
              <Input
                type="date"
                value={form.dataLimite}
                onChange={(e) => setForm(p => ({ ...p, dataLimite: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/80">Condomínio</Label>
              <Input
                value={form.condominioNome}
                onChange={(e) => setForm(p => ({ ...p, condominioNome: e.target.value }))}
                placeholder="Nome do condomínio"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80">Responsável</Label>
              <Input
                value={form.responsavelNome}
                onChange={(e) => setForm(p => ({ ...p, responsavelNome: e.target.value }))}
                placeholder="Nome do advogado"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/80">Observações</Label>
            <Textarea
              value={form.observacoes}
              onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={2}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
            />
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

// ─── Página Principal ─────────────────────────────────────────────────────────

type FiltroUrgencia = "todos" | "atrasado" | "hoje" | "7dias" | "15dias" | "30dias" | "futuro" | "concluido";

export default function PrazosJuridicos() {

  const [modalAberto, setModalAberto] = useState(false);
  const [filtroUrgencia, setFiltroUrgencia] = useState<FiltroUrgencia>("todos");
  const [filtroStatus, setFiltroStatus] = useState<"pendente" | "concluido" | "todos">("pendente");

  const { data: prazos, isLoading, refetch } = trpc.prazos.listar.useQuery({
    status: filtroStatus !== "todos" ? filtroStatus : undefined,
    urgencia: (filtroUrgencia !== "todos" && filtroUrgencia !== "concluido") ? filtroUrgencia as any : undefined,
  });

  const { data: resumo } = trpc.prazos.resumo.useQuery();

  const concluirPrazo = trpc.prazos.concluir.useMutation();
  const cancelarPrazo = trpc.prazos.cancelar.useMutation();
  const deletePrazo = trpc.prazos.delete.useMutation();

  const prazosOrdenados = useMemo(() => {
    if (!prazos) return [];
    return [...prazos].sort((a, b) => {
      const ordemA = a.urgencia ? (URGENCIA_CONFIG[a.urgencia]?.ordem ?? 99) : 99;
      const ordemB = b.urgencia ? (URGENCIA_CONFIG[b.urgencia]?.ordem ?? 99) : 99;
      if (ordemA !== ordemB) return ordemA - ordemB;
      return new Date(a.dataLimite).getTime() - new Date(b.dataLimite).getTime();
    });
  }, [prazos]);

  const handleConcluir = async (id: number) => {
    try {
      await concluirPrazo.mutateAsync({ id });
      toast.success("Prazo concluído!");
      refetch();
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  const handleCancelar = async (id: number) => {
    try {
      await cancelarPrazo.mutateAsync({ id });
      toast.success("Prazo cancelado");
      refetch();
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deletePrazo.mutateAsync({ id });
      toast.success("Prazo excluído");
      refetch();
    } catch (err: any) {
      toast.error("Erro", { description: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-600/20 rounded-xl flex items-center justify-center">
            <Timer className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Prazos Jurídicos</h1>
            <p className="text-sm text-white/50">Controle de prazos processuais e administrativos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-white/60 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setModalAberto(true)} className="bg-amber-600 hover:bg-amber-700 text-white">
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Prazo
          </Button>
        </div>
      </div>

      {/* KPIs de urgência */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          {[
            { key: "atrasados", label: "Atrasados", value: resumo.atrasados, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
            { key: "vencemHoje", label: "Vencem hoje", value: resumo.vencemHoje, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
            { key: "vencemEm7Dias", label: "Em 7 dias", value: resumo.vencemEm7Dias, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
            { key: "vencemEm15Dias", label: "Em 15 dias", value: resumo.vencemEm15Dias, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
            { key: "vencemEm30Dias", label: "Em 30 dias", value: resumo.vencemEm30Dias, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
            { key: "total", label: "Total pendentes", value: resumo.total, color: "text-white", bg: "bg-white/5 border-white/10" },
          ].map((item) => (
            <Card key={item.key} className={`border ${item.bg}`}>
              <CardContent className="p-3 text-center">
                <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                <p className="text-xs text-white/40 mt-0.5">{item.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Alerta de urgentes */}
      {resumo && resumo.urgentes > 0 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl mb-5">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">
              {resumo.urgentes} prazo{resumo.urgentes > 1 ? "s" : ""} urgente{resumo.urgentes > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-white/50">
              {resumo.atrasados > 0 && `${resumo.atrasados} atrasado${resumo.atrasados > 1 ? "s" : ""}`}
              {resumo.atrasados > 0 && resumo.vencemHoje > 0 && " · "}
              {resumo.vencemHoje > 0 && `${resumo.vencemHoje} vencem hoje`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltroUrgencia("atrasado")}
            className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            Ver atrasados
          </Button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
          {[
            { v: "pendente", l: "Pendentes" },
            { v: "concluido", l: "Concluídos" },
            { v: "todos", l: "Todos" },
          ].map(({ v, l }) => (
            <button
              key={v}
              onClick={() => setFiltroStatus(v as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filtroStatus === v ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="flex gap-1 p-1 bg-white/5 rounded-lg flex-wrap">
          <button
            onClick={() => setFiltroUrgencia("todos")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              filtroUrgencia === "todos" ? "bg-white/15 text-white" : "text-white/50 hover:text-white"
            }`}
          >
            Todos
          </button>
          {Object.entries(URGENCIA_CONFIG).map(([k, cfg]) => (
            <button
              key={k}
              onClick={() => setFiltroUrgencia(k as FiltroUrgencia)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                filtroUrgencia === k
                  ? `${cfg.bg} ${cfg.color} border ${cfg.border}`
                  : "text-white/50 hover:text-white"
              }`}
            >
              {cfg.icon}
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de prazos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
        </div>
      ) : prazosOrdenados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Timer className="w-12 h-12 text-white/20 mb-4" />
          <p className="text-white/50 text-lg font-medium">Nenhum prazo encontrado</p>
          <p className="text-white/30 text-sm mt-1">Crie um novo prazo ou ajuste os filtros</p>
          <Button
            onClick={() => setModalAberto(true)}
            className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Prazo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {prazosOrdenados.map((prazo) => {
            const urgCfg = prazo.urgencia ? URGENCIA_CONFIG[prazo.urgencia] : null;
            const isConcluido = prazo.status === "concluido";
            const isCancelado = prazo.status === "cancelado";

            return (
              <Card
                key={prazo.id}
                className={`border transition-all group ${
                  isConcluido ? "bg-[#1a1f2e] border-white/5 opacity-60" :
                  isCancelado ? "bg-[#1a1f2e] border-white/5 opacity-40" :
                  prazo.urgencia === "atrasado" ? "bg-red-500/5 border-red-500/20 hover:border-red-500/40" :
                  prazo.urgencia === "hoje" ? "bg-orange-500/5 border-orange-500/20 hover:border-orange-500/40" :
                  "bg-[#1a1f2e] border-white/10 hover:border-white/20"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <p className={`text-sm font-medium ${isConcluido || isCancelado ? "line-through text-white/40" : "text-white"}`}>
                          {prazo.titulo}
                        </p>

                        {/* Badge de urgência */}
                        {urgCfg && !isConcluido && !isCancelado && (
                          <Badge className={`text-xs border ${urgCfg.bg} ${urgCfg.color} ${urgCfg.border} flex items-center gap-1`}>
                            {urgCfg.icon}
                            {urgCfg.label}
                          </Badge>
                        )}

                        {/* Badge de tipo */}
                        <Badge className="text-xs bg-white/5 text-white/50">
                          {TIPO_PRAZO_LABELS[prazo.tipo]}
                        </Badge>

                        {/* Status concluído/cancelado */}
                        {isConcluido && (
                          <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Concluído
                          </Badge>
                        )}
                        {isCancelado && (
                          <Badge className="text-xs bg-slate-500/15 text-slate-400 border-slate-500/30 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Cancelado
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-white/40 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(prazo.dataLimite).toLocaleDateString("pt-BR", {
                            weekday: "short", day: "2-digit", month: "short", year: "numeric"
                          })}
                        </span>
                        {prazo.responsavelNome && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {prazo.responsavelNome}
                          </span>
                        )}
                        {prazo.condominioNome && (
                          <span className="flex items-center gap-1">
                            <Scale className="w-3.5 h-3.5" />
                            {prazo.condominioNome}
                          </span>
                        )}
                        {prazo.processoId && (
                          <Link href={`/admin/juridico/processos/${prazo.processoId}`}>
                            <span className="flex items-center gap-1 text-blue-400 hover:text-blue-300 cursor-pointer">
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver processo
                            </span>
                          </Link>
                        )}
                      </div>

                      {prazo.observacoes && (
                        <p className="text-xs text-white/30 mt-1.5 truncate">{prazo.observacoes}</p>
                      )}
                    </div>

                    {/* Ações */}
                    {!isConcluido && !isCancelado && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleConcluir(prazo.id)}
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-8 px-2 text-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Concluir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelar(prazo.id)}
                          className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white/60 hover:bg-white/5 h-8 px-2 text-xs"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Cancelar
                        </Button>
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(prazo.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ModalCriarPrazo
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
