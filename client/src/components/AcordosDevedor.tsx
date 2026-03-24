import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Calendar,
  DollarSign,
  FileText,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

interface AcordosDevedorProps {
  devedorId: number;
}

function ParcelasAcordo({ acordoId }: { acordoId: number }) {
  const { data: parcelas, isLoading } = trpc.acordos.getParcelas.useQuery({ acordoId });

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor / 100);

  const formatarData = (data: Date | string) =>
    new Date(data).toLocaleDateString("pt-BR");

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-2">Carregando parcelas...</p>;
  }

  if (!parcelas || parcelas.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Nenhuma parcela encontrada.</p>;
  }

  const getStatusIcon = (status: string) => {
    if (status === "pago") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (status === "atrasado") return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
  };

  const getStatusLabel = (status: string) => {
    if (status === "pago") return "Pago";
    if (status === "atrasado") return "Atrasado";
    return "Pendente";
  };

  const pagas = parcelas.filter((p) => p.status === "pago").length;
  const total = parcelas.length;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">
          Parcelas: {pagas}/{total} pagas
        </p>
        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: `${(pagas / total) * 100}%` }}
          />
        </div>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
        {parcelas.map((parcela) => (
          <div
            key={parcela.id}
            className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50"
          >
            <div className="flex items-center gap-1.5">
              {getStatusIcon(parcela.status)}
              <span className="font-medium">Parcela {parcela.installmentNumber}</span>
              <span className="text-muted-foreground">— {getStatusLabel(parcela.status)}</span>
            </div>
            <div className="flex items-center gap-3 text-right">
              <span className="text-muted-foreground">
                {formatarData(parcela.dueDate)}
              </span>
              <span className="font-semibold">{formatarMoeda(parcela.amount)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AcordosDevedor({ devedorId }: AcordosDevedorProps) {
  const { data: acordos, isLoading } = trpc.acordos.listByDevedor.useQuery({ devedorId });
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  const toggleExpandir = (acordoId: number) => {
    const novo = new Set(expandidos);
    if (novo.has(acordoId)) {
      novo.delete(acordoId);
    } else {
      novo.add(acordoId);
    }
    setExpandidos(novo);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      { variant: "default" | "secondary" | "destructive" | "outline"; label: string }
    > = {
      ativo: { variant: "default", label: "Ativo" },
      concluido: { variant: "secondary", label: "Concluído" },
      cancelado: { variant: "destructive", label: "Cancelado" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor / 100);

  const formatarData = (data: Date | string) =>
    new Date(data).toLocaleDateString("pt-BR");

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
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpandir(acordo.id)}
                    className="text-xs"
                  >
                    {expandidos.has(acordo.id) ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5 mr-1" />
                        Ocultar parcelas
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 mr-1" />
                        Ver parcelas
                      </>
                    )}
                  </Button>
                  <Link href={`/acordos/${acordo.id}`}>
                    <Button variant="outline" size="sm">
                      Ver Detalhes
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
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

              {/* Parcelas expandíveis */}
              {expandidos.has(acordo.id) && <ParcelasAcordo acordoId={acordo.id} />}

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
