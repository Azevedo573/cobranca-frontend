import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { trpc } from "@/lib/trpc";
import { TrendingUp, Users, Phone, Target } from "lucide-react";

export default function RelatorioProdutividade() {
  const [periodo, setPeriodo] = useState<string>("mes");
  const [condominioId, setCondominioId] = useState<string>("todos");

  // Calcular datas baseado no período
  const { dataInicio, dataFim } = useMemo(() => {
    const hoje = new Date();
    let inicio: Date | undefined;
    let fim: Date | undefined = hoje;

    switch (periodo) {
      case "hoje":
        inicio = new Date(hoje.setHours(0, 0, 0, 0));
        break;
      case "semana":
        inicio = new Date(hoje);
        inicio.setDate(hoje.getDate() - 7);
        break;
      case "mes":
        inicio = new Date(hoje);
        inicio.setMonth(hoje.getMonth() - 1);
        break;
      case "trimestre":
        inicio = new Date(hoje);
        inicio.setMonth(hoje.getMonth() - 3);
        break;
      case "todos":
        inicio = undefined;
        fim = undefined;
        break;
    }

    return {
      dataInicio: inicio?.toISOString(),
      dataFim: fim?.toISOString(),
    };
  }, [periodo]);

  // Buscar dados
  const { data: produtividade, isLoading } = trpc.relatorios.produtividade.useQuery({
    dataInicio,
    dataFim,
    condominioId: condominioId === "todos" ? undefined : Number(condominioId),
  });

  const { data: condominios } = trpc.condominios.list.useQuery();

  // Preparar dados para o gráfico
  const chartData = useMemo(() => {
    if (!produtividade) return [];
    return produtividade.map((p) => ({
      nome: p.colaboradorNome.split(" ")[0], // Primeiro nome
      tentativas: p.totalTentativas,
      promessas: p.tentativasPromessa,
      recusas: p.tentativasRecusa,
    }));
  }, [produtividade]);

  // Calcular totais
  const totais = useMemo(() => {
    if (!produtividade) return { colaboradores: 0, tentativas: 0, devedores: 0, taxaSucesso: 0 };
    
    const totalTentativas = produtividade.reduce((sum, p) => sum + p.totalTentativas, 0);
    const totalPromessas = produtividade.reduce((sum, p) => sum + p.tentativasPromessa, 0);
    const totalDevedores = produtividade.reduce((sum, p) => sum + p.devedoresUnicos, 0);

    return {
      colaboradores: produtividade.length,
      tentativas: totalTentativas,
      devedores: totalDevedores,
      taxaSucesso: totalTentativas > 0 ? Math.round((totalPromessas / totalTentativas) * 100) : 0,
    };
  }, [produtividade]);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-primary mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Relatório de Produtividade
        </h1>
        <p className="text-muted-foreground">
          Análise de performance dos colaboradores por período
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Período</label>
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoje">Hoje</SelectItem>
                <SelectItem value="semana">Última Semana</SelectItem>
                <SelectItem value="mes">Último Mês</SelectItem>
                <SelectItem value="trimestre">Último Trimestre</SelectItem>
                <SelectItem value="todos">Todos os Períodos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <label className="text-sm font-medium mb-2 block">Condomínio</label>
            <Select value={condominioId} onValueChange={setCondominioId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Condomínios</SelectItem>
                {condominios?.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Colaboradores Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totais.colaboradores}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Tentativas
            </CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totais.tentativas}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Devedores Contatados
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totais.devedores}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Sucesso
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totais.taxaSucesso}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader>
          <CardTitle>Tentativas por Colaborador</CardTitle>
          <CardDescription>Comparativo de tentativas, promessas e recusas</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Carregando dados...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              Nenhum dado disponível para o período selecionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="nome" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="tentativas" fill="hsl(var(--primary))" name="Total de Tentativas" />
                <Bar dataKey="promessas" fill="hsl(var(--accent))" name="Promessas" />
                <Bar dataKey="recusas" fill="hsl(var(--destructive))" name="Recusas" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabela Detalhada */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Colaborador</CardTitle>
          <CardDescription>Estatísticas completas de cada colaborador</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : !produtividade || produtividade.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum dado disponível para o período selecionado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead className="text-right">Total Tentativas</TableHead>
                    <TableHead className="text-right">Devedores Únicos</TableHead>
                    <TableHead className="text-right">Sem Resposta</TableHead>
                    <TableHead className="text-right">Promessas</TableHead>
                    <TableHead className="text-right">Recusas</TableHead>
                    <TableHead className="text-right">Taxa Sucesso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtividade.map((p) => (
                    <TableRow key={p.colaboradorId}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{p.colaboradorNome}</div>
                          <div className="text-xs text-muted-foreground">{p.colaboradorEmail}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{p.totalTentativas}</TableCell>
                      <TableCell className="text-right">{p.devedoresUnicos}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {p.tentativasSemResposta}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {p.tentativasPromessa}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {p.tentativasRecusa}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-semibold ${
                          p.taxaSucesso >= 50 ? "text-green-600" :
                          p.taxaSucesso >= 30 ? "text-yellow-600" :
                          "text-red-600"
                        }`}>
                          {p.taxaSucesso}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
