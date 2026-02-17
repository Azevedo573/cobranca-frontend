import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

interface NovaTentativaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedorId: number;
  condominioId: number;
  cobrancas: Array<{ id: number; description?: string | null; monthReference?: string | null }>;
}

export function NovaTentativaModal({
  open,
  onOpenChange,
  devedorId,
  condominioId,
  cobrancas,
}: NovaTentativaModalProps) {
  const [cobrancaId, setCobrancaId] = useState("");
  const [tipoContato, setTipoContato] = useState("");
  const [resultado, setResultado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [proximaTentativa, setProximaTentativa] = useState("");

  const utils = trpc.useUtils();

  const createMutation = trpc.tentativas.create.useMutation({
    onSuccess: () => {
      // Invalidar queries para atualizar a UI
      utils.tentativas.getByDevedor.invalidate({ devedorId });
      
      // Resetar formulário
      setCobrancaId("");
      setTipoContato("");
      setResultado("");
      setObservacoes("");
      setProximaTentativa("");
      
      // Fechar modal
      onOpenChange(false);
      
      alert("Tentativa de cobrança registrada com sucesso!");
    },
    onError: (error) => {
      alert(`Erro ao registrar tentativa: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!cobrancaId || !tipoContato) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    createMutation.mutate({
      cobrancaId: parseInt(cobrancaId),
      devedorId,
      condominioId,
      contactType: tipoContato as "telefone" | "email" | "pessoal" | "whatsapp",
      notes: observacoes || undefined,
      result: resultado ? (resultado as "sem_resposta" | "promessa_pagamento" | "recusa" | "outro" | "deseja_acordo") : undefined,
      nextAttemptDate: proximaTentativa ? new Date(proximaTentativa) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Tentativa de Cobrança</DialogTitle>
          <DialogDescription>
            Registre uma tentativa de contato com o devedor. Todos os campos marcados com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cobranca">Cobrança *</Label>
            <Select value={cobrancaId} onValueChange={setCobrancaId} required>
              <SelectTrigger id="cobranca">
                <SelectValue placeholder="Selecione a cobrança" />
              </SelectTrigger>
              <SelectContent>
                {cobrancas.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhuma cobrança disponível
                  </SelectItem>
                ) : (
                  cobrancas.map((cobranca) => (
                    <SelectItem key={cobranca.id} value={cobranca.id.toString()}>
                      {cobranca.description || `Cobrança ${cobranca.monthReference || cobranca.id}`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipoContato">Tipo de Contato *</Label>
            <Select value={tipoContato} onValueChange={setTipoContato} required>
              <SelectTrigger id="tipoContato">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="pessoal">Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resultado">Resultado</Label>
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger id="resultado">
                <SelectValue placeholder="Selecione o resultado (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem_resposta">Sem Resposta</SelectItem>
                <SelectItem value="promessa_pagamento">Promessa de Pagamento</SelectItem>
                <SelectItem value="deseja_acordo">Deseja Acordo</SelectItem>
                <SelectItem value="recusa">Recusa</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              placeholder="Detalhes sobre o contato realizado..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="proximaTentativa">Próxima Tentativa</Label>
            <input
              id="proximaTentativa"
              type="date"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={proximaTentativa}
              onChange={(e) => setProximaTentativa(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Registrando..." : "Registrar Tentativa"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
