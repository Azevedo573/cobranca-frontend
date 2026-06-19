import { useAuth } from "@/_core/hooks/useAuth";
import { getDevedorIdentificador } from "@/lib/devedorUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, User, Phone, Mail, Home, Plus, Edit, Upload, Paperclip, FileText, ExternalLink, Copy, Trash2, FileDown, Loader2, Check, QrCode, MessageCircle, Clock, CheckCircle2, XCircle, AlertCircle, Handshake, MoreHorizontal, PhoneCall, Gavel, Scale, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link, useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import { calcularValorDevido, calcularTotalMultiplasCobrancas, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import { SimuladorAcordoMultiplo } from "@/components/SimuladorAcordoMultiplo";
import { DashboardDevedorMetricas } from "@/components/DashboardDevedorMetricas";
import { TimelineTentativas } from "@/components/TimelineTentativas";
import { AcordosDevedor } from "@/components/AcordosDevedor";
import { RealizarAcordoModal } from "@/components/RealizarAcordoModal";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { NovaDividaModal } from "@/components/NovaDividaModal";
import { NovaTentativaModal } from "@/components/NovaTentativaModal";
import { GerarDocumentoModal } from "@/components/GerarDocumentoModal";
import EnviarEmailModal from "@/components/EnviarEmailModal";
import { BTGEmitirBoletoModal } from "@/components/BTGEmitirBoletoModal";
import { CustasJudiciais } from "@/components/CustasJudiciais";

