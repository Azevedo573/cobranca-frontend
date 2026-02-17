import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, Circle, AlertCircle, DollarSign } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ControleParcelasProps {
  cobrancaId: number;
}

export function ControleParcelas({ cobrancaId }: ControleParcelasProps) {
  const utils = trpc.useUtils();

  // Buscar acordo ativo para esta cobrança
  const { data: acordoAtivo } = trpc.acordos.getByCobranca.useQuery({
    cobrancaId,
  });

  // Buscar parcelas do acordo
  const { data: parcelas, isLoading } = trpc.acordos.getParcelas.useQuery(
    { acordoId: acordoAtivo?.id || 0 },
    { enabled: !!acordoAtivo }
  );

  const darBaixaMutation = trpc.acordos.darBaixaParcela.useMutation({
    onSuccess: (data) => {
      toast.success(`Baixa registrada! Valor pago total: ${formatarMoeda(data.valorPagoTotal)}`);
      utils.acordos.getParcelas.invalidate();
      utils.acordos.getById.invalidate();
      utils.acordos.getByCobranca.invalidate();
    },
    onError: (error) => {
      toast.error("Erro ao dar baixa: " + error.message);
    },
  });

  const handleDarBaixa = (parcelaId: number) => {
    if (confirm("Confirma o pagamento desta parcela?")) {
      darBaixaMutation.mutate({
        parcelaId,
        dataPagamento: new Date(),
      });
    }
  };

  if (!acordoAtivo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Controle de Parcelas do Acordo</CardTitle>
          <CardDescription>
            Nenhum acordo ativo encontrado para esta cobrança.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatarMoeda = (valor: number | string) => {
    const numValue = typeof valor === 'string' ? parseFloat(valor) : valor;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue / 100);
  };

  const formatarData = (data: Date) => {
    return new Date(data).toLocaleDateString("pt-BR");
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      pendente: { label: "Pendente", variant: "secondary" as const, icon: Circle },
      pago: { label: "Pago", variant: "default" as const, icon: CheckCircle2 },
      atrasado: { label: "Atrasado", variant: "destructive" as const, icon: AlertCircle },
    };
    const config = statusMap[status as keyof typeof statusMap] || statusMap.pendente;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const parcelasPagas = parcelas?.filter((p) => p.status === "pago").length || 0;
  const totalParcelas = parcelas?.length || 0;
  const valorPago = parcelas
    ?.filter((p) => p.status === "pago")
    .reduce((sum, p) => sum + (typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount), 0) || 0;
  const agreedAmountNum = typeof acordoAtivo.agreedAmount === 'string' ? parseFloat(acordoAtivo.agreedAmount) : (acordoAtivo.agreedAmount || 0);
  const saldoDevedor = agreedAmountNum - valorPago;
  const progresso = totalParcelas > 0 ? (parcelasPagas / totalParcelas) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Controle de Parcelas do Acordo
        </CardTitle>
        <CardDescription>
          Gerencie os pagamentos das parcelas do acordo ativo
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Resumo do Acordo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Progresso</p>
            <p className="text-2xl font-bold">
              {parcelasPagas}/{totalParcelas}
            </p>
            <div className="w-full bg-secondary rounded-full h-2 mt-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progresso}%` }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Valor Pago</p>
            <p className="text-2xl font-bold text-green-600">
              {formatarMoeda(valorPago)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Saldo Devedor</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatarMoeda(saldoDevedor)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Valor Total</p>
            <p className="text-2xl font-bold">
              {formatarMoeda(acordoAtivo.agreedAmount)}
            </p>
          </div>
        </div>

        {/* Tabela de Parcelas */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parcela</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Carregando parcelas...
                  </TableCell>
                </TableRow>
              ) : parcelas && parcelas.length > 0 ? (
                parcelas.map((parcela) => (
                  <TableRow key={parcela.id}>
                    <TableCell className="font-medium">
                      {parcela.installmentNumber}/{totalParcelas}
                    </TableCell>
                    <TableCell>{formatarMoeda(parcela.amount)}</TableCell>
                    <TableCell>{formatarData(parcela.dueDate)}</TableCell>
                    <TableCell>{getStatusBadge(parcela.status)}</TableCell>
                    <TableCell>
                      {parcela.paymentDate
                        ? formatarData(parcela.paymentDate)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {parcela.status === "pendente" && (
                        <Button
                          size="sm"
                          onClick={() => handleDarBaixa(parcela.id)}
                          disabled={darBaixaMutation.isPending}
                        >
                          Dar Baixa
                        </Button>
                      )}
                      {parcela.status === "pago" && (
                        <CheckCircle2 className="h-5 w-5 text-green-600 ml-auto" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Nenhuma parcela encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
