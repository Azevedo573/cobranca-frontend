import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import {
  Plus, Trash2, Edit, Play, ChevronDown, ChevronUp,
  MessageCircle, Mail, Phone, FileText, Bell, Zap,
  Clock, AlertTriangle
} from "lucide-react";

const TIPO_ACAO_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  whatsapp: { label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" />, color: "bg-green-100 text-green-700" },
  email: { label: "E-mail", icon: <Mail className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  sms: { label: "SMS", icon: <Phone className="w-4 h-4" />, color: "bg-yellow-100 text-yellow-700" },
  carta: { label: "Carta", icon: <FileText className="w-4 h-4" />, color: "bg-gray-100 text-gray-700" },
  ligacao: { label: "Ligação", icon: <Phone className="w-4 h-4" />, color: "bg-purple-100 text-purple-700" },
  notificacao_interna: { label: "Notificação Interna", icon: <Bell className="w-4 h-4" />, color: "bg-orange-100 text-orange-700" },
};

const TIPO_COBRANCA_LABELS: Record<string, string> = {
  todos: "Todos os tipos",
  condominio: "Cota Condominial",
  salao_jogos: "Salão de Jogos",
  churrasqueira: "Churrasqueira",
  cota_extra: "Cota Extra",
  multa: "Multa",
  outros: "Outros",
};

const TEMPLATES_PADRAO: Record<string, string> = {
  whatsapp: `Olá {{nome}}, tudo bem?\n\nInformamos que existe uma pendência financeira referente ao imóvel {{bloco}} Unidade {{unidade}} no valor de *{{valor}}* com vencimento em {{vencimento}}.\n\nJá se passaram *{{dias_atraso}} dias* do vencimento.\n\nPara regularizar sua situação, entre em contato conosco.\n\n_{{condominio}}_`,
  email: `Prezado(a) {{nome}},\n\nVim informar que existe uma pendência financeira no valor de {{valor}} com vencimento em {{vencimento}}.\n\nDias em atraso: {{dias_atraso}}\n\nPor favor, entre em contato para regularizar.\n\nAtenciosamente,\n{{condominio}}`,
  sms: `{{condominio}}: Pendência de {{valor}} venc. {{vencimento}} ({{dias_atraso}} dias atraso). Contate-nos.`,
  carta: `Prezado(a) {{nome}},\n\nVimos por meio desta notificar V.Sa. sobre débito em aberto referente ao imóvel {{bloco}} Unidade {{unidade}}, no valor de {{valor}}, com vencimento em {{vencimento}}, totalizando {{dias_atraso}} dias de atraso.\n\nSolicitamos a regularização no prazo de 5 dias úteis.\n\n{{condominio}}`,
  ligacao: `Script: Boa tarde, posso falar com {{nome}}? Sou do escritório de cobrança do {{condominio}}. Estou ligando referente a uma pendência de {{valor}} com {{dias_atraso}} dias de atraso. Podemos regularizar?`,
  notificacao_interna: `Devedor {{nome}} ({{bloco}} Unidade {{unidade}}) com {{dias_atraso}} dias de atraso. Valor: {{valor}}.`,
};

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
  condominioId: number;
  nome: string;
  descricao: string | null;
  tipoCobranca: string | null;
  ativa: number | null;
  ultimaExecucao: Date | null;
  createdAt: Date | null;
  posicoes: Posicao[];
};

