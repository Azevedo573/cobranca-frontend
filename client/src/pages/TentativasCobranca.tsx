import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Phone, Search, X, Calendar, TrendingUp, MessageSquare, CheckCircle } from "lucide-react";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { Pagination, paginateItems } from "@/components/Pagination";
import { usePermissions } from "@/hooks/usePermissions";
import { useState, useMemo } from "react";
import { format, startOfDay, startOfWeek, startOfMonth, subDays } from "date-fns";

const PAGE_SIZE_DEFAULT = 25;

type PeriodoFiltro = "todos" | "hoje" | "semana" | "mes" | "7dias" | "30dias";
type ResultadoFiltro = "todos" | "sem_resposta" | "promessa_pagamento" | "acordo" | "recusa" | "outro";
type CanalFiltro = "todos" | "telefone" | "whatsapp" | "email" | "pessoal";

export default function TentativasCobranca() {
  const { user } = useAuth();
  const { can } = usePermissions();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>("todos");
  const [resultadoFiltro, setResultadoFiltro] = useState<ResultadoFiltro>("todos");
  const [canalFiltro, setCanalFiltro] = useState<CanalFiltro>("todos");

  const condominioId = user?.role === "admin" ? selectedCondominioId : user?.condominioId;

  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: tentativas, isLoading } = trpc.tentativas.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const { data: estatisticas } = trpc.tentativas.getEstatisticas.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const utils = trpc.useUtils();

  // Calcular data de corte do período
  const dataCortePeriodo = useMemo((): Date | null => {
    const agora = new Date();
    switch (periodoFiltro) {
      case "hoje": return startOfDay(agora);
      case "semana": return startOfWeek(agora, { weekStartsOn: 1 });
      case "mes": return startOfMonth(agora);
      case "7dias": return subDays(agora, 7);
      case "30dias": return subDays(agora, 30);
      default: return null;
    }
  }, [periodoFiltro]);

  // Filtro combinado
  const filteredTentativas = useMemo(() => {
    if (!tentativas) return [];
    return tentativas.filter((tent) => {
      // Texto
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchText =
          (tent.devedorName ?? "").toLowerCase().includes(q) ||
          (tent.notes ?? "").toLowerCase().includes(q);
        if (!matchText) return false;
      }
      // Resultado
      if (resultadoFiltro !== "todos" && tent.result !== resultadoFiltro) return false;
      // Canal
      if (canalFiltro !== "todos" && tent.contactType !== canalFiltro) return false;
      // Período
      if (dataCortePeriodo) {
        const data = new Date(tent.attemptDate);
        if (data < dataCortePeriodo) return false;
      }
      return true;
    });
  }, [tentativas, searchTerm, resultadoFiltro, canalFiltro, dataCortePeriodo]);

  const temFiltroAtivo = searchTerm || resultadoFiltro !== "todos" || canalFiltro !== "todos" || periodoFiltro !== "todos";

  const limparFiltros = () => {
    setSearchTerm("");
    setResultadoFiltro("todos");
    setCanalFiltro("todos");
    setPeriodoFiltro("todos");
    setCurrentPage(1);
  };

  const handleFilterChange = (setter: (v: any) => void) => (v: any) => {
    setter(v);
    setCurrentPage(1);
  };

  // Badges
  const getContactTypeBadge = (type: string) => {
    const map: Record<string, { label: string; className: string }> = {
      telefone: { label: "Telefone", className: "bg-blue-100 text-blue-800 border-blue-200" },
      whatsapp: { label: "WhatsApp", className: "bg-green-100 text-green-800 border-green-200" },
      email: { label: "E-mail", className: "bg-gray-100 text-gray-700 border-gray-200" },
      pessoal: { label: "Presencial", className: "bg-purple-100 text-purple-800 border-purple-200" },
    };
    const cfg = map[type] ?? { label: type, className: "bg-gray-100 text-gray-700 border-gray-200" };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <span className="text-muted-foreground text-sm">—</span>;
    const map: Record<string, { label: string; className: string }> = {
      sem_resposta: { label: "Sem Resposta", className: "bg-red-100 text-red-800 border-red-200" },
      promessa_pagamento: { label: "Promessa de Pagamento", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      acordo: { label: "Acordo Firmado", className: "bg-green-100 text-green-800 border-green-200" },
      recusa: { label: "Recusa", className: "bg-orange-100 text-orange-800 border-orange-200" },
      outro: { label: "Outro", className: "bg-gray-100 text-gray-700 border-gray-200" },
    };
    const cfg = map[result] ?? { label: result, className: "bg-gray-100 text-gray-700 border-gray-200" };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  };

  const taxaSucesso = estatisticas && estatisticas.total > 0
    ? ((Number(estatisticas.sucesso) / Number(estatisticas.total)) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Phone className="h-8 w-8 text-primary" />
              Histórico de Contatos
            </h1>
            <p className="text-muted-foreground mt-1">
              Registro de todas as tentativas de cobrança realizadas
            </p>
          </div>
          {can("tentativas", "exportar") && (
            <ExportExcelButton
              onClick={async () => {
                return await utils.client.exportacao.tentativas.mutate({
                  condominioId: condominioId || undefined,
                });
              }}
              label="Exportar Excel"
            />
          )}
        </div>

        {/* Cards de estatísticas */}
        {estatisticas && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5" /> Total de Contatos
                </CardDescription>
                <CardTitle className="text-3xl">{Number(estatisticas.total)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-red-600">
                  <Phone className="h-3.5 w-3.5" /> Sem Resposta
                </CardDescription>
                <CardTitle className="text-3xl text-red-600">{Number(estatisticas.semResposta)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-yellow-600">
                  <Calendar className="h-3.5 w-3.5" /> Promessas
                </CardDescription>
                <CardTitle className="text-3xl text-yellow-600">{Number(estatisticas.promessaPagamento)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1 text-green-600">
                  <TrendingUp className="h-3.5 w-3.5" /> Taxa de Sucesso
                </CardDescription>
                <CardTitle className="text-3xl text-green-600">{taxaSucesso}%</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Painel de Filtros */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Filtros</CardTitle>
              {temFiltroAtivo && (
                <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground h-7 px-2">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Linha 1: Condomínio (admin) + Busca */}
            <div className="flex flex-col md:flex-row gap-3">
              {user?.role === "admin" && (
                <Select
                  value={selectedCondominioId?.toString() ?? ""}
                  onValueChange={(v) => { setSelectedCondominioId(v ? Number(v) : null); setCurrentPage(1); }}
                >
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder="Selecione um condomínio" />
                  </SelectTrigger>
                  <SelectContent>
                    {condominios?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por devedor ou observações..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Linha 2: Resultado + Canal + Período */}
            <div className="flex flex-col md:flex-row gap-3">
              {/* Resultado */}
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Resultado</label>
                <Select value={resultadoFiltro} onValueChange={handleFilterChange(setResultadoFiltro)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os resultados</SelectItem>
                    <SelectItem value="sem_resposta">Sem Resposta</SelectItem>
                    <SelectItem value="promessa_pagamento">Promessa de Pagamento</SelectItem>
                    <SelectItem value="acordo">Acordo Firmado</SelectItem>
                    <SelectItem value="recusa">Recusa</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Canal */}
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Canal</label>
                <Select value={canalFiltro} onValueChange={handleFilterChange(setCanalFiltro)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os canais</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="pessoal">Presencial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Período */}
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Período</label>
                <Select value={periodoFiltro} onValueChange={handleFilterChange(setPeriodoFiltro)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todo o período</SelectItem>
                    <SelectItem value="hoje">Hoje</SelectItem>
                    <SelectItem value="semana">Esta semana</SelectItem>
                    <SelectItem value="mes">Este mês</SelectItem>
                    <SelectItem value="7dias">Últimos 7 dias</SelectItem>
                    <SelectItem value="30dias">Últimos 30 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Indicador de resultados filtrados */}
            {temFiltroAtivo && (
              <div className="flex items-center gap-2 pt-1">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{filteredTentativas.length}</span> resultado(s) encontrado(s)
                  {tentativas && filteredTentativas.length !== tentativas.length && (
                    <span className="ml-1">de {tentativas.length} total</span>
                  )}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Lista de Contatos
                </CardTitle>
                <CardDescription>
                  {filteredTentativas.length} registro(s)
                  {temFiltroAtivo && " (filtrado)"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
                <p className="mt-3 text-muted-foreground">Carregando...</p>
              </div>
            ) : !condominioId && user?.role === "admin" ? (
              <div className="text-center py-12 text-muted-foreground">
                <Phone className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Selecione um condomínio para visualizar os contatos</p>
              </div>
            ) : filteredTentativas.length > 0 ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Devedor</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Resultado</TableHead>
                      <TableHead>Observações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginateItems(filteredTentativas, currentPage, pageSize).map((tent) => (
                      <TableRow key={tent.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(new Date(tent.attemptDate), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell>{tent.devedorName ?? "Desconhecido"}</TableCell>
                        <TableCell>{getContactTypeBadge(tent.contactType)}</TableCell>
                        <TableCell>{getResultBadge(tent.result)}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                          {tent.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="p-4">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredTentativas.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
                  />
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Phone className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-2">
                  {temFiltroAtivo ? "Nenhum contato encontrado" : "Nenhum contato registrado"}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {temFiltroAtivo
                    ? "Tente ajustar os filtros para ver mais resultados"
                    : "Os contatos registrados aparecerão aqui"}
                </p>
                {temFiltroAtivo && (
                  <Button variant="outline" size="sm" className="mt-4" onClick={limparFiltros}>
                    <X className="h-4 w-4 mr-2" />
                    Limpar filtros
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
