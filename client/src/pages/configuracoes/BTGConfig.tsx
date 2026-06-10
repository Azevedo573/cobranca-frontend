import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Building2, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Webhook, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function BTGConfig() {
  const { user } = useAuth();
  const [showSecret, setShowSecret] = useState(false);
  const [formData, setFormData] = useState({
    condominioId: "",
    clientId: "",
    clientSecret: "",
    companyId: "",
    webhookSecret: "",
    diasVencimentoPadrao: "30",
    diasLimitePagamento: "60",
    instrucoes: "Pagável em qualquer banco até o vencimento. Após o vencimento, sujeito a multa e juros.",
    ativo: "1",
  });

  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });

  const condId = formData.condominioId
    ? parseInt(formData.condominioId)
    : user?.condominioId ?? undefined;

  const { data: config, refetch } = trpc.btg.getConfig.useQuery(
    { condominioId: condId },
    { enabled: !!condId }
  );

  useEffect(() => {
    if (!formData.condominioId && user?.condominioId) {
      setFormData(prev => ({ ...prev, condominioId: user.condominioId!.toString() }));
    }
  }, [user]);

  useEffect(() => {
    if (config) {
      setFormData(prev => ({
        ...prev,
        clientId: config.clientId || "",
        clientSecret: "", // nunca preencher com o valor mascarado
        companyId: config.companyId || "",
        webhookSecret: config.webhookSecret || "",
        diasVencimentoPadrao: config.diasVencimentoPadrao?.toString() || "30",
        diasLimitePagamento: config.diasLimitePagamento?.toString() || "60",
        instrucoes: config.instrucoes || "",
        ativo: config.ativo?.toString() || "1",
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
    if (!condId) {
      toast.error("Selecione um condomínio");
      return;
    }
    saveMutation.mutate({
      condominioId: condId,
      clientId: formData.clientId,
      clientSecret: formData.clientSecret || undefined,
      companyId: formData.companyId,
      webhookSecret: formData.webhookSecret || undefined,
      diasVencimentoPadrao: parseInt(formData.diasVencimentoPadrao) || 30,
      diasLimitePagamento: parseInt(formData.diasLimitePagamento) || 60,
      instrucoes: formData.instrucoes || undefined,
      ativo: parseInt(formData.ativo) || 1,
    });
  };

  const handleTestar = () => {
    if (!condId) {
      toast.error("Selecione um condomínio");
      return;
    }
    testarMutation.mutate({ condominioId: condId });
  };

  const webhookUrl = condId
    ? `${window.location.origin}/api/webhook/btg/${condId}`
    : "Configure o condomínio primeiro";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Building2 className="h-6 w-6 text-blue-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integração BTG Pactual</h1>
          <p className="text-muted-foreground text-sm">Configure as credenciais da API BTG Empresas para emissão de boletos híbridos</p>
        </div>
        {config && (
          <Badge variant={config.tokenAtivo ? "default" : "secondary"} className="ml-auto">
            {config.tokenAtivo ? (
              <><CheckCircle2 className="h-3 w-3 mr-1" /> Conectado</>
            ) : (
              <><XCircle className="h-3 w-3 mr-1" /> Desconectado</>
            )}
          </Badge>
        )}
      </div>

      {user?.role === "admin" && condominios && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Condomínio</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
              value={formData.condominioId}
              onChange={(e) => setFormData(prev => ({ ...prev, condominioId: e.target.value }))}
            >
              <option value="">Selecione o condomínio</option>
              {condominios.map(c => (
                <option key={c.id} value={c.id.toString()}>{c.name}</option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Credenciais OAuth */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credenciais OAuth2 (BTG Id)</CardTitle>
            <CardDescription>
              Obtenha as credenciais no portal BTG Empresas → Configurações → Integrações API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID *</Label>
                <Input
                  id="clientId"
                  value={formData.clientId}
                  onChange={e => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyId">Company ID (CNPJ sem pontuação) *</Label>
                <Input
                  id="companyId"
                  value={formData.companyId}
                  onChange={e => setFormData(prev => ({ ...prev, companyId: e.target.value.replace(/\D/g, "") }))}
                  placeholder="00000000000000"
                  maxLength={14}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientSecret">
                Client Secret {config?.hasClientSecret ? "(deixe em branco para manter o atual)" : "*"}
              </Label>
              <div className="relative">
                <Input
                  id="clientSecret"
                  type={showSecret ? "text" : "password"}
                  value={formData.clientSecret}
                  onChange={e => setFormData(prev => ({ ...prev, clientSecret: e.target.value }))}
                  placeholder={config?.hasClientSecret ? "••••••••••••••••" : "Cole o Client Secret aqui"}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {config?.hasClientSecret && (
                <p className="text-xs text-muted-foreground">
                  Secret atual: {config.clientSecretMasked}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Webhook Secret (opcional)</Label>
              <Input
                id="webhookSecret"
                type="password"
                value={formData.webhookSecret}
                onChange={e => setFormData(prev => ({ ...prev, webhookSecret: e.target.value }))}
                placeholder="Secret para validar assinatura HMAC dos webhooks"
              />
            </div>
          </CardContent>
        </Card>

        {/* Configurações de Emissão */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configurações de Emissão</CardTitle>
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
                <p className="text-xs text-muted-foreground">Usado quando a cobrança não tem data de vencimento definida</p>
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
                <p className="text-xs text-muted-foreground">Após este prazo o boleto expira automaticamente</p>
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
            </div>
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              URL do Webhook BTG
            </CardTitle>
            <CardDescription>
              Configure esta URL no portal BTG Empresas para receber notificações automáticas de pagamento
            </CardDescription>
          </CardHeader>
          <CardContent>
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
            <Alert className="mt-3">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                No portal BTG Empresas, vá em <strong>Configurações → Webhooks</strong> e cadastre esta URL para os eventos:
                <strong> collections.paid</strong>, <strong>collections.expired</strong>, <strong>collections.cancelled</strong>.
                O sistema dará baixa automática nas cobranças ao receber o evento <strong>collections.paid</strong>.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Configuração
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleTestar}
            disabled={testarMutation.isPending || !config}
          >
            {testarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Testar Conexão
          </Button>
        </div>
      </form>
    </div>
  );
}
