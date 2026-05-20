import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  DollarSign, TrendingUp, TrendingDown, Users, FileText, AlertTriangle,
  Handshake, ShieldAlert, BarChart3, Bell, ArrowUpRight, ArrowDownRight,
  Phone, Scale, Activity, ChevronRight, RefreshCw, Minus
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";

const fmt = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number) => `${v > 0 ? "+" : ""}${v}%`;

function ScoreGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const colorMap: Record<string, string> = { green: "#22c55e", blue: "#3b82f6", yellow: "#f59e0b", red: "#ef4444" };
  const fill = colorMap[color] ?? "#3b82f6";
  const data = [{ value: score, fill }];
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" startAngle={210} endAngle={-30} data={data} barSize={14}>
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar background dataKey="value" cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color: fill }}>{score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <Badge className="mt-1" style={{ backgroundColor: fill + "20", color: fill, border: `1px solid ${fill}40` }}>
        {label}
      </Badge>
    </div>
  );
}

function KPICard({
  title, value, subtitle, icon: Icon, trend, trendLabel, color = "default", loading = false
}: {
  title: string; value: string; subtitle?: string; icon: React.ElementType;
  trend?: number; trendLabel?: string; color?: "green" | "red" | "blue" | "yellow" | "default"; loading?: boolean;
}) {
  const colorMap = {
    green: "text-emerald-500 bg-emerald-500/10",
    red: "text-red-500 bg-red-500/10",
    blue: "text-blue-500 bg-blue-500/10",
    yellow: "text-amber-500 bg-amber-500/10",
    default: "text-primary bg-primary/10",
  };
  const iconColor = colorMap[color];

  return (
    <Card className="relative overflow-hidden hover:shadow-md transition-all duration-200 border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
          {trend !== undefined && (
            <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {fmtPct(trend)}
            </div>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-7 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            {trendLabel && <p className="text-xs text-muted-foreground mt-0.5">{trendLabel}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AlertCard({ tipo, nivel, mensagem, icone }: { tipo: string; nivel: "critico" | "atencao" | "info"; mensagem: string; icone: string }) {
  const nivelMap = {
    critico: "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400",
    atencao: "border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400",
    info: "border-blue-500/30 bg-blue-500/5 text-blue-600 dark:text-blue-400",
  };
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${nivelMap[nivel]}`}>
      <span className="text-base mt-0.5">{icone}</span>
      <p className="text-sm font-medium leading-snug">{mensagem}</p>
    </div>
  );
}

// Dados de gráfico simulados (últimos 6 meses) para demonstração visual
const meses = ["Dez", "Jan", "Fev", "Mar", "Abr", "Mai"];

export default function SindicoDashboard() {
  const { user, logout } = useAuth();
  const condId = user?.condominioId ?? undefined;

  const { data: kpis, isLoading: loadingKpis, refetch: refetchKpis } = trpc.portal.kpis.useQuery(
    { condominioId: condId },
    { enabled: !!user }
  );
  const { data: score, isLoading: loadingScore } = trpc.portal.score.useQuery(
    { condominioId: condId },
    { enabled: !!user }
  );
  const { data: alertas, isLoading: loadingAlertas } = trpc.portal.alertas.useQuery(
    { condominioId: condId },
    { enabled: !!user }
  );

  // Gráfico de tendência (dados simulados + valor real do mês atual)
  const chartData = meses.map((mes, i) => ({
    mes,
    recuperado: i < 5 ? Math.round(Math.random() * 8000 + 2000) : Math.round((kpis?.valorRecuperadoMes ?? 0) / 100),
    emAberto: i < 5 ? Math.round(Math.random() * 20000 + 10000) : Math.round((kpis?.valorEmAberto ?? 0) / 100),
  }));

  const alertasCriticos = alertas?.filter(a => a.nivel === "critico").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header premium */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-base font-semibold">Portal de Transparência</h1>
                <p className="text-xs text-muted-foreground">Gomes & Silva Cobrança Condominial</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {alertasCriticos > 0 && (
                <div className="relative">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {alertasCriticos}
                  </span>
                </div>
              )}
              <button onClick={() => refetchKpis()} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => logout()}>Sair</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Título da seção */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Dashboard Executivo</h2>
            <p className="text-sm text-muted-foreground">Visão em tempo real da inadimplência do seu condomínio</p>
          </div>
          <div className="flex gap-2">
            <Link href="/sindico/pipeline">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Pipeline
              </Button>
            </Link>
            <Link href="/acordos">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Handshake className="h-3.5 w-3.5" />
                Acordos
              </Button>
            </Link>
          </div>
        </div>

        {/* KPIs principais — linha 1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Valor em Aberto"
            value={loadingKpis ? "—" : fmt(kpis?.valorEmAberto ?? 0)}
            subtitle="Total inadimplente"
            icon={DollarSign}
            color="red"
            loading={loadingKpis}
          />
          <KPICard
            title="Recuperado no Mês"
            value={loadingKpis ? "—" : fmt(kpis?.valorRecuperadoMes ?? 0)}
            subtitle="Recebido este mês"
            icon={TrendingUp}
            trend={kpis?.variacaoRecuperacao}
            trendLabel="vs mês anterior"
            color="green"
            loading={loadingKpis}
          />
          <KPICard
            title="Taxa de Recuperação"
            value={loadingKpis ? "—" : `${kpis?.taxaRecuperacao ?? 0}%`}
            subtitle="Cobranças quitadas"
            icon={BarChart3}
            color="blue"
            loading={loadingKpis}
          />
          <KPICard
            title="Total Inadimplentes"
            value={loadingKpis ? "—" : String(kpis?.totalInadimplentes ?? 0)}
            subtitle="Devedores ativos"
            icon={Users}
            color="yellow"
            loading={loadingKpis}
          />
        </div>

        {/* KPIs secundários — linha 2 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Acordos Ativos"
            value={loadingKpis ? "—" : String(kpis?.acordosAtivos ?? 0)}
            subtitle="Em andamento"
            icon={Handshake}
            color="blue"
            loading={loadingKpis}
          />
          <KPICard
            title="Acordos em Risco"
            value={loadingKpis ? "—" : String(kpis?.acordosEmRisco ?? 0)}
            subtitle="Parcelas em atraso"
            icon={ShieldAlert}
            color="red"
            loading={loadingKpis}
          />
          <KPICard
            title="Casos em Jurídico"
            value={loadingKpis ? "—" : String(kpis?.casosJuridico ?? 0)}
            subtitle="Ação judicial ativa"
            icon={Scale}
            color="yellow"
            loading={loadingKpis}
          />
          <KPICard
            title="Contatos (30 dias)"
            value={loadingKpis ? "—" : String(kpis?.tentativasUltimos30Dias ?? 0)}
            subtitle="Tentativas realizadas"
            icon={Phone}
            color="green"
            loading={loadingKpis}
          />
        </div>

        {/* Gráfico + Score + Alertas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Gráfico de tendência */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Evolução da Recuperação (últimos 6 meses)
              </CardTitle>
              <CardDescription className="text-xs">Comparativo entre valor em aberto e recuperado</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradRec" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradAb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [`R$ ${v.toLocaleString("pt-BR")}`, ""]}
                  />
                  <Area type="monotone" dataKey="emAberto" name="Em Aberto" stroke="#ef4444" strokeWidth={2} fill="url(#gradAb)" />
                  <Area type="monotone" dataKey="recuperado" name="Recuperado" stroke="#22c55e" strokeWidth={2} fill="url(#gradRec)" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-0.5 bg-red-500 rounded" /> Em Aberto
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-3 h-0.5 bg-emerald-500 rounded" /> Recuperado
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Score de saúde financeira */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Saúde Financeira
              </CardTitle>
              <CardDescription className="text-xs">Score da cobrança condominial</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              {loadingScore ? (
                <div className="w-40 h-40 bg-muted animate-pulse rounded-full" />
              ) : (
                <ScoreGauge score={score?.score ?? 0} label={score?.label ?? "—"} color={score?.color ?? "blue"} />
              )}
              {score?.breakdown && (
                <div className="w-full space-y-1.5 mt-1">
                  {[
                    { label: "Recuperação", val: score.breakdown.recuperacao, max: 30 },
                    { label: "Acordos", val: score.breakdown.acordos, max: 20 },
                    { label: "Engajamento", val: score.breakdown.engajamento, max: 20 },
                    { label: "Inadimplência", val: score.breakdown.inadimplencia, max: 30 },
                  ].map(({ label, val, max }) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-24 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(val / max) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-right">{val}/{max}</span>
                    </div>
                  ))}
                </div>
              )}
              {score?.insights && score.insights.length > 0 && (
                <div className="w-full mt-1 space-y-1">
                  {score.insights.map((insight, i) => (
                    <p key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                      <span className="mt-0.5">💡</span> {insight}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alertas inteligentes */}
        {!loadingAlertas && alertas && alertas.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                Alertas Inteligentes
                {alertasCriticos > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{alertasCriticos} crítico{alertasCriticos > 1 ? "s" : ""}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {alertas.map((alerta, i) => (
                  <AlertCard key={i} {...alerta} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ações rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { href: "/devedores", icon: Users, label: "Devedores", desc: "Gerenciar lista" },
            { href: "/sindico/pipeline", icon: Activity, label: "Pipeline", desc: "Kanban de status" },
            { href: "/acordos", icon: Handshake, label: "Acordos", desc: "Negociações ativas" },
            { href: "/tentativas", icon: Phone, label: "Tentativas", desc: "Histórico de contatos" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href}>
              <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer group">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{label}</p>
                    <p className="text-xs text-muted-foreground truncate">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
