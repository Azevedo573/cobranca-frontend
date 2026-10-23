import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, CheckCircle2, XCircle, Loader2, Webhook, Info, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const mensagensOAuth = {
  conectado: "Conta BTG conectada com sucesso.",
  negado: "O consentimento no BTG foi cancelado.",
  erro: "Não foi possível concluir a autorização BTG.",
} as const;

export default function BTGConfig() {
  const [formData, setFormData] = useState({
    diasVencimentoPadrao: "30",
    diasLimitePagamento: "60",
    instrucoes: "Pagável em qualquer banco até o vencimento. Após o vencimento, sujeito a multa e juros.",
    ativo: "1",
  });

  const { data: config, refetch } = trpc.btg.getConfig.useQuery();

  useEffect(() => {
    if (!config) return;
    setFormData({
      diasVencimentoPadrao: config.diasVencimentoPadrao?.toString() || "30",
      diasLimitePagamento: config.diasLimitePagamento?.toString() || "60",
      instrucoes: config.instrucoes || "Pagável em qualquer banco até o vencimento. Após o vencimento, sujeito a multa e juros.",
      ativo: config.ativo ? "1" : "0",
    });
  }, [config]);

  const saveMutation = trpc.btg.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração de emissão BTG salva com sucesso.");
      refetch();
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  const conectarMutation = trpc.btg.iniciarAutorizacao.useMutation({
    onSuccess: (result) => {
      window.location.assign(result.authorizationUrl);
    },
    onError: (err) => toast.error("Não foi possível iniciar a autorização: " + err.message),
  });

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    saveMutation.mutate({
      diasVencimentoPadrao: parseInt(formData.diasVencimentoPadrao) || 30,
      diasLimitePagamento: parseInt(formData.diasLimitePagamento) || 60,
      instrucoes: formData.instrucoes || undefined,
      ativo: parseInt(formData.ativo) || 1,
    });
  };

  const oauthResult = new URLSearchParams(window.location.search).get("btgOAuth");

  useEffect(() => {
    if (!oauthResult) return;
    const message = mensagensOAuth[oauthResult as keyof typeof mensagensOAuth];
    if (!message) return;

    oauthResult === "conectado" ? toast.success(message) : toast.error(message);
    window.history.replaceState({}, document.title, "/configuracoes/btg");
    refetch();
  }, [oauthResult, refetch]);

  const oauth = config?.oauth;
  const conectado = oauth?.status === "conectado";
  const statusLabel = {
    nao_configurado: "Variáveis de servidor pendentes",
    nao_conectado: "Aguardando consentimento",
    conectado: "Conta BTG conectada",
    requer_reconexao: "Reconexão necessária",
  }[oauth?.status || "nao_configurado"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Building2 className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integração BTG Pactual</h1>
          <p className="text-muted-foreground text-sm">
            Consentimento seguro para a conta BTG do escritório e emissão futura de boletos híbridos.
          </p>
        </div>
        {config && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {config.isSandbox && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950">
                SANDBOX
              </Badge>
            )}
            <Badge variant={conectado ? "default" : "destructive"}>
              {conectado ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> {statusLabel}</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> {statusLabel}</>
              )}
            </Badge>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Conexão OAuth com o BTG
          </CardTitle>
          <CardDescription>
            O Client Secret, access token e refresh token permanecem somente no servidor. A tela não exibe nem armazena esses valores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatusItem label="BTG_CLIENT_ID" configured={Boolean(config?.clientIdConfigured)} />
            <StatusItem label="BTG_CLIENT_SECRET" configured={Boolean(config?.clientSecretConfigured)} />
            <StatusItem label="BTG_REDIRECT_URI" configured={Boolean(oauth?.redirectUri)} />
            <StatusItem label="Proteção de tokens" configured={Boolean(oauth?.configuracaoCompleta)} />
          </div>

          {!oauth?.configuracaoCompleta && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Configure no servidor <strong>BTG_CLIENT_ID</strong>, <strong>BTG_CLIENT_SECRET</strong>,{" "}
                <strong>BTG_REDIRECT_URI</strong> e <strong>BTG_TOKEN_ENCRYPTION_KEY</strong>. Em produção, informe também{" "}
                <strong>BTG_COMPANY_ID</strong>.
              </AlertDescription>
            </Alert>
          )}

          {oauth?.redirectUri && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs break-all">
                URI de retorno cadastrada no aplicativo BTG: <code className="font-mono">{oauth.redirectUri}</code>
              </AlertDescription>
            </Alert>
          )}

          {oauth?.configuracaoCompleta && (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => conectarMutation.mutate()}
                disabled={conectarMutation.isPending}
              >
                {conectarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {conectado ? "Reconectar conta BTG" : "Conectar conta BTG"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Você será direcionado ao BTG para consentir o acesso da conta do escritório. Nenhum token é exibido no Luminus.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurações de emissão</CardTitle>
            <CardDescription>Parâmetros padrão previstos para a emissão de boletos pelos condomínios atendidos pelo escritório.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="diasVencimento">Dias até o vencimento</Label>
                <Input
                  id="diasVencimento"
                  type="number"
                  min={1}
                  max={365}
                  value={formData.diasVencimentoPadrao}
                  onChange={(event) => setFormData((current) => ({ ...current, diasVencimentoPadrao: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Usado quando a cobrança não tiver vencimento definido.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diasLimite">Dias limite após o vencimento</Label>
                <Input
                  id="diasLimite"
                  type="number"
                  min={1}
                  max={365}
                  value={formData.diasLimitePagamento}
                  onChange={(event) => setFormData((current) => ({ ...current, diasLimitePagamento: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Após este prazo, a cobrança deve expirar conforme a regra homologada no BTG.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instrucoes">Instruções do boleto</Label>
              <Textarea
                id="instrucoes"
                value={formData.instrucoes}
                onChange={(event) => setFormData((current) => ({ ...current, instrucoes: event.target.value }))}
                placeholder="Texto que aparecerá no boleto..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhooks de pagamento</CardTitle>
            <CardDescription>
              A ativação de eventos será feita após a homologação do callback de cobrança. O segredo, quando configurado, nunca é exibido novamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Estado do segredo de webhook: <strong>{config?.webhookSecretConfigured ? "configurado" : "não configurado"}</strong>.
                A URL e os eventos serão liberados após a validação obrigatória do webhook com o BTG.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar configuração de emissão
        </Button>
      </form>
    </div>
  );
}

function StatusItem({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
      {configured ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{configured ? "Configurado" : "Não configurado"}</p>
      </div>
    </div>
  );
}
