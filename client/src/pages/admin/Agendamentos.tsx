import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Clock, CheckCircle2, XCircle, Calendar, Activity, Newspaper, Bot, Play } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function formatarData(iso: string | null | undefined): string {
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
    return iso;
  }
}

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
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            Termos cadastrados: {monitoramentos.map((m) => m.nome).join(", ") || "Nenhum"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => executarMutation.mutate()}
              disabled={executarMutation.isPending || ativos === 0}
              title={ativos === 0 ? "Cadastre ao menos um termo ativo para executar" : "Disparar o job DOERJ agora"}
            >
              {executarMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 mr-1.5" />
              )}
              {executarMutation.isPending ? "Executando..." : "Executar Agora"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/admin/juridico/publicacoes/monitoramentos")}
            >
              <Newspaper className="w-3.5 h-3.5 mr-1.5" />
              Gerenciar Termos
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
          }}
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

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
