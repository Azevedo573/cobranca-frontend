import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calculator, Copy, Check, FileText } from "lucide-react";
import {
  calcularPlanoAcordo,
  formatarMoedaAcordo,
  formatarDataVencimento,
  gerarTextoAcordo,
  type PlanoAcordo,
} from "@/../../shared/calculos-acordo";
import { trpc } from "@/lib/trpc";


interface SimuladorAcordoProps {
  cobrancaId: number;
  valorTotal: number; // Valor em centavos
  devedorId: number;
  devedorNome: string;
  condominioId: number;
  condominioNome: string;
  taxaJurosMensal: number;
  onAcordoCriado?: () => void;
}

export function SimuladorAcordo({
  cobrancaId,
  valorTotal,
  devedorId,
  devedorNome,
  condominioId,
  condominioNome,
  taxaJurosMensal,
  onAcordoCriado,
}: SimuladorAcordoProps) {

  const [valorEntrada, setValorEntrada] = useState(0);
  const [numeroParcelas, setNumeroParcelas] = useState(6);
  const [percentualDesconto, setPercentualDesconto] = useState(0);
  const [copiado, setCopiado] = useState(false);

  // Buscar desconto máximo do condomínio
  const { data: condominio } = trpc.condominios.getById.useQuery({ id: condominioId });
  const descontoMaximo = parseFloat(condominio?.descontoMaximo || "0");

  const createAcordoMutation = trpc.acordos.create.useMutation({
    onSuccess: () => {
      alert("Acordo criado com sucesso! O acordo foi registrado no sistema.");
      onAcordoCriado?.();
    },
    onError: (error) => {
      alert(`Erro ao criar acordo: ${error.message}`);
    },
  });

  // Calcula o plano de acordo com os parâmetros atuais
  const planoAcordo: PlanoAcordo = useMemo(() => {
    // Aplicar desconto ao valor total
    const valorComDesconto = Math.round(valorTotal * (1 - percentualDesconto / 100));
    
    return calcularPlanoAcordo({
      valorTotal: valorComDesconto,
      valorEntrada,
      numeroParcelas,
      taxaJurosMensal,
      dataInicio: new Date(),
    });
  }, [valorTotal, valorEntrada, numeroParcelas, taxaJurosMensal, percentualDesconto]);

  const handleCopiarTexto = () => {
    const texto = gerarTextoAcordo(planoAcordo, devedorNome, condominioNome);
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    alert("Texto copiado! Proposta de acordo copiada para a área de transferência.");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleCriarAcordo = () => {
    createAcordoMutation.mutate({
      cobrancaIds: [cobrancaId], // Agora aceita array, mas mantém compatibilidade com uso atual
      devedorId,
      condominioId,
      totalAmount: valorTotal / 100,         // centavos → reais para o banco
      agreedAmount: planoAcordo.valorTotal / 100, // centavos → reais para o banco
      installments: numeroParcelas,
      firstPaymentDate: planoAcordo.parcelas[0]?.dataVencimento || new Date(),
      paymentFrequency: "mensal",
      notes: `Entrada: ${formatarMoedaAcordo(valorEntrada)} + ${numeroParcelas}x de ${formatarMoedaAcordo(planoAcordo.valorParcela)}`,
      parcelas: planoAcordo.parcelas.map((p) => ({
        installmentNumber: p.numeroParcela,
        amount: p.valor / 100, // centavos → reais para o banco
        dueDate: p.dataVencimento,
      })),
    });
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Calculator className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Simulador de Acordo</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Valor de Entrada */}
        <div>
          <Label htmlFor="valorEntrada">Valor de Entrada (R$)</Label>
          <Input
            id="valorEntrada"
            type="number"
            min="0"
            max={valorTotal / 100}
            step="0.01"
            value={valorEntrada / 100}
            onChange={(e) => setValorEntrada(Math.round(parseFloat(e.target.value || "0") * 100))}
            className="mt-1"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Valor pago imediatamente
          </p>
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
          <p className="text-sm text-muted-foreground mt-1">
            Quantidade de parcelas mensais
          </p>
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
                alert(`Desconto máximo permitido: ${descontoMaximo}%`);
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
              <p className="text-lg font-semibold">{formatarMoedaAcordo(valorTotal)}</p>
            </div>
            {percentualDesconto > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">Desconto Aplicado</p>
                <p className="text-lg font-semibold text-orange-600">
                  {percentualDesconto.toFixed(2)}% (-{formatarMoedaAcordo(Math.round(valorTotal * percentualDesconto / 100))})
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

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={handleCriarAcordo}
          disabled={createAcordoMutation.isPending}
          className="flex-1"
        >
          <FileText className="h-4 w-4 mr-2" />
          {createAcordoMutation.isPending ? "Criando..." : "Criar Acordo"}
        </Button>
        <Button
          variant="outline"
          onClick={handleCopiarTexto}
          className="flex-1"
        >
          {copiado ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Proposta
            </>
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        💡 Taxa de juros aplicada: {taxaJurosMensal}% ao mês
      </p>
    </Card>
  );
}
