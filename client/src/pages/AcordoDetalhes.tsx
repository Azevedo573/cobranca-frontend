import React, { useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  HandshakeIcon,
  ArrowLeft,
  DollarSign,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  FileText,
  MailCheck,
  Copy,
  ExternalLink,
  Loader2,
  Download,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { HistoricoConsolidacoes } from "@/components/HistoricoConsolidacoes";

export default function AcordoDetalhes() {
  const { user } = useAuth();
  const [, params] = useRoute("/acordos/:id");
  const acordoId = Number(params?.id);
  const [boletoParcelas, setBoletoParcelas] = useState<Record<number, { url: string; linhaDigitavel: string; pixCopiaCola: string | null }>>({});
  const [copiandoParcela, setCopiandoParcela] = useState<Record<number, 'linha' | 'pix' | null>>({});

  const utils = trpc.useUtils();
  const [relatorioUrl, setRelatorioUrl] = useState<string | null>(null);

  // Buscar dados do acordo
  const { data: acordo, isLoading: loadingAcordo } = trpc.acordos.getById.useQuery(
    { id: acordoId },
    { enabled: !!acordoId }
  );

  // Buscar dados do condomínio para verificar o billingIssuer
  const { data: condominio } = trpc.condominios.getById.useQuery(
    { id: acordo?.condominioId ?? 0 },
    { enabled: !!acordo?.condominioId }
  );

  // Mutation para gerar relatório para administradora
  const gerarRelatorioMutation = trpc.acordos.gerarRelatorioAdministradora.useMutation({
    onSuccess: (data) => {
      setRelatorioUrl(data.url);
      window.open(data.url, '_blank');
      toast.success(`Relatório gerado para ${data.nomeEmissor}!`);
    },
    onError: (err) => toast.error('Erro ao gerar relatório: ' + err.message),
  });

  // Derivar se o emissor é administradora/outro (não emissão própria)
  const isAdministradora = condominio?.billingIssuer !== 'emissao_propria';
  const nomeEmissor = condominio?.billingIssuer === 'outro' && condominio?.customBillingIssuer
    ? condominio.customBillingIssuer
    : 'Administradora';

  // Buscar parcelas do acordo
  const { data: parcelas, isLoading: loadingParcelas } = trpc.acordos.getParcelas.useQuery(
    { acordoId },
    { enabled: !!acordoId }
  );

  // Mutation para gerar PDF de parcela
  const gerarPDFParcelaMutation = trpc.acordos.gerarBoletoPDFParcela.useMutation({
    onSuccess: (data, variables) => {
      setBoletoParcelas(prev => ({
        ...prev,
        [variables.parcelaId]: {
          url: data.url,
          linhaDigitavel: data.linhaDigitavel,
          pixCopiaCola: data.pixCopiaCola ?? null,
        },
      }));
      window.open(data.url, '_blank');
    },
    onError: (err) => toast.error('Erro ao gerar PDF: ' + err.message),
  });

  const copiarLinhaParcela = async (parcelaId: number) => {
    const boleto = boletoParcelas[parcelaId];
    if (!boleto) return;
    await navigator.clipboard.writeText(boleto.linhaDigitavel);
    setCopiandoParcela(prev => ({ ...prev, [parcelaId]: 'linha' }));
    toast.success('Linha digitável copiada!');
    setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcelaId]: null })), 2000);
  };

  const copiarPixParcela = async (parcelaId: number) => {
    const boleto = boletoParcelas[parcelaId];
    if (!boleto?.pixCopiaCola) return;
    await navigator.clipboard.writeText(boleto.pixCopiaCola);
    setCopiandoParcela(prev => ({ ...prev, [parcelaId]: 'pix' }));
    toast.success('Pix copia e cola copiado!');
    setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcelaId]: null })), 2000);
  };

  // Mutation para marcar parcela como paga
  const marcarPagaMutation = trpc.acordos.updateParcela.useMutation({
    onSuccess: () => {
      // Invalidar queries para atualizar dados
      utils.acordos.getParcelas.invalidate({ acordoId });
      utils.acordos.getById.invalidate({ id: acordoId });
    },
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value / 100); // Converter centavos para reais
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const getStatusBadge = (status: string) => {
    const config = {
      pendente: { variant: "outline" as const, icon: Clock, color: "text-yellow-600" },
      pago: { variant: "secondary" as const, icon: CheckCircle2, color: "text-green-600" },
      atrasado: { variant: "destructive" as const, icon: XCircle, color: "text-red-600" },
    };
    const { variant, icon: Icon, color } = config[status as keyof typeof config] || config.pendente;
    
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className={`h-3 w-3 ${color}`} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handleMarcarPaga = async (parcelaId: number) => {
    if (!confirm("Deseja marcar esta parcela como paga?")) return;
    
    try {
      await marcarPagaMutation.mutateAsync({
        id: parcelaId,
        status: "pago",
        paymentDate: new Date(),
      });
      alert("Parcela marcada como paga com sucesso!");
    } catch (error) {
      alert("Erro ao marcar parcela como paga. Tente novamente.");
    }
  };

  // Calcular estatísticas
  const parcelasPagas = parcelas?.filter((p) => p.status === "pago").length || 0;
  const totalParcelas = parcelas?.length || 0;
  const progressoPorcentagem = totalParcelas > 0 ? (parcelasPagas / totalParcelas) * 100 : 0;
  const valorPago = parcelas?.filter((p) => p.status === "pago").reduce((acc, p) => acc + p.amount, 0) || 0;
  const valorRestante = (acordo?.agreedAmount || 0) - valorPago;

  if (loadingAcordo || loadingParcelas) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando detalhes do acordo...</p>
        </div>
      </div>
    );
  }

  if (!acordo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Acordo não encontrado</h2>
          <p className="text-muted-foreground mb-4">O acordo solicitado não existe ou foi removido.</p>
          <Link href="/acordos">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Acordos
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/acordos">
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <HandshakeIcon className="h-8 w-8 text-primary" />
                Detalhes do Acordo #{acordo.id}
              </h1>
              <p className="text-muted-foreground mt-1">
                Visualização completa e gestão de parcelas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Botão Gerar Relatório — visível apenas quando o emissor não é emissão própria */}
            {isAdministradora && (
              <div className="flex items-center gap-2">
                {relatorioUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={() => window.open(relatorioUrl, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Relatório
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    onClick={() => gerarRelatorioMutation.mutate({ acordoId })}
                    disabled={gerarRelatorioMutation.isPending}
                  >
                    {gerarRelatorioMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4 mr-2" />
                    )}
                    {gerarRelatorioMutation.isPending ? 'Gerando...' : `Relatório para ${nomeEmissor}`}
                  </Button>
                )}
              </div>
            )}
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Badge variant="outline" className="capitalize">
              {user?.role}
            </Badge>
          </div>
        </div>

        {/* Informações do Acordo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações do Acordo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Devedor</p>
                <p className="font-semibold text-lg">Devedor ID: {acordo.devedorId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Valor Original</p>
                <p className="font-semibold text-lg text-red-600">
                  {formatCurrency(acordo.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Valor Acordado</p>
                <p className="font-semibold text-lg text-green-600">
                  {formatCurrency(acordo.agreedAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Primeiro Pagamento</p>
                <p className="font-semibold text-lg">
                  {formatDate(acordo.firstPaymentDate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Número de Parcelas</p>
                <p className="font-semibold text-lg">{acordo.installments}x</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Frequência</p>
                <p className="font-semibold text-lg capitalize">{acordo.paymentFrequency}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Status</p>
                <Badge variant={acordo.status === "ativo" ? "default" : acordo.status === "pago" ? "secondary" : "destructive"}>
                  {acordo.status.charAt(0).toUpperCase() + acordo.status.slice(1)}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Data de Criação</p>
                <p className="font-semibold text-lg">{formatDate(acordo.createdAt)}</p>
              </div>
            </div>
            {acordo.notes && (
              <div className="mt-6 p-4 bg-muted/50 rounded-md">
                <p className="text-sm font-medium mb-1">Observações:</p>
                <p className="text-sm text-muted-foreground">{acordo.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Progresso do Acordo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Progresso do Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {parcelasPagas} de {totalParcelas} parcelas pagas
                </span>
                <span className="text-sm font-medium">{progressoPorcentagem.toFixed(0)}%</span>
              </div>
              <Progress value={progressoPorcentagem} className="h-3" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Valor Pago</CardDescription>
                  <CardTitle className="text-2xl text-green-600">
                    {formatCurrency(valorPago)}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Valor Restante</CardDescription>
                  <CardTitle className="text-2xl text-orange-600">
                    {formatCurrency(valorRestante)}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Parcelas Pendentes</CardDescription>
                  <CardTitle className="text-2xl text-blue-600">
                    {totalParcelas - parcelasPagas}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Parcelas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Parcelas do Acordo
            </CardTitle>
            <CardDescription>
              Histórico completo de pagamentos e status de cada parcela
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Boleto</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parcelas && parcelas.length > 0 ? (
                    parcelas.map((parcela) => (
                      <TableRow key={parcela.id}>
                        <TableCell className="font-medium">
                          #{parcela.installmentNumber}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(parcela.amount)}
                        </TableCell>
                        <TableCell>{formatDate(parcela.dueDate)}</TableCell>
                        <TableCell>
                          {parcela.paymentDate ? (
                            <span className="text-green-600 font-medium">
                              {formatDate(parcela.paymentDate)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(parcela.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {(parcela as any).statusRemessa === "remessa_gerada" && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs gap-1">
                                <FileText className="h-3 w-3" />Remessa Gerada
                              </Badge>
                            )}
                            {(parcela as any).statusRemessa === "enviado" && (
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1">
                                <MailCheck className="h-3 w-3" />Enviado
                              </Badge>
                            )}
                            {(parcela as any).statusRemessa === "retorno_recebido" && (
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
                                <CheckCircle2 className="h-3 w-3" />Confirmado
                              </Badge>
                            )}
                            {(parcela as any).nossoNumero && (
                              <p className="text-xs font-mono text-muted-foreground">{(parcela as any).nossoNumero}</p>
                            )}
                            {!(parcela as any).statusRemessa && (
                              <span className="text-xs text-muted-foreground italic">Aguardando remessa</span>
                            )}
                            {/* Botões de boleto — só para parcelas com nossoNumero */}
                            {(parcela as any).nossoNumero && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {!boletoParcelas[parcela.id] ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-xs px-2"
                                    onClick={() => gerarPDFParcelaMutation.mutate({ parcelaId: parcela.id })}
                                    disabled={gerarPDFParcelaMutation.isPending}
                                  >
                                    {gerarPDFParcelaMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <FileText className="h-3 w-3" />
                                    )}
                                    <span className="ml-1">PDF</span>
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2"
                                      onClick={() => window.open(boletoParcelas[parcela.id].url, '_blank')}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      <span className="ml-1">Abrir</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                                      onClick={() => copiarLinhaParcela(parcela.id)}
                                    >
                                      {copiandoParcela[parcela.id] === 'linha' ? (
                                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                      <span className="ml-1">Linha</span>
                                    </Button>
                                  </>
                                )}
                                {/* Botão Pix — visível assim que o retorno D+1 for processado (Bolepix) */}
                                {(boletoParcelas[parcela.id]?.pixCopiaCola || (parcela as any).pixCopiaCola) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-xs px-2 border-green-300 text-green-700 hover:bg-green-50"
                                    onClick={async () => {
                                      const pix = boletoParcelas[parcela.id]?.pixCopiaCola || (parcela as any).pixCopiaCola;
                                      await navigator.clipboard.writeText(pix);
                                      setCopiandoParcela(prev => ({ ...prev, [parcela.id]: 'pix' }));
                                      toast.success('Pix copia e cola copiado!');
                                      setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcela.id]: null })), 2000);
                                    }}
                                  >
                                    {copiandoParcela[parcela.id] === 'pix' ? (
                                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                    <span className="ml-1">Pix</span>
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {parcela.status !== "pago" && user?.role !== "sindico" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarcarPaga(parcela.id)}
                              disabled={marcarPagaMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Marcar como Paga
                            </Button>
                          )}
                          {parcela.status === "pago" && (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Pago
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nenhuma parcela encontrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Histórico de Consolidações */}
        <HistoricoConsolidacoes acordoId={acordoId} />
      </div>
    </div>
  );
}
