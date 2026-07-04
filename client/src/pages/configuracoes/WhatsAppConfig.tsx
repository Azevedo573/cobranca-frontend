import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Wifi, WifiOff, QrCode,
  Building2, Scale, Globe, RefreshCw, ExternalLink, Shield, Link,
} from "lucide-react";

const setorLabel = (s: string) => s === "cobranca" ? "Cobrança" : s === "juridico" ? "Jurídico" : "Geral";
const setorColor = (s: string) => s === "cobranca" ? "bg-blue-500" : s === "juridico" ? "bg-purple-500" : "bg-gray-500";
const setorIcon = (s: string) => {
  if (s === "cobranca") return <Building2 className="h-4 w-4" />;
  if (s === "juridico") return <Scale className="h-4 w-4" />;
  return <Globe className="h-4 w-4" />;
};

type Instancia = {
  id: number; nome: string; setor: string;
  instanceId: string; token: string; clientToken: string; ativo: number;
  delayMinSegundos?: number; delayMaxSegundos?: number;
  limiteHora?: number; limiteDia?: number;
  horarioInicioEnvio?: string; horarioFimEnvio?: string;
  diasSemana?: string;
  horarioAtendimentoInicio?: string; horarioAtendimentoFim?: string;
  diasAtendimento?: string;
  mensagemForaHorario?: string | null;
};

type FormData = {
  id?: number; nome: string; setor: "cobranca" | "juridico" | "geral";
  instanceId: string; token: string; clientToken: string; ativo: number;
  // Horário de atendimento (bot)
  horarioAtendimentoInicio: string; horarioAtendimentoFim: string;
  diasAtendimento: string;
  mensagemForaHorario: string;
  // Cadência anti-ban (fila proativa)
  delayMinSegundos: number; delayMaxSegundos: number;
  limiteHora: number; limiteDia: number;
  horarioInicioEnvio: string; horarioFimEnvio: string;
  diasSemana: string;
};

const emptyForm: FormData = {
  nome: "", setor: "cobranca", instanceId: "", token: "", clientToken: "", ativo: 1,
  horarioAtendimentoInicio: "08:00", horarioAtendimentoFim: "20:00",
  diasAtendimento: "0,1,2,3,4,5,6",
  mensagemForaHorario: "",
  delayMinSegundos: 8, delayMaxSegundos: 25,
  limiteHora: 20, limiteDia: 150,
  horarioInicioEnvio: "08:00", horarioFimEnvio: "20:00",
  diasSemana: "1,2,3,4,5",
};

