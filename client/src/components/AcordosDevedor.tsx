import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import {
  Calendar,
  DollarSign,
  FileText,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  AlertOctagon,
  Loader2,
  History,
  ExternalLink,
  Copy,
  QrCode,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc as trpcHook } from "@/lib/trpc";

interface AcordosDevedorProps {
  devedorId: number;
}

function ParcelasAcordo({ acordoId }: { acordoId: number }) {
  const { data: parcelas, isLoading } = trpc.acordos.getParcelas.useQuery({ acordoId });
  const [boletoParcelas, setBoletoParcelas] = useState<Record<number, { url: string; linhaDigitavel: string; pixCopiaCola?: string }>>({});
  const [copiandoParcela, setCopiandoParcela] = useState<Record<number, string | null>>({});

  const gerarPDFParcelaMutation = trpcHook.acordos.gerarBoletoPDFParcela.useMutation({
    onSuccess: (data: { url: string; linhaDigitavel: string; pixCopiaCola?: string }, variables: { parcelaId: number }) => {
      setBoletoParcelas(prev => ({ ...prev, [variables.parcelaId]: data }));
      toast.success("Boleto gerado com sucesso!");
    },
    onError: (err: { message: string }) => toast.error("Erro ao gerar boleto: " + err.message),
  });

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor / 100);

  const formatarData = (data: Date | string) =>
    new Date(data).toLocaleDateString("pt-BR");

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-2">Carregando parcelas...</p>;
  }

  if (!parcelas || parcelas.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Nenhuma parcela encontrada.</p>;
  }

  const getStatusIcon = (status: string) => {
    if (status === "pago") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (status === "atrasado") return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    if (status === "cancelado") return <XCircle className="h-3.5 w-3.5 text-gray-400" />;
    return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
  };

  const getStatusLabel = (status: string) => {
    if (status === "pago") return "Pago";
    if (status === "atrasado") return "Atrasado";
    if (status === "cancelado") return "Cancelado";
    return "Pendente";
  };

  const pagas = parcelas.filter((p) => p.status === "pago").length;
  const total = parcelas.length;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">
          Parcelas: {pagas}/{total} pagas
        </p>
        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(pagas / total) * 100}%` }}
          />
        </div>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {parcelas.map((parcela) => (
          <div
            key={parcela.id}
            className={`flex items-center justify-between text-xs py-1 px-2 rounded ${
              parcela.status === "cancelado" ? "bg-muted/30 opacity-60" : "bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {getStatusIcon(parcela.status)}
              <span className="font-medium">Parcela {parcela.installmentNumber}</span>
              <span className="text-muted-foreground">— {getStatusLabel(parcela.status)}</span>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="text-muted-foreground">
                {formatarData(parcela.dueDate)}
              </span>
              <span className={`font-semibold ${parcela.status === "cancelado" ? "line-through text-muted-foreground" : ""}`}>
                {formatarMoeda(parcela.amount)}
              </span>
              {/* Botão de boleto — só para parcelas com nossoNumero */}
              {(parcela as any).nossoNumero && parcela.status !== "cancelado" && (
                <div className="flex items-center gap-1">
                  {!boletoParcelas[parcela.id] ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 text-xs px-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                      onClick={() => gerarPDFParcelaMutation.mutate({ parcelaId: parcela.id })}
                      disabled={gerarPDFParcelaMutation.isPending}
                    >
                      {gerarPDFParcelaMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 text-xs px-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => window.open(boletoParcelas[parcela.id].url, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-5 text-xs px-1.5"
                        onClick={async () => {
                          await navigator.clipboard.writeText(boletoParcelas[parcela.id].linhaDigitavel);
                          setCopiandoParcela(prev => ({ ...prev, [parcela.id]: 'linha' }));
                          toast.success('Linha digitável copiada!');
                          setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcela.id]: null })), 2000);
                        }}
                      >
                        {copiandoParcela[parcela.id] === 'linha' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      {boletoParcelas[parcela.id]?.pixCopiaCola && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-5 text-xs px-1.5 border-green-300 text-green-700 hover:bg-green-50"
                          onClick={async () => {
                            await navigator.clipboard.writeText(boletoParcelas[parcela.id].pixCopiaCola!);
                            setCopiandoParcela(prev => ({ ...prev, [parcela.id]: 'pix' }));
                            toast.success('PIX copiado!');
                            setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcela.id]: null })), 2000);
                          }}
                        >
                          {copiandoParcela[parcela.id] === 'pix' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <QrCode className="h-3 w-3" />}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalQuebrarAcordo({
  open,
  onOpenChange,
  acordoId,
  parcelasPagas,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  acordoId: number;
  parcelasPagas: number;
  onSuccess: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const quebrarMutation = trpc.acordos.quebrarAcordo.useMutation({
    onSuccess: (data) => {
      toast.success(data.mensagem);
      onOpenChange(false);
      setMotivo("");
      onSuccess();
    },
    onError: (e) => toast.error("Erro ao quebrar acordo: " + e.message),
  });

  const caso = parcelasPagas === 0 ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertOctagon className="h-5 w-5" />
            Quebrar Acordo #{acordoId}
          </DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. Leia com atenção o que acontecerá.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Descrição do caso */}
          <div className={`p-4 rounded-lg border-l-4 ${caso === 1 ? "border-l-orange-500 bg-orange-50 dark:bg-orange-950/20" : "border-l-red-500 bg-red-50 dark:bg-red-950/20"}`}>
            <p className="text-sm font-semibold mb-1">
              {caso === 1 ? "Caso 1 — Nenhuma parcela paga" : `Caso 2 — ${parcelasPagas} parcela(s) paga(s)`}
            </p>
            {caso === 1 ? (
              <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                <li>Acordo será marcado como <strong>Cancelado</strong></li>
                <li>Todas as parcelas serão canceladas</li>
                <li>Dívidas originais voltam para <strong>Em Cobrança</strong> com o valor original</li>
              </ul>
            ) : (
              <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
                <li>Acordo será marcado como <strong>Inadimplente</strong></li>
                <li>Parcelas não pagas serão canceladas</li>
                <li>Dívidas originais voltam para <strong>Em Cobrança</strong> com abatimento proporcional do valor já pago</li>
              </ul>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label htmlFor="motivo-quebra">Motivo da quebra (opcional)</Label>
            <Textarea
              id="motivo-quebra"
              placeholder="Ex: Devedor não efetuou o pagamento das parcelas..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => quebrarMutation.mutate({ acordoId, motivo: motivo || undefined })}
            disabled={quebrarMutation.isPending}
          >
            {quebrarMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
            ) : (
              <><AlertOctagon className="h-4 w-4 mr-2" />Confirmar Quebra</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AcordosDevedor({ devedorId }: AcordosDevedorProps) {
  const { data: acordos, isLoading, refetch } = trpc.acordos.listByDevedor.useQuery({ devedorId });
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [acordoParaQuebrar, setAcordoParaQuebrar] = useState<{ id: number; parcelasPagas: number } | null>(null);

  const toggleExpandir = (acordoId: number) => {
    const novo = new Set(expandidos);
    if (novo.has(acordoId)) {
      novo.delete(acordoId);
    } else {
      novo.add(acordoId);
    }
    setExpandidos(novo);
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string; color: string }> = {
      ativo:        { variant: "default",     label: "Ativo",        color: "border-l-blue-500" },
      pago:         { variant: "secondary",   label: "Quitado",      color: "border-l-green-500" },
      cancelado:    { variant: "destructive", label: "Cancelado",    color: "border-l-gray-400" },
      inadimplente: { variant: "destructive", label: "Inadimplente", color: "border-l-red-500" },
    };
    return configs[status] || { variant: "outline" as const, label: status, color: "border-l-muted" };
  };

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor / 100);

  const formatarData = (data: Date | string) =>
    new Date(data).toLocaleDateString("pt-BR");

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Acordos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando acordos...</p>
        </CardContent>
      </Card>
    );
  }

  if (!acordos || acordos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Acordos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum acordo registrado para este devedor.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Separar acordos ativos dos históricos
  const acordosAtivos = acordos.filter(a => a.status === "ativo");
  const acordosHistorico = acordos.filter(a => a.status !== "ativo");

  return (
    <>
      <div className="space-y-6">
        {/* Acordos Ativos */}
        {acordosAtivos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-600">
                <FileText className="h-5 w-5" />
                Acordos Ativos ({acordosAtivos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {acordosAtivos.map((acordo) => {
                const cfg = getStatusConfig(acordo.status);
                return (
                  <Card key={acordo.id} className={`border-l-4 ${cfg.color}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">Acordo #{acordo.id}</h4>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Criado em {formatarData(acordo.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpandir(acordo.id)}
                            className="text-xs"
                          >
                            {expandidos.has(acordo.id) ? (
                              <><ChevronUp className="h-3.5 w-3.5 mr-1" />Ocultar parcelas</>
                            ) : (
                              <><ChevronDown className="h-3.5 w-3.5 mr-1" />Ver parcelas</>
                            )}
                          </Button>
                          <Link href={`/acordos/${acordo.id}`}>
                            <Button variant="outline" size="sm">Ver Detalhes</Button>
                          </Link>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setAcordoParaQuebrar({ id: acordo.id, parcelasPagas: (acordo as any).parcelasPagas ?? 0 })}
                          >
                            <AlertOctagon className="h-3.5 w-3.5 mr-1" />
                            Quebrar Acordo
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />Valor Total
                          </p>
                          <p className="text-sm font-semibold">{formatarMoeda(acordo.totalAmount)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <TrendingUp className="h-3 w-3" />Valor Acordado
                          </p>
                          <p className="text-sm font-semibold">{formatarMoeda(acordo.agreedAmount)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Parcelas</p>
                          <p className="text-sm font-semibold">{acordo.installments}x</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />1º Vencimento
                          </p>
                          <p className="text-sm font-semibold">{formatarData(acordo.firstPaymentDate)}</p>
                        </div>
                      </div>

                      {expandidos.has(acordo.id) && <ParcelasAcordo acordoId={acordo.id} />}

                      {acordo.notes && (
                        <div className="mt-3 p-2 bg-muted rounded-md">
                          <p className="text-xs text-muted-foreground mb-0.5">Observações:</p>
                          <p className="text-xs">{acordo.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Histórico de Acordos */}
        {acordosHistorico.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                <History className="h-5 w-5" />
                Histórico de Acordos ({acordosHistorico.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {acordosHistorico.map((acordo) => {
                const cfg = getStatusConfig(acordo.status);
                return (
                  <Card key={acordo.id} className={`border-l-4 ${cfg.color} opacity-80`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-sm">Acordo #{acordo.id}</h4>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Criado em {formatarData(acordo.createdAt)}
                            {(acordo as any).dataQuebra && (
                              <> · Quebrado em {formatarData((acordo as any).dataQuebra)}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpandir(acordo.id)}
                            className="text-xs"
                          >
                            {expandidos.has(acordo.id) ? (
                              <><ChevronUp className="h-3.5 w-3.5 mr-1" />Ocultar</>
                            ) : (
                              <><ChevronDown className="h-3.5 w-3.5 mr-1" />Ver parcelas</>
                            )}
                          </Button>
                          <Link href={`/acordos/${acordo.id}`}>
                            <Button variant="outline" size="sm">Detalhes</Button>
                          </Link>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Valor Total</p>
                          <p className="text-sm font-semibold">{formatarMoeda(acordo.totalAmount)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-xs text-muted-foreground">Parcelas</p>
                          <p className="text-sm font-semibold">{acordo.installments}x</p>
                        </div>
                        {(acordo as any).valorPagoAcordo > 0 && (
                          <div className="space-y-0.5">
                            <p className="text-xs text-muted-foreground">Valor Pago</p>
                            <p className="text-sm font-semibold text-green-600">{formatarMoeda((acordo as any).valorPagoAcordo)}</p>
                          </div>
                        )}
                        {(acordo as any).motivoQuebra && (
                          <div className="space-y-0.5 col-span-2">
                            <p className="text-xs text-muted-foreground">Motivo da Quebra</p>
                            <p className="text-xs">{(acordo as any).motivoQuebra}</p>
                          </div>
                        )}
                      </div>

                      {expandidos.has(acordo.id) && <ParcelasAcordo acordoId={acordo.id} />}
                    </CardContent>
                  </Card>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de Quebrar Acordo */}
      {acordoParaQuebrar && (
        <ModalQuebrarAcordo
          open={!!acordoParaQuebrar}
          onOpenChange={(v) => { if (!v) setAcordoParaQuebrar(null); }}
          acordoId={acordoParaQuebrar.id}
          parcelasPagas={acordoParaQuebrar.parcelasPagas}
          onSuccess={() => { setAcordoParaQuebrar(null); refetch(); }}
        />
      )}
    </>
  );
}
