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
import { calcularValorDevido } from "@/../../shared/calculos";
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
  breakdown?: {
    valorOriginal: number;
    juros: number;
    multa: number;
    honorarios: number;
    correcaoMonetaria: number;
    valorTotal: number;
  };
}

interface CobrancaComValorAtualizado extends Cobranca {
  valorAtualizado: number; // Valor com juros, multa, honorários e correção BCB em centavos
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
  const [consolidarAcordo, setConsolidarAcordo] = useState(false);
  const [opcaoConsolidacao, setOpcaoConsolidacao] = useState<'somar' | 'diluir'>('diluir');
  
  // Controles de encargos (toggles on/off)
  const [incluirJuros, setIncluirJuros] = useState(true);
  const [incluirMulta, setIncluirMulta] = useState(true);
  const [incluirCorrecao, setIncluirCorrecao] = useState(true);

  // Buscar desconto máximo do condomínio
  const { data: condominio } = trpc.condominios.getById.useQuery({ id: condominioId });
  const descontoMaximo = parseFloat(condominio?.descontoMaximo || "0");
  
  // Filtrar apenas cobranças pendentes ou em cobrança
  const cobrancasDisponiveis = cobrancas.filter(
    (c) => c.status === "pendente" || c.status === "em_cobranca"
  );
  
  // Usar valor atualizado de cada cobrança (já calculado pelo backend com correção BCB)
  const cobrancasComValorAtualizado: CobrancaComValorAtualizado[] = useMemo(() => {
    return cobrancasDisponiveis.map(c => {
      // Se breakdown já vem do backend (com correção BCB), usar ele
      if (c.breakdown) {
        // Calcular valor considerando toggles de encargos
        let valorCalculado = c.breakdown.valorOriginal;
        
        if (incluirJuros) valorCalculado += c.breakdown.juros;
        if (incluirMulta) valorCalculado += c.breakdown.multa;
        if (incluirCorrecao) valorCalculado += c.breakdown.correcaoMonetaria;
        // Honorários sempre incluídos
        valorCalculado += c.breakdown.honorarios;
        
        return {
          ...c,
          valorAtualizado: Math.round(valorCalculado * 100), // Converter reais para centavos
        };
      }
      
      // Fallback: se não tem breakdown, calcular no frontend (sem correção BCB)
      if (!c.dueDate || !condominio) {
        return { ...c, valorAtualizado: c.amount };
      }
      
      const taxas = {
        taxaJurosMensal: Number(condominio.taxaJurosMensal || "1.00"),
        taxaMulta: Number(condominio.taxaMulta || "2.00"),
        taxaHonorarios: Number(condominio.taxaHonorarios || "10.00"),
        correcaoMonetaria: Number(condominio.correcaoMonetaria || "0.00"),
      };
      
      const breakdown = calcularValorDevido(
        c.amount / 100,
        new Date(c.dueDate),
        taxas
      );
      
      return {
        ...c,
        valorAtualizado: Math.round(breakdown.valorTotal * 100),
      };
    });
  }, [cobrancasDisponiveis, condominio, incluirJuros, incluirMulta, incluirCorrecao]);
  
  // Buscar acordos ativos do devedor
  const { data: acordosAtivos, error: acordosError, isLoading: acordosLoading } = trpc.acordos.getAtivosComParcelas.useQuery({ devedorId });
  const temAcordoAtivo = !acordosError && !acordosLoading && acordosAtivos && acordosAtivos.length > 0;
  const acordoAtivo = temAcordoAtivo ? acordosAtivos[0] : null;

  const createAcordoMutation = trpc.acordos.create.useMutation({
    onSuccess: () => {
      toast.success("Acordo criado com sucesso!");
      onAcordoCriado?.();
    },
    onError: (error) => {
      toast.error(`Erro ao criar acordo: ${error.message}`);
    },
  });

  // Calcular valor total das cobranças selecionadas (usando valor atualizado)
  const valorTotalSelecionado = useMemo(() => {
    return Array.from(cobrancasSelecionadas).reduce((total, id) => {
      const cobranca = cobrancasComValorAtualizado.find((c) => c.id === id);
      return total + (cobranca?.valorAtualizado || 0);
    }, 0);
  }, [cobrancasSelecionadas, cobrancasComValorAtualizado]);

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
    let valorComDesconto = Math.round(valorTotalSelecionado * (1 - percentualDesconto / 100));
    
    // Se consolidar com acordo ativo
    if (consolidarAcordo && acordoAtivo && acordoAtivo.valorRestante) {
      valorComDesconto += acordoAtivo.valorRestante;
    }

