import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  TestTube2,
  Save,
  Info,
  Building2,
  KeyRound,
  Globe,
} from "lucide-react";

export default function ConfiguracoesMNI() {
  const [form, setForm] = useState({
    tribunal: "TJRJ",
    idConsultante: "",
    senhaConsultante: "",
    ambiente: "homologacao" as "homologacao" | "producao",
    urlWsdl: "",
  });
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState<{ ok: boolean; mensagem: string } | null>(null);

  const { data: credenciais, refetch } = trpc.mni.listarCredenciais.useQuery();

  const salvarMutation = trpc.mni.salvarCredencial.useMutation({
    onSuccess: () => {
      toast.success("Credenciais salvas com sucesso!");
      refetch();
      setForm({ tribunal: "TJRJ", idConsultante: "", senhaConsultante: "", ambiente: "homologacao", urlWsdl: "" });
      setResultadoTeste(null);
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const deletarMutation = trpc.mni.deletarCredencial.useMutation({
    onSuccess: () => {
      toast.success("Credencial removida");
      refetch();
    },
    onError: (err) => toast.error(`Erro ao remover: ${err.message}`),
  });

  const testarMutation = trpc.mni.testarConexao.useMutation({
    onSuccess: (resultado) => {
      setResultadoTeste(resultado);
      if (resultado.ok) {
        toast.success("Conexão estabelecida com sucesso!");
      } else {
        toast.error(resultado.mensagem);
      }
    },
    onError: (err) => {
      setResultadoTeste({ ok: false, mensagem: err.message });
      toast.error(`Erro no teste: ${err.message}`);
    },
    onSettled: () => setTestando(false),
  });

  const handleTestar = () => {
    if (!form.idConsultante || !form.senhaConsultante) {
      toast.error("Preencha o ID do consultante e a senha antes de testar");
      return;
    }
    setTestando(true);
    setResultadoTeste(null);
    testarMutation.mutate({
      idConsultante: form.idConsultante,
      senhaConsultante: form.senhaConsultante,
      ambiente: form.ambiente,
      urlWsdl: form.urlWsdl || undefined,
    });
  };

  const handleSalvar = () => {
    if (!form.idConsultante || !form.senhaConsultante) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    salvarMutation.mutate({
      tribunal: form.tribunal,
      idConsultante: form.idConsultante,
      senhaConsultante: form.senhaConsultante,
      ambiente: form.ambiente,
      urlWsdl: form.urlWsdl || undefined,
    });
  };

  const credencialAtiva = credenciais?.find((c) => c.ativo);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-blue-600" />
          Configurações MNI — TJRJ
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure as credenciais de acesso ao Modelo Nacional de Interoperabilidade do Tribunal de Justiça do Rio de Janeiro.
        </p>
      </div>

      {/* Alerta informativo */}
      <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
        <Info className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 dark:text-blue-300">
          <strong>Como obter as credenciais:</strong> Envie um e-mail para{" "}
          <a href="mailto:mni@tjrj.jus.br" className="underline font-medium">mni@tjrj.jus.br</a>{" "}
          com o nome do escritório, CNPJ, nome e CPF do responsável. O TJRJ retornará um{" "}
          <strong>idConsultante</strong> e uma <strong>senhaConsultante</strong> para acesso ao ambiente de homologação.
          Para produção, envie ofício para{" "}
          <a href="mailto:dgtec@tjrj.jus.br" className="underline font-medium">dgtec@tjrj.jus.br</a>.
        </AlertDescription>
      </Alert>

      {/* Credencial ativa */}
      {credencialAtiva && (
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 text-green-800 dark:text-green-300">
                <CheckCircle2 className="h-5 w-5" />
                Credencial Ativa
              </CardTitle>
              <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">
                {credencialAtiva.ambiente === "producao" ? "Produção" : "Homologação"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-muted-foreground">Tribunal</span>
                <p className="font-medium">{credencialAtiva.tribunal}</p>
              </div>
              <div>
                <span className="text-muted-foreground">ID do Consultante</span>
                <p className="font-medium font-mono">{credencialAtiva.idConsultante}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Último teste</span>
                <p className="font-medium">
                  {credencialAtiva.ultimoTesteEm
                    ? new Date(credencialAtiva.ultimoTesteEm).toLocaleString("pt-BR")
                    : "Nunca testado"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Status do teste</span>
                <p className="font-medium">
                  {credencialAtiva.ultimoTesteStatus === "ok" ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Conexão OK
                    </span>
                  ) : credencialAtiva.ultimoTesteStatus === "erro" ? (
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Erro na conexão
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </p>
              </div>
            </div>
            <Separator />
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remover credencial
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover credencial MNI?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Isso desativará a integração com o TJRJ. A sincronização de processos e a Central de Intimações
                      deixarão de funcionar até que novas credenciais sejam cadastradas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => deletarMutation.mutate({ id: credencialAtiva.id })}
                    >
                      Remover
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulário de cadastro */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {credencialAtiva ? "Atualizar Credenciais" : "Cadastrar Credenciais"}
          </CardTitle>
          <CardDescription>
            {credencialAtiva
              ? "Cadastre novas credenciais para substituir as atuais."
              : "Informe as credenciais fornecidas pelo TJRJ para ativar a integração MNI."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Tribunal */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                Tribunal
              </Label>
              <Select
                value={form.tribunal}
                onValueChange={(v) => setForm((f) => ({ ...f, tribunal: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TJRJ">TJRJ — Rio de Janeiro</SelectItem>
                  <SelectItem value="TJSP">TJSP — São Paulo</SelectItem>
                  <SelectItem value="TJMG">TJMG — Minas Gerais</SelectItem>
                  <SelectItem value="TJRS">TJRS — Rio Grande do Sul</SelectItem>
                  <SelectItem value="TJPR">TJPR — Paraná</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Ambiente
              </Label>
              <Select
                value={form.ambiente}
                onValueChange={(v) => setForm((f) => ({ ...f, ambiente: v as "homologacao" | "producao" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação (testes)</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ID do Consultante */}
          <div className="space-y-2">
            <Label htmlFor="idConsultante" className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              ID do Consultante <span className="text-red-500">*</span>
            </Label>
            <Input
              id="idConsultante"
              placeholder="Ex: escritorio.gomessilva"
              value={form.idConsultante}
              onChange={(e) => setForm((f) => ({ ...f, idConsultante: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Identificador fornecido pelo TJRJ no e-mail de credenciais.
            </p>
          </div>

          {/* Senha */}
          <div className="space-y-2">
            <Label htmlFor="senha" className="flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
              Senha do Consultante <span className="text-red-500">*</span>
            </Label>
            <Input
              id="senha"
              type="password"
              placeholder="Senha fornecida pelo TJRJ"
              value={form.senhaConsultante}
              onChange={(e) => setForm((f) => ({ ...f, senhaConsultante: e.target.value }))}
            />
          </div>

          {/* URL WSDL (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="urlWsdl" className="text-muted-foreground text-sm">
              URL WSDL personalizada (opcional)
            </Label>
            <Input
              id="urlWsdl"
              placeholder="https://www12.tjrj.jus.br/MNI/Servico.svc?wsdl"
              value={form.urlWsdl}
              onChange={(e) => setForm((f) => ({ ...f, urlWsdl: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para usar a URL padrão do ambiente selecionado.
            </p>
          </div>

          {/* Resultado do teste */}
          {resultadoTeste && (
            <Alert
              className={
                resultadoTeste.ok
                  ? "border-green-200 bg-green-50 dark:bg-green-950/30"
                  : "border-red-200 bg-red-50 dark:bg-red-950/30"
              }
            >
              {resultadoTeste.ok ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription
                className={resultadoTeste.ok ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}
              >
                {resultadoTeste.mensagem}
              </AlertDescription>
            </Alert>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleTestar}
              disabled={testando || !form.idConsultante || !form.senhaConsultante}
            >
              {testando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <TestTube2 className="h-4 w-4 mr-2" />
              )}
              Testar Conexão
            </Button>

            <Button
              onClick={handleSalvar}
              disabled={salvarMutation.isPending || !form.idConsultante || !form.senhaConsultante}
            >
              {salvarMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar Credenciais
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Informações técnicas */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-muted-foreground">Informações Técnicas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <span>Protocolo:</span>
            <span className="font-mono">SOAP 1.1 / 1.2</span>
            <span>Padrão:</span>
            <span>MNI — Modelo Nacional de Interoperabilidade (CNJ)</span>
            <span>URL Homologação:</span>
            <span className="font-mono text-xs break-all">https://www12.tjrj.jus.br/MNI/Servico.svc</span>
            <span>Operações:</span>
            <span>consultarProcesso, consultarAvisosPendentes, consultarTeorComunicacao, consultarAlteracao</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
