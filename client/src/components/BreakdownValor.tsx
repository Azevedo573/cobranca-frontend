import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatarMoeda, type BreakdownValor } from "../../../shared/calculos";
import { Calculator, TrendingUp, AlertCircle, Briefcase } from "lucide-react";

interface BreakdownValorProps {
  breakdown: BreakdownValor;
  showDetails?: boolean;
}

export default function BreakdownValorComponent({ breakdown, showDetails = true }: BreakdownValorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Cálculo do Valor Devido
        </CardTitle>
        {breakdown.mesesAtraso > 0 && (
          <CardDescription className="flex items-center gap-1 text-amber-600">
            <AlertCircle className="h-4 w-4" />
            {breakdown.mesesAtraso} {breakdown.mesesAtraso === 1 ? "mês" : "meses"} de atraso
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showDetails && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center pb-2 border-b">
              <span className="text-muted-foreground">Valor Original</span>
              <span className="font-medium">{formatarMoeda(breakdown.valorOriginal)}</span>
            </div>
            
            {breakdown.juros > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Juros ({breakdown.mesesAtraso} {breakdown.mesesAtraso === 1 ? "mês" : "meses"})
                </span>
                <span className="font-medium text-amber-600">
                  + {formatarMoeda(breakdown.juros)}
                </span>
              </div>
            )}
            
            {breakdown.multa > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Multa
                </span>
                <span className="font-medium text-amber-600">
                  + {formatarMoeda(breakdown.multa)}
                </span>
              </div>
            )}
            
            {breakdown.honorarios > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Briefcase className="h-3 w-3" />
                  Honorários
                </span>
                <span className="font-medium text-amber-600">
                  + {formatarMoeda(breakdown.honorarios)}
                </span>
              </div>
            )}
          </div>
        )}
        
        <div className="flex justify-between items-center pt-3 border-t-2 border-primary/20">
          <span className="font-semibold text-lg">Valor Total</span>
          <span className="font-bold text-2xl text-primary">
            {formatarMoeda(breakdown.valorTotal)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
