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
  valorTotal: number; // Valor em centavos
  devedorId: number;
  devedorNome: string;
  condominioId: number;
  condominioNome: string;
  taxaJurosMensal: number;
  onAcordoCriado?: () => void;
}

export function SimuladorAcordo({
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
  const [copiado, setCopiado] = useState(false);

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
    return calcularPlanoAcordo({
      valorTotal,
      valorEntrada,
      numeroParcelas,
      taxaJurosMensal,
      dataInicio: new Date(),
    });
  }, [valorTotal, valorEntrada, numeroParcelas, taxaJurosMensal]);

  const handleCopiarTexto = () => {
    const texto = gerarTextoAcordo(planoAcordo, devedorNome, condominioNome);
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    alert("Texto copiado! Proposta de acordo copiada para a área de transferência.");
    setTimeout(() => setCopiado(false), 2000);
  };

  const handleCriarAcordo = () => {
    createAcordoMutation.mutate({
      devedorId,
      condominioId,
      totalAmount: valorTotal,
      agreedAmount: planoAcordo.valorTotal,
      installments: numeroParcelas,
      firstPaymentDate: planoAcordo.parcelas[0]?.dataVencimento || new Date(),
      paymentFrequency: "mensal",
      notes: `Entrada: ${formatarMoedaAcordo(valorEntrada)} + ${numeroParcelas}x de ${formatarMoedaAcordo(planoAcordo.valorParcela)}`,
      parcelas: planoAcordo.parcelas.map((p) => ({
        installmentNumber: p.numeroParcela,
        amount: p.valor,
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
      </div>

      {/* Resumo do Acordo */}
      <Alert className="mb-6 bg-primary/5 border-primary/20">
        <AlertDescription>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Valor Original</p>
              <p className="text-lg font-semibold">{formatarMoedaAcordo(valorTotal)}</p>
            </div>
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
              <p className="text-xs text-muted-foreground">Valor Total</p>
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
