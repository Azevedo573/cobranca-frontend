import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Mail, CheckCircle2, XCircle, Loader2, Eye, EyeOff, Info } from "lucide-react";

export default function EmailConfig() {
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [emailRemetente, setEmailRemetente] = useState("");
  const [nomeRemetente, setNomeRemetente] = useState("Sistema de Cobranças");
  const [mostrarSecret, setMostrarSecret] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  const { data: config, isLoading, refetch } = trpc.emailConfig.get.useQuery();

  useEffect(() => {
    if (config) {
      setTenantId(config.tenantId);
      setClientId(config.clientId);
      setEmailRemetente(config.emailRemetente);
      setNomeRemetente(config.nomeRemetente);
    }
  }, [config]);

  const saveMutation = trpc.emailConfig.save.useMutation();
  const testarMutation = trpc.emailConfig.testar.useMutation();

  const handleSalvar = async () => {
    if (!tenantId || !clientId || !clientSecret || !emailRemetente) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSalvando(true);
    try {
      await saveMutation.mutateAsync({ tenantId, clientId, clientSecret, emailRemetente, nomeRemetente });
      toast.success("Configuração salva com sucesso!");
      setClientSecret("");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleTestar = async () => {
    setTestando(true);
    try {
      const result = await testarMutation.mutateAsync();
      if (result.sucesso) {
        toast.success("Conexão com Microsoft 365 estabelecida com sucesso!");
      } else {
        toast.error("Falha na conexão: " + result.erro);
      }
    } catch (err: any) {
      toast.error("Erro ao testar: " + err.message);
    } finally {
      setTestando(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status atual */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Microsoft 365 — Envio de E-mails</CardTitle>
            </div>
            {config ? (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="h-3 w-3" /> Configurado
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <XCircle className="h-3 w-3" /> Não configurado
              </Badge>
            )}
          </div>
          <CardDescription>
            Configure as credenciais do Azure AD para enviar e-mails diretamente pelo sistema usando a conta Microsoft 365 do escritório.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Instruções */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-medium">Como obter as credenciais no Azure AD:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Acesse <strong>portal.azure.com</strong> → Azure Active Directory → Registros de aplicativo</li>
                <li>Selecione o aplicativo registrado e copie o <strong>ID do diretório (tenant)</strong> e o <strong>ID do aplicativo (client)</strong></li>
                <li>Em <strong>Certificados e segredos</strong>, crie ou copie o segredo do cliente</li>
                <li>Confirme que a permissão <strong>Mail.Send</strong> (Application) está concedida pelo administrador</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formulário */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Credenciais Azure AD</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tenantId">ID do Diretório (Tenant ID) <span className="text-destructive">*</span></Label>
              <Input
                id="tenantId"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clientId">ID do Aplicativo (Client ID) <span className="text-destructive">*</span></Label>
              <Input
                id="clientId"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clientSecret">
                Segredo do Cliente (Client Secret) <span className="text-destructive">*</span>
              </Label>
              {config && !clientSecret ? (
                <div className="flex gap-2">
                  <Input
                    value={config.clientSecretMasked}
                    readOnly
                    className="font-mono text-sm bg-muted"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setClientSecret(" ")}
                  >
                    Alterar
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    id="clientSecret"
                    type={mostrarSecret ? "text" : "password"}
                    placeholder="Cole o segredo do cliente aqui"
                    value={clientSecret.trim()}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setMostrarSecret(!mostrarSecret)}
                  >
                    {mostrarSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Configurações do Remetente
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emailRemetente">E-mail Remetente <span className="text-destructive">*</span></Label>
              <Input
                id="emailRemetente"
                type="email"
                placeholder="cobranca@escritorio.com.br"
                value={emailRemetente}
                onChange={(e) => setEmailRemetente(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Deve ser uma caixa de correio válida no Microsoft 365</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nomeRemetente">Nome do Remetente</Label>
              <Input
                id="nomeRemetente"
                placeholder="Sistema de Cobranças"
                value={nomeRemetente}
                onChange={(e) => setNomeRemetente(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSalvar} disabled={salvando} className="gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {salvando ? "Salvando..." : "Salvar Configuração"}
            </Button>
            {config && (
              <Button variant="outline" onClick={handleTestar} disabled={testando} className="gap-1.5">
                {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {testando ? "Testando..." : "Testar Conexão"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
