import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface NovaDividaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedorId: number;
  condominioId: number;
}

export function NovaDividaModal({ open, onOpenChange, devedorId, condominioId }: NovaDividaModalProps) {
  const [tipo, setTipo] = useState<string>("");
  const [mesReferencia, setMesReferencia] = useState<string>("");
  const [valor, setValor] = useState<string>("");
  const [dataVencimento, setDataVencimento] = useState<string>("");
  const [descricao, setDescricao] = useState<string>("");

  const utils = trpc.useUtils();

  const createMutation = trpc.cobrancas.create.useMutation({
    onSuccess: () => {
      toast.success("Dívida cadastrada com sucesso!");
      utils.cobrancas.getByDevedor.invalidate({ devedorId });
      utils.devedores.getById.invalidate({ id: devedorId });
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar dívida: " + error.message);
    },
  });

  const resetForm = () => {
    setTipo("");
    setMesReferencia("");
    setValor("");
    setDataVencimento("");
    setDescricao("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!tipo || !mesReferencia || !valor || !dataVencimento) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const valorCentavos = Math.round(parseFloat(valor) * 100);

    createMutation.mutate({
      devedorId,
      condominioId,
      tipoCobranca: tipo as "condominio" | "salao_jogos" | "churrasqueira" | "cota_extra" | "multa" | "outros",
      monthReference: mesReferencia,
      amount: valorCentavos,
      dueDate: new Date(dataVencimento),
      description: descricao || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Dívida</DialogTitle>
          <DialogDescription>
            Cadastre uma nova dívida para este devedor. Todos os campos marcados com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de Cobrança *</Label>
            <Select value={tipo} onValueChange={setTipo} required>
              <SelectTrigger id="tipo">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="condominio">Condomínio</SelectItem>
                <SelectItem value="salao_jogos">Salão de Jogos</SelectItem>
                <SelectItem value="churrasqueira">Churrasqueira</SelectItem>
                <SelectItem value="cota_extra">Cota Extra</SelectItem>
                <SelectItem value="multa">Multa</SelectItem>
                <SelectItem value="outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mesReferencia">Mês de Referência *</Label>
            <Input
              id="mesReferencia"
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor (R$) *</Label>
            <Input
              id="valor"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataVencimento">Data de Vencimento *</Label>
            <Input
              id="dataVencimento"
              type="date"
              value={dataVencimento}
              onChange={(e) => setDataVencimento(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição (opcional)</Label>
            <Textarea
              id="descricao"
              placeholder="Informações adicionais sobre esta dívida..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Salvando..." : "Cadastrar Dívida"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
