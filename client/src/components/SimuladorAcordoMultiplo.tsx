import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calculator, Copy, Check, FileText, Info } from "lucide-react";
import {
  calcularPlanoAcordo,
  formatarMoedaAcordo,
  formatarDataVencimento,
  gerarTextoAcordo,
  type PlanoAcordo,
} from "@/../../shared/calculos-acordo";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface Cobranca {
  id: number;
  tipoCobranca: string;
  description: string | null;
  amount: number;
  dueDate: Date | null;
  monthReference: string | null;
  status: string;
}

interface SimuladorAcordoMultiploProps {
  cobrancas: Cobranca[];
  devedorId: number;
  devedorNome: string;
  condominioId: number;
  condominioNome: string;
  taxaJurosMensal: number;
  onAcordoCriado?: () => void;
}

export function SimuladorAcordoMultiplo({
  cobrancas,
  devedorId,
  devedorNome,
  condominioId,
  condominioNome,
  taxaJurosMensal,
  onAcordoCriado,
}: SimuladorAcordoMultiploProps) {
  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<Set<number>>(new Set());
  const [valorEntrada, setValorEntrada] = useState(0);
  const [numeroParcelas, setNumeroParcelas] = useState(6);
  const [percentualDesconto, setPercentualDesconto] = useState(0);
  const [copiado, setCopiado] = useState(false);

  // Buscar desconto máximo do condomínio
  const { data: condominio } = trpc.condominios.getById.useQuery({ id: condominioId });
  const descontoMaximo = parseFloat(condominio?.descontoMaximo || "0");

  const createAcordoMutation = trpc.acordos.create.useMutation({
    onSuccess: () => {
      toast.success("Acordo criado com sucesso!");
      onAcordoCriado?.();
    },
    onError: (error) => {
      toast.error(`Erro ao criar acordo: ${error.message}`);
    },
  });

  // Filtrar apenas cobranças pendentes ou em cobrança
  const cobrancasDisponiveis = cobrancas.filter(
    (c) => c.status === "pendente" || c.status === "em_cobranca"
  );

  // Calcular valor total das cobranças selecionadas
  const valorTotalSelecionado = useMemo(() => {
    return Array.from(cobrancasSelecionadas).reduce((total, id) => {
      const cobranca = cobrancasDisponiveis.find((c) => c.id === id);
      return total + (cobranca?.amount || 0);
    }, 0);
  }, [cobrancasSelecionadas, cobrancasDisponiveis]);

  // Calcula o plano de acordo com os parâmetros atuais
  const planoAcordo: PlanoAcordo = useMemo(() => {
    if (valorTotalSelecionado === 0) {
      return {
        valorTotal: 0,
        valorParcela: 0,
        valorEntrada: 0,
        valorParcelado: 0,
        numeroParcelas: 0,
        taxaJurosAplicada: 0,
        parcelas: [],
      };
    }

    // Aplicar desconto ao valor total
    const valorComDesconto = Math.round(valorTotalSelecionado * (1 - percentualDesconto / 100));

    return calcularPlanoAcordo({
      valorTotal: valorComDesconto,
      valorEntrada,
      numeroParcelas,
      taxaJurosMensal,
      dataInicio: new Date(),
    });
  }, [valorTotalSelecionado, valorEntrada, numeroParcelas, taxaJurosMensal, percentualDesconto]);

  const handleToggleCobranca = (cobrancaId: number) => {
    const novaSelecao = new Set(cobrancasSelecionadas);
    if (novaSelecao.has(cobrancaId)) {
      novaSelecao.delete(cobrancaId);
    } else {
      novaSelecao.add(cobrancaId);
    }
    setCobrancasSelecionadas(novaSelecao);
  };

  const handleSelecionarTodas = () => {
    if (cobrancasSelecionadas.size === cobrancasDisponiveis.length) {
      setCobrancasSelecionadas(new Set());
    } else {
      setCobrancasSelecionadas(new Set(cobrancasDisponiveis.map((c) => c.id)));
    }
  };

  const handleCopiarTexto = () => {
    const texto = gerarTextoAcordo(planoAcordo, devedorNome, condominioNome);
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    toast.success("Texto copiado para a área de transferência!");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleCriarAcordo = () => {
    if (cobrancasSelecionadas.size === 0) {
      toast.error("Selecione pelo menos uma cobrança");
      return;
    }

    createAcordoMutation.mutate({
      cobrancaIds: Array.from(cobrancasSelecionadas),
      devedorId,
      condominioId,
      totalAmount: valorTotalSelecionado,
      agreedAmount: planoAcordo.valorTotal,
      installments: numeroParcelas,
      firstPaymentDate: planoAcordo.parcelas[0]?.dataVencimento || new Date(),
      paymentFrequency: "mensal",
      notes: `Acordo consolidado de ${cobrancasSelecionadas.size} cobrança(s). Entrada: ${formatarMoedaAcordo(valorEntrada)} + ${numeroParcelas}x de ${formatarMoedaAcordo(planoAcordo.valorParcela)}`,
      parcelas: planoAcordo.parcelas.map((p) => ({
        installmentNumber: p.numeroParcela,
        amount: p.valor,
        dueDate: p.dataVencimento,
      })),
    });
  };

  const getTipoCobrancaLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      condominio: "Condomínio",
      salao_jogos: "Salão de Jogos",
      churrasqueira: "Churrasqueira",
      cota_extra: "Cota Extra",
      multa: "Multa",
      outros: "Outros",
    };
    return labels[tipo] || tipo;
  };

  if (cobrancasDisponiveis.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Simulador de Acordo Consolidado</h3>
        </div>
        <Alert>
          <AlertDescription>
            Não há cobranças pendentes disponíveis para criar um acordo.
          </AlertDescription>
        </Alert>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Calculator className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Simulador de Acordo Consolidado</h3>
      </div>

      {/* Seleção de Cobranças */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <Label>Selecione as Cobranças para o Acordo</Label>
          <Button variant="outline" size="sm" onClick={handleSelecionarTodas}>
            {cobrancasSelecionadas.size === cobrancasDisponiveis.length
              ? "Desmarcar Todas"
              : "Selecionar Todas"}
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Mês Ref.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cobrancasDisponiveis.map((cobranca) => (
                <TableRow key={cobranca.id}>
                  <TableCell>
                    <Checkbox
                      checked={cobrancasSelecionadas.has(cobranca.id)}
                      onCheckedChange={() => handleToggleCobranca(cobranca.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {getTipoCobrancaLabel(cobranca.tipoCobranca)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cobranca.description || "-"}
                  </TableCell>
                  <TableCell>{cobranca.monthReference || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatarMoedaAcordo(cobranca.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {cobrancasSelecionadas.size > 0 && (
          <Alert className="mt-3 bg-blue-50 border-blue-200">
            <AlertDescription>
              <strong>{cobrancasSelecionadas.size}</strong> cobrança(s) selecionada(s) •
              Valor total: <strong>{formatarMoedaAcordo(valorTotalSelecionado)}</strong>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Parâmetros do Acordo */}
      {cobrancasSelecionadas.size > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Valor de Entrada */}
            <div>
              <Label htmlFor="valorEntrada">Valor de Entrada (R$)</Label>
              <Input
                id="valorEntrada"
                type="number"
                min="0"
                max={valorTotalSelecionado / 100}
                step="0.01"
                value={valorEntrada / 100}
                onChange={(e) => setValorEntrada(Math.round(parseFloat(e.target.value || "0") * 100))}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">Valor pago imediatamente</p>
            </div>

            {/* Número de Parcelas */}
            <div>
              <Label htmlFor="numeroParcelas">Número de Parcelas</Label>
              <Input
                id="numeroParcelas"
                type="number"
                min="1"
                max="60"
                value={numeroParcelas}
                onChange={(e) => setNumeroParcelas(parseInt(e.target.value || "1"))}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">Quantidade de parcelas mensais</p>
            </div>

            {/* Percentual de Desconto */}
            <div>
              <Label htmlFor="percentualDesconto">Desconto (%)</Label>
              <Input
                id="percentualDesconto"
                type="number"
                min="0"
                max={descontoMaximo}
                step="0.01"
                value={percentualDesconto}
                onChange={(e) => {
                  const valor = parseFloat(e.target.value || "0");
                  if (valor > descontoMaximo) {
                    toast.error(`Desconto máximo permitido: ${descontoMaximo}%`);
                    setPercentualDesconto(descontoMaximo);
                  } else {
                    setPercentualDesconto(valor);
                  }
                }}
                className="mt-1"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Máximo: {descontoMaximo}% (configurado no condomínio)
              </p>
            </div>
          </div>

          {/* Resumo do Acordo */}
          <Alert className="mb-6 bg-primary/5 border-primary/20">
            <AlertDescription>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Valor Original</p>
                  <p className="text-lg font-semibold">{formatarMoedaAcordo(valorTotalSelecionado)}</p>
                </div>
                {percentualDesconto > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Desconto Aplicado</p>
                    <p className="text-lg font-semibold text-orange-600">
                      {percentualDesconto.toFixed(2)}% (
                      -{formatarMoedaAcordo(Math.round(valorTotalSelecionado * percentualDesconto / 100))})
                    </p>
                  </div>
                )}
                {valorEntrada > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Entrada</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatarMoedaAcordo(valorEntrada)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Valor da Parcela</p>
                  <p className="text-lg font-semibold text-blue-600">
                    {formatarMoedaAcordo(planoAcordo.valorParcela)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Final</p>
                  <p className="text-lg font-semibold text-primary">
                    {formatarMoedaAcordo(planoAcordo.valorTotal)}
                  </p>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Tabela de Parcelas */}
          {planoAcordo.parcelas.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold mb-3">Plano de Pagamento</h4>
              <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valorEntrada > 0 && (
                      <TableRow className="bg-green-50">
                        <TableCell className="font-medium">Entrada</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatarMoedaAcordo(valorEntrada)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">Imediato</TableCell>
                      </TableRow>
                    )}
                    {planoAcordo.parcelas.map((parcela) => (
                      <TableRow key={parcela.numeroParcela}>
                        <TableCell className="font-medium">
                          {parcela.numeroParcela}/{numeroParcelas}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatarMoedaAcordo(parcela.valor)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatarDataVencimento(parcela.dataVencimento)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleCopiarTexto}
              className="flex-1"
              disabled={planoAcordo.parcelas.length === 0}
            >
              {copiado ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar Proposta
                </>
              )}
            </Button>
            <Button
              onClick={handleCriarAcordo}
              className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={createAcordoMutation.isPending || planoAcordo.parcelas.length === 0}
            >
              <FileText className="mr-2 h-4 w-4" />
              {createAcordoMutation.isPending ? "Criando..." : "Criar Acordo"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
