import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, ClipboardList, Copy, ExternalLink, FileText, Landmark, Loader2, Plus, QrCode, RefreshCw, Send, ShieldCheck } from "lucide-react";

const STATUS_REMESSA: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "border-slate-300 bg-slate-50 text-slate-700" },
  enviando: { label: "Enviando", className: "border-blue-300 bg-blue-50 text-blue-700" },
  processada: { label: "Processada", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  processada_parcialmente: { label: "Parcial", className: "border-amber-300 bg-amber-50 text-amber-700" },
  falha: { label: "Falha", className: "border-red-300 bg-red-50 text-red-700" },
  cancelada: { label: "Cancelada", className: "border-red-300 bg-red-50 text-red-700" },
};

const moeda = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const dataHora = (valor: Date | string | null | undefined) => valor ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(valor)) : "—";
const data = (valor: Date | string | null | undefined) => valor ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(valor)) : "—";

export default function BTGRemessas() {
  const utils = trpc.useUtils();
  const [condominioId, setCondominioId] = useState<string>("todos");
  const [condominioNovoId, setCondominioNovoId] = useState<string>("");
  const [sheetNovoAberto, setSheetNovoAberto] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [remessaDetalheId, setRemessaDetalheId] = useState<number | null>(null);

  const condominioFiltroId = condominioId === "todos" ? undefined : Number(condominioId);
  const condominioNovoNumero = condominioNovoId ? Number(condominioNovoId) : null;
  const { data: painel } = trpc.btgV2.painel.useQuery();
  const { data: condominios } = trpc.condominios.list.useQuery();
  const { data: remessas, refetch: refetchRemessas, isLoading: carregandoRemessas } = trpc.btgV2.listarRemessas.useQuery(
    condominioFiltroId ? { condominioId: condominioFiltroId } : undefined,
  );
  const fila = trpc.btgV2.filaRemessa.useQuery(
    { condominioId: condominioNovoNumero ?? 0 },
    { enabled: Boolean(condominioNovoNumero && sheetNovoAberto) },
  );
  const detalhe = trpc.btgV2.detalheRemessa.useQuery(
    { remessaId: remessaDetalheId ?? 0 },
    { enabled: Boolean(remessaDetalheId) },
  );

  useEffect(() => {
    if (!fila.data) return;
    setSelecionadas(new Set(fila.data.parcelas.filter((parcela) => parcela.elegivel).map((parcela) => parcela.id)));
  }, [fila.data]);

  const criarRemessaMutation = trpc.btgV2.criarEEnviarRemessa.useMutation({
    onSuccess: async (resultado) => {
      toast[resultado.totalFalha ? "warning" : "success"](
        resultado.totalFalha
          ? `Remessa #${resultado.id} finalizada com ${resultado.totalFalha} item(ns) para revisão.`
          : `Remessa #${resultado.id} enviada com sucesso.`,
      );
      setConfirmacaoAberta(false);
      setSheetNovoAberto(false);
      setConfirmacao("");
      setObservacao("");
      setSelecionadas(new Set());
      setRemessaDetalheId(resultado.id);
      await Promise.all([refetchRemessas(), detalhe.refetch(), utils.btgV2.listarEmissoes.invalidate()]);
    },
    onError: (error) => { setConfirmacaoAberta(false); toast.error(error.message); },
  });
  const conciliarPendentesMutation = trpc.btgV2.conciliarPendentes.useMutation({
    onSuccess: async (resultado) => {
      toast[resultado.erros.length ? "warning" : "success"](`${resultado.processadas} cobrança(s) consultada(s); ${resultado.pagas} baixa(s) aplicada(s).`);
      await Promise.all([refetchRemessas(), detalhe.refetch(), utils.btgV2.listarEmissoes.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const conciliarItemMutation = trpc.btgV2.conciliarEmissao.useMutation({
    onSuccess: async (resultado) => {
      toast.success(resultado.pagamentoAplicado ? "Pagamento conciliado e baixa registrada." : `Status atualizado: ${resultado.statusAtual}.`);
      await detalhe.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const parcelasElegiveis = useMemo(() => fila.data?.parcelas.filter((parcela) => parcela.elegivel) ?? [], [fila.data]);
  const totalSelecionado = useMemo(() => fila.data?.parcelas.filter((parcela) => selecionadas.has(parcela.id)).reduce((total, parcela) => total + parcela.amount, 0) ?? 0, [fila.data, selecionadas]);
  const todasSelecionadas = parcelasElegiveis.length > 0 && parcelasElegiveis.every((parcela) => selecionadas.has(parcela.id));
  const resumo = useMemo(() => {
    const base = { rascunho: 0, enviando: 0, processada: 0, processada_parcialmente: 0, falha: 0 };
    for (const remessa of remessas ?? []) {
      if (remessa.status in base) base[remessa.status as keyof typeof base] += 1;
    }
    return base;
  }, [remessas]);
  const ambienteSandbox = painel?.oauth?.ambiente === "sandbox";

  const alternarParcela = (id: number, marcado: boolean) => setSelecionadas((anterior) => {
    const proxima = new Set(anterior);
    marcado ? proxima.add(id) : proxima.delete(id);
    return proxima;
  });
  const abrirNovaRemessa = () => {
    setCondominioNovoId("");
    setObservacao("");
    setSelecionadas(new Set());
    setSheetNovoAberto(true);
  };
  const copiar = (valor: string, rotulo: string) => { void navigator.clipboard.writeText(valor); toast.success(`${rotulo} copiado.`); };

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-3"><Landmark className="h-7 w-7 text-primary" /></div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Remessas BTG</h1>
            <Badge variant="outline" className={ambienteSandbox ? "border-amber-400 bg-amber-50 text-amber-700" : "border-emerald-400 bg-emerald-50 text-emerald-700"}>{ambienteSandbox ? "SANDBOX" : "PRODUÇÃO"}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Emissões BolePix v2 por lote. As remessas CNAB 240 permanecem em operação separada.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => conciliarPendentesMutation.mutate(condominioFiltroId ? { condominioId: condominioFiltroId } : undefined)} disabled={!painel?.emissaoHabilitada || conciliarPendentesMutation.isPending}>
          {conciliarPendentesMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar status
        </Button>
        <Button onClick={abrirNovaRemessa} disabled={!painel?.emissaoHabilitada}><Plus className="mr-2 h-4 w-4" />Nova remessa</Button>
      </div>
    </header>

    {!painel?.emissaoHabilitada && <Alert variant="destructive"><CircleAlert className="h-4 w-4" /><AlertDescription>A emissão BTG está bloqueada. Conclua a configuração, o vínculo da conta recebedora e a liberação do ambiente antes de enviar remessas.</AlertDescription></Alert>}
    <Alert><ShieldCheck className="h-4 w-4" /><AlertDescription>Um lote contém parcelas de apenas um condomínio e registra cada resultado antes e depois do envio. Pagamentos só recebem baixa após confirmação integral do BTG.</AlertDescription></Alert>

    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      <Kpi label="Rascunhos" value={resumo.rascunho} />
      <Kpi label="Em envio" value={resumo.enviando} tone="blue" />
      <Kpi label="Processadas" value={resumo.processada} tone="green" />
      <Kpi label="Parciais" value={resumo.processada_parcialmente} tone="amber" />
      <Kpi label="Com falha" value={resumo.falha} tone="red" />
    </div>

    <Card>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-sm"><Label htmlFor="filtro-condominio">Condomínio</Label><Select value={condominioId} onValueChange={setCondominioId}><SelectTrigger id="filtro-condominio" className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os condomínios</SelectItem>{condominios?.map((condominio) => <SelectItem key={condominio.id} value={String(condominio.id)}>{condominio.name}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="outline" onClick={() => void refetchRemessas()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar lista</Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4" />Histórico de remessas</CardTitle><CardDescription>{remessas?.length ?? 0} lote(s) encontrados, limitados aos 100 mais recentes.</CardDescription></CardHeader>
      <CardContent>{carregandoRemessas ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : !remessas?.length ? <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Ainda não há remessas BTG. Crie um lote a partir de parcelas elegíveis de acordos.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Condomínio</TableHead><TableHead>Criação</TableHead><TableHead className="text-right">Itens / valor</TableHead><TableHead>Progresso</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>{remessas.map((remessa) => { const status = STATUS_REMESSA[remessa.status] ?? { label: remessa.status, className: "" }; return <TableRow key={remessa.id}><TableCell className="font-mono text-xs">#{remessa.id}</TableCell><TableCell className="font-medium">{remessa.condominioNome}</TableCell><TableCell className="text-sm">{dataHora(remessa.criadaEm)}</TableCell><TableCell className="text-right"><p className="font-medium">{remessa.totalSelecionado} itens</p><p className="text-xs text-muted-foreground">{moeda(remessa.valorTotalCentavos)}</p></TableCell><TableCell><span className="text-sm text-emerald-700">{remessa.totalEmitido} emitido(s)</span>{remessa.totalFalha > 0 && <span className="block text-xs text-destructive">{remessa.totalFalha} falha(s)</span>}</TableCell><TableCell><Badge variant="outline" className={status.className}>{status.label}</Badge></TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setRemessaDetalheId(remessa.id)}>Acompanhar</Button></TableCell></TableRow>; })}</TableBody></Table></div>}</CardContent>
    </Card>

    <Sheet open={sheetNovoAberto} onOpenChange={(aberto) => { if (!aberto) setSheetNovoAberto(false); }}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-5 pr-12"><SheetTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-primary" />Nova remessa BTG</SheetTitle><SheetDescription>Selecione um condomínio, revise as parcelas elegíveis e confirme um único lote BolePix.</SheetDescription></SheetHeader>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-2"><Label htmlFor="novo-condominio">Condomínio</Label><Select value={condominioNovoId} onValueChange={setCondominioNovoId}><SelectTrigger id="novo-condominio"><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger><SelectContent>{condominios?.map((condominio) => <SelectItem key={condominio.id} value={String(condominio.id)}>{condominio.name}</SelectItem>)}</SelectContent></Select></div>
          {!condominioNovoNumero ? <div className="py-16 text-center text-sm text-muted-foreground">Escolha um condomínio para carregar a fila de parcelas de acordos.</div> : fila.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : fila.error ? <Alert variant="destructive" className="mt-5"><CircleAlert className="h-4 w-4" /><AlertDescription>{fila.error.message}</AlertDescription></Alert> : <>
            {!fila.data?.conta && <Alert variant="destructive" className="mt-5"><CircleAlert className="h-4 w-4" /><AlertDescription>Este condomínio não possui conta recebedora BTG ativa vinculada.</AlertDescription></Alert>}
            {fila.data?.conta && <Alert className="mt-5"><Landmark className="h-4 w-4" /><AlertDescription>Conta recebedora: <strong>{fila.data.conta.rotulo}</strong> · Ag. {fila.data.conta.agencia} · Conta {fila.data.conta.numeroMascarado}</AlertDescription></Alert>}
            <div className="mt-5 flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3"><div><p className="text-sm font-semibold">Parcelas do lote</p><p className="text-xs text-muted-foreground">{parcelasElegiveis.length} elegível(is) para envio</p></div><Button variant="ghost" size="sm" disabled={!parcelasElegiveis.length} onClick={() => setSelecionadas(todasSelecionadas ? new Set() : new Set(parcelasElegiveis.map((parcela) => parcela.id)))}>{todasSelecionadas ? "Desmarcar todas" : "Selecionar todas"}</Button></div>
            <div className="mt-3 space-y-2">{fila.data?.parcelas.map((parcela) => <label key={parcela.id} className={`flex items-start gap-3 rounded-lg border p-4 ${parcela.elegivel ? "cursor-pointer hover:border-primary/40 hover:bg-primary/5" : "bg-muted/30 opacity-75"}`}><Checkbox checked={selecionadas.has(parcela.id)} disabled={!parcela.elegivel} onCheckedChange={(valor) => alternarParcela(parcela.id, valor === true)} /><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2"><span className="font-medium">Acordo #{parcela.acordoId} · {parcela.installmentNumber === 0 ? "Entrada" : `Parcela ${parcela.installmentNumber}`}</span><span>{moeda(parcela.amount)}</span></span><span className="mt-1 block text-xs text-muted-foreground">{parcela.devedorNome || "Devedor não informado"} · vence em {data(parcela.dueDate)}</span>{!parcela.elegivel && <span className="mt-1 block text-xs text-destructive">{parcela.motivoBloqueio}</span>}</span></label>)}</div>
            <div className="mt-5 space-y-2"><Label htmlFor="observacao-remessa">Observação <span className="text-muted-foreground">(opcional)</span></Label><Input id="observacao-remessa" maxLength={500} value={observacao} onChange={(event) => setObservacao(event.target.value)} placeholder="Referência interna do lote" /></div>
          </>}
        </div>
        <SheetFooter className="border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">{selecionadas.size} parcela(s) · {moeda(totalSelecionado)}</p><p className="text-xs text-muted-foreground">O lote será persistido antes do envio ao BTG.</p></div><Button onClick={() => setConfirmacaoAberta(true)} disabled={!fila.data?.conta || selecionadas.size === 0 || !painel?.emissaoHabilitada}>Revisar e enviar</Button></SheetFooter>
      </SheetContent>
    </Sheet>

    <AlertDialog open={confirmacaoAberta} onOpenChange={setConfirmacaoAberta}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{ambienteSandbox ? "Confirmar remessa de homologação?" : "Confirmar remessa BolePix em Produção?"}</AlertDialogTitle><AlertDialogDescription>{ambienteSandbox ? "O lote será registrado e enviado ao ambiente de homologação. O BTG pode devolver respostas estáticas." : "Esta operação envia cobranças reais ao BTG. O lote e cada item serão registrados para auditoria."} Digite <strong>ENVIAR REMESSA</strong> para confirmar.</AlertDialogDescription></AlertDialogHeader><Input value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} placeholder="ENVIAR REMESSA" /><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction disabled={confirmacao !== "ENVIAR REMESSA" || criarRemessaMutation.isPending} onClick={(event) => { event.preventDefault(); if (!condominioNovoNumero) return; criarRemessaMutation.mutate({ condominioId: condominioNovoNumero, parcelaIds: Array.from(selecionadas), observacao: observacao || undefined, confirmacao: "ENVIAR REMESSA" }); }}>{criarRemessaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar envio</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

    <Sheet open={remessaDetalheId !== null} onOpenChange={(aberto) => !aberto && setRemessaDetalheId(null)}><SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-2xl"><SheetHeader className="border-b px-6 py-5 pr-12"><SheetTitle>Detalhe da remessa {detalhe.data ? `#${detalhe.data.remessa.id}` : ""}</SheetTitle><SheetDescription>{detalhe.data?.condominioNome || "Carregando histórico do lote..."}</SheetDescription></SheetHeader>{detalhe.isLoading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> : detalhe.data ? <div className="flex-1 overflow-y-auto p-6"><div className="grid grid-cols-3 gap-3"><Resumo label="Selecionadas" value={String(detalhe.data.remessa.totalSelecionado)} /><Resumo label="Emitidas" value={String(detalhe.data.remessa.totalEmitido)} tone="green" /><Resumo label="Falhas" value={String(detalhe.data.remessa.totalFalha)} tone={detalhe.data.remessa.totalFalha ? "red" : undefined} /></div>{detalhe.data.remessa.erroResumo && <Alert variant="destructive" className="mt-4"><CircleAlert className="h-4 w-4" /><AlertDescription>{detalhe.data.remessa.erroResumo}</AlertDescription></Alert>}<div className="mt-5 divide-y overflow-hidden rounded-lg border">{detalhe.data.itens.map((item) => <div key={item.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{item.installmentNumber === 0 ? "Entrada" : `Parcela ${item.installmentNumber}`}</p><p className="mt-1 text-xs text-muted-foreground">{moeda(item.valorCentavos)} · {item.mensagem || "Aguardando processamento"}</p></div><Badge variant="outline" className={item.resultado === "falha" ? "border-red-300 bg-red-50 text-red-700" : item.resultado === "pendente" ? "" : "border-emerald-300 bg-emerald-50 text-emerald-700"}>{item.resultado === "ja_existia" ? "Já existente" : item.resultado}</Badge></div>{item.emissao && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!item.emissao.btgCollectionId || conciliarItemMutation.isPending} onClick={() => conciliarItemMutation.mutate({ emissaoId: item.emissao!.id })}><RefreshCw className="mr-1 h-3.5 w-3.5" />Conciliar</Button>{item.emissao.pixCopiaECola && <Button size="sm" variant="outline" onClick={() => copiar(item.emissao!.pixCopiaECola!, "PIX Copia e Cola")}><QrCode className="mr-1 h-3.5 w-3.5" />Pix</Button>}{item.emissao.linhaDigitavel && <Button size="sm" variant="outline" onClick={() => copiar(item.emissao!.linhaDigitavel!, "Linha digitável")}><Copy className="mr-1 h-3.5 w-3.5" />Linha</Button>}{item.emissao.bankSlipUrl && <Button size="sm" variant="outline" asChild><a href={item.emissao.bankSlipUrl} target="_blank" rel="noreferrer"><FileText className="mr-1 h-3.5 w-3.5" />Boleto<ExternalLink className="ml-1 h-3 w-3" /></a></Button>}</div>}</div>)}</div></div> : null}</SheetContent></Sheet>
  </div>;
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "blue" | "green" | "amber" | "red" }) { const cor = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : tone === "blue" ? "text-blue-700" : "text-foreground"; return <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-bold ${cor}`}>{value}</p></CardContent></Card>; }
function Resumo({ label, value, tone }: { label: string; value: string; tone?: "green" | "red" }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-bold ${tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : ""}`}>{value}</p></div>; }
