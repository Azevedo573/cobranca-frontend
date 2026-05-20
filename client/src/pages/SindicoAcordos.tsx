import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ArrowLeft, Handshake, CheckCircle2, XCircle, AlertTriangle,
  DollarSign, Calendar, TrendingUp, BarChart3, RefreshCw, Eye
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_CONFIG = {
  ativo:     { label: "Ativo",     color: "#22c55e", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  pago:      { label: "Quitado",   color: "#3b82f6", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  cancelado: { label: "Cancelado", color: "#ef4444", badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export default function SindicoAcordos() {
  const { user } = useAuth();
  const condId = user?.condominioId ?? undefined;

  const { data: acordos, isLoading, refetch } = trpc.acordos.list.useQuery(
    { condominioId: condId ?? 0 },
    { enabled: !!condId }
  );

  const { data: parcelasVencidas } = trpc.acordos.getParcelasVencidas.useQuery(
    { condominioId: condId },
    { enabled: !!condId }
  );

  const { data: parcelasVencendo } = trpc.acordos.getVencimentosProximos.useQuery(
    { condominioId: condId, dias: 15 },
    { enabled: !!condId }
  );

  // KPIs calculados
  const totalAcordos = acordos?.length ?? 0;
  const ativos = acordos?.filter(a => a.status === "ativo").length ?? 0;
  const quitados = acordos?.filter(a => a.status === "pago").length ?? 0;
  const cancelados = acordos?.filter(a => a.status === "cancelado").length ?? 0;
  const taxaSucesso = totalAcordos > 0 ? Math.round(((quitados) / totalAcordos) * 100) : 0;
  const taxaCancelamento = totalAcordos > 0 ? Math.round((cancelados / totalAcordos) * 100) : 0;

  const valorTotalAcordado = acordos?.reduce((acc, a) => acc + (a.agreedAmount ?? 0), 0) ?? 0;
  const valorTotalPago = acordos?.reduce((acc, a) => acc + (a.valorPago ?? 0), 0) ?? 0;
  const valorEmAberto = valorTotalAcordado - valorTotalPago;

  // Dados para gráfico de pizza (distribuição por status)
  const pieData = [
    { name: "Ativos", value: ativos, color: "#22c55e" },
    { name: "Quitados", value: quitados, color: "#3b82f6" },
    { name: "Cancelados", value: cancelados, color: "#ef4444" },
  ].filter(d => d.value > 0);

  // Dados para gráfico de barras (acordos por mês)
  const acordosPorMes: Record<string, { mes: string; total: number; quitados: number }> = {};
  acordos?.forEach(a => {
    const mes = format(new Date(a.createdAt), "MMM/yy", { locale: ptBR });
    if (!acordosPorMes[mes]) acordosPorMes[mes] = { mes, total: 0, quitados: 0 };
    acordosPorMes[mes].total++;
    if (a.status === "pago") acordosPorMes[mes].quitados++;
  });
  const barData = Object.values(acordosPorMes).slice(-6);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/sindico">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <div className="h-4 w-px bg-border" />
            <div>
              <h1 className="text-base font-semibold">Acordos & Negociações</h1>
              <p className="text-xs text-muted-foreground">Painel executivo de acordos do condomínio</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </Button>
            <Link href="/acordos">
              <Button size="sm" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                Gestão Completa
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total de Acordos", value: String(totalAcordos), icon: Handshake, color: "text-primary bg-primary/10" },
            { label: "Ativos", value: String(ativos), icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
            { label: "Taxa de Sucesso", value: `${taxaSucesso}%`, icon: TrendingUp, color: "text-blue-500 bg-blue-500/10" },
            { label: "Taxa Cancelamento", value: `${taxaCancelamento}%`, icon: XCircle, color: "text-red-500 bg-red-500/10" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-border/50">
              <CardContent className="p-5">
                <div className={`p-2 rounded-lg w-fit mb-3 ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {isLoading ? (
                  <div className="h-7 bg-muted animate-pulse rounded w-2/3" />
                ) : (
                  <div className="text-2xl font-bold">{value}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Valores financeiros */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Valor Total Acordado", value: fmt(valorTotalAcordado), icon: DollarSign, color: "text-slate-500 bg-slate-500/10" },
            { label: "Valor Já Pago", value: fmt(valorTotalPago), icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
            { label: "Saldo em Aberto", value: fmt(valorEmAberto), icon: AlertTriangle, color: "text-amber-500 bg-amber-500/10" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="border-border/50">
              <CardContent className="p-5">
                <div className={`p-2 rounded-lg w-fit mb-3 ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                {isLoading ? (
                  <div className="h-7 bg-muted animate-pulse rounded w-3/4" />
                ) : (
                  <div className="text-xl font-bold">{value}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Distribuição por status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Distribuição por Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded" />
              ) : pieData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Nenhum acordo registrado
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Acordos por mês */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                Acordos por Mês (últimos 6)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-48 bg-muted animate-pulse rounded" />
              ) : barData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="quitados" name="Quitados" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alertas de parcelas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Parcelas vencidas */}
          <Card className="border-red-200 dark:border-red-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Parcelas em Atraso
                {parcelasVencidas && parcelasVencidas.length > 0 && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1.5 ml-auto">{parcelasVencidas.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!parcelasVencidas || parcelasVencidas.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Nenhuma parcela em atraso
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {parcelasVencidas.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20">
                      <div>
                        <p className="font-medium">{p.devedorNome || `Devedor #${p.devedorId}`}</p>
                        <p className="text-muted-foreground">Venceu: {format(new Date(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <span className="font-semibold text-red-600">{fmt(p.amount ?? 0)}</span>
                    </div>
                  ))}
                  {parcelasVencidas.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+{parcelasVencidas.length - 5} parcelas</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Parcelas vencendo em 15 dias */}
          <Card className="border-amber-200 dark:border-amber-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <Calendar className="h-4 w-4" />
                Vencendo nos Próximos 15 dias
                {parcelasVencendo && parcelasVencendo.length > 0 && (
                  <Badge className="text-[10px] h-4 px-1.5 ml-auto bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">{parcelasVencendo.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!parcelasVencendo || parcelasVencendo.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Nenhum vencimento próximo
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {parcelasVencendo.slice(0, 5).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20">
                      <div>
                        <p className="font-medium">{p.devedorNome || `Devedor #${p.devedorId}`}</p>
                        <p className="text-muted-foreground">Vence: {format(new Date(p.dueDate), "dd/MM/yyyy", { locale: ptBR })}</p>
                      </div>
                      <span className="font-semibold text-amber-600">{fmt(p.amount ?? 0)}</span>
                    </div>
                  ))}
                  {parcelasVencendo.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">+{parcelasVencendo.length - 5} parcelas</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Lista de acordos ativos */}
        {ativos > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Handshake className="h-4 w-4 text-primary" />
                Acordos Ativos ({ativos})
              </CardTitle>
              <CardDescription className="text-xs">Acordos em andamento com parcelas pendentes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {acordos?.filter(a => a.status === "ativo").slice(0, 8).map(a => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{a.devedorName || `Devedor #${a.devedorId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.installments}x · {fmt(a.agreedAmount)} · Pago: {fmt(a.valorPago ?? 0)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <div className="text-right">
                        <p className="text-xs font-medium text-amber-600">{fmt((a.agreedAmount ?? 0) - (a.valorPago ?? 0))}</p>
                        <p className="text-[10px] text-muted-foreground">em aberto</p>
                      </div>
                      <Link href={`/acordos/${a.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">Ver</Button>
                      </Link>
                    </div>
                  </div>
                ))}
                {ativos > 8 && (
                  <div className="text-center pt-2">
                    <Link href="/acordos">
                      <Button variant="outline" size="sm" className="text-xs">Ver todos os {ativos} acordos ativos</Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
