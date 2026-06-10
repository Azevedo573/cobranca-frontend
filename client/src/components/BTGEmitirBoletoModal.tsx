import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, Copy, ExternalLink, QrCode, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Devedor {
  id: number;
  name?: string | null;
  unitNumber: string;
  bloco?: string | null;
  cpfCnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

interface Cobranca {
  id: number;
  description?: string | null;
  amount: number;
  dueDate?: Date | string | null;
  btgCollectionId?: string | null;
  btgStatus?: string | null;
  btgBankSlipUrl?: string | null;
  btgPixCopiaECola?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cobranca: Cobranca;
  devedor: Devedor;
  onSuccess?: () => void;
}

export function BTGEmitirBoletoModal({ open, onClose, cobranca, devedor, onSuccess }: Props) {
  const [resultado, setResultado] = useState<{
    collectionId: string;
    bankSlipUrl?: string;
    pixQrCode?: string;
    pixCopyPaste?: string;
    barCode?: string;
    digitableLine?: string;
    status: string;
    dueDate: string;
  } | null>(null);

  // Verificar se tem endereço completo
  const temEnderecoCompleto = !!(
    devedor.address &&
    devedor.city &&
    devedor.state &&
    devedor.zipCode
  );

  const [payerOverrides, setPayerOverrides] = useState({
    payerName: devedor.name || "",
    payerDocument: devedor.cpfCnpj || "",
    payerEmail: devedor.email || "",
    payerPhone: devedor.phone || "",
    payerAddress: devedor.address || "",
    payerAddressNumber: devedor.addressNumber || "",
    payerAddressComplement: devedor.addressComplement || "",
    payerNeighborhood: devedor.neighborhood || "",
    payerCity: devedor.city || "",
    payerState: devedor.state || "",
    payerZipCode: devedor.zipCode || "",
  });

  const emitirMutation = trpc.btg.emitirBoleto.useMutation({
    onSuccess: (res) => {
      setResultado(res);
      toast.success("Boleto BTG emitido com sucesso!");
      onSuccess?.();
    },
    onError: (err) => {
      toast.error("Erro ao emitir boleto: " + err.message);
    },
  });

  const handleEmitir = () => {
    if (!payerOverrides.payerDocument.replace(/\D/g, "")) {
      toast.error("CPF/CNPJ é obrigatório para emissão de boleto");
      return;
    }

    emitirMutation.mutate({
      cobrancaId: cobranca.id,
      ...payerOverrides,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const valorFormatado = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cobranca.amount / 100);

  const dueDateFormatado = cobranca.dueDate
    ? new Date(cobranca.dueDate).toLocaleDateString("pt-BR")
    : "—";

  // Já tem boleto ativo
  const temBoletoAtivo = cobranca.btgCollectionId &&
    cobranca.btgStatus &&
    !["CANCELED", "EXPIRED"].includes(cobranca.btgStatus);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Emitir Boleto BTG — Cobrança #{cobranca.id}
          </DialogTitle>
          <DialogDescription>
            {cobranca.description} · {valorFormatado} · Vencimento: {dueDateFormatado}
          </DialogDescription>
        </DialogHeader>

        {resultado ? (
          // Resultado da emissão
          <div className="space-y-4">
            <Alert className="border-green-500/50 bg-green-500/5">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription>
                <strong>Boleto emitido com sucesso!</strong>
                <br />
                ID BTG: <code className="text-xs">{resultado.collectionId}</code>
                <br />
                Vencimento: {new Date(resultado.dueDate).toLocaleDateString("pt-BR")}
              </AlertDescription>
            </Alert>

            <Tabs defaultValue="boleto">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="boleto">Boleto PDF</TabsTrigger>
                <TabsTrigger value="pix">PIX Copia e Cola</TabsTrigger>
              </TabsList>

              <TabsContent value="boleto" className="space-y-3 mt-3">
                {resultado.bankSlipUrl ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Link do boleto PDF:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all">
                        {resultado.bankSlipUrl}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(resultado.bankSlipUrl!, "Link")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={resultado.bankSlipUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">URL do boleto será disponibilizada em breve pelo BTG.</p>
                )}

                {resultado.digitableLine && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Linha digitável:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all">
                        {resultado.digitableLine}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(resultado.digitableLine!, "Linha digitável")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="pix" className="space-y-3 mt-3">
                {resultado.pixCopyPaste ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <QrCode className="h-4 w-4" />
                      PIX Copia e Cola (EMV):
                    </p>
                    <div className="flex items-start gap-2">
                      <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all font-mono">
                        {resultado.pixCopyPaste}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(resultado.pixCopyPaste!, "PIX Copia e Cola")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    O QR Code PIX será gerado pelo BTG e disponibilizado em breve.
                    Use a função "Sincronizar Status" para atualizar.
                  </p>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </div>
        ) : (
          // Formulário de emissão
          <div className="space-y-4">
            {temBoletoAtivo && (
              <Alert className="border-yellow-500/50 bg-yellow-500/5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <AlertDescription>
                  Esta cobrança já possui um boleto BTG ativo (Status: <Badge variant="outline">{cobranca.btgStatus}</Badge>).
                  Para reemitir, cancele o boleto atual primeiro.
                </AlertDescription>
              </Alert>
            )}

            {!devedor.cpfCnpj && (
              <Alert className="border-red-500/50 bg-red-500/5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <AlertDescription>
                  <strong>CPF/CNPJ não cadastrado.</strong> Preencha abaixo ou{" "}
                  <a href={`/devedores/${devedor.id}`} className="underline text-primary">
                    edite o devedor
                  </a>{" "}
                  para salvar permanentemente.
                </AlertDescription>
              </Alert>
            )}

            {!temEnderecoCompleto && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Endereço incompleto. Preencha abaixo para esta emissão ou{" "}
                  <a href={`/devedores/${devedor.id}`} className="underline text-primary">
                    edite o devedor
                  </a>{" "}
                  para salvar permanentemente.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Pagador *</Label>
                <Input
                  value={payerOverrides.payerName}
                  onChange={e => setPayerOverrides(p => ({ ...p, payerName: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label>CPF / CNPJ *</Label>
                <Input
                  value={payerOverrides.payerDocument}
                  onChange={e => setPayerOverrides(p => ({ ...p, payerDocument: e.target.value }))}
                  placeholder="000.000.000-00"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={payerOverrides.payerEmail}
                  onChange={e => setPayerOverrides(p => ({ ...p, payerEmail: e.target.value }))}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={payerOverrides.payerPhone}
                  onChange={e => setPayerOverrides(p => ({ ...p, payerPhone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Endereço do Pagador</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-2">
                  <Label>Logradouro</Label>
                  <Input
                    value={payerOverrides.payerAddress}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerAddress: e.target.value }))}
                    placeholder="Rua, Av., etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input
                    value={payerOverrides.payerAddressNumber}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerAddressNumber: e.target.value }))}
                    placeholder="123"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Complemento</Label>
                  <Input
                    value={payerOverrides.payerAddressComplement}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerAddressComplement: e.target.value }))}
                    placeholder="Apto, Sala..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bairro</Label>
                  <Input
                    value={payerOverrides.payerNeighborhood}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerNeighborhood: e.target.value }))}
                    placeholder="Bairro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <Input
                    value={payerOverrides.payerZipCode}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerZipCode: e.target.value.replace(/\D/g, "") }))}
                    placeholder="00000000"
                    maxLength={8}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input
                    value={payerOverrides.payerCity}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerCity: e.target.value }))}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input
                    value={payerOverrides.payerState}
                    onChange={e => setPayerOverrides(p => ({ ...p, payerState: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleEmitir}
                disabled={emitirMutation.isPending || !!temBoletoAtivo}
              >
                {emitirMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Emitir Boleto BTG
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