export default function WhatsAppConfig() {
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [qrInstanciaId, setQrInstanciaId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: instancias = [], isLoading } = trpc.whatsapp.listarInstancias.useQuery();

  const salvarMutation = trpc.whatsapp.salvarInstancia.useMutation({
    onSuccess: () => {
      toast.success("Instância salva com sucesso!");
      utils.whatsapp.listarInstancias.invalidate();
      setModalAberto(false);
      setForm(emptyForm);
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const configurarWebhookMutation = trpc.whatsapp.configurarWebhook.useMutation({
    onSuccess: (data) => {
      toast.success("Webhook configurado com sucesso!");
      utils.whatsapp.listarInstancias.invalidate();
    },
    onError: (err) => toast.error("Erro ao configurar webhook: " + err.message),
  });

  const deletarMutation = trpc.whatsapp.deletarInstancia.useMutation({
    onSuccess: () => {
      toast.success("Instância removida.");
      utils.whatsapp.listarInstancias.invalidate();
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const handleEditar = (inst: Instancia) => {
    setForm({
      id: inst.id, nome: inst.nome, setor: inst.setor as any,
      instanceId: inst.instanceId, token: inst.token, clientToken: inst.clientToken, ativo: inst.ativo,
      horarioAtendimentoInicio: inst.horarioAtendimentoInicio ?? "08:00",
      horarioAtendimentoFim: inst.horarioAtendimentoFim ?? "20:00",
      diasAtendimento: inst.diasAtendimento ?? "0,1,2,3,4,5,6",
      mensagemForaHorario: inst.mensagemForaHorario ?? "",
      delayMinSegundos: inst.delayMinSegundos ?? 8,
      delayMaxSegundos: inst.delayMaxSegundos ?? 25,
      limiteHora: inst.limiteHora ?? 20,
      limiteDia: inst.limiteDia ?? 150,
      horarioInicioEnvio: inst.horarioInicioEnvio ?? "08:00",
      horarioFimEnvio: inst.horarioFimEnvio ?? "20:00",
      diasSemana: inst.diasSemana ?? "1,2,3,4,5",
    });
    setModalAberto(true);
  };

  const handleSalvar = () => {
    if (!form.nome || !form.instanceId || !form.token || !form.clientToken) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    salvarMutation.mutate(form);
  };

  // Componente de status individual
  const StatusBadge = ({ instanciaId }: { instanciaId: number }) => {
    const { data, isLoading } = trpc.whatsapp.statusInstancia.useQuery(
      { instanciaId },
      { refetchInterval: 20000 }
    );
    if (isLoading) return <Badge variant="outline" className="text-xs gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Verificando</Badge>;
    return data?.connected
      ? <Badge className="text-xs gap-1 bg-green-500"><Wifi className="h-3 w-3" />Conectado</Badge>
      : <Badge variant="destructive" className="text-xs gap-1"><WifiOff className="h-3 w-3" />Desconectado</Badge>;
  };

  // Componente de QR Code
  const QrCodeModal = ({ instanciaId }: { instanciaId: number }) => {
    const { data, isLoading, refetch } = trpc.whatsapp.qrCode.useQuery({ instanciaId }, { enabled: true });
    return (
      <Dialog open onOpenChange={() => setQrInstanciaId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {isLoading ? (
              <div className="w-48 h-48 bg-muted rounded-lg animate-pulse" />
            ) : data?.qrcode ? (
              <img src={data.qrcode} alt="QR Code" className="w-48 h-48 rounded-lg border" />
            ) : (
              <p className="text-sm text-muted-foreground">QR Code não disponível. A instância pode já estar conectada.</p>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho → Escaneie o QR Code
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuração WhatsApp</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie as instâncias Z-API por setor (Cobrança, Jurídico, etc.)
          </p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setModalAberto(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Instância
        </Button>
      </div>

      {/* Guia de configuração */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-blue-700 dark:text-blue-400">Como obter as credenciais Z-API</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-blue-600 dark:text-blue-300 space-y-1">
          <p>1. Acesse <a href="https://app.z-api.io" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-0.5">app.z-api.io <ExternalLink className="h-3 w-3" /></a> e crie uma instância para cada setor.</p>
          <p>2. Copie o <strong>Instance ID</strong> e o <strong>Token</strong> da instância criada.</p>
          <p>3. Copie o <strong>Client Token</strong> em Configurações → Segurança da conta.</p>
          <p>4. Configure o Webhook para: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">https://seu-dominio.manus.space/api/webhook/whatsapp/INSTANCIA_ID</code></p>
        </CardContent>
      </Card>

      {/* Lista de instâncias */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />)}
        </div>
      ) : instancias.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <QrCode className="h-6 w-6 text-green-500" />
            </div>
            <p className="font-medium">Nenhuma instância configurada</p>
            <p className="text-sm text-muted-foreground mt-1">Clique em "Nova Instância" para começar</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {(instancias as Instancia[]).map((inst) => (
            <Card key={inst.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0 ${setorColor(inst.setor)}`}>
                  {setorIcon(inst.setor)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{inst.nome}</h3>
                    <Badge variant="outline" className="text-xs">{setorLabel(inst.setor)}</Badge>
                    {inst.ativo === 0 && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                    <StatusBadge instanciaId={inst.id} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Instance ID: <code className="font-mono">{inst.instanceId}</code>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline" size="sm" className="gap-1.5"
                    onClick={() => configurarWebhookMutation.mutate({ instanciaId: inst.id })}
                    disabled={configurarWebhookMutation.isPending}
                    title="Registrar URL de webhook na Z-API para receber mensagens"
                  >
                    {configurarWebhookMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
                    Webhook
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setQrInstanciaId(inst.id)}>
                    <QrCode className="h-3.5 w-3.5" />
                    QR Code
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditar(inst)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("Remover esta instância?")) deletarMutation.mutate({ id: inst.id }); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de criação/edição */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar Instância" : "Nova Instância"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="ex: Cobrança" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Setor *</Label>
                <Select value={form.setor} onValueChange={v => setForm(f => ({ ...f, setor: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cobranca">Cobrança</SelectItem>
                    <SelectItem value="juridico">Jurídico</SelectItem>
                    <SelectItem value="geral">Geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Instance ID *</Label>
              <Input placeholder="ex: 3A1B2C3D4E5F" value={form.instanceId} onChange={e => setForm(f => ({ ...f, instanceId: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Token *</Label>
              <Input placeholder="Token da instância" value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Client Token *</Label>
              <Input placeholder="Token do cliente Z-API" value={form.clientToken} onChange={e => setForm(f => ({ ...f, clientToken: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={String(form.ativo)} onValueChange={v => setForm(f => ({ ...f, ativo: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ativo</SelectItem>
                  <SelectItem value="0">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Horário de Atendimento */}
            <div className="border rounded-lg p-4 space-y-4 bg-green-50 dark:bg-green-950/20">
              <div className="flex items-center gap-2">
                <span className="text-lg">🕐</span>
                <span className="text-sm font-semibold text-green-800 dark:text-green-400">Horário de Atendimento</span>
                <span className="text-xs text-muted-foreground">Quando o bot responde mensagens recebidas</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Horário de início</Label>
                  <Input type="time" value={form.horarioAtendimentoInicio}
                    onChange={e => setForm(f => ({ ...f, horarioAtendimentoInicio: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horário de fim</Label>
                  <Input type="time" value={form.horarioAtendimentoFim}
                    onChange={e => setForm(f => ({ ...f, horarioAtendimentoFim: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dias de atendimento</Label>
                <div className="flex gap-2 flex-wrap">
                  {[{v:"0",l:"Dom"},{v:"1",l:"Seg"},{v:"2",l:"Ter"},{v:"3",l:"Qua"},{v:"4",l:"Qui"},{v:"5",l:"Sex"},{v:"6",l:"Sáb"}].map(d => {
                    const dias = form.diasAtendimento.split(",").filter(Boolean);
                    const ativo = dias.includes(d.v);
                    return (
                      <button key={d.v} type="button"
                        onClick={() => {
                          const novos = ativo ? dias.filter(x => x !== d.v) : [...dias, d.v];
                          setForm(f => ({ ...f, diasAtendimento: novos.sort().join(",") }));
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          ativo ? "bg-green-500 text-white border-green-500" : "bg-background border-border text-muted-foreground"
                        }`}>
                        {d.l}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">O bot só responde nos dias marcados</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem fora do horário (opcional)</Label>
                <Textarea
                  placeholder="Ex: Nosso atendimento é das 08h às 20h.&#10;Retornaremos em breve!"
                  value={form.mensagemForaHorario}
                  onChange={e => setForm(f => ({ ...f, mensagemForaHorario: e.target.value }))}
                  rows={3}
                  className="resize-none text-sm"
                />
                <p className="text-xs text-muted-foreground">Enviada automaticamente quando o cliente escreve fora do horário. Deixe em branco para ignorar.</p>
              </div>
            </div>

            {/* Cadência Anti-Ban */}
            <div className="border rounded-lg p-4 space-y-4 bg-amber-50 dark:bg-amber-950/20">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-400">Cadência Anti-Ban</span>
                <span className="text-xs text-muted-foreground">Configurações para evitar bloqueio do número</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Delay mínimo (segundos)</Label>
                  <Input type="number" min={3} max={60} value={form.delayMinSegundos}
                    onChange={e => setForm(f => ({ ...f, delayMinSegundos: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Aguarda no mínimo N segundos entre mensagens</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Delay máximo (segundos)</Label>
                  <Input type="number" min={5} max={120} value={form.delayMaxSegundos}
                    onChange={e => setForm(f => ({ ...f, delayMaxSegundos: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Aguarda no máximo N segundos (aleatório)</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Limite por hora</Label>
                  <Input type="number" min={1} max={100} value={form.limiteHora}
                    onChange={e => setForm(f => ({ ...f, limiteHora: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Máx. mensagens enviadas por hora</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Limite por dia</Label>
                  <Input type="number" min={1} max={1000} value={form.limiteDia}
                    onChange={e => setForm(f => ({ ...f, limiteDia: Number(e.target.value) }))} />
                  <p className="text-xs text-muted-foreground">Máx. mensagens enviadas por dia</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horário de início</Label>
                  <Input type="time" value={form.horarioInicioEnvio}
                    onChange={e => setForm(f => ({ ...f, horarioInicioEnvio: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Horário de fim</Label>
                  <Input type="time" value={form.horarioFimEnvio}
                    onChange={e => setForm(f => ({ ...f, horarioFimEnvio: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dias da semana permitidos</Label>
                <div className="flex gap-2 flex-wrap">
                  {[{v:"0",l:"Dom"},{v:"1",l:"Seg"},{v:"2",l:"Ter"},{v:"3",l:"Qua"},{v:"4",l:"Qui"},{v:"5",l:"Sex"},{v:"6",l:"Sáb"}].map(d => {
                    const dias = form.diasSemana.split(",").filter(Boolean);
                    const ativo = dias.includes(d.v);
                    return (
                      <button key={d.v} type="button"
                        onClick={() => {
                          const novos = ativo ? dias.filter(x => x !== d.v) : [...dias, d.v];
                          setForm(f => ({ ...f, diasSemana: novos.sort().join(",") }));
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          ativo ? "bg-green-500 text-white border-green-500" : "bg-background border-border text-muted-foreground"
                        }`}>
                        {d.l}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Envios só ocorrem nos dias marcados</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvarMutation.isPending}>
              {salvarMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal QR Code */}
      {qrInstanciaId && <QrCodeModal instanciaId={qrInstanciaId} />}
    </div>
  );
}
