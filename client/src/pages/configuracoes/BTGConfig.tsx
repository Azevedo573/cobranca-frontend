import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { AdminCondominioSelector } from "@/components/AdminCondominioSelector";
import {
  AlertaProducaoBtg,
  ConfirmarContaManualButton,
  ContaManualForm,
  EstadoEmissaoBtg,
  ModoConsultaContasBtg,
  OrigemContaBtg,
} from "@/components/btg/ContaManualUI";
import {
  dadosCadastroManualProducao,
  formatarDataBtg as formatarData,
  novaContaManual,
  podeCadastrarContaManual,
  podeConfirmarContaManual,
  rotuloOrigemConta,
  rotulosEstadoBtg,
} from "@/components/btg/contaManual";
import { toast } from "sonner";
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleAlert,
  CirclePlus,
  ClipboardCheck,
  Info,
  Landmark,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Unplug,
  WalletCards,
  XCircle,
} from "lucide-react";

const mensagensOAuth = {
  conectado: "Conta BTG conectada com sucesso.",
  negado: "O consentimento no BTG foi cancelado.",
  erro: "Não foi possível concluir a autorização BTG.",
} as const;

export default function BTGConfig() {
  const utils = trpc.useUtils();
  const [condominioId, setCondominioId] = useState<number | null>(null);
  const [contaRecebedoraId, setContaRecebedoraId] = useState<string>("");
  const [confirmacaoHomologacao, setConfirmacaoHomologacao] = useState("");
  const [dialogHomologacaoOpen, setDialogHomologacaoOpen] = useState(false);
  const [formRegras, setFormRegras] = useState({ diasLimitePagamento: "60", instrucoes: "" });
  const [dialogContaManualOpen, setDialogContaManualOpen] = useState(false);
  const [confirmacaoContaManual, setConfirmacaoContaManual] = useState("");
  const [formContaManual, setFormContaManual] = useState(novaContaManual);
  const [dadosConferidos, setDadosConferidos] = useState(false);
  const [erroContaManual, setErroContaManual] = useState<string | null>(null);

  const { data: painel, isLoading, refetch } = trpc.btgV2.painel.useQuery();
  const { data: entregasWebhook } = trpc.btgV2.listarEntregasWebhook.useQuery();
  const { data: condominios } = trpc.condominios.list.useQuery();
  const { data: vinculoAtual, refetch: refetchVinculo } = trpc.btgV2.vinculoCondominio.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: Boolean(condominioId) },
  );

  useEffect(() => {
    if (!painel?.integracao) return;
    setFormRegras({
      diasLimitePagamento: String(painel.integracao.diasLimitePagamento ?? 60),
      instrucoes: painel.integracao.instrucoes ?? "",
    });
  }, [painel?.integracao]);

  useEffect(() => {
    if (!vinculoAtual?.conta) {
      setContaRecebedoraId("");
      return;
    }
    setContaRecebedoraId(String(vinculoAtual.conta.id));
  }, [vinculoAtual]);

  const conectarMutation = trpc.btg.iniciarAutorizacao.useMutation({
    onSuccess: (result) => window.location.assign(result.authorizationUrl),
    onError: (error) => toast.error(`Não foi possível iniciar a autorização: ${error.message}`),
  });
  const sincronizarContasMutation = trpc.btgV2.sincronizarContas.useMutation({
    onSuccess: ({ quantidade }) => {
      toast.success(`${quantidade} conta(s) recebedora(s) sincronizada(s).`);
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const salvarRegrasMutation = trpc.btgV2.salvarPoliticaHomologacao.useMutation({
    onSuccess: () => {
      toast.success(sandbox ? "Regras de homologação Sandbox salvas." : "Regras de emissão de Produção salvas.");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const vincularContaMutation = trpc.btgV2.vincularContaCondominio.useMutation({
    onSuccess: () => {
      toast.success("Conta recebedora vinculada ao condomínio.");
      void refetchVinculo();
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const cadastrarContaManualMutation = trpc.btgV2.cadastrarContaManualSandbox.useMutation({
    onSuccess: () => concluirCadastroManual("Conta manual cadastrada somente para a homologação Sandbox."),
    onError: (error) => mostrarErroCadastroManual(error.message),
  });
  const cadastrarContaManualProducaoMutation = trpc.btgV2.cadastrarContaManualProducao.useMutation({
    onSuccess: () => concluirCadastroManual("Conta manual registrada em Produção; cadastro não validado pela API BTG. A emissão não foi ativada por este cadastro."),
    onError: (error) => mostrarErroCadastroManual(error.message),
  });
  const habilitarSandboxMutation = trpc.btgV2.habilitarEmissaoSandbox.useMutation({
    onSuccess: () => {
      toast.success("Homologação BolePix Sandbox habilitada.");
      setDialogHomologacaoOpen(false);
      setConfirmacaoHomologacao("");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const desabilitarSandboxMutation = trpc.btgV2.desabilitarEmissaoSandbox.useMutation({
    onSuccess: () => {
      toast.success("Homologação BolePix Sandbox desabilitada.");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });
  const habilitarProducaoMutation = trpc.btgV2.habilitarEmissaoProducao.useMutation({
    onSuccess: () => {
      toast.success("Emissão BolePix em Produção habilitada.");
      setDialogHomologacaoOpen(false);
      setConfirmacaoHomologacao("");
      void refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const oauthResult = new URLSearchParams(window.location.search).get("btgOAuth");
  useEffect(() => {
    if (!oauthResult) return;
    const mensagem = mensagensOAuth[oauthResult as keyof typeof mensagensOAuth];
    if (!mensagem) return;
    oauthResult === "conectado" ? toast.success(mensagem) : toast.error(mensagem);
    window.history.replaceState({}, document.title, "/configuracoes/btg");
    void refetch();
  }, [oauthResult, refetch]);

  function limparCadastroManual() {
    setFormContaManual(novaContaManual());
    setConfirmacaoContaManual("");
    setDadosConferidos(false);
    setErroContaManual(null);
  }

  function concluirCadastroManual(mensagem: string) {
    setDialogContaManualOpen(false);
    limparCadastroManual();
    toast.success(mensagem);
    void utils.btgV2.painel.invalidate();
    // Invalida todos os vínculos consultados, inclusive de condomínios anteriores.
    void utils.btgV2.vinculoCondominio.invalidate();
  }

  function mostrarErroCadastroManual(mensagem: string) {
    setErroContaManual(mensagem);
    toast.error(mensagem);
  }

  const oauth = painel?.oauth;
  const sandbox = oauth?.ambiente === "sandbox";
  const producao = oauth?.ambiente === "producao";
  const conectado = oauth?.status === "conectado";
  const consultaContasHabilitada = oauth?.consultaContasHabilitada !== false;
  const cadastroManualPermitido = podeCadastrarContaManual({ ambiente: oauth?.ambiente, conectado, configuracaoCompleta: Boolean(oauth?.configuracaoCompleta) }) && (!producao || painel?.integracao?.ativo !== false);
  const cadastrandoContaManual = cadastrarContaManualMutation.isPending || cadastrarContaManualProducaoMutation.isPending;
  const estadoEmissao = rotulosEstadoBtg(oauth?.ambiente, Boolean(painel?.emissaoHabilitada));
  const contaDisponivel = Boolean(painel?.contas.some((conta) => conta.ativo));
  const checklist = useMemo(() => [
    { label: "Variáveis seguras do servidor", ok: Boolean(oauth?.configuracaoCompleta), detail: oauth?.configuracaoCompleta ? "Credenciais e criptografia configuradas" : "Client ID, secret, callback HTTPS ou chave de cifragem pendentes" },
    { label: "Consentimento OAuth", ok: conectado, detail: conectado ? "Conta BTG conectada" : "Conecte a conta do escritório" },
    { label: "Conta recebedora", ok: contaDisponivel, detail: contaDisponivel ? `${painel?.contas.length ?? 0} conta(s) configurada(s); vínculo obrigatório` : sandbox ? "Consulte ou cadastre a conta de homologação" : "Consulte ou cadastre a conta do escritório" },
    { label: "Emissão BolePix", ok: Boolean(painel?.emissaoHabilitada), detail: estadoEmissao.emissao },
  ], [contaDisponivel, conectado, oauth?.configuracaoCompleta, painel?.contas.length, painel?.emissaoHabilitada, sandbox, estadoEmissao.emissao]);

  useEffect(() => {
    // Uma confirmação digitada para um ambiente não pode migrar para outro.
    setDialogContaManualOpen(false);
    setDialogHomologacaoOpen(false);
    setConfirmacaoHomologacao("");
    limparCadastroManual();
  }, [oauth?.ambiente]);

  function enviarCadastroManual() {
    if (!oauth || !podeConfirmarContaManual({ form: formContaManual, ambiente: oauth.ambiente, confirmacao: confirmacaoContaManual, dadosConferidos, cadastroPermitido: cadastroManualPermitido, enviando: cadastrandoContaManual })) return;
    setErroContaManual(null);
    if (oauth.ambiente === "producao") {
      cadastrarContaManualProducaoMutation.mutate(dadosCadastroManualProducao(formContaManual));
    } else {
      // Contrato Sandbox preservado, com documento e titular opcionais.
      cadastrarContaManualMutation.mutate({ ...formContaManual, documentoBeneficiario: formContaManual.documentoBeneficiario || undefined, nomeBeneficiario: formContaManual.nomeBeneficiario || undefined, confirmacao: "CADASTRAR" });
    }
  }

  if (isLoading) {
    return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10"><Landmark className="h-7 w-7 text-blue-600" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">BTG — Integração e emissão</h1>
              <EstadoEmissaoBtg ambiente={oauth?.ambiente} emissaoHabilitada={Boolean(painel?.emissaoHabilitada)} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">Integração First-Party do escritório. Cada condomínio precisa de uma conta recebedora vinculada antes da emissão.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isLoading}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar estado
        </Button>
      </header>

      <AlertaProducaoBtg ambiente={oauth?.ambiente} emissaoHabilitada={Boolean(painel?.emissaoHabilitada)} />

      <Tabs defaultValue="visao-geral" className="space-y-5">
        <TabsList className="w-full justify-start overflow-x-auto h-auto flex-wrap">
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
          <TabsTrigger value="contas">Contas e condomínios</TabsTrigger>
          <TabsTrigger value="regras">Regras e saúde</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-5">
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            {checklist.map((item) => (
              <Card key={item.label} className={item.ok ? "border-emerald-200" : "border-amber-200"}>
                <CardContent className="p-4">
                  <div className="flex gap-2 items-start">
                    {item.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" /> : <CircleAlert className="h-5 w-5 text-amber-600 shrink-0" />}
                    <div><p className="font-medium text-sm">{item.label}</p><p className="text-xs text-muted-foreground mt-1">{item.detail}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Próximo passo seguro</CardTitle>
              <CardDescription>O fluxo é sequencial para evitar emissão para uma conta errada ou em ambiente incorreto.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p>{sandbox ? "1. Conecte o OAuth da conta do escritório. 2. Consulte ou cadastre a conta Sandbox. 3. Associe a conta a um condomínio de teste. 4. Habilite a homologação e emita um BolePix de teste." : "1. Conecte o OAuth de Produção com autorização Collections. 2. Consulte a conta ou cadastre manualmente os dados conferidos no banco. 3. Vincule explicitamente a conta ao condomínio. 4. Configure e homologue o webhook. 5. Solicite a liberação separada de Produção antes de um piloto controlado."}</p>
              <p>{sandbox ? "O Sandbox valida contrato e autenticação; não cria títulos reais no BTG." : "Conta manual não é validada pela API BTG e pode ser recusada pelo banco. Cadastrar ou vincular uma conta não ativa a emissão."}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conexao" className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> OAuth Authorization Code</CardTitle>
              <CardDescription>Client Secret, access token e refresh token ficam exclusivamente no servidor e não são exibidos nesta tela.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <StatusItem label="Configuração segura" ok={Boolean(oauth?.configuracaoCompleta)} detail={oauth?.configuracaoCompleta ? "Pronta" : "Pendente"} />
                <StatusItem label="Conta BTG" ok={conectado} detail={conectado ? "Conectada" : "Aguardando consentimento"} />
                <StatusItem label="CNPJ da integração" ok={Boolean(oauth?.companyIdMasked)} detail={oauth?.companyIdMasked ?? "Não disponível"} />
              </div>
              <ModoConsultaContasBtg habilitada={consultaContasHabilitada} />
              {oauth?.redirectUri && <Alert><Info className="h-4 w-4" /><AlertDescription className="text-xs break-all">URI de retorno cadastrada no BTG: <code>{oauth.redirectUri}</code></AlertDescription></Alert>}
              {!oauth?.configuracaoCompleta ? (
                <Alert variant="destructive"><XCircle className="h-4 w-4" /><AlertDescription>Configure as credenciais e a chave de cifragem no cofre seguro do ambiente antes de iniciar o consentimento.</AlertDescription></Alert>
              ) : (
                <Button onClick={() => conectarMutation.mutate()} disabled={conectarMutation.isPending}>
                  {conectarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {conectado ? "Reconectar conta BTG" : "Conectar conta BTG"}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contas" className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div><CardTitle className="text-base flex items-center gap-2"><WalletCards className="h-4 w-4" /> Contas recebedoras configuradas</CardTitle><CardDescription>A consulta oficial permanece preferencial quando Accounts estiver disponível. O cadastro manual é identificado pelo ambiente e não valida a conta no BTG.</CardDescription></div>
              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" title={!consultaContasHabilitada ? "Consulta desativada no servidor: requer habilitar Accounts e autorização apropriada no BTG." : undefined} onClick={() => sincronizarContasMutation.mutate()} disabled={!conectado || !consultaContasHabilitada || sincronizarContasMutation.isPending}>
                  {sincronizarContasMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Consultar contas
                </Button>
                <Button variant="secondary" onClick={() => { limparCadastroManual(); setDialogContaManualOpen(true); }} disabled={!cadastroManualPermitido || cadastrandoContaManual}>
                  <CirclePlus className="h-4 w-4 mr-2" />Cadastrar manualmente
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!consultaContasHabilitada && <ModoConsultaContasBtg habilitada={false} />}
              {sandbox && <Alert><Info className="h-4 w-4" /><AlertDescription className="text-xs">Use o cadastro manual Sandbox somente se o serviço Conta PJ não estiver habilitado pelo BTG. Confirme agência e conta em uma fonte confiável; contas Sandbox nunca são promovidas a Produção.</AlertDescription></Alert>}
              {producao && <Alert><Info className="h-4 w-4" /><AlertDescription className="text-xs">O cadastro manual de Produção exige dados do escritório conferidos na fonte bancária, declaração e confirmação administrativa. Não valida titularidade pela API nem libera emissão automaticamente. Collections e webhook continuam obrigatórios.</AlertDescription></Alert>}
              {!painel?.contas.length ? <p className="text-sm text-muted-foreground py-4">Nenhuma conta foi configurada ainda.</p> : (
                <div className="divide-y rounded-lg border">
                  {painel.contas.map((conta) => <div className="p-3 flex flex-wrap gap-3 items-center justify-between" key={conta.id}><div><p className="font-medium text-sm">{conta.rotulo || conta.nomeBeneficiario || "Conta BTG"}</p><p className="text-xs text-muted-foreground">Ag. {conta.agencia} · Conta {conta.numeroMascarado} · CNPJ {conta.documentoBeneficiarioMascarado || "—"}</p></div><div className="flex flex-wrap gap-2 items-center"><OrigemContaBtg origemCadastro={conta.origemCadastro} confirmadoPorId={conta.confirmadoPorId} confirmadoEm={conta.confirmadoEm} /><Badge variant={conta.ativo ? "secondary" : "destructive"}>{conta.ativo ? "Disponível" : "Inativa"}</Badge></div></div>)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Vínculo por condomínio</CardTitle><CardDescription>O BolePix só poderá ser emitido quando o condomínio tiver conta recebedora v2 vinculada.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <AdminCondominioSelector condominios={condominios} selectedId={condominioId} onSelect={setCondominioId} />
              {condominioId && <div className="flex flex-col md:flex-row gap-3 md:items-end rounded-lg border p-4 bg-muted/20">
                <div className="space-y-2 flex-1"><Label htmlFor="conta-recebedora">Conta recebedora</Label><select id="conta-recebedora" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={contaRecebedoraId} onChange={(event) => setContaRecebedoraId(event.target.value)}><option value="">Selecione uma conta</option>{painel?.contas.filter((conta) => conta.ativo && !(producao && conta.origemCadastro === "manual_sandbox") && !(sandbox && conta.origemCadastro === "manual_producao")).map((conta) => <option key={conta.id} value={String(conta.id)}>{conta.rotulo || conta.nomeBeneficiario || "Conta BTG"} — {rotuloOrigemConta(conta.origemCadastro)} — Ag. {conta.agencia}, {conta.numeroMascarado}</option>)}</select></div>
                <Button onClick={() => vincularContaMutation.mutate({ condominioId, contaRecebedoraId: Number(contaRecebedoraId) })} disabled={!contaRecebedoraId || vincularContaMutation.isPending}>{vincularContaMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar vínculo</Button>
              </div>}
              {condominioId && vinculoAtual && <p className="text-xs text-emerald-700">Conta atualmente vinculada: <strong>{vinculoAtual.conta.rotulo || vinculoAtual.conta.nomeBeneficiario || "Conta BTG"}</strong>.</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regras" className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> {sandbox ? "Regras de homologação BolePix" : "Regras de emissão BolePix — Produção"}</CardTitle><CardDescription>Essas regras pertencem à integração v2 e não alteram a configuração CNAB nem os boletos legados.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="limite">Dias-limite após o vencimento</Label><Input id="limite" type="number" min={1} max={365} value={formRegras.diasLimitePagamento} onChange={(event) => setFormRegras((old) => ({ ...old, diasLimitePagamento: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="instrucoes">Descrição/instruções padrão</Label><Textarea id="instrucoes" rows={3} maxLength={300} value={formRegras.instrucoes} onChange={(event) => setFormRegras((old) => ({ ...old, instrucoes: event.target.value }))} /></div></div>
              <Button variant="outline" onClick={() => salvarRegrasMutation.mutate({ diasLimitePagamento: Number(formRegras.diasLimitePagamento), instrucoes: formRegras.instrucoes || undefined })} disabled={salvarRegrasMutation.isPending}>{salvarRegrasMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salvar regras {sandbox ? "Sandbox" : "Produção"}</Button>
            </CardContent>
          </Card>

          <Card className={painel?.emissaoHabilitada ? "border-emerald-300" : "border-amber-300"}>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Controle de emissão</CardTitle><CardDescription>{sandbox ? "Liberação explícita para validar o fluxo BolePix no Sandbox." : "Liberação explícita de Produção, após OAuth/Collections, conta elegível (API ou manual de Produção confirmada) vinculada, webhook HMAC configurado e homologação operacional."}</CardDescription></CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{estadoEmissao.emissao}</p><p className="text-xs text-muted-foreground">Última consulta de contas: {formatarData(painel?.integracao?.ultimaConsultaContasEm)}</p></div>{painel?.emissaoHabilitada ? <Button variant="destructive" onClick={() => sandbox && desabilitarSandboxMutation.mutate()} disabled={!sandbox || desabilitarSandboxMutation.isPending}><Unplug className="h-4 w-4 mr-2" />{sandbox ? "Desabilitar" : "Bloqueio via configuração"}</Button> : <Button onClick={() => { setConfirmacaoHomologacao(""); setDialogHomologacaoOpen(true); }} disabled={!conectado || !oauth?.configuracaoCompleta || !painel?.prontoParaHomologacao}>{sandbox ? "Habilitar homologação" : "Liberar Produção"}</Button>}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Saúde do webhook v2</CardTitle><CardDescription>Últimas 20 entregas registradas por hash. O corpo do evento não é armazenado.</CardDescription></CardHeader>
            <CardContent>{!entregasWebhook?.length ? <p className="text-sm text-muted-foreground">Ainda não há entregas de webhook para este ambiente.</p> : <div className="divide-y rounded-lg border">{entregasWebhook.map((entrega) => <div key={entrega.id} className="p-3 flex flex-wrap gap-3 items-center justify-between"><div><p className="text-sm font-medium">{entrega.evento}</p><p className="text-xs text-muted-foreground">Collection: {entrega.collectionId || "—"} · recebida em {formatarData(entrega.recebidoEm)}</p>{entrega.erroCodigo && <p className="text-xs text-destructive mt-1">{entrega.erroCodigo}</p>}</div><Badge variant={entrega.statusProcessamento === "processado" ? "secondary" : entrega.statusProcessamento === "ignorado" || entrega.statusProcessamento === "falha" ? "destructive" : "outline"}>{entrega.statusProcessamento}</Badge></div>)}</div>}</CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={dialogContaManualOpen} onOpenChange={(open) => { if (cadastrandoContaManual) return; setDialogContaManualOpen(open); if (!open) limparCadastroManual(); }}>
        <AlertDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader><AlertDialogTitle>{sandbox ? "Cadastrar conta manual de homologação" : "Cadastrar conta manual em Produção"}</AlertDialogTitle><AlertDialogDescription>{sandbox ? "Use exclusivamente dados confirmados pelo BTG. Esta inclusão não consulta nem valida a conta na API e ficará identificada como manual, apenas no Sandbox." : "Cadastre somente a conta do escritório titular da integração, após conferir os dados na fonte bancária. A confirmação administrativa não é validação pela API BTG e não ativa a emissão."}</AlertDialogDescription></AlertDialogHeader>
          <ContaManualForm ambiente={sandbox ? "sandbox" : "producao"} form={formContaManual} onFormChange={setFormContaManual} confirmacao={confirmacaoContaManual} onConfirmacaoChange={setConfirmacaoContaManual} dadosConferidos={dadosConferidos} onDadosConferidosChange={setDadosConferidos} enviando={cadastrandoContaManual} erro={erroContaManual} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cadastrandoContaManual}>Cancelar</AlertDialogCancel>
            <ConfirmarContaManualButton form={formContaManual} ambiente={sandbox ? "sandbox" : "producao"} confirmacao={confirmacaoContaManual} dadosConferidos={dadosConferidos} cadastroPermitido={cadastroManualPermitido} enviando={cadastrandoContaManual} onConfirmar={enviarCadastroManual} />
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialogHomologacaoOpen} onOpenChange={setDialogHomologacaoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{sandbox ? "Habilitar emissão BolePix no Sandbox?" : "Liberar emissão BolePix em Produção?"}</AlertDialogTitle><AlertDialogDescription>{sandbox ? <>Essa ação libera somente respostas estáticas do ambiente Sandbox. Não há emissão de cobrança real. Digite <strong>HOMOLOGAR</strong> para confirmar.</> : <>Esta ação permite emissão real somente após o servidor validar OAuth/Collections, conta elegível vinculada e segredo de webhook. A conta manual deve estar confirmada para Produção; cadastro local não garante aceitação pelo banco. Conclua a homologação operacional antes de liberar. Digite <strong>LIBERAR PRODUCAO</strong> para confirmar.</>}</AlertDialogDescription></AlertDialogHeader>
          <Input value={confirmacaoHomologacao} onChange={(event) => setConfirmacaoHomologacao(event.target.value)} placeholder={sandbox ? "HOMOLOGAR" : "LIBERAR PRODUCAO"} />
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={!conectado || !oauth?.configuracaoCompleta || !painel?.prontoParaHomologacao || (sandbox ? confirmacaoHomologacao !== "HOMOLOGAR" || habilitarSandboxMutation.isPending : confirmacaoHomologacao !== "LIBERAR PRODUCAO" || habilitarProducaoMutation.isPending)} onClick={(event) => { event.preventDefault(); if (!conectado || !oauth?.configuracaoCompleta || !painel?.prontoParaHomologacao) return; if (sandbox) habilitarSandboxMutation.mutate({ confirmacao: "HOMOLOGAR" }); else if (producao) habilitarProducaoMutation.mutate({ confirmacao: "LIBERAR PRODUCAO" }); }}>{(habilitarSandboxMutation.isPending || habilitarProducaoMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{sandbox ? "Confirmar homologação" : "Confirmar liberação"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusItem({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return <div className="rounded-lg border p-3 flex gap-2 items-start">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-600 mt-0.5" />}<div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div></div>;
}
