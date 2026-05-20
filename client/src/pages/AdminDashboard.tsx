import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { trpc } from "@/lib/trpc";
import {
  Building2, Users, FileText, TrendingUp, Plus, Phone, Clock,
  BarChart3, CalendarIcon, Filter, X,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function AdminDashboard() {
  const { user, logout } = useAuth();

  // Filtros
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined);
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined);
  const [colaboradorId, setColaboradorId] = useState<number | undefined>(undefined);
  const [condominioFiltroId, setCondominioFiltroId] = useState<number | undefined>(undefined);
  const [calendarAberto, setCalendarAberto] = useState<"inicio" | "fim" | null>(null);

  const { data: condominios, isLoading } = trpc.condominios.list.useQuery();
  const { data: colaboradores } = trpc.tentativas.listarColaboradores.useQuery();

  // Query filtrada (usa a nova procedure)
  const filtroInput = useMemo(() => ({
    dataInicio,
    dataFim,
    colaboradorId,
    condominioId: condominioFiltroId,
    limite: 100,
  }), [dataInicio, dataFim, colaboradorId, condominioFiltroId]);

  const { data: tentativasFiltradas, isLoading: loadingTentativas } = trpc.tentativas.listAllFiltrada.useQuery(filtroInput);

  const temFiltroAtivo = !!(dataInicio || dataFim || colaboradorId || condominioFiltroId);

  const limparFiltros = () => {
    setDataInicio(undefined);
    setDataFim(undefined);
    setColaboradorId(undefined);
    setCondominioFiltroId(undefined);
  };

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
      deseja_acordo: { label: "Deseja Acordo", className: "bg-blue-500/10 text-blue-600" },
    };
    return variants[result] || { label: result, className: "bg-muted text-muted-foreground" };
  };

  // KPIs calculados a partir das tentativas filtradas
  const kpis = useMemo(() => {
    const lista = tentativasFiltradas || [];
    const promessas = lista.filter(t => t.result === "promessa_pagamento").length;
    const semResposta = lista.filter(t => t.result === "sem_resposta").length;
    return { total: lista.length, promessas, semResposta };
  }, [tentativasFiltradas]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
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
              <h1 className="text-2xl font-bold text-primary">Gomes &amp; Silva</h1>
              <p className="text-sm text-muted-foreground">Painel do Administrador</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>Sair</Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-6">

        {/* ── Painel de Filtros ── */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              Filtros do Dashboard
              {temFiltroAtivo && (
                <Badge className="bg-primary/10 text-primary border-primary/20 ml-2">
                  Filtro ativo
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">

              {/* Data Início */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">Data início</span>
                <Popover open={calendarAberto === "inicio"} onOpenChange={(o) => setCalendarAberto(o ? "inicio" : null)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-36 justify-start text-left font-normal",
                        !dataInicio && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {dataInicio ? format(dataInicio, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataInicio}
                      onSelect={(d) => { setDataInicio(d); setCalendarAberto(null); }}
                      locale={ptBR}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Data Fim */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">Data fim</span>
                <Popover open={calendarAberto === "fim"} onOpenChange={(o) => setCalendarAberto(o ? "fim" : null)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-36 justify-start text-left font-normal",
                        !dataFim && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {dataFim ? format(dataFim, "dd/MM/yyyy") : "Selecionar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dataFim}
                      onSelect={(d) => { setDataFim(d); setCalendarAberto(null); }}
                      locale={ptBR}
                      disabled={(d) => dataInicio ? d < dataInicio : false}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Colaborador */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">Colaborador</span>
                <Select
                  value={colaboradorId ? String(colaboradorId) : "todos"}
                  onValueChange={(v) => setColaboradorId(v === "todos" ? undefined : Number(v))}
                >
                  <SelectTrigger className="w-48 h-9 text-sm">
                    <SelectValue placeholder="Todos os colaboradores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os colaboradores</SelectItem>
                    {colaboradores?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name || c.email || `ID ${c.id}`}
                        {c.role && (
                          <span className="ml-1 text-xs text-muted-foreground">({c.role})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Condomínio */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium">Condomínio</span>
                <Select
                  value={condominioFiltroId ? String(condominioFiltroId) : "todos"}
                  onValueChange={(v) => setCondominioFiltroId(v === "todos" ? undefined : Number(v))}
                >
                  <SelectTrigger className="w-52 h-9 text-sm">
                    <SelectValue placeholder="Todos os condomínios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os condomínios</SelectItem>
                    {condominios?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Limpar filtros */}
              {temFiltroAtivo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={limparFiltros}
                  className="h-9 text-muted-foreground hover:text-destructive self-end"
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              <div className="text-2xl font-bold text-primary">{kpis.total}</div>
              <p className="text-xs text-muted-foreground">
                {temFiltroAtivo ? "No período/filtro selecionado" : "Total registrado"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Promessas de Pagamento</CardTitle>
              <TrendingUp className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{kpis.promessas}</div>
              <p className="text-xs text-muted-foreground">
                {temFiltroAtivo ? "No período/filtro selecionado" : "Total registrado"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sem Resposta</CardTitle>
              <FileText className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{kpis.semResposta}</div>
              <p className="text-xs text-muted-foreground">
                {temFiltroAtivo ? "No período/filtro selecionado" : "Total registrado"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Tentativas de Cobrança ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  Tentativas de Cobrança
                  {temFiltroAtivo && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {kpis.total} resultado{kpis.total !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {temFiltroAtivo
                    ? "Resultados filtrados — ajuste os filtros acima para refinar"
                    : "Histórico de contatos realizados pelos colaboradores (últimas 100)"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingTentativas ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              </div>
            ) : tentativasFiltradas && tentativasFiltradas.length > 0 ? (
              <div className="space-y-3">
                {tentativasFiltradas.slice(0, 5).map((tentativa) => {
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
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {tentativa.notes}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span className="font-medium text-accent">
                            👤 {colaborador}
                          </span>
                          <span>
                            {new Date(tentativa.attemptDate).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {tentativa.nextAttemptDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Próxima: {new Date(tentativa.nextAttemptDate).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {tentativasFiltradas.length > 5 && (
                  <div className="pt-2 border-t text-center">
                    <Link href="/tentativas">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                        Ver todas ({tentativasFiltradas.length} tentativas)
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {temFiltroAtivo
                    ? "Nenhuma tentativa encontrada com os filtros aplicados"
                    : "Nenhuma tentativa de cobrança registrada"}
                </p>
                {temFiltroAtivo && (
                  <Button variant="ghost" size="sm" onClick={limparFiltros} className="mt-2">
                    Limpar filtros
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Ações Rápidas + Condomínios ── */}
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
              <Link href="/admin/executivo">
                <Button className="w-full justify-start bg-indigo-600 hover:bg-indigo-700 text-white border-0">
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Centro de Inteligência Operacional
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
                        <p className="text-xs text-muted-foreground">{cond.city || "Sem cidade"}</p>
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
