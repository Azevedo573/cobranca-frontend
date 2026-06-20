import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  HandshakeIcon, Search, Eye, Calendar, DollarSign, User,
  AlertCircle, Clock, CheckCircle2, AlertTriangle,
  FileText, ExternalLink, Copy, Loader2,
} from "lucide-react";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

export default function Acordos() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [selectedCondominio, setSelectedCondominio] = useState<number | undefined>(undefined);
  const [selectedAcordoId, setSelectedAcordoId] = useState<number | undefined>(undefined);
  const [diasVencimento, setDiasVencimento] = useState<7 | 15 | 30>(7);

  // Determinar condominioId
  const condominioId = user?.role === "admin"
    ? (selectedCondominio ?? undefined)
    : (user?.condominioId ?? undefined);

  // Queries
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: acordos, isLoading, refetch: refetchAcordos } = trpc.acordos.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: !!condominioId }
  );

  const { data: parcelasVencidas } = trpc.acordos.getParcelasVencidas.useQuery(
    { condominioId },
    { enabled: !!condominioId }
  );

  const { data: parcelasVencendo } = trpc.acordos.getVencimentosProximos.useQuery(
    { condominioId, dias: diasVencimento },
    { enabled: !!condominioId }
  );

  const { data: parcelasModal } = trpc.acordos.getParcelas.useQuery(
    { acordoId: selectedAcordoId! },
    { enabled: !!selectedAcordoId }
  );

  // Detectar modoBoleto do acordo selecionado
  const acordoSelecionado = acordos?.find((a) => a.id === selectedAcordoId);
  const { data: condominioModal } = trpc.condominios.getById.useQuery(
    { id: acordoSelecionado?.condominioId ?? 0 },
    { enabled: !!acordoSelecionado?.condominioId }
  );
  const modoBoleto = ((condominioModal as any)?.modoBoleto || "cnab240") as "cnab240" | "api_btg";

  // Estado de boletos gerados por parcela
  const [boletoParcelas, setBoletoParcelas] = useState<Record<number, { url: string; linhaDigitavel: string; pixCopiaCola: string | null }>>({});
  const [copiandoParcela, setCopiandoParcela] = useState<Record<number, 'linha' | 'pix' | null>>({});

  const utils = trpc.useUtils();

  // Mutation para gerar PDF de parcela (CNAB)
  const gerarPDFParcelaMutation = trpc.acordos.gerarBoletoPDFParcela.useMutation({
    onSuccess: (data, variables) => {
      setBoletoParcelas(prev => ({
        ...prev,
        [variables.parcelaId]: {
          url: data.url,
          linhaDigitavel: data.linhaDigitavel,
          pixCopiaCola: data.pixCopiaCola ?? null,
        },
      }));
      window.open(data.url, '_blank');
    },
    onError: (err) => toast.error('Erro ao gerar PDF: ' + err.message),
  });

  // Mutation para emitir boleto BTG
  const emitirBtgMutation = trpc.btg.emitirBoletoParcela.useMutation({
    onSuccess: () => {
      utils.acordos.getParcelas.invalidate({ acordoId: selectedAcordoId! });
      toast.success('Boleto BTG emitido com sucesso!');
    },
    onError: (err) => toast.error('Erro ao emitir boleto BTG: ' + err.message),
  });

  // Mutations
  const darBaixa = trpc.acordos.darBaixaParcela.useMutation({
    onSuccess: () => {
      refetchAcordos();
      toast.success("Baixa registrada com sucesso");
    },
    onError: () => toast.error("Erro ao registrar baixa"),
  });

  // Filtros da aba Lista
  const acordosFiltrados = acordos?.filter((acordo) => {
    const matchSearch = searchTerm === "" ||
      acordo.devedorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acordo.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === "todos" || acordo.status === statusFilter;
    return matchSearch && matchStatus;
  }) ?? [];

  // Helpers
  const formatCurrency = (value: number | string) => {
    const n = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n / 100);
  };

  const formatDate = (date: Date | string) =>
    new Date(date).toLocaleDateString("pt-BR");

  const calcularDiasAtraso = (dataVencimento: Date | string) => {
    const diff = Math.floor((Date.now() - new Date(dataVencimento).getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      ativo: { label: "Ativo", className: "bg-green-100 text-green-800 border-green-200" },
      pago: { label: "Pago", className: "bg-blue-100 text-blue-800 border-blue-200" },
      cancelado: { label: "Cancelado", className: "bg-gray-100 text-gray-700 border-gray-200" },
    };
    const cfg = map[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  };

  // Stats
  const totalAtivos = acordos?.filter(a => a.status === "ativo").length ?? 0;
  const totalPagos = acordos?.filter(a => a.status === "pago").length ?? 0;
  const totalCancelados = acordos?.filter(a => a.status === "cancelado").length ?? 0;

  const semCondominio = !condominioId;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <HandshakeIcon className="h-8 w-8 text-primary" />
              Acordos
            </h1>
            <p className="text-muted-foreground mt-1">
              Gestão de acordos, parcelamentos e acompanhamento de pagamentos
            </p>
          </div>
          <div className="flex items-center gap-3">
            {can("acordos", "exportar") && (
              <ExportExcelButton
                onClick={async () => {
                  return await utils.client.exportacao.acordos.mutate({
                    condominioId: condominioId ?? undefined,
                  });
                }}
                label="Exportar Excel"
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Filtro de Condomínio (admin) */}
        {user?.role === "admin" && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium whitespace-nowrap">Condomínio</label>
                <Select
                  value={selectedCondominio?.toString() ?? ""}
                  onValueChange={(v) => setSelectedCondominio(v ? Number(v) : undefined)}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue placeholder="Selecione um condomínio" />
                  </SelectTrigger>
                  <SelectContent>
                    {condominios?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {semCondominio ? (
          <Card className="p-12 text-center">
            <HandshakeIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Selecione um condomínio para visualizar os acordos</p>
          </Card>
        ) : (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total</CardDescription>
                  <CardTitle className="text-3xl">{acordos?.length ?? 0}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Ativos</CardDescription>
                  <CardTitle className="text-3xl text-green-600">{totalAtivos}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Pagos</CardDescription>
                  <CardTitle className="text-3xl text-blue-600">{totalPagos}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Vencidas</CardDescription>
                  <CardTitle className="text-3xl text-red-600">{parcelasVencidas?.length ?? 0}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Abas */}
            <Tabs defaultValue="lista">
              <TabsList className="grid grid-cols-3 w-full max-w-lg">
                <TabsTrigger value="lista">
                  Lista de Acordos
                  {acordosFiltrados.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">{acordosFiltrados.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="vencidas">
                  Parcelas Vencidas
                  {(parcelasVencidas?.length ?? 0) > 0 && (
                    <Badge variant="destructive" className="ml-2 text-xs">{parcelasVencidas!.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="proximas">
                  Vencimentos Próximos
                  {(parcelasVencendo?.length ?? 0) > 0 && (
                    <Badge className="ml-2 text-xs bg-yellow-500 text-white">{parcelasVencendo!.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* ── ABA 1: Lista de Acordos ── */}
              <TabsContent value="lista" className="space-y-4 mt-4">
                {/* Filtros */}
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Buscar por devedor ou observações..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os status</SelectItem>
                          <SelectItem value="ativo">Ativos</SelectItem>
                          <SelectItem value="pago">Pagos</SelectItem>
                          <SelectItem value="cancelado">Cancelados</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {isLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
                    <p className="mt-3 text-muted-foreground">Carregando acordos...</p>
                  </div>
                ) : acordosFiltrados.length === 0 ? (
                  <Card className="p-12 text-center">
                    <HandshakeIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="font-semibold">Nenhum acordo encontrado</p>
                    <p className="text-sm text-muted-foreground mt-1">Tente ajustar os filtros</p>
                  </Card>
                ) : (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Devedor</TableHead>
                          <TableHead>Valor Total</TableHead>
                          <TableHead>Valor Acordado</TableHead>
                          <TableHead>Valor Pago</TableHead>
                          <TableHead>Parcelas</TableHead>
                          <TableHead>1º Pagamento</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {acordosFiltrados.map((acordo) => {
                          const parcelasPagas = acordo.agreedAmount > 0
                            ? Math.floor((Number(acordo.valorPago) / Number(acordo.agreedAmount)) * acordo.installments)
                            : 0;
                          return (
                            <TableRow key={acordo.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div>
                                    <p className="font-medium">{acordo.devedorName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {acordo.devedorBloco && `Bloco ${acordo.devedorBloco} · `}
                                      Unidade {acordo.devedorUnidade}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{formatCurrency(acordo.totalAmount)}</TableCell>
                              <TableCell className="text-green-700 font-medium">{formatCurrency(acordo.agreedAmount)}</TableCell>
                              <TableCell className="font-semibold">{formatCurrency(acordo.valorPago)}</TableCell>
                              <TableCell>
                                <span className="font-medium">{parcelasPagas}/{acordo.installments}</span>
                              </TableCell>
                              <TableCell>{formatDate(acordo.firstPaymentDate)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getStatusBadge(acordo.status)}
                                  <span className="text-xs font-mono text-muted-foreground"># {String(acordo.id).padStart(6, '0')}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedAcordoId(acordo.id)}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Parcelas
                                  </Button>
                                  <Link href={`/acordos/${acordo.id}`}>
                                    <Button variant="outline" size="sm">
                                      <Eye className="h-4 w-4 mr-1" />
                                      Detalhes
                                    </Button>
                                  </Link>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </Card>
                )}
              </TabsContent>

              {/* ── ABA 2: Parcelas Vencidas ── */}
              <TabsContent value="vencidas" className="mt-4">
                {!parcelasVencidas || parcelasVencidas.length === 0 ? (
                  <Card className="p-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="font-semibold text-green-700">Nenhuma parcela vencida</p>
                    <p className="text-sm text-muted-foreground mt-1">Todos os acordos estão em dia</p>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-red-700">
                        <AlertCircle className="h-5 w-5" />
                        {parcelasVencidas.length} parcela(s) vencida(s)
                      </CardTitle>
                      <CardDescription>Parcelas que passaram da data de vencimento e ainda não foram pagas</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Devedor</TableHead>
                            <TableHead>Parcela</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Atraso</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parcelasVencidas.map((p) => {
                            const diasAtraso = calcularDiasAtraso(p.dataVencimento);
                            return (
                              <TableRow key={p.parcelaId} className="bg-red-50/30">
                                <TableCell className="font-medium">{p.devedorNome}</TableCell>
                                <TableCell>Parcela {p.parcelaNumero}</TableCell>
                                <TableCell>{formatCurrency(p.parcelaValor)}</TableCell>
                                <TableCell>{formatDate(p.dataVencimento)}</TableCell>
                                <TableCell>
                                  <span className="text-red-700 font-semibold text-sm">
                                    {diasAtraso} dia(s)
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-700 border-green-300 hover:bg-green-50"
                                      onClick={() => {
                                        if (confirm("Confirmar pagamento desta parcela?")) {
                                          darBaixa.mutate({ parcelaId: p.parcelaId });
                                        }
                                      }}
                                      disabled={darBaixa.isPending}
                                    >
                                      <CheckCircle2 className="h-4 w-4 mr-1" />
                                      Dar Baixa
                                    </Button>
                                    <Link href={`/acordos/${p.acordoId}`}>
                                      <Button variant="ghost" size="sm">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </Link>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ── ABA 3: Vencimentos Próximos ── */}
              <TabsContent value="proximas" className="space-y-4 mt-4">
                {/* Filtro de dias */}
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium whitespace-nowrap">Vencendo nos próximos</label>
                      <div className="flex gap-2">
                        {([7, 15, 30] as const).map((d) => (
                          <Button
                            key={d}
                            variant={diasVencimento === d ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDiasVencimento(d)}
                          >
                            {d} dias
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {!parcelasVencendo || parcelasVencendo.length === 0 ? (
                  <Card className="p-12 text-center">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="font-semibold">Nenhum vencimento nos próximos {diasVencimento} dias</p>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-yellow-700">
                        <Clock className="h-5 w-5" />
                        {parcelasVencendo.length} parcela(s) vencendo em {diasVencimento} dias
                      </CardTitle>
                      <CardDescription>Parcelas próximas do vencimento — considere enviar lembretes</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Devedor</TableHead>
                            <TableHead>Parcela</TableHead>
                            <TableHead>Valor</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Dias Restantes</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parcelasVencendo.map((p) => {
                            const diasRestantes = Math.ceil(
                              (new Date(p.dataVencimento).getTime() - Date.now()) / 86400000
                            );
                            const urgente = diasRestantes <= 3;
                            return (
                              <TableRow key={p.parcelaId} className={urgente ? "bg-yellow-50/40" : ""}>
                                <TableCell className="font-medium">{p.devedorNome}</TableCell>
                                <TableCell>Parcela {p.parcelaNumero}</TableCell>
                                <TableCell>{formatCurrency(p.parcelaValor)}</TableCell>
                                <TableCell>{formatDate(p.dataVencimento)}</TableCell>
                                <TableCell>
                                  <span className={`font-semibold text-sm ${urgente ? "text-orange-600" : "text-muted-foreground"}`}>
                                    {diasRestantes === 0 ? "Hoje" : `${diasRestantes} dia(s)`}
                                    {urgente && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Link href={`/acordos/${p.acordoId}`}>
                                    <Button variant="ghost" size="sm">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Modal de Parcelas do Acordo */}
      <Dialog open={!!selectedAcordoId} onOpenChange={() => setSelectedAcordoId(undefined)}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Parcelas do Acordo</DialogTitle>
          </DialogHeader>

          {parcelasModal && parcelasModal.length > 0 ? (
            <div className="space-y-4">
              {/* Mini resumo */}
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Total Pago</p>
                      <p className="font-semibold text-sm">
                        {formatCurrency(parcelasModal.filter(p => p.status === "pago").reduce((s, p) => s + Number(p.amount), 0))}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Pagas</p>
                      <p className="font-semibold text-sm">
                        {parcelasModal.filter(p => p.status === "pago").length}/{parcelasModal.length}
                      </p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                      <p className="font-semibold text-sm">
                        {parcelasModal.filter(p => p.status === "pendente").length}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              <Table>
                  <TableHeader>
                  <TableRow>
                    <TableHead>Parcela</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Boleto</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parcelasModal.map((parcela) => {
                    const diasAtraso = calcularDiasAtraso(parcela.dueDate);
                    const atrasada = parcela.status === "pendente" && diasAtraso > 0;
                    return (
                      <TableRow key={parcela.id}>
                        <TableCell className="font-medium">{parcela.installmentNumber}/{parcelasModal.length}</TableCell>
                        <TableCell>{formatCurrency(parcela.amount)}</TableCell>
                        <TableCell>
                          {formatDate(parcela.dueDate)}
                          {atrasada && (
                            <span className="ml-1 text-xs text-red-600">({diasAtraso}d atraso)</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                            parcela.status === "pago"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : atrasada
                              ? "bg-red-100 text-red-800 border-red-200"
                              : "bg-yellow-100 text-yellow-800 border-yellow-200"
                          }`}>
                            {parcela.status === "pago" ? "Pago" : atrasada ? "Atrasado" : "Pendente"}
                          </span>
                        </TableCell>
                        <TableCell>{parcela.paymentDate ? formatDate(parcela.paymentDate) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {modoBoleto === "api_btg" ? (
                              (parcela as any).btgBankSlipUrl ? (
                                <div className="flex flex-col gap-1">
                                  <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => window.open((parcela as any).btgBankSlipUrl, "_blank")}>
                                    <ExternalLink className="h-3 w-3 mr-1" />Boleto BTG
                                  </Button>
                                  {(parcela as any).btgPixCopiaECola && (
                                    <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-green-300 text-green-700 hover:bg-green-50"
                                      onClick={async () => {
                                        await navigator.clipboard.writeText((parcela as any).btgPixCopiaECola);
                                        setCopiandoParcela(prev => ({ ...prev, [parcela.id]: 'pix' }));
                                        toast.success('PIX copiado!');
                                        setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcela.id]: null })), 2000);
                                      }}
                                    >
                                      {copiandoParcela[parcela.id] === 'pix' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                      <span className="ml-1">Copiar PIX</span>
                                    </Button>
                                  )}
                                  {(parcela as any).btgStatus && (
                                    <Badge variant="outline" className="text-xs w-fit">{(parcela as any).btgStatus}</Badge>
                                  )}
                                </div>
                              ) : (
                                <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                                  onClick={() => emitirBtgMutation.mutate({ parcelaId: parcela.id })}
                                  disabled={emitirBtgMutation.isPending}
                                >
                                  {emitirBtgMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
                                  <span className="ml-1">Emitir BTG</span>
                                </Button>
                              )
                            ) : (
                              /* CNAB 240 */
                              <div className="flex flex-col gap-1">
                                {(parcela as any).statusRemessa === "remessa_gerada" && (
                                  <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs gap-1"><FileText className="h-3 w-3" />Remessa Gerada</Badge>
                                )}
                                {(parcela as any).statusRemessa === "enviado" && (
                                  <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Enviado</Badge>
                                )}
                                {(parcela as any).statusRemessa === "retorno_recebido" && (
                                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Confirmado</Badge>
                                )}
                                {(parcela as any).nossoNumero && (
                                  <p className="text-xs font-mono text-muted-foreground">{(parcela as any).nossoNumero}</p>
                                )}
                                {!(parcela as any).statusRemessa && !((parcela as any).nossoNumero) && (
                                  <span className="text-xs text-muted-foreground italic">Aguardando remessa</span>
                                )}
                                {(parcela as any).nossoNumero && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {!boletoParcelas[parcela.id] ? (
                                      <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                                        onClick={() => gerarPDFParcelaMutation.mutate({ parcelaId: parcela.id })}
                                        disabled={gerarPDFParcelaMutation.isPending}
                                      >
                                        {gerarPDFParcelaMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                                        <span className="ml-1">PDF</span>
                                      </Button>
                                    ) : (
                                      <>
                                        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => window.open(boletoParcelas[parcela.id].url, '_blank')}>
                                          <ExternalLink className="h-3 w-3" /><span className="ml-1">Abrir</span>
                                        </Button>
                                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                                          onClick={async () => {
                                            await navigator.clipboard.writeText(boletoParcelas[parcela.id].linhaDigitavel);
                                            setCopiandoParcela(prev => ({ ...prev, [parcela.id]: 'linha' }));
                                            toast.success('Linha digitável copiada!');
                                            setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcela.id]: null })), 2000);
                                          }}
                                        >
                                          {copiandoParcela[parcela.id] === 'linha' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                          <span className="ml-1">Linha</span>
                                        </Button>
                                      </>
                                    )}
                                    {(boletoParcelas[parcela.id]?.pixCopiaCola || (parcela as any).pixCopiaCola) && (
                                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 border-green-300 text-green-700 hover:bg-green-50"
                                        onClick={async () => {
                                          const pix = boletoParcelas[parcela.id]?.pixCopiaCola || (parcela as any).pixCopiaCola;
                                          await navigator.clipboard.writeText(pix);
                                          setCopiandoParcela(prev => ({ ...prev, [parcela.id]: 'pix' }));
                                          toast.success('Pix copia e cola copiado!');
                                          setTimeout(() => setCopiandoParcela(prev => ({ ...prev, [parcela.id]: null })), 2000);
                                        }}
                                      >
                                        {copiandoParcela[parcela.id] === 'pix' ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                                        <span className="ml-1">Pix</span>
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {parcela.status === "pendente" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                if (confirm("Confirmar pagamento desta parcela?")) {
                                  darBaixa.mutate({ parcelaId: parcela.id });
                                }
                              }}
                              disabled={darBaixa.isPending}
                            >
                              Dar Baixa
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">Carregando parcelas...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
