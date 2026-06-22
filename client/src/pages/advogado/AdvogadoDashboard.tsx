import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Scale, Clock, AlertTriangle, CheckCircle2,
  Building2, ChevronRight, TrendingUp, Calendar,
} from "lucide-react";
import { useLocation } from "wouter";
import { useMemo } from "react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function urgenciaBadge(urgencia: string | null) {
  if (!urgencia) return null;
  const map: Record<string, { label: string; className: string }> = {
    atrasado: { label: "Atrasado", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
    hoje:     { label: "Hoje",     className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" },
    "7dias":  { label: "7 dias",   className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
    "15dias": { label: "15 dias",  className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
    "30dias": { label: "30 dias",  className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
    futuro:   { label: "Futuro",   className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  };
  const cfg = map[urgencia] ?? { label: urgencia, className: "bg-muted text-muted-foreground" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function statusProcessoBadge(status: string) {
  const map: Record<string, string> = {
    ativo:      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    suspenso:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
    arquivado:  "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    encerrado:  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function AdvogadoDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Dados do dashboard
  const { data: resumoProcessos } = trpc.processos.resumo.useQuery(undefined);
  const { data: resumoPrazos }    = trpc.prazos.resumo.useQuery(undefined);

  // Processos ativos (filtrado pelo advogado logado se tiver id)
  const filtroProcessos = useMemo(() => ({
    advogadoId: user?.id,
    status: "ativo" as const,
  }), [user?.id]);
  const { data: processosAtivos } = trpc.processos.listar.useQuery(filtroProcessos);

  // Prazos urgentes (atrasados + hoje + 7 dias) do advogado
  const filtroPrazosUrgentes = useMemo(() => ({
    responsavelId: user?.id,
  }), [user?.id]);
  const { data: todosPrazos } = trpc.prazos.listar.useQuery(filtroPrazosUrgentes);

  const prazosUrgentes = useMemo(() => {
    if (!todosPrazos) return [];
    return todosPrazos
      .filter(p => p.status === "pendente" && ["atrasado", "hoje", "7dias"].includes(p.urgencia ?? ""))
      .sort((a, b) => {
        const ordem = ["atrasado", "hoje", "7dias"];
        return ordem.indexOf(a.urgencia ?? "") - ordem.indexOf(b.urgencia ?? "");
      })
      .slice(0, 10);
  }, [todosPrazos]);

  const totalPrazosAtrasados = useMemo(
    () => todosPrazos?.filter(p => p.urgencia === "atrasado" && p.status === "pendente").length ?? 0,
    [todosPrazos]
  );
  const totalPrazosHoje = useMemo(
    () => todosPrazos?.filter(p => p.urgencia === "hoje" && p.status === "pendente").length ?? 0,
    [todosPrazos]
  );

  return (
    <DashboardLayout>
      {/* ── Cards de resumo ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Processos Ativos</span>
              <Scale className="h-4 w-4 text-primary" />
            </div>
            <p className="text-3xl font-bold">{resumoProcessos?.ativos ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Total no sistema</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Prazos Atrasados</span>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{totalPrazosAtrasados}</p>
            <p className="text-xs text-muted-foreground mt-1">Requerem atenção imediata</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Prazos Hoje</span>
              <Calendar className="h-4 w-4 text-orange-500" />
            </div>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{totalPrazosHoje}</p>
            <p className="text-xs text-muted-foreground mt-1">Vencem hoje</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-muted-foreground">Encerrados</span>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </div>
            <p className="text-3xl font-bold">{resumoProcessos?.encerrados ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Processos concluídos</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Prazos urgentes + Processos ativos ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Prazos urgentes */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                Prazos Urgentes
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setLocation("/admin/juridico/prazos")}
              >
                Ver todos <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {prazosUrgentes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
                <p className="text-sm">Nenhum prazo urgente</p>
              </div>
            ) : (
              prazosUrgentes.map((prazo) => (
                <div
                  key={prazo.id}
                  className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => setLocation("/admin/juridico/prazos")}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{prazo.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {prazo.condominioNome ?? "—"} · Vence {formatDate(prazo.dataLimite)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {urgenciaBadge(prazo.urgencia)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Meus processos ativos */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" />
                Meus Processos Ativos
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setLocation("/admin/juridico/processos")}
              >
                Ver todos <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {!processosAtivos || processosAtivos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum processo ativo atribuído</p>
              </div>
            ) : (
              processosAtivos.slice(0, 8).map((proc) => (
                <div
                  key={proc.id}
                  className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/admin/juridico/processos/${proc.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{proc.numeroCNJ}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {proc.condominioNome && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {proc.condominioNome}
                        </span>
                      )}
                      {proc.faseProcessual && (
                        <span className="text-xs text-muted-foreground capitalize">
                          · {proc.faseProcessual.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {statusProcessoBadge(proc.status)}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Resumo por tipo de processo ─────────────────────────────────── */}
      {resumoProcessos && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Resumo Geral de Processos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Ativos",    value: resumoProcessos.ativos,    color: "text-green-600 dark:text-green-400" },
                { label: "Suspensos", value: resumoProcessos.suspensos,  color: "text-yellow-600 dark:text-yellow-400" },
                { label: "Arquivados",value: (resumoProcessos as any).arquivados ?? 0, color: "text-slate-500" },
                { label: "Encerrados",value: resumoProcessos.encerrados, color: "text-blue-600 dark:text-blue-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center p-3 rounded-lg bg-muted/40">
                  <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
}
