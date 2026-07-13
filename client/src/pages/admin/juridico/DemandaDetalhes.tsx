import { useState } from "react";
import { PrioridadeBadge, PRIORIDADE_CONFIG } from "@/components/PrioridadeBadge";
import { useLocation, useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft, Clock, AlertTriangle, User, Building2, MessageSquare, Mail, Phone,
  Globe, Users, FileText, Calendar, Edit2, Check, X, Send, Tag, Kanban, Trash2,
  Scale, ExternalLink, Banknote, HandCoins
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────


const TIPO_LABEL: Record<string, string> = {
  parecer: "Parecer Jurídico", convencao: "Convenção/Regimento", assembleia: "Assembleia",
  multa: "Aplicação de Multa", notificacao: "Notificação Extrajudicial", contratos: "Contratos",
  cobranca_judicial: "Cobrança Judicial", processo: "Processo Judicial", audiencia: "Audiência",
  execucao: "Execução", acompanhamento: "Acompanhamento Processual", documentacao: "Documentação",
  relatorio: "Relatório", cadastro: "Cadastro", outro: "Outro",
};

const CANAL_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  whatsapp:         { label: "WhatsApp",      icon: <MessageSquare className="h-4 w-4" /> },
  email:            { label: "E-mail",        icon: <Mail className="h-4 w-4" /> },
  portal:           { label: "Portal",        icon: <Globe className="h-4 w-4" /> },
  telefone:         { label: "Telefone",      icon: <Phone className="h-4 w-4" /> },
  presencial:       { label: "Presencial",    icon: <Users className="h-4 w-4" /> },
  assembleia:       { label: "Assembleia",    icon: <Building2 className="h-4 w-4" /> },
  processo_interno: { label: "Proc. Interno", icon: <FileText className="h-4 w-4" /> },
  manual:           { label: "Manual",        icon: <FileText className="h-4 w-4" /> },
};

const TIMELINE_TIPO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  criacao:       { label: "Criação",       color: "bg-green-100 text-green-700",  icon: <FileText className="h-3.5 w-3.5" /> },
  atribuicao:    { label: "Atribuição",    color: "bg-blue-100 text-blue-700",    icon: <User className="h-3.5 w-3.5" /> },
  movimentacao:  { label: "Movimentação",  color: "bg-purple-100 text-purple-700",icon: <Kanban className="h-3.5 w-3.5" /> },
  comentario:    { label: "Comentário",    color: "bg-slate-100 text-slate-700",  icon: <MessageSquare className="h-3.5 w-3.5" /> },
  email:         { label: "E-mail",        color: "bg-yellow-100 text-yellow-700",icon: <Mail className="h-3.5 w-3.5" /> },
  whatsapp:      { label: "WhatsApp",      color: "bg-emerald-100 text-emerald-700",icon: <MessageSquare className="h-3.5 w-3.5" /> },
  conclusao:     { label: "Conclusão",     color: "bg-green-100 text-green-700",  icon: <Check className="h-3.5 w-3.5" /> },
  cancelamento:  { label: "Cancelamento",  color: "bg-red-100 text-red-700",      icon: <X className="h-3.5 w-3.5" /> },
  outro:         { label: "Outro",         color: "bg-slate-100 text-slate-700",  icon: <Tag className="h-3.5 w-3.5" /> },
};

function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Componente de Campo Editável ─────────────────────────────────────────────

