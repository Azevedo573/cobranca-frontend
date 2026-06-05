import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";

interface EnviarEmailModalProps {
  open: boolean;
  onClose: () => void;
  devedorId: number;
  nomeDevedor: string;
  emailDevedor?: string | null;
  condominioId?: number;
}

export default function EnviarEmailModal({
  open,
  onClose,
  devedorId,
  nomeDevedor,
  emailDevedor,
  condominioId,
}: EnviarEmailModalProps) {
  const [destinatario, setDestinatario] = useState(emailDevedor ?? "");
  const [assunto, setAssunto] = useState("");
  const [corpoHtml, setCorpoHtml] = useState("");
  const [modeloId, setModeloId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const { data: modelos = [] } = trpc.modelosDocumento.list.useQuery({ condominioId: condominioId ?? null });
  const enviarMutation = trpc.email.enviar.useMutation();
  const utils = trpc.useUtils();

  const handleModeloChange = (id: string) => {
    setModeloId(id);
    if (id && id !== "nenhum") {
      const modelo = modelos.find((m) => String(m.id) === id);
      if (modelo) {
        setAssunto(`${modelo.nome} — ${nomeDevedor}`);
        // Usar o conteúdo HTML do modelo como base
        const htmlBase = modelo.conteudoHtml || "";
        // Substituir variáveis básicas
        const htmlSubstituido = htmlBase
          .replace(/\{\{nomeDevedor\}\}/g, nomeDevedor)
          .replace(/\{\{nomeCondomino\}\}/g, nomeDevedor);
        setCorpoHtml(htmlSubstituido);
      }
    }
  };

  const handleEnviar = async () => {
    if (!destinatario.trim()) {
      toast.error("Informe o e-mail do destinatário");
      return;
    }
    if (!assunto.trim()) {
      toast.error("Informe o assunto do e-mail");
      return;
    }
    if (!corpoHtml.trim()) {
      toast.error("Informe o corpo do e-mail");
      return;
    }

    setEnviando(true);
    try {
      const result = await enviarMutation.mutateAsync({
        devedorId,
        destinatario: destinatario.trim(),
        nomeDestinatario: nomeDevedor,
        assunto: assunto.trim(),
        corpoHtml,
        condominioId,
        modeloId: modeloId && modeloId !== "nenhum" ? Number(modeloId) : undefined,
      });

      if (result.sucesso) {
        setEnviado(true);
        toast.success("E-mail enviado com sucesso!");
        utils.email.listarPorDevedor.invalidate({ devedorId });
        setTimeout(() => {
          setEnviado(false);
          onClose();
          setAssunto("");
          setCorpoHtml("");
          setModeloId("");
        }, 1500);
      } else {
        toast.error("Falha ao enviar: " + result.erro);
      }
    } catch (err: any) {
      toast.error("Erro ao enviar e-mail: " + err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar E-mail para {nomeDevedor}
          </DialogTitle>
          <DialogDescription>
            O e-mail será enviado via Microsoft 365 usando a conta configurada no sistema.
          </DialogDescription>
        </DialogHeader>

        {enviado ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium text-green-600">E-mail enviado com sucesso!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Destinatário */}
            <div className="space-y-1.5">
              <Label>Destinatário (E-mail)</Label>
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
              />
            </div>

            {/* Modelo */}
            {modelos.length > 0 && (
              <div className="space-y-1.5">
                <Label>Usar modelo de documento (opcional)</Label>
                <Select value={modeloId} onValueChange={handleModeloChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um modelo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum (escrever manualmente)</SelectItem>
                    {modelos.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Assunto */}
            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Input
                placeholder="Ex: Notificação de débito em aberto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
              />
            </div>

            {/* Corpo */}
            <div className="space-y-1.5">
              <Label>Corpo do E-mail</Label>
              <Textarea
                placeholder="Escreva o conteúdo do e-mail aqui..."
                value={corpoHtml}
                onChange={(e) => setCorpoHtml(e.target.value)}
                rows={10}
                className="font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Aceita HTML. Use os modelos de documento para preencher automaticamente com variáveis do devedor.
              </p>
            </div>
          </div>
        )}

        {!enviado && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={handleEnviar} disabled={enviando} className="gap-1.5">
              {enviando ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
              ) : (
                <><Mail className="h-4 w-4" /> Enviar E-mail</>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
