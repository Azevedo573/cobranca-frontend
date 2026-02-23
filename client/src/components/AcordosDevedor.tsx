import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Calendar, DollarSign, FileText, TrendingUp } from "lucide-react";

interface AcordosDevedorProps {
  devedorId: number;
}

export function AcordosDevedor({ devedorId }: AcordosDevedorProps) {
  const { data: acordos, isLoading } = trpc.acordos.listByDevedor.useQuery({ devedorId });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      ativo: { variant: "default", label: "Ativo" },
      concluido: { variant: "secondary", label: "Concluído" },
      cancelado: { variant: "destructive", label: "Cancelado" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(valor / 100);
  };

  const formatarData = (data: Date | string) => {
    return new Date(data).toLocaleDateString("pt-BR");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Acordos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando acordos...</p>
        </CardContent>
      </Card>
    );
  }

  if (!acordos || acordos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Acordos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum acordo registrado para este devedor.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Acordos ({acordos.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {acordos.map((acordo) => (
          <Card key={acordo.id} className="border-l-4 border-l-primary">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">Acordo #{acordo.id}</h4>
                    {getStatusBadge(acordo.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Criado em {formatarData(acordo.createdAt)}
                  </p>
                </div>
                <Link href={`/acordos/${acordo.id}`}>
                  <Button variant="outline" size="sm">
                    Ver Detalhes
                  </Button>
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Valor Total
                  </p>
                  <p className="text-sm font-semibold">{formatarMoeda(acordo.totalAmount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Valor Acordado
                  </p>
                  <p className="text-sm font-semibold">{formatarMoeda(acordo.agreedAmount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Parcelas</p>
                  <p className="text-sm font-semibold">{acordo.installments}x</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Primeiro Vencimento
                  </p>
                  <p className="text-sm font-semibold">{formatarData(acordo.firstPaymentDate)}</p>
                </div>
              </div>

              {acordo.notes && (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Observações:</p>
                  <p className="text-sm">{acordo.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}
