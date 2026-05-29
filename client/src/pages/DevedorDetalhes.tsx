import { useAuth } from "@/_core/hooks/useAuth";
import { getDevedorIdentificador } from "@/lib/devedorUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ArrowLeft, User, Phone, Mail, Home, Plus, Edit, Upload, Paperclip, FileText, ExternalLink, Copy, Trash2, FileDown, Loader2, Check, QrCode } from "lucide-react";
import { Link, useRoute } from "wouter";
import { format } from "date-fns";
import { calcularValorDevido, calcularTotalMultiplasCobrancas, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import { SimuladorAcordoMultiplo } from "@/components/SimuladorAcordoMultiplo";
import { DashboardDevedorMetricas } from "@/components/DashboardDevedorMetricas";
import { GraficoDistribuicaoCobrancas } from "@/components/GraficoDistribuicaoCobrancas";
import { TimelineTentativas } from "@/components/TimelineTentativas";
import { IndicadorRiscoDevedor } from "@/components/IndicadorRiscoDevedor";
import { AcordosDevedor } from "@/components/AcordosDevedor";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { NovaDividaModal } from "@/components/NovaDividaModal";
import { NovaTentativaModal } from "@/components/NovaTentativaModal";
import { GerarDocumentoModal } from "@/components/GerarDocumentoModal";

export default function DevedorDetalhes() {
  const { user } = useAuth();
  const [, params] = useRoute("/devedores/:id/detalhes");
  const devedorId = params?.id ? parseInt(params.id) : null;
  const [modalDividaOpen, setModalDividaOpen] = useState(false);
  const [modalTentativaOpen, setModalTentativaOpen] = useState(false);
  const [modalDocumentoOpen, setModalDocumentoOpen] = useState(false);
  const [gerandoBoleto, setGerandoBoleto] = useState<number | null>(null);
  const [copiadoLinhaId, setCopiadoLinhaId] = useState<number | null>(null);
  const [copiadoPixId, setCopiadoPixId] = useState<number | null>(null);
  // Cache dos dados do boleto gerado por cobrancaId
  const [dadosBoleto, setDadosBoleto] = useState<Record<number, { linhaDigitavel: string; pixCopiaCola: string | null; url: string }>>({});

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
              {user?.role !== "sindico" && (
                <Button variant="outline" size="sm" onClick={() => setModalDividaOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Dívida
                </Button>
              )}
              {user?.role !== "sindico" && (
                <Link href={`/devedores/${devedor.id}/importar-dividas`}>
                  <Button variant="outline" size="sm">
                    <Upload className="mr-2 h-4 w-4" />
                    Importar Dívidas
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={() => setModalTentativaOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Tentativa
              </Button>
              <Button variant="outline" size="sm" onClick={() => setModalDocumentoOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Gerar Documento
              </Button>
              <Link href={`/devedores/${devedor.id}/editar`}>
                <Button size="sm">
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 py-8">
        {/* Seção 1: Métricas Principais */}
        {metricas && (
          <div className="mb-6">
            <DashboardDevedorMetricas {...metricas} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Informações e Indicadores */}
          <div className="lg:col-span-1 space-y-6">
            {/* Informações Pessoais */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações Pessoais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nome</p>
                  <p className="font-medium">{devedor.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Unidade</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{devedor.unitNumber}{devedor.bloco ? ` - Bloco ${devedor.bloco}` : ""}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{devedor.phone}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">E-mail</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm break-all">{devedor.email}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{getStatusBadge(devedor.status)}</div>
                </div>
              </CardContent>
            </Card>

            {/* Indicador de Risco */}
            {metricas && (
              <IndicadorRiscoDevedor
                valorDevido={metricas.valorTotalDevido}
                diasAtraso={metricas.diasAtraso}
                tentativasSemSucesso={metricas.tentativasSemSucesso}
                taxaRecuperacao={metricas.taxaRecuperacao}
                temAcordoAtivo={metricas.temAcordoAtivo}
              />
            )}

            {/* Distribuição de Cobranças */}
            {cobrancas.length > 0 && (
              <GraficoDistribuicaoCobrancas cobrancas={cobrancas as any} taxas={taxas} />
            )}
          </div>

          {/* Coluna Direita: Timeline e Ações */}
          <div className="lg:col-span-2 space-y-6">
            {/* Timeline de Tentativas */}
            <TimelineTentativas tentativas={tentativas} limite={8} />

            {/* Tabela de Cobranças */}
            <Card>
              <CardHeader>
                <CardTitle>Todas as Cobranças</CardTitle>
                <CardDescription>Total: {cobrancas.length} cobrança(s)</CardDescription>
              </CardHeader>
              <CardContent>
                {cobrancas.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor Original</TableHead>
                        <TableHead>Juros</TableHead>
                        <TableHead>Multa</TableHead>
                        <TableHead>Honorários</TableHead>
                        <TableHead>Correção</TableHead>
                        <TableHead>Valor Atualizado</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Boleto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cobrancas.map((cob: any) => {
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

                                  {/* Gerar pela primeira vez mostra apenas o botão PDF */}
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
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhuma cobrança cadastrada
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Boletos do Devedor */}
            <BoletosPorDevedor devedorId={devedor.id} condominioId={devedor.condominioId} />

            {/* Acordos do Devedor */}
            <AcordosDevedor devedorId={devedor.id} />

            {/* Simulador de Acordo Consolidado */}
            {condominio && cobrancas.length > 0 && (
              <SimuladorAcordoMultiplo
                cobrancas={cobrancas as any}
                devedorId={devedor.id}
                devedorNome={getDevedorIdentificador(devedor)}
                condominioId={devedor.condominioId}
                condominioNome={condominio.name}
                taxaJurosMensal={Number(condominio.taxaJurosMensal || "1.00")}
                maxParcelas={(condominio as any).maxParcelas ?? 12}
                onAcordoCriado={() => {
                  window.location.reload();
                }}
              />
            )}
          </div>
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
    </div>
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
