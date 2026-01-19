import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, Phone, FileText, CheckCircle } from "lucide-react";
import { Link } from "wouter";

export default function CobradorDashboard() {
  const { user, logout } = useAuth();
  
  const { data: devedores } = trpc.devedores.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const { data: tentativas } = trpc.tentativas.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const devedoresAtivos = devedores?.filter(d => d.status === "ativo").length || 0;
  const tentativasHoje = tentativas?.filter(t => {
    const hoje = new Date().toDateString();
    return new Date(t.attemptDate).toDateString() === hoje;
  }).length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">Gomes & Silva</h1>
              <p className="text-sm text-muted-foreground">Painel do Cobrador</p>
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
              <CardTitle className="text-sm font-medium">Devedores para Cobrar</CardTitle>
              <Users className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{devedoresAtivos}</div>
              <p className="text-xs text-muted-foreground">Status ativo</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tentativas Hoje</CardTitle>
              <Phone className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{tentativasHoje}</div>
              <p className="text-xs text-muted-foreground">Contatos realizados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Tentativas</CardTitle>
              <FileText className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{tentativas?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Histórico completo</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promessas de Pagamento</CardTitle>
              <CheckCircle className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {tentativas?.filter(t => t.result === "promessa_pagamento").length || 0}
              </div>
              <p className="text-xs text-muted-foreground">Acompanhar</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Registrar atividades</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/devedores">
                <Button className="w-full justify-start" variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Ver Devedores
                </Button>
              </Link>
              <Link href="/tentativas/nova">
                <Button className="w-full justify-start bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Phone className="mr-2 h-4 w-4" />
                  Registrar Tentativa de Cobrança
                </Button>
              </Link>
              <Link href="/tentativas">
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  Ver Histórico de Tentativas
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Devedores Prioritários</CardTitle>
              <CardDescription>Próximas ações</CardDescription>
            </CardHeader>
            <CardContent>
              {devedores && devedores.length > 0 ? (
                <div className="space-y-2">
                  {devedores
                    .filter(d => d.status === "ativo")
                    .slice(0, 5)
                    .map((dev) => (
                      <div key={dev.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{dev.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Unidade {dev.unitNumber} - R$ {(dev.totalDue / 100).toFixed(2)}
                          </p>
                        </div>
                        <Link href={`/devedores/${dev.id}`}>
                          <Button size="sm" variant="ghost">Ver</Button>
                        </Link>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum devedor ativo</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
