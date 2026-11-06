import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  caminhoCnabAcordo,
  preservarSelecaoElegivel,
  selecionavelApi,
} from "@/lib/btgCanaisUI";
import { invalidarCanaisBtg } from "@/lib/invalidarCanaisBtg";
import {
  AcaoRevisarReserva,
  ConfirmarReservaLocalDialog,
  SituacaoCanalParcela,
} from "./btg/CanaisUI";
import { useConfirmarReservaLocal } from "./btg/useConfirmarReservaLocal";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type Resultado = inferRouterOutputs<AppRouter>["btgV2"]["emitirParcelasAcordo"];
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acordoId: number;
  onSuccess?: () => void;
}
const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    valor / 100
  );
const data = (valor: Date | string) =>
  new Date(valor).toLocaleDateString("pt-BR");

export function BTGEnviarParcelasAcordoModal({
  open,
  onOpenChange,
  acordoId,
  onSuccess,
}: Props) {
  const utils = trpc.useUtils();
  const reserva = useConfirmarReservaLocal();
  const admin = reserva.role === "admin";
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const painel = trpc.btgV2.painel.useQuery(undefined, {
    enabled: open && admin,
  });
  const acordo = trpc.acordos.getById.useQuery(
    { id: acordoId },
    { enabled: open && acordoId > 0 }
  );
  const parcelasAcordo = trpc.acordos.getParcelas.useQuery(
    { acordoId },
    { enabled: open && acordoId > 0 }
  );
  const situacao = trpc.btgCanais.situacaoAcordo.useQuery(
    { acordoId },
    { enabled: open && admin && acordoId > 0 }
  );
  const preparacao = trpc.btgV2.prepararEmissaoAcordo.useQuery(
    { acordoId },
    { enabled: open && admin && acordoId > 0 }
  );
  const ambiente =
    painel.data?.integracao?.ambiente ?? painel.data?.oauth?.ambiente;
  const sandbox = ambiente === "sandbox";
  const parcelas = useMemo(() => {
    const base = preparacao.data?.parcelas ?? parcelasAcordo.data ?? [];
    return base.map(p => {
      const atual = situacao.data?.find(s => s.parcelaId === p.id);
      const conjunta = {
        ...p,
        ...atual,
        elegivel:
          "elegivel" in p && p.elegivel === true && atual?.elegivel !== false,
        motivoBloqueio:
          "motivoBloqueio" in p && p.motivoBloqueio
            ? p.motivoBloqueio
            : atual?.motivoBloqueio,
      };
      return {
        ...conjunta,
        elegivel: Boolean(preparacao.data && selecionavelApi(conjunta)),
      };
    });
  }, [preparacao.data, parcelasAcordo.data, situacao.data]);
  const elegiveis = parcelas.filter(p => p.elegivel);
  const todas =
    elegiveis.length > 0 && elegiveis.every(p => selecionadas.has(p.id));
  const total = parcelas
    .filter(p => p.elegivel && selecionadas.has(p.id))
    .reduce((s, p) => s + p.amount, 0);
  const selecaoValida =
    selecionadas.size > 0 &&
    selecionadas.size <= 50 &&
    parcelas.filter(p => p.elegivel && selecionadas.has(p.id)).length ===
      selecionadas.size;
  const emissaoHabilitada =
    admin &&
    painel.data?.emissaoHabilitada === true &&
    Boolean(preparacao.data) &&
    !preparacao.isFetching &&
    !situacao.isFetching;

  useEffect(() => {
    setSelecionadas(new Set());
    setResultado(null);
    setConfirmarOpen(false);
    setConfirmacao("");
  }, [open, acordoId]);
  useEffect(() => {
    setSelecionadas(anterior => preservarSelecaoElegivel(anterior, parcelas));
  }, [parcelas]);

  const emitirMutation = trpc.btgV2.emitirParcelasAcordo.useMutation({
    onSuccess: async retorno => {
      setResultado(retorno);
      setSelecionadas(new Set());
      setConfirmarOpen(false);
      setConfirmacao("");
      const falhas = retorno.resultados.filter(
        i => i.resultado === "falha"
      ).length;
      toast[falhas ? "warning" : "success"](
        falhas
          ? `Resultado com ${falhas} item(ns) para revisão. Não haverá troca automática de canal.`
          : "Resultado da operação API BTG recebido."
      );
      await invalidarCanaisBtg(utils);
      onSuccess?.();
    },
    onError: async error => {
      setConfirmarOpen(false);
      toast.error(
        `Não foi possível concluir o envio: ${error.message}. Revise a situação atual antes de tentar outra operação.`
      );
      await invalidarCanaisBtg(utils);
    },
  });
  const ocupado = emitirMutation.isPending || reserva.dialogProps.pendente;
  const fechar = () => {
    if (!ocupado) {
      setConfirmarOpen(false);
      onOpenChange(false);
    }
  };
  const alternar = (id: number, marcada: boolean) => {
    if (ocupado || !parcelas.some(p => p.id === id && p.elegivel)) return;
    setSelecionadas(anterior => {
      const proxima = new Set(anterior);
      marcada ? proxima.add(id) : proxima.delete(id);
      return proxima;
    });
  };
  const copiar = async (valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      toast.success("Copiado.");
    } catch {
      toast.error(
        "Não foi possível copiar. Verifique a permissão do navegador."
      );
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={value => {
          if (!value) fechar();
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-[680px]"
          onEscapeKeyDown={e => {
            if (ocupado) e.preventDefault();
          }}
          onInteractOutside={e => {
            if (ocupado) e.preventDefault();
          }}
        >
          <SheetHeader className="border-b px-6 py-5 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-primary" />
                Enviar ao BTG pela API
              </SheetTitle>
              <Badge variant="outline">
                {sandbox
                  ? "Sandbox"
                  : ambiente === "producao"
                    ? "Produção"
                    : "Ambiente não confirmado"}
              </Badge>
            </div>
            <SheetDescription>
              Acordo #{acordoId} · selecione as parcelas para uma operação API
              BTG v2. Criar acordo ou confirmar reserva não emite cobranças.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!admin ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Envio API e confirmação de reserva são exclusivos do
                  administrador.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {painel.isLoading ||
                preparacao.isLoading ||
                parcelasAcordo.isLoading ? (
                  <p
                    role="status"
                    className="flex items-center justify-center py-6"
                  >
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Carregando revisão...
                  </p>
                ) : null}
                {[
                  painel.error,
                  preparacao.error,
                  situacao.error,
                  parcelasAcordo.error,
                ]
                  .filter(Boolean)
                  .map((erro, index) => (
                    <Alert key={index} variant="destructive">
                      <CircleAlert className="h-4 w-4" />
                      <AlertDescription>
                        {erro?.message}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            void preparacao.refetch();
                            void situacao.refetch();
                            void painel.refetch();
                          }}
                        >
                          <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          Atualizar revisão
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ))}
                {!painel.isLoading && !painel.data?.emissaoHabilitada && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      A emissão API está bloqueada. Confira OAuth, conta
                      vinculada e liberação do ambiente em{" "}
                      <Link href="/configuracoes/btg" className="underline">
                        Configuração BTG
                      </Link>
                      . O CNAB é uma escolha separada, não um fallback.
                    </AlertDescription>
                  </Alert>
                )}
                <Alert>
                  <ShieldCheck className="h-4 w-4" />
                  <AlertDescription>
                    {sandbox
                      ? "Homologação Sandbox: respostas de teste, sem cobrança real no portal bancário."
                      : "A confirmação envia cobranças ao BTG; em Produção, a emissão é real."}{" "}
                    Não há envio automático ao devedor nem troca de canal em
                    falha. Boleto/Pix existentes permanecem disponíveis.
                  </AlertDescription>
                </Alert>
                {resultado ? (
                  <section aria-label="Resultado API BTG" className="space-y-3">
                    <h2 className="font-semibold">
                      Resultado da operação · API BTG v2
                    </h2>
                    {resultado.resultados.map(item => (
                      <article
                        key={item.parcelaId}
                        className="rounded-lg border p-4 text-sm"
                      >
                        <div className="flex justify-between gap-3">
                          <p className="font-medium">
                            {item.installmentNumber === 0
                              ? "Entrada"
                              : `Parcela ${item.installmentNumber}`}
                          </p>
                          <Badge
                            variant={
                              item.resultado === "falha"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {item.resultado === "simulada"
                              ? "Simulada"
                              : item.resultado === "emitida"
                                ? "Emitida"
                                : item.resultado === "ja_existia"
                                  ? "Já registrada"
                                  : "Falha / revisar"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-muted-foreground">
                          {item.mensagem}
                        </p>
                        {item.resultado === "falha" && (
                          <p className="mt-2 text-xs text-destructive">
                            Não use CNAB para contornar falha ou estado incerto.
                            Revise/concilie a emissão existente.
                          </p>
                        )}
                        {item.emissao?.nossoNumero && (
                          <p className="mt-2 text-xs font-mono">
                            Nosso número bancário: {item.emissao.nossoNumero}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.emissao?.bankSlipUrl && (
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={item.emissao.bankSlipUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Boleto
                              </a>
                            </Button>
                          )}
                          {item.emissao?.linhaDigitavel && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void copiar(item.emissao!.linhaDigitavel!)
                              }
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copiar linha
                            </Button>
                          )}
                          {item.emissao?.pixCopiaECola && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void copiar(item.emissao!.pixCopiaECola!)
                              }
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copiar Pix
                            </Button>
                          )}
                        </div>
                      </article>
                    ))}
                  </section>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                      <div>
                        <p className="text-sm font-semibold">
                          Parcelas do acordo
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {elegiveis.length} elegível(is) · selecione até 50
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={
                          !elegiveis.length || ocupado || !emissaoHabilitada
                        }
                        onClick={() =>
                          setSelecionadas(
                            todas
                              ? new Set()
                              : new Set(elegiveis.slice(0, 50).map(p => p.id))
                          )
                        }
                      >
                        {todas ? "Desmarcar todas" : "Selecionar elegíveis"}
                      </Button>
                    </div>
                    {!parcelas.length && !parcelasAcordo.isLoading && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nenhuma parcela encontrada neste acordo.
                      </p>
                    )}
                    {parcelas.length > 0 && !elegiveis.length && (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        Nenhuma parcela elegível para envio API. Confira os
                        motivos abaixo.
                      </p>
                    )}
                    {parcelas.map(parcela => (
                      <article
                        key={parcela.id}
                        className={`rounded-lg border p-4 ${parcela.elegivel ? "bg-card" : "bg-muted/30"}`}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            id={`api-parcela-${parcela.id}`}
                            checked={selecionadas.has(parcela.id)}
                            disabled={
                              !parcela.elegivel || ocupado || !emissaoHabilitada
                            }
                            onCheckedChange={value =>
                              alternar(parcela.id, value === true)
                            }
                            aria-describedby={`api-situacao-${parcela.id}`}
                          />
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`api-parcela-${parcela.id}`}
                              className="flex flex-wrap items-center justify-between gap-2 font-medium"
                            >
                              {parcela.installmentNumber === 0
                                ? "Entrada"
                                : `Parcela ${parcela.installmentNumber}`}
                              <span>{moeda(parcela.amount)}</span>
                            </label>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Vencimento: {data(parcela.dueDate)} ·{" "}
                              {parcela.status}
                            </p>
                            <div id={`api-situacao-${parcela.id}`}>
                              <SituacaoCanalParcela parcela={parcela} />
                            </div>
                            <AcaoRevisarReserva
                              parcela={parcela}
                              role={reserva.role}
                              onClick={() => reserva.abrir(parcela)}
                              disabled={ocupado}
                            />
                          </div>
                        </div>
                      </article>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          <SheetFooter className="border-t bg-background px-6 py-4">
            <div className="w-full space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {selecionadas.size} parcela(s) ·{" "}
                  <strong>{moeda(total)}</strong>
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={fechar} disabled={ocupado}>
                    Fechar
                  </Button>
                  {!resultado && (
                    <Button
                      disabled={!selecaoValida || !emissaoHabilitada || ocupado}
                      onClick={() => {
                        setConfirmacao("");
                        setConfirmarOpen(true);
                      }}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Revisar envio API
                    </Button>
                  )}
                </div>
              </div>
              {admin && acordo.data?.condominioId && !ocupado && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    href={caminhoCnabAcordo(acordoId, acordo.data.condominioId)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Gerar remessa CNAB
                  </Link>
                </Button>
              )}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={confirmarOpen}
        onOpenChange={value => {
          if (!ocupado) setConfirmarOpen(value);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sandbox
                ? "Confirmar envio API em homologação?"
                : "Confirmar envio pela API BTG?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Serão enviadas {selecionadas.size} parcela(s) do acordo #
              {acordoId}, total {moeda(total)}, pelo canal API BTG v2.{" "}
              {sandbox
                ? "O Sandbox devolve respostas de homologação."
                : "Em Produção, esta operação emite cobranças reais."}{" "}
              Nenhuma mensagem será enviada automaticamente ao devedor. Digite
              ENVIAR API BTG.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Label htmlFor="confirmacao-api-acordo">Confirmação de envio</Label>
          <Input
            id="confirmacao-api-acordo"
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
            disabled={ocupado}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                ocupado ||
                !selecaoValida ||
                !emissaoHabilitada ||
                confirmacao !== "ENVIAR API BTG"
              }
              onClick={event => {
                event.preventDefault();
                if (
                  confirmacao === "ENVIAR API BTG" &&
                  selecaoValida &&
                  emissaoHabilitada &&
                  !ocupado
                )
                  emitirMutation.mutate({
                    acordoId,
                    parcelaIds: Array.from(selecionadas),
                  });
              }}
            >
              {emitirMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirmar envio API
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmarReservaLocalDialog {...reserva.dialogProps} />
    </>
  );
}
