import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Edit, Play, ChevronDown, ChevronUp,
  MessageCircle, Mail, Phone, FileText, Bell,
  Clock, AlertTriangle, Settings, Shield, History, Target, ListFilter
} from "lucide-react";

// ─── Constantes ────────────────────────────────────────────────────────────────

const TIPO_ACAO_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" />, color: "bg-green-100 text-green-700" },
  email: { label: "E-mail", icon: <Mail className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  sms: { label: "SMS", icon: <Phone className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-700" },
  carta: { label: "Carta", icon: <FileText className="w-4 h-4" />, color: "bg-gray-100 text-gray-700" },
  ligacao: { label: "Ligação", icon: <Phone className="w-4 h-4" />, color: "bg-purple-100 text-purple-700" },
  notificacao_interna: { label: "Notificação Interna", icon: <Bell className="w-4 h-4" />, color: "bg-orange-100 text-orange-700" },
};

const FINALIDADES = [
  { value: "debitos_abertos", label: "Cobrança de unidade com débitos originais em aberto" },
  { value: "acordo_ativo", label: "Cobrança de unidade com acordo ativo" },
  { value: "boleto_acordo", label: "Envio de boleto de acordo" },
  { value: "lembrete_vencimento_acordo", label: "Lembrete de vencimento de boleto de acordo" },
  { value: "parcela_vencida", label: "Cobrança de parcela de acordo vencida" },
  { value: "reenvio_boleto", label: "Reenvio de boleto atualizado" },
  { value: "acordo_proximo_cancelamento", label: "Aviso de acordo próximo ao cancelamento" },
  { value: "acordo_cancelado", label: "Comunicação de acordo cancelado" },
];

const TEMPLATES_PADRAO: Record<string, string> = {
  whatsapp: `Olá {{nome}}, tudo bem?\n\nInformamos que existe uma pendência financeira referente ao imóvel {{bloco}} Unidade {{unidade}} no valor de *{{valor}}* com vencimento em {{vencimento}}.\n\nJá se passaram *{{dias_atraso}} dias* do vencimento.\n\nPara regularizar sua situação, entre em contato conosco.\n\n_{{condominio}}_`,
  email: `Prezado(a) {{nome}},\n\nVim informar que existe uma pendência financeira no valor de {{valor}} com vencimento em {{vencimento}}.\n\nDias em atraso: {{dias_atraso}}\n\nPor favor, entre em contato para regularizar.\n\nAtenciosamente,\n{{condominio}}`,
  sms: `{{condominio}}: Pendência de {{valor}} venc. {{vencimento}} ({{dias_atraso}} dias atraso). Contate-nos.`,
  carta: `Prezado(a) {{nome}},\n\nVimos por meio desta notificar V.Sa. sobre débito em aberto referente ao imóvel {{bloco}} Unidade {{unidade}}, no valor de {{valor}}, com vencimento em {{vencimento}}, totalizando {{dias_atraso}} dias de atraso.\n\nSolicitamos a regularização no prazo de 5 dias úteis.\n\n{{condominio}}`,
  ligacao: `Script: Boa tarde, posso falar com {{nome}}? Sou do escritório de cobrança do {{condominio}}. Estou ligando referente a uma pendência de {{valor}} com {{dias_atraso}} dias de atraso. Podemos regularizar?`,
  notificacao_interna: `Devedor {{nome}} ({{bloco}} Unidade {{unidade}}) com {{dias_atraso}} dias de atraso. Valor: {{valor}}.`,
};

// ─── Tipos ─────────────────────────────────────────────────────────────────────

type Posicao = {
  id: number;
  reguaId: number;
  diasInadimplencia: number;
  tipoAcao: string;
  titulo: string;
  template: string | null;
  ordem: number | null;
  ativa: number | null;
};

type Regua = {
  id: number;
  condominioId: number | null;
  nome: string;
  descricao: string | null;
  tipoCobranca: string | null;
  ativa: number | null;
  ultimaExecucao: Date | null;
  createdAt: Date | null;
  abrangenciaCondominio: string | null;
  condominiosSelecionados: string | null;
  abrangenciaCategoria: string | null;
  finalidades: string | null;
  criterios: string | null;
  regrasBloqueio: string | null;
  prioridade: number | null;
  intervaloMinimoContatos: number | null;
  posicoes: Posicao[];
};

type FormRegua = {
  nome: string;
  descricao: string;
  tipoCobranca: string;
  ativa: boolean;
  abrangenciaCondominio: "todos" | "selecionados";
  condominiosSelecionados: number[];
  abrangenciaCategoria: "todos" | "padrao" | "ajuizada";
  finalidades: string[];
  criterios: {
    diasAtrasoMin: number | null;
    diasAtrasoMax: number | null;
    exigeAcordoAtivo: boolean;
    exigeDebitosAbertos: boolean;
    exigeParcelaVencida: boolean;
    exigeBoletoEmitido: boolean;
    exigeProcessoJudicial: boolean;
    exigeNegociacaoAndamento: boolean;
  };
  regrasBloqueio: {
    naoDisparar_seContatoRecente: boolean;
    diasIntervaloBloqueio: number;
    interromper_aposPagemento: boolean;
    interromper_aposAcordoCancelado: boolean;
    naoIncluirParcelasFuturas: boolean;
    priorizarAcordosComAtraso: boolean;
  };
  prioridade: number;
  intervaloMinimoContatos: number;
};

const defaultFormRegua = (): FormRegua => ({
  nome: "",
  descricao: "",
  tipoCobranca: "todos",
  ativa: true,
  abrangenciaCondominio: "todos",
  condominiosSelecionados: [],
  abrangenciaCategoria: "todos",
  finalidades: [],
  criterios: {
    diasAtrasoMin: null,
    diasAtrasoMax: null,
    exigeAcordoAtivo: false,
    exigeDebitosAbertos: false,
    exigeParcelaVencida: false,
    exigeBoletoEmitido: false,
    exigeProcessoJudicial: false,
    exigeNegociacaoAndamento: false,
  },
  regrasBloqueio: {
    naoDisparar_seContatoRecente: false,
    diasIntervaloBloqueio: 7,
    interromper_aposPagemento: true,
    interromper_aposAcordoCancelado: true,
    naoIncluirParcelasFuturas: true,
    priorizarAcordosComAtraso: false,
  },
  prioridade: 0,
  intervaloMinimoContatos: 0,
});

function reguaToForm(r: Regua): FormRegua {
  let criterios = defaultFormRegua().criterios;
  let regrasBloqueio = defaultFormRegua().regrasBloqueio;
  try { if (r.criterios) criterios = { ...criterios, ...JSON.parse(r.criterios) }; } catch {}
  try { if (r.regrasBloqueio) regrasBloqueio = { ...regrasBloqueio, ...JSON.parse(r.regrasBloqueio) }; } catch {}
  let condSel: number[] = [];
  try { if (r.condominiosSelecionados) condSel = JSON.parse(r.condominiosSelecionados); } catch {}
  let finalidades: string[] = [];
  try { if (r.finalidades) finalidades = JSON.parse(r.finalidades); } catch {}
  return {
    nome: r.nome,
    descricao: r.descricao ?? "",
    tipoCobranca: r.tipoCobranca ?? "todos",
    ativa: (r.ativa ?? 1) === 1,
    abrangenciaCondominio: (r.abrangenciaCondominio as any) ?? "todos",
    condominiosSelecionados: condSel,
    abrangenciaCategoria: (r.abrangenciaCategoria as any) ?? "todos",
    finalidades,
    criterios,
    regrasBloqueio,
    prioridade: r.prioridade ?? 0,
    intervaloMinimoContatos: r.intervaloMinimoContatos ?? 0,
  };
}

function formToPayload(f: FormRegua) {
  return {
    nome: f.nome,
    descricao: f.descricao,
    tipoCobranca: f.tipoCobranca as any,
    ativa: f.ativa ? 1 : 0,
    abrangenciaCondominio: f.abrangenciaCondominio,
    condominiosSelecionados: f.abrangenciaCondominio === "selecionados" ? JSON.stringify(f.condominiosSelecionados) : null,
    abrangenciaCategoria: f.abrangenciaCategoria,
    finalidades: f.finalidades.length > 0 ? JSON.stringify(f.finalidades) : null,
    criterios: JSON.stringify(f.criterios),
    regrasBloqueio: JSON.stringify(f.regrasBloqueio),
    prioridade: f.prioridade,
    intervaloMinimoContatos: f.intervaloMinimoContatos,
  };
}

// ─── Componente principal ───────────────────────────────────────────────────────

export default function ReguaCobranca() {
  const utils = trpc.useUtils();

  const { data: reguas, isLoading } = trpc.regua.list.useQuery({});
  const { data: condominios } = trpc.condominios.list.useQuery(undefined);

  const [showCreateRegua, setShowCreateRegua] = useState(false);
  const [showEditRegua, setShowEditRegua] = useState<Regua | null>(null);
  const [showAddPosicao, setShowAddPosicao] = useState<number | null>(null);
  const [showEditPosicao, setShowEditPosicao] = useState<Posicao | null>(null);
  const [showHistorico, setShowHistorico] = useState<number | null>(null);
  const [expandedRegua, setExpandedRegua] = useState<number | null>(null);
  const [executandoRegua, setExecutandoRegua] = useState<number | null>(null);

  const [formRegua, setFormRegua] = useState<FormRegua>(defaultFormRegua());
  const [formPosicao, setFormPosicao] = useState({
    diasInadimplencia: 0,
    tipoAcao: "whatsapp",
    titulo: "",
    template: "",
    ativa: true,
  });

  const createRegua = trpc.regua.create.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      setShowCreateRegua(false);
      setFormRegua(defaultFormRegua());
      toast.success("Régua criada com sucesso!");
    },
    onError: (e) => toast.error(`Erro ao criar régua: ${e.message}`),
  });

  const updateRegua = trpc.regua.update.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      setShowEditRegua(null);
      toast.success("Régua atualizada!");
    },
    onError: (e) => toast.error(`Erro ao atualizar: ${e.message}`),
  });

  const deleteRegua = trpc.regua.delete.useMutation({
    onSuccess: () => { utils.regua.list.invalidate(); toast.success("Régua excluída!"); },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  const createPosicao = trpc.regua.createPosicao.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      setShowAddPosicao(null);
      setFormPosicao({ diasInadimplencia: 0, tipoAcao: "whatsapp", titulo: "", template: "", ativa: true });
      toast.success("Etapa adicionada!");
    },
    onError: (e) => toast.error(`Erro ao adicionar etapa: ${e.message}`),
  });

  const updatePosicao = trpc.regua.updatePosicao.useMutation({
    onSuccess: () => { utils.regua.list.invalidate(); setShowEditPosicao(null); toast.success("Etapa atualizada!"); },
    onError: (e) => toast.error(`Erro ao atualizar etapa: ${e.message}`),
  });

  const deletePosicao = trpc.regua.deletePosicao.useMutation({
    onSuccess: () => { utils.regua.list.invalidate(); toast.success("Etapa removida!"); },
    onError: (e) => toast.error(`Erro ao remover etapa: ${e.message}`),
  });

  const executarReguaMutation = trpc.regua.executar.useMutation({
    onSuccess: (data) => {
      setExecutandoRegua(null);
      utils.regua.list.invalidate();
      toast.success(`Régua executada! ${data.disparosRealizados} disparo(s). ${data.disparosIgnorados} ignorado(s).`);
      if (data.erros.length > 0) toast.error(`Atenção: ${data.erros.slice(0, 2).join("; ")}`);
    },
    onError: (e) => { setExecutandoRegua(null); toast.error(`Erro ao executar: ${e.message}`); },
  });

  const handleOpenEdit = (r: Regua) => {
    setFormRegua(reguaToForm(r));
    setShowEditRegua(r);
  };

  const handleSaveCreate = () => {
    if (!formRegua.nome.trim()) { toast.error("Informe o nome da régua"); return; }
    createRegua.mutate(formToPayload(formRegua));
  };

  const handleSaveEdit = () => {
    if (!showEditRegua) return;
    updateRegua.mutate({ id: showEditRegua.id, ...formToPayload(formRegua) });
  };

  const toggleFinalidade = (v: string) => {
    setFormRegua(prev => ({
      ...prev,
      finalidades: prev.finalidades.includes(v)
        ? prev.finalidades.filter(f => f !== v)
        : [...prev.finalidades, v],
    }));
  };

  const toggleCondominioSelecionado = (id: number) => {
    setFormRegua(prev => ({
      ...prev,
      condominiosSelecionados: prev.condominiosSelecionados.includes(id)
        ? prev.condominiosSelecionados.filter(c => c !== id)
        : [...prev.condominiosSelecionados, id],
    }));
  };

  const getFinalidadesLabel = (json: string | null) => {
    if (!json) return "Todas";
    try {
      const arr: string[] = JSON.parse(json);
      if (!arr.length) return "Todas";
      return arr.map(v => FINALIDADES.find(f => f.value === v)?.label ?? v).join(", ");
    } catch { return "—"; }
  };

  // ─── Formulário de régua (abas) ─────────────────────────────────────────────

  const ReguaForm = () => (
    <Tabs defaultValue="geral" className="w-full">
      <TabsList className="grid w-full grid-cols-4 mb-4">
        <TabsTrigger value="geral" className="flex items-center gap-1 text-xs"><Settings className="w-3 h-3" />Geral</TabsTrigger>
        <TabsTrigger value="abrangencia" className="flex items-center gap-1 text-xs"><Target className="w-3 h-3" />Abrangência</TabsTrigger>
        <TabsTrigger value="criterios" className="flex items-center gap-1 text-xs"><ListFilter className="w-3 h-3" />Critérios</TabsTrigger>
        <TabsTrigger value="bloqueio" className="flex items-center gap-1 text-xs"><Shield className="w-3 h-3" />Bloqueios</TabsTrigger>
      </TabsList>

      {/* ABA GERAL */}
      <TabsContent value="geral" className="space-y-4">
        <div className="grid gap-4">
          <div>
            <Label>Nome da Régua *</Label>
            <Input value={formRegua.nome} onChange={e => setFormRegua(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Cobrança Padrão 30 dias" />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={formRegua.descricao} onChange={e => setFormRegua(p => ({ ...p, descricao: e.target.value }))} placeholder="Descreva o objetivo desta régua..." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo de Cobrança</Label>
              <Select value={formRegua.tipoCobranca} onValueChange={v => setFormRegua(p => ({ ...p, tipoCobranca: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  <SelectItem value="condominio">Cota Condominial</SelectItem>
                  <SelectItem value="salao_jogos">Salão de Jogos</SelectItem>
                  <SelectItem value="churrasqueira">Churrasqueira</SelectItem>
                  <SelectItem value="cota_extra">Cota Extra</SelectItem>
                  <SelectItem value="multa">Multa</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Input type="number" min={0} max={100} value={formRegua.prioridade} onChange={e => setFormRegua(p => ({ ...p, prioridade: Number(e.target.value) }))} />
              <p className="text-xs text-muted-foreground mt-1">Maior valor = mais prioritária quando houver conflito</p>
            </div>
          </div>
          <div>
            <Label>Intervalo mínimo entre contatos (dias)</Label>
            <Input type="number" min={0} value={formRegua.intervaloMinimoContatos} onChange={e => setFormRegua(p => ({ ...p, intervaloMinimoContatos: Number(e.target.value) }))} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={formRegua.ativa} onCheckedChange={v => setFormRegua(p => ({ ...p, ativa: v }))} />
            <Label>Régua ativa</Label>
          </div>
        </div>
      </TabsContent>

      {/* ABA ABRANGÊNCIA */}
      <TabsContent value="abrangencia" className="space-y-5">
        <div>
          <Label className="text-sm font-semibold">Condomínios</Label>
          <div className="flex gap-3 mt-2">
            {(["todos", "selecionados"] as const).map(v => (
              <button key={v} type="button"
                onClick={() => setFormRegua(p => ({ ...p, abrangenciaCondominio: v }))}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${formRegua.abrangenciaCondominio === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {v === "todos" ? "Todos os condomínios" : "Condomínios específicos"}
              </button>
            ))}
          </div>
          {formRegua.abrangenciaCondominio === "selecionados" && (
            <div className="mt-3 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded-md p-3">
              {condominios?.map(c => (
                <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={formRegua.condominiosSelecionados.includes(c.id)} onCheckedChange={() => toggleCondominioSelecionado(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <Label className="text-sm font-semibold">Categoria da Unidade</Label>
          <div className="flex gap-3 mt-2">
            {([["todos", "Todas as categorias"], ["padrao", "Somente Padrão"], ["ajuizada", "Somente Ajuizada"]] as const).map(([v, label]) => (
              <button key={v} type="button"
                onClick={() => setFormRegua(p => ({ ...p, abrangenciaCategoria: v }))}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${formRegua.abrangenciaCategoria === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <Label className="text-sm font-semibold">Finalidades de Cobrança</Label>
          <p className="text-xs text-muted-foreground mb-3">Selecione em quais situações esta régua deve ser aplicada. Se nenhuma for selecionada, aplica a todas.</p>
          <div className="space-y-2">
            {FINALIDADES.map(f => (
              <label key={f.value} className="flex items-start gap-2 cursor-pointer text-sm">
                <Checkbox
                  checked={formRegua.finalidades.includes(f.value)}
                  onCheckedChange={() => toggleFinalidade(f.value)}
                  className="mt-0.5"
                />
                <span>{f.label}</span>
              </label>
            ))}
          </div>
        </div>
      </TabsContent>

      {/* ABA CRITÉRIOS */}
      <TabsContent value="criterios" className="space-y-4">
        <p className="text-sm text-muted-foreground">Configure as condições que uma unidade deve atender para entrar nesta régua.</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Dias de atraso mínimo</Label>
            <Input type="number" min={0} placeholder="Sem mínimo"
              value={formRegua.criterios.diasAtrasoMin ?? ""}
              onChange={e => setFormRegua(p => ({ ...p, criterios: { ...p.criterios, diasAtrasoMin: e.target.value ? Number(e.target.value) : null } }))} />
          </div>
          <div>
            <Label>Dias de atraso máximo</Label>
            <Input type="number" min={0} placeholder="Sem máximo"
              value={formRegua.criterios.diasAtrasoMax ?? ""}
              onChange={e => setFormRegua(p => ({ ...p, criterios: { ...p.criterios, diasAtrasoMax: e.target.value ? Number(e.target.value) : null } }))} />
          </div>
        </div>

        <Separator />
        <Label className="text-sm font-semibold">Condições obrigatórias</Label>

        {([
          ["exigeDebitosAbertos", "Exige débitos originais em aberto"],
          ["exigeAcordoAtivo", "Exige acordo ativo"],
          ["exigeParcelaVencida", "Exige parcela de acordo vencida"],
          ["exigeBoletoEmitido", "Exige boleto emitido"],
          ["exigeProcessoJudicial", "Exige processo judicial / situação ajuizada"],
          ["exigeNegociacaoAndamento", "Exige negociação em andamento"],
        ] as [keyof typeof formRegua.criterios, string][]).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch
              checked={formRegua.criterios[key] as boolean}
              onCheckedChange={v => setFormRegua(p => ({ ...p, criterios: { ...p.criterios, [key]: v } }))}
            />
            {label}
          </label>
        ))}
      </TabsContent>

      {/* ABA BLOQUEIOS */}
      <TabsContent value="bloqueio" className="space-y-4">
        <p className="text-sm text-muted-foreground">Defina regras para evitar cobranças duplicadas ou indevidas.</p>

        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <Switch
              checked={formRegua.regrasBloqueio.naoDisparar_seContatoRecente}
              onCheckedChange={v => setFormRegua(p => ({ ...p, regrasBloqueio: { ...p.regrasBloqueio, naoDisparar_seContatoRecente: v } }))}
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Não disparar se houver contato recente</p>
              {formRegua.regrasBloqueio.naoDisparar_seContatoRecente && (
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-xs">Intervalo (dias):</Label>
                  <Input type="number" min={1} className="w-24 h-7 text-sm"
                    value={formRegua.regrasBloqueio.diasIntervaloBloqueio}
                    onChange={e => setFormRegua(p => ({ ...p, regrasBloqueio: { ...p.regrasBloqueio, diasIntervaloBloqueio: Number(e.target.value) } }))} />
                </div>
              )}
            </div>
          </div>

          {([
            ["interromper_aposPagemento", "Interromper régua após pagamento ou baixa do boleto"],
            ["interromper_aposAcordoCancelado", "Interromper régua quando acordo for cancelado ou quitado"],
            ["naoIncluirParcelasFuturas", "Não incluir parcelas futuras aguardando liberação sequencial"],
            ["priorizarAcordosComAtraso", "Priorizar unidades com acordos em atraso que bloqueiam próximas parcelas"],
          ] as [keyof typeof formRegua.regrasBloqueio, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer text-sm">
              <Switch
                checked={formRegua.regrasBloqueio[key] as boolean}
                onCheckedChange={v => setFormRegua(p => ({ ...p, regrasBloqueio: { ...p.regrasBloqueio, [key]: v } }))}
              />
              {label}
            </label>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            Régua de Cobrança
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure réguas flexíveis com abrangência global ou segmentada por condomínio, categoria e finalidade.
          </p>
        </div>
        <Button onClick={() => { setFormRegua(defaultFormRegua()); setShowCreateRegua(true); }}>
          <Plus className="w-4 h-4 mr-2" /> Nova Régua
        </Button>
      </div>

      {/* Lista de Réguas */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando réguas...</div>
      ) : !reguas || reguas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma régua configurada.</p>
            <p className="text-sm mt-1">Crie a primeira régua para automatizar as cobranças.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(reguas as Regua[]).map((regua) => {
            const isExpanded = expandedRegua === regua.id;
            let finalidadesArr: string[] = [];
            try { if (regua.finalidades) finalidadesArr = JSON.parse(regua.finalidades); } catch {}

            return (
              <Card key={regua.id} className={`transition-all ${(regua.ativa ?? 1) === 0 ? "opacity-60" : ""}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">{regua.nome}</CardTitle>
                        <Badge variant={(regua.ativa ?? 1) === 1 ? "default" : "secondary"}>
                          {(regua.ativa ?? 1) === 1 ? "Ativa" : "Inativa"}
                        </Badge>
                        {regua.prioridade ? (
                          <Badge variant="outline" className="text-xs">Prioridade {regua.prioridade}</Badge>
                        ) : null}
                      </div>
                      {regua.descricao && <CardDescription className="mt-1">{regua.descricao}</CardDescription>}

                      {/* Badges de abrangência */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {regua.abrangenciaCondominio === "selecionados" ? "Condomínios específicos" : "Todos os condomínios"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {regua.abrangenciaCategoria === "padrao" ? "Somente Padrão" : regua.abrangenciaCategoria === "ajuizada" ? "Somente Ajuizada" : "Todas as categorias"}
                        </Badge>
                        {finalidadesArr.length > 0 ? (
                          <Badge variant="outline" className="text-xs text-blue-700 border-blue-300">
                            {finalidadesArr.length} finalidade(s)
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-700 border-green-300">Todas as finalidades</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {regua.posicoes.length} etapa(s)
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setShowHistorico(regua.id)} title="Histórico">
                        <History className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(regua)} title="Editar">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm"
                        onClick={() => { setExecutandoRegua(regua.id); executarReguaMutation.mutate({ reguaId: regua.id }); }}
                        disabled={executandoRegua === regua.id}
                        title="Executar agora">
                        <Play className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir esta régua?")) deleteRegua.mutate({ id: regua.id }); }} title="Excluir">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setExpandedRegua(isExpanded ? null : regua.id)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <Separator className="mb-4" />

                    {/* Finalidades */}
                    {finalidadesArr.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Finalidades</p>
                        <div className="flex flex-wrap gap-1.5">
                          {finalidadesArr.map(v => (
                            <Badge key={v} variant="secondary" className="text-xs">
                              {FINALIDADES.find(f => f.value === v)?.label ?? v}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Etapas */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Etapas de Comunicação</p>
                    </div>

                    {regua.posicoes.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-3">Nenhuma etapa configurada.</p>
                        <Button variant="outline" size="sm" onClick={() => {
                          setFormPosicao({ diasInadimplencia: 0, tipoAcao: "whatsapp", titulo: "", template: TEMPLATES_PADRAO.whatsapp, ativa: true });
                          setShowAddPosicao(regua.id);
                        }}>
                          <Plus className="w-3 h-3 mr-1" /> Adicionar Primeira Etapa
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto pb-2">
                        {/* Linha do tempo horizontal */}
                        <div className="relative flex items-start gap-0 min-w-max">
                          {/* Linha conectora */}
                          <div className="absolute top-6 left-6 right-6 h-0.5 bg-border z-0" />

                          {regua.posicoes.sort((a, b) => a.diasInadimplencia - b.diasInadimplencia).map((pos, idx) => {
                            const acao = TIPO_ACAO_LABELS[pos.tipoAcao];
                            const isAtiva = (pos.ativa ?? 1) === 1;
                            const CANAL_BG: Record<string, string> = {
                              whatsapp: "bg-green-500",
                              email: "bg-blue-500",
                              sms: "bg-yellow-500",
                              carta: "bg-gray-500",
                              ligacao: "bg-purple-500",
                              notificacao_interna: "bg-orange-500",
                            };
                            const bgColor = isAtiva ? (CANAL_BG[pos.tipoAcao] ?? "bg-primary") : "bg-muted-foreground";
                            return (
                              <div key={pos.id} className="relative flex flex-col items-center w-36 px-2 z-10">
                                {/* Marcador numerado */}
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md border-2 border-background ${bgColor} cursor-pointer hover:scale-110 transition-transform`}
                                  title={pos.titulo}
                                  onClick={() => setShowEditPosicao(pos)}
                                >
                                  {idx + 1}
                                </div>

                                {/* Dias */}
                                <div className="mt-2 text-center">
                                  <p className="text-xs font-bold text-foreground">
                                    {pos.diasInadimplencia < 0
                                      ? `-${Math.abs(pos.diasInadimplencia)}d`
                                      : pos.diasInadimplencia === 0
                                      ? "D0"
                                      : `+${pos.diasInadimplencia}d`}
                                  </p>
                                  <p className="text-xs text-muted-foreground leading-tight mt-0.5 max-w-[120px] text-center truncate">{pos.titulo}</p>
                                  <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${acao?.color ?? "bg-gray-100 text-gray-700"}`}>
                                    {acao?.icon}
                                    <span>{acao?.label ?? pos.tipoAcao}</span>
                                  </div>
                                  {!isAtiva && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Inativa</p>
                                  )}
                                </div>

                                {/* Ações */}
                                <div className="flex gap-0.5 mt-1">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowEditPosicao(pos)}>
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { if (confirm("Remover esta etapa?")) deletePosicao.mutate({ id: pos.id }); }}>
                                    <Trash2 className="w-3 h-3 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}

                          {/* Botão de adicionar no final da linha */}
                          <div className="relative flex flex-col items-center w-20 px-2 z-10">
                            <button
                              onClick={() => {
                                setFormPosicao({ diasInadimplencia: 0, tipoAcao: "whatsapp", titulo: "", template: TEMPLATES_PADRAO.whatsapp, ativa: true });
                                setShowAddPosicao(regua.id);
                              }}
                              className="w-12 h-12 rounded-full border-2 border-dashed border-primary text-primary flex items-center justify-center hover:bg-primary/10 transition-colors"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                            <p className="text-[10px] text-muted-foreground mt-2 text-center">Nova Etapa</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {regua.ultimaExecucao && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Última execução: {new Date(regua.ultimaExecucao).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Modal Criar Régua ─── */}
      <Dialog open={showCreateRegua} onOpenChange={setShowCreateRegua}>
        <DialogContent className="!max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Régua de Cobrança</DialogTitle>
          </DialogHeader>
          <ReguaForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateRegua(false)}>Cancelar</Button>
            <Button onClick={handleSaveCreate} disabled={createRegua.isPending}>
              {createRegua.isPending ? "Criando..." : "Criar Régua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Editar Régua ─── */}
      <Dialog open={!!showEditRegua} onOpenChange={() => setShowEditRegua(null)}>
        <DialogContent className="!max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Régua: {showEditRegua?.nome}</DialogTitle>
          </DialogHeader>
          <ReguaForm />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRegua(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateRegua.isPending}>
              {updateRegua.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Adicionar Etapa ─── */}
      <Dialog open={!!showAddPosicao} onOpenChange={() => setShowAddPosicao(null)}>
        <DialogContent className="!max-w-xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Etapa de Comunicação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Etapa *</Label>
              <Input value={formPosicao.titulo} onChange={e => setFormPosicao(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Aviso de Vencimento" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Canal de Comunicação</Label>
                <Select value={formPosicao.tipoAcao} onValueChange={v => setFormPosicao(p => ({ ...p, tipoAcao: v, template: p.template || TEMPLATES_PADRAO[v] || "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_ACAO_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dias (negativo = antes, 0 = no dia, positivo = após vencimento)</Label>
                <Input type="number" value={formPosicao.diasInadimplencia} onChange={e => setFormPosicao(p => ({ ...p, diasInadimplencia: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <Label>Modelo de Mensagem</Label>
              <Textarea value={formPosicao.template} onChange={e => setFormPosicao(p => ({ ...p, template: e.target.value }))} rows={6} placeholder="Use {{nome}}, {{valor}}, {{vencimento}}, {{dias_atraso}}, {{unidade}}, {{bloco}}, {{condominio}}" />
              <p className="text-xs text-muted-foreground mt-1">Variáveis: {"{{nome}}"}, {"{{valor}}"}, {"{{vencimento}}"}, {"{{dias_atraso}}"}, {"{{unidade}}"}, {"{{bloco}}"}, {"{{condominio}}"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formPosicao.ativa} onCheckedChange={v => setFormPosicao(p => ({ ...p, ativa: v }))} />
              <Label>Etapa ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPosicao(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!formPosicao.titulo.trim()) { toast.error("Informe o título"); return; }
              createPosicao.mutate({ reguaId: showAddPosicao!, ...formPosicao, tipoAcao: formPosicao.tipoAcao as any, ativa: formPosicao.ativa ? 1 : 0 });
            }} disabled={createPosicao.isPending}>
              {createPosicao.isPending ? "Adicionando..." : "Adicionar Etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Editar Etapa ─── */}
      <Dialog open={!!showEditPosicao} onOpenChange={() => setShowEditPosicao(null)}>
        <DialogContent className="!max-w-xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Etapa</DialogTitle>
          </DialogHeader>
          {showEditPosicao && (
            <div className="space-y-4">
              <div>
                <Label>Título *</Label>
                <Input value={showEditPosicao.titulo} onChange={e => setShowEditPosicao(p => p ? { ...p, titulo: e.target.value } : null)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Canal</Label>
                  <Select value={showEditPosicao.tipoAcao} onValueChange={v => setShowEditPosicao(p => p ? { ...p, tipoAcao: v } : null)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIPO_ACAO_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dias</Label>
                  <Input type="number" value={showEditPosicao.diasInadimplencia} onChange={e => setShowEditPosicao(p => p ? { ...p, diasInadimplencia: Number(e.target.value) } : null)} />
                </div>
              </div>
              <div>
                <Label>Modelo de Mensagem</Label>
                <Textarea value={showEditPosicao.template ?? ""} onChange={e => setShowEditPosicao(p => p ? { ...p, template: e.target.value } : null)} rows={6} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={(showEditPosicao.ativa ?? 1) === 1} onCheckedChange={v => setShowEditPosicao(p => p ? { ...p, ativa: v ? 1 : 0 } : null)} />
                <Label>Etapa ativa</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPosicao(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (!showEditPosicao) return;
              updatePosicao.mutate({
                id: showEditPosicao.id,
                titulo: showEditPosicao.titulo,
                tipoAcao: showEditPosicao.tipoAcao as any,
                diasInadimplencia: showEditPosicao.diasInadimplencia,
                template: showEditPosicao.template ?? "",
                ativa: showEditPosicao.ativa ?? 1,
              });
            }} disabled={updatePosicao.isPending}>
              {updatePosicao.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Histórico ─── */}
      <Dialog open={!!showHistorico} onOpenChange={() => setShowHistorico(null)}>
        <DialogContent className="!max-w-4xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" /> Histórico de Execuções
            </DialogTitle>
          </DialogHeader>
          {showHistorico && <HistoricoRegua reguaId={showHistorico} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Componente de Histórico ────────────────────────────────────────────────────

function HistoricoRegua({ reguaId }: { reguaId: number }) {
  const { data: disparos, isLoading } = trpc.regua.getDisparos.useQuery({ reguaId });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Carregando histórico...</div>;
  if (!disparos || disparos.length === 0) return (
    <div className="text-center py-8 text-muted-foreground">
      <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p>Nenhum disparo registrado ainda.</p>
    </div>
  );

  const STATUS_COLORS: Record<string, string> = {
    enviado: "bg-green-100 text-green-800",
    pendente: "bg-yellow-100 text-yellow-800",
    erro: "bg-red-100 text-red-800",
    ignorado: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
      <p className="text-sm text-muted-foreground mb-3">{disparos.length} registro(s) encontrado(s)</p>
      {disparos.map((d: any) => (
        <div key={d.id} className="flex items-start gap-3 p-3 border rounded-lg text-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">Devedor #{d.devedorId}</span>
              <Badge className={`text-xs ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-700"}`}>{d.status}</Badge>
              <Badge variant="outline" className="text-xs">{d.tipoAcao}</Badge>
            </div>
            {d.mensagemGerada && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{d.mensagemGerada.slice(0, 120)}...</p>
            )}
          </div>
          <div className="text-xs text-muted-foreground shrink-0 text-right">
            <p>{d.diasInadimplencia} dias atraso</p>
            <p>{new Date(d.dataDisparo).toLocaleString("pt-BR")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
