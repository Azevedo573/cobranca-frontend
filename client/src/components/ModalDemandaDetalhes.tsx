import { useState } from "react";
import { PrioridadeBadge, PRIORIDADE_CONFIG } from "@/components/PrioridadeBadge";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Clock, AlertTriangle, User, Building2, MessageSquare, Mail, Phone,
  Globe, Users, FileText, Calendar, Check, X, Send, Tag, Kanban, Trash2,
  Scale, ExternalLink, Loader2,
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
  criacao:       { label: "Criação",       color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: <FileText className="h-3.5 w-3.5" /> },
  atribuicao:    { label: "Atribuição",    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",       icon: <User className="h-3.5 w-3.5" /> },
  movimentacao:  { label: "Movimentação",  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", icon: <Kanban className="h-3.5 w-3.5" /> },
  comentario:    { label: "Comentário",    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",      icon: <MessageSquare className="h-3.5 w-3.5" /> },
  email:         { label: "E-mail",        color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: <Mail className="h-3.5 w-3.5" /> },
  whatsapp:      { label: "WhatsApp",      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  conclusao:     { label: "Conclusão",     color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",   icon: <Check className="h-3.5 w-3.5" /> },
  cancelamento:  { label: "Cancelamento",  color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",           icon: <X className="h-3.5 w-3.5" /> },
  outro:         { label: "Outro",         color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",      icon: <Tag className="h-3.5 w-3.5" /> },
};

function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Campo Editável ───────────────────────────────────────────────────────────

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
        {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
        {type === "textarea" ? (
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={4}
            autoFocus
          />
        ) : (
          <Input
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            autoFocus
          />
        )}
        <div className="flex gap-1">
          <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSave}>
            <Check className="h-3 w-3 mr-1" />Salvar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setDraft(value); setEditing(false); }}>
            <X className="h-3 w-3 mr-1" />Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group cursor-pointer rounded-md px-2 py-1 -mx-2 hover:bg-muted/50 transition-colors"
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {label && <Label className="text-xs text-muted-foreground cursor-pointer">{label}</Label>}
      <p className={`text-sm mt-0.5 ${!value ? "text-muted-foreground italic" : ""}`}>
        {value || `Clique para editar ${label.toLowerCase()}`}
      </p>
    </div>
  );
}

// ─── Modal Principal ──────────────────────────────────────────────────────────

interface ModalDemandaDetalhesProps {
  demandaId: number | null;
  onClose: () => void;
  onDeleted?: () => void;
}

export function ModalDemandaDetalhes({ demandaId, onClose, onDeleted }: ModalDemandaDetalhesProps) {
  const utils = trpc.useUtils();
  const [comentario, setComentario] = useState("");
  const [tipoComentario, setTipoComentario] = useState<"comentario" | "email" | "whatsapp" | "outro">("comentario");
  const [aba, setAba] = useState<"detalhes" | "historico">("detalhes");

  const { data: demanda, isLoading } = trpc.juridicoDemandas.getById.useQuery(
    { id: demandaId! },
    { enabled: demandaId != null }
  );
  const { data: timeline = [] } = trpc.juridicoDemandas.getTimeline.useQuery(
    { demandaId: demandaId! },
    { enabled: demandaId != null }
  );
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();

  const updateMutation = trpc.juridicoDemandas.update.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getById.invalidate({ id: demandaId! });
      utils.juridicoDemandas.listar.invalidate();
      toast.success("Demanda atualizada");
    },
    onError: (e) => toast.error(e.message),
  });

  const moverMutation = trpc.juridicoDemandas.mover.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getById.invalidate({ id: demandaId! });
      utils.juridicoDemandas.listar.invalidate();
      toast.success("Demanda movida");
    },
    onError: (e) => toast.error(e.message),
  });

  const comentarioMutation = trpc.juridicoDemandas.addComentario.useMutation({
    onSuccess: () => {
      utils.juridicoDemandas.getTimeline.invalidate({ demandaId: demandaId! });
      setComentario("");
      toast.success("Comentário adicionado");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.juridicoDemandas.delete.useMutation({
    onSuccess: () => {
      toast.success("Demanda excluída");
      onClose();
      onDeleted?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleUpdate = (field: string, value: any) => {
    if (!demandaId) return;
    updateMutation.mutate({ id: demandaId, [field]: value });
  };

  const handleEnviarComentario = () => {
    if (!comentario.trim() || !demandaId) return;
    comentarioMutation.mutate({ demandaId, descricao: comentario, tipo: tipoComentario });
  };

  const d = demanda as any;
  const canal = d ? CANAL_CONFIG[d.canal] : null;
  const atrasada = d?.prazo && new Date(d.prazo) < new Date();

  return (
    <Dialog open={demandaId != null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="!w-[70vw] !max-w-[70vw] h-[90vh] flex flex-col p-0 gap-0">
        {/* Header fixo */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          {isLoading ? (
            <>
              <DialogTitle className="sr-only">Carregando demanda...</DialogTitle>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Carregando...</span>
              </div>
            </>
          ) : !d ? (
            <DialogTitle className="text-muted-foreground">Demanda não encontrada</DialogTitle>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-mono text-muted-foreground">{d.numero}</span>
                  <PrioridadeBadge prioridade={d.prioridade} variant="pill" />
                  {atrasada && (
                    <Badge variant="outline" className="text-xs text-red-500 border-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />Em atraso
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-lg font-bold leading-tight">{d.assunto}</DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Criada em {formatDateTime(d.criadoEm)}
                  {d.condominioNome && <> · <Building2 className="h-3 w-3 inline mx-0.5" />{d.condominioNome}</>}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 hover:text-red-600 hover:border-red-300"
                  onClick={() => {
                    if (confirm("Excluir esta demanda? Esta ação não pode ser desfeita.")) {
                      deleteMutation.mutate({ id: demandaId! });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* Abas */}
        {d && (
          <div className="flex border-b px-6 shrink-0">
            <button
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${aba === "detalhes" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAba("detalhes")}
            >
              Detalhes
            </button>
            <button
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${aba === "historico" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setAba("historico")}
            >
              Histórico
              {(timeline as any[]).length > 0 && (
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
                  {(timeline as any[]).length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Corpo scrollável */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !d ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <p className="text-muted-foreground">Demanda não encontrada</p>
              <Button onClick={onClose}>Fechar</Button>
            </div>
          ) : aba === "detalhes" ? (
            /* ── ABA DETALHES ── */
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                  <Card className="border-red-200 dark:border-red-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                        <Scale className="h-4 w-4" />
                        Cobrança Vinculada
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-3 space-y-2">
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
                            {d.valorDivida != null && (
                              <>
                                <span className="text-muted-foreground text-xs">Valor</span>
                                <span className="font-semibold text-xs text-red-700 dark:text-red-400">
                                  R$ {(d.valorDivida / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <Link href={`/devedores/${d.devedorId}/detalhes`}>
                          <button
                            className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-md px-3 py-2 hover:bg-primary/5 transition-colors"
                            onClick={onClose}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver dashboard do devedor
                          </button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Adicionar comentário rápido */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Registrar Atividade</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
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
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Status / Coluna */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Etapa no Kanban</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select
                      value={String(d.colunaId)}
                      onValueChange={v => moverMutation.mutate({ id: demandaId!, novaColunaId: Number(v) })}
                      disabled={moverMutation.isPending}
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
                  <CardContent className="space-y-3">
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
                    <div>
                      <Label className="text-xs text-muted-foreground">Responsável</Label>
                      <Select
                        value={d.responsavelNome || "__none__"}
                        onValueChange={v => handleUpdate("responsavelNome", v === "__none__" ? null : v)}
                      >
                        <SelectTrigger className="mt-0.5 h-8 text-sm">
                          <SelectValue placeholder="Selecione um advogado..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {advogados.map((adv: any) => (
                            <SelectItem key={adv.id} value={adv.name ?? "__none__"}>
                              {adv.name ?? "(sem nome)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    {/* Solicitante */}
                    <CampoEditavel
                      label="Solicitante"
                      value={d.solicitante || ""}
                      onSave={v => handleUpdate("solicitante", v)}
                    />

                    <Separator />

                    {/* Canal */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Canal de Origem</Label>
                      <div className="flex items-center gap-2 mt-0.5">
                        {canal?.icon}
                        <span className="text-sm">{canal?.label ?? d.canal}</span>
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
          ) : (
            /* ── ABA HISTÓRICO ── */
            <div className="p-6 space-y-4">
              {/* Adicionar comentário */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Registrar Atividade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
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
                </CardContent>
              </Card>

              {/* Timeline */}
              <div className="space-y-3">
                {(timeline as any[]).length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nenhum evento registrado ainda</p>
                  </div>
                ) : (
                  (timeline as any[]).map((evento: any) => {
                    const tc = TIMELINE_TIPO_CONFIG[evento.tipo] ?? TIMELINE_TIPO_CONFIG.outro;
                    return (
                      <div key={evento.id} className="flex gap-3">
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${tc.color}`}>
                          {tc.icon}
                        </div>
                        <div className="flex-1 min-w-0 pb-3 border-b last:border-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
