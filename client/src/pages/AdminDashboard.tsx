import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Building2, Users, FileText, TrendingUp, Plus } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { data: condominios, isLoading } = trpc.condominios.list.useQuery();

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-primary">Gomes & Silva</h1>
              <p className="text-sm text-muted-foreground">Painel do Administrador</p>
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
              <CardTitle className="text-sm font-medium">Total de Condomínios</CardTitle>
              <Building2 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{condominios?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Cadastrados no sistema</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
              <Users className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">-</div>
              <p className="text-xs text-muted-foreground">Síndicos e cobradores</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cobranças Ativas</CardTitle>
              <FileText className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">-</div>
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
              <p className="text-xs text-muted-foreground">Acordos e pagamentos</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Gerenciar o sistema</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/admin/condominios">
                <Button className="w-full justify-start" variant="outline">
                  <Building2 className="mr-2 h-4 w-4" />
                  Gerenciar Condomínios
                </Button>
              </Link>
              <Link href="/admin/usuarios">
                <Button className="w-full justify-start" variant="outline">
                  <Users className="mr-2 h-4 w-4" />
                  Gerenciar Usuários
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condomínios Recentes</CardTitle>
              <CardDescription>Últimos cadastrados</CardDescription>
            </CardHeader>
            <CardContent>
              {condominios && condominios.length > 0 ? (
                <div className="space-y-2">
                  {condominios.slice(0, 5).map((cond) => (
                    <div key={cond.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{cond.name}</p>
                        <p className="text-xs text-muted-foreground">{cond.city || 'Sem cidade'}</p>
                      </div>
                      <Link href={`/admin/condominios/${cond.id}`}>
                        <Button size="sm" variant="ghost">Ver</Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum condomínio cadastrado</p>
                  <Link href="/admin/condominios/novo">
                    <Button className="mt-4" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar Primeiro Condomínio
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
