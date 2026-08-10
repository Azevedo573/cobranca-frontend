import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Gavel,
  Clock,
  FileText,
  AlertTriangle,
  ChevronLeft,
  TrendingUp,
  Scale,
  CheckCircle2,
  XCircle,
  PauseCircle,
  ArrowRight,
  CalendarClock,
} from "lucide-react";
import { Activity, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR");
}

function getPrazoUrgencia(dataLimite: Date | string | null) {
  if (!dataLimite) return { label: "—", color: "secondary" as const };
  const agora = new Date();
  const limite = new Date(dataLimite);
  const diffMs = limite.getTime() - agora.getTime();
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias < 0) return { label: "Atrasado", color: "destructive" as const };
  if (diffDias === 0) return { label: "Hoje", color: "destructive" as const };
  if (diffDias <= 7) return { label: `${diffDias}d`, color: "secondary" as const };
  return { label: `${diffDias}d`, color: "outline" as const };
}

export default function DashboardJuridicoCondominio() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const condominioId = Number(params.id);

  const { data: resumo, isLoading } = trpc.juridicoCondominios.resumo.useQuery(
    { condominioId },
    { enabled: !!condominioId && !isNaN(condominioId) }
  );

  const { data: condominioInfo } = trpc.condominios.getById.useQuery(
    { id: condominioId },
    { enabled: !!condominioId && !isNaN(condominioId) }
  );

  const { data: movimentacoesRecentes = [] } = trpc.juridicoCondominios.movimentacoesRecentes.useQuery(
    { condominioId, limite: 15 },
    { enabled: !!condominioId && !isNaN(condominioId) }
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!resumo) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Condomínio não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/juridico/condominios")}>
          Voltar
        </Button>
      </div>
    );
  }

  const temAlerta = (resumo.prazos.atrasados ?? 0) > 0;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/juridico/condominios")}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            {condominioInfo?.name ?? `Condomínio #${condominioId}`}
          </h1>
          {condominioInfo && (
            <p className="text-sm text-muted-foreground">
              {[condominioInfo.city, condominioInfo.state].filter(Boolean).join(" — ")}
              {condominioInfo.cnpj && ` · CNPJ: ${condominioInfo.cnpj}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/juridico/processos?condominioId=${condominioId}`)}
            className="gap-1"
          >
            <Gavel className="h-4 w-4" />
            Ver Processos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/admin/juridico/prazos?condominioId=${condominioId}`)}
            className="gap-1"
          >
            <Clock className="h-4 w-4" />
            Ver Prazos
          </Button>
        </div>
      </div>

      {/* KPIs — Processos */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Gavel className="h-4 w-4" />
          Processos Judiciais
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<Scale className="h-5 w-5 text-blue-500" />}
            label="Ativos"
            value={resumo.processos.ativos}
            bg="bg-blue-500/10"
          />
          <KpiCard
            icon={<PauseCircle className="h-5 w-5 text-amber-500" />}
            label="Suspensos"
            value={resumo.processos.suspensos}
            bg="bg-amber-500/10"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-5 w-5 text-green-500" />}
            label="Encerrados"
            value={resumo.processos.encerrados}
            bg="bg-green-500/10"
          />
          <KpiCard
            icon={<TrendingUp className="h-5 w-5 text-purple-500" />}
            label="Valor em disputa"
            value={resumo.processos.valorEmDisputa > 0 ? formatCurrency(resumo.processos.valorEmDisputa) : "R$ 0"}
            bg="bg-purple-500/10"
          />
        </div>
      </div>

      {/* KPIs — Prazos */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Prazos Jurídicos
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            label="Atrasados"
            value={resumo.prazos.atrasados}
            bg={resumo.prazos.atrasados > 0 ? "bg-red-500/10" : "bg-muted/50"}
            highlight={resumo.prazos.atrasados > 0 ? "text-red-500" : undefined}
          />
          <KpiCard
            icon={<CalendarClock className="h-5 w-5 text-orange-500" />}
            label="Vencem hoje"
            value={resumo.prazos.hoje}
            bg={resumo.prazos.hoje > 0 ? "bg-orange-500/10" : "bg-muted/50"}
            highlight={resumo.prazos.hoje > 0 ? "text-orange-500" : undefined}
          />
          <KpiCard
            icon={<Clock className="h-5 w-5 text-amber-500" />}
            label="Próximos 7 dias"
            value={resumo.prazos.em7Dias}
            bg="bg-muted/50"
          />
          <KpiCard
            icon={<Clock className="h-5 w-5 text-muted-foreground" />}
            label="Próximos 30 dias"
            value={resumo.prazos.em30Dias}
            bg="bg-muted/50"
          />
        </div>
      </div>

      {/* Linha inferior: Processos recentes + Prazos urgentes + Distribuição */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Processos recentes */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Gavel className="h-4 w-4" />
                Processos recentes
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-primary"
                onClick={() => navigate(`/admin/juridico/processos?condominioId=${condominioId}`)}
              >
                Ver todos <ArrowRight className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {resumo.processosRecentes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum processo cadastrado</p>
            ) : (
              resumo.processosRecentes.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/juridico/processos/${p.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-primary truncate">{p.numeroCNJ}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.classe ?? p.tribunal}</p>
                  </div>
                  <Badge
                    variant={p.status === "ativo" ? "default" : p.status === "encerrado" ? "secondary" : "outline"}
                    className="text-xs shrink-0"
                  >
                    {p.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Prazos urgentes */}
        <Card className={`lg:col-span-1 ${temAlerta ? "border-red-500/30" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${temAlerta ? "text-red-500" : ""}`} />
                Prazos urgentes
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 text-primary"
                onClick={() => navigate(`/admin/juridico/prazos?condominioId=${condominioId}`)}
              >
                Ver todos <ArrowRight className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {resumo.prazosUrgentes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum prazo urgente</p>
            ) : (
              resumo.prazosUrgentes.map((p) => {
                const urg = getPrazoUrgencia(p.dataLimite);
                return (
                  <div key={p.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{p.titulo}</p>
                      <p className="text-xs text-muted-foreground">{p.responsavelNome ?? "—"}</p>
                    </div>
                    <Badge variant={urg.color} className="text-xs shrink-0">
                      {urg.label}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Distribuição por tipo */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Distribuição por tipo
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {resumo.distribuicaoPorTipo.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
            ) : (
              resumo.distribuicaoPorTipo.map((d) => {
                const total = resumo.processos.ativos || 1;
                const pct = Math.round(((d.total ?? 0) / total) * 100);
                return (
                  <div key={d.tipo ?? "outro"} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-muted-foreground">{d.tipo ?? "Outro"}</span>
                      <span className="font-medium">{d.total} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Demandas Kanban */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Demandas jurídicas (Kanban)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 text-primary"
              onClick={() => navigate(`/admin/juridico/demandas?condominioId=${condominioId}`)}
            >
              Abrir Kanban <ArrowRight className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span className="text-sm text-muted-foreground">Total de demandas:</span>
              <span className="text-sm font-semibold">{resumo.demandas.total}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Unificada de Movimentações */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Movimentações Recentes
            </span>
            <Link href={`/admin/juridico/processos?condominioId=${condominioId}`}>
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-primary">
                Ver processos <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {movimentacoesRecentes.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma movimentação registrada</p>
            </div>
          ) : (
            <div className="space-y-0">
              {(movimentacoesRecentes as any[]).map((mov: any, idx: number) => {
                const isLast = idx === movimentacoesRecentes.length - 1;
                const origemColor = mov.origem === "tjrj"
                  ? "bg-blue-500"
                  : mov.origem === "datajud"
                  ? "bg-emerald-500"
                  : "bg-muted-foreground/40";
                return (
                  <div key={mov.id} className="flex gap-3 group">
                    {/* Linha vertical */}
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${origemColor}`} />
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    {/* Conteúdo */}
                    <div className={`pb-4 flex-1 min-w-0 ${isLast ? "" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{mov.descricao?.split("\n")[0]}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <Link href={`/admin/juridico/processos/${mov.processoId}`}>
                              <span className="text-[10px] font-mono text-primary hover:underline cursor-pointer flex items-center gap-0.5">
                                <LinkIcon className="h-2.5 w-2.5" />
                                {mov.numeroCNJ}
                              </span>
                            </Link>
                            {mov.origem && mov.origem !== "manual" && (
                              <Badge className={`text-[10px] px-1 py-0 h-4 ${mov.origem === "tjrj" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"}`}>
                                {mov.origem.toUpperCase()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                          {new Date(mov.data).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  bg?: string;
  highlight?: string;
}

function KpiCard({ icon, label, value, bg = "bg-muted/50", highlight }: KpiCardProps) {
  return (
    <div className={`rounded-lg p-4 ${bg} flex items-center gap-3`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${highlight ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}
