import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, FunnelChart, Funnel, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Target, Users, Zap,
  AlertTriangle, CheckCircle, Clock, BarChart2, Award, Activity,
  ArrowUpRight, ArrowDownRight, Minus, RefreshCw, Eye, Building2,
} from "lucide-react";
import { Link } from "wouter";

type Periodo = "hoje" | "semana" | "mes" | "trimestre";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v / 100);

const pct = (v: number) => `${v > 0 ? "+" : ""}${v}%`;

function VariacaoBadge({ v }: { v: number }) {
  if (v > 0) return (
    <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
      <ArrowUpRight className="w-3 h-3" />{pct(v)}
    </span>
  );
  if (v < 0) return (
    <span className="flex items-center gap-1 text-xs text-red-400 font-semibold">
      <ArrowDownRight className="w-3 h-3" />{pct(v)}
    </span>
  );
  return <span className="flex items-center gap-1 text-xs text-slate-400"><Minus className="w-3 h-3" />0%</span>;
}

function MiniAreaChart({ data }: { data: { mes: string; valor: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="valor" stroke="#6366f1" strokeWidth={2} fill="url(#grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function KpiCard({
  icon: Icon, label, value, variacao, sub, color, chart,
}: {
  icon: React.ElementType; label: string; value: string; variacao?: number;
  sub?: string; color: string; chart?: { mes: string; valor: number }[];
}) {
  return (
    <Card className="bg-card border-border hover:border-primary/30 transition-all group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          {variacao !== undefined && <VariacaoBadge v={variacao} />}
        </div>
        <div className="text-2xl font-bold text-foreground mb-1 font-mono">{value}</div>
        <div className="text-xs text-muted-foreground mb-2">{label}</div>
        {sub && <div className="text-xs text-muted-foreground/70">{sub}</div>}
        {chart && chart.length > 0 && (
          <div className="mt-3 opacity-70 group-hover:opacity-100 transition-opacity">
            <MiniAreaChart data={chart} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertaCard({ tipo, titulo, descricao, impacto }: {
  tipo: "critico" | "aviso" | "info"; titulo: string; descricao: string; impacto?: string;
}) {
  const styles = {
    critico: { border: "border-red-500/30 bg-red-500/5", icon: <AlertTriangle className="w-4 h-4 text-red-400" />, badge: "bg-red-500/20 text-red-400" },
    aviso: { border: "border-amber-500/30 bg-amber-500/5", icon: <Clock className="w-4 h-4 text-amber-400" />, badge: "bg-amber-500/20 text-amber-400" },
    info: { border: "border-blue-500/30 bg-blue-500/5", icon: <Activity className="w-4 h-4 text-blue-400" />, badge: "bg-blue-500/20 text-blue-400" },
  }[tipo];

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${styles.border}`}>
      <div className="mt-0.5">{styles.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{titulo}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{descricao}</div>
        {impacto && (
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${styles.badge}`}>
            {impacto}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ExecutivoDashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");

  const { data: kpis, isLoading: loadingKpis } = trpc.executivo.kpisEstrategicos.useQuery({ periodo });
  const { data: funil, isLoading: loadingFunil } = trpc.executivo.funilCobranca.useQuery({});
  const { data: equipe, isLoading: loadingEquipe } = trpc.executivo.produtividadeEquipe.useQuery({ periodo: periodo === "trimestre" ? "mes" : periodo });
  const { data: perdas, isLoading: loadingPerdas } = trpc.executivo.painelPerdas.useQuery({});
  const { data: carteiras, isLoading: loadingCarteiras } = trpc.executivo.performanceCarteira.useQuery();

  const periodoLabel = { hoje: "Hoje", semana: "Esta Semana", mes: "Este Mês", trimestre: "Este Trimestre" }[periodo];

  // Alertas gerados a partir dos dados reais
  const alertas = useMemo(() => {
    const lista: { tipo: "critico" | "aviso" | "info"; titulo: string; descricao: string; impacto?: string }[] = [];
    if (perdas) {
      if (perdas.acordosQuebrados.qtd > 0) {
        lista.push({
          tipo: "critico",
          titulo: `${perdas.acordosQuebrados.qtd} acordo(s) quebrado(s)`,
          descricao: "Acordos cancelados representam perda direta de receita.",
          impacto: `Perda: ${fmt(perdas.acordosQuebrados.valor)}`,
        });
      }
      if (perdas.parcelasAtrasadas.qtd > 0) {
        lista.push({
          tipo: "aviso",
          titulo: `${perdas.parcelasAtrasadas.qtd} parcela(s) em atraso`,
          descricao: "Parcelas de acordos ativos com vencimento ultrapassado.",
          impacto: `Em risco: ${fmt(perdas.parcelasAtrasadas.valor)}`,
        });
      }
      if (perdas.devedoresSemContato > 5) {
        lista.push({
          tipo: "aviso",
          titulo: `${perdas.devedoresSemContato} devedores sem contato recente`,
          descricao: "Devedores ativos sem tentativa de contato nos últimos 30 dias.",
        });
      }
      if (perdas.cobParadas > 0) {
        lista.push({
          tipo: "info",
          titulo: `${perdas.cobParadas} cobrança(s) parada(s) há 90+ dias`,
          descricao: "Cobranças em andamento sem atualização de status.",
        });
      }
    }
    if (equipe && equipe.length > 0) {
      const baixaPerf = equipe.filter(e => e.score < 30);
      if (baixaPerf.length > 0) {
        lista.push({
          tipo: "aviso",
          titulo: `${baixaPerf.length} operador(es) abaixo da meta`,
          descricao: baixaPerf.map(e => e.nome).join(", ") + " com score abaixo de 30.",
        });
      }
    }
    if (kpis && kpis.taxaRecuperacao < 10 && kpis.totalInadimplentes > 0) {
      lista.push({
        tipo: "info",
        titulo: "Taxa de recuperação baixa",
        descricao: `Apenas ${kpis.taxaRecuperacao}% dos devedores foram recuperados no período.`,
      });
    }
    return lista;
  }, [perdas, equipe, kpis]);

  // Dados do funil para o gráfico de barras horizontal
  const funilData = funil?.map(f => ({
    name: f.etapa.replace("Total de Devedores", "Total").replace("Perdidos/Judicial", "Perdidos"),
    qtd: f.qtd,
    conv: f.conv,
    fill: f.cor,
  })) ?? [];

  // Top 3 operadores para o ranking
  const top3 = equipe?.slice(0, 3) ?? [];

  // Cores do score
  const scoreCor = (s: number) =>
    s >= 85 ? "text-emerald-400" : s >= 70 ? "text-blue-400" : s >= 50 ? "text-amber-400" : s >= 30 ? "text-orange-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-400" />
              Centro de Inteligência Operacional
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Plataforma de Performance de Recuperação de Crédito</p>
          </div>
          <div className="flex items-center gap-3">
            <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <TabsList className="bg-muted border border-border">
                <TabsTrigger value="hoje" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Hoje</TabsTrigger>
                <TabsTrigger value="semana" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Semana</TabsTrigger>
                <TabsTrigger value="mes" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Mês</TabsTrigger>
                <TabsTrigger value="trimestre" className="text-xs data-[state=active]:bg-indigo-600 data-[state=active]:text-white">Trimestre</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* KPIs Estratégicos */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              KPIs Estratégicos — {periodoLabel}
            </h2>
            {loadingKpis && <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />}
          </div>
          {loadingKpis ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-36" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                icon={DollarSign} label="Valor Recuperado" color="bg-emerald-600"
                value={fmt(kpis?.valorRecuperado ?? 0)}
                variacao={kpis?.variacaoRecuperacao}
                sub={`vs. período anterior`}
                chart={kpis?.historico}
              />
              <KpiCard
                icon={Target} label="Acordos Fechados" color="bg-indigo-600"
                value={String(kpis?.qtdAcordos ?? 0)}
                variacao={kpis?.variacaoAcordos}
                sub={`Ticket médio: ${fmt(kpis?.ticketMedio ?? 0)}`}
              />
              <KpiCard
                icon={Zap} label="Taxa de Recuperação" color="bg-blue-600"
                value={`${kpis?.taxaRecuperacao ?? 0}%`}
                sub={`${kpis?.totalInadimplentes ?? 0} inadimplentes ativos`}
              />
              <KpiCard
                icon={Activity} label="Tentativas de Contato" color="bg-violet-600"
                value={String(kpis?.qtdTentativas ?? 0)}
                sub={`No período selecionado`}
              />
              <KpiCard
                icon={TrendingUp} label="Previsão de Receita" color="bg-cyan-600"
                value={fmt(kpis?.previsaoReceita ?? 0)}
                sub={`${kpis?.qtdParcelasPendentes ?? 0} parcelas pendentes`}
              />
              <KpiCard
                icon={AlertTriangle} label="Parcelas em Atraso" color="bg-amber-600"
                value={String(kpis?.qtdParcelasAtrasadas ?? 0)}
                sub={`${fmt(kpis?.valorParcelasAtrasadas ?? 0)} em risco`}
              />
              <KpiCard
                icon={Users} label="Devedores Inadimplentes" color="bg-rose-600"
                value={String(kpis?.totalInadimplentes ?? 0)}
                sub="Status ativo no sistema"
              />
              <KpiCard
                icon={Building2} label="Carteiras Ativas" color="bg-teal-600"
                value={String(carteiras?.length ?? 0)}
                sub={`${fmt(carteiras?.reduce((s, c) => s + c.receita, 0) ?? 0)} recuperado total`}
              />
            </div>
          )}
        </div>

        {/* Funil + Alertas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funil de Cobrança */}
          <div className="lg:col-span-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-400" />
                  Funil de Cobrança
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingFunil ? (
                  <Skeleton className="h-48" />
                ) : (
                  <div className="space-y-2">
                    {funilData.map((etapa, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-36 text-xs text-muted-foreground text-right shrink-0">{etapa.name}</div>
                        <div className="flex-1 relative h-7 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full rounded transition-all duration-700"
                            style={{
                              width: `${etapa.conv}%`,
                              backgroundColor: etapa.fill,
                              opacity: 0.85,
                            }}
                          />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white">
                            {etapa.qtd}
                          </span>
                        </div>
                        <div className="w-12 text-xs text-muted-foreground text-right shrink-0">{etapa.conv}%</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 pt-4 border-t border-border flex gap-4 text-xs text-muted-foreground">
                  <span>Cada barra mostra a proporção em relação ao total de devedores</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Alertas Executivos */}
          <div>
            <Card className="bg-card border-border h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Alertas Executivos
                  {alertas.length > 0 && (
                    <Badge className="bg-red-500 text-white text-xs ml-auto">{alertas.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingPerdas || loadingEquipe || loadingKpis ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)
                ) : alertas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
                    <div className="text-sm text-emerald-400 font-semibold">Operação saudável</div>
                    <div className="text-xs text-muted-foreground mt-1">Nenhum alerta crítico no momento</div>
                  </div>
                ) : (
                  alertas.map((a, i) => (
                    <AlertaCard key={i} tipo={a.tipo} titulo={a.titulo} descricao={a.descricao} impacto={a.impacto} />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Ranking da Equipe */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Ranking de Operadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingEquipe ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : equipe && equipe.length > 0 ? (
                <div className="space-y-3">
                  {equipe.slice(0, 5).map((op, i) => (
                    <div key={op.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === 0 ? "bg-amber-500 text-black" :
                        i === 1 ? "bg-slate-400 text-black" :
                        i === 2 ? "bg-amber-700 text-white" : "bg-slate-700 text-slate-300"
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{op.nome}</div>
                        <div className="text-xs text-muted-foreground">{op.badge}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-lg font-bold font-mono ${scoreCor(op.score)}`}>{op.score}</div>
                        <div className="text-xs text-muted-foreground">score</div>
                      </div>
                      <div className="text-right shrink-0 hidden sm:block">
                        <div className="text-sm font-semibold text-foreground">{op.qtdAcordos}</div>
                        <div className="text-xs text-muted-foreground">acordos</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum colaborador cadastrado ainda
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-border">
                <Link href="/admin/relatorios/produtividade">
                  <Button variant="ghost" size="sm" className="w-full text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/30">
                    <Eye className="w-3 h-3 mr-1" />
                    Ver relatório completo de produtividade
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Performance por Carteira */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-400" />
                Performance por Carteira
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCarteiras ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : carteiras && carteiras.length > 0 ? (
                <div className="space-y-3">
                  {carteiras.slice(0, 5).map((c, i) => (
                    <div key={c.id} className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-foreground truncate flex-1 mr-2">{c.nome}</div>
                        <Badge className={`text-xs shrink-0 ${
                          c.taxaRecuperacao >= 50 ? "bg-emerald-500/20 text-emerald-400" :
                          c.taxaRecuperacao >= 25 ? "bg-amber-500/20 text-amber-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>
                          {c.taxaRecuperacao}% recuperado
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{c.devedoresAtivos} ativos</span>
                        <span>{c.devedoresPagos} pagos</span>
                        <span className="text-emerald-400 font-semibold">{fmt(c.receita)}</span>
                      </div>
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
                          style={{ width: `${Math.min(c.taxaRecuperacao, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhum condomínio cadastrado ainda
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Painel de Perdas */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-400" />
              Painel de Perdas — Onde Está o Dinheiro na Mesa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPerdas ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-red-950/20 border border-red-500/20">
                  <div className="text-2xl font-bold text-red-400 font-mono">{perdas?.acordosQuebrados.qtd ?? 0}</div>
                  <div className="text-xs text-slate-400 mt-1">Acordos Quebrados</div>
                  <div className="text-xs text-red-400 font-semibold mt-1">{fmt(perdas?.acordosQuebrados.valor ?? 0)}</div>
                </div>
                <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-500/20">
                  <div className="text-2xl font-bold text-amber-400 font-mono">{perdas?.parcelasAtrasadas.qtd ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Parcelas Atrasadas</div>
                  <div className="text-xs text-amber-400 font-semibold mt-1">{fmt(perdas?.parcelasAtrasadas.valor ?? 0)}</div>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 border border-border">
                  <div className="text-2xl font-bold text-foreground font-mono">{perdas?.devedoresSemContato ?? 0}</div>
                  <div className="text-xs text-muted-foreground mt-1">Sem Contato (30d)</div>
                  <div className="text-xs text-muted-foreground mt-1">Devedores ignorados</div>
                </div>
                <div className="p-4 rounded-lg bg-orange-950/20 border border-orange-500/20">
                  <div className="text-2xl font-bold text-orange-400 font-mono">{fmt(perdas?.valorEmRisco ?? 0)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Valor Total em Risco</div>
                  <div className="text-xs text-orange-400 font-semibold mt-1">{perdas?.cobParadas ?? 0} cobranças paradas</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insights de IA */}
        <Card className="bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border-indigo-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-indigo-500 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              Inteligência Operacional — Insights Automáticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {kpis && kpis.taxaRecuperacao > 0 && (
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                  <div className="text-xs text-indigo-500 dark:text-indigo-300 font-semibold mb-1">📈 Tendência de Recuperação</div>
                  <div className="text-sm text-foreground">
                    {kpis.variacaoRecuperacao > 0
                      ? `Recuperação cresceu ${kpis.variacaoRecuperacao}% vs. período anterior. Mantenha o ritmo.`
                      : kpis.variacaoRecuperacao < 0
                      ? `Queda de ${Math.abs(kpis.variacaoRecuperacao)}% na recuperação. Revise a estratégia de contato.`
                      : "Recuperação estável em relação ao período anterior."}
                  </div>
                </div>
              )}
              {funil && funil.length > 2 && funil[1].qtd > 0 && (
                <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <div className="text-xs text-violet-500 dark:text-violet-300 font-semibold mb-1">🔍 Gargalo do Funil</div>
                  <div className="text-sm text-foreground">
                    {(() => {
                      const etapas = funil.slice(1);
                      const menor = etapas.reduce((a, b) => a.conv < b.conv ? a : b);
                      return `Maior queda em "${menor.etapa}" (${menor.conv}% de conversão). Foque esforços nesta etapa.`;
                    })()}
                  </div>
                </div>
              )}
              {equipe && equipe.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="text-xs text-blue-500 dark:text-blue-300 font-semibold mb-1">👥 Performance da Equipe</div>
                  <div className="text-sm text-foreground">
                    {equipe[0].score >= 70
                      ? `${equipe[0].nome} lidera com score ${equipe[0].score}. Use como referência para treinar a equipe.`
                      : `Nenhum operador atingiu score 70+. Considere revisar metas e processos de cobrança.`}
                  </div>
                </div>
              )}
              {kpis && (kpis.previsaoReceita ?? 0) > 0 && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-xs text-emerald-600 dark:text-emerald-300 font-semibold mb-1">💰 Previsão de Caixa</div>
                  <div className="text-sm text-foreground">
                    {fmt((kpis?.previsaoReceita ?? 0))} em parcelas pendentes de acordos ativos. Priorize follow-up nas próximas semanas.
                  </div>
                </div>
              )}
              {perdas && perdas.acordosQuebrados.qtd > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="text-xs text-red-500 dark:text-red-300 font-semibold mb-1">⚠️ Risco de Perda</div>
                  <div className="text-sm text-foreground">
                    {perdas.acordosQuebrados.qtd} acordo(s) cancelado(s) geraram perda de {fmt(perdas.acordosQuebrados.valor)}. Tente reativar com nova proposta.
                  </div>
                </div>
              )}
              {kpis && kpis.totalInadimplentes > 0 && (
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <div className="text-xs text-cyan-600 dark:text-cyan-300 font-semibold mb-1">🎯 Oportunidade de Escala</div>
                  <div className="text-sm text-foreground">
                    {kpis.totalInadimplentes} devedores ativos com taxa de recuperação de {kpis.taxaRecuperacao}%. Aumentar contatos em 20% pode gerar {Math.round(kpis.totalInadimplentes * 0.2 * (kpis.ticketMedio / 100))} acordos adicionais.
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
