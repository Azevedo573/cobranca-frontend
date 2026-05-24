import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, FileText, ExternalLink, Eye, EyeOff, ChevronLeft } from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CobrancaComBreakdown {
  id: number;
  description?: string | null;
  dueDate: Date | string;
  amount: number; // centavos
  status: string;
  breakdown?: {
    valorOriginal: number;
    juros: number;
    multa: number;
    honorarios: number;
    correcaoMonetaria: number;
    valorTotal: number;
  };
}

/** Parcela de acordo: já tem valor negociado, sem breakdown de encargos */
export interface ParcelaAcordo {
  id: number;
  installmentNumber: number;
  amount: number; // centavos
  dueDate: Date | string;
  status: string;
  description?: string | null;
}

interface DevedorInfo {
  id: number;
  name: string;
  cpfCnpj?: string | null;
  unitNumber?: string | null;
  bloco?: string | null;
  condominioId?: number | null;
}

interface GerarDocumentoModalProps {
  open: boolean;
  onClose: () => void;
  devedor: DevedorInfo;
  /** Dívidas brutas — usado na tela do Devedor */
  cobrancas?: CobrancaComBreakdown[];
  /** Parcelas do acordo — usado na tela do Acordo */
  parcelasAcordo?: ParcelaAcordo[];
  /** Variáveis extras para preencher no documento */
  variaveisExtras?: Record<string, string>;
  nomeCondominio?: string;
  nomeResponsavel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function GerarDocumentoModal({
  open,
  onClose,
  devedor,
  cobrancas = [],
  parcelasAcordo,
  variaveisExtras = {},
  nomeCondominio,
  nomeResponsavel,
}: GerarDocumentoModalProps) {
  const modoAcordo = Array.isArray(parcelasAcordo);

  const [modeloId, setModeloId] = useState<number | null>(null);
  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<Set<number>>(new Set());
  const [gerandoPDF, setGerandoPDF] = useState(false);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Buscar lista de modelos disponíveis
  const { data: modelos = [], isLoading: loadingModelos } = trpc.modelosDocumento.list.useQuery(
    { condominioId: devedor.condominioId ?? null },
    { enabled: open }
  );

  const gerarPDFMutation = trpc.modelosDocumento.gerarPDF.useMutation();

  // Cobranças pendentes (não pagas) — apenas no modo dívidas
  const cobrancasPendentes = useMemo(
    () => cobrancas.filter((c) => c.status !== "pago"),
    [cobrancas]
  );

  // Inicializar seleção quando o modal abre
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCobrancasSelecionadas(new Set(cobrancasPendentes.map((c) => c.id)));
      setPreviewUrl(null);
    }
    if (!isOpen) {
      setPreviewUrl(null);
      onClose();
    }
  };

  const toggleCobranca = (id: number) => {
    setCobrancasSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreviewUrl(null); // invalidar preview ao mudar seleção
  };

  const toggleTodas = () => {
    if (cobrancasSelecionadas.size === cobrancasPendentes.length) {
      setCobrancasSelecionadas(new Set());
    } else {
      setCobrancasSelecionadas(new Set(cobrancasPendentes.map((c) => c.id)));
    }
    setPreviewUrl(null);
  };

  // Totais das cobranças selecionadas (modo dívidas)
  const totais = useMemo(() => {
    const selecionadas = cobrancasPendentes.filter((c) => cobrancasSelecionadas.has(c.id));
    return selecionadas.reduce(
      (acc, c) => {
        const bd = c.breakdown;
        if (bd) {
          acc.valorOriginal += bd.valorOriginal;
          acc.juros += bd.juros;
          acc.multa += bd.multa;
          acc.honorarios += bd.honorarios;
          acc.correcao += bd.correcaoMonetaria;
          acc.total += bd.valorTotal;
        } else {
          const v = c.amount / 100;
          acc.valorOriginal += v;
          acc.total += v;
        }
        return acc;
      },
      { valorOriginal: 0, juros: 0, multa: 0, honorarios: 0, correcao: 0, total: 0 }
    );
  }, [cobrancasPendentes, cobrancasSelecionadas]);

  // Totais do acordo (modo acordo)
  const totaisAcordo = useMemo(() => {
    if (!parcelasAcordo) return null;
    const pendentes = parcelasAcordo.filter((p) => p.status !== "pago");
    const total = pendentes.reduce((s, p) => s + p.amount / 100, 0);
    return { total, numParcelas: parcelasAcordo.length, numPendentes: pendentes.length };
  }, [parcelasAcordo]);

  // ─── Montar payload de parcelas ───────────────────────────────────────────

  const montarParcelas = () => {
    if (modoAcordo && parcelasAcordo) {
      return parcelasAcordo.map((p) => ({
        numero: p.installmentNumber,
        descricao: p.description || `Parcela ${p.installmentNumber}`,
        vencimento: format(new Date(p.dueDate), "dd/MM/yyyy"),
        valor: fmt(p.amount / 100),
        valorAtualizado: fmt(p.amount / 100),
        status: p.status === "pago" ? "Pago" : p.status === "atrasado" ? "Atrasado" : "Em aberto",
      }));
    }
    const selecionadas = cobrancasPendentes.filter((c) => cobrancasSelecionadas.has(c.id));
    return selecionadas.map((c) => {
      const bd = c.breakdown;
      const descricao = c.description || `Dívida venc. ${format(new Date(c.dueDate), "dd/MM/yyyy")}`;
      const vencimento = format(new Date(c.dueDate), "dd/MM/yyyy");
      if (bd) {
        return {
          descricao,
          vencimento,
          valorOriginal: fmt(bd.valorOriginal),
          juros: fmt(bd.juros),
          multa: fmt(bd.multa),
          honorarios: fmt(bd.honorarios),
          correcao: fmt(bd.correcaoMonetaria),
          valorAtualizado: fmt(bd.valorTotal),
        };
      }
      const v = c.amount / 100;
      return { descricao, vencimento, valorOriginal: fmt(v), valorAtualizado: fmt(v) };
    });
  };

  const montarVariaveis = () => {
    const base: Record<string, string> = {
      nomeDevedor: devedor.name,
      cpfCnpjDevedor: devedor.cpfCnpj || "",
      unidadeDevedor: devedor.unitNumber || "",
      blocoDevedor: devedor.bloco || "",
      nomeCondominio: nomeCondominio || "",
      nomeResponsavel: nomeResponsavel || "",
      dataAtual: new Date().toLocaleDateString("pt-BR"),
      ...variaveisExtras,
    };
    if (modoAcordo && totaisAcordo) {
      base.valorAcordo = fmt(totaisAcordo.total);
      base.numeroParcelas = String(totaisAcordo.numParcelas);
      if (parcelasAcordo && parcelasAcordo[0]) {
        base.valorParcela = fmt(parcelasAcordo[0].amount / 100);
        base.dataVencimentoPrimeiraParcela = format(new Date(parcelasAcordo[0].dueDate), "dd/MM/yyyy");
      }
    } else {
      base.valorOriginal = fmt(totais.valorOriginal);
      base.valorAcordo = fmt(totais.total);
      base.numeroParcelas = String(cobrancasSelecionadas.size);
      base.valorParcela = fmt(totais.total);
    }
    return base;
  };

  const validar = () => {
    if (!modeloId) { toast.error("Selecione um modelo de documento"); return false; }
    if (!modoAcordo && cobrancasSelecionadas.size === 0) { toast.error("Selecione ao menos uma dívida"); return false; }
    return true;
  };

  // ─── Pré-visualizar ───────────────────────────────────────────────────────

  const handlePrevisualizar = async () => {
    if (!validar()) return;
    setGerandoPreview(true);
    setPreviewUrl(null);
    try {
      const { url } = await gerarPDFMutation.mutateAsync({
        modeloId: modeloId!,
        variaveis: montarVariaveis(),
        parcelas: montarParcelas(),
      });
      setPreviewUrl(url);
    } catch (err: any) {
      toast.error("Erro ao gerar pré-visualização: " + err.message);
    } finally {
      setGerandoPreview(false);
    }
  };

  // ─── Gerar e abrir ────────────────────────────────────────────────────────

  const handleGerar = async () => {
    if (!validar()) return;
    // Se já temos a URL da pré-visualização, apenas abrir
    if (previewUrl) {
      window.open(previewUrl, "_blank");
      toast.success("Documento aberto em nova aba!");
      onClose();
      return;
    }
    setGerandoPDF(true);
    try {
      const { url } = await gerarPDFMutation.mutateAsync({
        modeloId: modeloId!,
        variaveis: montarVariaveis(),
        parcelas: montarParcelas(),
      });
      window.open(url, "_blank");
      toast.success("Documento gerado com sucesso!");
      onClose();
    } catch (err: any) {
      toast.error("Erro ao gerar documento: " + err.message);
    } finally {
      setGerandoPDF(false);
    }
  };

  // ─── Labels de status ─────────────────────────────────────────────────────

  const statusLabel: Record<string, string> = {
    pendente: "Pendente", em_cobranca: "Em Cobrança", em_acordo: "Em Acordo", pago: "Pago",
  };
  const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pendente: "destructive", em_cobranca: "default", em_acordo: "secondary", pago: "outline",
  };

  const isLoading = gerandoPDF || gerandoPreview;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={previewUrl ? "max-w-4xl h-[92vh] flex flex-col" : "max-w-2xl max-h-[90vh] overflow-y-auto"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Gerar Documento
          </DialogTitle>
          <DialogDescription>
            {modoAcordo
              ? <>Gere um documento PDF para <strong>{devedor.name}</strong> com as parcelas do acordo.</>
              : <>Gere um documento PDF para <strong>{devedor.name}</strong> com as dívidas selecionadas.</>
            }
          </DialogDescription>
        </DialogHeader>

        {/* ── Pré-visualização ── */}
        {previewUrl ? (
          <div className="flex flex-col flex-1 min-h-0 gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground"
                onClick={() => setPreviewUrl(null)}
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar para configurações
              </Button>
              <span className="text-sm text-muted-foreground ml-auto">Pré-visualização do documento</span>
            </div>
            <iframe
              src={previewUrl}
              className="flex-1 w-full rounded-md border bg-muted/20"
              title="Pré-visualização do PDF"
            />
          </div>
        ) : (
          /* ── Formulário ── */
          <div className="space-y-5">
            {/* Seleção do modelo */}
            <div className="space-y-2">
              <Label>Modelo de Documento *</Label>
              {loadingModelos ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando modelos...
                </div>
              ) : modelos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum modelo cadastrado.{" "}
                  <a href="/modelos-documento" className="underline text-primary">
                    Criar modelo
                  </a>
                </p>
              ) : (
                <Select
                  value={modeloId ? String(modeloId) : ""}
                  onValueChange={(v) => { setModeloId(Number(v)); setPreviewUrl(null); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um modelo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* ── Modo Acordo: lista de parcelas (somente leitura) ── */}
            {modoAcordo && parcelasAcordo && (
              <div className="space-y-2">
                <Label>Parcelas do Acordo</Label>
                <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                  {parcelasAcordo.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Parcela {p.installmentNumber} — {format(new Date(p.dueDate), "dd/MM/yyyy")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={p.status === "pago" ? "outline" : p.status === "atrasado" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {p.status === "pago" ? "Pago" : p.status === "atrasado" ? "Atrasado" : "Em aberto"}
                        </Badge>
                        <span className="text-sm font-semibold">{fmt(p.amount / 100)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {totaisAcordo && (
                  <div className="bg-muted/40 rounded-md p-3 text-sm">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">Total do Acordo</span>
                      <span className="text-right font-bold">{fmt(parcelasAcordo.reduce((s, p) => s + p.amount / 100, 0))}</span>
                      <span className="text-muted-foreground">Parcelas Pendentes</span>
                      <span className="text-right font-medium">{totaisAcordo.numPendentes} de {totaisAcordo.numParcelas}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Modo Dívidas: seleção de cobranças ── */}
            {!modoAcordo && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Dívidas a incluir</Label>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleTodas}>
                    {cobrancasSelecionadas.size === cobrancasPendentes.length ? "Desmarcar todas" : "Selecionar todas"}
                  </Button>
                </div>

                {cobrancasPendentes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">Nenhuma dívida pendente encontrada.</p>
                ) : (
                  <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                    {cobrancasPendentes.map((c) => {
                      const bd = c.breakdown;
                      const valorExibir = bd ? fmt(bd.valorTotal) : fmt(c.amount / 100);
                      const descricao = c.description || `Dívida venc. ${format(new Date(c.dueDate), "dd/MM/yyyy")}`;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 cursor-pointer"
                          onClick={() => toggleCobranca(c.id)}
                        >
                          <Checkbox
                            checked={cobrancasSelecionadas.has(c.id)}
                            onCheckedChange={() => toggleCobranca(c.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{descricao}</p>
                            <p className="text-xs text-muted-foreground">
                              Venc. {format(new Date(c.dueDate), "dd/MM/yyyy")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={statusVariant[c.status] ?? "outline"} className="text-xs">
                              {statusLabel[c.status] ?? c.status}
                            </Badge>
                            <span className="text-sm font-semibold">{valorExibir}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Resumo dos totais */}
                {cobrancasSelecionadas.size > 0 && (
                  <div className="bg-muted/40 rounded-md p-3 space-y-1 text-sm">
                    <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">
                      Resumo — {cobrancasSelecionadas.size} dívida(s) selecionada(s)
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">Valor Original</span>
                      <span className="text-right font-medium">{fmt(totais.valorOriginal)}</span>
                      {totais.juros > 0 && (<><span className="text-muted-foreground">Juros</span><span className="text-right text-orange-600">+ {fmt(totais.juros)}</span></>)}
                      {totais.multa > 0 && (<><span className="text-muted-foreground">Multa</span><span className="text-right text-red-600">+ {fmt(totais.multa)}</span></>)}
                      {totais.honorarios > 0 && (<><span className="text-muted-foreground">Honorários</span><span className="text-right text-purple-600">+ {fmt(totais.honorarios)}</span></>)}
                      {totais.correcao > 0 && (<><span className="text-muted-foreground">Correção</span><span className="text-right text-blue-600">+ {fmt(totais.correcao)}</span></>)}
                      <span className="font-semibold border-t pt-1">Total Atualizado</span>
                      <span className="text-right font-bold border-t pt-1">{fmt(totais.total)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>

          {/* Botão Pré-visualizar — só aparece quando não estamos já na pré-visualização */}
          {!previewUrl && (
            <Button
              variant="outline"
              onClick={handlePrevisualizar}
              disabled={isLoading || !modeloId || (!modoAcordo && cobrancasSelecionadas.size === 0)}
              className="gap-2"
            >
              {gerandoPreview ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              {gerandoPreview ? "Gerando..." : "Pré-visualizar"}
            </Button>
          )}

          <Button
            onClick={handleGerar}
            disabled={isLoading || !modeloId || (!modoAcordo && cobrancasSelecionadas.size === 0)}
            className="gap-2"
          >
            {gerandoPDF ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {gerandoPDF ? "Gerando PDF..." : previewUrl ? "Abrir em Nova Aba" : "Gerar Documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
