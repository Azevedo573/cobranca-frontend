import { useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Loader2, AlertTriangle, CheckCircle2, Copy, ExternalLink, QrCode, FileText, ShieldCheck } from "lucide-react";
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
  const [confirmarOpen, setConfirmarOpen] = useState(false);
  const [resultado, setResultado] = useState<{
    collectionId: string | null;
    bankSlipUrl: string | null;
    pixQrCode: string | null;
    pixCopiaECola: string | null;
    codigoBarras: string | null;
    linhaDigitavel: string | null;
    nossoNumero: string | null;
    status: string;
    jaExistia: boolean;
  } | null>(null);

  const { data: painel } = trpc.btgV2.painel.useQuery();
  const emitirMutation = trpc.btgV2.emitirBolePix.useMutation({
    onSuccess: (res) => {
      setResultado(res);
      setConfirmarOpen(false);
      toast.success(res.jaExistia ? "A simulação BolePix já estava registrada." : "Resposta simulada do BolePix Sandbox recebida com sucesso.");
      onSuccess?.();
    },
    onError: (err) => {
      setConfirmarOpen(false);
      toast.error(`Não foi possível emitir BolePix: ${err.message}`);
    },
  });

  const pendencias = useMemo(() => {
    const items: string[] = [];
    if (!painel?.emissaoHabilitada) items.push("a homologação BolePix Sandbox não está habilitada");
    if (!devedor.cpfCnpj?.replace(/\D/g, "")) items.push("CPF/CNPJ do pagador não está cadastrado");
    if (!devedor.name?.trim()) items.push("nome do pagador não está cadastrado");
    if (!cobranca.dueDate) items.push("vencimento da cobrança não está definido");
    if (!devedor.address || !devedor.addressNumber || !devedor.neighborhood || !devedor.city || !devedor.state || devedor.zipCode?.replace(/\D/g, "").length !== 8) {
      items.push("endereço completo do pagador não está cadastrado");
    }
    return items;
  }, [cobranca.dueDate, devedor, painel?.emissaoHabilitada]);

  const valorFormatado = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cobranca.amount / 100);
  const dueDateFormatado = cobranca.dueDate ? new Date(cobranca.dueDate).toLocaleDateString("pt-BR") : "—";
  const aptoParaEmitir = pendencias.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-500" /> Emitir BolePix BTG — Cobrança #{cobranca.id}</DialogTitle>
            <DialogDescription>{cobranca.description || "Cobrança condominial"} · {valorFormatado} · Vencimento: {dueDateFormatado}</DialogDescription>
          </DialogHeader>

          {resultado ? (
            <div className="space-y-4">
              <Alert className="border-emerald-500/50 bg-emerald-500/5"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><AlertDescription><strong>{resultado.jaExistia ? "Simulação já registrada." : "Resposta simulada do BolePix Sandbox recebida."}</strong><br />ID retornado pelo BTG: <code className="text-xs">{resultado.collectionId || "aguardando confirmação"}</code><br />Status local: {resultado.status}<br /><span className="text-xs">O Sandbox BTG usa respostas estáticas de homologação; esta etapa não cria cobrança persistida no portal bancário.</span></AlertDescription></Alert>
              <Tabs defaultValue="boleto"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="boleto">Boleto</TabsTrigger><TabsTrigger value="pix">Pix</TabsTrigger></TabsList>
                <TabsContent value="boleto" className="space-y-3 mt-3">
                  {resultado.bankSlipUrl ? <DataLine label="Link do boleto" value={resultado.bankSlipUrl} copyLabel="Link" external /> : <p className="text-sm text-muted-foreground">A URL do boleto não foi retornada no ambiente atual.</p>}
                  {resultado.linhaDigitavel && <DataLine label="Linha digitável" value={resultado.linhaDigitavel} copyLabel="Linha digitável" />}
                  {resultado.codigoBarras && <DataLine label="Código de barras" value={resultado.codigoBarras} copyLabel="Código de barras" />}
                </TabsContent>
                <TabsContent value="pix" className="space-y-3 mt-3">
                  {resultado.pixCopiaECola ? <DataLine label="PIX Copia e Cola" value={resultado.pixCopiaECola} copyLabel="PIX Copia e Cola" icon={<QrCode className="h-4 w-4" />} /> : <p className="text-sm text-muted-foreground">O EMV Pix não foi retornado no ambiente atual.</p>}
                </TabsContent>
              </Tabs>
              <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription><strong>Homologação Sandbox.</strong> A emissão usa BolePix, conta recebedora vinculada ao condomínio e trava de idempotência. O BTG devolve uma resposta estática de teste; nenhuma cobrança é persistida no portal bancário neste ambiente.</AlertDescription></Alert>
              <div className="grid sm:grid-cols-2 gap-3 rounded-lg border p-4 text-sm"><Detail label="Pagador" value={devedor.name || "Não informado"} /><Detail label="CPF/CNPJ" value={devedor.cpfCnpj || "Não informado"} /><Detail label="Unidade" value={`${devedor.bloco ? `Bl. ${devedor.bloco} · ` : ""}${devedor.unitNumber}`} /><Detail label="Valor" value={valorFormatado} /><Detail label="Vencimento" value={dueDateFormatado} /><Detail label="Instrumento" value="Boleto com QR Code Pix" /></div>
              {pendencias.length > 0 && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription><strong>Emissão bloqueada:</strong><ul className="list-disc ml-4 mt-1">{pendencias.map((pendencia) => <li key={pendencia}>{pendencia}</li>)}</ul><a href={`/devedores/${devedor.id}/editar`} className="underline text-primary inline-block mt-2">Corrigir cadastro do devedor</a></AlertDescription></Alert>}
              <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!aptoParaEmitir} onClick={() => setConfirmarOpen(true)}>Revisar emissão de teste</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarOpen} onOpenChange={setConfirmarOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmar simulação BolePix no Sandbox?</AlertDialogTitle><AlertDialogDescription>Serão enviados ao BTG Sandbox o valor, vencimento e dados cadastrados do pagador. O ambiente responde por stub de homologação e não cria cobrança no portal bancário. O título ficará protegido contra reemissão duplicada no sistema.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={emitirMutation.isPending} onClick={(event) => { event.preventDefault(); emitirMutation.mutate({ origemTipo: "cobranca", origemId: cobranca.id }); }}>{emitirMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar simulação</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>; }
function DataLine({ label, value, copyLabel, external, icon }: { label: string; value: string; copyLabel: string; external?: boolean; icon?: ReactNode }) {
  const copy = () => { void navigator.clipboard.writeText(value); toast.success(`${copyLabel} copiado.`); };
  return <div className="space-y-2"><p className="text-sm text-muted-foreground flex items-center gap-1">{icon}{label}</p><div className="flex gap-2"><code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all">{value}</code><Button size="sm" variant="outline" onClick={copy}><Copy className="h-3 w-3" /></Button>{external && <Button size="sm" variant="outline" asChild><a href={value} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /></a></Button>}</div></div>;
}
