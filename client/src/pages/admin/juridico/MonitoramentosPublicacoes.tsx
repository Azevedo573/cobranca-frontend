import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Users, Plus, Edit2, Trash2, Power, PowerOff, ArrowLeft,
  Search, Bell, Newspaper, CheckCircle2, XCircle
} from "lucide-react";

function ModalMonitoramento({ open, onClose, monitoramento }: {
  open: boolean;
  onClose: () => void;
  monitoramento?: any;
}) {
  const utils = trpc.useUtils();
  const isEditing = !!monitoramento;
  const [form, setForm] = useState({
    nome: monitoramento?.nome ?? "",
    oab: monitoramento?.oab ?? "",
    descricao: monitoramento?.descricao ?? "",
  });

  const createMutation = trpc.doerjMonitoramentos.criar.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento cadastrado com sucesso!");
      utils.doerjMonitoramentos.listar.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.doerjMonitoramentos.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento atualizado!");
      utils.doerjMonitoramentos.listar.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.nome.trim()) return toast.error("Informe o nome para pesquisa");
    const payload = {
      nome: form.nome.trim(),
      oab: form.oab.trim() || undefined,
      descricao: form.descricao.trim() || undefined,
    };
    if (isEditing) {
      updateMutation.mutate({ id: monitoramento.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-primary" />
            {isEditing ? "Editar Monitoramento" : "Novo Monitoramento DOERJ"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome para pesquisa <span className="text-destructive">*</span></Label>
            <Input
              id="nome"
              placeholder="Ex: HIGOR GOMES DA SILVA"
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value.toUpperCase() }))}
              className="uppercase"
            />
            <p className="text-xs text-muted-foreground">
              Nome completo como aparece no Diário Oficial. Convertido para maiúsculas automaticamente.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oab">OAB (opcional)</Label>
            <Input
              id="oab"
              placeholder="Ex: RJ-169346"
              value={form.oab}
              onChange={e => setForm(f => ({ ...f, oab: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Número da OAB para referência. Não é usado na pesquisa automática.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição / Observação (opcional)</Label>
            <Textarea
              id="descricao"
              placeholder="Ex: Advogado responsável pelos processos do Condomínio Saboya"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : isEditing ? "Salvar Alterações" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardMonitoramento({ m, onEdit, onDelete, onToggle }: {
  m: any;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const ativo = m.ativo === 1;
  return (
    <Card className={`transition-all ${ativo ? "" : "opacity-60"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${
              ativo ? "bg-green-100 dark:bg-green-900/30" : "bg-muted"
            }`}>
              {ativo
                ? <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                : <XCircle className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{m.nome}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {m.oab && (
                  <Badge variant="outline" className="text-xs font-mono">OAB {m.oab}</Badge>
                )}
                <Badge className={`text-xs ${
                  ativo
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {ativo ? "Ativo" : "Pausado"}
                </Badge>
              </div>
              {m.descricao && (
                <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{m.descricao}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              title={ativo ? "Pausar" : "Ativar"} onClick={onToggle}>
              {ativo
                ? <PowerOff className="h-4 w-4 text-amber-500" />
                : <Power className="h-4 w-4 text-green-500" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
              title="Excluir" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MonitoramentosPublicacoes() {
  const [, navigate] = useLocation();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [busca, setBusca] = useState("");

  const utils = trpc.useUtils();
  const { data: monitoramentos = [], isLoading } = trpc.doerjMonitoramentos.listar.useQuery();

  const deleteMutation = trpc.doerjMonitoramentos.excluir.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento excluído!");
      utils.doerjMonitoramentos.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.doerjMonitoramentos.toggleAtivo.useMutation({
    onSuccess: (data) => {
      toast.success(data.novoStatus === 1 ? "Monitoramento ativado!" : "Monitoramento pausado!");
      utils.doerjMonitoramentos.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const filtrados = monitoramentos.filter((m) => {
    if (!busca.trim()) return true;
    const q = busca.toLowerCase();
    return (
      m.nome?.toLowerCase().includes(q) ||
      m.oab?.toLowerCase().includes(q) ||
      m.descricao?.toLowerCase().includes(q)
    );
  });

  const ativos = monitoramentos.filter((m) => m.ativo === 1).length;
  const pausados = monitoramentos.length - ativos;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/juridico/publicacoes")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Newspaper className="h-6 w-6 text-primary" />
              Monitoramentos DOERJ
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Nomes pesquisados diariamente no Diário Oficial do Estado do RJ
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditando(null); setModalAberto(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Monitoramento
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-medium">{monitoramentos.length}</span>
          <span className="text-muted-foreground">monitoramento(s)</span>
        </div>
        {ativos > 0 && (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            {ativos} ativo(s)
          </Badge>
        )}
        {pausados > 0 && (
          <Badge variant="secondary">{pausados} pausado(s)</Badge>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, OAB ou descrição..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">
              {busca ? "Nenhum monitoramento encontrado para esta busca" : "Nenhum monitoramento cadastrado"}
            </p>
            {!busca && (
              <p className="text-sm text-muted-foreground mt-1">
                Cadastre nomes para serem pesquisados automaticamente no DOERJ.
              </p>
            )}
            {!busca && (
              <Button className="mt-4" onClick={() => { setEditando(null); setModalAberto(true); }}>
                <Plus className="h-4 w-4 mr-1" />
                Cadastrar Monitoramento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtrados.map((m) => (
            <CardMonitoramento
              key={m.id}
              m={m}
              onEdit={() => { setEditando(m); setModalAberto(true); }}
              onDelete={() => {
                if (confirm(`Excluir monitoramento de "${m.nome}"?`)) {
                  deleteMutation.mutate({ id: m.id });
                }
              }}
              onToggle={() => toggleMutation.mutate({ id: m.id })}
            />
          ))}
        </div>
      )}

      <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Como funciona o monitoramento</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                O sistema pesquisa diariamente o Diário Oficial do Estado do Rio de Janeiro (DOERJ)
                usando os nomes cadastrados aqui. Quando encontra publicações, elas são salvas
                automaticamente em <strong>Publicações Jurídicas</strong>. O job executa todos os dias
                às 08h00 (horário de Brasília).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ModalMonitoramento
        open={modalAberto}
        onClose={() => { setModalAberto(false); setEditando(null); }}
        monitoramento={editando}
      />
    </div>
  );
}
