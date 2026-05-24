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
import { Loader2, FileText, ExternalLink } from "lucide-react";

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
  cobrancas: CobrancaComBreakdown[];
  nomeCondominio?: string;
  nomeResponsavel?: string;
}

function formatarMoedaLocal(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function GerarDocumentoModal({
  open,
  onClose,
  devedor,
  cobrancas,
  nomeCondominio,
  nomeResponsavel,
}: GerarDocumentoModalProps) {
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<Set<number>>(new Set());
  const [gerandoPDF, setGerandoPDF] = useState(false);

  // Buscar lista de modelos disponíveis
  const { data: modelos = [], isLoading: loadingModelos } = trpc.modelosDocumento.list.useQuery(
    { condominioId: devedor.condominioId ?? null },
    { enabled: open }
  );

  const gerarPDFMutation = trpc.modelosDocumento.gerarPDF.useMutation();

  // Cobranças pendentes (não pagas)
  const cobrancasPendentes = useMemo(
    () => cobrancas.filter((c) => c.status !== "pago"),
    [cobrancas]
  );

  // Inicializar seleção com todas as cobranças pendentes quando o modal abre
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setCobrancasSelecionadas(new Set(cobrancasPendentes.map((c) => c.id)));
    }
    if (!isOpen) onClose();
  };

  const toggleCobranca = (id: number) => {
    setCobrancasSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTodas = () => {
    if (cobrancasSelecionadas.size === cobrancasPendentes.length) {
      setCobrancasSelecionadas(new Set());
    } else {
      setCobrancasSelecionadas(new Set(cobrancasPendentes.map((c) => c.id)));
    }
  };

  // Totais das cobranças selecionadas
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

  const handleGerar = async () => {
    if (!modeloId) {
      toast.error("Selecione um modelo de documento");
      return;
    }
    if (cobrancasSelecionadas.size === 0) {
      toast.error("Selecione ao menos uma dívida");
      return;
    }

    setGerandoPDF(true);
    try {
      const selecionadas = cobrancasPendentes.filter((c) => cobrancasSelecionadas.has(c.id));

      // Montar parcelas com dados detalhados
      const parcelas = selecionadas.map((c) => {
        const bd = c.breakdown;
        const descricao = c.description || `Dívida venc. ${format(new Date(c.dueDate), "dd/MM/yyyy")}`;
        const vencimento = format(new Date(c.dueDate), "dd/MM/yyyy");
        if (bd) {
          return {
            descricao,
            vencimento,
            valorOriginal: formatarMoedaLocal(bd.valorOriginal),
            juros: formatarMoedaLocal(bd.juros),
            multa: formatarMoedaLocal(bd.multa),
            honorarios: formatarMoedaLocal(bd.honorarios),
            correcao: formatarMoedaLocal(bd.correcaoMonetaria),
            valorAtualizado: formatarMoedaLocal(bd.valorTotal),
          };
        }
        const v = c.amount / 100;
        return {
          descricao,
          vencimento,
          valorOriginal: formatarMoedaLocal(v),
          valorAtualizado: formatarMoedaLocal(v),
        };
      });

      const { url } = await gerarPDFMutation.mutateAsync({
        modeloId,
        variaveis: {
          nomeDevedor: devedor.name,
          cpfCnpjDevedor: devedor.cpfCnpj || "",
          unidadeDevedor: devedor.unitNumber || "",
          blocoDevedor: devedor.bloco || "",
          nomeCondominio: nomeCondominio || "",
          nomeResponsavel: nomeResponsavel || "",
          valorOriginal: formatarMoedaLocal(totais.valorOriginal),
          valorAcordo: formatarMoedaLocal(totais.total),
          numeroParcelas: String(selecionadas.length),
          valorParcela: formatarMoedaLocal(totais.total),
          dataAtual: new Date().toLocaleDateString("pt-BR"),
        },
        parcelas,
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

  const statusLabel: Record<string, string> = {
    pendente: "Pendente",
    em_cobranca: "Em Cobrança",
    em_acordo: "Em Acordo",
    pago: "Pago",
  };

  const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
    pendente: "destructive",
    em_cobranca: "default",
    em_acordo: "secondary",
    pago: "outline",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Gerar Documento
          </DialogTitle>
          <DialogDescription>
            Gere um documento PDF para <strong>{devedor.name}</strong> com as dívidas selecionadas.
          </DialogDescription>
        </DialogHeader>

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
                onValueChange={(v) => setModeloId(Number(v))}
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

          {/* Seleção das dívidas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Dívidas a incluir</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={toggleTodas}
              >
                {cobrancasSelecionadas.size === cobrancasPendentes.length
                  ? "Desmarcar todas"
                  : "Selecionar todas"}
              </Button>
            </div>

            {cobrancasPendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhuma dívida pendente encontrada.
              </p>
            ) : (
              <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                {cobrancasPendentes.map((c) => {
                  const bd = c.breakdown;
                  const valorExibir = bd
                    ? formatarMoedaLocal(bd.valorTotal)
                    : formatarMoedaLocal(c.amount / 100);
                  const descricao =
                    c.description || `Dívida venc. ${format(new Date(c.dueDate), "dd/MM/yyyy")}`;
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
          </div>

          {/* Resumo dos totais */}
          {cobrancasSelecionadas.size > 0 && (
            <div className="bg-muted/40 rounded-md p-3 space-y-1 text-sm">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">
                Resumo — {cobrancasSelecionadas.size} dívida(s) selecionada(s)
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-muted-foreground">Valor Original</span>
                <span className="text-right font-medium">{formatarMoedaLocal(totais.valorOriginal)}</span>
                {totais.juros > 0 && (
                  <>
                    <span className="text-muted-foreground">Juros</span>
                    <span className="text-right text-orange-600">+ {formatarMoedaLocal(totais.juros)}</span>
                  </>
                )}
                {totais.multa > 0 && (
                  <>
                    <span className="text-muted-foreground">Multa</span>
                    <span className="text-right text-red-600">+ {formatarMoedaLocal(totais.multa)}</span>
                  </>
                )}
                {totais.honorarios > 0 && (
                  <>
                    <span className="text-muted-foreground">Honorários</span>
                    <span className="text-right text-purple-600">+ {formatarMoedaLocal(totais.honorarios)}</span>
                  </>
                )}
                {totais.correcao > 0 && (
                  <>
                    <span className="text-muted-foreground">Correção</span>
                    <span className="text-right text-blue-600">+ {formatarMoedaLocal(totais.correcao)}</span>
                  </>
                )}
                <span className="font-semibold border-t pt-1">Total Atualizado</span>
                <span className="text-right font-bold border-t pt-1">{formatarMoedaLocal(totais.total)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={gerandoPDF}>
            Cancelar
          </Button>
          <Button
            onClick={handleGerar}
            disabled={gerandoPDF || !modeloId || cobrancasSelecionadas.size === 0}
            className="gap-2"
          >
            {gerandoPDF ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            {gerandoPDF ? "Gerando PDF..." : "Gerar Documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
