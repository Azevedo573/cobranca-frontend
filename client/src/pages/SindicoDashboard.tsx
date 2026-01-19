import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, DollarSign, FileText, TrendingUp, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function SindicoDashboard() {
  const { user, logout } = useAuth();
  
  const { data: devedores } = trpc.devedores.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const { data: cobrancas } = trpc.cobrancas.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const { data: acordos } = trpc.acordos.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const totalDevedores = devedores?.length || 0;
  const totalEmCobranca = cobrancas?.filter(c => c.status === "em_cobranca").reduce((sum, c) => sum + c.amount, 0) || 0;
  const totalAcordos = acordos?.filter(a => a.status === "ativo").length || 0;
  const devedoresAtivos = devedores?.filter(d => d.status === "ativo").length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">Gomes & Silva</h1>
              <p className="text-sm text-muted-foreground">Painel do Síndico</p>
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
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Devedores Ativos</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{devedoresAtivos}</div>
              <p className="text-xs text-muted-foreground">De {totalDevedores} total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Em Cobrança</CardTitle>
              <DollarSign className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                R$ {(totalEmCobranca / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-muted-foreground">Valor total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Acordos Ativos</CardTitle>
              <FileText className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{totalAcordos}</div>
              <p className="text-xs text-muted-foreground">Em andamento</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Recuperação</CardTitle>
              <TrendingUp className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">-</div>
              <p className="text-xs text-muted-foreground">Ver relatório completo</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Gerenciar cobranças</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/devedores">
                <Button className="w-full justify-start" variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Ver Devedores
                </Button>
              </Link>
              <Link href="/cobrancas">
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  Ver Cobranças
                </Button>
              </Link>
              <Link href="/acordos">
                <Button className="w-full justify-start" variant="outline">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Ver Acordos
                </Button>
              </Link>
              <Link href="/relatorios">
                <Button className="w-full justify-start" variant="outline">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Relatórios
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Devedores Recentes</CardTitle>
              <CardDescription>Últimas atualizações</CardDescription>
            </CardHeader>
            <CardContent>
              {devedores && devedores.length > 0 ? (
                <div className="space-y-2">
                  {devedores.slice(0, 5).map((dev) => (
                    <div key={dev.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{dev.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Unidade {dev.unitNumber} - R$ {(dev.totalDue / 100).toFixed(2)}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        dev.status === "ativo" ? "bg-destructive/10 text-destructive" :
                        dev.status === "acordo" ? "bg-accent/10 text-accent" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {dev.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum devedor cadastrado</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
