import { useState, useRef, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
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
import {
  Download, Upload, FileText, CheckCircle2, XCircle, Building2, Send, MailCheck, Clock, Handshake, Settings2,
  BanknoteIcon, RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useState as useStateInner } from "react";
import { ChevronDown, ChevronRight, AlertCircle, Lock } from "lucide-react";

// ─── Componente: Visão completa de acordos com todas as parcelas ────────────────
function AcordosParcelasView() {
  const { data: acordos, isLoading } = trpc.cnab.listarAcordosComTodasParcelas.useQuery({});
  const [expandidos, setExpandidos] = useStateInner<Set<number>>(new Set());

  const toggleExpand = (id: number) => {
    setExpandidos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v / 100);

  const statusBadge = (sl: string, motivo: string | null) => {
    switch (sl) {
      case "disponivel":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Disponível</Badge>;
      case "em_remessa":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs"><FileText className="h-3 w-3 mr-1" />Em Remessa</Badge>;
      case "enviada_banco":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"><MailCheck className="h-3 w-3 mr-1" />Enviada ao Banco</Badge>;
      case "liquidada":
        return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Liquidada</Badge>;
      case "vencida":
        return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs"><AlertCircle className="h-3 w-3 mr-1" />Vencida</Badge>;
      case "cancelada":
        return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Cancelada</Badge>;
      case "aguardando_liberacao":
        return (
          <div className="flex flex-col gap-0.5">
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs w-fit"><Lock className="h-3 w-3 mr-1" />Aguardando Liberação</Badge>
            {motivo && <span className="text-xs text-muted-foreground italic">{motivo}</span>}
          </div>
        );
      default:
        return <Badge variant="outline" className="text-xs">{sl}</Badge>;
    }
  };

  if (isLoading) return (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
    </div>
  );

  if (!acordos || acordos.length === 0) return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        <Handshake className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
        <p className="font-medium">Nenhum acordo ativo encontrado</p>
        <p className="text-xs mt-1">Acordos ativos com parcelas aparecerão aqui</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{acordos.length}</strong> acordo(s) ativo(s)
        </p>
        <div className="flex gap-2 text-xs">
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Disponível</Badge>
          <Badge className="bg-amber-100 text-amber-700 border-amber-200">Aguardando</Badge>
          <Badge className="bg-purple-100 text-purple-700 border-purple-200">Em Remessa</Badge>
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">Enviada</Badge>
          <Badge className="bg-green-100 text-green-700 border-green-200">Liquidada</Badge>
          <Badge className="bg-red-100 text-red-700 border-red-200">Vencida</Badge>
        </div>
      </div>

      {acordos.map(acordo => {
        const isOpen = expandidos.has(acordo.acordoId);
        const progresso = acordo.totalParcelas > 0 ? Math.round((acordo.parcelasPagas / acordo.totalParcelas) * 100) : 0;
        return (
          <Card key={acordo.acordoId} className={`transition-all ${
            acordo.parcelasVencidas > 0 ? "border-red-200" :
            acordo.parcelasDisponiveis > 0 ? "border-emerald-200" : ""
          }`}>
            {/* Cabeçalho do acordo */}
            <CardHeader
              className="cursor-pointer select-none py-4"
              onClick={() => toggleExpand(acordo.acordoId)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {isOpen
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">Acordo #{acordo.acordoId}</span>
                      <span className="text-muted-foreground text-sm">— {acordo.devedorNome}</span>
                      <Badge variant="outline" className="text-xs">{acordo.condominioNome}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {acordo.parcelasPagas}/{acordo.totalParcelas} parcelas pagas
                      </span>
                      {acordo.parcelasVencidas > 0 && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />{acordo.parcelasVencidas} vencida(s)
                        </Badge>
                      )}
                      {acordo.parcelasDisponiveis > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                          {acordo.parcelasDisponiveis} disponível(is)
                        </Badge>
                      )}
                      {acordo.parcelasEmRemessa > 0 && (
                        <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">
                          {acordo.parcelasEmRemessa} em remessa
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">{fmt(acordo.agreedAmount ?? acordo.totalAmount ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Valor do acordo</p>
                  {/* Barra de progresso */}
                  <div className="mt-1.5 w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{progresso}% concluído</p>
                </div>
              </div>
            </CardHeader>

            {/* Tabela de parcelas (expansível) */}
            {isOpen && (
              <CardContent className="pt-0 pb-4">
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-center w-16">Parcela</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Nosso Nº</TableHead>
                        <TableHead>Pagamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acordo.parcelas.map(p => (
                        <TableRow
                          key={p.id}
                          className={`${
                            p.statusLiberacao === "liquidada" ? "bg-green-50/50" :
                            p.statusLiberacao === "vencida" ? "bg-red-50/50" :
                            p.statusLiberacao === "aguardando_liberacao" ? "bg-amber-50/30" :
                            p.statusLiberacao === "em_remessa" || p.statusLiberacao === "enviada_banco" ? "bg-purple-50/30" :
                            ""
                          }`}
                        >
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {p.installmentNumber}ª/{acordo.totalParcelas}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className={p.statusLiberacao === "vencida" ? "text-red-600 font-semibold" : ""}>
                              {format(new Date(p.dueDate), "dd/MM/yyyy")}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {fmt(p.amount)}
                          </TableCell>
                          <TableCell>
                            {statusBadge(p.statusLiberacao, p.motivoBloqueio)}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {p.nossoNumero || <span className="italic text-muted-foreground/50">a gerar</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.paymentDate ? format(new Date(p.paymentDate), "dd/MM/yyyy") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

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

  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<number[]>([]);
  const [resultadoRemessa, setResultadoRemessa] = useState<{ nomeArquivo: string; conteudo: string; totalTitulos: number; valorTotal: number } | null>(null);
  const [resultadoRetorno, setResultadoRetorno] = useState<ResultadoRetornoNovo | null>(null);
  const [retornoConteudo, setRetornoConteudo] = useState("");
  const [retornoNomeArquivo, setRetornoNomeArquivo] = useState("");
  const [retornoResultadoOpen, setRetornoResultadoOpen] = useState(false);
  const [remessaEnviada, setRemessaEnviada] = useState(false);
  const [parcelasSelecionadas, setParcelasSelecionadas] = useState<number[]>([]);
  const [resultadoRemessaAcordos, setResultadoRemessaAcordos] = useState<{ nomeArquivo: string; conteudo: string; totalParcelas: number; remessaId: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [itensRetornoRetornoId, setItensRetornoRetornoId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: cobrancas, isLoading: loadingCobrancas } = trpc.cobrancas.list.useQuery(
    { condominioId: 0 }
  );

  const { data: remessas, isLoading: loadingRemessas } = trpc.cnab.listarRemessas.useQuery(
    { condominioId: 0 }
  );

  const { data: retornos, isLoading: loadingRetornos } = trpc.cnab.listarRetornos.useQuery(
    { condominioId: 0 }
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
      setItensRetornoRetornoId(data.retornoId);
      setRetornoResultadoOpen(true);
      setRetornoConteudo("");
      setRetornoNomeArquivo("");
      utils.cnab.listarRetornos.invalidate();
      utils.cobrancas.list.invalidate();
      toast.success(`Retorno processado: ${data.pagos} títulos pagos`);
    },
    onError: (err) => toast.error("Erro ao processar retorno: " + err.message),
  });

  const { data: itensRetorno } = trpc.cnab.listarItensRetorno.useQuery(
    { retornoId: itensRetornoRetornoId!, condominioId: 0 },
    { enabled: !!itensRetornoRetornoId }
  );

  const { data: parcelasParaRemessa, isLoading: loadingParcelas } = trpc.cnab.listarParcelasParaRemessaGlobal.useQuery({});

  const gerarRemessaAcordosMutation = trpc.cnab.gerarRemessaAcordosGlobal.useMutation({
    onSuccess: (data) => {
      setResultadoRemessaAcordos(data);
      setParcelasSelecionadas([]);
      utils.cnab.listarRemessas.invalidate();
      utils.cnab.listarParcelasParaRemessaGlobal.invalidate();
      toast.success(`Remessa de acordos gerada: ${data.totalParcelas} parcela(s)`);
    },
    onError: (err) => toast.error("Erro ao gerar remessa de acordos: " + err.message),
  });

  const handleGerarRemessaAcordos = () => {
    if (parcelasSelecionadas.length === 0) {
      toast.error("Selecione pelo menos uma parcela");
      return;
    }
    gerarRemessaAcordosMutation.mutate({
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
    const ids = parcelasParaRemessa.map(p => p.parcelaId);
    if (parcelasSelecionadas.length === ids.length) {
      setParcelasSelecionadas([]);
    } else {
      setParcelasSelecionadas(ids);
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

  // Badge de status da parcela de acordo (controle de remessa)
  const getStatusParcelaBadge = (statusRemessa: string | null | undefined) => {
    switch (statusRemessa) {
      case "disponivel":
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Disponível</Badge>;
      case "em_remessa":
      case "remessa_gerada":
        return <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs"><FileText className="h-3 w-3 mr-1" />Em Remessa</Badge>;
      case "enviado":
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs"><MailCheck className="h-3 w-3 mr-1" />Enviada ao Banco</Badge>;
      case "liquidado":
      case "pago":
        return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Liquidada</Badge>;
      case "rejeitado":
        return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs"><XCircle className="h-3 w-3 mr-1" />Rejeitada</Badge>;
      case "cancelado":
        return <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Cancelada</Badge>;
      default:
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Disponível</Badge>;
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
    gerarRemessaMutation.mutate({
      condominioId: user?.condominioId ?? 0,
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
    processarRetornoMutation.mutate({
      condominioId: 0, // 0 = global: busca em todos os condomínios
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

        {/* ABA REMESSA — seleção global de parcelas de acordos */}
        <TabsContent value="remessa" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-primary" />
                    Gerar Remessa CNAB 240 — Parcelas de Acordos
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Selecione parcelas de <strong>qualquer acordo e devedor</strong> para compor um único arquivo CNAB 240.
                    Apenas parcelas com status <strong>Disponível para Remessa</strong> podem ser incluídas.
                  </CardDescription>
                </div>

              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Legenda de status */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="font-medium text-muted-foreground">Status:</span>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Disponível</Badge>
                <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">Em Remessa</Badge>
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Enviada ao Banco</Badge>
                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Liquidada</Badge>
                <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Rejeitada</Badge>
                <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Cancelada</Badge>
              </div>

              {loadingParcelas ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                </div>
              ) : !parcelasParaRemessa || parcelasParaRemessa.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
                  <p className="font-medium">Nenhuma parcela disponível para remessa</p>
                  <p className="text-xs mt-1">Não há parcelas de acordo disponíveis para remessa no momento</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={parcelasSelecionadas.length === parcelasParaRemessa.length && parcelasParaRemessa.length > 0}
                        onCheckedChange={toggleTodasParcelas}
                      />
                      <span className="text-sm text-muted-foreground">
                        <strong className="text-foreground">{parcelasSelecionadas.length}</strong> de {parcelasParaRemessa.length} selecionadas
                        {parcelasSelecionadas.length > 0 && (
                          <span className="ml-2 text-primary font-medium">
                            — {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                              parcelasParaRemessa
                                .filter(p => parcelasSelecionadas.includes(p.parcelaId))
                                .reduce((s, p) => s + p.amount, 0) / 100
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                    <Button
                      onClick={handleGerarRemessaAcordos}
                      disabled={parcelasSelecionadas.length === 0 || gerarRemessaAcordosMutation.isPending}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      {gerarRemessaAcordosMutation.isPending ? "Gerando..." : `Gerar Remessa (${parcelasSelecionadas.length})`}
                    </Button>
                  </div>

                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Devedor</TableHead>
                          <TableHead>Condomínio</TableHead>
                          <TableHead>Acordo</TableHead>
                          <TableHead className="text-center">Parcela</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead>Status Parcela</TableHead>
                          <TableHead>Nosso Nº</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parcelasParaRemessa.map((p) => {
                          const isSelected = parcelasSelecionadas.includes(p.parcelaId);
                          const isVencida = new Date(p.dueDate) < new Date();
                          return (
                            <TableRow
                              key={p.parcelaId}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/30"
                              }`}
                              onClick={() => toggleParcela(p.parcelaId)}
                            >
                              <TableCell onClick={e => e.stopPropagation()}>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleParcela(p.parcelaId)}
                                />
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {p.devedorNome || `Dev. #${p.devedorId}`}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {(p as any).condominioNome || `Cond. #${p.condominioId}`}
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
                                <span className={isVencida ? "text-red-600 font-semibold" : ""}>
                                  {format(new Date(p.dueDate), "dd/MM/yyyy")}
                                  {isVencida && <span className="ml-1 text-xs">(vencida)</span>}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.amount / 100)}
                              </TableCell>
                              <TableCell>
                                {getStatusParcelaBadge(p.statusRemessa)}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">
                                {p.nossoNumero || <span className="italic text-muted-foreground/60">a gerar</span>}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Resultado da remessa gerada */}
          {resultadoRemessaAcordos && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-purple-700 font-semibold">
                      <FileText className="h-5 w-5" />
                      Remessa gerada com sucesso!
                    </div>
                    <p className="text-sm text-purple-600 mt-1">
                      {resultadoRemessaAcordos.totalParcelas} parcela(s) incluída(s) — status atualizado para <strong>Em Remessa</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{resultadoRemessaAcordos.nomeArquivo}</p>
                  </div>
                  <Button onClick={handleDownloadRemessaAcordos} className="bg-purple-600 hover:bg-purple-700">
                    <Download className="mr-2 h-4 w-4" />
                    Baixar Arquivo CNAB
                  </Button>
                </div>
                <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Baixe o arquivo e envie ao BTG Pactual. O retorno bancário atualizará automaticamente o status das parcelas.
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ABA ACORDOS — visão completa de todas as parcelas por acordo */}
        <TabsContent value="acordos" className="space-y-4 mt-4">
          <AcordosParcelasView />
        </TabsContent>

        {/* ABA RETORNO */}
        <TabsContent value="retorno" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Processar Arquivo de Retorno
              </CardTitle>
              <CardDescription>
                Faça upload do arquivo de retorno CNAB 240 para dar baixa automática nos boletos pagos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drag and drop zone */}
              <div
                className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : retornoNomeArquivo ? "border-green-400 bg-green-50" : "hover:border-primary"
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (!file) return;
                  setRetornoNomeArquivo(file.name);
                  const reader = new FileReader();
                  reader.onload = (ev) => setRetornoConteudo(ev.target?.result as string);
                  reader.readAsText(file, "latin1");
                }}
              >
                {retornoNomeArquivo ? (
                  <div className="space-y-2">
                    <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                    <p className="font-semibold text-green-700">{retornoNomeArquivo}</p>
                    <p className="text-xs text-muted-foreground">Arquivo pronto para processamento</p>
                    <Button
                      size="sm" variant="ghost"
                      className="text-xs h-7"
                      onClick={(e) => { e.stopPropagation(); setRetornoNomeArquivo(""); setRetornoConteudo(""); }}
                    >
                      Trocar arquivo
                    </Button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="font-medium text-base">Arraste o arquivo aqui ou clique para selecionar</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Formatos aceitos: .ret, .txt, .240 (CNAB 240 FEBRABAN)
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
                disabled={!retornoConteudo || processarRetornoMutation.isPending}
                className="w-full h-11 text-base"
              >
                {processarRetornoMutation.isPending ? (
                  <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Processando...</>
                ) : (
                  <><BanknoteIcon className="mr-2 h-4 w-4" /> Processar Retorno e Dar Baixa</>
                )}
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
                      <div key={r.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.nomeArquivo}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatarData(r.createdAt)} — {r.totalTitulos} títulos — {formatarMoeda(r.valorTotal)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={r.status === "processado" ? "default" : "secondary"}>
                            {r.status}
                          </Badge>
                          {r.urlArquivo ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 gap-1"
                              onClick={async () => {
                                try {
                                  const resp = await fetch(r.urlArquivo!);
                                  const blob = await resp.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = r.nomeArquivo;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch {
                                  toast.error("Erro ao baixar o arquivo");
                                }
                              }}
                            >
                              <Download className="h-3 w-3" />
                              <span className="text-xs">Baixar</span>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 px-2 gap-1" disabled title="Arquivo não disponível">
                              <Download className="h-3 w-3" />
                              <span className="text-xs">Baixar</span>
                            </Button>
                          )}
                        </div>
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
                        <div className="flex items-center gap-2 shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          {r.urlArquivo && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 gap-1"
                              onClick={async () => {
                                try {
                                  const resp = await fetch(r.urlArquivo!);
                                  const blob = await resp.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = r.nomeArquivo;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch {
                                  toast.error("Erro ao baixar o arquivo");
                                }
                              }}
                            >
                              <Download className="h-3 w-3" />
                              <span className="text-xs">Baixar</span>
                            </Button>
                          )}
                        </div>
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
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              Retorno Processado com Sucesso
            </DialogTitle>
          </DialogHeader>
          {resultadoRetorno && (
            <div className="space-y-5">
              {/* Cards de resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{resultadoRetorno.totalTitulos}</p>
                </Card>
                <Card className="p-3 text-center bg-blue-50 border-blue-200">
                  <p className="text-xs text-blue-600">Entradas</p>
                  <p className="text-2xl font-bold text-blue-700">{resultadoRetorno.entradas}</p>
                </Card>
                <Card className="p-3 text-center bg-green-50 border-green-200">
                  <p className="text-xs text-green-600">Pagos</p>
                  <p className="text-2xl font-bold text-green-700">{resultadoRetorno.pagos}</p>
                </Card>
                <Card className="p-3 text-center bg-orange-50 border-orange-200">
                  <p className="text-xs text-orange-600">Cancelados</p>
                  <p className="text-2xl font-bold text-orange-700">{resultadoRetorno.cancelados}</p>
                </Card>
                <Card className="p-3 text-center bg-red-50 border-red-200">
                  <p className="text-xs text-red-600">Não encontrados</p>
                  <p className="text-2xl font-bold text-red-700">{resultadoRetorno.naoEncontrados}</p>
                </Card>
              </div>

              {resultadoRetorno.valorTotalPago > 0 && (
                <div className="text-center py-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-muted-foreground">Valor Total Baixado</p>
                  <p className="text-3xl font-bold text-green-600">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(resultadoRetorno.valorTotalPago / 100)}
                  </p>
                </div>
              )}

              {/* Tabela de detalhes por título */}
              {itensRetorno && itensRetorno.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Detalhes por Título</p>
                  <div className="max-h-64 overflow-y-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Nosso Nº</TableHead>
                          <TableHead className="text-xs">Pagador</TableHead>
                          <TableHead className="text-xs">Ocorrência</TableHead>
                          <TableHead className="text-xs">Data Crédito</TableHead>
                          <TableHead className="text-xs text-right">Vl. Título</TableHead>
                          <TableHead className="text-xs text-right">Juros Mora</TableHead>
                          <TableHead className="text-xs text-right">Desconto</TableHead>
                          <TableHead className="text-xs text-right">Abatimento</TableHead>
                          <TableHead className="text-xs text-right">IOF</TableHead>
                          <TableHead className="text-xs text-right">Vl. Pago</TableHead>
                          <TableHead className="text-xs text-right">Vl. Líquido</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itensRetorno.map((item: any) => (
                          <TableRow key={item.id}>
                            <TableCell className="text-xs font-mono">{item.nossoNumero}</TableCell>
                            <TableCell className="text-xs">{item.nomePagador || "-"}</TableCell>
                            <TableCell className="text-xs">{item.descOcorrencia || item.descMovimento || "-"}</TableCell>
                            <TableCell className="text-xs">
                              {item.dataCredito ? format(new Date(item.dataCredito), "dd/MM/yy") :
                               item.dataOcorrencia ? format(new Date(item.dataOcorrencia), "dd/MM/yy") : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.valorTitulo > 0 ? formatarMoeda(item.valorTitulo) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.jurosMora > 0 ? formatarMoeda(item.jurosMora) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.desconto > 0 ? formatarMoeda(item.desconto) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.abatimento > 0 ? formatarMoeda(item.abatimento) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.iof > 0 ? formatarMoeda(item.iof) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right font-semibold">
                              {item.valorPago > 0 ? formatarMoeda(item.valorPago) : "-"}
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {item.valorLiquido > 0 ? formatarMoeda(item.valorLiquido) : "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {item.statusProcessamento === "processado" ? (
                                <Badge className="bg-green-100 text-green-700 border-green-200 text-xs h-5">
                                  {item.statusNovo === "pago" ? "Baixado" :
                                   item.statusNovo === "em_cobranca" ? "Confirmado" :
                                   item.statusNovo === "cancelado" ? "Cancelado" : "Processado"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-red-600 border-red-300 text-xs h-5">Não encontrado</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setRetornoResultadoOpen(false); setItensRetornoRetornoId(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
