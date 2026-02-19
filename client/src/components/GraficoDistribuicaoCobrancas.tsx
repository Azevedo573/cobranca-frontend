import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda, calcularValorDevido, type TaxasCondominio } from "../../../shared/calculos";
import { useMemo } from "react";

interface CobrancaPorTipo {
  tipo: string;
  quantidade: number;
  valorTotal: number;
  cor: string;
}

interface GraficoDistribuicaoCobrancasProps {
  cobrancas: any[];
  taxas?: TaxasCondominio | null;
}

export function GraficoDistribuicaoCobrancas({ cobrancas, taxas }: GraficoDistribuicaoCobrancasProps) {
  const distribuicao = useMemo(() => {
    const coresPorTipo: Record<string, string> = {
      condominio: "#3b82f6", // blue-500
      salao_jogos: "#8b5cf6", // violet-500
      churrasqueira: "#f59e0b", // amber-500
      multa: "#ef4444", // red-500
      outros: "#6b7280", // gray-500
    };

    const labelsPorTipo: Record<string, string> = {
      condominio: "Condomínio",
      salao_jogos: "Salão de Jogos",
      churrasqueira: "Churrasqueira",
      multa: "Multa",
      outros: "Outros",
    };

    const grupos = cobrancas.reduce((acc: Record<string, CobrancaPorTipo>, cob: any) => {
      const tipo = cob.tipoCobranca || "outros";
      if (!acc[tipo]) {
        acc[tipo] = {
          tipo: labelsPorTipo[tipo] || tipo,
          quantidade: 0,
          valorTotal: 0,
          cor: coresPorTipo[tipo] || coresPorTipo.outros,
        };
      }
      acc[tipo].quantidade++;
      
      // Calcular valor atualizado se taxas estiverem disponíveis
      let valorAtualizado = cob.amount / 100;  // Converter centavos para reais
      if (taxas && cob.status !== "pago") {
        const breakdown = calcularValorDevido(cob.amount / 100, new Date(cob.dueDate), taxas);
        valorAtualizado = breakdown.valorTotal;
      }
      
      acc[tipo].valorTotal += valorAtualizado;
      return acc;
    }, {});

    return Object.values(grupos);
  }, [cobrancas, taxas]);

  const valorTotal = distribuicao.reduce((sum, item) => sum + item.valorTotal, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de Cobranças</CardTitle>
        <CardDescription>Valor total por tipo de cobrança</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Gráfico de barras horizontal */}
          <div className="space-y-3">
            {distribuicao.map((item) => {
              const percentual = valorTotal > 0 ? (item.valorTotal / valorTotal) * 100 : 0;
              return (
                <div key={item.tipo} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.cor }}
                      />
                      <span className="font-medium">{item.tipo}</span>
                      <span className="text-muted-foreground">({item.quantidade})</span>
                    </div>
                    <span className="font-semibold">{formatarMoeda(item.valorTotal)}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${percentual}%`,
                        backgroundColor: item.cor,
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground text-right">
                    {percentual.toFixed(1)}% do total
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumo */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between font-semibold">
              <span>Total</span>
              <span className="text-lg">{formatarMoeda(valorTotal)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
