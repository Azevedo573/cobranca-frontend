import { useState, useEffect } from "react";
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

export default function BTGConfig() {
  const [formData, setFormData] = useState({
    webhookSecret: "",
    diasVencimentoPadrao: "30",
    diasLimitePagamento: "60",
    instrucoes: "Pagável em qualquer banco até o vencimento. Após o vencimento, sujeito a multa e juros.",
    ativo: "1",
  });

  const { data: config, refetch } = trpc.btg.getConfig.useQuery();

  useEffect(() => {
    if (config) {
      setFormData(prev => ({
        ...prev,
        webhookSecret: config.webhookSecret || "",
        diasVencimentoPadrao: config.diasVencimentoPadrao?.toString() || "30",
        diasLimitePagamento: config.diasLimitePagamento?.toString() || "60",
        instrucoes: config.instrucoes || "Pagável em qualquer banco até o vencimento. Após o vencimento, sujeito a multa e juros.",
        ativo: config.ativo ? "1" : "0",
      }));
    }
  }, [config]);

  const saveMutation = trpc.btg.saveConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuração BTG salva com sucesso!");
      refetch();
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  const testarMutation = trpc.btg.testarConexao.useMutation({
    onSuccess: (res) => {
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      webhookSecret: formData.webhookSecret || undefined,
      diasVencimentoPadrao: parseInt(formData.diasVencimentoPadrao) || 30,
      diasLimitePagamento: parseInt(formData.diasLimitePagamento) || 60,
      instrucoes: formData.instrucoes || undefined,
      ativo: parseInt(formData.ativo) || 1,
    });
  };

  const webhookUrl = `${window.location.origin}/api/webhook/btg`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Building2 className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integração BTG Pactual</h1>
          <p className="text-muted-foreground text-sm">
            Configurações da API BTG Empresas para emissão de boletos híbridos (Boleto + PIX)
          </p>
        </div>
        {config && (
          <div className="ml-auto flex items-center gap-2">
            {config.isSandbox && (
              <Badge variant="outline" className="border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950">
                🧪 SANDBOX
              </Badge>
            )}
            <Badge
              variant={config.credenciaisConfiguradas ? "default" : "destructive"}
            >
              {config.credenciaisConfiguradas ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Credenciais OK</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Credenciais não configuradas</>
              )}
            </Badge>
          </div>
        )}
      </div>

      {/* Status das credenciais (env vars) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Credenciais BTG (Variáveis de Ambiente)
          </CardTitle>
          <CardDescription>
            As credenciais BTG são configuradas como variáveis de ambiente seguras do servidor,
            não ficam expostas no banco de dados. Para alterá-las, use o painel de Secrets do projeto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              {config?.clientIdConfigured ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">BTG_CLIENT_ID</p>
                <p className="text-xs text-muted-foreground">
                  {config?.clientIdConfigured ? "Configurado" : "Não configurado"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              {config?.clientSecretConfigured ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">BTG_CLIENT_SECRET</p>
                <p className="text-xs text-muted-foreground">
                  {config?.clientSecretConfigured ? "Configurado" : "Não configurado"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
              {config?.companyIdConfigured ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
              )}
              <div>
                <p className="text-sm font-medium">BTG_COMPANY_ID</p>
                <p className="text-xs text-muted-foreground">
                  {config?.companyIdConfigured
                    ? `Configurado (${config.companyIdMasked})`
                    : "Não configurado"}
                </p>
              </div>
            </div>
          </div>

          {!config?.credenciaisConfiguradas && (
            <Alert variant="destructive" className="mt-4">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                As credenciais BTG não estão configuradas. Acesse o painel de <strong>Secrets</strong> do
                projeto e defina <strong>BTG_CLIENT_ID</strong>, <strong>BTG_CLIENT_SECRET</strong> e{" "}
                <strong>BTG_COMPANY_ID</strong>.
              </AlertDescription>
            </Alert>
          )}

          {config?.isSandbox && (
            <Alert className="mt-4 border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
              <Info className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                <strong>Modo Sandbox ativo.</strong> As cobranças não são efetivamente criadas.
                O Company ID usado automaticamente é <code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900 px-1 rounded">30306294000145</code> (empresa dedicada do sandbox BTG).
                Para usar em produção, remova a variável <code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900 px-1 rounded">BTG_SANDBOX</code> ou defina como <code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900 px-1 rounded">false</code>.
              </AlertDescription>
            </Alert>
          )}

          {config?.credenciaisConfiguradas && (
            <div className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => testarMutation.mutate()}
                disabled={testarMutation.isPending}
              >
                {testarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Testar Conexão com BTG
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Configurações de Emissão */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurações de Emissão</CardTitle>
            <CardDescription>
              Parâmetros padrão usados na emissão de boletos para todos os condomínios
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="diasVencimento">Dias até o Vencimento (padrão)</Label>
                <Input
                  id="diasVencimento"
                  type="number"
                  min={1}
                  max={365}
                  value={formData.diasVencimentoPadrao}
                  onChange={e => setFormData(prev => ({ ...prev, diasVencimentoPadrao: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Usado quando a cobrança não tem data de vencimento definida
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diasLimite">Dias Limite para Pagamento Após Vencimento</Label>
                <Input
                  id="diasLimite"
                  type="number"
                  min={1}
                  max={365}
                  value={formData.diasLimitePagamento}
                  onChange={e => setFormData(prev => ({ ...prev, diasLimitePagamento: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Após este prazo o boleto expira automaticamente
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instrucoes">Instruções do Boleto</Label>
              <Textarea
                id="instrucoes"
                value={formData.instrucoes}
                onChange={e => setFormData(prev => ({ ...prev, instrucoes: e.target.value }))}
                placeholder="Texto que aparece no boleto..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Este texto aparece no campo de instruções do boleto emitido
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhook de Pagamento Automático
            </CardTitle>
            <CardDescription>
              Configure esta URL no portal BTG Empresas para receber notificações automáticas de pagamento.
              O sistema dará baixa automática nas cobranças ao receber o evento <strong>collections.paid</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono break-all">
                {webhookUrl}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("URL copiada!");
                }}
              >
                Copiar
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Webhook Secret (opcional)</Label>
              <Input
                id="webhookSecret"
                type="password"
                value={formData.webhookSecret}
                onChange={e => setFormData(prev => ({ ...prev, webhookSecret: e.target.value }))}
                placeholder="Secret para validar assinatura HMAC dos webhooks BTG"
              />
              <p className="text-xs text-muted-foreground">
                Se configurado, o sistema valida a assinatura HMAC-SHA256 de cada webhook recebido
              </p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                No portal BTG Empresas, acesse <strong>Configurações → Webhooks</strong> e cadastre
                a URL acima para os eventos: <strong>collections.paid</strong>,{" "}
                <strong>collections.expired</strong> e <strong>collections.cancelled</strong>.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configuração
          </Button>
        </div>
      </form>
    </div>
  );
}