function CampoEditavel({ label, value, onSave, type = "text" }: {
  label: string;
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "date" | "textarea";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {type === "textarea" ? (
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} autoFocus />
        ) : (
          <Input type={type} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
        )}
        <div className="flex gap-1">
          <Button size="sm" className="h-7 px-2" onClick={handleSave}><Check className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setDraft(value); setEditing(false); }}><X className="h-3 w-3" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-sm">{value || <span className="text-muted-foreground italic">Não informado</span>}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function DemandaDetalhes() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const demandaId = Number(params.id);
  const utils = trpc.useUtils();

  const [comentario, setComentario] = useState("");
  const [tipoComentario, setTipoComentario] = useState<"comentario" | "email" | "whatsapp" | "outro">("comentario");

  const { data: demanda, isLoading } = trpc.juridicoDemandas.getById.useQuery({ id: demandaId });
  const { data: timeline = [] } = trpc.juridicoDemandas.getTimeline.useQuery({ demandaId });
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();

  const updateMutation = trpc.juridicoDemandas.update.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getById.invalidate({ id: demandaId });
      utils.juridicoDemandas.listar.invalidate();
      toast.success("Demanda atualizada");
    },
    onError: (e) => toast.error(e.message),
  });

  const moverMutation = trpc.juridicoDemandas.mover.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getById.invalidate({ id: demandaId });
      utils.juridicoDemandas.listar.invalidate();
      toast.success("Demanda movida");
    },
    onError: (e) => toast.error(e.message),
  });

  const comentarioMutation = trpc.juridicoDemandas.addComentario.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getTimeline.invalidate({ demandaId });
      setComentario("");
      toast.success("Comentário adicionado");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.juridicoDemandas.delete.useMutation({
    onSuccess: () => {
      toast.success("Demanda excluída");
      navigate("/admin/juridico");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Carregando demanda...</div>;
  }

  if (!demanda) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Demanda não encontrada</p>
        <Button className="mt-4" onClick={() => navigate("/admin/juridico")}>Voltar</Button>
      </div>
    );
  }

  const d = demanda as any;
  const canal = CANAL_CONFIG[d.canal];
  const atrasada = d.prazo && new Date(d.prazo) < new Date();

  const handleUpdate = (field: string, value: any) => {
    updateMutation.mutate({ id: demandaId, [field]: value });
  };

  const handleEnviarComentario = () => {
    if (!comentario.trim()) return;
    comentarioMutation.mutate({
      demandaId,
      descricao: comentario,
      tipo: tipoComentario,
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/juridico")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-mono text-muted-foreground">{d.numero}</span>
            <PrioridadeBadge prioridade={d.prioridade} variant="pill" />
            {atrasada && (
              <Badge variant="outline" className="text-xs text-red-500 border-red-200">
                <AlertTriangle className="h-3 w-3 mr-1" />Em atraso
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-bold">{d.assunto}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Criada em {formatDateTime(d.criadoEm)}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Botão Escalar para Processo Judicial — visível para tipos judiciais */}
          {(d.tipo === "cobranca_judicial" || d.tipo === "processo" || d.tipo === "execucao" || d.tipo === "acompanhamento") && (
            <Button
              variant="outline"
              size="sm"
              className="text-blue-600 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={() => {
                // Monta query params com dados da demanda para pré-preencher o formulário de processo
                const params = new URLSearchParams();
                params.set("demandaId", String(demandaId));
                if (d.nomeDevedor) params.set("condominioNome", d.nomeDevedor);
                if (d.assunto) params.set("assunto", d.assunto);
                navigate(`/admin/juridico/processos?nova=1&${params.toString()}`);
              }}
            >
              <Scale className="h-4 w-4 mr-1" />
              Escalar para Processo
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-red-500 hover:text-red-600"
            onClick={() => {
              if (confirm("Excluir esta demanda?")) deleteMutation.mutate({ id: demandaId });
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-4">
          {/* Descrição */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              <CampoEditavel
                label=""
                value={d.descricao || ""}
                type="textarea"
                onSave={v => handleUpdate("descricao", v)}
              />
            </CardContent>
          </Card>

          {/* Cobrança Vinculada */}
          {d.devedorId && (
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
                  <Scale className="h-4 w-4" />
                  Cobrança Vinculada
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Snapshot da dívida */}
                  <div className="rounded-lg bg-red-50 border border-red-100 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {d.nomeDevedor && (
                        <>
                          <span className="text-muted-foreground text-xs">Devedor</span>
                          <span className="font-medium text-xs">{d.nomeDevedor}</span>
                        </>
                      )}
                      {d.unidadeDevedor && (
                        <>
                          <span className="text-muted-foreground text-xs">Unidade</span>
                          <span className="font-medium text-xs">{d.unidadeDevedor}</span>
                        </>
                      )}
                      {d.cpfDevedor && (
                        <>
                          <span className="text-muted-foreground text-xs">CPF/CNPJ</span>
                          <span className="font-medium text-xs">{d.cpfDevedor}</span>
                        </>
                      )}
                      {d.valorDivida != null && (
                        <>
                          <span className="text-muted-foreground text-xs">Valor (na escalada)</span>
                          <span className="font-semibold text-xs text-red-700">
                            R$ {(d.valorDivida / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </>
                      )}
                      {d.qtdCobrancas != null && (
                        <>
                          <span className="text-muted-foreground text-xs">Cobranças em aberto</span>
                          <span className="font-medium text-xs">{d.qtdCobrancas}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Link href={`/devedores/${d.devedorId}/detalhes`}>
                    <button className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-md px-3 py-2 hover:bg-primary/5 transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ver dashboard completo do devedor
                    </button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Histórico & Comentários ({(timeline as any[]).length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Adicionar comentário */}
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg border">
                <div className="flex gap-2">
                  <Select value={tipoComentario} onValueChange={v => setTipoComentario(v as any)}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comentario">Comentário</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Adicionar comentário ou registro de atividade..."
                  rows={3}
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleEnviarComentario}
                    disabled={!comentario.trim() || comentarioMutation.isPending}
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {comentarioMutation.isPending ? "Enviando..." : "Registrar"}
                  </Button>
                </div>
              </div>

              {/* Eventos */}
              <div className="space-y-3">
                {(timeline as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado</p>
                ) : (
                  (timeline as any[]).map((evento: any) => {
                    const tc = TIMELINE_TIPO_CONFIG[evento.tipo] ?? TIMELINE_TIPO_CONFIG.outro;
                    return (
                      <div key={evento.id} className="flex gap-3">
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${tc.color}`}>
                          {tc.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium">{tc.label}</span>
                            {evento.usuarioNome && (
                              <span className="text-xs text-muted-foreground">por {evento.usuarioNome}</span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(evento.criadoEm)}</span>
                          </div>
                          <p className="text-sm text-foreground/80 whitespace-pre-wrap">{evento.descricao}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar de detalhes */}
        <div className="space-y-4">
          {/* Status / Coluna */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={String(d.colunaId)}
                onValueChange={v => moverMutation.mutate({ id: demandaId, novaColunaId: Number(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(colunas as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.icone} {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Detalhes */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Detalhes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Prioridade */}
              <div>
                <Label className="text-xs text-muted-foreground">Prioridade</Label>
                <Select
                  value={d.prioridade}
                  onValueChange={v => handleUpdate("prioridade", v)}
                >
                  <SelectTrigger className="mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORIDADE_CONFIG).map(([k]) => (
                      <SelectItem key={k} value={k}>
                        <PrioridadeBadge prioridade={k} variant="dot" />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Prazo */}
              <CampoEditavel
                label="Prazo (SLA)"
                value={d.prazo ? new Date(d.prazo).toISOString().substring(0, 10) : ""}
                type="date"
                onSave={v => handleUpdate("prazo", v || null)}
              />

              <Separator />

              {/* Responsável */}
              <div className="group">
                <Label className="text-xs text-muted-foreground">Responsável</Label>
                <Select
                  value={d.responsavelNome || ""}
                  onValueChange={v => handleUpdate("responsavelNome", v)}
                >
                  <SelectTrigger className="mt-0.5 h-8 text-sm">
                    <SelectValue placeholder="Selecione um advogado..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {advogados.map(adv => (
                      <SelectItem key={adv.id} value={adv.name ?? "__none__"}>{adv.name ?? "(sem nome)"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {advogados.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Nenhum advogado cadastrado.</p>
                )}
              </div>

              <Separator />

              {/* Solicitante */}
              <CampoEditavel
                label="Solicitante"
                value={d.solicitante || ""}
                onSave={v => handleUpdate("solicitante", v)}
              />

              {d.solicitanteTipo && (
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo do Solicitante</Label>
                  <p className="text-sm mt-0.5">{d.solicitanteTipo}</p>
                </div>
              )}

              <Separator />

              {/* Canal */}
              <div>
                <Label className="text-xs text-muted-foreground">Canal de Origem</Label>
                <div className="flex items-center gap-2 mt-0.5">
                  {canal?.icon}
                  <span className="text-sm">{canal?.label}</span>
                </div>
              </div>

              {/* Tipo */}
              <div>
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <p className="text-sm mt-0.5">{TIPO_LABEL[d.tipo] ?? d.tipo}</p>
              </div>

              {/* Condomínio */}
              {d.condominioNome && (
                <div>
                  <Label className="text-xs text-muted-foreground">Condomínio</Label>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{d.condominioNome}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
