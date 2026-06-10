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
import { ArrowLeft, User, Phone, Mail, Home, Plus, Edit, Upload, Paperclip, FileText, ExternalLink, Copy, Trash2, FileDown, Loader2, Check, QrCode, MessageCircle, Clock, CheckCircle2, XCircle, AlertCircle, Handshake, MoreHorizontal, PhoneCall } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useRoute, useLocation } from "wouter";
import { format } from "date-fns";
import { calcularValorDevido, calcularTotalMultiplasCobrancas, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import { SimuladorAcordoMultiplo } from "@/components/SimuladorAcordoMultiplo";
import { DashboardDevedorMetricas } from "@/components/DashboardDevedorMetricas";
import { GraficoDistribuicaoCobrancas } from "@/components/GraficoDistribuicaoCobrancas";
import { TimelineTentativas } from "@/components/TimelineTentativas";
import { AcordosDevedor } from "@/components/AcordosDevedor";
import { RealizarAcordoModal } from "@/components/RealizarAcordoModal";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { NovaDividaModal } from "@/components/NovaDividaModal";
import { NovaTentativaModal } from "@/components/NovaTentativaModal";
import { GerarDocumentoModal } from "@/components/GerarDocumentoModal";
import EnviarEmailModal from "@/components/EnviarEmailModal";

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
  const [dadosBoleto, setDadosBoleto] = useState<Record<number, { linhaDigitavel: string; pixCopiaCola: string | null; url: string }>>({})
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const [modalAcordoOpen, setModalAcordoOpen] = useState(false);
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

  const { data: cobrancas = [] } = trpc.cobrancas.getComCalculos.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

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
    const cobrancasEmAcordo = cobrancas.filter((c: any) => c.status === "em_acordo");
    const cobrancasPagas = cobrancas.filter((c: any) => c.status === "pago");

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
            {cobrancas.length > 0 && (
              <GraficoDistribuicaoCobrancas cobrancas={cobrancas as any} taxas={taxas} />
            )}
          </div>
        </div>

        {/* Seção 2: Abas em largura total */}
        <div>
            <Tabs defaultValue="cobrancas" className="w-full">
              <TabsList className="w-full mb-4 grid grid-cols-3">
                <TabsTrigger value="cobrancas">Cobranças ({cobrancas.length})</TabsTrigger>
                <TabsTrigger value="historico">Histórico & Acordos</TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                  WhatsApp ({(atendimentosDevedor as any[]).length})
                </TabsTrigger>
              </TabsList>

              {/* ABA: Cobranças */}
              <TabsContent value="cobrancas">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Cobranças</CardTitle>
                      <CardDescription>Total: {cobrancas.length} cobrança(s)</CardDescription>
                    </div>
                  </div>
                  {/* Filtros de status */}
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
                  gerandoBoleto={gerandoBoleto}
                  setGerandoBoleto={setGerandoBoleto}
                  dadosBoleto={dadosBoleto}
                  gerarBoletoPDFMutation={gerarBoletoPDFMutation}
                  copiadoLinhaId={copiadoLinhaId}
                  copiadoPixId={copiadoPixId}
                  copiarTexto={copiarTexto}
                />
              </CardContent>
            </Card>
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

      {/* Modal de Realizar Acordo */}
      <RealizarAcordoModal
        open={modalAcordoOpen}
        onOpenChange={setModalAcordoOpen}
        cobrancas={cobrancas as any}
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
    </div>
  );
}

