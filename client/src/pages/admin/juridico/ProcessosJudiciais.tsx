import { useState, useMemo, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Scale,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  Calendar,
  Building2,
  User,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  Loader2,
  Gavel,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { RotateCcw, CheckCheck, AlertTriangle } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  civel: "Cível",
  trabalhista: "Trabalhista",
  previdenciario: "Previdenciário",
  criminal: "Criminal",
  tributario: "Tributário",
  administrativo: "Administrativo",
  outro: "Outro",
};

const FASE_LABELS: Record<string, string> = {
  distribuicao: "Distribuição",
  citacao: "Citação",
  contestacao: "Contestação",
  instrucao: "Instrução",
  audiencia: "Audiência",
  sentenca: "Sentença",
  recurso: "Recurso",
  transito_julgado: "Trânsito em Julgado",
  execucao: "Execução",
  arquivado: "Arquivado",
  outro: "Outro",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ativo:     { label: "Ativo",     color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  suspenso:  { label: "Suspenso",  color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",         icon: <Clock className="w-3 h-3" /> },
  arquivado: { label: "Arquivado", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30",         icon: <XCircle className="w-3 h-3" /> },
  encerrado: { label: "Encerrado", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",             icon: <CheckCircle2 className="w-3 h-3" /> },
};

const TIPO_COLORS: Record<string, string> = {
  civel:          "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  trabalhista:    "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  previdenciario: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  criminal:       "bg-red-500/15 text-red-600 dark:text-red-400",
  tributario:     "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  administrativo: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  outro:          "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

function formatarCNJ(numero: string): string {
  const n = numero.replace(/\D/g, "");
  if (n.length === 20) {
    return `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n[13]}.${n.slice(14, 16)}.${n.slice(16)}`;
  }
  return numero;
}

function formatarMoeda(centavos: number | null | undefined): string {
  if (!centavos) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

// ─── Modal: Criar/Importar Processo ──────────────────────────────────────────

interface ModalCriarProcessoProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  condominioNomeInicial?: string;
  demandaIdInicial?: number;
}

function ModalCriarProcesso({ open, onClose, onSuccess, condominioNomeInicial, demandaIdInicial }: ModalCriarProcessoProps) {
  const [modo, setModo] = useState<"manual" | "datajud" | "tjrj">("tjrj");
  const [buscandoDatajud, setBuscandoDatajud] = useState(false);
  const [dadosDatajud, setDadosDatajud] = useState<any>(null);

  // ── Estado TJRJ ──────────────────────────────────────────────────────────
  const [cnjtjrj, setCnjtjrj] = useState("");
  const [buscandoTJRJ, setBuscandoTJRJ] = useState(false);
  const [dadosTJRJ, setDadosTJRJ] = useState<any>(null);
  const [erroTJRJ, setErroTJRJ] = useState("");
  const [condominioSelecionado, setCondominioSelecionado] = useState<{id: number; nome: string} | null>(null);

  const { data: condominios } = trpc.condominios.list.useQuery();


  const [form, setForm] = useState({
    numeroCNJ: "",
    tribunal: "",
    tribunalAlias: "",
    comarca: "",
    vara: "",
    classe: "",
    assunto: "",
    tipo: "civel" as const,
    faseProcessual: "distribuicao" as const,
    status: "ativo" as const,
    condominioNome: condominioNomeInicial ?? "",
    advogadoNome: "",
    valorCausa: "",
    observacoes: demandaIdInicial ? `Originado da demanda #${demandaIdInicial}` : "",
  });

  const { data: tribunais } = trpc.processos.listarTribunais.useQuery();
  const buscarDatajud = trpc.processos.buscarDataJud.useMutation();
  const criarProcesso = trpc.processos.create.useMutation();


  // ── Handler TJRJ ─────────────────────────────────────────────────────────
  const handleBuscarTJRJ = async () => {
    if (!cnjtjrj.trim()) { toast.error("Informe o número CNJ"); return; }
    setBuscandoTJRJ(true);
    setErroTJRJ("");
    setDadosTJRJ(null);
    setCondominioSelecionado(null);
    try {
      // Usar fetch direto para a procedure query (não mutation)
      const res = await fetch(`/api/trpc/tjrj.consultarMovimentos?input=${encodeURIComponent(JSON.stringify({ json: { numeroCNJ: cnjtjrj.trim() } }))}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json?.error || json?.result?.data?.json === null) {
        throw new Error(json?.error?.message ?? "Processo não encontrado");
      }
      const dados = json?.result?.data?.json;
      if (!dados) throw new Error("Resposta inválida do servidor");
      setDadosTJRJ(dados);

      // Tentar identificar o condomínio automaticamente
      const proc = dados.movimentos;
      const partes: Array<{nome: string; descPers: string}> = proc?.personagensProcesso ?? [];
      const autores = partes.filter((p: any) => p.descPers?.toLowerCase().includes("autor"));
      if (autores.length > 0 && condominios) {
        const nomeAutor = autores[0].nome.toLowerCase().replace(/condomínio|condominio/gi, "").trim();
        const match = condominios.find((c: any) => {
          const nc = (c.name ?? "").toLowerCase();
          return nc.includes(nomeAutor.slice(0, 10)) || nomeAutor.includes(nc.slice(0, 10));
        });
        if (match) {
          setCondominioSelecionado({ id: match.id, nome: match.name });
          toast.success(`Condomínio identificado: ${match.name}`);
        }
      }

      // Pré-preencher o formulário
      setForm(prev => ({
        ...prev,
        numeroCNJ: cnjtjrj.trim(),
        tribunal: "TJRJ",
        tribunalAlias: "tjrj",
        comarca: proc?.nome ?? prev.comarca,
        vara: proc?.descVara ?? proc?.descServ ?? prev.vara,
        classe: proc?.txtAcao ?? prev.classe,
        assunto: proc?.txtAssunto ?? prev.assunto,
        condominioNome: autores[0]?.nome ?? prev.condominioNome,
      }));

      toast.success("Processo encontrado no TJRJ!", { description: `${proc?.txtAcao ?? ""} — ${proc?.txtAssunto ?? ""}` });
    } catch (err: any) {
      setErroTJRJ(err.message ?? "Erro ao consultar TJRJ");
      toast.error("Erro ao consultar TJRJ", { description: err.message });
    } finally {
      setBuscandoTJRJ(false);
    }
  };

  const handleBuscarDatajud = async () => {
    if (!form.numeroCNJ.trim()) { toast.error("Informe o número CNJ"); return; }
    setBuscandoDatajud(true);
    try {
      const resultado = await buscarDatajud.mutateAsync({
        numeroCNJ: form.numeroCNJ.trim(),
        tribunalAlias: form.tribunalAlias || undefined,
      });
      if (!resultado.encontrado || !resultado.processo) {
        toast.error("Processo não encontrado no DataJud", { description: "Verifique o número CNJ ou selecione o tribunal manualmente." });
        return;
      }
      const p = resultado.processo;
      setDadosDatajud(resultado);
      setForm(prev => ({
        ...prev,
        tribunal: resultado.tribunal ?? p.tribunal ?? prev.tribunal,
        classe: p.classe ?? prev.classe,
        assunto: p.assunto ?? prev.assunto,
        vara: p.vara ?? prev.vara,
      }));
      toast.success("Processo encontrado no DataJud!", { description: `${p.classe ?? ""} — ${p.assunto ?? ""}` });
    } catch (err: any) {
      toast.error("Erro ao consultar DataJud", { description: err.message });
    } finally {
      setBuscandoDatajud(false);
    }
  };

  const handleSalvar = async () => {
    if (!form.numeroCNJ.trim()) { toast.error("Número CNJ é obrigatório"); return; }
    if (!form.tribunal.trim()) { toast.error("Tribunal é obrigatório"); return; }
    try {
      await criarProcesso.mutateAsync({
        numeroCNJ: form.numeroCNJ.trim(),
        tribunal: form.tribunal.trim(),
        tribunalAlias: form.tribunalAlias || undefined,
        comarca: form.comarca || undefined,
        vara: form.vara || undefined,
        classe: form.classe || undefined,
        assunto: form.assunto || undefined,
        tipo: form.tipo,
        faseProcessual: form.faseProcessual,
        status: form.status,
        condominioNome: form.condominioNome || undefined,
        advogadoNome: form.advogadoNome || undefined,
        valorCausa: form.valorCausa ? Math.round(parseFloat(form.valorCausa.replace(",", ".")) * 100) : undefined,
        observacoes: form.observacoes || undefined,
        datajudId: dadosDatajud?.processo?.datajudId ?? undefined,
        datajudSincronizadoEm: dadosDatajud ? new Date() : undefined,
      });
      toast.success("Processo criado com sucesso!");
      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      toast.error("Erro ao criar processo", { description: err.message });
    }
  };

  const resetForm = () => {
    setForm({
      numeroCNJ: "", tribunal: "", tribunalAlias: "", comarca: "", vara: "",
      classe: "", assunto: "", tipo: "civel", faseProcessual: "distribuicao",
      status: "ativo", condominioNome: "", advogadoNome: "", valorCausa: "", observacoes: "",
    });
    setDadosDatajud(null);
    setDadosTJRJ(null);
    setCnjtjrj("");
    setErroTJRJ("");
    setCondominioSelecionado(null);
    setModo("datajud");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetForm(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Novo Processo Judicial
          </DialogTitle>
        </DialogHeader>

        {/* Modo de entrada */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setModo("tjrj")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              modo === "tjrj"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Gavel className="w-4 h-4 inline mr-1.5" />
            Importar do TJRJ
          </button>
          <button
            onClick={() => setModo("datajud")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              modo === "datajud"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Download className="w-4 h-4 inline mr-1.5" />
            DataJud
          </button>
          <button
            onClick={() => setModo("manual")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              modo === "manual"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="w-4 h-4 inline mr-1.5" />
            Manual
          </button>
        </div>

        {/* ── Aba TJRJ ─────────────────────────────────────────────────────── */}
        {modo === "tjrj" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Número CNJ do Processo</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="0000000-00.0000.8.19.0000"
                  value={cnjtjrj}
                  onChange={(e) => setCnjtjrj(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleBuscarTJRJ()}
                  className="flex-1 font-mono"
                />
                <Button onClick={handleBuscarTJRJ} disabled={buscandoTJRJ} className="shrink-0">
                  {buscandoTJRJ ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {buscandoTJRJ ? "Buscando..." : "Buscar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Consulta diretamente o TJRJ e pré-preenche todos os dados</p>
            </div>

            {erroTJRJ && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{erroTJRJ}</p>
              </div>
            )}

            {dadosTJRJ && (() => {
              const proc = dadosTJRJ.movimentos;
              const partes: Array<{nome: string; descPers: string}> = proc?.personagensProcesso ?? [];
              const movs = proc?.movimentosProc ?? [];
              return (
                <div className="space-y-3">
                  {/* Dados do processo */}
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Processo encontrado no TJRJ
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Número interno:</span> <span className="font-mono font-semibold">{dadosTJRJ.numProcessoInterno}</span></div>
                      {proc?.txtAcao && <div><span className="text-muted-foreground">Ação:</span> <span>{proc.txtAcao}</span></div>}
                      {proc?.txtAssunto && <div className="col-span-2"><span className="text-muted-foreground">Assunto:</span> <span>{proc.txtAssunto}</span></div>}
                      {proc?.descVara && <div><span className="text-muted-foreground">Vara:</span> <span>{proc.descVara}</span></div>}
                      {proc?.nome && <div><span className="text-muted-foreground">Comarca:</span> <span>{proc.nome}</span></div>}
                      {movs.length > 0 && <div><span className="text-muted-foreground">Movimentações:</span> <span className="font-semibold">{movs.length}</span></div>}
                    </div>
                  </div>

                  {/* Partes */}
                  {partes.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-2">Partes do Processo</p>
                      <div className="space-y-1">
                        {partes.slice(0, 6).map((p, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="text-xs py-0 h-4 shrink-0">{p.descPers}</Badge>
                            <span className="text-foreground truncate">{p.nome}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Identificação de condomínio */}
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" />
                      Vincular ao Condomínio
                    </Label>
                    {condominioSelecionado ? (
                      <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/20 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm font-medium flex-1">{condominioSelecionado.nome}</span>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setCondominioSelecionado(null)}>Trocar</Button>
                      </div>
                    ) : (
                      <Select
                        value=""
                        onValueChange={(v) => {
                          const c = condominios?.find((c: any) => String(c.id) === v);
                          if (c) {
                            setCondominioSelecionado({ id: c.id, nome: c.name });
                            setForm(prev => ({ ...prev, condominioNome: c.name }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar condomínio..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {condominios?.map((c: any) => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Botão de continuar para o formulário */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      className="flex-1 gap-1.5"
                      onClick={() => {
                        if (condominioSelecionado) {
                          setForm(prev => ({ ...prev, condominioNome: condominioSelecionado.nome }));
                        }
                        setModo("manual");
                      }}
                    >
                      <ArrowRight className="w-4 h-4" />
                      Revisar e Salvar
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <div className="space-y-4">
          {/* Número CNJ */}
          <div className="space-y-1.5">
            <Label>Número CNJ *</Label>
            <div className="flex gap-2">
              <Input
                placeholder="0000000-00.0000.0.00.0000"
                value={form.numeroCNJ}
                onChange={(e) => setForm(p => ({ ...p, numeroCNJ: e.target.value }))}
                className="flex-1"
              />
              {modo === "datajud" && (
                <Button onClick={handleBuscarDatajud} disabled={buscandoDatajud} className="shrink-0">
                  {buscandoDatajud ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  {buscandoDatajud ? "Buscando..." : "Buscar"}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              O tribunal é detectado automaticamente pelo número CNJ
            </p>
          </div>

          {/* Tribunal + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tribunal *</Label>
              <Select
                value={form.tribunal}
                onValueChange={(v) => {
                  const t = tribunais?.find(t => t.sigla === v);
                  setForm(p => ({ ...p, tribunal: v, tribunalAlias: t?.alias ?? "" }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tribunal" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {tribunais?.map(t => (
                    <SelectItem key={t.sigla} value={t.sigla}>{t.sigla} — {t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v: any) => setForm(p => ({ ...p, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dados importados do DataJud */}
          {dadosDatajud?.processo && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Dados importados do DataJud
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {dadosDatajud.processo.classe && <span><strong>Classe:</strong> {dadosDatajud.processo.classe}</span>}
                {dadosDatajud.processo.assunto && <span><strong>Assunto:</strong> {dadosDatajud.processo.assunto}</span>}
                {dadosDatajud.processo.vara && <span><strong>Vara:</strong> {dadosDatajud.processo.vara}</span>}
                {dadosDatajud.processo.movimentos?.length > 0 && (
                  <span><strong>Movimentos:</strong> {dadosDatajud.processo.movimentos.length} importados</span>
                )}
              </div>
            </div>
          )}

          {/* Comarca + Vara */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Comarca</Label>
              <Input placeholder="Ex: São Paulo" value={form.comarca} onChange={(e) => setForm(p => ({ ...p, comarca: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vara / Juízo</Label>
              <Input placeholder="Ex: 3ª Vara Cível" value={form.vara} onChange={(e) => setForm(p => ({ ...p, vara: e.target.value }))} />
            </div>
          </div>

          {/* Classe + Assunto */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Classe Processual</Label>
              <Input placeholder="Ex: Ação de Cobrança" value={form.classe} onChange={(e) => setForm(p => ({ ...p, classe: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Input placeholder="Ex: Cobrança de Cotas Condominiais" value={form.assunto} onChange={(e) => setForm(p => ({ ...p, assunto: e.target.value }))} />
            </div>
          </div>

          {/* Fase + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fase Processual</Label>
              <Select value={form.faseProcessual} onValueChange={(v: any) => setForm(p => ({ ...p, faseProcessual: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FASE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor da Causa (R$)</Label>
              <Input placeholder="Ex: 15000.00" value={form.valorCausa} onChange={(e) => setForm(p => ({ ...p, valorCausa: e.target.value }))} />
            </div>
          </div>

          {/* Condomínio + Advogado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Condomínio</Label>
              <Input placeholder="Nome do condomínio" value={form.condominioNome} onChange={(e) => setForm(p => ({ ...p, condominioNome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Advogado Responsável</Label>
              <Input placeholder="Nome do advogado" value={form.advogadoNome} onChange={(e) => setForm(p => ({ ...p, advogadoNome: e.target.value }))} />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              placeholder="Informações adicionais sobre o processo..."
              value={form.observacoes}
              onChange={(e) => setForm(p => ({ ...p, observacoes: e.target.value }))}
              className="resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={criarProcesso.isPending}>
            {criarProcesso.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Criar Processo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function ProcessosJudiciais() {
  const { can } = usePermissions();
  const podeCriar = can("juridico_processos", "criar");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroCondominioId, setFiltroCondominioId] = useState<number | undefined>(undefined);
  const [modalSincTodos, setModalSincTodos] = useState(false);
  const [resultadoSinc, setResultadoSinc] = useState<any>(null);
  const sincronizarTodos = trpc.tjrj.sincronizarTodos.useMutation();
  const [buscaParte, setBuscaParte] = useState("");
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  // Abre o modal automaticamente se vier de uma demanda (?nova=1)
  const [modalAberto, setModalAberto] = useState(() => searchParams.get("nova") === "1");
  const demandaIdParam = searchParams.get("demandaId") ? Number(searchParams.get("demandaId")) : undefined;
  const condominioNomeParam = searchParams.get("condominioNome") ?? undefined;

  const { data: condominiosLista } = trpc.condominios.list.useQuery();

  const { data: processos, isLoading, refetch } = trpc.processos.listar.useQuery({
    status: filtroStatus !== "todos" ? (filtroStatus as any) : undefined,
    tipo: filtroTipo !== "todos" ? (filtroTipo as any) : undefined,
    busca: busca.trim() || undefined,
    condominioId: filtroCondominioId,
    buscaParte: buscaParte.trim() || undefined,
  });

  const { data: resumo } = trpc.processos.resumo.useQuery(
    filtroCondominioId ? { condominioId: filtroCondominioId } : undefined
  );

  const processosFiltrados = useMemo(() => processos ?? [], [processos]);

  return (<>
    <div className="min-h-screen bg-background text-foreground p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Processos Judiciais</h1>
            <p className="text-sm text-muted-foreground">Gestão de processos com integração DataJud/CNJ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              onClick={async () => {
                setResultadoSinc(null);
                setModalSincTodos(true);
                try {
                  const r = await sincronizarTodos.mutateAsync({ delayMs: 1500 });
                  setResultadoSinc(r);
                  refetch();
                  toast.success(`Sincronização concluída! ${r.novasMovimentacoes} nova(s) movimentação(ões)`);
                } catch (err: any) {
                  toast.error("Erro na sincronização", { description: err.message });
                  setModalSincTodos(false);
                }
              }}
              disabled={sincronizarTodos.isPending}
              title="Sincronizar movimentações TJRJ para todos os processos ativos"
            >
              {sincronizarTodos.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RotateCcw className="w-4 h-4" />}
              <span className="ml-1.5 text-xs hidden sm:inline">Sincronizar Todos</span>
            </Button>
            {podeCriar && (
            <Button onClick={() => setModalAberto(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Processo
            </Button>
          )}
        </div>
      </div>

      {/* Banner: veio de uma demanda */}
      {demandaIdParam && (
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 flex items-center gap-3">
          <Scale className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-sm text-blue-700 dark:text-blue-300 flex-1">
            Criando processo a partir da demanda <strong>#{demandaIdParam}</strong>.
            O vínculo será registrado automaticamente.
          </p>
          <Link href={`/admin/juridico/demandas/${demandaIdParam}`}>
            <Button variant="ghost" size="sm" className="text-xs text-blue-600">
              Voltar à demanda
            </Button>
          </Link>
        </div>
      )}

      {/* KPIs */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total", value: resumo.total, sub: "processos cadastrados", color: "text-foreground" },
            { label: "Ativos", value: resumo.ativos, sub: "em andamento", color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Suspensos", value: resumo.suspensos, sub: "aguardando", color: "text-amber-600 dark:text-amber-400" },
            { label: "Encerrados", value: resumo.encerrados, sub: "arquivados/encerrados", color: "text-muted-foreground" },
          ].map(({ label, value, sub, color }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número CNJ, comarca, vara..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="relative min-w-[200px]">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por devedor ou CPF/CNPJ..."
            value={buscaParte}
            onChange={(e) => setBuscaParte(e.target.value)}
            className="pl-9"
            title="Busca nas partes do processo (autor, réu, advogados)"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="suspenso">Suspenso</SelectItem>
            <SelectItem value="arquivado">Arquivado</SelectItem>
            <SelectItem value="encerrado">Encerrado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {Object.entries(TIPO_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filtroCondominioId ? String(filtroCondominioId) : "todos"}
          onValueChange={(v) => setFiltroCondominioId(v === "todos" ? undefined : Number(v))}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todos os condomínios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os condomínios</SelectItem>
            {(condominiosLista ?? []).map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Lista de processos */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : processosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Scale className="w-12 h-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground text-lg font-medium">Nenhum processo encontrado</p>
          <p className="text-muted-foreground/60 text-sm mt-1">Crie um novo processo ou ajuste os filtros</p>
          <Button onClick={() => setModalAberto(true)} className="mt-4">
            <Plus className="w-4 h-4 mr-1.5" />
            Novo Processo
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {processosFiltrados.map((processo) => {
            const statusCfg = STATUS_CONFIG[processo.status] ?? STATUS_CONFIG.ativo;
            return (
              <Link key={processo.id} href={`/admin/juridico/processos/${processo.id}`}>
                <Card className="hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-primary">
                            {formatarCNJ(processo.numeroCNJ)}
                          </span>
                          <Badge className={`text-xs border ${statusCfg.color} flex items-center gap-1`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                          <Badge className={`text-xs ${TIPO_COLORS[processo.tipo]}`}>
                            {TIPO_LABELS[processo.tipo]}
                          </Badge>
                          {processo.datajudSincronizadoEm && (
                            <Badge className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                              DataJud
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                          {processo.tribunal && (
                            <span className="flex items-center gap-1.5">
                              <Scale className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {processo.tribunal}
                            </span>
                          )}
                          {processo.condominioNome && (
                            <span className="flex items-center gap-1.5">
                              <Building2 className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {processo.condominioNome}
                            </span>
                          )}
                          {processo.advogadoNome && (
                            <span className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 shrink-0 opacity-50" />
                              {processo.advogadoNome}
                            </span>
                          )}
                        </div>

                        {(processo.classe || processo.assunto) && (
                          <p className="text-xs text-muted-foreground/70 mt-1.5 truncate">
                            {[processo.classe, processo.assunto].filter(Boolean).join(" — ")}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        {processo.valorCausa && (
                          <p className="text-sm font-semibold">{formatarMoeda(processo.valorCausa)}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {FASE_LABELS[processo.faseProcessual]}
                        </p>
                        {processo.dataUltimaMovimentacao && (
                          <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1 justify-end">
                            <Calendar className="w-3 h-3" />
                            {new Date(processo.dataUltimaMovimentacao).toLocaleDateString("pt-BR")}
                          </p>
                        )}
                        <ExternalLink className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors mt-2 ml-auto" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <ModalCriarProcesso
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onSuccess={() => refetch()}
        condominioNomeInicial={condominioNomeParam}
        demandaIdInicial={demandaIdParam}
      />
    </div>

    {/* Modal de progresso da sincronização TJRJ em lote */}
    <Dialog open={modalSincTodos} onOpenChange={(v) => { if (!v && !sincronizarTodos.isPending) setModalSincTodos(false); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-600" />
            Sincronização TJRJ em Lote
          </DialogTitle>
        </DialogHeader>

        {sincronizarTodos.isPending ? (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
            <p className="text-sm font-medium">Sincronizando processos do TJRJ...</p>
            <p className="text-xs text-muted-foreground">
              Cada processo é consultado com intervalo de 1,5s para não sobrecarregar a API.
              Aguarde — pode levar alguns minutos dependendo da quantidade de processos.
            </p>
          </div>
        ) : resultadoSinc ? (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{resultadoSinc.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Processos TJRJ</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resultadoSinc.novasMovimentacoes}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Novas movimentações</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-3 text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{resultadoSinc.erros}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Erros</p>
              </div>
            </div>

            {/* Lista de resultados */}
            <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-lg border p-2">
              {(resultadoSinc.resultados as any[]).map((r: any) => (
                <div key={r.processoId} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/50">
                  {r.status === "ok" ? (
                    <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : r.status === "sem_novidades" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="font-mono text-primary truncate flex-1">{r.numeroCNJ}</span>
                  {r.condominioNome && <span className="text-muted-foreground truncate max-w-[120px]">{r.condominioNome}</span>}
                  {r.status === "ok" && r.inseridas > 0 && (
                    <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30 shrink-0">+{r.inseridas}</Badge>
                  )}
                  {r.status === "erro" && (
                    <span className="text-red-500 truncate max-w-[100px]" title={r.erro}>{r.erro}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            onClick={() => setModalSincTodos(false)}
            disabled={sincronizarTodos.isPending}
          >
            {resultadoSinc ? "Fechar" : "Cancelar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}
