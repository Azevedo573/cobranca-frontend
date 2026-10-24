import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleAlert, CheckCircle2, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acordoId: number;
  onSuccess?: () => void;
}

const moeda = (valorCentavos: number) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(valorCentavos / 100);

const data = (valor: Date | string) => new Date(valor).toLocaleDateString("pt-BR");

export function BTGEnviarParcelasAcordoModal({ open, onOpenChange, acordoId, onSuccess }: Props) {
  const utils = trpc.useUtils();
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [resultado, setResultado] = useState<{
    acordoId: number;
    resultados: Array<{
      parcelaId: number;
      installmentNumber: number;
      resultado: "simulada" | "ja_existia" | "falha";
      mensagem: string;
    }>;
  } | null>(null);

  const preparacao = trpc.btgV2.prepararEmissaoAcordo.useQuery(
    { acordoId },
    { enabled: open && acordoId > 0 },
  );

  useEffect(() => {
    if (!open || !preparacao.data) return;
    setSelecionadas(new Set(preparacao.data.parcelas.filter((parcela) => parcela.elegivel).map((parcela) => parcela.id)));
    setResultado(null);
    setConfirmarOpen(false);
  }, [open, preparacao.data]);

  const parcelasElegiveis = useMemo(
    () => preparacao.data?.parcelas.filter((parcela) => parcela.elegivel) ?? [],
    [preparacao.data],
  );
  const totalSelecionado = useMemo(
    () => preparacao.data?.parcelas
      .filter((parcela) => selecionadas.has(parcela.id))
      .reduce((total, parcela) => total + parcela.amount, 0) ?? 0,
    [preparacao.data, selecionadas],
  );
  const todasSelecionadas = parcelasElegiveis.length > 0 && parcelasElegiveis.every((parcela) => selecionadas.has(parcela.id));

  const emitirMutation = trpc.btgV2.emitirParcelasAcordo.useMutation({
    onSuccess: async (retorno) => {
      setResultado(retorno);
      setConfirmarOpen(false);
      const simuladas = retorno.resultados.filter((item) => item.resultado === "simulada").length;
      const falhas = retorno.resultados.filter((item) => item.resultado === "falha").length;
      toast[falhas > 0 ? "warning" : "success"](
        falhas > 0
          ? `Simulação concluída com ${falhas} item(ns) que exigem atenção.`
          : `${simuladas} parcela(s) simulada(s) no BTG Sandbox.`,
      );
      await Promise.all([
        utils.acordos.getParcelas.invalidate({ acordoId }),
        utils.acordos.getById.invalidate({ id: acordoId }),
      ]);
      onSuccess?.();
    },
    onError: (error) => {
      setConfirmarOpen(false);
      toast.error(`Não foi possível enviar as parcelas: ${error.message}`);
    },
  });

  const alternarParcela = (parcelaId: number, marcada: boolean) => {
    setSelecionadas((anterior) => {
      const proxima = new Set(anterior);
      if (marcada) proxima.add(parcelaId);
      else proxima.delete(parcelaId);
      return proxima;
    });
  };

  const alternarTodas = () => {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(parcelasElegiveis.map((parcela) => parcela.id)));
  };

  const fechar = () => {
    setConfirmarOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => !value && fechar()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Enviar parcelas do acordo ao BTG
            </DialogTitle>
            <DialogDescription>
              Selecione as parcelas do acordo #{acordoId} para simular o envio BolePix no Sandbox.
            </DialogDescription>
          </DialogHeader>

          {preparacao.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando parcelas do acordo...
            </div>
          ) : preparacao.error ? (
            <Alert variant="destructive">
              <CircleAlert className="h-4 w-4" />
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{preparacao.error.message}</span>
                <Button size="sm" variant="outline" onClick={() => preparacao.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          ) : resultado ? (
            <div className="space-y-4">
              <Alert className="border-emerald-500/50 bg-emerald-500/5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <AlertDescription>
                  <strong>Resultado da simulação Sandbox.</strong> O BTG devolve respostas estáticas de homologação; nenhuma cobrança é persistida no portal bancário.
                </AlertDescription>
              </Alert>
              <div className="rounded-lg border divide-y">
                {resultado.resultados.map((item) => (
                  <div key={item.parcelaId} className="flex items-start justify-between gap-4 p-3 text-sm">
                    <div>
                      <p className="font-medium">{item.installmentNumber === 0 ? "Entrada" : `Parcela ${item.installmentNumber}`}</p>
                      <p className="text-muted-foreground">{item.mensagem}</p>
                    </div>
                    <Badge variant={item.resultado === "falha" ? "destructive" : "outline"} className={item.resultado === "simulada" ? "border-emerald-300 text-emerald-700 bg-emerald-50" : ""}>
                      {item.resultado === "simulada" ? "Simulada" : item.resultado === "ja_existia" ? "Já registrada" : "Falha"}
                    </Badge>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button onClick={fechar}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  <strong>Homologação Sandbox.</strong> As parcelas pendentes e atrasadas foram pré-selecionadas. Parcelas pagas, canceladas ou já vinculadas a CNAB/BTG legado permanecem bloqueadas.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{selecionadas.size} parcela(s) selecionada(s)</p>
                  <p className="text-sm text-muted-foreground">Total da seleção: <strong className="text-foreground">{moeda(totalSelecionado)}</strong></p>
                </div>
                <Button variant="outline" size="sm" onClick={alternarTodas} disabled={parcelasElegiveis.length === 0}>
                  {todasSelecionadas ? "Desmarcar elegíveis" : "Selecionar elegíveis"}
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto] gap-3 bg-muted/60 px-4 py-2 text-xs font-semibold text-muted-foreground sm:grid-cols-[auto_1fr_auto_auto_auto]">
                  <span />
                  <span>Parcela</span>
                  <span className="hidden sm:block">Vencimento</span>
                  <span className="hidden sm:block">Valor</span>
                  <span>Situação</span>
                </div>
                {preparacao.data?.parcelas.map((parcela) => (
                  <label key={parcela.id} className={`grid grid-cols-[auto_1fr_auto] gap-3 border-t px-4 py-3 text-sm sm:grid-cols-[auto_1fr_auto_auto_auto] ${parcela.elegivel ? "cursor-pointer hover:bg-blue-50/50" : "bg-muted/20"}`}>
                    <Checkbox
                      checked={selecionadas.has(parcela.id)}
                      disabled={!parcela.elegivel}
                      onCheckedChange={(value) => alternarParcela(parcela.id, value === true)}
                      aria-label={`Selecionar ${parcela.installmentNumber === 0 ? "entrada" : `parcela ${parcela.installmentNumber}`}`}
                    />
                    <span>
                      <span className="font-medium">{parcela.installmentNumber === 0 ? "Entrada" : `Parcela ${parcela.installmentNumber}`}</span>
                      {!parcela.elegivel && <span className="block text-xs text-muted-foreground mt-0.5">{parcela.motivoBloqueio}</span>}
                    </span>
                    <span className="hidden sm:block whitespace-nowrap">{data(parcela.dueDate)}</span>
                    <span className="hidden sm:block whitespace-nowrap font-medium">{moeda(parcela.amount)}</span>
                    <Badge variant={parcela.elegivel ? "outline" : "secondary"} className={parcela.elegivel ? "border-blue-300 text-blue-700 bg-blue-50" : ""}>
                      {parcela.elegivel ? "Elegível" : "Bloqueada"}
                    </Badge>
                  </label>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={fechar}>Cancelar</Button>
                <Button disabled={selecionadas.size === 0} onClick={() => setConfirmarOpen(true)}>
                  <Send className="h-4 w-4 mr-2" /> Revisar simulação
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarOpen} onOpenChange={setConfirmarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar simulação de parcelas no BTG Sandbox?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão enviadas {selecionadas.size} parcela(s), no total de {moeda(totalSelecionado)}, usando dados do acordo e do pagador. O Sandbox devolve resposta de homologação e não cria cobrança persistida no portal bancário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={emitirMutation.isPending || selecionadas.size === 0}
              onClick={(event) => {
                event.preventDefault();
                emitirMutation.mutate({ acordoId, parcelaIds: Array.from(selecionadas) });
              }}
            >
              {emitirMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar simulação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