// ===== Componente interno: tabela de cobranças =====
function CobrancasTabela({
  cobrancas, filtroStatus, mostrarTodas, setMostrarTodas, limiteInicial,
  gerandoBoleto, setGerandoBoleto, dadosBoleto, gerarBoletoPDFMutation,
  copiadoLinhaId, copiadoPixId, copiarTexto
}: {
  cobrancas: any[];
  filtroStatus: string;
  mostrarTodas: boolean;
  setMostrarTodas: (fn: (v: boolean) => boolean) => void;
  limiteInicial: number;
  gerandoBoleto: number | null;
  setGerandoBoleto: (id: number | null) => void;
  dadosBoleto: Record<number, { linhaDigitavel: string; pixCopiaCola: string | null; url: string }>;
  gerarBoletoPDFMutation: any;
  copiadoLinhaId: number | null;
  copiadoPixId: number | null;
  copiarTexto: (texto: string, tipo: "linha" | "pix", cobrancaId: number) => void;
}) {
  const cobFiltradas = filtroStatus === "todos" ? cobrancas : cobrancas.filter((c: any) => c.status === filtroStatus);
  const cobVisiveis = mostrarTodas ? cobFiltradas : cobFiltradas.slice(0, limiteInicial);

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
            <TableHead className="hidden xl:table-cell">Valor Original</TableHead>
            <TableHead className="hidden xl:table-cell">Juros</TableHead>
            <TableHead className="hidden xl:table-cell">Multa</TableHead>
            <TableHead className="hidden xl:table-cell">Honorários</TableHead>
            <TableHead className="hidden xl:table-cell">Correção</TableHead>
            <TableHead>Valor Atualizado</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Boleto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cobVisiveis.map((cob: any) => {
                        // Usar breakdown calculado pelo backend (inclui correção BCB)
                        const breakdown = cob.breakdown || {
                          valorOriginal: cob.amount / 100,
                          juros: 0,
                          multa: 0,
                          honorarios: 0,
                          correcaoMonetaria: 0,
                          valorTotal: cob.amount / 100,
                        };
                        return (
                          <TableRow key={cob.id}>
                            <TableCell className="font-medium">{cob.description || "-"}</TableCell>
                            <TableCell>{format(new Date(cob.dueDate), "dd/MM/yyyy")}</TableCell>
                            <TableCell>{formatarMoeda(breakdown.valorOriginal)}</TableCell>
                            <TableCell className="text-orange-600">{formatarMoeda(breakdown.juros)}</TableCell>
                            <TableCell className="text-red-600">{formatarMoeda(breakdown.multa)}</TableCell>
                            <TableCell className="text-purple-600">{formatarMoeda(breakdown.honorarios)}</TableCell>
                            <TableCell className="text-blue-600">{formatarMoeda(breakdown.correcaoMonetaria)}</TableCell>
                            <TableCell className="font-semibold">{formatarMoeda(breakdown.valorTotal)}</TableCell>
                            <TableCell>
                              <Badge variant={cob.status === "pago" ? "outline" : "default"} className="text-xs">
                                {cob.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {cob.nossoNumero ? (
                                <div className="flex flex-col gap-1">
                                  {/* Botão PDF */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs w-full"
                                    disabled={gerandoBoleto === cob.id}
                                    onClick={() => {
                                      if (dadosBoleto[cob.id]) {
                                        window.open(dadosBoleto[cob.id].url, "_blank");
                                      } else {
                                        setGerandoBoleto(cob.id);
                                        gerarBoletoPDFMutation.mutate({ cobrancaId: cob.id });
                                      }
                                    }}
                                  >
                                    {gerandoBoleto === cob.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    ) : (
                                      <FileDown className="h-3 w-3 mr-1" />
                                    )}
                                    {dadosBoleto[cob.id] ? "Abrir PDF" : "Gerar PDF"}
                                  </Button>

                                  {/* Botão Copiar Linha Digitável */}
                                  {dadosBoleto[cob.id] ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                                      onClick={() => copiarTexto(dadosBoleto[cob.id].linhaDigitavel, "linha", cob.id)}
                                    >
                                      {copiadoLinhaId === cob.id ? (
                                        <Check className="h-3 w-3 mr-1 text-green-600" />
                                      ) : (
                                        <Copy className="h-3 w-3 mr-1" />
                                      )}
                                      {copiadoLinhaId === cob.id ? "Copiado!" : "Copiar Linha"}
                                    </Button>
                                  ) : null}

                                  {/* Botão Copiar Pix — usa o Bolepix do banco (retorno D+1) ou o gerado ao criar PDF */}
                                  {(dadosBoleto[cob.id]?.pixCopiaCola || (cob as any).pixCopiaCola) ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-xs w-full border-green-300 text-green-700 hover:bg-green-50"
                                      onClick={() => copiarTexto(
                                        dadosBoleto[cob.id]?.pixCopiaCola || (cob as any).pixCopiaCola,
                                        "pix",
                                        cob.id
                                      )}
                                    >
                                      {copiadoPixId === cob.id ? (
                                        <Check className="h-3 w-3 mr-1 text-green-600" />
                                      ) : (
                                        <QrCode className="h-3 w-3 mr-1" />
                                      )}
                                      {copiadoPixId === cob.id ? "Copiado!" : "Copiar Pix"}
                                    </Button>
                                  ) : null}

                                  {!dadosBoleto[cob.id] && !(cob as any).pixCopiaCola && (
                                    <span className="text-xs text-muted-foreground text-center">
                                      Gere o PDF para copiar
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">Sem remessa</span>
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
