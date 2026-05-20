import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Shield, Search, Download, RefreshCw, AlertTriangle, CheckCircle,
  XCircle, Info, ChevronLeft, ChevronRight, Eye, Clock, User, Activity
} from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  login_success: "Login bem-sucedido",
  login_failed: "Falha de login",
  logout: "Logout",
  create: "Criação",
  update: "Atualização",
  delete: "Exclusão",
  generate_boleto: "Geração de boleto",
  generate_remessa: "Geração de remessa",
  process_retorno: "Processamento de retorno",
  pay_parcela: "Baixa de parcela",
  generate_relatorio: "Geração de relatório",
  export: "Exportação",
};

const ENTITY_LABELS: Record<string, string> = {
  user: "Usuário",
  condominio: "Condomínio",
  devedor: "Devedor",
  cobranca: "Cobrança",
  acordo: "Acordo",
  parcela: "Parcela",
  boleto: "Boleto",
  remessa: "Remessa",
  retorno: "Retorno",
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  info: { label: "Info", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: <Info className="w-3 h-3" /> },
  warning: { label: "Atenção", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <AlertTriangle className="w-3 h-3" /> },
  critical: { label: "Crítico", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: <XCircle className="w-3 h-3" /> },
};

function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LogDetailDialog({ log, onClose }: { log: any; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Detalhes do Evento de Auditoria #{log.id}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Ação</p>
              <p className="font-semibold">{ACTION_LABELS[log.action] ?? log.action}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Entidade</p>
              <p className="font-semibold">{ENTITY_LABELS[log.entity] ?? log.entity} {log.entityId ? `#${log.entityId}` : ""}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Usuário</p>
              <p className="font-semibold">{log.userName ?? "Sistema"} {log.userRole ? `(${log.userRole})` : ""}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Data/Hora</p>
              <p className="font-semibold">{formatDate(log.createdAt)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">IP</p>
              <p className="font-mono text-xs">{log.ipAddress ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Resultado</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${log.success ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"}`}>
                {log.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {log.success ? "Sucesso" : "Falha"}
              </span>
            </div>
          </div>
          {log.userAgent && (
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">User Agent</p>
              <p className="font-mono text-xs bg-muted p-2 rounded break-all">{log.userAgent}</p>
            </div>
          )}
          {log.errorMessage && (
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Mensagem de Erro</p>
              <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded text-xs font-mono">{log.errorMessage}</p>
            </div>
          )}
          {log.beforeData && (
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Estado Anterior</p>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">{JSON.stringify(JSON.parse(log.beforeData), null, 2)}</pre>
            </div>
          )}
          {log.afterData && (
            <div className="space-y-1">
              <p className="text-muted-foreground font-medium">Estado Posterior</p>
              <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">{JSON.stringify(JSON.parse(log.afterData), null, 2)}</pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Auditoria() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [action, setAction] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [success, setSuccess] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const queryParams = useMemo(() => ({
    page,
    limit: 20,
    search: search || undefined,
    action: action !== "all" ? action : undefined,
    entity: entity !== "all" ? entity : undefined,
    severity: severity !== "all" ? (severity as "info" | "warning" | "critical") : undefined,
    success: success !== "all" ? success === "true" : undefined,
  }), [page, search, action, entity, severity, success]);

  const { data, isLoading, refetch } = trpc.auditoria.listarLogs.useQuery(queryParams);
  const { data: stats } = trpc.auditoria.estatisticas.useQuery();

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function handleClearFilters() {
    setSearch("");
    setSearchInput("");
    setAction("all");
    setEntity("all");
    setSeverity("all");
    setSuccess("all");
    setPage(1);
  }

  function handleExportCSV() {
    if (!data?.logs) return;
    const headers = ["ID", "Data/Hora", "Ação", "Entidade", "ID Entidade", "Usuário", "Papel", "IP", "Severidade", "Resultado", "Mensagem de Erro"];
    const rows = data.logs.map((l: any) => [
      l.id,
      formatDate(l.createdAt),
      ACTION_LABELS[l.action] ?? l.action,
      ENTITY_LABELS[l.entity] ?? l.entity,
      l.entityId ?? "",
      l.userName ?? "Sistema",
      l.userRole ?? "",
      l.ipAddress ?? "",
      l.severity,
      l.success ? "Sucesso" : "Falha",
      l.errorMessage ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasActiveFilters = search || action !== "all" || entity !== "all" || severity !== "all" || success !== "all";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Auditoria do Sistema</h1>
            <p className="text-sm text-muted-foreground">Rastreabilidade completa de todas as ações dos usuários</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data?.logs?.length}>
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total de Eventos</p>
                <p className="text-2xl font-bold text-foreground">{stats?.total?.toLocaleString("pt-BR") ?? "—"}</p>
              </div>
              <Activity className="w-8 h-8 text-primary opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Últimas 24h</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats?.ultimas24h?.toLocaleString("pt-BR") ?? "—"}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Eventos Críticos</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats?.criticos?.toLocaleString("pt-BR") ?? "—"}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Falhas Registradas</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats?.falhas?.toLocaleString("pt-BR") ?? "—"}</p>
              </div>
              <XCircle className="w-8 h-8 text-yellow-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="w-4 h-4" />
            Filtros
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2 text-xs">Filtro ativo</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 flex gap-2">
              <Input
                placeholder="Buscar por usuário, IP, entidade..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>
            <Select value={action} onValueChange={v => { setAction(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entity} onValueChange={v => { setEntity(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Entidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as entidades</SelectItem>
                {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={v => { setSeverity(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Severidade" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Atenção</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={success} onValueChange={v => { setSuccess(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Resultado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="true">Sucesso</SelectItem>
                <SelectItem value="false">Falha</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-muted-foreground">
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabela de Logs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Registro de Eventos
              {data && (
                <span className="ml-2 text-muted-foreground font-normal">
                  ({data.total.toLocaleString("pt-BR")} eventos encontrados)
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              Carregando logs...
            </div>
          ) : !data?.logs?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Shield className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-medium">Nenhum evento encontrado</p>
              <p className="text-sm">Ajuste os filtros ou aguarde novos eventos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log: any) => {
                    const sev = SEVERITY_CONFIG[log.severity] ?? SEVERITY_CONFIG.info;
                    return (
                      <TableRow key={log.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedLog(log)}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{log.id}</TableCell>
                        <TableCell className="text-xs font-mono whitespace-nowrap">{formatDate(log.createdAt)}</TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{ENTITY_LABELS[log.entity] ?? log.entity}</span>
                            {(log.entityLabel || log.entityId) && (
                              <span className="text-xs text-muted-foreground">{log.entityLabel || `#${log.entityId}`}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span className="text-sm">{log.userName ?? "Sistema"}</span>
                              {log.userRole && <span className="text-xs text-muted-foreground capitalize">{log.userRole}</span>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{log.ipAddress ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sev.color}`}>
                            {sev.icon}
                            {sev.label}
                          </span>
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                              <CheckCircle className="w-3.5 h-3.5" /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                              <XCircle className="w-3.5 h-3.5" /> Falha
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setSelectedLog(log); }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginação */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {data.page} de {data.totalPages} · {data.total.toLocaleString("pt-BR")} eventos
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
              Próxima
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de detalhes */}
      {selectedLog && <LogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
}
