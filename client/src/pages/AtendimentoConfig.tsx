import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Save, X, Tag, Zap, Building2,
  Clock, Users, RefreshCw, Settings, Timer,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Cores predefinidas ───────────────────────────────────────────────────────
const CORES = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#64748b", "#1e293b",
];

function SeletorCor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CORES.map((cor) => (
        <button
          key={cor}
          onClick={() => onChange(cor)}
          className={cn(
            "w-7 h-7 rounded-full transition-transform hover:scale-110",
            value === cor && "ring-2 ring-offset-2 ring-foreground scale-110"
          )}
          style={{ backgroundColor: cor }}
        />
      ))}
    </div>
  );
}

// ─── Seção: Departamentos ─────────────────────────────────────────────────────
function SecaoDepartamentos() {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState({
    nome: "", descricao: "", cor: "#6366f1", slaMinutos: 60,
    limiteChatsSimultaneos: 5, distribuicaoAutomatica: 1,
  });
  const [salvando, setSalvando] = useState(false);

  const { data: departamentos = [], refetch } = trpc.atendimento.listarDepartamentos.useQuery();
  const criarMutation = trpc.atendimento.criarDepartamento.useMutation({
    onSuccess: () => { toast.success("Departamento criado!"); refetch(); setModalAberto(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.atendimento.atualizarDepartamento.useMutation({
    onSuccess: () => { toast.success("Departamento atualizado!"); refetch(); setModalAberto(false); },
    onError: (e) => toast.error(e.message),
  });

  const abrirCriar = () => {
    setEditando(null);
    setForm({ nome: "", descricao: "", cor: "#6366f1", slaMinutos: 60, limiteChatsSimultaneos: 5, distribuicaoAutomatica: 1 });
    setModalAberto(true);
  };

  const abrirEditar = (dep: any) => {
    setEditando(dep);
    setForm({
      nome: dep.nome, descricao: dep.descricao ?? "",
      cor: dep.cor, slaMinutos: dep.slaMinutos,
      limiteChatsSimultaneos: dep.limiteChatsSimultaneos,
      distribuicaoAutomatica: dep.distribuicaoAutomatica,
    });
    setModalAberto(true);
  };

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return; }
    setSalvando(true);
    try {
      if (editando) {
        await atualizarMutation.mutateAsync({ id: editando.id, ...form });
      } else {
        await criarMutation.mutateAsync(form);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Departamentos</h3>
          <p className="text-sm text-muted-foreground">Organize os atendimentos por área (Cobrança, Jurídico, Suporte...)</p>
        </div>
        <Button size="sm" onClick={abrirCriar} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Departamento
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(departamentos as any[]).map((dep) => (
          <Card key={dep.id} className="border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: dep.cor }}>
                    {dep.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{dep.nome}</p>
                    {dep.descricao && <p className="text-xs text-muted-foreground">{dep.descricao}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEditar(dep)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline" className="text-xs gap-1">
                  <Timer className="h-3 w-3" />
                  SLA: {dep.slaMinutos}min
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Users className="h-3 w-3" />
                  Limite: {dep.limiteChatsSimultaneos} chats
                </Badge>
                <Badge variant={dep.distribuicaoAutomatica ? "default" : "outline"} className="text-xs">
                  {dep.distribuicaoAutomatica ? "Auto-distribuição ativa" : "Distribuição manual"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {(departamentos as any[]).length === 0 && (
          <div className="col-span-2 text-center py-10 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum departamento criado ainda</p>
          </div>
        )}
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Departamento" : "Novo Departamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Cobrança, Jurídico..." />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} className="resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <SeletorCor value={form.cor} onChange={(v) => setForm(f => ({ ...f, cor: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SLA (minutos)</Label>
                <Input type="number" min={1} value={form.slaMinutos} onChange={(e) => setForm(f => ({ ...f, slaMinutos: parseInt(e.target.value) || 60 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Limite de chats simultâneos</Label>
                <Input type="number" min={1} value={form.limiteChatsSimultaneos} onChange={(e) => setForm(f => ({ ...f, limiteChatsSimultaneos: parseInt(e.target.value) || 5 }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Distribuição automática</p>
                <p className="text-xs text-muted-foreground">Atribuir automaticamente ao operador com menor carga</p>
              </div>
              <Switch
                checked={form.distribuicaoAutomatica === 1}
                onCheckedChange={(v) => setForm(f => ({ ...f, distribuicaoAutomatica: v ? 1 : 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Seção: Etiquetas ─────────────────────────────────────────────────────────
function SecaoEtiquetas() {
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ nome: "", cor: "#22c55e", descricao: "" });
  const [salvando, setSalvando] = useState(false);

  const { data: etiquetas = [], refetch } = trpc.atendimento.listarEtiquetas.useQuery();
  const criarMutation = trpc.atendimento.criarEtiqueta.useMutation({
    onSuccess: () => { toast.success("Etiqueta criada!"); refetch(); setModalAberto(false); setForm({ nome: "", cor: "#22c55e", descricao: "" }); },
    onError: (e) => toast.error(e.message),
  });

  const handleSalvar = async () => {
    if (!form.nome.trim()) { toast.error("Nome obrigatório"); return; }
    setSalvando(true);
    try { await criarMutation.mutateAsync(form); }
    finally { setSalvando(false); }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Etiquetas</h3>
          <p className="text-sm text-muted-foreground">Categorize atendimentos com etiquetas coloridas</p>
        </div>
        <Button size="sm" onClick={() => setModalAberto(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Etiqueta
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(etiquetas as any[]).map((et) => (
          <div
            key={et.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-sm font-medium shadow-sm"
            style={{ backgroundColor: et.cor }}
          >
            <Tag className="h-3.5 w-3.5" />
            {et.nome}
          </div>
        ))}
        {(etiquetas as any[]).length === 0 && (
          <div className="w-full text-center py-10 text-muted-foreground">
            <Tag className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma etiqueta criada ainda</p>
          </div>
        )}
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Etiqueta</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Urgente, Acordo, Jurídico..." />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <SeletorCor value={form.cor} onChange={(v) => setForm(f => ({ ...f, cor: v }))} />
              <div className="flex items-center gap-2 mt-2">
                <div className="px-3 py-1 rounded-full text-white text-sm font-medium" style={{ backgroundColor: form.cor }}>
                  {form.nome || "Prévia"}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Criar Etiqueta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Seção: Mensagens Rápidas ─────────────────────────────────────────────────
function SecaoMensagensRapidas() {
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [form, setForm] = useState({ titulo: "", atalho: "", conteudo: "" });
  const [salvando, setSalvando] = useState(false);

  const { data: mensagens = [], refetch } = trpc.atendimento.listarMensagensRapidas.useQuery();
  const criarMutation = trpc.atendimento.criarMensagemRapida.useMutation({
    onSuccess: () => { toast.success("Mensagem rápida criada!"); refetch(); setModalAberto(false); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.atendimento.atualizarMensagemRapida.useMutation({
    onSuccess: () => { toast.success("Mensagem atualizada!"); refetch(); setModalAberto(false); },
    onError: (e) => toast.error(e.message),
  });

  const abrirCriar = () => {
    setEditando(null);
    setForm({ titulo: "", atalho: "", conteudo: "" });
    setModalAberto(true);
  };

  const abrirEditar = (mr: any) => {
    setEditando(mr);
    setForm({ titulo: mr.titulo, atalho: mr.atalho, conteudo: mr.conteudo });
    setModalAberto(true);
  };

  const handleSalvar = async () => {
    if (!form.titulo.trim() || !form.atalho.trim() || !form.conteudo.trim()) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    const atalho = form.atalho.startsWith("/") ? form.atalho : `/${form.atalho}`;
    setSalvando(true);
    try {
      if (editando) {
        await atualizarMutation.mutateAsync({ id: editando.id, ...form, atalho });
      } else {
        await criarMutation.mutateAsync({ ...form, atalho });
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold">Mensagens Rápidas</h3>
          <p className="text-sm text-muted-foreground">Respostas pré-definidas acessíveis por atalho (ex: /boleto)</p>
        </div>
        <Button size="sm" onClick={abrirCriar} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Mensagem
        </Button>
      </div>

      <div className="space-y-2">
        {(mensagens as any[]).map((mr) => (
          <div key={mr.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card hover:shadow-sm transition-shadow">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">{mr.atalho}</Badge>
                <span className="text-sm font-medium">{mr.titulo}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{mr.conteudo}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => abrirEditar(mr)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {(mensagens as any[]).length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhuma mensagem rápida criada ainda</p>
            <p className="text-xs mt-1">Use atalhos como /boleto, /acordo, /prazo para agilizar o atendimento</p>
          </div>
        )}
      </div>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Mensagem Rápida" : "Nova Mensagem Rápida"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={form.titulo} onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Enviar Boleto" />
              </div>
              <div className="space-y-1.5">
                <Label>Atalho *</Label>
                <Input
                  value={form.atalho}
                  onChange={(e) => setForm(f => ({ ...f, atalho: e.target.value }))}
                  placeholder="Ex: /boleto"
                />
                <p className="text-[10px] text-muted-foreground">Comece com / (ex: /boleto)</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Conteúdo da mensagem *</Label>
              <Textarea
                value={form.conteudo}
                onChange={(e) => setForm(f => ({ ...f, conteudo: e.target.value }))}
                rows={5}
                placeholder="Texto que será inserido automaticamente no campo de mensagem..."
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{form.conteudo.length} caracteres</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function AtendimentoConfig() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Configurações de Atendimento
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure departamentos, etiquetas, mensagens rápidas e regras de SLA para o sistema de multiatendimento.
        </p>
      </div>

      <Tabs defaultValue="departamentos">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="departamentos" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Departamentos
          </TabsTrigger>
          <TabsTrigger value="etiquetas" className="gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Etiquetas
          </TabsTrigger>
          <TabsTrigger value="rapidas" className="gap-1.5">
            <Zap className="h-3.5 w-3.5" />
            Msg. Rápidas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="departamentos" className="mt-4">
          <SecaoDepartamentos />
        </TabsContent>

        <TabsContent value="etiquetas" className="mt-4">
          <SecaoEtiquetas />
        </TabsContent>

        <TabsContent value="rapidas" className="mt-4">
          <SecaoMensagensRapidas />
        </TabsContent>
      </Tabs>
    </div>
  );
}