export default function DevedorDetalhes() {
  const { user } = useAuth();
  const [, params] = useRoute("/devedores/:id/detalhes");
  const devedorId = params?.id ? parseInt(params.id) : null;
  const [modalDividaOpen, setModalDividaOpen] = useState(false);
  const [modalTentativaOpen, setModalTentativaOpen] = useState(false);
  const [modalDocumentoOpen, setModalDocumentoOpen] = useState(false);
  const [modalEmailOpen, setModalEmailOpen] = useState(false);
  const [modalWhatsAppOpen, setModalWhatsAppOpen] = useState(false);
  const [instanciaWhatsAppSelecionada, setInstanciaWhatsAppSelecionada] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const [gerandoBoleto, setGerandoBoleto] = useState<number | null>(null);
  const [copiadoLinhaId, setCopiadoLinhaId] = useState<number | null>(null);
  const [copiadoPixId, setCopiadoPixId] = useState<number | null>(null);
  // Cache dos dados do boleto gerado por cobrancaId
  const [dadosBoleto, setDadosBoleto] = useState<Record<number, { linhaDigitavel: string; pixCopiaCola: string | null; url: string }>>({});
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [modalAcordoOpen, setModalAcordoOpen] = useState(false);
  // BTG
  const [btgModalCobranca, setBtgModalCobranca] = useState<any | null>(null);
  const [custasOpen, setCustasOpen] = useState(false);
  const [modalEscalarOpen, setModalEscalarOpen] = useState(false);
  const [escalarAssunto, setEscalarAssunto] = useState("");
  const [escalarDescricao, setEscalarDescricao] = useState("");
  const [escalarPrioridade, setEscalarPrioridade] = useState<"baixa"|"media"|"alta"|"urgente">("media");
  const utils = trpc.useUtils();

  const escalarParaJuridicoMutation = trpc.juridicoDemandas.escalarParaJuridico.useMutation({
    onSuccess: (data) => {
      toast.success("Demanda jurídica criada com sucesso!");
      setModalEscalarOpen(false);
      setEscalarAssunto("");
      setEscalarDescricao("");
      navigate(`/admin/juridico/demanda/${data.demandaId}`);
    },
    onError: (err) => toast.error("Erro ao escalar: " + err.message),
  });
  const LIMITE_INICIAL = 5;

  const copiarTexto = (texto: string, tipo: "linha" | "pix", cobrancaId: number) => {
    navigator.clipboard.writeText(texto).then(() => {
      if (tipo === "linha") {
        setCopiadoLinhaId(cobrancaId);
        setTimeout(() => setCopiadoLinhaId(null), 2000);
        toast.success("Linha digitável copiada!");
      } else {
        setCopiadoPixId(cobrancaId);
        setTimeout(() => setCopiadoPixId(null), 2000);
        toast.success("Código Pix copiado!");
      }
    });
  };

  const gerarBoletoPDFMutation = trpc.cobrancas.gerarBoletoPDF.useMutation({
    onSuccess: (data, variables) => {
      setGerandoBoleto(null);
      setDadosBoleto(prev => ({
        ...prev,
        [variables.cobrancaId]: {
          linhaDigitavel: data.linhaDigitavel,
          pixCopiaCola: data.pixCopiaCola ?? null,
          url: data.url,
        },
      }));
      window.open(data.url, "_blank");
      toast.success("Boleto gerado com sucesso!");
    },
    onError: (err) => {
      setGerandoBoleto(null);
      toast.error("Erro ao gerar boleto: " + err.message);
    },
  });

  const { data: devedor, isLoading } = trpc.devedores.getById.useQuery(
    { id: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: instanciasWA = [] } = trpc.whatsapp.listarInstancias.useQuery();
  const { data: atendimentosDevedor = [] } = trpc.atendimento.listarAtendimentosDevedor.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

  const iniciarAtendimentoMutation = trpc.atendimento.iniciarAtendimentoDevedor.useMutation({
    onSuccess: (data) => {
      toast.success("Atendimento iniciado! Redirecionando...");
      setModalWhatsAppOpen(false);
      // Redirecionar para a Central de Atendimento com o atendimento aberto
      setTimeout(() => navigate("/atendimento"), 800);
    },
    onError: (e) => toast.error("Erro ao iniciar atendimento: " + e.message),
  });

  const { data: tentativas = [] } = trpc.tentativas.getByDevedor.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

  // Nova query unificada: cobranças normais + parcelas de acordos ativos
  const { data: cobrancasData } = trpc.cobrancas.getComAcordos.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );
  const cobrancas = cobrancasData?.cobrancas ?? [];
  const parcelasAcordoAtivas = cobrancasData?.parcelasAcordo ?? [];
  const temAcordoAtivo = cobrancasData?.temAcordoAtivo ?? false;

  const { data: condominio } = trpc.condominios.getById.useQuery(
    { id: devedor?.condominioId! },
    { enabled: !!devedor?.condominioId }
  );

  const taxas: TaxasCondominio | null = useMemo(() => {
    if (!condominio) return null;
    return {
      taxaJurosMensal: Number(condominio.taxaJurosMensal || "1.00"),
      taxaMulta: Number(condominio.taxaMulta || "2.00"),
      taxaHonorarios: Number(condominio.taxaHonorarios || "10.00"),
      correcaoMonetaria: Number(condominio.correcaoMonetaria || "0.00"),
    };
  }, [condominio]);

  // Métricas do dashboard
  const metricas = useMemo(() => {
    if (!cobrancas || !taxas) return null;

    const cobrancasAtivas = cobrancas.filter((c: any) => c.status !== "pago");
    const cobrancasPendentes = cobrancas.filter((c: any) => c.status === "pendente");
    const cobrancasPagas = cobrancas.filter((c: any) => c.status === "pago");
    const cobrancasEmAcordo = parcelasAcordoAtivas.filter((p: any) => p.status !== "pago");

    const valorOriginal = cobrancasAtivas.reduce((sum: number, c: any) => sum + (c.amount / 100), 0);
    
    let valorTotalDevido = 0;
    if (cobrancasAtivas.length > 0) {
      const breakdown = calcularTotalMultiplasCobrancas(
        cobrancasAtivas.map((c: any) => ({
          amount: c.amount / 100,  // Converter centavos para reais
          dueDate: new Date(c.dueDate),
        })),
        taxas
      );
      valorTotalDevido = breakdown.valorTotal;  // Já está em reais
    }

    const taxaRecuperacao = cobrancas.length > 0 
      ? (cobrancasPagas.length / cobrancas.length) * 100 
      : 0;

    const agora = new Date();
    const tentativasUltimos30Dias = tentativas.filter((t: any) => {
      const dataTentativa = new Date(t.attemptDate);
      const diffDias = (agora.getTime() - dataTentativa.getTime()) / (1000 * 60 * 60 * 24);
      return diffDias <= 30;
    }).length;

    let diasDesdeUltimaTentativa: number | null = null;
    if (tentativas.length > 0) {
      const ultimaTentativa = new Date(tentativas[0].attemptDate);
      diasDesdeUltimaTentativa = Math.floor((agora.getTime() - ultimaTentativa.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Calcular dias de atraso (maior atraso entre todas as cobranças)
    let diasAtraso = 0;
    cobrancasAtivas.forEach((c: any) => {
      const vencimento = new Date(c.dueDate);
      const diff = Math.floor((agora.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > diasAtraso) diasAtraso = diff;
    });

    // Tentativas sem sucesso
    const tentativasSemSucesso = tentativas.filter((t: any) => 
      t.result === "sem_resposta" || t.result === "recusa" || t.result === "recusado"
    ).length;

    return {
      valorTotalDevido,
      valorOriginal,
      numeroCobrancas: cobrancas.length,
      cobrancasPendentes: cobrancasPendentes.length,
      cobrancasEmAcordo: cobrancasEmAcordo.length,
      cobrancasPagas: cobrancasPagas.length,
      tentativasTotal: tentativas.length,
      tentativasUltimos30Dias,
      diasDesdeUltimaTentativa,
      taxaRecuperacao,
      diasAtraso,
      tentativasSemSucesso,
      temAcordoAtivo: cobrancasEmAcordo.length > 0,
    };
  }, [cobrancas, tentativas, taxas]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      ativo: { variant: "default", label: "Ativo" },
      acordo: { variant: "secondary", label: "Acordo" },
      pago: { variant: "outline", label: "Pago" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!devedor) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Devedor não encontrado</p>
          <Link href="/devedores">
            <Button className="mt-4">Voltar</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/devedores">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-primary">Dashboard do Devedor</h1>
                <p className="text-sm text-muted-foreground">{devedor.name} • Unidade {devedor.unitNumber}{devedor.bloco ? ` - Bloco ${devedor.bloco}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Primário: Realizar Acordo */}
              {user?.role !== "sindico" && (
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                  onClick={() => setModalAcordoOpen(true)}
                >
                  <Handshake className="h-4 w-4" />
                  Realizar Acordo
                </Button>
              )}

              {/* Separador visual */}
              <div className="w-px h-6 bg-border mx-1" />

              {/* Secundários: ações frequentes */}
              {user?.role !== "sindico" && (
                <Button variant="outline" size="sm" onClick={() => setModalDividaOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Nova Dívida
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setModalTentativaOpen(true)}>
                <PhoneCall className="h-4 w-4 mr-1.5" />
                Nova Tentativa
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                onClick={() => setModalWhatsAppOpen(true)}
              >
                <MessageCircle className="h-4 w-4 mr-1.5" />
                WhatsApp
              </Button>

              {/* Separador visual */}
              <div className="w-px h-6 bg-border mx-1" />

              {/* Dropdown: Mais ações */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <MoreHorizontal className="h-4 w-4" />
                    Mais
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {user?.role !== "sindico" && (
                    <DropdownMenuItem asChild>
                      <Link href={`/devedores/${devedor.id}/importar-dividas`} className="flex items-center gap-2 cursor-pointer">
                        <Upload className="h-4 w-4" />
                        Importar Dívidas
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setModalDocumentoOpen(true)} className="gap-2 cursor-pointer">
                    <FileText className="h-4 w-4" />
                    Gerar Documento
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setModalEmailOpen(true)} className="gap-2 cursor-pointer">
                    <Mail className="h-4 w-4" />
                    Enviar E-mail
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setCustasOpen(true)} className="gap-2 cursor-pointer">
                    <Gavel className="h-4 w-4" />
                    Custas Judiciais
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setEscalarAssunto(`Cobrança judicial — ${devedor.name ?? `Unidade ${devedor.unitNumber}`}`);
                      setModalEscalarOpen(true);
                    }}
                    className="gap-2 cursor-pointer text-red-600 focus:text-red-600"
                  >
                    <Scale className="h-4 w-4" />
                    Escalar para Jurídico
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/devedores/${devedor.id}/editar`} className="flex items-center gap-2 cursor-pointer">
                      <Edit className="h-4 w-4" />
                      Editar Devedor
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8 space-y-6">
        {/* Seção 1: Topo — Informações Pessoais + Métricas lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* Coluna Esquerda: Informações Pessoais */}
          <div className="lg:col-span-1 flex flex-col">
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4" />
                  Informações Pessoais
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2 flex-1 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Nome</span>
                  <span className="text-sm font-medium">{devedor.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Unidade</span>
                  <div className="flex items-center gap-1">
                    <Home className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{devedor.unitNumber}{devedor.bloco ? ` - Bloco ${devedor.bloco}` : ""}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Telefone</span>
                  <div className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{devedor.phone}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground flex-shrink-0">E-mail</span>
                  <div className="flex items-center gap-1 min-w-0">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{devedor.email}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Condomínio</span>
                  <span className="text-sm font-medium truncate max-w-[60%] text-right">
                    {(devedor as any).condominioNome ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status da Unidade</span>
                  <div>
                    {(devedor as any).statusUnidade === "ajuizado" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        <Scale className="h-3 w-3" />
                        Ajuizado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Padrão
                      </span>
                    )}
                  </div>
                </div>
                {(devedor as any).statusUnidade === "ajuizado" && (devedor as any).processoJudicial && (() => {
                  const proc = (devedor as any).processoJudicial as { numeroCNJ: string; status: string };
                  const statusLabels: Record<string, { label: string; cls: string }> = {
                    ativo:      { label: "Em andamento", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                    suspenso:   { label: "Suspenso",     cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
                    arquivado:  { label: "Finalizado",   cls: "bg-muted text-muted-foreground" },
                    encerrado:  { label: "Finalizado",   cls: "bg-muted text-muted-foreground" },
                  };
                  const s = statusLabels[proc.status] ?? { label: proc.status, cls: "bg-muted text-muted-foreground" };
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Nº do Processo</span>
                        <span className="text-xs font-mono font-medium text-right max-w-[60%] truncate" title={proc.numeroCNJ}>{proc.numeroCNJ}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status do Processo</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${s.cls}`}>{s.label}</span>
                      </div>
                    </>
                  );
                })()}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div>{getStatusBadge(devedor.status)}</div>
                </div>
              </CardContent>
            </Card>


          </div>

          {/* Coluna Direita: 4 cards de métricas em grid 2×2 + gráfico */}
          <div className="lg:col-span-2 space-y-4">
            {metricas && (
              <DashboardDevedorMetricas {...metricas} />
            )}
          </div>
        </div>

        {/* Seção 2: Abas em largura total */}
        <div>
            <Tabs defaultValue="cobrancas" className="w-full">
              <TabsList className="w-full mb-4 grid grid-cols-3">
                <TabsTrigger value="cobrancas">
                  Cobranças ({temAcordoAtivo ? parcelasAcordoAtivas.length : cobrancas.length})
                  {temAcordoAtivo && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded-full font-semibold">Acordo</span>}
                </TabsTrigger>
                <TabsTrigger value="historico">Histórico & Acordos</TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                  WhatsApp ({(atendimentosDevedor as any[]).length})
                </TabsTrigger>
              </TabsList>

              {/* ABA: Cobranças */}
              <TabsContent value="cobrancas">
                {/* Caso haja acordo parcial: exibe débitos em aberto + parcelas do acordo separadamente */}
                {temAcordoAtivo && cobrancas.length > 0 ? (
                  <div className="space-y-4">
                    {/* Bloco: Débitos em Aberto (não incluídos no acordo) */}
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">Débitos em Aberto</CardTitle>
                            <CardDescription>{cobrancas.length} cobrança(s) não incluída(s) no acordo</CardDescription>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {["todos", "pendente", "pago", "em_cobranca", "cancelado"].map((s) => (
                              <button
                                key={s}
                                onClick={() => { setFiltroStatus(s); setMostrarTodas(false); }}
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                                  filtroStatus === s
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:border-primary/50 text-muted-foreground"
                                }`}
                              >
                                {s === "todos" ? "Todas" : s === "pendente" ? "Pendentes" : s === "pago" ? "Pagas" : s === "em_cobranca" ? "Em Cobrança" : "Canceladas"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CobrancasTabela
                          cobrancas={cobrancas}
                          filtroStatus={filtroStatus}
                          mostrarTodas={mostrarTodas}
                          setMostrarTodas={setMostrarTodas}
                          limiteInicial={LIMITE_INICIAL}
                          onEmitirBtg={(cob) => setBtgModalCobranca(cob)}
                          modoBoleto={((condominio as any)?.modoBoleto || "cnab240") as "cnab240" | "api_btg"}
                        />
                      </CardContent>
                    </Card>

                    {/* Bloco: Parcelas do Acordo Ativo */}
                    <Card className="border-blue-200">
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-2">
                          <Handshake className="h-4 w-4 text-blue-600" />
                          <div>
                            <CardTitle className="text-base text-blue-800">Parcelas do Acordo Ativo</CardTitle>
                            <CardDescription>{parcelasAcordoAtivas.length} parcela(s) do acordo em andamento</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CobrancasTabela
                          cobrancas={parcelasAcordoAtivas}
                          filtroStatus="todos"
                          mostrarTodas={true}
                          setMostrarTodas={() => {}}
                          limiteInicial={parcelasAcordoAtivas.length}
                          onEmitirBtg={(cob) => setBtgModalCobranca(cob)}
                          modoBoleto={((condominio as any)?.modoBoleto || "cnab240") as "cnab240" | "api_btg"}
                        />
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  /* Caso normal: sem acordo ativo, ou acordo total (sem débitos restantes) */
                  <Card>
                    <CardHeader>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle>Cobranças</CardTitle>
                            <CardDescription>
                              {temAcordoAtivo
                                ? `${parcelasAcordoAtivas.length} parcela(s) de acordo ativo`
                                : `Total: ${cobrancas.length} cobrança(s)`}
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {["todos", "pendente", "pago", "em_cobranca", "cancelado"].map((s) => (
                            <button
                              key={s}
                              onClick={() => { setFiltroStatus(s); setMostrarTodas(false); }}
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                                filtroStatus === s
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background border-border hover:border-primary/50 text-muted-foreground"
                              }`}
                            >
                              {s === "todos" ? "Todas" : s === "pendente" ? "Pendentes" : s === "pago" ? "Pagas" : s === "em_cobranca" ? "Em Cobrança" : "Canceladas"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {temAcordoAtivo && (
                        <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                          <Handshake className="h-4 w-4 text-blue-600 shrink-0" />
                          <span>Todas as cobranças estão vinculadas a um <strong>acordo ativo</strong>. Abaixo são exibidas as parcelas do acordo.</span>
                        </div>
                      )}
                      <CobrancasTabela
                        cobrancas={temAcordoAtivo ? parcelasAcordoAtivas : cobrancas}
                        filtroStatus={filtroStatus}
                        mostrarTodas={mostrarTodas}
                        setMostrarTodas={setMostrarTodas}
                        limiteInicial={LIMITE_INICIAL}
                        onEmitirBtg={(cob) => setBtgModalCobranca(cob)}
                        modoBoleto={((condominio as any)?.modoBoleto || "cnab240") as "cnab240" | "api_btg"}
                      />
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ABA: Histórico & Acordos */}
              <TabsContent value="historico" className="space-y-6">
                <TimelineTentativas tentativas={tentativas} limite={8} />
                <BoletosPorDevedor devedorId={devedor.id} condominioId={devedor.condominioId} />
                <AcordosDevedor devedorId={devedor.id} />
              </TabsContent>


              {/* ABA: Histórico WhatsApp */}
              <TabsContent value="whatsapp" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">Histórico de Atendimentos WhatsApp</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Todos os atendimentos realizados com este devedor via WhatsApp</p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
                    onClick={() => setModalWhatsAppOpen(true)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Novo Atendimento
                  </Button>
                </div>

                {(atendimentosDevedor as any[]).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-muted/20">
                    <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum atendimento WhatsApp registrado</p>
                    <p className="text-xs text-muted-foreground mt-1">Clique em "Novo Atendimento" para iniciar uma conversa</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(atendimentosDevedor as any[]).map((at: any) => (
                      <div key={at.id} className="border rounded-lg p-4 bg-card hover:bg-accent/30 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
                              style={{ backgroundColor: at.departamentoCor || '#6366f1' }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-semibold text-primary">{at.protocolo}</span>
                                {at.departamentoNome && (
                                  <span className="text-xs text-muted-foreground">• {at.departamentoNome}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {at.iniciadoEm ? format(new Date(at.iniciadoEm), "dd/MM/yyyy HH:mm") : "-"}
                                </span>
                                {at.operadorNome && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {at.operadorNome}
                                  </span>
                                )}
                                {at.tempoAtendimento && (
                                  <span className="text-xs text-muted-foreground">{Math.round(at.tempoAtendimento / 60)} min</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {at.slaViolado === 1 && (
                              <span className="flex items-center gap-1 text-xs text-red-500">
                                <AlertCircle className="h-3.5 w-3.5" /> SLA
                              </span>
                            )}
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                              at.status === 'resolvido' ? 'bg-green-100 text-green-700' :
                              at.status === 'em_atendimento' ? 'bg-blue-100 text-blue-700' :
                              at.status === 'aguardando' ? 'bg-yellow-100 text-yellow-700' :
                              at.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {at.status === 'resolvido' && <CheckCircle2 className="h-3 w-3" />}
                              {at.status === 'em_atendimento' && <MessageCircle className="h-3 w-3" />}
                              {at.status === 'aguardando' && <Clock className="h-3 w-3" />}
                              {at.status === 'cancelado' && <XCircle className="h-3 w-3" />}
                              {at.status === 'resolvido' ? 'Resolvido' :
                               at.status === 'em_atendimento' ? 'Em Atendimento' :
                               at.status === 'aguardando' ? 'Aguardando' :
                               at.status === 'cancelado' ? 'Cancelado' : at.status}
                            </span>
                          </div>
                        </div>
                        {at.motivoFechamento && (
                          <p className="text-xs text-muted-foreground mt-2 pl-5 border-l-2 border-muted">{at.motivoFechamento}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

            </Tabs>
          </div>
      </main>

      {/* Modal de Nova Dívida */}
      <NovaDividaModal
        open={modalDividaOpen}
        onOpenChange={setModalDividaOpen}
        devedorId={devedor.id}
        condominioId={devedor.condominioId}
      />

      {/* Modal de Nova Tentativa */}
      <NovaTentativaModal
        open={modalTentativaOpen}
        onOpenChange={setModalTentativaOpen}
        devedorId={devedor.id}
        condominioId={devedor.condominioId}
      />

      {/* Modal de Gerar Documento */}
      <GerarDocumentoModal
        open={modalDocumentoOpen}
        onClose={() => setModalDocumentoOpen(false)}
        devedor={{
          id: devedor.id,
          name: devedor.name ?? "",
          cpfCnpj: devedor.cpfCnpj ?? undefined,
          unitNumber: devedor.unitNumber ?? undefined,
          bloco: devedor.bloco ?? undefined,
          condominioId: devedor.condominioId,
        }}
        cobrancas={cobrancas as any}
        nomeCondominio={condominio?.name ?? undefined}
        nomeResponsavel={user?.name ?? undefined}
      />
      {/* Modal de Envio de E-mail */}
      <EnviarEmailModal
        open={modalEmailOpen}
        onClose={() => setModalEmailOpen(false)}
        devedorId={devedor.id}
        nomeDevedor={devedor.name ?? ""}
        emailDevedor={devedor.email ?? null}
        condominioId={devedor.condominioId}
      />

      {/* Modal BTG Emitir Boleto */}
      {btgModalCobranca && devedor && (
        <BTGEmitirBoletoModal
          open={!!btgModalCobranca}
          onClose={() => setBtgModalCobranca(null)}
          cobranca={btgModalCobranca}
          devedor={devedor as any}
          onSuccess={() => {
            setBtgModalCobranca(null);
            utils.cobrancas.getComAcordos.invalidate({ devedorId: devedor.id });
          }}
        />
      )}

      {/* Modal de Realizar Acordo */}
      <RealizarAcordoModal
        open={modalAcordoOpen}
        onOpenChange={setModalAcordoOpen}
        cobrancas={cobrancas as any} // Apenas cobranças originais (sem parcelas de acordo)
        devedorId={devedor.id}
        devedorNome={devedor.name ?? ""}
        condominioId={devedor.condominioId}
        condominioNome={condominio?.name ?? ""}
        onAcordoCriado={() => { window.location.reload(); }}
      />

      {/* Modal de Iniciar Atendimento WhatsApp */}
      {modalWhatsAppOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Iniciar Atendimento WhatsApp</h2>
                <p className="text-xs text-muted-foreground">{devedor.name}</p>
              </div>
            </div>

            {/* Telefone */}
            <div className="mb-4">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefone do devedor</label>
              <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {devedor.phone || "Nenhum telefone cadastrado"}
                </span>
              </div>
              {!devedor.phone && (
                <p className="text-xs text-red-500 mt-1">Cadastre um telefone para o devedor antes de iniciar o atendimento.</p>
              )}
            </div>

            {/* Seleção de instância */}
            <div className="mb-6">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Selecionar instância WhatsApp</label>
              {instanciasWA.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma instância configurada.</p>
              ) : (
                <div className="space-y-2">
                  {(instanciasWA as any[]).map((inst: any) => (
                    <button
                      key={inst.id}
                      onClick={() => setInstanciaWhatsAppSelecionada(inst.id)}
                      className={`w-full flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${
                        instanciaWhatsAppSelecionada === inst.id
                          ? "border-green-500 bg-green-50"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        inst.status === "connected" ? "bg-green-500" : "bg-red-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{inst.name || inst.instanceName}</p>
                        <p className="text-xs text-muted-foreground">{inst.status === "connected" ? "Conectado" : "Desconectado"}</p>
                      </div>
                      {instanciaWhatsAppSelecionada === inst.id && (
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setModalWhatsAppOpen(false); setInstanciaWhatsAppSelecionada(null); }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={
                  !instanciaWhatsAppSelecionada ||
                  !devedor.phone ||
                  iniciarAtendimentoMutation.isPending
                }
                onClick={() => {
                  const tel = (devedor.phone || "").replace(/\D/g, "");
                  iniciarAtendimentoMutation.mutate({
                    devedorId: devedor.id,
                    instanciaId: instanciaWhatsAppSelecionada!,
                    telefone: tel.startsWith("55") ? tel : `55${tel}`,
                  });
                }}
              >
                {iniciarAtendimentoMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Iniciando...</>
                ) : (
                  <><MessageCircle className="h-4 w-4 mr-1" /> Iniciar Atendimento</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Escalar para Jurídico */}
      <Dialog open={modalEscalarOpen} onOpenChange={setModalEscalarOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Scale className="h-5 w-5" />
              Escalar para Jurídico
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Resumo do devedor */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800">
                <AlertTriangle className="h-4 w-4" />
                Resumo da inadimplência
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                <span className="text-muted-foreground">Devedor</span>
                <span className="font-medium">{devedor.name}</span>
                <span className="text-muted-foreground">Unidade</span>
                <span className="font-medium">{devedor.unitNumber}{devedor.bloco ? ` - Bloco ${devedor.bloco}` : ""}</span>
                <span className="text-muted-foreground">Cobranças em aberto</span>
                <span className="font-medium">{cobrancas.filter((c: any) => c.status !== "pago").length}</span>
                <span className="text-muted-foreground">Valor total devido</span>
                <span className="font-medium text-red-700">
                  {metricas ? `R$ ${metricas.valorTotalDevido.toFixed(2).replace(".", ",")}` : "—"}
                </span>
                <span className="text-muted-foreground">Tentativas sem sucesso</span>
                <span className="font-medium">{metricas?.tentativasSemSucesso ?? 0}</span>
              </div>
            </div>

            {/* Assunto */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assunto da demanda *</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ex: Cobrança judicial — Unidade 101"
                value={escalarAssunto}
                onChange={(e) => setEscalarAssunto(e.target.value)}
              />
            </div>

            {/* Prioridade */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prioridade</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={escalarPrioridade}
                onChange={(e) => setEscalarPrioridade(e.target.value as any)}
              >
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Observações adicionais</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[80px] resize-none"
                placeholder="Descreva o histórico, tentativas realizadas, motivo da escalada..."
                value={escalarDescricao}
                onChange={(e) => setEscalarDescricao(e.target.value)}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setModalEscalarOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white gap-2"
                disabled={!escalarAssunto.trim() || escalarParaJuridicoMutation.isPending}
                onClick={() => {
                  const cobrancasAbertas = cobrancas.filter((c: any) => c.status !== "pago");
                  escalarParaJuridicoMutation.mutate({
                    devedorId: devedor.id,
                    condominioId: devedor.condominioId ?? undefined,
                    nomeDevedor: devedor.name ?? `Unidade ${devedor.unitNumber}`,
                    cpfDevedor: devedor.cpfCnpj ?? undefined,
                    unidadeDevedor: `${devedor.unitNumber}${devedor.bloco ? ` - Bloco ${devedor.bloco}` : ""}`,
                    valorDivida: metricas ? Math.round(metricas.valorTotalDevido * 100) : 0,
                    qtdCobrancas: cobrancasAbertas.length,
                    assunto: escalarAssunto.trim(),
                    descricao: escalarDescricao.trim() || undefined,
                    prioridade: escalarPrioridade,
                  });
                }}
              >
                {escalarParaJuridicoMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
                ) : (
                  <><Scale className="h-4 w-4" /> Escalar para Jurídico</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Custas Judiciais */}
      <Dialog open={custasOpen} onOpenChange={setCustasOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5" />
              Custas Judiciais — {devedor.name ?? `Unidade ${devedor.unitNumber}`}
            </DialogTitle>
          </DialogHeader>
          <CustasJudiciais
            devedorId={devedor.id}
            condominioId={devedor.condominioId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Componente interno: tabela de cobranças =====
function CobrancasTabela({
  cobrancas, filtroStatus, mostrarTodas, setMostrarTodas, limiteInicial,
  onEmitirBtg, modoBoleto
}: {
  cobrancas: any[];
  filtroStatus: string;
  mostrarTodas: boolean;
  setMostrarTodas: (fn: (v: boolean) => boolean) => void;
  limiteInicial: number;
  onEmitirBtg: (cob: any) => void;
  modoBoleto?: "cnab240" | "api_btg";
}) {
  const cobFiltradas = filtroStatus === "todos" ? cobrancas : cobrancas.filter((c: any) => c.status === filtroStatus);
  const cobVisiveis = mostrarTodas ? cobFiltradas : cobFiltradas.slice(0, limiteInicial);

  // Cache de boletos gerados por parcelaId
  const [boletoParcelas, setBoletoParcelas] = useState<Record<number, { url: string; linhaDigitavel: string; pixCopiaCola?: string }>>({});
  const [copiandoParcela, setCopiandoParcela] = useState<Record<number, string | null>>({});
  const gerarPDFParcelaMutation = trpc.acordos.gerarBoletoPDFParcela.useMutation({
    onSuccess: (data: { url: string; linhaDigitavel: string; pixCopiaCola?: string }, variables: { parcelaId: number }) => {
      setBoletoParcelas(prev => ({ ...prev, [variables.parcelaId]: data }));
      toast.success("Boleto gerado com sucesso!");
    },
    onError: (err: { message: string }) => toast.error("Erro ao gerar boleto: " + err.message),
  });

  if (cobFiltradas.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">Nenhuma cobrança com este filtro.</div>;
  }

  return (
    <>
      <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Descrição</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Valor Original</TableHead>
            <TableHead className="text-orange-600">Juros</TableHead>
            <TableHead className="text-red-600">Multa</TableHead>
            <TableHead className="text-purple-600">Honorários</TableHead>
            <TableHead className="text-blue-600">Correção</TableHead>
            <TableHead>Valor Atualizado</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Boleto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cobVisiveis.map((cob: any) => {
                        // Detectar se é parcela de acordo
                        const isParcela = cob._tipo === "parcela_acordo";
                        // Usar breakdown calculado pelo backend (inclui correção BCB)
                        const breakdown = cob.breakdown || {
                          valorOriginal: cob.amount / 100,
                          juros: 0,
                          multa: 0,
                          honorarios: 0,
                          correcaoMonetaria: 0,
                          valorTotal: cob.amount / 100,
                        };
                        const descricao = isParcela
                          ? `Parcela ${cob.installmentNumber}/${cob._acordo?.installments ?? "?"} — Acordo #${cob.acordoId}`
                          : (cob.description || "-");
                        const statusLabel: Record<string, string> = {
                          pendente: "Pendente",
                          pago: "Pago",
                          atrasado: "Atrasado",
                          cancelado: "Cancelado",
                          em_cobranca: "Em Cobrança",
                          em_acordo: "Em Acordo",
                          acordo: "Acordo",
                        };
                        return (
                          <TableRow key={`${isParcela ? "p" : "c"}-${cob.id}`} className={isParcela ? "bg-blue-50/40" : ""}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-1.5">
                                {isParcela && <Handshake className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                                <span>{descricao}</span>
                              </div>
                            </TableCell>
                            <TableCell>{cob.dueDate ? format(new Date(new Date(cob.dueDate).getTime() + new Date(cob.dueDate).getTimezoneOffset() * 60000), "dd/MM/yyyy") : "-"}</TableCell>
                            <TableCell>{formatarMoeda(breakdown.valorOriginal)}</TableCell>
                            <TableCell className="text-orange-600">{formatarMoeda(breakdown.juros)}</TableCell>
                            <TableCell className="text-red-600">{formatarMoeda(breakdown.multa)}</TableCell>
                            <TableCell className="text-purple-600">{formatarMoeda(breakdown.honorarios)}</TableCell>
                            <TableCell className="text-blue-600">{formatarMoeda(breakdown.correcaoMonetaria)}</TableCell>
                            <TableCell className="font-semibold">{formatarMoeda(breakdown.valorTotal)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={cob.status === "pago" ? "outline" : cob.status === "atrasado" ? "destructive" : "default"}
                                className={`text-xs ${isParcela && cob.status === "pendente" ? "bg-blue-100 text-blue-800 border-blue-300" : ""}`}
                              >
                                {statusLabel[cob.status] ?? cob.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {/* Boleto: apenas para parcelas de acordo */}
                              {!isParcela ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : modoBoleto === "api_btg" ? (
                                // Modo API BTG
                                cob.btgBankSlipUrl ? (
                                  <div className="flex flex-col gap-1">
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full" onClick={() => window.open(cob.btgBankSlipUrl, "_blank")}>
                                      <FileDown className="h-3 w-3 mr-1" /> Boleto BTG
                                    </Button>
                                    {cob.btgPixCopiaECola && (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full border-green-300 text-green-700 hover:bg-green-50" onClick={() => { navigator.clipboard.writeText(cob.btgPixCopiaECola); toast.success("PIX copiado!"); }}>
                                        <QrCode className="h-3 w-3 mr-1" /> Copiar PIX
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full" onClick={() => onEmitirBtg(cob)}>
                                    <QrCode className="h-3 w-3 mr-1" /> Emitir BTG
                                  </Button>
                                )
                              ) : (
                                // Modo CNAB 240 (padrão)
                                cob.nossoNumero ? (
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs text-muted-foreground font-mono">{cob.nossoNumero}</span>
                                    <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50 w-fit">
                                      {cob.statusRemessa === "retorno_recebido" ? "Confirmado" : cob.remessaId ? "Na remessa" : "Aguardando remessa"}
                                    </Badge>
                                    {/* Botões de boleto para parcelas com nossoNumero */}
                                    {cob.status !== "cancelado" && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        {!boletoParcelas[cob.id] ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                                            onClick={() => gerarPDFParcelaMutation.mutate({ parcelaId: cob.id })}
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
                                              className="h-6 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                                              onClick={() => window.open(boletoParcelas[cob.id].url, '_blank')}
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              <span className="ml-1">Abrir</span>
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="h-6 text-xs px-2"
                                              onClick={async () => {
                                                await navigator.clipboard.writeText(boletoParcelas[cob.id].linhaDigitavel);
                                                setCopiandoParcela(prev => ({ ...prev, [cob.id]: 'linha' }));
                                                toast.success('Linha digitável copiada!');
                                                setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [cob.id]: null })), 2000);
                                              }}
                                            >
                                              {copiandoParcela[cob.id] === 'linha' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                              <span className="ml-1">Linha</span>
                                            </Button>
                                            {boletoParcelas[cob.id]?.pixCopiaCola && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-6 text-xs px-2 border-green-300 text-green-700 hover:bg-green-50"
                                                onClick={async () => {
                                                  await navigator.clipboard.writeText(boletoParcelas[cob.id].pixCopiaCola!);
                                                  setCopiandoParcela(prev => ({ ...prev, [cob.id]: 'pix' }));
                                                  toast.success('PIX copiado!');
                                                  setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [cob.id]: null })), 2000);
                                                }}
                                              >
                                                {copiandoParcela[cob.id] === 'pix' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <QrCode className="h-3 w-3" />}
                                                <span className="ml-1">PIX</span>
                                              </Button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">Aguardando nosso número</span>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
        </TableBody>
      </Table>
      </div>
      {cobFiltradas.length > limiteInicial && (
        <div className="mt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => setMostrarTodas(v => !v)}>
            {mostrarTodas ? "Ver menos" : `Ver todas as ${cobFiltradas.length} cobranças`}
          </Button>
        </div>
      )}
    </>
  );
}

// ===== Componente BoletosPorDevedor =====
function BoletosPorDevedor({ devedorId, condominioId }: { devedorId: number; condominioId: number }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCobrancaId, setUploadingCobrancaId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: boletos = [], isLoading } = trpc.cnab.listarBoletosPorDevedor.useQuery({ devedorId });

  const uploadMutation = trpc.cnab.uploadBoleto.useMutation({
    onSuccess: () => {
      utils.cnab.listarBoletosPorDevedor.invalidate({ devedorId });
      toast.success("Boleto anexado com sucesso!");
      setUploadingCobrancaId(null);
    },
    onError: (err) => {
      toast.error("Erro ao enviar boleto: " + err.message);
      setUploadingCobrancaId(null);
    },
  });

  const deletarMutation = trpc.cnab.deletarBoleto.useMutation({
    onSuccess: () => {
      utils.cnab.listarBoletosPorDevedor.invalidate({ devedorId });
      toast.success("Boleto removido");
    },
    onError: (err) => toast.error("Erro ao remover: " + err.message),
  });

  const handleFileChange = (cobrancaId: number) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 10MB.");
      return;
    }
    setUploadingCobrancaId(cobrancaId);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      uploadMutation.mutate({
        cobrancaId,
        condominioId,
        nomeArquivo: file.name,
        conteudoBase64: base64,
        tamanhoBytes: file.size,
        mimeType: file.type || "application/pdf",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const formatarTamanho = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatarTipoCobranca = (tipo: string) => {
    const tipos: Record<string, string> = {
      condominio: "Condomínio",
      salao_jogos: "Salão de Jogos",
      churrasqueira: "Churrasqueira",
      cota_extra: "Cota Extra",
      multa: "Multa",
      outros: "Outros",
    };
    return tipos[tipo] ?? tipo;
  };

  const statusCobrancaColor = (status: string) => {
    if (status === "pago") return "text-green-600";
    if (status === "pendente") return "text-amber-600";
    if (status === "em_acordo" || status === "acordo") return "text-blue-600";
    if (status === "judicial") return "text-red-600";
    return "text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Boletos Anexados
            </CardTitle>
            <CardDescription>
              PDFs de boletos de todas as cobranças deste devedor
            </CardDescription>
          </div>
          {boletos.length > 0 && (
            <Badge variant="secondary">{boletos.length} boleto{boletos.length > 1 ? "s" : ""}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : boletos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Paperclip className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum boleto anexado ainda.</p>
            <p className="text-xs mt-1">Acesse os detalhes de uma cobrança para anexar boletos.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {boletos.map((b: any) => (
              <div
                key={b.id}
                className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                {/* Ícone PDF */}
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-red-600" />
                  </div>
                </div>

                {/* Informações */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{b.nomeArquivo}</p>
                  {b.cobranca && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatarTipoCobranca(b.cobranca.tipoCobranca)}
                        {b.cobranca.monthReference ? ` · ${b.cobranca.monthReference}` : ""}
                      </span>
                      {b.cobranca.dueDate && (
                        <span className="text-xs text-muted-foreground">
                          · Venc. {format(new Date(b.cobranca.dueDate), "dd/MM/yyyy")}
                        </span>
                      )}
                      <span className={`text-xs font-medium ${statusCobrancaColor(b.cobranca.status)}`}>
                        · {b.cobranca.status}
                      </span>
                      {b.cobranca.amount && (
                        <span className="text-xs text-muted-foreground">
                          · {formatarMoeda(b.cobranca.amount / 100)}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {b.tamanhoBytes ? formatarTamanho(b.tamanhoBytes) + " · " : ""}
                    {format(new Date(b.createdAt), "dd/MM/yyyy HH:mm")}
                    {b.uploadedByName ? ` · ${b.uploadedByName}` : ""}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    title="Copiar link para envio rápido"
                    onClick={() => {
                      navigator.clipboard.writeText(b.urlS3);
                      toast.success("Link copiado! Cole no WhatsApp ou e-mail.");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <a href={b.urlS3} target="_blank" rel="noopener noreferrer">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Abrir boleto">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    title="Remover boleto"
                    onClick={() => deletarMutation.mutate({ id: b.id })}
                    disabled={deletarMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
