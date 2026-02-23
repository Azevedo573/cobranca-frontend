import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, TrendingUp } from "lucide-react";

interface HistoricoConsolidacoesProps {
  acordoId: number;
}

export function HistoricoConsolidacoes({ acordoId }: HistoricoConsolidacoesProps) {
  const { data: historico, isLoading } = trpc.acordos.getHistorico.useQuery({ acordoId });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Histórico de Consolidações
          </CardTitle>
          <CardDescription>Carregando histórico...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!historico || historico.length <= 1) {
    return null; // Não mostrar se não houver consolidações
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Histórico de Consolidações
        </CardTitle>
        <CardDescription>
          Este acordo foi consolidado {historico.length - 1} vez(es)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {historico.map((acordo: any, index: number) => (
            <div
              key={acordo.id}
              className={`flex items-start gap-4 p-4 rounded-lg border ${
                index === 0 ? "bg-primary/5 border-primary" : "bg-muted/50"
              }`}
            >
              <div className="flex-shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    index === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {historico.length - index}
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {index === 0 && (
                      <Badge variant="default">Acordo Atual</Badge>
                    )}
                    {index > 0 && (
                      <Badge variant="outline">
                        {acordo.status === "cancelado" ? "Cancelado" : acordo.status}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    {new Date(acordo.createdAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Valor Total:</span>
                    <span className="ml-2 font-medium">
                      R$ {(acordo.totalAmount / 100).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Valor Acordado:</span>
                    <span className="ml-2 font-medium">
                      R$ {(acordo.agreedAmount / 100).toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Parcelas:</span>
                    <span className="ml-2 font-medium">
                      {acordo.parcelasPagas}/{acordo.parcelas}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Frequência:</span>
                    <span className="ml-2 font-medium capitalize">
                      {acordo.paymentFrequency}
                    </span>
                  </div>
                </div>
                {acordo.notes && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 mt-0.5" />
                    <span>{acordo.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
