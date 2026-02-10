import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { formatarMoeda } from "../../../shared/calculos";

interface MetricaProps {
  titulo: string;
  valor: string | number;
  subtitulo?: string;
  icone: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  cor?: "verde" | "vermelho" | "amarelo" | "azul";
}

function CardMetrica({ titulo, valor, subtitulo, icone, trend, cor = "azul" }: MetricaProps) {
  const coresIcone = {
    verde: "text-green-600 bg-green-100",
    vermelho: "text-red-600 bg-red-100",
    amarelo: "text-yellow-600 bg-yellow-100",
    azul: "text-blue-600 bg-blue-100",
  };

  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <div className={`p-2 rounded-lg ${coresIcone[cor]}`}>
          {icone}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{valor}</div>
        {subtitulo && (
          <div className="flex items-center gap-1 mt-1">
            {TrendIcon && <TrendIcon className="h-3 w-3 text-muted-foreground" />}
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface DashboardDevedorMetricasProps {
  valorTotalDevido: number;
  valorOriginal: number;
  numeroCobrancas: number;
  cobrancasPendentes: number;
  cobrancasEmAcordo: number;
  cobrancasPagas: number;
  tentativasTotal: number;
  tentativasUltimos30Dias: number;
  diasDesdeUltimaTentativa: number | null;
  taxaRecuperacao: number;
}

export function DashboardDevedorMetricas({
  valorTotalDevido,
  valorOriginal,
  numeroCobrancas,
  cobrancasPendentes,
  cobrancasEmAcordo,
  cobrancasPagas,
  tentativasTotal,
  tentativasUltimos30Dias,
  diasDesdeUltimaTentativa,
  taxaRecuperacao,
}: DashboardDevedorMetricasProps) {
  const jurosAcumulados = valorTotalDevido - valorOriginal;
  const percentualJuros = valorOriginal > 0 ? ((jurosAcumulados / valorOriginal) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <CardMetrica
        titulo="Valor Total Devido"
        valor={formatarMoeda(valorTotalDevido)}
        subtitulo={`${formatarMoeda(jurosAcumulados)} em encargos (+${percentualJuros}%)`}
        icone={<DollarSign className="h-4 w-4" />}
        cor="vermelho"
        trend="up"
      />

      <CardMetrica
        titulo="Cobranças Ativas"
        valor={`${cobrancasPendentes + cobrancasEmAcordo}/${numeroCobrancas}`}
        subtitulo={`${cobrancasPendentes} pendentes, ${cobrancasEmAcordo} em acordo`}
        icone={<AlertCircle className="h-4 w-4" />}
        cor={cobrancasPendentes > 0 ? "amarelo" : "verde"}
      />

      <CardMetrica
        titulo="Taxa de Recuperação"
        valor={`${taxaRecuperacao.toFixed(1)}%`}
        subtitulo={`${cobrancasPagas} de ${numeroCobrancas} cobranças pagas`}
        icone={<CheckCircle2 className="h-4 w-4" />}
        cor={taxaRecuperacao >= 50 ? "verde" : taxaRecuperacao >= 25 ? "amarelo" : "vermelho"}
        trend={taxaRecuperacao >= 50 ? "up" : "down"}
      />

      <CardMetrica
        titulo="Última Tentativa"
        valor={diasDesdeUltimaTentativa !== null ? `${diasDesdeUltimaTentativa} dias` : "Nunca"}
        subtitulo={`${tentativasUltimos30Dias} tentativas nos últimos 30 dias`}
        icone={<Calendar className="h-4 w-4" />}
        cor={
          diasDesdeUltimaTentativa === null
            ? "vermelho"
            : diasDesdeUltimaTentativa <= 7
            ? "verde"
            : diasDesdeUltimaTentativa <= 30
            ? "amarelo"
            : "vermelho"
        }
      />
    </div>
  );
}
