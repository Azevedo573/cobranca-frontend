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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
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
      resultado: "simulada" | "emitida" | "ja_existia" | "falha";
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
      const emitidas = retorno.resultados.filter((item) => item.resultado === "emitida").length;
      const falhas = retorno.resultados.filter((item) => item.resultado === "falha").length;
      toast[falhas > 0 ? "warning" : "success"](
        falhas > 0
          ? `Envio concluído com ${falhas} item(ns) que exigem atenção.`
          : emitidas > 0
            ? `${emitidas} parcela(s) emitida(s) no BTG.`
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
      <Sheet open={open} onOpenChange={(value) => !value && fechar()}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[640px]">
          <SheetHeader className="border-b px-6 py-5 pr-12">
            <div className="flex items-center gap-2">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-blue-600" />
                Enviar parcelas ao BTG
              </SheetTitle>
              <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">Sandbox</Badge>
            </div>
            <SheetDescription>
              Revise e selecione as parcelas do acordo #{acordoId}. O acordo permanece visível ao fundo para preservar seu contexto.
            </SheetDescription>
          </SheetHeader>

          {preparacao.isLoading ? (
            <div className="flex flex-1 items-center justify-center p-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando parcelas do acordo...
            </div>
          ) : preparacao.error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <CircleAlert className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{preparacao.error.message}</span>
                  <Button size="sm" variant="outline" onClick={() => preparacao.refetch()}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : resultado ? (
            <>
              <div className="flex-1 overflow-y-auto p-6">
                <Alert className="border-emerald-500/50 bg-emerald-500/5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <AlertDescription>
                    <strong>Resultado da simulação Sandbox.</strong> O BTG devolve respostas estáticas de homologação; nenhuma cobrança é persistida no portal bancário.
                  </AlertDescription>
                </Alert>
                <div className="mt-4 overflow-hidden rounded-lg border divide-y">
                  {resultado.resultados.map((item) => (
                    <div key={item.parcelaId} className="flex items-start justify-between gap-4 p-4 text-sm">
                      <div>
                        <p className="font-medium">{item.installmentNumber === 0 ? "Entrada" : `Parcela ${item.installmentNumber}`}</p>
                        <p className="mt-1 text-muted-foreground">{item.mensagem}</p>
                      </div>
                      <Badge
                        variant={item.resultado === "falha" ? "destructive" : "outline"}
                        className={["simulada", "emitida"].includes(item.resultado) ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}
                      >
                        {item.resultado === "simulada" ? "Simulada" : item.resultado === "emitida" ? "Emitida" : item.resultado === "ja_existia" ? "Já registrada" : "Falha"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              <SheetFooter className="border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
                <Button onClick={fechar}>Fechar</Button>
              </SheetFooter>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <Alert className="border-blue-200 bg-blue-50/70">
                  <ShieldCheck className="h-4 w-4 text-blue-700" />
                  <AlertDescription className="text-blue-950">
                    <strong>Homologação Sandbox.</strong> Parcelas pendentes e atrasadas foram pré-selecionadas. Itens pagos, cancelados ou vinculados a CNAB/BTG legado ficam bloqueados.
                  </AlertDescription>
                </Alert>

                <div className="mt-5 flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">Parcelas do acordo</p>
                    <p className="text-xs text-muted-foreground">{parcelasElegiveis.length} elegível(is) para a simulação</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={alternarTodas} disabled={parcelasElegiveis.length === 0}>
                    {todasSelecionadas ? "Desmarcar todas" : "Selecionar todas"}
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {preparacao.data?.parcelas.map((parcela) => (
                    <label
                      key={parcela.id}
                      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                        parcela.elegivel ? "cursor-pointer bg-card hover:border-blue-300 hover:bg-blue-50/40" : "bg-muted/30 opacity-75"
                      }`}
                    >
                      <Checkbox
                        checked={selecionadas.has(parcela.id)}
                        disabled={!parcela.elegivel}
                        onCheckedChange={(value) => alternarParcela(parcela.id, value === true)}
                        aria-label={`Selecionar ${parcela.installmentNumber === 0 ? "entrada" : `parcela ${parcela.installmentNumber}`}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{parcela.installmentNumber === 0 ? "Entrada" : `Parcela ${parcela.installmentNumber}`}</span>
                          <span className="font-semibold tabular-nums">{moeda(parcela.amount)}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Vencimento: {data(parcela.dueDate)}</span>
                          {parcela.elegivel ? (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">Pendente</Badge>
                          ) : (
                            <Badge variant="secondary">Bloqueada</Badge>
                          )}
                        </span>
                        {!parcela.elegivel && <span className="mt-2 block text-xs text-muted-foreground">{parcela.motivoBloqueio}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <SheetFooter className="border-t bg-background px-6 py-4">
                <div className="w-full rounded-lg bg-muted/40 p-3 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{selecionadas.size} parcela(s) selecionada(s)</p>
                    <p className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{moeda(totalSelecionado)}</strong></p>
                  </div>
                  <div className="mt-3 flex gap-2 sm:mt-0">
                    <Button variant="outline" onClick={fechar}>Cancelar</Button>
                    <Button disabled={selecionadas.size === 0} onClick={() => setConfirmarOpen(true)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Revisar simulação
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

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
              {emitirMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar simulação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
