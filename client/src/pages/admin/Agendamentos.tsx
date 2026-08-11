import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, CheckCircle2, XCircle, Calendar, Activity, Newspaper, Bot, Play, Info, AlertTriangle, CircleAlert, Timer } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function formatarData(iso: Date | string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return typeof iso === "string" ? iso : iso.toISOString();
  }
}

function formatarDuracao(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1_000)} s`;
}

const EXECUCAO_STATUS = {
  sucesso: { label: "Saudável", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400", icon: CheckCircle2 },
  alerta: { label: "Alerta", className: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400", icon: AlertTriangle },
  falha: { label: "Falha", className: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  em_andamento: { label: "Em andamento", className: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400", icon: Timer },
} as const;

function parseCron(cron: string): string {
  // Formato: sec min hour dom mon dow (6 campos)
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 6) return cron;
  const [, min, hour, dom, mon, dow] = parts;

  // Diário a uma hora específica
  if (dom === "*" && mon === "*" && dow === "*") {
    const h = parseInt(hour, 10);
    const m = parseInt(min, 10);
    if (!isNaN(h) && !isNaN(m)) {
      // Converter UTC → BRT (UTC-3)
      const brtH = ((h - 3) + 24) % 24;
      return `Diariamente às ${String(brtH).padStart(2, "0")}:${String(m).padStart(2, "0")} (horário de Brasília)`;
    }
  }

  return `Cron: ${cron}`;
}

// Card estático para o job DOERJ (AGENT cron do Manus — não é Heartbeat)
function CardDoerjAgentCron() {
  const [, navigate] = useLocation();
  const { data: monitoramentos = [] } = trpc.doerjMonitoramentos.listar.useQuery();
  const ativos = monitoramentos.filter((m) => m.ativo === 1).length;

  const executarMutation = trpc.doerjMonitoramentos.executarAgora.useMutation({
    onSuccess: (data) => {
      toast.success(data.message ?? "Job DOERJ disparado com sucesso!");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary shrink-0" />
            <CardTitle className="text-base font-semibold">Monitoramento DOERJ</CardTitle>
          </div>
          <Badge className="bg-green-600/20 text-green-400 border-green-600/30">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          Pesquisa diariamente o Diário Oficial do Estado do RJ pelos nomes cadastrados em Monitoramentos.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Frequência</p>
            <p className="text-foreground font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Diariamente às 08:00 (Brasília)
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tipo</p>
            <p className="text-foreground font-medium flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
              AGENT Cron (Manus)
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Termos monitorados</p>
            <p className="text-foreground font-medium flex items-center gap-1.5">
              <Newspaper className="w-3.5 h-3.5 text-primary" />
              {ativos} termo(s) ativo(s)
            </p>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 space-y-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Endpoint</p>
            <p className="text-foreground font-mono text-xs break-all">
              POST /api/scheduled/doerj
            </p>
          </div>
        </div>
        {/* Aviso sobre Run Now */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-medium">Como executar o job manualmente (Run Now)</p>
            <p>O bot que pesquisa no DOERJ é um AGENT cron do Manus e não pode ser disparado diretamente por aqui. Para forçar uma execução imediata:</p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>Abra o painel de gerenciamento do Manus (botão <strong>⚙</strong> no canto superior direito da interface)</li>
              <li>Clique em <strong>Settings</strong> no menu lateral</li>
              <li>Clique em <strong>Schedules</strong></li>
              <li>Localize o job <strong>"Monitoramento DOERJ"</strong> e clique em <strong>Run Now</strong></li>
            </ol>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Termos cadastrados: {monitoramentos.map((m) => m.nome).join(", ") || "Nenhum"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/juridico/publicacoes/monitoramentos")}
            >
              <Newspaper className="w-3.5 h-3.5 mr-1.5" />
              Gerenciar Termos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/juridico/publicacoes")}
            >
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              Ver Publicações
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Agendamentos() {
  const [refetchKey, setRefetchKey] = useState(0);
  void refetchKey; // usado para forçar re-render

  const { data, isLoading, refetch, isFetching } = trpc.agendamentos.listar.useQuery();
  const { data: saude, isLoading: saudeCarregando, refetch: atualizarSaude, isFetching: saudeAtualizando } = trpc.operacional.resumo.useQuery();
  const { data: execucoes = [], refetch: atualizarExecucoes } = trpc.operacional.ultimasExecucoes.useQuery({ limite: 12 });

  const jobs = data?.jobs ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agendamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jobs automáticos configurados no sistema
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setRefetchKey(k => k + 1);
            refetch();
            atualizarSaude();
            atualizarExecucoes();
          }}
          disabled={isFetching || saudeAtualizando}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching || saudeAtualizando ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Saúde operacional: execuções persistidas de integrações e jobs */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle className="text-base font-semibold">Saúde Operacional</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Últimas execuções registradas de integrações e tarefas automáticas.</p>
            </div>
            {saude?.comFalha ? (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30">
                <CircleAlert className="w-3 h-3 mr-1" /> {saude.comFalha} falha(s) requer(em) atenção
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Sem falhas registradas
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Monitorados", value: saude?.totalMonitorados ?? 0, color: "text-foreground" },
              { label: "Saudáveis", value: saude?.saudaveis ?? 0, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Alertas", value: saude?.comAlerta ?? 0, color: "text-amber-600 dark:text-amber-400" },
              { label: "Falhas", value: saude?.comFalha ?? 0, color: "text-destructive" },
              { label: "Em andamento", value: saude?.emAndamento ?? 0, color: "text-blue-600 dark:text-blue-400" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border bg-background/80 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className={`mt-1 text-xl font-semibold ${item.color}`}>{saudeCarregando ? "—" : item.value}</p>
              </div>
            ))}
          </div>

          {execucoes.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>Integração / execução</span>
                <span>Resultado</span>
              </div>
              {execucoes.map((execucao) => {
                const status = EXECUCAO_STATUS[execucao.status as keyof typeof EXECUCAO_STATUS] ?? EXECUCAO_STATUS.alerta;
                const Icone = status.icon;
                return (
                  <div key={execucao.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b last:border-b-0 px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{execucao.nome}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatarData(execucao.iniciadoEm)} · {formatarDuracao(execucao.duracaoMs)} · {execucao.registrosProcessados} registro(s)
                      </p>
                      {execucao.mensagemErro && <p className="mt-1 text-xs text-destructive line-clamp-2">{execucao.mensagemErro}</p>}
                    </div>
                    <Badge variant="outline" className={`h-fit whitespace-nowrap ${status.className}`}>
                      <Icone className="w-3 h-3 mr-1" /> {status.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
              Nenhuma execução operacional registrada ainda. As novas sincronizações aparecerão aqui.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Carregando agendamentos...
        </div>
      )}

      {/* Sem jobs */}
      {!isLoading && jobs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Calendar className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">Nenhum agendamento encontrado.</p>
          </CardContent>
        </Card>
      )}

      {/* Lista de jobs */}
      {jobs.map((job) => (
        <Card key={job.taskUid} className="border border-border">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary shrink-0" />
                <CardTitle className="text-base font-semibold">{job.name}</CardTitle>
              </div>
              <Badge
                variant={job.isEnable ? "default" : "secondary"}
                className={job.isEnable ? "bg-green-600/20 text-green-400 border-green-600/30" : ""}
              >
                {job.isEnable ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Ativo</>
                ) : (
                  <><XCircle className="w-3 h-3 mr-1" /> Pausado</>
                )}
              </Badge>
            </div>
            {job.description && (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {job.description}
              </p>
            )}
          </CardHeader>

          <CardContent className="space-y-3">
            {/* Grid de informações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Frequência</p>
                <p className="text-foreground font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  {parseCron(job.cronExpression)}
                </p>
              </div>

              <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Endpoint</p>
                <p className="text-foreground font-mono text-xs break-all">
                  {job.callbackMethod} {job.callbackPath}
                </p>
              </div>

              <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Última execução</p>
                <p className="text-foreground font-medium">
                  {formatarData(job.lastExecutedAt)}
                </p>
              </div>

              <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Próxima execução</p>
                <p className="text-foreground font-medium">
                  {formatarData(job.nextExecutionAt)}
                </p>
              </div>
            </div>

            {/* Criado em */}
            {job.createdAt && (
              <p className="text-xs text-muted-foreground">
                Criado em {formatarData(job.createdAt)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Card do DOERJ AGENT cron */}
      <CardDoerjAgentCron />

      {/* Nota informativa */}
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Como funcionam os agendamentos?</p>
        <p>
          Os jobs acima são executados automaticamente pelo sistema Manus na frequência configurada.
          Cada execução acessa os serviços externos (ex: DOERJ) e salva os resultados no banco de dados.
          Para ver os resultados do monitoramento do Diário Oficial, acesse{" "}
          <strong className="text-foreground">Jurídico → Intimações & Publicações → Diário Oficial RJ</strong>.
        </p>
      </div>
    </div>
  );
}
