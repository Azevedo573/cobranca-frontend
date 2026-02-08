import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Building2, Users, FileText, TrendingUp, Plus, Phone, Clock, BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { data: condominios, isLoading } = trpc.condominios.list.useQuery();
  const { data: tentativas } = trpc.tentativas.listAll.useQuery();

  const tentativasRecentes = tentativas?.slice(0, 10) || [];

  const getContactTypeBadge = (type: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      telefone: { label: "Telefone", className: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20" },
      email: { label: "E-mail", className: "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20" },
      whatsapp: { label: "WhatsApp", className: "bg-green-500/10 text-green-500 hover:bg-green-500/20" },
      pessoal: { label: "Pessoal", className: "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20" },
    };
    return variants[type] || { label: type, className: "bg-muted text-muted-foreground" };
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return { label: "Pendente", className: "bg-muted text-muted-foreground" };
    
    const variants: Record<string, { label: string; className: string }> = {
      sem_resposta: { label: "Sem Resposta", className: "bg-gray-500/10 text-gray-500" },
      promessa_pagamento: { label: "Promessa", className: "bg-accent/10 text-accent" },
      recusa: { label: "Recusa", className: "bg-destructive/10 text-destructive" },
      outro: { label: "Outro", className: "bg-muted text-muted-foreground" },
    };
    return variants[result] || { label: result, className: "bg-muted text-muted-foreground" };
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
              <CardTitle className="text-sm font-medium">Tentativas de Cobrança</CardTitle>
              <Phone className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{tentativas?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Total registrado</p>
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

        {/* Tentativas de Cobrança Recentes */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Tentativas de Cobrança Recentes (Todos os Condomínios)
            </CardTitle>
            <CardDescription>Histórico de contatos realizados pelos colaboradores</CardDescription>
          </CardHeader>
          <CardContent>
            {tentativasRecentes && tentativasRecentes.length > 0 ? (
              <div className="space-y-4">
                {tentativasRecentes.slice(0, 4).map((tentativa) => {
                  const condominio = condominios?.find(c => c.id === tentativa.condominioId);
                  const contactBadge = getContactTypeBadge(tentativa.contactType);
                  const resultBadge = getResultBadge(tentativa.result);
                  const colaborador = tentativa.userName || "Colaborador";
                  
                  return (
                    <div key={tentativa.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex-shrink-0 mt-1">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <p className="font-medium text-sm">
                              {condominio?.name || "Condomínio não encontrado"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Devedor ID: {tentativa.devedorId}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className={contactBadge.className}>
                              {contactBadge.label}
                            </Badge>
                            <Badge variant="outline" className={resultBadge.className}>
                              {resultBadge.label}
                            </Badge>
                          </div>
                        </div>
                        {tentativa.notes && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {tentativa.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="font-medium text-accent">
                            👤 {colaborador}
                          </span>
                          <span>
                            {new Date(tentativa.attemptDate).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          {tentativa.nextAttemptDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Próxima: {new Date(tentativa.nextAttemptDate).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma tentativa de cobrança registrada</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions and Condominios */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <Link href="/admin/relatorios/produtividade">
                <Button className="w-full justify-start" variant="outline">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Relatório de Produtividade
                </Button>
              </Link>
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