    return calcularPlanoAcordo({
      valorTotal: valorComDesconto,
      valorEntrada,
      numeroParcelas,
      taxaJurosMensal,
      dataInicio: new Date(),
    });
  }, [valorTotalSelecionado, valorEntrada, numeroParcelas, taxaJurosMensal, percentualDesconto, consolidarAcordo, acordoAtivo]);
  
  // Calcular opção 1: Somar parcelas (manter valor da parcela)
  const planoOpcao1 = useMemo(() => {
    if (!consolidarAcordo || !acordoAtivo || valorTotalSelecionado === 0 || !acordoAtivo.valorParcela || !acordoAtivo.valorRestante) return null;
    
    const valorComDesconto = Math.round(valorTotalSelecionado * (1 - percentualDesconto / 100));
    const valorParcelaAtual = acordoAtivo.valorParcela;
    const parcelasRestantes = acordoAtivo.parcelasPendentes;
    const parcelasNovas = Math.ceil(valorComDesconto / valorParcelaAtual);
    const totalParcelas = parcelasRestantes + parcelasNovas;
    
    return calcularPlanoAcordo({
      valorTotal: acordoAtivo.valorRestante + valorComDesconto,
      valorEntrada,
      numeroParcelas: totalParcelas,
      taxaJurosMensal,
      dataInicio: new Date(),
    });
  }, [consolidarAcordo, acordoAtivo, valorTotalSelecionado, percentualDesconto, valorEntrada, taxaJurosMensal]);
  
  // Calcular opção 2: Diluir no novo prazo (parcela maior)
  const planoOpcao2 = useMemo(() => {
    if (!consolidarAcordo || !acordoAtivo || valorTotalSelecionado === 0 || !acordoAtivo.valorRestante) return null;
    
    const valorComDesconto = Math.round(valorTotalSelecionado * (1 - percentualDesconto / 100));
    const valorTotal = acordoAtivo.valorRestante + valorComDesconto;
    
    return calcularPlanoAcordo({
      valorTotal,
      valorEntrada,
      numeroParcelas, // Usa o número de parcelas escolhido pelo usuário
      taxaJurosMensal,
      dataInicio: new Date(),
    });
  }, [consolidarAcordo, acordoAtivo, valorTotalSelecionado, percentualDesconto, valorEntrada, numeroParcelas, taxaJurosMensal]);
  
  // Plano final a ser usado
  const planoFinal = useMemo(() => {
    if (!consolidarAcordo || !acordoAtivo) return planoAcordo;
    return opcaoConsolidacao === 'somar' ? planoOpcao1 : planoOpcao2;
  }, [consolidarAcordo, acordoAtivo, planoAcordo, planoOpcao1, planoOpcao2, opcaoConsolidacao]);

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
    
    if (!planoFinal) {
      toast.error("Erro ao calcular plano de acordo");
      return;
    }
    
    let notes = `Acordo consolidado de ${cobrancasSelecionadas.size} cobrança(s).`;
    
    if (consolidarAcordo && acordoAtivo) {
      notes += ` Consolidação: ${opcaoConsolidacao === 'somar' ? 'Somar parcelas' : 'Diluir no novo prazo'}.`;
      notes += ` Acordo anterior cancelado (${acordoAtivo.parcelasPendentes} parcelas restantes de ${formatarMoedaAcordo(acordoAtivo.valorParcela)}).`;
    }
    
    notes += ` Entrada: ${formatarMoedaAcordo(valorEntrada)} + ${planoFinal.numeroParcelas}x de ${formatarMoedaAcordo(planoFinal.valorParcela)}`;

    // Calcular totalAmount correto (incluindo valor do acordo anterior se consolidar)
    let totalAmountFinal = valorTotalSelecionado;
    if (consolidarAcordo && acordoAtivo) {
      totalAmountFinal += acordoAtivo.valorRestante;
    }

    createAcordoMutation.mutate({
      cobrancaIds: Array.from(cobrancasSelecionadas),
      devedorId,
      condominioId,
      acordoOrigemId: consolidarAcordo && acordoAtivo ? acordoAtivo.id : undefined,
      totalAmount: totalAmountFinal,
      agreedAmount: planoFinal.valorTotal,
      installments: planoFinal.numeroParcelas,
      firstPaymentDate: planoFinal.parcelas[0]?.dataVencimento || new Date(),
      paymentFrequency: "mensal",
      notes,
      parcelas: planoFinal.parcelas.map((p) => ({
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

      {/* Alerta de Acordo Ativo */}
      {temAcordoAtivo && acordoAtivo && acordoAtivo.parcelasPendentes > 0 && (
        <Alert className="mb-6 border-orange-500 bg-orange-50">
          <Info className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-900">
            <div className="font-semibold mb-2">
              ⚠️ Este devedor possui acordo ativo
            </div>
            <div className="text-sm space-y-1">
              <p>• {acordoAtivo.parcelasPendentes || 0} parcelas restantes de {formatarMoedaAcordo(acordoAtivo.valorParcela || 0)}</p>
              <p>• Valor restante: {formatarMoedaAcordo(acordoAtivo.valorRestante || 0)}</p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Checkbox 
                id="consolidar"
                checked={consolidarAcordo}
                onCheckedChange={(checked) => setConsolidarAcordo(checked as boolean)}
              />
              <label htmlFor="consolidar" className="text-sm font-medium cursor-pointer">
                Consolidar com acordo existente
              </label>
            </div>
          </AlertDescription>
        </Alert>
      )}
      
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
              {cobrancasComValorAtualizado.map((cobranca) => (
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
                    {formatarMoedaAcordo(cobranca.valorAtualizado)}
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
          
          {/* Controles de Encargos */}
          <div className="mb-6">
            <Label className="mb-3 block">Encargos a Incluir no Acordo</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-muted/30">
              {/* Toggle Juros */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="incluir-juros"
                  checked={incluirJuros}
                  onCheckedChange={(checked) => setIncluirJuros(checked as boolean)}
                />
                <label
                  htmlFor="incluir-juros"
                  className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Juros
                </label>
              </div>
              
              {/* Toggle Multa */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="incluir-multa"
                  checked={incluirMulta}
                  onCheckedChange={(checked) => setIncluirMulta(checked as boolean)}
                />
                <label
                  htmlFor="incluir-multa"
                  className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Multa
                </label>
              </div>
              
              {/* Toggle Correção Monetária */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="incluir-correcao"
                  checked={incluirCorrecao}
                  onCheckedChange={(checked) => setIncluirCorrecao(checked as boolean)}
                />
                <label
                  htmlFor="incluir-correcao"
                  className="text-sm font-medium leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Correção Monetária
                </label>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              💡 Honorários são sempre incluídos no acordo
            </p>
          </div>
          
          {/* Opções de Consolidação */}
          {consolidarAcordo && acordoAtivo && planoOpcao1 && planoOpcao2 && (
            <div className="mb-6 p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50">
              <Label className="text-base font-semibold mb-3 block">Escolha a Opção de Consolidação</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Opção 1: Somar Parcelas */}
                <div 
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    opcaoConsolidacao === 'somar' 
                      ? 'border-primary bg-white shadow-md' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setOpcaoConsolidacao('somar')}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <input 
                      type="radio" 
                      checked={opcaoConsolidacao === 'somar'}
                      onChange={() => setOpcaoConsolidacao('somar')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1">📈 Opção 1: Somar Parcelas</div>
                      <div className="text-xs text-muted-foreground mb-2">Manter valor da parcela, aumentar quantidade</div>
                      <div className="space-y-1 text-sm">
                        <div><strong>{planoOpcao1.numeroParcelas}x</strong> de <strong className="text-primary">{formatarMoedaAcordo(planoOpcao1.valorParcela)}</strong></div>
                        <div className="text-xs text-muted-foreground">
                          ({acordoAtivo.parcelasPendentes} antigas + {planoOpcao1.numeroParcelas - acordoAtivo.parcelasPendentes} novas)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Opção 2: Diluir */}
                <div 
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    opcaoConsolidacao === 'diluir' 
                      ? 'border-primary bg-white shadow-md' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setOpcaoConsolidacao('diluir')}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <input 
                      type="radio" 
                      checked={opcaoConsolidacao === 'diluir'}
                      onChange={() => setOpcaoConsolidacao('diluir')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-sm mb-1">💰 Opção 2: Diluir no Novo Prazo</div>
                      <div className="text-xs text-muted-foreground mb-2">Parcela maior, prazo escolhido</div>
                      <div className="space-y-1 text-sm">
                        <div><strong>{planoOpcao2.numeroParcelas}x</strong> de <strong className="text-primary">{formatarMoedaAcordo(planoOpcao2.valorParcela)}</strong></div>
                        <div className="text-xs text-muted-foreground">
                          (Total consolidado em {numeroParcelas} parcelas)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                    {formatarMoedaAcordo(planoFinal?.valorParcela || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Final</p>
                  <p className="text-lg font-semibold text-primary">
                    {formatarMoedaAcordo(planoFinal?.valorTotal || 0)}
                  </p>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Tabela de Parcelas */}
          {planoFinal && planoFinal.parcelas.length > 0 && (
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
                    {planoFinal.parcelas.map((parcela) => (
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
