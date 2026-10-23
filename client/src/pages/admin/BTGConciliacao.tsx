import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { RefreshCw, CheckCircle2, Clock, AlertTriangle, Copy, ExternalLink, Loader2, QrCode, FileText, XCircle, Landmark, ShieldCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  reservada: { label: "Reservada", variant: "outline" },
  enviando: { label: "Enviando", variant: "secondary" },
  emitida: { label: "Emitida", variant: "secondary" },
  incerta: { label: "Confirmação pendente", variant: "destructive" },
  paga: { label: "Paga", variant: "default" },
  cancelada: { label: "Cancelada", variant: "destructive" },
  expirada: { label: "Expirada", variant: "destructive" },
  falha: { label: "Falha", variant: "destructive" },
};

export default function BTGConciliacao() {
  const { user } = useAuth();
  const [condominioId, setCondominioId] = useState<string>("todos");
  const [emissaoParaCancelar, setEmissaoParaCancelar] = useState<number | null>(null);
  const [confirmacaoCancelamento, setConfirmacaoCancelamento] = useState("");
  const condId = condominioId !== "todos" ? Number(condominioId) : (user?.role === "admin" ? undefined : user?.condominioId ?? undefined);
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: painel } = trpc.btgV2.painel.useQuery();
  const { data: emissoes, refetch, isLoading } = trpc.btgV2.listarEmissoes.useQuery(condId ? { condominioId: condId } : undefined);

  const conciliarMutation = trpc.btgV2.conciliarEmissao.useMutation({
    onSuccess: (res) => {
      toast.success(res.pagamentoAplicado ? "Pagamento conciliado e baixa registrada." : res.encontradoNoBtg ? `Status atualizado: ${res.statusAtual}.` : "Cobrança não encontrada no retorno BTG.");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const conciliarPendentesMutation = trpc.btgV2.conciliarPendentes.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.processadas} emissão(ões) consultada(s); ${res.pagas} baixa(s) aplicada(s).`);
      if (res.erros.length) toast.warning(`${res.erros.length} emissão(ões) exigem revisão.`);
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelarMutation = trpc.btgV2.cancelarEmissao.useMutation({
    onSuccess: () => {
      toast.success("BolePix cancelado no Sandbox.");
      setEmissaoParaCancelar(null);
      setConfirmacaoCancelamento("");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const resumo = useMemo(() => Object.entries(STATUS_CONFIG).map(([status, config]) => ({ status, ...config, count: emissoes?.filter((item) => item.status === status).length ?? 0 })).filter((item) => item.count > 0), [emissoes]);
  const formatCurrency = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const formatDate = (date: Date | string | null | undefined) => date ? new Date(date).toLocaleDateString("pt-BR") : "—";
  const copy = (value: string, label: string) => { void navigator.clipboard.writeText(value); toast.success(`${label} copiado.`); };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3 items-center"><div className="p-2 rounded-lg bg-blue-500/10"><Landmark className="h-6 w-6 text-blue-600" /></div><div><div className="flex gap-2 items-center"><h1 className="text-2xl font-bold">Conciliação BolePix BTG v2</h1><Badge variant="outline" className="border-amber-500 text-amber-700">SANDBOX</Badge></div><p className="text-muted-foreground text-sm">Registros canônicos v2; cobranças CNAB e API legadas não aparecem nesta tela.</p></div></div>
        <Button onClick={() => conciliarPendentesMutation.mutate(condId ? { condominioId: condId } : undefined)} disabled={!painel?.emissaoHabilitada || conciliarPendentesMutation.isPending}>{conciliarPendentesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Conciliar pendentes</Button>
      </header>

      <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>A conciliação consulta o BTG por `collectionId`. Uma baixa só é aplicada se o valor pago retornado for idêntico ao valor do título, em centavos.</AlertDescription></Alert>
      {!painel?.emissaoHabilitada && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>A homologação BolePix não está habilitada. Configure OAuth, conta recebedora e vínculo do condomínio antes de emitir ou conciliar.</AlertDescription></Alert>}

      {user?.role === "admin" && condominios && <Card><CardContent className="pt-4"><Select value={condominioId} onValueChange={setCondominioId}><SelectTrigger className="w-full md:w-80"><SelectValue placeholder="Todos os condomínios" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os condomínios</SelectItem>{condominios.map((condominio) => <SelectItem key={condominio.id} value={String(condominio.id)}>{condominio.name}</SelectItem>)}</SelectContent></Select></CardContent></Card>}

      {resumo.length > 0 && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{resumo.map((item) => <Card key={item.status}><CardContent className="pt-4"><div className="text-2xl font-bold">{item.count}</div><Badge variant={item.variant} className="mt-1">{item.label}</Badge></CardContent></Card>)}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Emissões BolePix v2</CardTitle><CardDescription>{emissoes?.length ?? 0} registro(s), limitado aos 100 mais recentes.</CardDescription></CardHeader>
        <CardContent>{isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : !emissoes?.length ? <div className="py-8 text-center text-muted-foreground">Nenhuma emissão BolePix v2 encontrada.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Condomínio / origem</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead><TableHead>Collection ID</TableHead><TableHead>Emitida</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{emissoes.map((emissao) => {
          const status = STATUS_CONFIG[emissao.status] ?? { label: emissao.status, variant: "outline" as const };
          const podeCancelar = ["emitida", "reservada", "enviando", "incerta", "falha"].includes(emissao.status) && Boolean(emissao.collectionId);
          return <TableRow key={emissao.id}><TableCell className="font-mono text-xs">#{emissao.id}</TableCell><TableCell><p className="font-medium text-sm">{emissao.condominioNome}</p><p className="text-xs text-muted-foreground">{emissao.origemTipo === "cobranca" ? "Cobrança" : "Parcela de acordo"} #{emissao.origemId}</p></TableCell><TableCell className="text-right font-medium">{formatCurrency(emissao.amount)}</TableCell><TableCell>{formatDate(emissao.dueDate)}</TableCell><TableCell><Badge variant={status.variant}>{status.label}</Badge>{emissao.erroCodigo && <p className="text-[10px] text-destructive mt-1">{emissao.erroCodigo}</p>}</TableCell><TableCell className="font-mono text-xs max-w-28 truncate">{emissao.collectionId || "—"}</TableCell><TableCell className="text-xs">{formatDate(emissao.emitidaEm)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" title="Conciliar status" disabled={!emissao.collectionId || conciliarMutation.isPending} onClick={() => conciliarMutation.mutate({ emissaoId: emissao.id })}><RefreshCw className="h-3 w-3" /></Button>{emissao.pixCopiaECola && <Button size="icon" variant="ghost" title="Copiar Pix" onClick={() => copy(emissao.pixCopiaECola!, "PIX Copia e Cola")}><QrCode className="h-3 w-3" /></Button>}{emissao.linhaDigitavel && <Button size="icon" variant="ghost" title="Copiar linha digitável" onClick={() => copy(emissao.linhaDigitavel!, "Linha digitável")}><Copy className="h-3 w-3" /></Button>}{emissao.bankSlipUrl && <Button size="icon" variant="ghost" title="Abrir boleto" asChild><a href={emissao.bankSlipUrl} target="_blank" rel="noopener noreferrer"><FileText className="h-3 w-3" /></a></Button>}{podeCancelar && <Button size="icon" variant="ghost" title="Cancelar BolePix" className="text-destructive hover:text-destructive" onClick={() => setEmissaoParaCancelar(emissao.id)}><XCircle className="h-3 w-3" /></Button>}</div></TableCell></TableRow>;
        })}</TableBody></Table></div>}</CardContent>
      </Card>

      <AlertDialog open={emissaoParaCancelar !== null} onOpenChange={(open) => !open && setEmissaoParaCancelar(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancelar BolePix no Sandbox?</AlertDialogTitle><AlertDialogDescription>O BTG precisa confirmar o cancelamento. O título de origem continuará pendente; a reemissão exige uma revisão controlada.</AlertDialogDescription></AlertDialogHeader><Input value={confirmacaoCancelamento} onChange={(event) => setConfirmacaoCancelamento(event.target.value)} placeholder="CANCELAR" /><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={confirmacaoCancelamento !== "CANCELAR" || cancelarMutation.isPending} onClick={(event) => { event.preventDefault(); if (emissaoParaCancelar) cancelarMutation.mutate({ emissaoId: emissaoParaCancelar, confirmacao: "CANCELAR" }); }}>{cancelarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirmar cancelamento</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
