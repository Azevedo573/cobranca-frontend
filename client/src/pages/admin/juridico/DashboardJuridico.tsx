import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import {
  AlertTriangle, Clock, CheckCircle2, FileText, Calendar, TrendingUp,
  Users, Building2, Plus, Kanban, List
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa:   "#94a3b8",
  media:   "#3b82f6",
  alta:    "#f97316",
  urgente: "#ef4444",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente",
};

function MetricCard({ title, value, sub, icon, color = "text-foreground", trend }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  trend?: { value: number; label: string };
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend && (
              <div className={`flex items-center gap-1 text-xs mt-2 ${trend.value >= 0 ? "text-green-600" : "text-red-500"}`}>
                <TrendingUp className="h-3 w-3" />
                {trend.value >= 0 ? "+" : ""}{trend.value} {trend.label}
              </div>
            )}
          </div>
          <div className="p-2 rounded-lg bg-muted/50 text-muted-foreground">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function DashboardJuridico() {
  const [, navigate] = useLocation();

  const { data: demandas = [], isLoading } = trpc.juridicoDemandas.listar.useQuery();
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: assembleias = [] } = trpc.juridicoDemandas.listarAssembleias.useQuery();

  const ds = demandas as any[];
  const cols = colunas as any[];
  const ass = assembleias as any[];

  // ── Métricas ──────────────────────────────────────────────────────────────
  const total = ds.length;
  const hoje = new Date();
  const atrasadas = ds.filter(d => d.prazo && new Date(d.prazo) < hoje).length;
  const semResponsavel = ds.filter(d => !d.responsavelNome).length;
  const urgentes = ds.filter(d => d.prioridade === "urgente").length;
  const assembleiasFuturas = ass.filter(a => a.status === "agendada" && new Date(a.data) >= hoje).length;

  // Coluna final (última coluna = concluídas)
  const ultimaColuna = cols[cols.length - 1];
  const concluidas = ultimaColuna ? ds.filter(d => d.colunaId === ultimaColuna.id).length : 0;
  const emAndamento = total - concluidas;
  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  // ── Dados para gráficos ───────────────────────────────────────────────────
  const porColuna = cols.map(c => ({
    name: c.nome.length > 12 ? c.nome.substring(0, 12) + "…" : c.nome,
    total: ds.filter(d => d.colunaId === c.id).length,
    icone: c.icone,
  }));

  const porPrioridade = Object.entries(PRIORIDADE_LABELS).map(([key, label]) => ({
    name: label,
    value: ds.filter(d => d.prioridade === key).length,
    color: PRIORIDADE_COLORS[key],
  })).filter(p => p.value > 0);

  const porTipo = ds.reduce((acc: Record<string, number>, d) => {
    acc[d.tipo] = (acc[d.tipo] || 0) + 1;
    return acc;
  }, {});
  const tipoData = Object.entries(porTipo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.replace("_", " "), value }));

  // ── Demandas atrasadas (top 5) ────────────────────────────────────────────
  const topAtrasadas = ds
    .filter(d => d.prazo && new Date(d.prazo) < hoje)
    .sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime())
    .slice(0, 5);

  // ── Próximas assembleias ──────────────────────────────────────────────────
  const proximasAssembleias = ass
    .filter(a => a.status === "agendada" && new Date(a.data) >= hoje)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    .slice(0, 3);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Carregando dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Jurídico</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão geral das demandas e assembleias</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/admin/juridico/kanban")}>
            <Kanban className="h-4 w-4 mr-2" />Kanban
          </Button>
          <Button variant="outline" onClick={() => navigate("/admin/juridico")}>
            <List className="h-4 w-4 mr-2" />Lista
          </Button>
          <Button onClick={() => navigate("/admin/juridico?nova=1")}>
            <Plus className="h-4 w-4 mr-2" />Nova Demanda
          </Button>
        </div>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total de Demandas"
          value={total}
          sub={`${emAndamento} em andamento`}
          icon={<FileText className="h-5 w-5" />}
        />
        <MetricCard
          title="Em Atraso"
          value={atrasadas}
          sub={atrasadas > 0 ? "Requerem atenção" : "Tudo em dia"}
          icon={<AlertTriangle className="h-5 w-5" />}
          color={atrasadas > 0 ? "text-red-500" : "text-green-600"}
        />
        <MetricCard
          title="Urgentes"
          value={urgentes}
          sub="Alta prioridade"
          icon={<Clock className="h-5 w-5" />}
          color={urgentes > 0 ? "text-orange-500" : "text-foreground"}
        />
        <MetricCard
          title="Assembleias"
          value={assembleiasFuturas}
          sub="Agendadas"
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Taxa de conclusão */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-semibold">Taxa de Conclusão</span>
            </div>
            <span className="text-2xl font-bold text-green-600">{taxaConclusao}%</span>
          </div>
          <Progress value={taxaConclusao} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>{concluidas} concluídas</span>
            <span>{emAndamento} em andamento</span>
            <span>{total} total</span>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por coluna/status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Demandas por Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={porColuna} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Por prioridade */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Distribuição por Prioridade</CardTitle>
          </CardHeader>
          <CardContent>
            {porPrioridade.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Nenhuma demanda cadastrada
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={porPrioridade}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {porPrioridade.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Linha inferior: atrasadas + próximas assembleias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demandas atrasadas */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Demandas em Atraso
              </CardTitle>
              {atrasadas > 5 && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/admin/juridico")}>
                  Ver todas ({atrasadas})
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {topAtrasadas.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                <p className="text-sm">Nenhuma demanda em atraso</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topAtrasadas.map((d: any) => {
                  const diasAtraso = Math.floor((hoje.getTime() - new Date(d.prazo).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/admin/juridico/demanda/${d.id}`)}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{d.assunto}</p>
                        <p className="text-xs text-muted-foreground">{d.numero}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-red-500 border-red-200 ml-2 flex-shrink-0">
                        {diasAtraso}d atraso
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Próximas assembleias */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Próximas Assembleias
              </CardTitle>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => navigate("/admin/juridico/assembleias")}>
                Ver todas
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {proximasAssembleias.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhuma assembleia agendada</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/admin/juridico/assembleias")}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Agendar
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {proximasAssembleias.map((a: any) => {
                  const diasRestantes = Math.ceil((new Date(a.data).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex flex-col items-center justify-center text-primary">
                        <span className="text-xs font-bold leading-none">
                          {new Date(a.data).toLocaleDateString("pt-BR", { day: "2-digit" })}
                        </span>
                        <span className="text-[10px] leading-none">
                          {new Date(a.data).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {a.condominioNome ?? "Assembleia"}
                        </p>
                        <p className="text-xs text-muted-foreground">{a.hora} · {a.tipo}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {diasRestantes === 0 ? "Hoje" : diasRestantes === 1 ? "Amanhã" : `${diasRestantes}d`}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sem responsável */}
      {semResponsavel > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-semibold text-sm">
                  {semResponsavel} demanda{semResponsavel > 1 ? "s" : ""} sem responsável
                </p>
                <p className="text-xs text-muted-foreground">Atribua um responsável para melhor acompanhamento</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/admin/juridico")}>
              Atribuir
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
