import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  RefreshCw, Send, AlertCircle, CheckCircle2, Clock, XCircle,
  Loader2, RotateCcw, Ban, Trash2, Activity, MessageSquare,
  TrendingUp, AlertTriangle,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type StatusFila = "aguardando" | "enviando" | "enviado" | "erro" | "cancelado" | "todos";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  aguardando: { label: "Aguardando", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: <Clock className="h-3 w-3" /> },
  enviando: { label: "Enviando", color: "bg-blue-100 text-blue-800 border-blue-200", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  enviado: { label: "Enviado", color: "bg-green-100 text-green-800 border-green-200", icon: <CheckCircle2 className="h-3 w-3" /> },
  erro: { label: "Erro", color: "bg-red-100 text-red-800 border-red-200", icon: <AlertCircle className="h-3 w-3" /> },
  cancelado: { label: "Cancelado", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <XCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.aguardando;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, n = 60) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default function WhatsAppFilaConfig() {
  const [statusFiltro, setStatusFiltro] = useState<StatusFila>("todos");
  const [pagina, setPagina] = useState(1);

  const utils = trpc.useUtils();

  const { data: stats, isLoading: loadingStats } = trpc.whatsapp.estatisticasFila.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const { data: fila, isLoading: loadingFila } = trpc.whatsapp.listarFila.useQuery(
    { status: statusFiltro, pagina, porPagina: 30 },
    { refetchInterval: 10000 }
  );

  const invalidar = () => {
    utils.whatsapp.estatisticasFila.invalidate();
    utils.whatsapp.listarFila.invalidate();
  };

  const reprocessarMutation = trpc.whatsapp.reprocessarErros.useMutation({
    onSuccess: () => { toast.success("Mensagens com erro colocadas novamente na fila."); invalidar(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const cancelarAguardandoMutation = trpc.whatsapp.cancelarAguardando.useMutation({
    onSuccess: () => { toast.success("Todas as mensagens aguardando foram canceladas."); invalidar(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const cancelarItemMutation = trpc.whatsapp.cancelarItem.useMutation({
    onSuccess: () => { toast.success("Mensagem cancelada."); invalidar(); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const totalPaginas = fila ? Math.ceil(fila.total / 30) : 1;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fila de Envio WhatsApp</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monitoramento e controle do job de envio com cadência anti-ban
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={invalidar} className="gap-2">
          <RefreshCw className="h-4 w-4" />Atualizar
        </Button>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">Aguardando</p>
                <p className="text-3xl font-bold text-yellow-800 dark:text-yellow-300 mt-1">
                  {loadingStats ? "—" : stats?.aguardando ?? 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-400" />
            </div>
            <p className="text-xs text-yellow-600 mt-2">Na fila para envio</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">Enviados Hoje</p>
                <p className="text-3xl font-bold text-blue-800 dark:text-blue-300 mt-1">
                  {loadingStats ? "—" : stats?.enviadosHoje ?? 0}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
            <p className="text-xs text-blue-600 mt-2">
              {loadingStats ? "" : `${stats?.enviadosUltimaHora ?? 0} na última hora`}
            </p>
          </CardContent>
        </Card>

        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-700 dark:text-red-400 font-medium">Com Erro</p>
                <p className="text-3xl font-bold text-red-800 dark:text-red-300 mt-1">
                  {loadingStats ? "—" : stats?.erro ?? 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
            <p className="text-xs text-red-600 mt-2">Falha no envio</p>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-700 dark:text-green-400 font-medium">Total Enviado</p>
                <p className="text-3xl font-bold text-green-800 dark:text-green-300 mt-1">
                  {loadingStats ? "—" : stats?.enviado ?? 0}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
            <p className="text-xs text-green-600 mt-2">Histórico completo</p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de status do job */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-sm font-medium">Job ativo</span>
              </div>
              <span className="text-xs text-muted-foreground">Processamento a cada 60 segundos</span>
              <Badge variant="outline" className="text-xs gap-1">
                <Activity className="h-3 w-3" />
                {loadingStats ? "—" : stats?.enviando ?? 0} enviando agora
              </Badge>
            </div>
            <div className="flex gap-2">
              {(stats?.erro ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => reprocessarMutation.mutate()}
                  disabled={reprocessarMutation.isPending}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reprocessar {stats?.erro} erro{(stats?.erro ?? 0) > 1 ? "s" : ""}
                </Button>
              )}
              {(stats?.aguardando ?? 0) > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50">
                      <Ban className="h-4 w-4" />
                      Cancelar fila ({stats?.aguardando})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancelar mensagens aguardando?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Isso cancelará todas as {stats?.aguardando} mensagens que estão aguardando na fila.
                        Essa ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Voltar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => cancelarAguardandoMutation.mutate()}
                      >
                        Cancelar todas
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela da fila */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Mensagens na Fila
              </CardTitle>
              <CardDescription>
                {fila ? `${fila.total} mensagem${fila.total !== 1 ? "s" : ""} encontrada${fila.total !== 1 ? "s" : ""}` : "Carregando..."}
              </CardDescription>
            </div>
            <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v as StatusFila); setPagina(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="aguardando">Aguardando</SelectItem>
                <SelectItem value="enviando">Enviando</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="erro">Erro</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingFila ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !fila?.items.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma mensagem encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead>Próx. tentativa</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fila.items.map((item: any) => (
                    <TableRow key={item.id} className={item.status === "erro" ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                      <TableCell className="text-xs text-muted-foreground">{item.id}</TableCell>
                      <TableCell className="font-mono text-sm">{item.telefone}</TableCell>
                      <TableCell className="max-w-xs">
                        <span className="text-sm" title={item.mensagem}>{truncate(item.mensagem)}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell className="text-center text-sm">{item.tentativas}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.createdAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.enviadoEm)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {item.status === "aguardando" ? formatDate(item.proximaTentativa) : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {item.erro && (
                          <span className="text-xs text-red-600" title={item.erro}>{truncate(item.erro, 40)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(item.status === "aguardando" || item.status === "erro") && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                            onClick={() => cancelarItemMutation.mutate({ id: item.id })}
                            disabled={cancelarItemMutation.isPending}
                            title="Cancelar esta mensagem"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">
                Página {pagina} de {totalPaginas} · {fila?.total} mensagens
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => p + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informações sobre cadência */}
      <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-400">
            <Activity className="h-4 w-4" />
            Como funciona a cadência anti-ban
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-amber-900 dark:text-amber-300 space-y-2">
          <p>O job processa a fila a cada <strong>60 segundos</strong>, respeitando as configurações de cada instância:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            {[
              { icon: <Clock className="h-4 w-4" />, text: "Delay aleatório entre mensagens (padrão: 8–25 segundos)" },
              { icon: <TrendingUp className="h-4 w-4" />, text: "Limite por hora (padrão: 20 mensagens)" },
              { icon: <Activity className="h-4 w-4" />, text: "Limite por dia (padrão: 150 mensagens)" },
              { icon: <CheckCircle2 className="h-4 w-4" />, text: "Janela de horário permitida (padrão: 08:00–20:00)" },
              { icon: <Send className="h-4 w-4" />, text: "Dias da semana configuráveis (padrão: Seg–Sex)" },
              { icon: <RotateCcw className="h-4 w-4" />, text: "Até 3 tentativas automáticas em caso de erro (intervalo: 30 min)" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-amber-600">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
          <p className="text-xs text-amber-700 mt-2">
            Para alterar os limites por instância, acesse <strong>Configurações → Instâncias WhatsApp</strong> e edite a instância desejada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
