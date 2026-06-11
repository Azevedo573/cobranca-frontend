import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import {
  Download, Upload, FileText, CheckCircle2, XCircle, Building2, AlertTriangle, Send, MailCheck, Clock, Handshake, Settings2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface ResultadoRetornoNovo {
  retornoId: number;
  totalTitulos: number;
  entradas: number;
  pagos: number;
  cancelados: number;
  naoEncontrados: number;
  valorTotalPago: number;
  dataGeracao: string;
  horaGeracao: string;
}

interface TituloRetorno {
  nossoNumero: string;
  cobrancaIdEmpresa: string;
  codigoOcorrencia: string;
  descricaoOcorrencia: string;
  dataOcorrencia: string;
  dataPagamento: string;
  valorPago: number;
  valorTarifa: number;
  valorJuros: number;
  devedorNome: string;
  devedorCpfCnpj: string;
  processado: boolean;
  cobrancaId?: number;
}

export default function CNAB240() {
  const { user } = useAuth();
  const { condominioId, condominios, selectedCondominioId, setSelectedCondominioId } = useAdminCondominio();
  const effectiveCondominioId = user?.role === "admin" ? condominioId : user?.condominioId;

  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<number[]>([]);
  const [resultadoRemessa, setResultadoRemessa] = useState<{ nomeArquivo: string; conteudo: string; totalTitulos: number; valorTotal: number } | null>(null);
  const [resultadoRetorno, setResultadoRetorno] = useState<ResultadoRetornoNovo | null>(null);
  const [retornoConteudo, setRetornoConteudo] = useState("");
  const [retornoNomeArquivo, setRetornoNomeArquivo] = useState("");
  const [retornoResultadoOpen, setRetornoResultadoOpen] = useState(false);
  const [remessaEnviada, setRemessaEnviada] = useState(false);
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState<number[]>([]);
  const [resultadoRemessaAcordos, setResultadoRemessaAcordos] = useState<{ nomeArquivo: string; conteudo: string; totalParcelas: number; remessaId: number } | null>(null);
  const [diasAVencer, setDiasAVencer] = useState(30);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: cobrancas, isLoading: loadingCobrancas } = trpc.cobrancas.list.useQuery(
    { condominioId: effectiveCondominioId ?? 0 },
    { enabled: !!effectiveCondominioId }
  );

  const { data: remessas, isLoading: loadingRemessas } = trpc.cnab.listarRemessas.useQuery(
    { condominioId: effectiveCondominioId ?? 0 },
    { enabled: !!effectiveCondominioId }
  );

  const { data: retornos, isLoading: loadingRetornos } = trpc.cnab.listarRetornos.useQuery(
    { condominioId: effectiveCondominioId ?? 0 },
    { enabled: !!effectiveCondominioId }
  );

  const gerarRemessaMutation = trpc.cnab.gerarRemessa.useMutation({
    onSuccess: (data) => {
      setResultadoRemessa(data);
      setRemessaEnviada(false); // reset para novo ciclo
      utils.cnab.listarRemessas.invalidate();
      utils.cobrancas.list.invalidate(); // atualiza status na tabela
      toast.success(`Remessa gerada: ${data.totalTitulos} títulos — status atualizado para "Remessa Gerada"`);
    },
    onError: (err) => toast.error("Erro ao gerar remessa: " + err.message),
  });

  const marcarEnviadoMutation = trpc.cnab.marcarComoEnviado.useMutation({
    onSuccess: (data) => {
      setRemessaEnviada(true);
      utils.cobrancas.list.invalidate();
      toast.success(`${data.updated} cobranças marcadas como enviadas ao banco`);
    },
    onError: (err) => toast.error("Erro ao marcar como enviado: " + err.message),
  });

  const processarRetornoMutation = trpc.cnab.processarRetorno.useMutation({
    onSuccess: (data) => {
      setResultadoRetorno(data);
      setRetornoResultadoOpen(true);
      utils.cnab.listarRetornos.invalidate();
      utils.cobrancas.list.invalidate();
      toast.success(`Retorno processado: ${data.pagos} títulos pagos`);
    },
    onError: (err) => toast.error("Erro ao processar retorno: " + err.message),
  });

  const { data: parcelasParaRemessa, isLoading: loadingParcelas } = trpc.cnab.listarParcelasParaRemessa.useQuery(
    { condominioId: effectiveCondominioId ?? 0, diasAVencer },
    { enabled: !!effectiveCondominioId }
  );

  const gerarRemessaAcordosMutation = trpc.cnab.gerarRemessaAcordos.useMutation({
    onSuccess: (data) => {
      setResultadoRemessaAcordos(data);
      setParcelasSelecionadas([]);
      utils.cnab.listarRemessas.invalidate();
      utils.cnab.listarParcelasParaRemessa.invalidate();
      toast.success(`Remessa de acordos gerada: ${data.totalParcelas} parcela(s)`);
    },
    onError: (err) => toast.error("Erro ao gerar remessa de acordos: " + err.message),
  });

  const handleGerarRemessaAcordos = () => {
    if (parcelasSelecionadas.length === 0) {
      toast.error("Selecione pelo menos uma parcela");
      return;
    }
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio");
      return;
    }
    gerarRemessaAcordosMutation.mutate({
      condominioId: effectiveCondominioId,
      parcelaIds: parcelasSelecionadas,
    });
  };

  const handleDownloadRemessaAcordos = () => {
    if (!resultadoRemessaAcordos) return;
    const blob = new Blob([resultadoRemessaAcordos.conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultadoRemessaAcordos.nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleParcela = (id: number) => {
    setParcelasSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTodasParcelas = () => {
    if (!parcelasParaRemessa) return;
    if (parcelasSelecionadas.length === parcelasParaRemessa.length) {
      setParcelasSelecionadas([]);
    } else {
      setParcelasSelecionadas(parcelasParaRemessa.map(p => p.parcelaId));
    }
  };

  const cobrancasPendentes = cobrancas?.filter(c =>
    c.status === "pendente" || c.status === "em_cobranca"
  ) || [];

  // Cobranças com remessa gerada mas ainda não confirmadas como enviadas
  // Derivado diretamente da listagem — persiste mesmo após recarregar a página
  const cobrancasAguardandoEnvio = cobrancas?.filter(c =>
    (c as any).statusRemessa === "remessa_gerada"
  ) || [];

  const handleConfirmarEnvio = () => {
    const ids = cobrancasAguardandoEnvio.map(c => c.id);
    if (ids.length === 0) {
      toast.error("Nenhuma cobrança com status 'Remessa Gerada' encontrada");
      return;
    }
    marcarEnviadoMutation.mutate({ cobrancaIds: ids });
  };

  const getStatusRemessaBadge = (statusRemessa: string | null | undefined) => {
    switch (statusRemessa) {
      case "remessa_gerada":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200"><FileText className="h-3 w-3 mr-1" />Remessa Gerada</Badge>;
      case "enviado":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><MailCheck className="h-3 w-3 mr-1" />Enviado</Badge>;
      case "retorno_recebido":
        return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Retorno Recebido</Badge>;
      default:
        return <Badge variant="outline" className="text-amber-600 border-amber-300"><Clock className="h-3 w-3 mr-1" />Não Enviado</Badge>;
    }
  };

  const toggleCobranca = (id: number) => {
    setCobrancasSelecionadas(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTodas = () => {
    if (cobrancasSelecionadas.length === cobrancasPendentes.length) {
      setCobrancasSelecionadas([]);
    } else {
      setCobrancasSelecionadas(cobrancasPendentes.map(c => c.id));
    }
  };

  const handleGerarRemessa = () => {
    if (cobrancasSelecionadas.length === 0) {
      toast.error("Selecione pelo menos uma cobrança");
      return;
    }
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio");
      return;
    }
    gerarRemessaMutation.mutate({
      condominioId: effectiveCondominioId,
      cobrancaIds: cobrancasSelecionadas,
    });
  };

  const handleDownloadRemessa = () => {
    if (!resultadoRemessa) return;
    const blob = new Blob([resultadoRemessa.conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultadoRemessa.nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRetornoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRetornoNomeArquivo(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setRetornoConteudo(ev.target?.result as string);
    reader.readAsText(file, "ISO-8859-1");
  };

  const handleProcessarRetorno = () => {
    if (!retornoConteudo) {
      toast.error("Selecione o arquivo de retorno");
      return;
    }
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio");
      return;
    }
    processarRetornoMutation.mutate({
      condominioId: effectiveCondominioId,
      nomeArquivo: retornoNomeArquivo,
      conteudo: retornoConteudo,
    });
  };

  const formatarData = (d: Date | string) =>
    format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });

  const formatarMoeda = (centavos: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Remessa CNAB 240
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Geração de remessas e processamento de retornos bancários
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {user?.role === "admin" && setSelectedCondominioId && (
            <AdminCondominioSelector
              condominios={condominios}
              selectedId={selectedCondominioId}
              onSelect={setSelectedCondominioId}
            />
          )}
          <Link href="/admin/configuracao-boleto">
            <Button variant="outline" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Configuração CNAB
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="remessa">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="remessa">
            <Send className="h-4 w-4 mr-2" />
            Remessa
          </TabsTrigger>
          <TabsTrigger value="acordos">
            <Handshake className="h-4 w-4 mr-2" />
            Acordos
          </TabsTrigger>
          <TabsTrigger value="retorno">
            <Download className="h-4 w-4 mr-2" />
            Retorno
          </TabsTrigger>
          <TabsTrigger value="historico">
            <FileText className="h-4 w-4 mr-2" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* ABA REMESSA */}
        <TabsContent value="remessa" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Gerar Arquivo de Remessa</CardTitle>
              <CardDescription>
                Selecione as cobranças pendentes para incluir no arquivo CNAB 240
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!effectiveCondominioId ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
                  <p>Selecione um condomínio para continuar</p>
                </div>
              ) : loadingCobrancas ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                </div>
              ) : cobrancasPendentes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  <p>Não há cobranças pendentes para remessa</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={cobrancasSelecionadas.length === cobrancasPendentes.length}
                        onCheckedChange={toggleTodas}
                      />
                      <span className="text-sm text-muted-foreground">
                        {cobrancasSelecionadas.length} de {cobrancasPendentes.length} selecionadas
                      </span>
                    </div>
                    <Button
                      onClick={handleGerarRemessa}
                      disabled={cobrancasSelecionadas.length === 0 || gerarRemessaMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {gerarRemessaMutation.isPending ? "Gerando..." : "Gerar Remessa"}
                    </Button>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Devedor</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Remessa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cobrancasPendentes.map((cob) => (
                          <TableRow
                            key={cob.id}
                            className={cobrancasSelecionadas.includes(cob.id) ? "bg-primary/5" : ""}
                          >
                            <TableCell>
                              <Checkbox
                                checked={cobrancasSelecionadas.includes(cob.id)}
                                onCheckedChange={() => toggleCobranca(cob.id)}
                              />
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              Dev. #{cob.devedorId}
                            </TableCell>
                            <TableCell className="text-sm">{cob.description || "-"}</TableCell>
                            <TableCell className="text-sm">
                              {cob.dueDate ? format(new Date(cob.dueDate), "dd/MM/yyyy") : "-"}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {formatarMoeda(cob.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{cob.status}</Badge>
                            </TableCell>
                            <TableCell>
                              {getStatusRemessaBadge((cob as any).statusRemessa)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Seção persistente: cobranças aguardando confirmação de envio (visível mesmo após recarregar) */}
          {cobrancasAguardandoEnvio.length > 0 && !resultadoRemessa && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-purple-700 font-semibold">
                      <FileText className="h-5 w-5" />
                      {cobrancasAguardandoEnvio.length} cobrança{cobrancasAguardandoEnvio.length > 1 ? "s" : ""} aguardando confirmação de envio
                    </div>
                    <p className="text-sm text-purple-600 mt-1">
                      Remessa gerada, mas o envio ao banco ainda não foi confirmado.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={handleConfirmarEnvio}
                    disabled={marcarEnviadoMutation.isPending}
                  >
                    <MailCheck className="mr-2 h-4 w-4" />
                    {marcarEnviadoMutation.isPending ? "Marcando..." : "Confirmar Envio ao Banco"}
                  </Button>
                </div>
                <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Clique em "Confirmar Envio ao Banco" após enviar o arquivo ao BTG Pactual para avançar o status para Enviado.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Resultado da remessa gerada */}
          {resultadoRemessa && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-purple-700 font-semibold">
                      <FileText className="h-5 w-5" />
                      Arquivo de remessa gerado!
                    </div>
                    <p className="text-sm text-purple-600 mt-1">
                      {resultadoRemessa.totalTitulos} títulos — {formatarMoeda(resultadoRemessa.valorTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{resultadoRemessa.nomeArquivo}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">
                        <FileText className="h-3 w-3 mr-1" />Status: Remessa Gerada
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={handleDownloadRemessa} className="bg-purple-600 hover:bg-purple-700">
                      <Download className="mr-2 h-4 w-4" />
                      Baixar Arquivo
                    </Button>
                    {!remessaEnviada ? (
                      <Button
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={handleConfirmarEnvio}
                        disabled={marcarEnviadoMutation.isPending || cobrancasAguardandoEnvio.length === 0}
                      >
                        <MailCheck className="mr-2 h-4 w-4" />
                        {marcarEnviadoMutation.isPending ? "Marcando..." : "Confirmar Envio ao Banco"}
                      </Button>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1.5">
                        <MailCheck className="h-3.5 w-3.5 mr-1.5" />
                        Enviado ao banco
                      </Badge>
                    )}
                  </div>
                </div>
                {!remessaEnviada && (
                  <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Baixe o arquivo e envie ao BTG Pactual. Após o envio, clique em "Confirmar Envio ao Banco" para avançar o status para Enviado.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ABA ACORDOS */}
        <TabsContent value="acordos" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Handshake className="h-5 w-5 text-primary" />
                Parcelas de Acordo — Gerar Remessa
              </CardTitle>
              <CardDescription>
                Selecione as parcelas de acordos ativos para incluir no arquivo CNAB 240 e registrar os boletos no BTG Pactual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filtro de dias a vencer */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-muted-foreground">Mostrar parcelas com vencimento nos próximos</span>
                <div className="flex gap-2">
                  {[7, 15, 30, 60, 90].map(d => (
                    <button
                      key={d}
                      onClick={() => setDiasAVencer(d)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        diasAVencer === d
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary"
                      }`}
                    >
                      {d} dias
                    </button>
                  ))}
                </div>
              </div>

              {!effectiveCondominioId ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
                  <p>Selecione um condomínio para continuar</p>
                </div>
              ) : loadingParcelas ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                </div>
              ) : !parcelasParaRemessa || parcelasParaRemessa.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  <p>Nenhuma parcela de acordo pendente nos próximos {diasAVencer} dias</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={parcelasSelecionadas.length === parcelasParaRemessa.length && parcelasParaRemessa.length > 0}
                        onCheckedChange={toggleTodasParcelas}
                      />
                      <span className="text-sm text-muted-foreground">
                        {parcelasSelecionadas.length} de {parcelasParaRemessa.length} selecionadas
                      </span>
                    </div>
                    <Button
                      onClick={handleGerarRemessaAcordos}
                      disabled={parcelasSelecionadas.length === 0 || gerarRemessaAcordosMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {gerarRemessaAcordosMutation.isPending ? "Gerando..." : "Gerar Remessa"}
                    </Button>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Devedor</TableHead>
                          <TableHead>Acordo</TableHead>
                          <TableHead className="text-center">Parcela</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status Boleto</TableHead>
                          <TableHead>Nosso Nº</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parcelasParaRemessa.map((p) => (
                          <TableRow
                            key={p.parcelaId}
                            className={parcelasSelecionadas.includes(p.parcelaId) ? "bg-primary/5" : ""}
                          >
                            <TableCell>
                              <Checkbox
                                checked={parcelasSelecionadas.includes(p.parcelaId)}
                                onCheckedChange={() => toggleParcela(p.parcelaId)}
                              />
                            </TableCell>
                            <TableCell className="text-sm font-medium">
                              {p.devedorNome || `Dev. #${p.devedorId}`}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              Acordo #{p.acordoId}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs">
                                {p.installmentNumber}ª
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              <span className={new Date(p.dueDate) < new Date() ? "text-red-600 font-medium" : ""}>
                                {format(new Date(p.dueDate), "dd/MM/yyyy")}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.amount / 100)}
                            </TableCell>
                            <TableCell>
                              {getStatusRemessaBadge(p.statusRemessa)}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {p.nossoNumero || <span className="italic">a gerar</span>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Resultado da remessa de acordos */}
          {resultadoRemessaAcordos && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-purple-700 font-semibold">
                      <FileText className="h-5 w-5" />
                      Remessa de acordos gerada!
                    </div>
                    <p className="text-sm text-purple-600 mt-1">
                      {resultadoRemessaAcordos.totalParcelas} parcela(s) incluída(s)
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{resultadoRemessaAcordos.nomeArquivo}</p>
                  </div>
                  <Button onClick={handleDownloadRemessaAcordos} className="bg-purple-600 hover:bg-purple-700">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Arquivo
                  </Button>
                </div>
                <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Baixe o arquivo e envie ao BTG Pactual. O retorno confirmará os boletos registrados.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ABA RETORNO */}
        <TabsContent value="retorno" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Processar Arquivo de Retorno</CardTitle>
              <CardDescription>
                Faça upload do arquivo de retorno CNAB 240 recebido do BTG Pactual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {retornoNomeArquivo ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-6 w-6 text-primary" />
                    <span className="font-medium">{retornoNomeArquivo}</span>
                  </div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium">Clique para selecionar o arquivo de retorno</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Arquivos .ret, .txt ou .240 (CNAB 240 padrão Febraban)
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ret,.txt,.240,.RET,.TXT"
                className="hidden"
                onChange={handleRetornoFileChange}
              />

              <Button
                onClick={handleProcessarRetorno}
                disabled={!retornoConteudo || !effectiveCondominioId || processarRetornoMutation.isPending}
                className="w-full"
              >
                {processarRetornoMutation.isPending ? "Processando..." : "Processar Retorno"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA HISTÓRICO */}
        <TabsContent value="historico" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Remessas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Remessas Enviadas</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRemessas ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </div>
                ) : !remessas || remessas.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">
                    Nenhuma remessa gerada
                  </p>
                ) : (
                  <div className="space-y-2">
                    {remessas.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{r.nomeArquivo}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatarData(r.createdAt)} — {r.totalTitulos} títulos — {formatarMoeda(r.valorTotal)}
                          </p>
                        </div>
                        <Badge variant={r.status === "processado" ? "default" : "secondary"}>
                          {r.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Retornos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Retornos Processados</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingRetornos ? (
                  <div className="text-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
                  </div>
                ) : !retornos || retornos.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">
                    Nenhum retorno processado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {retornos.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{r.nomeArquivo}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatarData(r.createdAt)} — {r.titulosPagos} pagos / {r.titulosRejeitados} rejeitados
                          </p>
                          <p className="text-xs text-green-600 font-medium">
                            {formatarMoeda(r.valorTotalPago)} recebido
                          </p>
                        </div>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog: Resultado do Retorno */}
      <Dialog open={retornoResultadoOpen} onOpenChange={setRetornoResultadoOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultado do Processamento de Retorno</DialogTitle>
          </DialogHeader>
          {resultadoRetorno && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{resultadoRetorno.totalTitulos}</p>
                </Card>
                <Card className="p-4 text-center bg-blue-50 border-blue-200">
                  <p className="text-xs text-blue-600">Entradas</p>
                  <p className="text-2xl font-bold text-blue-700">{resultadoRetorno.entradas}</p>
                </Card>
                <Card className="p-4 text-center bg-green-50 border-green-200">
                  <p className="text-xs text-green-600">Pagos</p>
                  <p className="text-2xl font-bold text-green-700">{resultadoRetorno.pagos}</p>
                </Card>
                <Card className="p-4 text-center bg-red-50 border-red-200">
                  <p className="text-xs text-red-600">Não encontrados</p>
                  <p className="text-2xl font-bold text-red-700">{resultadoRetorno.naoEncontrados}</p>
                </Card>
              </div>
              {resultadoRetorno.valorTotalPago > 0 && (
                <div className="text-center py-2">
                  <p className="text-sm text-muted-foreground">Valor Total Recebido</p>
                  <p className="text-2xl font-bold text-green-600">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resultadoRetorno.valorTotalPago / 100)}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRetornoResultadoOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
