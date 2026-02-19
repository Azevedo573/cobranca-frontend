import { useAuth } from "@/_core/hooks/useAuth";
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
import { ArrowLeft, User, Phone, Mail, Home, Plus, Edit } from "lucide-react";
import { Link, useRoute } from "wouter";
import { format } from "date-fns";
import { calcularValorDevido, calcularTotalMultiplasCobrancas, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import { SimuladorAcordoMultiplo } from "@/components/SimuladorAcordoMultiplo";
import { DashboardDevedorMetricas } from "@/components/DashboardDevedorMetricas";
import { GraficoDistribuicaoCobrancas } from "@/components/GraficoDistribuicaoCobrancas";
import { TimelineTentativas } from "@/components/TimelineTentativas";
import { IndicadorRiscoDevedor } from "@/components/IndicadorRiscoDevedor";
import { useMemo, useState } from "react";
import { NovaDividaModal } from "@/components/NovaDividaModal";

export default function DevedorDetalhes() {
  const { user } = useAuth();
  const [, params] = useRoute("/devedores/:id/detalhes");
  const devedorId = params?.id ? parseInt(params.id) : null;
  const [modalDividaOpen, setModalDividaOpen] = useState(false);

  const { data: devedor, isLoading } = trpc.devedores.getById.useQuery(
    { id: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: tentativas = [] } = trpc.tentativas.getByDevedor.useQuery(
    { devedorId: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: cobrancas = [] } = trpc.cobrancas.getByDevedor.useQuery(
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
              <Button variant="outline" size="sm" onClick={() => setModalDividaOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Dívida
              </Button>
              <Link href={`/devedores/${devedor.id}/tentativa/nova`}>
                <Button variant="outline" size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Tentativa
                </Button>
              </Link>
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
              <GraficoDistribuicaoCobrancas cobrancas={cobrancas} taxas={taxas} />
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
                        <TableHead>Valor Atualizado</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cobrancas.map((cob: any) => {
                        const valorAtualizado = taxas
                          ? calcularValorDevido(cob.amount / 100, new Date(cob.dueDate), taxas).valorTotal
                          : cob.amount / 100;
                        return (
                          <TableRow key={cob.id}>
                            <TableCell className="font-medium">{cob.description || "-"}</TableCell>
                            <TableCell>{format(new Date(cob.dueDate), "dd/MM/yyyy")}</TableCell>
                            <TableCell>{formatarMoeda(cob.amount / 100)}</TableCell>
                            <TableCell className="font-semibold">{formatarMoeda(valorAtualizado)}</TableCell>
                            <TableCell>
                              <Badge variant={cob.status === "pago" ? "outline" : "default"} className="text-xs">
                                {cob.status}
                              </Badge>
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

            {/* Simulador de Acordo Consolidado */}
            {condominio && cobrancas.length > 0 && (
              <SimuladorAcordoMultiplo
                cobrancas={cobrancas}
                devedorId={devedor.id}
                devedorNome={devedor.name}
                condominioId={devedor.condominioId}
                condominioNome={condominio.name}
                taxaJurosMensal={Number(condominio.taxaJurosMensal || "1.00")}
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
    </div>
  );
}
