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
  Users, Scale, Timer, BookOpen, Gavel, Newspaper, Plus, Kanban, List,
  TrendingDown, Award
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

function MetricCard({ title, value, sub, icon, color = "text-foreground", trend, onClick }: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: string;
  trend?: { value: number; label: string };
  onClick?: () => void;
}) {
  return (
    <Card className={onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} onClick={onClick}>
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

function SectionHeader({ icon, title, subtitle, action }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function DashboardJuridico() {
  const [, navigate] = useLocation();

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: demandas = [], isLoading: loadingDemandas } = trpc.juridicoDemandas.listar.useQuery();
  const { data: colunas = [] } = trpc.juridicoDemandas.getColunas.useQuery();
  const { data: assembleias = [] } = trpc.juridicoDemandas.listarAssembleias.useQuery();
  const { data: resumoProcessos } = trpc.processos.resumo.useQuery();
  const { data: resumoPrazos } = trpc.prazos.resumo.useQuery();
  const { data: resumoPublicacoes } = trpc.publicacoes.dashboard.useQuery();
  const { data: produtividade = [] } = trpc.juridicoDemandas.produtividadeAdvogados.useQuery();

  const ds = demandas as any[];
  const cols = colunas as any[];
  const ass = assembleias as any[];
  const rp = resumoProcessos as any;
  const rpz = resumoPrazos as any;
  const rpub = resumoPublicacoes as any;
  const prod = produtividade as any[];

  // ── Métricas de Demandas ──────────────────────────────────────────────────
  const hoje = new Date();
  const total = ds.length;
  const atrasadas = ds.filter(d => d.prazo && new Date(d.prazo) < hoje).length;
  const semResponsavel = ds.filter(d => !d.responsavelNome).length;
  const urgentes = ds.filter(d => d.prioridade === "urgente").length;
  const assembleiasFuturas = ass.filter((a: any) => a.status === "agendada" && new Date(a.data) >= hoje).length;
  const ultimaColuna = cols[cols.length - 1];
  const concluidas = ultimaColuna ? ds.filter(d => d.colunaId === ultimaColuna.id).length : 0;
  const emAndamento = total - concluidas;
  const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  // ── Dados para gráficos ───────────────────────────────────────────────────
  const porColuna = cols.map((c: any) => ({
    name: c.nome.length > 12 ? c.nome.substring(0, 12) + "…" : c.nome,
    total: ds.filter(d => d.colunaId === c.id).length,
  }));

  const porPrioridade = Object.entries(PRIORIDADE_LABELS).map(([key, label]) => ({
    name: label,
    value: ds.filter(d => d.prioridade === key).length,
    color: PRIORIDADE_COLORS[key],
  })).filter(p => p.value > 0);

  // ── Demandas atrasadas (top 5) ────────────────────────────────────────────
  const topAtrasadas = ds
    .filter(d => d.prazo && new Date(d.prazo) < hoje)
    .sort((a: any, b: any) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime())
    .slice(0, 5);

  // ── Próximas assembleias ──────────────────────────────────────────────────
  const proximasAssembleias = ass
    .filter((a: any) => a.status === "agendada" && new Date(a.data) >= hoje)
    .sort((a: any, b: any) => new Date(a.data).getTime() - new Date(b.data).getTime())
    .slice(0, 3);

  if (loadingDemandas) {
    return <div className="p-6 text-muted-foreground">Carregando dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Jurídico</h1>
          <p className="text-muted-foreground text-sm mt-1">Visão unificada — Demandas · Processos · Prazos · Publicações</p>
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 1 — DEMANDAS                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <SectionHeader
          icon={<FileText className="h-4 w-4" />}
          title="Demandas"
          subtitle="Central de demandas jurídicas"
          action={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/admin/juridico")}>
              Ver todas
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard
            title="Total"
            value={total}
            sub={`${emAndamento} em andamento`}
            icon={<FileText className="h-5 w-5" />}
            onClick={() => navigate("/admin/juridico")}
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
            title="Sem Responsável"
            value={semResponsavel}
            sub={semResponsavel > 0 ? "Atribuir responsável" : "Todos atribuídos"}
            icon={<Users className="h-5 w-5" />}
            color={semResponsavel > 0 ? "text-orange-500" : "text-foreground"}
          />
          <MetricCard
            title="Assembleias"
            value={assembleiasFuturas}
            sub="Agendadas"
            icon={<Calendar className="h-5 w-5" />}
            onClick={() => navigate("/admin/juridico/assembleias")}
          />
        </div>

        {/* Taxa de conclusão + gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold text-sm">Taxa de Conclusão</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{taxaConclusao}%</span>
              </div>
              <Progress value={taxaConclusao} className="h-3" />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{concluidas} concluídas</span>
                <span>{emAndamento} em andamento</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Por Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={porColuna} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Por Prioridade</CardTitle>
            </CardHeader>
            <CardContent>
              {porPrioridade.length === 0 ? (
                <div className="h-[130px] flex items-center justify-center text-muted-foreground text-sm">
                  Nenhuma demanda
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={porPrioridade} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
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
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 2 — PROCESSOS                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <SectionHeader
          icon={<Gavel className="h-4 w-4" />}
          title="Processos Judiciais"
          subtitle="Acompanhamento de processos ativos"
          action={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/admin/juridico/processos")}>
              Ver todos
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Processos Ativos"
            value={rp?.ativos ?? 0}
            sub={`${rp?.total ?? 0} total`}
            icon={<Scale className="h-5 w-5" />}
            color={(rp?.ativos ?? 0) > 0 ? "text-blue-600" : "text-foreground"}
            onClick={() => navigate("/admin/juridico/processos")}
          />
          <MetricCard
            title="Suspensos"
            value={rp?.suspensos ?? 0}
            sub="Aguardando retomada"
            icon={<Timer className="h-5 w-5" />}
            color={(rp?.suspensos ?? 0) > 0 ? "text-orange-500" : "text-foreground"}
          />
          <MetricCard
            title="Encerrados"
            value={rp?.encerrados ?? 0}
            sub="Concluídos"
            icon={<CheckCircle2 className="h-5 w-5" />}
            color="text-green-600"
          />
          <MetricCard
            title="Valor em Disputa"
            value={rp?.valorEmDisputa != null
              ? `R$ ${(rp.valorEmDisputa / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
              : "—"}
            sub="Processos ativos"
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* Distribuição por fase */}
        {rp?.porFase && rp.porFase.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Distribuição por Fase Processual</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={rp.porFase.map((f: any) => ({ name: f.faseProcessual ?? "Sem fase", total: f.total }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 3 — PRAZOS                                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <SectionHeader
          icon={<Timer className="h-4 w-4" />}
          title="Prazos Processuais"
          subtitle="Controle de prazos e vencimentos"
          action={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/admin/juridico/prazos")}>
              Ver todos
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Atrasados"
            value={rpz?.atrasados ?? 0}
            sub={rpz?.atrasados > 0 ? "Ação imediata necessária" : "Nenhum atrasado"}
            icon={<AlertTriangle className="h-5 w-5" />}
            color={(rpz?.atrasados ?? 0) > 0 ? "text-red-500" : "text-green-600"}
            onClick={() => navigate("/admin/juridico/prazos")}
          />
          <MetricCard
            title="Vencem Hoje"
            value={rpz?.vencemHoje ?? 0}
            sub="Prazo final hoje"
            icon={<Clock className="h-5 w-5" />}
            color={(rpz?.vencemHoje ?? 0) > 0 ? "text-orange-500" : "text-foreground"}
          />
          <MetricCard
            title="Próximos 7 dias"
            value={rpz?.vencemEm7Dias ?? 0}
            sub="Vencendo em breve"
            icon={<Calendar className="h-5 w-5" />}
            color={(rpz?.vencemEm7Dias ?? 0) > 0 ? "text-yellow-600" : "text-foreground"}
          />
          <MetricCard
            title="Próximos 30 dias"
            value={rpz?.vencemEm30Dias ?? 0}
            sub="No horizonte"
            icon={<BookOpen className="h-5 w-5" />}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 4 — PUBLICAÇÕES                                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="space-y-4">
        <SectionHeader
          icon={<Newspaper className="h-4 w-4" />}
          title="Publicações & Intimações"
          subtitle="Monitoramento de diários oficiais"
          action={
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate("/admin/juridico/publicacoes")}>
              Ver todas
            </Button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Não Lidas"
            value={rpub?.naoLidas ?? 0}
            sub={rpub?.naoLidas > 0 ? "Aguardando leitura" : "Todas lidas"}
            icon={<BookOpen className="h-5 w-5" />}
            color={(rpub?.naoLidas ?? 0) > 0 ? "text-blue-600" : "text-foreground"}
            onClick={() => navigate("/admin/juridico/publicacoes")}
          />
          <MetricCard
            title="Novas"
            value={rpub?.novas ?? 0}
            sub="Status: nova"
            icon={<Plus className="h-5 w-5" />}
            color={(rpub?.novas ?? 0) > 0 ? "text-purple-600" : "text-foreground"}
          />
          <MetricCard
            title="Aguardando Providência"
            value={rpub?.aguardandoProvidencia ?? 0}
            sub="Requerem ação"
            icon={<AlertTriangle className="h-5 w-5" />}
            color={(rpub?.aguardandoProvidencia ?? 0) > 0 ? "text-orange-500" : "text-foreground"}
          />
          <MetricCard
            title="Hoje"
            value={rpub?.hoje ?? 0}
            sub="Publicadas hoje"
            icon={<Calendar className="h-5 w-5" />}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SEÇÃO 5 — DESEMPENHO POR ADVOGADO                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {prod.length > 0 && (
        <div className="space-y-4">
          <SectionHeader
            icon={<Award className="h-4 w-4" />}
            title="Desempenho por Advogado"
            subtitle={`Mês atual — ${new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`}
          />

          <div className="grid grid-cols-1 gap-3">
            {prod.map((adv: any) => {
              const totalPrazos = (adv.prazosCumpridos ?? 0) + (adv.prazosAtrasados ?? 0);
              const taxaPrazos = totalPrazos > 0 ? Math.round((adv.prazosCumpridos / totalPrazos) * 100) : null;
              return (
                <Card key={adv.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                        {adv.nome?.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()}
                      </div>

                      {/* Nome + métricas */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-sm truncate">{adv.nome}</p>
                          {taxaPrazos !== null && (
                            <Badge
                              variant="outline"
                              className={`text-xs flex-shrink-0 ml-2 ${taxaPrazos >= 80 ? "text-green-600 border-green-200" : taxaPrazos >= 50 ? "text-yellow-600 border-yellow-200" : "text-red-500 border-red-200"}`}
                            >
                              {taxaPrazos}% prazos ok
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-lg font-bold text-green-600">{adv.demandasConcluidasMes}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">Concluídas no mês</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-lg font-bold">{adv.demandasAtivas}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">Demandas ativas</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <p className="text-lg font-bold text-blue-600">{adv.processosAtivos}</p>
                            <p className="text-[10px] text-muted-foreground leading-tight">Processos ativos</p>
                          </div>
                          <div className="text-center p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-lg font-bold text-green-600">{adv.prazosCumpridos}</span>
                              <span className="text-muted-foreground text-sm">/</span>
                              <span className="text-lg font-bold text-red-500">{adv.prazosAtrasados}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight">Prazos ok / atrasados</p>
                          </div>
                        </div>

                        {taxaPrazos !== null && (
                          <div className="mt-2">
                            <Progress value={taxaPrazos} className="h-1.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* LINHA INFERIOR — Demandas atrasadas + Próximas assembleias          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
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
                        <p className="text-sm font-medium truncate">{a.condominioNome ?? "Assembleia"}</p>
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
    </div>
  );
}
