import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

interface NovaTentativaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devedorId: number;
  condominioId: number;
}

export function NovaTentativaModal({
  open,
  onOpenChange,
  devedorId,
  condominioId,
}: NovaTentativaModalProps) {
  const [cobrancaId, setCobrancaId] = useState<string>("");
  const [contactType, setContactType] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const utils = trpc.useUtils();

  const { data: cobrancas = [] } = trpc.cobrancas.getByDevedor.useQuery(
    { devedorId },
    { enabled: open }
  );

  const cobrancasAtivas = cobrancas.filter(
    (c: any) => c.status !== "pago"
  );

  const createMutation = trpc.tentativas.create.useMutation({
    onSuccess: () => {
      toast.success("Tentativa registrada com sucesso!");
      utils.tentativas.getByDevedor.invalidate({ devedorId });
      utils.tentativas.listAll.invalidate();
      // Reset form
      setCobrancaId("");
      setContactType("");
      setResult("");
      setNotes("");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Erro ao registrar tentativa: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    if (!cobrancaId) {
      toast.error("Selecione uma cobrança");
      return;
    }
    if (!contactType) {
      toast.error("Selecione o tipo de contato");
      return;
    }
    if (!result) {
      toast.error("Selecione o resultado");
      return;
    }

    createMutation.mutate({
      cobrancaId: parseInt(cobrancaId),
      devedorId,
      condominioId,
      contactType: contactType as "telefone" | "email" | "pessoal" | "whatsapp",
      result: result as "sem_resposta" | "promessa_pagamento" | "recusa" | "outro",
      notes: notes || undefined,
    });
  };

  const formatarMesReferencia = (mesRef: string | null) => {
    if (!mesRef) return "";
    const [ano, mes] = mesRef.split("-");
    const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${meses[parseInt(mes) - 1]}/${ano}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Tentativa de Cobrança</DialogTitle>
          <DialogDescription>
            Registre o resultado do contato realizado com o devedor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Cobrança */}
          <div className="space-y-2">
            <Label>Cobrança *</Label>
            <Select value={cobrancaId} onValueChange={setCobrancaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a cobrança" />
              </SelectTrigger>
              <SelectContent>
                {cobrancasAtivas.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Nenhuma cobrança ativa
                  </SelectItem>
                ) : (
                  cobrancasAtivas.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.tipoCobranca || "Cobrança"}{" "}
                      {c.mesReferencia ? `• ${formatarMesReferencia(c.mesReferencia)}` : ""}{" "}
                      • R$ {(c.amount / 100).toFixed(2).replace(".", ",")}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Contato */}
          <div className="space-y-2">
            <Label>Tipo de Contato *</Label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger>
                <SelectValue placeholder="Como foi o contato?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="telefone">📞 Telefone</SelectItem>
                <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                <SelectItem value="email">📧 E-mail</SelectItem>
                <SelectItem value="pessoal">🤝 Pessoal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resultado */}
          <div className="space-y-2">
            <Label>Resultado *</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger>
                <SelectValue placeholder="Qual foi o resultado?" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="promessa_pagamento">✅ Promessa de Pagamento</SelectItem>
                <SelectItem value="sem_resposta">📵 Sem Resposta</SelectItem>
                <SelectItem value="recusa">❌ Recusa</SelectItem>
                <SelectItem value="outro">💬 Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes do contato, promessas, informações relevantes..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Salvando..." : "Registrar Tentativa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
