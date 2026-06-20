import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useAuth } from "../_core/hooks/useAuth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { AlertCircle, CheckCircle2, Clock, DollarSign } from "lucide-react";

export default function AcordosAcompanhamento() {
  const { user } = useAuth();
  const [selectedCondominio, setSelectedCondominio] = useState<number | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [selectedAcordo, setSelectedAcordo] = useState<number | undefined>(undefined);

  // Queries
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const { data: acordos, refetch: refetchAcordos } = trpc.acordos.list.useQuery(
    { condominioId: selectedCondominio || user?.condominioId || 0 },
    { enabled: !!(selectedCondominio || user?.condominioId) }
  );

  const { data: parcelasVencidas } = trpc.acordos.getParcelasVencidas.useQuery(
    { condominioId: (selectedCondominio ?? user?.condominioId) as number | undefined },
    { enabled: !!(selectedCondominio ?? user?.condominioId) }
  );

  const { data: parcelasVencendo } = trpc.acordos.getVencimentosProximos.useQuery(
    { condominioId: (selectedCondominio ?? user?.condominioId) as number | undefined, dias: 7 },
    { enabled: !!(selectedCondominio ?? user?.condominioId) }
  );

  const { data: parcelas } = trpc.acordos.getParcelas.useQuery(
    { acordoId: selectedAcordo! },
    { enabled: !!selectedAcordo }
  );

  // Mutations
  const darBaixa = trpc.acordos.darBaixaParcela.useMutation({
    onSuccess: () => {
      refetchAcordos();
    },
  });

  // Filtrar acordos por status
  const acordosFiltrados = acordos?.filter(acordo => {
    if (statusFilter === "todos") return true;
    return acordo.status === statusFilter;
  });

  // Formatar moeda
  const formatCurrency = (value: string | number) => {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue);
  };

  // Formatar data
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  // Calcular dias de atraso
  const calcularDiasAtraso = (dataVencimento: Date | string) => {
    const hoje = new Date();
    const vencimento = new Date(dataVencimento);
    const diff = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Acompanhamento de Acordos</h1>
          <p className="text-muted-foreground">Gerencie acordos e controle pagamentos de parcelas</p>
        </div>
      </div>

      {/* Alertas */}
      {(parcelasVencidas && parcelasVencidas.length > 0) || (parcelasVencendo && parcelasVencendo.length > 0) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {parcelasVencidas && parcelasVencidas.length > 0 && (
            <Card className="p-4 border-red-200 bg-red-50">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900">Parcelas Vencidas</h3>
                  <p className="text-sm text-red-700 mt-1">
                    {parcelasVencidas.length} parcela(s) vencida(s) aguardando pagamento
                  </p>
                  <div className="mt-2 space-y-1">
                    {parcelasVencidas.slice(0, 3).map((p) => (
                      <div key={p.parcelaId} className="text-xs text-red-800">
                        • {p.devedorNome} - {formatCurrency(p.parcelaValor)} - {calcularDiasAtraso(p.dataVencimento)} dias de atraso
                      </div>
                    ))}
                    {parcelasVencidas.length > 3 && (
                      <div className="text-xs text-red-800">+ {parcelasVencidas.length - 3} mais</div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {parcelasVencendo && parcelasVencendo.length > 0 && (
            <Card className="p-4 border-yellow-200 bg-yellow-50">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-900">Parcelas Vencendo (7 dias)</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    {parcelasVencendo.length} parcela(s) vencendo nos próximos 7 dias
                  </p>
                  <div className="mt-2 space-y-1">
                    {parcelasVencendo.slice(0, 3).map((p) => (
                      <div key={p.parcelaId} className="text-xs text-yellow-800">
                        • {p.devedorNome} - {formatCurrency(p.parcelaValor)} - Vence em {formatDate(p.dataVencimento)}
                      </div>
                    ))}
                    {parcelasVencendo.length > 3 && (
                      <div className="text-xs text-yellow-800">+ {parcelasVencendo.length - 3} mais</div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      ) : null}

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex gap-4">
          {user?.role === "admin" && (
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Condomínio</label>
              <Select value={selectedCondominio?.toString()} onValueChange={(v) => setSelectedCondominio(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um condomínio" />
                </SelectTrigger>
                <SelectContent>
                  {condominios?.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="pago">Concluídos</SelectItem>
                <SelectItem value="cancelado">Cancelados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Lista de Acordos */}
      <Card>
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Acordos</h2>
          
          {!selectedCondominio && user?.role === "admin" ? (
            <div className="text-center py-12 text-muted-foreground">
              Selecione um condomínio para visualizar os acordos
            </div>
          ) : acordosFiltrados && acordosFiltrados.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Devedor</th>
                    <th className="text-left p-3">Valor Total</th>
                    <th className="text-left p-3">Valor Acordado</th>
                    <th className="text-left p-3">Valor Pago</th>
                    <th className="text-left p-3">Parcelas</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {acordosFiltrados.map((acordo) => {
                    const parcelasPagas = Math.floor((Number(acordo.valorPago) / Number(acordo.agreedAmount)) * acordo.installments);
                    const statusColor = 
                      acordo.status === "ativo" ? "bg-green-100 text-green-800" :
                      acordo.status === "pago" ? "bg-blue-100 text-blue-800" :
                      "bg-gray-100 text-gray-800";

                    return (
                      <tr key={acordo.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div>
                            <div className="font-medium">{acordo.devedorName}</div>
                            <div className="text-sm text-muted-foreground">
                              {acordo.devedorBloco && `Bloco ${acordo.devedorBloco} - `}
                              Unidade {acordo.devedorUnidade}
                            </div>
                          </div>
                        </td>
                        <td className="p-3">{formatCurrency(acordo.totalAmount)}</td>
                        <td className="p-3">{formatCurrency(acordo.agreedAmount)}</td>
                        <td className="p-3 font-semibold">{formatCurrency(acordo.valorPago)}</td>
                        <td className="p-3">
                          <span className="font-medium">{parcelasPagas}/{acordo.installments}</span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                            {acordo.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedAcordo(acordo.id)}
                          >
                            Ver Parcelas
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum acordo encontrado
            </div>
          )}
        </div>
      </Card>

      {/* Modal de Parcelas */}
      <Dialog open={!!selectedAcordo} onOpenChange={() => setSelectedAcordo(undefined)}>
        <DialogContent className="!max-w-7xl w-[92vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Parcelas do Acordo</DialogTitle>
          </DialogHeader>

          {parcelas && parcelas.length > 0 ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="text-sm text-muted-foreground">Total Pago</div>
                      <div className="text-lg font-semibold">
                        {formatCurrency(parcelas.filter(p => p.status === "pago").reduce((sum, p) => sum + Number(p.amount), 0))}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-muted-foreground">Parcelas Pagas</div>
                      <div className="text-lg font-semibold">
                        {parcelas.filter(p => p.status === "pago").length}/{parcelas.length}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    <div>
                      <div className="text-sm text-muted-foreground">Pendentes</div>
                      <div className="text-lg font-semibold">
                        {parcelas.filter(p => p.status === "pendente").length}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">Parcela</th>
                      <th className="text-left p-3">Valor</th>
                      <th className="text-left p-3">Vencimento</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-left p-3">Data Pagamento</th>
                      <th className="text-left p-3">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((parcela) => {
                      const diasAtraso = calcularDiasAtraso(parcela.dueDate);
                      const statusColor = 
                        parcela.status === "pago" ? "bg-green-100 text-green-800" :
                        diasAtraso > 0 ? "bg-red-100 text-red-800" :
                        "bg-yellow-100 text-yellow-800";

                      return (
                        <tr key={parcela.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-medium">{parcela.installmentNumber}/{parcelas.length}</td>
                          <td className="p-3">{formatCurrency(parcela.amount)}</td>
                          <td className="p-3">
                            {formatDate(parcela.dueDate)}
                            {diasAtraso > 0 && parcela.status === "pendente" && (
                              <span className="ml-2 text-xs text-red-600">({diasAtraso} dias de atraso)</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                              {parcela.status === "pago" ? "Pago" : diasAtraso > 0 ? "Atrasado" : "Pendente"}
                            </span>
                          </td>
                          <td className="p-3">
                            {parcela.paymentDate ? formatDate(parcela.paymentDate) : "-"}
                          </td>
                          <td className="p-3">
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
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Carregando parcelas...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
