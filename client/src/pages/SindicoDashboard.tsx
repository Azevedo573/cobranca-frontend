import { useAuth } from "@/_core/hooks/useAuth";
import { getDevedorIdentificador } from "@/lib/devedorUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Users, DollarSign, FileText, TrendingUp, AlertCircle, Phone, Clock } from "lucide-react";
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

  const { data: tentativas } = trpc.tentativas.list.useQuery(
    { condominioId: user?.condominioId! },
    { enabled: !!user?.condominioId }
  );

  const totalDevedores = devedores?.length || 0;
  const totalEmCobranca = cobrancas?.filter(c => c.status === "em_cobranca").reduce((sum, c) => sum + c.amount, 0) || 0;
  const totalAcordos = acordos?.filter(a => a.status === "ativo").length || 0;
  const devedoresAtivos = devedores?.filter(d => d.status === "ativo").length || 0;

  // Estatísticas de tentativas
  const tentativasRecentes = tentativas?.slice(0, 10) || [];
  const totalTentativas = tentativas?.length || 0;
  const tentativasHoje = tentativas?.filter(t => {
    const hoje = new Date();
    const dataTentativa = new Date(t.attemptDate);
    return dataTentativa.toDateString() === hoje.toDateString();
  }).length || 0;

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
              <CardTitle className="text-sm font-medium">Tentativas Hoje</CardTitle>
              <Phone className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{tentativasHoje}</div>
              <p className="text-xs text-muted-foreground">De {totalTentativas} total</p>
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
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Tentativas de Cobrança Recentes */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Tentativas de Cobrança Recentes
              </CardTitle>
              <CardDescription>Histórico de contatos realizados pela equipe de cobrança</CardDescription>
            </CardHeader>
            <CardContent>
              {tentativasRecentes && tentativasRecentes.length > 0 ? (
                <div className="space-y-4">
                  {tentativasRecentes.slice(0, 4).map((tentativa) => {
                    const devedor = devedores?.find(d => d.id === tentativa.devedorId);
                    const contactBadge = getContactTypeBadge(tentativa.contactType);
                    const resultBadge = getResultBadge(tentativa.result);
                    const colaborador = "Cobrador";
                    
                    return (
                      <div key={tentativa.id} className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                        <div className="flex-shrink-0 mt-1">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="font-medium text-sm">
                                {devedor ? getDevedorIdentificador(devedor) : "Devedor não encontrado"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Unidade {devedor?.unitNumber || "N/A"}
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
                            <span className="font-medium text-primary">
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
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {tentativasRecentes.length > 4 && (
                    <div className="pt-2 border-t">
                      <Link href="/tentativas">
                        <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground">
                          Ver todas ({tentativasRecentes.length} tentativas recentes)
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhuma tentativa de cobrança registrada</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    As tentativas aparecerão aqui quando a equipe registrar contatos
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
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

          {/* Devedores Recentes */}
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
                        <p className="font-medium text-sm">{getDevedorIdentificador(dev)}</p>
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
