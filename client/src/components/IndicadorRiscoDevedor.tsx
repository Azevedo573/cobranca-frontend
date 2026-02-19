import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Clock, DollarSign } from "lucide-react";

interface IndicadorRiscoDevedorProps {
  valorDevido: number;
  diasAtraso: number;
  tentativasSemSucesso: number;
  taxaRecuperacao: number;
  temAcordoAtivo: boolean;
}

export function IndicadorRiscoDevedor({
  valorDevido,
  diasAtraso,
  tentativasSemSucesso,
  taxaRecuperacao,
  temAcordoAtivo,
}: IndicadorRiscoDevedorProps) {
  // Cálculo do score de risco (0-100)
  const calcularScoreRisco = () => {
    let score = 0;

    // Fator 1: Valor devido (0-30 pontos)
    if (valorDevido > 50000) score += 30;
    else if (valorDevido > 20000) score += 20;
    else if (valorDevido > 10000) score += 10;

    // Fator 2: Dias de atraso (0-30 pontos)
    if (diasAtraso > 90) score += 30;
    else if (diasAtraso > 60) score += 20;
    else if (diasAtraso > 30) score += 10;

    // Fator 3: Tentativas sem sucesso (0-20 pontos)
    if (tentativasSemSucesso > 5) score += 20;
    else if (tentativasSemSucesso > 3) score += 10;
    else if (tentativasSemSucesso > 1) score += 5;

    // Fator 4: Taxa de recuperação (0-20 pontos - invertido)
    if (taxaRecuperacao < 20) score += 20;
    else if (taxaRecuperacao < 50) score += 10;

    // Bônus: Tem acordo ativo (-10 pontos)
    if (temAcordoAtivo) score = Math.max(0, score - 10);

    return Math.min(100, score);
  };

  const scoreRisco = calcularScoreRisco();

  const getNivelRisco = () => {
    if (scoreRisco >= 70) return { nivel: "Alto", cor: "text-red-600", bgCor: "bg-red-100", badge: "destructive" as const };
    if (scoreRisco >= 40) return { nivel: "Médio", cor: "text-yellow-600", bgCor: "bg-yellow-100", badge: "secondary" as const };
    return { nivel: "Baixo", cor: "text-green-600", bgCor: "bg-green-100", badge: "outline" as const };
  };

  const nivelRisco = getNivelRisco();

  const fatoresRisco = [
    {
      icone: <DollarSign className="h-4 w-4" />,
      titulo: "Valor Devido",
      valor: `R$ ${valorDevido.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      alerta: valorDevido > 20000,
    },
    {
      icone: <Clock className="h-4 w-4" />,
      titulo: "Dias em Atraso",
      valor: `${diasAtraso} dias`,
      alerta: diasAtraso > 60,
    },
    {
      icone: <AlertTriangle className="h-4 w-4" />,
      titulo: "Tentativas Sem Sucesso",
      valor: `${tentativasSemSucesso} tentativas`,
      alerta: tentativasSemSucesso > 3,
    },
    {
      icone: <TrendingUp className="h-4 w-4" />,
      titulo: "Taxa de Recuperação",
      valor: `${taxaRecuperacao.toFixed(1)}%`,
      alerta: taxaRecuperacao < 30,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Indicador de Risco</CardTitle>
        <CardDescription>Análise de probabilidade de inadimplência</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Score principal */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Nível de Risco</p>
            <div className="flex items-center gap-2">
              <Badge variant={nivelRisco.badge} className="text-lg px-3 py-1">
                {nivelRisco.nivel}
              </Badge>
              {temAcordoAtivo && (
                <Badge variant="outline" className="text-xs">
                  Acordo Ativo
                </Badge>
              )}
            </div>
          </div>

          {/* Medidor visual */}
          <div className="text-center">
            <div className={`text-4xl font-bold ${nivelRisco.cor}`}>{scoreRisco}</div>
            <p className="text-xs text-muted-foreground">Score</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="space-y-2">
          <div className="w-full bg-muted rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                scoreRisco >= 70 ? "bg-red-500" : scoreRisco >= 40 ? "bg-yellow-500" : "bg-green-500"
              }`}
              style={{ width: `${scoreRisco}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Baixo</span>
            <span>Médio</span>
            <span>Alto</span>
          </div>
        </div>

        {/* Fatores de risco */}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-sm font-medium">Fatores Analisados</p>
          {fatoresRisco.map((fator, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-2 rounded-lg ${
                fator.alerta ? "bg-red-50 dark:bg-red-950/20" : "bg-muted/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={fator.alerta ? "text-red-600" : "text-muted-foreground"}>
                  {fator.icone}
                </div>
                <span className="text-sm">{fator.titulo}</span>
              </div>
              <span className={`text-sm font-medium ${fator.alerta ? "text-red-600" : ""}`}>
                {fator.valor}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