export default function ReguaCobranca() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const condominioId = (user as any)?.condominioId as number | undefined;

  const { data: reguas, isLoading } = trpc.regua.list.useQuery(
    { condominioId: condominioId! },
    { enabled: !!condominioId }
  );

  // Estados de modais
  const [showCreateRegua, setShowCreateRegua] = useState(false);
  const [showEditRegua, setShowEditRegua] = useState<Regua | null>(null);
  const [showAddPosicao, setShowAddPosicao] = useState<number | null>(null);
  const [showEditPosicao, setShowEditPosicao] = useState<Posicao | null>(null);
  const [expandedRegua, setExpandedRegua] = useState<number | null>(null);
  const [executandoRegua, setExecutandoRegua] = useState<number | null>(null);

  // Form states
  const [formRegua, setFormRegua] = useState({ nome: "", descricao: "", tipoCobranca: "todos", ativa: true });
  const [formPosicao, setFormPosicao] = useState({
    diasInadimplencia: 0,
    tipoAcao: "whatsapp",
    titulo: "",
    template: "",
    ativa: true,
  });

  // Mutations
  const createRegua = trpc.regua.create.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      setShowCreateRegua(false);
      setFormRegua({ nome: "", descricao: "", tipoCobranca: "todos", ativa: true });
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
    onSuccess: () => {
      utils.regua.list.invalidate();
      toast.success("Régua excluída!");
    },
    onError: (e) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  const createPosicao = trpc.regua.createPosicao.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      setShowAddPosicao(null);
      setFormPosicao({ diasInadimplencia: 0, tipoAcao: "whatsapp", titulo: "", template: "", ativa: true });
      toast.success("Posição adicionada!");
    },
    onError: (e) => toast.error(`Erro ao adicionar posição: ${e.message}`),
  });

  const updatePosicao = trpc.regua.updatePosicao.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      setShowEditPosicao(null);
      toast.success("Posição atualizada!");
    },
    onError: (e) => toast.error(`Erro ao atualizar posição: ${e.message}`),
  });

  const deletePosicao = trpc.regua.deletePosicao.useMutation({
    onSuccess: () => {
      utils.regua.list.invalidate();
      toast.success("Posição removida!");
    },
    onError: (e) => toast.error(`Erro ao remover posição: ${e.message}`),
  });

  const executarReguaMutation = trpc.regua.executar.useMutation({
    onSuccess: (data) => {
      setExecutandoRegua(null);
      utils.regua.list.invalidate();
      toast.success(`Régua executada! ${data.disparosRealizados} disparo(s) realizado(s). ${data.disparosIgnorados} ignorado(s).`);
      if (data.erros.length > 0) {
        toast.error(`Atenção: erros na execução: ${data.erros.slice(0, 2).join("; ")}`);
      }
    },
    onError: (e) => {
      setExecutandoRegua(null);
      toast.error(`Erro ao executar régua: ${e.message}`);
    },
  });

  const handleOpenAddPosicao = (reguaId: number, tipoAcao = "whatsapp") => {
    setFormPosicao({
      diasInadimplencia: 0,
      tipoAcao,
      titulo: "",
      template: TEMPLATES_PADRAO[tipoAcao] ?? "",
      ativa: true,
    });
    setShowAddPosicao(reguaId);
  };

  const handleTipoAcaoChange = (tipo: string) => {
    setFormPosicao(prev => ({
      ...prev,
      tipoAcao: tipo,
      template: prev.template || TEMPLATES_PADRAO[tipo] || "",
    }));
  };

  if (!condominioId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
        <p>Acesso restrito a administradores de condomínio.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-500" />
            Régua de Cobrança
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure fluxos automáticos de comunicação por dias de inadimplência
          </p>
        </div>
        <Button onClick={() => setShowCreateRegua(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Régua
        </Button>
      </div>

      {/* Explicação */}
      <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
        <CardContent className="pt-4 pb-3">
          <div className="flex gap-3">
            <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Como funciona:</strong> Cada régua define uma linha do tempo de ações automáticas.
              Por exemplo: enviar WhatsApp 3 dias antes do vencimento, e-mail no dia do vencimento, ligação após 5 dias de atraso.
              Use <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{nome}}"}</code>,{" "}
              <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{valor}}"}</code>,{" "}
              <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{dias_atraso}}"}</code>,{" "}
              <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{vencimento}}"}</code>,{" "}
              <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{unidade}}"}</code>,{" "}
              <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">{"{{bloco}}"}</code> nos templates.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Réguas */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !reguas?.length ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Zap className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground">Nenhuma régua configurada ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Crie sua primeira régua para automatizar as cobranças.</p>
            <Button className="mt-4" onClick={() => setShowCreateRegua(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeira Régua
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(reguas as Regua[]).map((regua) => (
            <Card key={regua.id} className={regua.ativa ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{regua.nome}</CardTitle>
                      <Badge variant={regua.ativa ? "default" : "secondary"}>
                        {regua.ativa ? "Ativa" : "Inativa"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {TIPO_COBRANCA_LABELS[regua.tipoCobranca ?? "todos"] ?? regua.tipoCobranca}
                      </Badge>
                    </div>
                    {regua.descricao && (
                      <CardDescription className="mt-1">{regua.descricao}</CardDescription>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>{regua.posicoes.length} posição(ões)</span>
                      {regua.ultimaExecucao && (
                        <span>Última execução: {new Date(regua.ultimaExecucao).toLocaleString("pt-BR")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedRegua(expandedRegua === regua.id ? null : regua.id)}
                    >
                      {expandedRegua === regua.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {expandedRegua === regua.id ? "Recolher" : "Ver Posições"}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={!regua.ativa || executandoRegua === regua.id}
                      onClick={() => {
                        setExecutandoRegua(regua.id);
                        executarReguaMutation.mutate({ reguaId: regua.id, condominioId: condominioId! });
                      }}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      {executandoRegua === regua.id ? "Executando..." : "Executar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setFormRegua({
                          nome: regua.nome,
                          descricao: regua.descricao ?? "",
                          tipoCobranca: regua.tipoCobranca ?? "todos",
                          ativa: !!regua.ativa,
                        });
                        setShowEditRegua(regua);
                      }}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Excluir a régua "${regua.nome}"? Todas as posições e histórico serão removidos.`)) {
                          deleteRegua.mutate({ id: regua.id });
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {/* Posições expandidas */}
              {expandedRegua === regua.id && (
                <CardContent className="pt-0">
                  <Separator className="mb-4" />
                  <div className="space-y-3">
                    {regua.posicoes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma posição configurada. Adicione ações para esta régua.
                      </p>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-6 top-4 bottom-4 w-0.5 bg-border" />
                        <div className="space-y-3">
                          {[...regua.posicoes]
                            .sort((a, b) => a.diasInadimplencia - b.diasInadimplencia)
                            .map((posicao) => {
                              const acao = TIPO_ACAO_LABELS[posicao.tipoAcao] ?? { label: posicao.tipoAcao, icon: <Bell className="w-4 h-4" />, color: "bg-gray-100 text-gray-700" };
                              const diasLabel = posicao.diasInadimplencia < 0
                                ? `${Math.abs(posicao.diasInadimplencia)} dias antes`
                                : posicao.diasInadimplencia === 0
                                ? "No vencimento"
                                : `${posicao.diasInadimplencia} dias após`;

                              return (
                                <div key={posicao.id} className="flex items-start gap-4 pl-2">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${posicao.ativa ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                    {acao.icon}
                                  </div>
                                  <div className="flex-1 bg-muted/40 rounded-lg p-3">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm">{posicao.titulo}</span>
                                        <Badge className={`text-xs ${acao.color}`} variant="outline">
                                          {acao.label}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                          {diasLabel}
                                        </Badge>
                                        {!posicao.ativa && <Badge variant="secondary" className="text-xs">Inativa</Badge>}
                                      </div>
                                      <div className="flex gap-1">
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0"
                                          onClick={() => {
                                            setFormPosicao({
                                              diasInadimplencia: posicao.diasInadimplencia,
                                              tipoAcao: posicao.tipoAcao,
                                              titulo: posicao.titulo,
                                              template: posicao.template ?? "",
                                              ativa: !!posicao.ativa,
                                            });
                                            setShowEditPosicao(posicao);
                                          }}
                                        >
                                          <Edit className="w-3 h-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                          onClick={() => {
                                            if (confirm(`Remover a posição "${posicao.titulo}"?`)) {
                                              deletePosicao.mutate({ id: posicao.id });
                                            }
                                          }}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                    {posicao.template && (
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                                        {posicao.template}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => handleOpenAddPosicao(regua.id)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Posição
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Criar Régua */}
      <Dialog open={showCreateRegua} onOpenChange={setShowCreateRegua}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Régua de Cobrança</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Régua *</Label>
              <Input
                placeholder="Ex: Régua Padrão Condominial"
                value={formRegua.nome}
                onChange={e => setFormRegua(prev => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva o objetivo desta régua..."
                value={formRegua.descricao}
                onChange={e => setFormRegua(prev => ({ ...prev, descricao: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <Label>Tipo de Cobrança</Label>
              <Select value={formRegua.tipoCobranca} onValueChange={v => setFormRegua(prev => ({ ...prev, tipoCobranca: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_COBRANCA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formRegua.ativa}
                onCheckedChange={v => setFormRegua(prev => ({ ...prev, ativa: v }))}
              />
              <Label>Régua ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateRegua(false)}>Cancelar</Button>
            <Button
              disabled={!formRegua.nome || createRegua.isPending}
              onClick={() => createRegua.mutate({
                condominioId: condominioId!,
                nome: formRegua.nome,
                descricao: formRegua.descricao || undefined,
                tipoCobranca: formRegua.tipoCobranca as any,
                ativa: formRegua.ativa ? 1 : 0,
              })}
            >
              {createRegua.isPending ? "Criando..." : "Criar Régua"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Régua */}
      <Dialog open={!!showEditRegua} onOpenChange={() => setShowEditRegua(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Régua</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Régua *</Label>
              <Input
                value={formRegua.nome}
                onChange={e => setFormRegua(prev => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formRegua.descricao}
                onChange={e => setFormRegua(prev => ({ ...prev, descricao: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <Label>Tipo de Cobrança</Label>
              <Select value={formRegua.tipoCobranca} onValueChange={v => setFormRegua(prev => ({ ...prev, tipoCobranca: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_COBRANCA_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formRegua.ativa}
                onCheckedChange={v => setFormRegua(prev => ({ ...prev, ativa: v }))}
              />
              <Label>Régua ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditRegua(null)}>Cancelar</Button>
            <Button
              disabled={!formRegua.nome || updateRegua.isPending}
              onClick={() => showEditRegua && updateRegua.mutate({
                id: showEditRegua.id,
                nome: formRegua.nome,
                descricao: formRegua.descricao || undefined,
                tipoCobranca: formRegua.tipoCobranca as any,
                ativa: formRegua.ativa ? 1 : 0,
              })}
            >
              {updateRegua.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Adicionar Posição */}
      <Dialog open={showAddPosicao !== null} onOpenChange={() => setShowAddPosicao(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Posição na Régua</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dias de Inadimplência *</Label>
                <Input
                  type="number"
                  placeholder="Ex: 5 (após) ou -3 (antes)"
                  value={formPosicao.diasInadimplencia}
                  onChange={e => setFormPosicao(prev => ({ ...prev, diasInadimplencia: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Negativo = antes do vencimento. Zero = no dia. Positivo = após vencimento.
                </p>
              </div>
              <div>
                <Label>Tipo de Ação *</Label>
                <Select value={formPosicao.tipoAcao} onValueChange={handleTipoAcaoChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_ACAO_LABELS).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título da Ação *</Label>
              <Input
                placeholder="Ex: Lembrete de vencimento via WhatsApp"
                value={formPosicao.titulo}
                onChange={e => setFormPosicao(prev => ({ ...prev, titulo: e.target.value }))}
              />
            </div>
            <div>
              <Label>Template da Mensagem</Label>
              <Textarea
                placeholder="Use {{nome}}, {{valor}}, {{vencimento}}, {{dias_atraso}}, {{unidade}}, {{bloco}}, {{condominio}}"
                value={formPosicao.template}
                onChange={e => setFormPosicao(prev => ({ ...prev, template: e.target.value }))}
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formPosicao.ativa}
                onCheckedChange={v => setFormPosicao(prev => ({ ...prev, ativa: v }))}
              />
              <Label>Posição ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPosicao(null)}>Cancelar</Button>
            <Button
              disabled={!formPosicao.titulo || createPosicao.isPending}
              onClick={() => showAddPosicao !== null && createPosicao.mutate({
                reguaId: showAddPosicao,
                diasInadimplencia: formPosicao.diasInadimplencia,
                tipoAcao: formPosicao.tipoAcao as any,
                titulo: formPosicao.titulo,
                template: formPosicao.template || undefined,
                ativa: formPosicao.ativa ? 1 : 0,
              })}
            >
              {createPosicao.isPending ? "Adicionando..." : "Adicionar Posição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar Posição */}
      <Dialog open={!!showEditPosicao} onOpenChange={() => setShowEditPosicao(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Posição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Dias de Inadimplência *</Label>
                <Input
                  type="number"
                  value={formPosicao.diasInadimplencia}
                  onChange={e => setFormPosicao(prev => ({ ...prev, diasInadimplencia: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label>Tipo de Ação *</Label>
                <Select value={formPosicao.tipoAcao} onValueChange={handleTipoAcaoChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_ACAO_LABELS).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título da Ação *</Label>
              <Input
                value={formPosicao.titulo}
                onChange={e => setFormPosicao(prev => ({ ...prev, titulo: e.target.value }))}
              />
            </div>
            <div>
              <Label>Template da Mensagem</Label>
              <Textarea
                value={formPosicao.template}
                onChange={e => setFormPosicao(prev => ({ ...prev, template: e.target.value }))}
                rows={6}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formPosicao.ativa}
                onCheckedChange={v => setFormPosicao(prev => ({ ...prev, ativa: v }))}
              />
              <Label>Posição ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPosicao(null)}>Cancelar</Button>
            <Button
              disabled={!formPosicao.titulo || updatePosicao.isPending}
              onClick={() => showEditPosicao && updatePosicao.mutate({
                id: showEditPosicao.id,
                diasInadimplencia: formPosicao.diasInadimplencia,
                tipoAcao: formPosicao.tipoAcao as any,
                titulo: formPosicao.titulo,
                template: formPosicao.template || undefined,
                ativa: formPosicao.ativa ? 1 : 0,
              })}
            >
              {updatePosicao.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
