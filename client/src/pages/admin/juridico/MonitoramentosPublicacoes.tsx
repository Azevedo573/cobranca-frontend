import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Users, Plus, Edit2, Trash2, Power, PowerOff, ArrowLeft,
  Search, Bell, CheckCircle2, XCircle, Tag
} from "lucide-react";

// ─── UFs do Brasil ────────────────────────────────────────────────────────────
const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

// ─── Modal de Criação/Edição ──────────────────────────────────────────────────

function ModalMonitoramento({ open, onClose, monitoramento }: {
  open: boolean;
  onClose: () => void;
  monitoramento?: any;
}) {
  const utils = trpc.useUtils();
  const isEditing = !!monitoramento;

  const [form, setForm] = useState({
    advogadoNome: monitoramento?.advogadoNome ?? "",
    oab: monitoramento?.oab ?? "",
    uf: monitoramento?.uf ?? "",
    palavrasChave: monitoramento?.palavrasChave ?? "",
  });

  const createMutation = trpc.publicacoes.monitoramentos.create.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento cadastrado!");
      utils.publicacoes.monitoramentos.listar.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.publicacoes.monitoramentos.update.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento atualizado!");
      utils.publicacoes.monitoramentos.listar.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.advogadoNome.trim()) return toast.error("Informe o nome do advogado");
    if (!form.oab.trim() && !form.palavrasChave.trim()) {
      return toast.error("Informe ao menos a OAB ou uma palavra-chave para monitoramento");
    }
    const payload = {
      advogadoNome: form.advogadoNome.trim(),
      oab: form.oab.trim() || undefined,
      uf: form.uf || undefined,
      palavrasChave: form.palavrasChave.trim() || undefined,
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
            <Search className="h-5 w-5 text-primary" />
            {isEditing ? "Editar Monitoramento" : "Novo Monitoramento"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Nome */}
          <div>
            <Label>Nome do Advogado *</Label>
            <Input
              placeholder="Ex: João da Silva"
              value={form.advogadoNome}
              onChange={e => setForm(f => ({ ...f, advogadoNome: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              O sistema buscará por este nome nos diários oficiais.
            </p>
          </div>

          {/* OAB + UF */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>OAB</Label>
              <Input
                placeholder="Ex: OAB/RJ 123456"
                value={form.oab}
                onChange={e => setForm(f => ({ ...f, oab: e.target.value }))}
              />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={form.uf} onValueChange={v => setForm(f => ({ ...f, uf: v }))}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {UFS.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Palavras-chave */}
          <div>
            <Label>Palavras-chave Adicionais</Label>
            <Input
              placeholder="Ex: Condomínio Solar das Palmeiras, Administradora XYZ"
              value={form.palavrasChave}
              onChange={e => setForm(f => ({ ...f, palavrasChave: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Separe múltiplas palavras por vírgula. O sistema buscará por qualquer uma delas.
            </p>
          </div>

          {/* Resumo do que será monitorado */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">O que será monitorado:</p>
            {form.advogadoNome && (
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                <span>Nome: <strong>{form.advogadoNome}</strong></span>
              </div>
            )}
            {form.oab && (
              <div className="flex items-center gap-2 text-sm">
                <Search className="h-3.5 w-3.5 text-purple-500" />
                <span>OAB: <strong>{form.oab}</strong>{form.uf ? ` (${form.uf})` : ""}</span>
              </div>
            )}
            {form.palavrasChave && form.palavrasChave.split(",").filter(Boolean).map((kw: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Tag className="h-3.5 w-3.5 text-green-500" />
                <span>Palavra-chave: <strong>{kw.trim()}</strong></span>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card de Monitoramento ────────────────────────────────────────────────────

function CardMonitoramento({ m, onEdit, onDelete, onToggle }: {
  m: any;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const keywords = m.palavrasChave
    ? m.palavrasChave.split(",").map((k: string) => k.trim()).filter(Boolean)
    : [];

  return (
    <Card className={`transition-all ${m.ativo === 0 ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Nome + Status */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-base">{m.advogadoNome}</span>
              {m.ativo === 1 ? (
                <Badge className="text-xs bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />Ativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs text-muted-foreground">
                  <XCircle className="h-3 w-3 mr-1" />Pausado
                </Badge>
              )}
            </div>

            {/* OAB */}
            {m.oab && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                <Search className="h-3.5 w-3.5" />
                {m.oab}{m.uf ? ` · ${m.uf}` : ""}
              </div>
            )}

            {/* Palavras-chave */}
            {keywords.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                {(keywords as string[]).map((kw: string, i: number) => (
                  <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
                ))}
              </div>
            )}

            {/* Sem OAB nem palavras-chave */}
            {!m.oab && keywords.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                ⚠ Apenas nome cadastrado — adicione OAB ou palavras-chave para melhor precisão
              </p>
            )}
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 text-xs ${m.ativo === 1 ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
              onClick={onToggle}
              title={m.ativo === 1 ? "Pausar monitoramento" : "Ativar monitoramento"}
            >
              {m.ativo === 1 ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:text-red-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function MonitoramentosPublicacoes() {
  const [, navigate] = useLocation();
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [busca, setBusca] = useState("");

  const utils = trpc.useUtils();
  const { data: monitoramentos = [], isLoading } = trpc.publicacoes.monitoramentos.listar.useQuery();

  const deleteMutation = trpc.publicacoes.monitoramentos.delete.useMutation({
    onSuccess: () => {
      toast.success("Monitoramento excluído");
      utils.publicacoes.monitoramentos.listar.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.publicacoes.monitoramentos.toggle.useMutation({
    onSuccess: () => utils.publicacoes.monitoramentos.listar.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const filtrados = (monitoramentos as any[]).filter((m: any) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      m.advogadoNome?.toLowerCase().includes(q) ||
      m.oab?.toLowerCase().includes(q) ||
      m.uf?.toLowerCase().includes(q) ||
      m.palavrasChave?.toLowerCase().includes(q)
    );
  });

  const ativos = (monitoramentos as any[]).filter((m: any) => m.ativo === 1).length;
  const pausados = (monitoramentos as any[]).length - ativos;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/juridico/publicacoes")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" />
              Monitoramentos
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Advogados e palavras-chave monitorados nos diários oficiais
            </p>
          </div>
        </div>
        <Button onClick={() => { setEditando(null); setModalAberto(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Monitoramento
        </Button>
      </div>

      {/* Resumo */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-medium">{(monitoramentos as any[]).length}</span>
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

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, OAB, UF ou palavra-chave..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">
              {busca ? "Nenhum monitoramento encontrado para esta busca" : "Nenhum monitoramento cadastrado"}
            </p>
            {!busca && (
              <p className="text-sm text-muted-foreground mt-1">
                Cadastre advogados para monitoramento automático nos diários oficiais.
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
          {filtrados.map((m: any) => (
            <CardMonitoramento
              key={m.id}
              m={m}
              onEdit={() => { setEditando(m); setModalAberto(true); }}
              onDelete={() => {
                if (confirm(`Excluir monitoramento de "${m.advogadoNome}"?`)) {
                  deleteMutation.mutate({ id: m.id });
                }
              }}
              onToggle={() => toggleMutation.mutate({ id: m.id })}
            />
          ))}
        </div>
      )}

      {/* Informativo */}
      <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Como funciona o monitoramento</p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                O sistema pesquisa diariamente os diários oficiais dos tribunais. Quando encontra o nome, OAB ou palavras-chave
                cadastradas, gera automaticamente uma publicação e notifica a equipe. Você também pode registrar publicações
                manualmente na tela principal.
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
