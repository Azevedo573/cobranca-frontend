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
  Calendar,
  User,
  DollarSign,
  FileText,
  Loader2,
  Download,
  Users,
  Activity,
  Timer,
  Gavel,
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
  ativo: { label: "Ativo", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  suspenso: { label: "Suspenso", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  arquivado: { label: "Arquivado", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30" },
  encerrado: { label: "Encerrado", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
};

const URGENCIA_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  atrasado: { label: "Atrasado", color: "text-red-600 dark:text-red-400", bg: "bg-red-500/15 border-red-500/30" },
  hoje: { label: "Vence hoje", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  "7dias": { label: "7 dias", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" },
  "15dias": { label: "15 dias", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" },
  "30dias": { label: "30 dias", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  futuro: { label: "No prazo", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" },
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

// ─── Componente: Timeline estilo Astrea (com suporte a origem TJRJ) ─────────

type MovimentacaoRich = {
  id: number;
  data: Date | string;
  descricao: string;
  tipo: string;
  origem: string;
  codigoDatajud?: number | null;
  complementosJson?: string | null;
  nomeOrgao?: string | null;
  tipoComunicacao?: string | null;
  meioPublicacao?: string | null;
  usuarioNome?: string | null;
};

type ParteRich = {
  id: number;
  tipo: string;
  nome: string;
  cpfCnpj?: string | null;
  representante?: string | null;
  advogadosJson?: string | null;
};

function parseComplementos(json?: string | null): Array<{ nome: string; valor: string }> {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function parseAdvogados(json?: string | null): Array<{ nome: string; oab?: string | null }> {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

const TIPO_MOV_ICON: Record<string, string> = {
  distribuicao: "📌", citacao: "📨", contestacao: "📝", audiencia: "🏛️",
  sentenca: "⚖️", recurso: "🔄", despacho: "💬", decisao: "🔨",
  peticao: "📄", transito_julgado: "✅", execucao: "💰", outro: "🟡",
};

function TimelineAstrea({
  movimentacoes,
  partes,
  onAddMov,
  onDeleteMov,
}: {
  movimentacoes: MovimentacaoRich[];
  partes: ParteRich[];
  onAddMov: () => void;
  onDeleteMov: (id: number) => void;
}) {
  const [selecionada, setSelecionada] = useState<MovimentacaoRich | null>(
    movimentacoes.length > 0 ? movimentacoes[0] : null
  );

  const complementos = parseComplementos(selecionada?.complementosJson);

  return (
    <div className="flex gap-4">
      {/* Coluna esquerda: detalhe da movimentação selecionada */}
      <div className="flex-1 min-w-0">
        {selecionada ? (
          <Card>
            <CardContent className="p-5 space-y-4">
              {/* Cabeçalho */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-lg">{TIPO_MOV_ICON[selecionada.tipo] ?? "🟡"}</span>
                    <h3 className="text-base font-semibold text-foreground">{selecionada.descricao}</h3>
                    {selecionada.origem === "datajud" && (
                      <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">DataJud</Badge>
                    )}
                    {selecionada.origem === "tjrj" && (
                      <Badge className="text-xs bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20">TJRJ</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selecionada.data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
                {selecionada.origem === "manual" && (
                  <Button variant="ghost" size="sm"
                    onClick={() => onDeleteMov(selecionada.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0 shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              {/* Metadados da publicação */}
              {(selecionada.nomeOrgao || selecionada.tipoComunicacao || selecionada.meioPublicacao) && (
                <div className="bg-muted rounded-lg p-3 space-y-1.5 border">
                  {selecionada.nomeOrgao && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-28 shrink-0">Diário / Órgão:</span>
                      <span className="text-xs text-foreground font-medium">{selecionada.nomeOrgao}</span>
                    </div>
                  )}
                  {selecionada.tipoComunicacao && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-28 shrink-0">Tipo:</span>
                      <span className="text-xs text-foreground">{selecionada.tipoComunicacao}</span>
                    </div>
                  )}
                  {selecionada.meioPublicacao && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-28 shrink-0">Meio:</span>
                      <span className="text-xs text-foreground">{selecionada.meioPublicacao}</span>
                    </div>
                  )}
                  {selecionada.codigoDatajud && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-28 shrink-0">Cód. CNJ:</span>
                      <span className="text-xs text-foreground font-mono">{selecionada.codigoDatajud}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Partes com advogados e OAB */}
              {partes.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Partes</p>
                  <div className="space-y-2">
                    {partes.map((parte) => {
                      const advs = parseAdvogados(parte.advogadosJson);
                      return (
                        <div key={parte.id} className="bg-muted/50 rounded-lg p-2.5 border">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`text-xs py-0 ${
                              parte.tipo === "autor" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                              parte.tipo === "reu" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {parte.tipo === "autor" ? "Autor" : parte.tipo === "reu" ? "Réu" : parte.tipo === "terceiro" ? "Terceiro" : "Outro"}
                            </Badge>
                            <span className="text-sm text-foreground font-medium">{parte.nome}</span>
                          </div>
                          {advs.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {advs.map((adv, i) => (
                                <p key={i} className="text-xs text-muted-foreground">
                                  Advogado: <span className="text-foreground">{adv.nome}</span>
                                  {adv.oab && (
                                    <span className="ml-1.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                      OAB {adv.oab}
                                    </span>
                                  )}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Complementos / Detalhes */}
              {complementos.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Detalhes da Movimentação</p>
                  <div className="space-y-2">
                    {complementos.map((c, i) => (
                      <div key={i} className="bg-muted/50 rounded-lg p-3 border">
                        <p className="text-xs text-muted-foreground mb-1 font-medium">{c.nome}</p>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{c.valor}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Estado vazio */}
              {complementos.length === 0 && !selecionada.nomeOrgao && selecionada.origem === "datajud" && (
                <div className="text-center py-4 text-muted-foreground">
                  <p className="text-xs">DataJud não retornou complementos para este andamento</p>
                </div>
              )}
              {complementos.length === 0 && selecionada.origem === "tjrj" && (
                <div className="text-center py-4 text-muted-foreground">
                  <Gavel className="w-5 h-5 mx-auto mb-1" />
                  <p className="text-xs">Movimentação importada do TJRJ</p>
                </div>
              )}
              {complementos.length === 0 && selecionada.origem === "manual" && (
                <div className="text-center py-4 text-muted-foreground">
                  <FileText className="w-5 h-5 mx-auto mb-1" />
                  <p className="text-xs">Movimentação manual — sem detalhes adicionais</p>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Activity className="w-8 h-8 mb-2" />
            <p className="text-sm">Selecione uma movimentação para ver os detalhes</p>
          </div>
        )}
      </div>

      {/* Coluna direita: lista de histórico */}
      <div className="w-72 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Histórico ({movimentacoes.length})</p>
          <Button size="sm" onClick={onAddMov} className="h-7 px-2 text-xs">
            <Plus className="w-3.5 h-3.5 mr-1" />
            Adicionar
          </Button>
        </div>
        <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
          {movimentacoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="w-6 h-6 mx-auto mb-1" />
              <p className="text-xs">Nenhuma movimentação</p>
            </div>
          ) : (
            movimentacoes.map((mov) => {
              const isSelected = selecionada?.id === mov.id;
              return (
                <button
                  key={mov.id}
                  onClick={() => setSelecionada(mov)}
                  className={`w-full text-left rounded-lg p-2.5 transition-colors border ${
                    isSelected
                      ? "bg-primary/10 border-primary/40"
                      : "bg-muted/30 border-border hover:bg-muted hover:border-border"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm">{TIPO_MOV_ICON[mov.tipo] ?? "🟡"}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(mov.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    {mov.origem === "datajud" && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="DataJud" />
                    )}
                    {mov.origem === "tjrj" && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" title="TJRJ" />
                    )}
                  </div>
                  <p className="text-xs text-foreground line-clamp-2 leading-relaxed">{mov.descricao}</p>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}



// ─── Modal: Editar Processo ───────────────────────────────────────────────────

type ProcessoEditForm = {
  numeroCNJ: string; tribunal: string; tribunalAlias: string; comarca: string;
  vara: string; classe: string; assunto: string; tipo: string; faseProcessual: string;
  status: string; dataAjuizamento: string; condominioNome: string; advogadoNome: string;
  valorCausa: string; valorCondenacao: string; observacoes: string;
};

function ModalEditarProcesso({ processoId, processo, open, onClose, onSuccess }: {
  processoId: number;
  processo: any;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formEdit, setFormEdit] = useState<ProcessoEditForm>({
    numeroCNJ: "", tribunal: "", tribunalAlias: "", comarca: "",
    vara: "", classe: "", assunto: "", tipo: "civel", faseProcessual: "distribuicao",
    status: "ativo", dataAjuizamento: "", condominioNome: "", advogadoNome: "",
    valorCausa: "", valorCondenacao: "", observacoes: "",
  });
  const [editInitialized, setEditInitialized] = useState(false);

  // Preencher o form quando o modal abrir
  if (open && processo && !editInitialized) {
    setEditInitialized(true);
    setFormEdit({
      numeroCNJ: processo.numeroCNJ ?? "",
      tribunal: processo.tribunal ?? "",
      tribunalAlias: processo.tribunalAlias ?? "",
      comarca: processo.comarca ?? "",
      vara: processo.vara ?? "",
      classe: processo.classe ?? "",
      assunto: processo.assunto ?? "",
      tipo: processo.tipo ?? "civel",
      faseProcessual: processo.faseProcessual ?? "distribuicao",
      status: processo.status ?? "ativo",
      dataAjuizamento: processo.dataAjuizamento ? new Date(processo.dataAjuizamento).toISOString().split("T")[0] : "",
      condominioNome: processo.condominioNome ?? "",
      advogadoNome: processo.advogadoNome ?? "",
      valorCausa: processo.valorCausa ? String(processo.valorCausa / 100) : "",
      valorCondenacao: processo.valorCondenacao ? String(processo.valorCondenacao / 100) : "",
      observacoes: processo.observacoes ?? "",
    });
  }

  const updateProcesso = trpc.processos.update.useMutation();

  const handleSalvarEdit = async () => {
    if (!formEdit.numeroCNJ.trim() || !formEdit.tribunal.trim()) {
      toast.error("Número CNJ e Tribunal são obrigatórios");
      return;
    }
    try {
      await updateProcesso.mutateAsync({
        id: processoId,
        numeroCNJ: formEdit.numeroCNJ.trim(),
        tribunal: formEdit.tribunal.trim(),
        tribunalAlias: formEdit.tribunalAlias.trim() || undefined,
        comarca: formEdit.comarca.trim() || undefined,
        vara: formEdit.vara.trim() || undefined,
        classe: formEdit.classe.trim() || undefined,
        assunto: formEdit.assunto.trim() || undefined,
        tipo: formEdit.tipo as any,
        faseProcessual: formEdit.faseProcessual as any,
        status: formEdit.status as any,
        dataAjuizamento: formEdit.dataAjuizamento ? new Date(formEdit.dataAjuizamento) : undefined,
        condominioNome: formEdit.condominioNome.trim() || undefined,
        advogadoNome: formEdit.advogadoNome.trim() || undefined,
        valorCausa: formEdit.valorCausa ? Math.round(parseFloat(formEdit.valorCausa) * 100) : undefined,
        valorCondenacao: formEdit.valorCondenacao ? Math.round(parseFloat(formEdit.valorCondenacao) * 100) : undefined,
        observacoes: formEdit.observacoes.trim() || undefined,
      });
      toast.success("Processo atualizado!");
      onSuccess();
      onClose();
      setEditInitialized(false);
    } catch (err: any) {
      toast.error("Erro ao atualizar", { description: err.message });
    }
  };

  const fe = (field: keyof ProcessoEditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormEdit(p => ({ ...p, [field]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setEditInitialized(false); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Processo</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Número CNJ *</Label>
              <Input value={formEdit.numeroCNJ} onChange={fe("numeroCNJ")} placeholder="0000000-00.0000.0.00.0000" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Tribunal *</Label>
              <Input value={formEdit.tribunal} onChange={fe("tribunal")} placeholder="TJRJ, TJSP..." />
            </div>
            <div className="space-y-1.5">
              <Label>Alias do Tribunal</Label>
              <Input value={formEdit.tribunalAlias} onChange={fe("tribunalAlias")} placeholder="Ex: TJRJ" />
            </div>
            <div className="space-y-1.5">
              <Label>Comarca</Label>
              <Input value={formEdit.comarca} onChange={fe("comarca")} placeholder="Ex: Rio de Janeiro" />
            </div>
            <div className="space-y-1.5">
              <Label>Vara / Juízo</Label>
              <Input value={formEdit.vara} onChange={fe("vara")} placeholder="Ex: 5ª Vara Cível" />
            </div>
            <div className="space-y-1.5">
              <Label>Classe</Label>
              <Input value={formEdit.classe} onChange={fe("classe")} placeholder="Ex: Execução de Título Extrajudicial" />
            </div>
            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Input value={formEdit.assunto} onChange={fe("assunto")} placeholder="Ex: Despesas Condominiais" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={formEdit.tipo} onValueChange={(v) => setFormEdit(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fase Processual</Label>
              <Select value={formEdit.faseProcessual} onValueChange={(v) => setFormEdit(p => ({ ...p, faseProcessual: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FASE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={formEdit.status} onValueChange={(v) => setFormEdit(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="arquivado">Arquivado</SelectItem>
                  <SelectItem value="encerrado">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data de Ajuizamento</Label>
              <Input type="date" value={formEdit.dataAjuizamento} onChange={fe("dataAjuizamento")} />
            </div>
            <div className="space-y-1.5">
              <Label>Condomínio</Label>
              <Input value={formEdit.condominioNome} onChange={fe("condominioNome")} placeholder="Nome do condomínio" />
            </div>
            <div className="space-y-1.5">
              <Label>Advogado Responsável</Label>
              <Input value={formEdit.advogadoNome} onChange={fe("advogadoNome")} placeholder="Nome do advogado" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Valor da Causa (R$)</Label>
                <Input type="number" step="0.01" value={formEdit.valorCausa} onChange={fe("valorCausa")} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label>Valor da Condenação (R$)</Label>
                <Input type="number" step="0.01" value={formEdit.valorCondenacao} onChange={fe("valorCondenacao")} placeholder="0,00" />
              </div>
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={formEdit.observacoes} onChange={fe("observacoes")} placeholder="Observações gerais sobre o processo..." rows={3} className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClose(); setEditInitialized(false); }}>Cancelar</Button>
          <Button onClick={handleSalvarEdit} disabled={updateProcesso.isPending}>
            {updateProcesso.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Movimentação</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Data *</Label>
            <Input type="date" value={form.data} onChange={(e) => setForm(p => ({ ...p, data: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["distribuicao","Distribuição"],["citacao","Citação"],["contestacao","Contestação"],
                  ["audiencia","Audiência"],["sentenca","Sentença"],["recurso","Recurso"],
                  ["despacho","Despacho"],["decisao","Decisão"],["peticao","Petição"],
                  ["transito_julgado","Trânsito em Julgado"],["execucao","Execução"],["outro","Outro"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))}
              placeholder="Descreva a movimentação..." rows={3}
              className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={addMov.isPending}>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Parte</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="autor">Autor</SelectItem>
                  <SelectItem value="reu">Réu</SelectItem>
                  <SelectItem value="terceiro">Terceiro</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>CPF/CNPJ</Label>
              <Input value={form.cpfCnpj} onChange={(e) => setForm(p => ({ ...p, cpfCnpj: e.target.value }))}
                placeholder="000.000.000-00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => setForm(p => ({ ...p, nome: e.target.value }))}
              placeholder="Nome completo" />
          </div>
          <div className="space-y-1.5">
            <Label>Representante / Advogado</Label>
            <Input value={form.representante} onChange={(e) => setForm(p => ({ ...p, representante: e.target.value }))}
              placeholder="Nome do representante" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={addParte.isPending}>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Prazo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={(e) => setForm(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Ex: Prazo para contestação" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    ["processual","Processual"],["audiencia","Audiência"],["recurso","Recurso"],
                    ["contratual","Contratual"],["administrativo","Administrativo"],
                    ["interno","Interno"],["outro","Outro"],
                  ].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data Limite *</Label>
              <Input type="date" value={form.dataLimite} onChange={(e) => setForm(p => ({ ...p, dataLimite: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Input value={form.responsavelNome} onChange={(e) => setForm(p => ({ ...p, responsavelNome: e.target.value }))}
              placeholder="Nome do responsável" />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={form.observacoes} onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
              rows={2} className="resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={createPrazo.isPending}>
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Lançamento Financeiro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    ["custas","Custas"],["honorarios","Honorários"],["despesas","Despesas"],
                    ["deposito","Depósito"],["condenacao","Condenação"],["reembolso","Reembolso"],["outro","Outro"],
                  ].map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data *</Label>
              <Input type="date" value={form.data} onChange={(e) => setForm(p => ({ ...p, data: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Input value={form.descricao} onChange={(e) => setForm(p => ({ ...p, descricao: e.target.value }))}
              placeholder="Ex: Custas de distribuição" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (R$) *</Label>
              <Input value={form.valor} onChange={(e) => setForm(p => ({ ...p, valor: e.target.value }))}
                placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.pago ? "pago" : "pendente"} onValueChange={(v) => setForm(p => ({ ...p, pago: v === "pago" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={addFin.isPending}>
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
  const [modalEditar, setModalEditar] = useState(false);
  // Banner de sugestão de prazo após sincronização DataJud
  const [sugestaoPrazo, setSugestaoPrazo] = useState<{ novasMovs: number; movNome?: string } | null>(null);

  const { data: processo, isLoading, refetch } = trpc.processos.getById.useQuery(
    { id: processoId },
    { enabled: processoId > 0 }
  );

  const { data: prazos, refetch: refetchPrazos } = trpc.prazos.listar.useQuery(
    { processoId },
    { enabled: processoId > 0 }
  );

  const sincronizarDatajud = trpc.processos.sincronizarDataJud.useMutation();
  const sincronizarTJRJ = trpc.tjrj.sincronizarMovimentos.useMutation();
  const deleteMov = trpc.processos.deleteMovimentacao.useMutation();
  const removeParte = trpc.processos.removeParte.useMutation();
  const concluirPrazo = trpc.prazos.concluir.useMutation();
  const deletePrazo = trpc.prazos.delete.useMutation();
  const updateFin = trpc.processos.updateFinanceiro.useMutation();

  const criarPrazoMutation = trpc.prazos.create.useMutation({
    onSuccess: () => {
      refetchPrazos();
      setSugestaoPrazo(null);
      toast.success("Prazo criado com sucesso!");
    },
    onError: (err: any) => toast.error("Erro ao criar prazo", { description: err.message }),
  });

  const handleSincronizar = async () => {
    try {
      const r = await sincronizarDatajud.mutateAsync({ processoId });
      refetch();
      if (r.novasMovimentacoes > 0) {
        // Pega o nome da movimentação mais recente para exibir no banner
        const movRecente = processo?.movimentacoes?.[0];
        setSugestaoPrazo({ novasMovs: r.novasMovimentacoes, movNome: movRecente?.descricao ?? undefined });
        toast.success(`Sincronizado! ${r.novasMovimentacoes} nova(s) movimentação(ões) importada(s)`);
      } else {
        toast.success("Sincronizado! Nenhuma novidade encontrada.");
      }
    } catch (err: any) {
      toast.error("Erro ao sincronizar", { description: err.message });
    }
  };

  const handleSincronizarTJRJ = async () => {
    if (!processo?.numeroCNJ) { toast.error("Número CNJ não disponível"); return; }
    try {
      const r = await sincronizarTJRJ.mutateAsync({
        processoId,
        numeroCNJ: processo.numeroCNJ,
      });
      refetch();
      if (r.inseridas > 0) {
        toast.success(`TJRJ sincronizado! ${r.inseridas} nova(s) movimentação(ões) salva(s)`, {
          description: `Total no TJRJ: ${r.total} movimentações`,
        });
      } else {
        toast.success("TJRJ sincronizado! Nenhuma novidade encontrada.");
      }
    } catch (err: any) {
      toast.error("Erro ao sincronizar TJRJ", { description: err.message });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!processo) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground">
        <Scale className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Processo não encontrado</p>
        <Link href="/admin/juridico/processos">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[processo.status] ?? STATUS_CONFIG.ativo;

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <Link href="/admin/juridico/processos">
            <Button variant="ghost" size="sm" className="mt-0.5">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-mono text-lg font-bold text-primary">
                {formatarCNJ(processo.numeroCNJ)}
              </h1>
              <Badge className={`text-xs border ${statusCfg.color}`}>{statusCfg.label}</Badge>
              <Badge className="text-xs bg-blue-500/15 text-blue-600 dark:text-blue-400">
                {TIPO_LABELS[processo.tipo]}
              </Badge>
              {processo.datajudSincronizadoEm && (
                <Badge className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                  DataJud ✓
                </Badge>
              )}
              {(() => {
                const ultimaTJRJ = (processo.movimentacoes ?? []).filter((m: any) => m.origem === "tjrj").sort((a: any, b: any) => new Date(b.createdAt ?? b.data).getTime() - new Date(a.createdAt ?? a.data).getTime())[0];
                return ultimaTJRJ ? (
                  <Badge
                    className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 cursor-default"
                    title={`Última sincronização TJRJ: ${new Date(ultimaTJRJ.createdAt ?? ultimaTJRJ.data).toLocaleString("pt-BR")}`}
                  >
                    TJRJ ✓
                  </Badge>
                ) : null;
              })()}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {processo.tribunal} {processo.comarca ? `— ${processo.comarca}` : ""}
              {processo.vara ? ` — ${processo.vara}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {processo.tribunalAlias && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSincronizar}
              disabled={sincronizarDatajud.isPending}
              title="Sincronizar movimentações do DataJud"
            >
              {sincronizarDatajud.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download className="w-4 h-4" />}
              <span className="ml-1.5 text-xs">DataJud</span>
            </Button>
          )}
          {processo.tribunal?.toUpperCase().includes("TJRJ") || processo.tribunal?.toUpperCase().includes("RJ") ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSincronizarTJRJ}
              disabled={sincronizarTJRJ.isPending}
              title="Sincronizar movimentações do TJRJ e salvar no banco"
              className="border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
            >
              {sincronizarTJRJ.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Gavel className="w-4 h-4" />}
              <span className="ml-1.5 text-xs">Sincronizar TJRJ</span>
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setModalEditar(true)} title="Editar dados do processo">
            <FileText className="w-4 h-4" />
            <span className="ml-1.5 text-xs">Editar</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Banner de sugestão de prazo após sincronização DataJud */}
      {sugestaoPrazo && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-3">
          <Timer className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {sugestaoPrazo.novasMovs} nova(s) movimentação(ões) importada(s) do DataJud
            </p>
            {sugestaoPrazo.movNome && (
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5 truncate">
                Última: {sugestaoPrazo.movNome}
              </p>
            )}
            <p className="text-xs text-amber-600/70 dark:text-amber-400/60 mt-0.5">
              Deseja criar um prazo processual de 15 dias para responder a esta movimentação?
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20"
              disabled={criarPrazoMutation.isPending}
              onClick={() => {
                const dataLimite = new Date();
                dataLimite.setDate(dataLimite.getDate() + 15);
                criarPrazoMutation.mutate({
                  titulo: `Prazo — Movimentação DataJud (${processo.numeroCNJ})`,
                  tipo: "processual",
                  processoId,
                  condominioId: processo.condominioId ?? undefined,
                  condominioNome: processo.condominioNome ?? undefined,
                  dataLimite,
                  alertas: JSON.stringify([7, 3, 1]),
                });
              }}
            >
              {criarPrazoMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Criar prazo (15 dias)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs h-7 text-muted-foreground"
              onClick={() => setSugestaoPrazo(null)}
            >
              Ignorar
            </Button>
          </div>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Fase</p>
            <p className="text-sm font-semibold text-foreground">{FASE_LABELS[processo.faseProcessual]}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Valor da Causa</p>
            <p className="text-sm font-semibold text-foreground">{formatarMoeda(processo.valorCausa)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">A Pagar</p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">{formatarMoeda(processo.resumoFinanceiro?.totalPendente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pago</p>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatarMoeda(processo.resumoFinanceiro?.totalPago)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Abas */}
      <Tabs defaultValue="timeline">
        <TabsList className="mb-4">
          <TabsTrigger value="timeline">
            <Activity className="w-4 h-4 mr-1.5" />
            Timeline ({processo.movimentacoes?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="partes">
            <Users className="w-4 h-4 mr-1.5" />
            Partes ({processo.partes?.length ?? 0})
          </TabsTrigger>
            <TabsTrigger value="prazos">
              <Timer className="w-4 h-4 mr-1.5" />
              {(() => {
                const urgentes = (prazos ?? []).filter((p: any) =>
                  p.status === "pendente" && (p.urgencia === "atrasado" || p.urgencia === "hoje" || p.urgencia === "7dias")
                ).length;
                return (
                  <span className="flex items-center gap-1.5">
                    Prazos ({prazos?.length ?? 0})
                    {urgentes > 0 && (
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                        {urgentes}
                      </span>
                    )}
                  </span>
                );
              })()}
          </TabsTrigger>
          <TabsTrigger value="financeiro">
            <DollarSign className="w-4 h-4 mr-1.5" />
            Financeiro ({processo.financeiro?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="info">
            <FileText className="w-4 h-4 mr-1.5" />
            Informações
          </TabsTrigger>
        </TabsList>

        {/* ─── Timeline (layout estilo Astrea) ─────────────────────────────────── */}
        <TabsContent value="timeline">
          <TimelineAstrea
            movimentacoes={processo.movimentacoes ?? []}
            partes={processo.partes ?? []}
            onAddMov={() => setModalMov(true)}
            onDeleteMov={async (id) => { await deleteMov.mutateAsync({ id }); refetch(); }}
          />
        </TabsContent>

        {/* ─── Partes ─────────────────────────────────────────────────────────── */}
        <TabsContent value="partes">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Partes do Processo</h3>
            <Button size="sm" onClick={() => setModalParte(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Adicionar Parte
            </Button>
          </div>

          {processo.partes?.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhuma parte cadastrada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {processo.partes?.map((parte) => {
                const advs = parseAdvogados((parte as any).advogadosJson);
                return (
                  <Card key={parte.id} className="group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          {/* Tipo + Nome */}
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Badge className={`text-xs ${
                              parte.tipo === "autor" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" :
                              parte.tipo === "reu" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {parte.tipo === "autor" ? "Autor" : parte.tipo === "reu" ? "Réu" : parte.tipo === "terceiro" ? "Terceiro" : "Outro"}
                            </Badge>
                            <p className="text-sm font-semibold text-foreground">{parte.nome}</p>
                          </div>
                          {/* CPF/CNPJ */}
                          {parte.cpfCnpj && (
                            <p className="text-xs text-muted-foreground mb-1">
                              CPF/CNPJ: <span className="font-mono text-foreground">{parte.cpfCnpj}</span>
                            </p>
                          )}
                          {/* Representante */}
                          {parte.representante && (
                            <p className="text-xs text-muted-foreground mb-1">Repr.: {parte.representante}</p>
                          )}
                          {/* Advogados com OAB destacada */}
                          {advs.length > 0 && (
                            <div className="mt-2 pt-2 border-t space-y-1">
                              {advs.map((adv, i) => (
                                <div key={i} className="flex items-center gap-2 flex-wrap">
                                  <User className="w-3 h-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs text-foreground">{adv.nome}</span>
                                  {adv.oab && (
                                    <span className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold">
                                      OAB {adv.oab}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            await removeParte.mutateAsync({ id: parte.id });
                            refetch();
                          }}
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0 shrink-0"
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
        </TabsContent>

        {/* ─── Prazos ─────────────────────────────────────────────────────────── */}
        <TabsContent value="prazos">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Prazos Vinculados ao Processo</h3>
            <Button size="sm" onClick={() => setModalPrazo(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Novo Prazo
            </Button>
          </div>

          {!prazos || prazos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Timer className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhum prazo cadastrado para este processo</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prazos.map((prazo) => {
                const urgCfg = prazo.urgencia ? URGENCIA_CONFIG[prazo.urgencia] : null;
                return (
                  <Card key={prazo.id} className={`border ${
                    prazo.urgencia === "atrasado" ? "border-red-500/30 bg-red-500/5" :
                    prazo.urgencia === "hoje" ? "border-orange-500/30 bg-orange-500/5" :
                    prazo.urgencia === "7dias" ? "border-amber-500/20 bg-amber-500/5" :
                    prazo.urgencia === "15dias" ? "border-yellow-500/20 bg-yellow-500/5" :
                    ""
                  } group`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-medium text-foreground">{prazo.titulo}</p>
                            {urgCfg && prazo.status === "pendente" && (
                              <Badge className={`text-xs border ${urgCfg.bg} ${urgCfg.color}`}>
                                {urgCfg.label}
                              </Badge>
                            )}
                            {prazo.status === "concluido" && (
                              <Badge className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Concluído
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
                              className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 h-7 px-2 text-xs"
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
                            className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
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
            <h3 className="text-sm font-medium text-muted-foreground">Lançamentos Financeiros</h3>
            <Button size="sm" onClick={() => setModalFin(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Novo Lançamento
            </Button>
          </div>

          {processo.financeiro?.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <DollarSign className="w-8 h-8 mx-auto mb-2" />
              <p>Nenhum lançamento financeiro</p>
            </div>
          ) : (
            <div className="space-y-2">
              {processo.financeiro?.map((item) => (
                <Card key={item.id} className="group">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{item.descricao}</span>
                          <Badge className={`text-xs ${item.pago ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}>
                            {item.pago ? "Pago" : "Pendente"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.tipo.charAt(0).toUpperCase() + item.tipo.slice(1)} — {new Date(item.data).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${item.pago ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
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
                            className="text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 h-7 px-2 text-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Marcar Pago
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground">Dados do Processo</CardTitle>
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
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className="text-xs text-foreground text-right">{v}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-muted-foreground">Responsáveis e Valores</CardTitle>
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
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className="text-xs text-foreground text-right">{v}</span>
                  </div>
                ))}
                {processo.observacoes && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Observações</p>
                    <p className="text-xs text-foreground">{processo.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

      </Tabs>

      {/* Modais */}
      <ModalEditarProcesso processoId={processoId} processo={processo} open={modalEditar} onClose={() => setModalEditar(false)} onSuccess={refetch} />
      <ModalMovimentacao processoId={processoId} open={modalMov} onClose={() => setModalMov(false)} onSuccess={refetch} />
      <ModalParte processoId={processoId} open={modalParte} onClose={() => setModalParte(false)} onSuccess={refetch} />
      <ModalPrazo processoId={processoId} open={modalPrazo} onClose={() => setModalPrazo(false)} onSuccess={refetchPrazos} />
      <ModalFinanceiro processoId={processoId} open={modalFin} onClose={() => setModalFin(false)} onSuccess={refetch} />
    </div>
  );
}
