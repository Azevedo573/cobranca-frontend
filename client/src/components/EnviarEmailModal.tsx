import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle2, Paperclip, FileText, X, Receipt } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AnexoSelecionado {
  nome: string;
  url: string;
  mimeType: string;
  tipo: "boleto" | "acordo";
  label: string; // descrição para o usuário
}

interface AnexoInicial {
  nome: string;
  url: string;
  mimeType: string;
}

interface EnviarEmailModalProps {
  open: boolean;
  onClose: () => void;
  devedorId: number;
  nomeDevedor: string;
  emailDevedor?: string | null;
  condominioId?: number;
  /** Anexo pré-carregado (ex: documento gerado pelo sistema) */
  anexoInicial?: AnexoInicial;
}

export default function EnviarEmailModal({
  open,
  onClose,
  devedorId,
  nomeDevedor,
  emailDevedor,
  condominioId,
  anexoInicial,
}: EnviarEmailModalProps) {
  const [destinatario, setDestinatario] = useState(emailDevedor ?? "");
  const [assunto, setAssunto] = useState("");
  const [corpoHtml, setCorpoHtml] = useState("");
  const [modeloId, setModeloId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [anexosSelecionados, setAnexosSelecionados] = useState<AnexoSelecionado[]>([]);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setDestinatario(emailDevedor ?? "");
      setAssunto("");
      setCorpoHtml("");
      setModeloId("");
      setEnviado(false);
      // Pré-carregar o anexo inicial (documento gerado pelo sistema)
      if (anexoInicial) {
        setAnexosSelecionados([{
          nome: anexoInicial.nome,
          url: anexoInicial.url,
          mimeType: anexoInicial.mimeType,
          tipo: "boleto" as const,
          label: anexoInicial.nome,
        }]);
      } else {
        setAnexosSelecionados([]);
      }
    }
  }, [open, emailDevedor, anexoInicial]);

  const { data: modelos = [] } = trpc.modelosDocumento.list.useQuery({ condominioId: condominioId ?? null });

  // Buscar cobranças com boleto gerado (URL de S3)
  const { data: cobrancas = [] } = trpc.cobrancas.getByDevedor.useQuery(
    { devedorId },
    { enabled: open }
  );

  // Buscar acordos do devedor
  const { data: acordos = [] } = trpc.acordos.listByDevedor.useQuery(
    { devedorId },
    { enabled: open }
  );

  // Buscar parcelas de cada acordo ativo para obter URLs de boletos de parcelas
  const acordosAtivos = acordos.filter((a: any) => a.status === "ativo" || a.status === "pago");

  const enviarMutation = trpc.email.enviar.useMutation();
  const utils = trpc.useUtils();

  const handleModeloChange = (id: string) => {
    setModeloId(id);
    if (id && id !== "nenhum") {
      const modelo = modelos.find((m: any) => String(m.id) === id);
      if (modelo) {
        setAssunto(`${modelo.nome} — ${nomeDevedor}`);
        const htmlBase = (modelo as any).conteudoHtml || "";
        const htmlSubstituido = htmlBase
          .replace(/\{\{nomeDevedor\}\}/g, nomeDevedor)
          .replace(/\{\{nomeCondomino\}\}/g, nomeDevedor);
        setCorpoHtml(htmlSubstituido);
      }
    }
  };

  const toggleAnexo = (anexo: AnexoSelecionado) => {
    setAnexosSelecionados((prev) => {
      const existe = prev.find((a) => a.url === anexo.url);
      if (existe) return prev.filter((a) => a.url !== anexo.url);
      return [...prev, anexo];
    });
  };

  const removerAnexo = (url: string) => {
    setAnexosSelecionados((prev) => prev.filter((a) => a.url !== url));
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
        anexos: anexosSelecionados.map((a) => ({
          nome: a.nome,
          url: a.url,
          mimeType: a.mimeType,
        })),
      });

      if (result.sucesso) {
        setEnviado(true);
        toast.success("E-mail enviado com sucesso!");
        utils.email.listarPorDevedor.invalidate({ devedorId });
        setTimeout(() => {
          onClose();
        }, 1800);
      } else {
        toast.error("Falha ao enviar: " + result.erro);
      }
    } catch (err: any) {
      toast.error("Erro ao enviar e-mail: " + err.message);
    } finally {
      setEnviando(false);
    }
  };

  // Cobranças com boleto gerado (têm URL de PDF no S3)
  const cobrancasComBoleto = (cobrancas as any[]).filter(
    (c) => c.boletoPdfUrl && (c.status === "pendente" || c.status === "em_cobranca" || c.status === "atrasado")
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !enviando) onClose(); }}>
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
            {anexosSelecionados.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {anexosSelecionados.length} anexo(s) incluído(s)
              </p>
            )}
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
                    {modelos.map((m: any) => (
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
                rows={7}
                className="font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Aceita HTML. Use os modelos de documento para preencher automaticamente com variáveis do devedor.
              </p>
            </div>

            <Separator />

            {/* Seção de Anexos */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Anexar Documentos do Sistema</Label>
              </div>

              {/* Boletos gerados */}
              {cobrancasComBoleto.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Boletos Gerados
                  </p>
                  <div className="space-y-1.5">
                    {cobrancasComBoleto.map((c: any) => {
                      const nomeArquivo = `boleto-${c.description ?? "cobranca"}-${c.id}.pdf`.replace(/\s+/g, "-").toLowerCase();
                      const label = `${c.description ?? "Cobrança"} — Venc. ${c.dueDate ? format(new Date(c.dueDate), "dd/MM/yyyy", { locale: ptBR }) : "—"} — R$ ${(c.amount ?? 0).toFixed(2).replace(".", ",")}`;
                      const anexo: AnexoSelecionado = {
                        nome: nomeArquivo,
                        url: c.boletoPdfUrl,
                        mimeType: "application/pdf",
                        tipo: "boleto",
                        label,
                      };
                      const selecionado = anexosSelecionados.some((a) => a.url === c.boletoPdfUrl);
                      return (
                        <label key={c.id} className="flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors">
                          <Checkbox
                            checked={selecionado}
                            onCheckedChange={() => toggleAnexo(anexo)}
                            className="mt-0.5"
                          />
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Receipt className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                            <span className="text-sm truncate">{label}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Acordos com PDF */}
              {acordosAtivos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Acordos
                  </p>
                  <div className="space-y-1.5">
                    {acordosAtivos.map((a: any) => {
                      if (!a.pdfUrl) return null;
                      const nomeArquivo = `acordo-${a.id}.pdf`;
                      const label = `Acordo #${a.id} — ${a.installments}x de R$ ${((a.agreedAmount ?? 0) / (a.installments ?? 1)).toFixed(2).replace(".", ",")} — ${a.status === "ativo" ? "Ativo" : "Pago"}`;
                      const anexo: AnexoSelecionado = {
                        nome: nomeArquivo,
                        url: a.pdfUrl,
                        mimeType: "application/pdf",
                        tipo: "acordo",
                        label,
                      };
                      const selecionado = anexosSelecionados.some((x) => x.url === a.pdfUrl);
                      return (
                        <label key={a.id} className="flex items-start gap-2.5 p-2.5 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors">
                          <Checkbox
                            checked={selecionado}
                            onCheckedChange={() => toggleAnexo(anexo)}
                            className="mt-0.5"
                          />
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            <span className="text-sm truncate">{label}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {cobrancasComBoleto.length === 0 && acordosAtivos.filter((a: any) => a.pdfUrl).length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Nenhum documento disponível para anexar. Gere um boleto ou acordo para este devedor primeiro.
                </p>
              )}

              {/* Resumo dos anexos selecionados */}
              {anexosSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {anexosSelecionados.map((a) => (
                    <Badge key={a.url} variant="secondary" className="gap-1 pr-1 text-xs">
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[160px] truncate">{a.nome}</span>
                      <button
                        type="button"
                        onClick={() => removerAnexo(a.url)}
                        className="ml-0.5 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
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
                <>
                  <Mail className="h-4 w-4" />
                  Enviar E-mail
                  {anexosSelecionados.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                      {anexosSelecionados.length} anexo(s)
                    </Badge>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
