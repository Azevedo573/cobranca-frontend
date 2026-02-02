import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FileText, Calendar, DollarSign, User, Home } from "lucide-react";
import { Link, useRoute } from "wouter";
import { format } from "date-fns";
import { useMemo } from "react";
import { calcularValorDevido, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import BreakdownValorComponent from "@/components/BreakdownValor";
import { SimuladorAcordo } from "@/components/SimuladorAcordo";

export default function CobrancaDetalhes() {
  const { user, logout } = useAuth();
  const [, params] = useRoute("/processos/:id");
  const cobrancaId = params?.id ? parseInt(params.id) : null;

  const { data: cobranca, isLoading } = trpc.cobrancas.getById.useQuery(
    { id: cobrancaId! },
    { enabled: !!cobrancaId }
  );

  const { data: devedor } = trpc.devedores.getById.useQuery(
    { id: cobranca?.devedorId! },
    { enabled: !!cobranca?.devedorId }
  );

  const { data: condominio } = trpc.condominios.getById.useQuery(
    { id: cobranca?.condominioId! },
    { enabled: !!cobranca?.condominioId }
  );

  const taxas: TaxasCondominio | null = useMemo(() => {
    if (!condominio) return null;
    return {
      taxaJurosMensal: Number(condominio.taxaJurosMensal || "1.00"),
      taxaMulta: Number(condominio.taxaMulta || "2.00"),
      taxaHonorarios: Number(condominio.taxaHonorarios || "10.00"),
    };
  }, [condominio]);

  const breakdown = useMemo(() => {
    if (!cobranca || !taxas || cobranca.status === "pago" || !cobranca.dueDate) return null;
    return calcularValorDevido(
      cobranca.amount / 100,
      new Date(cobranca.dueDate),
      taxas
    );
  }, [cobranca, taxas]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      pendente: { variant: "destructive", label: "Pendente" },
      em_cobranca: { variant: "default", label: "Em Cobrança" },
      pago: { variant: "outline", label: "Pago" },
      acordo: { variant: "secondary", label: "Acordo" },
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

  if (!cobranca) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Cobrança não encontrada</p>
          <Link href="/cobrancas">
            <Button className="mt-4">Voltar</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/cobrancas">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-primary">Detalhes da Cobrança</h1>
                <p className="text-sm text-muted-foreground">{cobranca.description || "Sem descrição"}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Informações da Cobrança */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Informações da Cobrança
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Descrição</p>
                    <p className="font-medium">{cobranca.description || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Mês de Referência</p>
                    <p className="font-medium">{cobranca.monthReference || "-"}</p>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Data de Vencimento</p>
                    <p className="font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {cobranca.dueDate ? format(new Date(cobranca.dueDate), "dd/MM/yyyy") : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <div className="mt-1">{getStatusBadge(cobranca.status)}</div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Original</p>
                    <p className="text-2xl font-bold text-primary flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      R$ {(cobranca.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  {breakdown && (
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Atualizado</p>
                      <p className="text-2xl font-bold text-destructive flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        {formatarMoeda(breakdown.valorTotal)}
                      </p>
                    </div>
                  )}
                </div>
                {(user?.role === "admin" || user?.role === "sindico") && (
                  <>
                    <Separator />
                    <Link href={`/cobrancas/${cobranca.id}/editar`}>
                      <Button className="w-full" variant="outline">
                        Editar Cobrança
                      </Button>
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Breakdown de Valores */}
            {breakdown && (
              <BreakdownValorComponent breakdown={breakdown} showDetails={true} />
            )}

            {/* Simulador de Acordo */}
            {cobranca.status !== "pago" && breakdown && devedor && condominio && taxas && (
              <SimuladorAcordo
                valorTotal={breakdown.valorTotal}
                devedorId={devedor.id}
                devedorNome={devedor.name}
                condominioId={condominio.id}
                condominioNome={condominio.name}
                taxaJurosMensal={taxas.taxaJurosMensal}
                onAcordoCriado={() => {
                  window.location.reload();
                }}
              />
            )}
          </div>

          {/* Informações do Devedor */}
          <div className="lg:col-span-1 space-y-6">
            {devedor && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Devedor
                  </CardTitle>
                  <CardDescription>Informações do responsável</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-medium">{devedor.name}</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Unidade</p>
                    <p className="font-medium flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      {devedor.unitNumber}
                    </p>
                  </div>
                  <Separator />
                  <Link href={`/devedores/${devedor.id}/detalhes`}>
                    <Button className="w-full" variant="outline">
                      Ver Detalhes do Devedor
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {condominio && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Home className="h-5 w-5" />
                    Condomínio
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-medium">{condominio.name}</p>
                  </div>
                  {taxas && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Taxas Aplicadas</p>
                        <div className="text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Juros Mensal:</span>
                            <span className="font-medium">{taxas.taxaJurosMensal}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Multa:</span>
                            <span className="font-medium">{taxas.taxaMulta}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Honorários:</span>
                            <span className="font-medium">{taxas.taxaHonorarios}%</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
