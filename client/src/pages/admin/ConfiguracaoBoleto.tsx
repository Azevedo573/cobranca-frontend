import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAdminCondominio } from "@/hooks/useAdminCondominio";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Building2, CreditCard, FileText, Settings2, Save, AlertCircle, CheckCircle2, Info,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FormState {
  // Portador
  banco: string;
  nomeBanco: string;
  agencia: string;
  digitoAgencia: string;
  conta: string;
  digitoConta: string;
  convenio: string;
  ativo: boolean;
  contaRepasse: boolean;
  // Configuração de remessa
  usarMinimoDias: boolean;
  minimosDiasAntesVencimento: number;
  enviarParcelasApenasPrimeiraPaga: boolean;
  enviarParcelasApenasAnteriorPaga: boolean;
  // Dados do boleto
  carteira: string;
  especieDocumento: string;
  aceite: string;
  nomeBeneficiario: string;
  cnpjBeneficiario: string;
  enderecoBeneficiario: string;
  localPagamento: string;
  instrucoesCaixa: string;
  taxaJurosDia: string;
  taxaMulta: string;
  // Arquivo CNAB
  padraoNomeArquivo: string;
  layoutArquivo: string;
  enviarInstrucoesProtesto: boolean;
  // Forma de pagamento
  habilitarBoleto: boolean;
  habilitarPix: boolean;
  chavePix: string;
  tipoChavePix: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
  taxaCobrancaValor: string;
  taxaCobrancaPercentual: string;
  despesaValor: string;
  despesaPercentual: string;
}

const DEFAULT_FORM: FormState = {
  banco: "208",
  nomeBanco: "BTG PACTUAL",
  agencia: "0050",
  digitoAgencia: "0",
  conta: "432260",
  digitoConta: "0",
  convenio: "",
  ativo: true,
  contaRepasse: false,
  usarMinimoDias: false,
  minimosDiasAntesVencimento: 0,
  enviarParcelasApenasPrimeiraPaga: false,
  enviarParcelasApenasAnteriorPaga: true,
  carteira: "1",
  especieDocumento: "DD",
  aceite: "N",
  nomeBeneficiario: "",
  cnpjBeneficiario: "",
  enderecoBeneficiario: "",
  localPagamento: "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO",
  instrucoesCaixa: "APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#",
  taxaJurosDia: "0.03330",
  taxaMulta: "2.00",
  padraoNomeArquivo: "BTG_ddmmyyyy.txt",
  layoutArquivo: "CNAB240",
  enviarInstrucoesProtesto: false,
  habilitarBoleto: true,
  habilitarPix: true,
  chavePix: "",
  tipoChavePix: "CNPJ",
  taxaCobrancaValor: "3.50",
  taxaCobrancaPercentual: "0.00",
  despesaValor: "0.00",
  despesaPercentual: "0.00",
};

const BANCOS = [
  { codigo: "208", nome: "BTG PACTUAL" },
  { codigo: "341", nome: "ITAU" },
  { codigo: "033", nome: "SANTANDER" },
  { codigo: "001", nome: "BANCO DO BRASIL" },
  { codigo: "237", nome: "BRADESCO" },
  { codigo: "104", nome: "CAIXA ECONOMICA FEDERAL" },
];

const ESPECIES = [
  { codigo: "DD", nome: "DD - Documento de Dívida" },
  { codigo: "DM", nome: "DM - Duplicata Mercantil" },
  { codigo: "DS", nome: "DS - Duplicata de Serviço" },
  { codigo: "NP", nome: "NP - Nota Promissória" },
  { codigo: "RC", nome: "RC - Recibo" },
  { codigo: "OU", nome: "OU - Outros" },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ConfiguracaoBoleto() {
  const { user } = useAuth();
  const { condominioId, condominios, selectedCondominioId, setSelectedCondominioId } = useAdminCondominio();
  const effectiveCondominioId = user?.role === "admin" ? condominioId : user?.condominioId;

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);

  // Buscar configuração existente
  const { data: configExistente, isLoading } = trpc.cnab.getConfiguracaoBoleto.useQuery(
    { condominioId: effectiveCondominioId! },
    { enabled: !!effectiveCondominioId }
  );

  // Preencher formulário com dados existentes
  useEffect(() => {
    if (configExistente) {
      setForm({
        banco: configExistente.banco,
        nomeBanco: configExistente.nomeBanco,
        agencia: configExistente.agencia,
        digitoAgencia: configExistente.digitoAgencia,
        conta: configExistente.conta,
        digitoConta: configExistente.digitoConta,
        convenio: configExistente.convenio,
        ativo: configExistente.ativo === 1,
        contaRepasse: configExistente.contaRepasse === 1,
        usarMinimoDias: configExistente.usarMinimoDias === 1,
        minimosDiasAntesVencimento: configExistente.minimosDiasAntesVencimento,
        enviarParcelasApenasPrimeiraPaga: configExistente.enviarParcelasApenasPrimeiraPaga === 1,
        enviarParcelasApenasAnteriorPaga: configExistente.enviarParcelasApenasAnteriorPaga === 1,
        carteira: configExistente.carteira,
        especieDocumento: configExistente.especieDocumento,
        aceite: configExistente.aceite,
        nomeBeneficiario: configExistente.nomeBeneficiario || "",
        cnpjBeneficiario: configExistente.cnpjBeneficiario || "",
        enderecoBeneficiario: configExistente.enderecoBeneficiario || "",
        localPagamento: configExistente.localPagamento,
        instrucoesCaixa: configExistente.instrucoesCaixa,
        taxaJurosDia: configExistente.taxaJurosDia,
        taxaMulta: configExistente.taxaMulta,
        padraoNomeArquivo: configExistente.padraoNomeArquivo,
        layoutArquivo: configExistente.layoutArquivo,
        enviarInstrucoesProtesto: configExistente.enviarInstrucoesProtesto === 1,
        habilitarBoleto: configExistente.habilitarBoleto === 1,
        habilitarPix: configExistente.habilitarPix === 1,
        chavePix: configExistente.chavePix || "",
        tipoChavePix: configExistente.tipoChavePix || "CNPJ",
        taxaCobrancaValor: configExistente.taxaCobrancaValor,
        taxaCobrancaPercentual: configExistente.taxaCobrancaPercentual,
        despesaValor: configExistente.despesaValor,
        despesaPercentual: configExistente.despesaPercentual,
      });
      setDirty(false);
    }
  }, [configExistente]);

  const utils = trpc.useUtils();

  const salvarMutation = trpc.cnab.salvarConfiguracaoBoleto.useMutation({
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      setDirty(false);
      utils.cnab.getConfiguracaoBoleto.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSalvar() {
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio primeiro.");
      return;
    }
    salvarMutation.mutate({
      condominioId: effectiveCondominioId,
      banco: form.banco,
      nomeBanco: form.nomeBanco,
      agencia: form.agencia,
      digitoAgencia: form.digitoAgencia,
      conta: form.conta,
      digitoConta: form.digitoConta,
      convenio: form.convenio,
      ativo: form.ativo ? 1 : 0,
      contaRepasse: form.contaRepasse ? 1 : 0,
      usarMinimoDias: form.usarMinimoDias ? 1 : 0,
      minimosDiasAntesVencimento: form.minimosDiasAntesVencimento,
      enviarParcelasApenasPrimeiraPaga: form.enviarParcelasApenasPrimeiraPaga ? 1 : 0,
      enviarParcelasApenasAnteriorPaga: form.enviarParcelasApenasAnteriorPaga ? 1 : 0,
      carteira: form.carteira,
      especieDocumento: form.especieDocumento,
      aceite: form.aceite,
      nomeBeneficiario: form.nomeBeneficiario || undefined,
      cnpjBeneficiario: form.cnpjBeneficiario || undefined,
      enderecoBeneficiario: form.enderecoBeneficiario || undefined,
      localPagamento: form.localPagamento,
      instrucoesCaixa: form.instrucoesCaixa,
      taxaJurosDia: form.taxaJurosDia,
      taxaMulta: form.taxaMulta,
      padraoNomeArquivo: form.padraoNomeArquivo,
      layoutArquivo: form.layoutArquivo,
      enviarInstrucoesProtesto: form.enviarInstrucoesProtesto ? 1 : 0,
      habilitarBoleto: form.habilitarBoleto ? 1 : 0,
      habilitarPix: form.habilitarPix ? 1 : 0,
      chavePix: form.chavePix || undefined,
      tipoChavePix: form.tipoChavePix || undefined,
      taxaCobrancaValor: form.taxaCobrancaValor,
      taxaCobrancaPercentual: form.taxaCobrancaPercentual,
      despesaValor: form.despesaValor,
      despesaPercentual: form.despesaPercentual,
    });
  }

  // Calcular juros ao mês a partir da taxa diária
  const jurosMes = (parseFloat(form.taxaJurosDia) * 30).toFixed(4);

  if (!effectiveCondominioId) {
    return (
      <div className="p-8">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Selecione um condomínio para configurar o boleto.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            Configuração de Boleto
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure o portador bancário, dados do boleto e layout do arquivo CNAB 240 — BTG Pactual
          </p>
        </div>
        <div className="flex items-center gap-3">
          {configExistente ? (
            <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configurado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-600 gap-1">
              <AlertCircle className="h-3 w-3" /> Não configurado
            </Badge>
          )}
          {dirty && (
            <Badge variant="secondary" className="text-xs">Alterações não salvas</Badge>
          )}
        </div>
      </div>

      {/* Seletor de condomínio (apenas admin) */}
      {user?.role === "admin" && condominios && condominios.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Condomínio:</Label>
              <Select
                value={String(selectedCondominioId ?? "")}
                onValueChange={(v) => setSelectedCondominioId?.(Number(v))}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Selecione um condomínio" />
                </SelectTrigger>
                <SelectContent>
                  {(condominios as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Abas de configuração */}
      <Tabs defaultValue="portador" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="portador" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Portador
          </TabsTrigger>
          <TabsTrigger value="boleto" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Dados do Boleto
          </TabsTrigger>
          <TabsTrigger value="arquivo" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Arquivo CNAB
          </TabsTrigger>
          <TabsTrigger value="pagamento" className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Forma de Pagamento
          </TabsTrigger>
        </TabsList>

        {/* ─── ABA 1: Portador ─────────────────────────────────────────────── */}
        <TabsContent value="portador">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cadastro de Portador</CardTitle>
              <CardDescription>
                Dados bancários da conta de cobrança no BTG Pactual
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Banco + status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Portador</Label>
                  <Input
                    value={form.nomeBanco}
                    onChange={e => update("nomeBanco", e.target.value)}
                    placeholder="BTG Pactual"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <Select value={form.banco} onValueChange={v => {
                    const b = BANCOS.find(b => b.codigo === v);
                    update("banco", v);
                    if (b) update("nomeBanco", b.nome);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANCOS.map(b => (
                        <SelectItem key={b.codigo} value={b.codigo}>
                          {b.codigo} — {b.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Agência + Conta */}
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Agência</Label>
                  <Input
                    value={form.agencia}
                    onChange={e => update("agencia", e.target.value)}
                    placeholder="0050"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dígito Agência</Label>
                  <Input
                    value={form.digitoAgencia}
                    onChange={e => update("digitoAgencia", e.target.value)}
                    maxLength={1}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Exemplo: 0050</Label>
                  <div className="text-sm text-muted-foreground pt-2">
                    Ag. {form.agencia}-{form.digitoAgencia}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Conta</Label>
                  <Input
                    value={form.conta}
                    onChange={e => update("conta", e.target.value)}
                    placeholder="432260"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Conta Dígito</Label>
                  <Input
                    value={form.digitoConta}
                    onChange={e => update("digitoConta", e.target.value)}
                    maxLength={1}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">Exemplo: 432260-0</Label>
                  <div className="text-sm text-muted-foreground pt-2">
                    Conta {form.conta}-{form.digitoConta}
                  </div>
                </div>
              </div>

              {/* CNPJ / CPF do Beneficiário — obrigatório para o arquivo CNAB ser aceito pelo banco */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-semibold">Dados do Beneficiário — obrigatório para o BTG</span>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  O CNPJ/CPF deve corresponder exatamente ao cadastro da conta no BTG Pactual. O banco rejeita o arquivo se houver divergência.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      CNPJ / CPF Beneficiário
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={form.cnpjBeneficiario}
                      onChange={e => update("cnpjBeneficiario", e.target.value)}
                      placeholder="32.311.089/0001-01"
                      className={!form.cnpjBeneficiario ? "border-amber-400 focus-visible:ring-amber-400" : ""}
                    />
                    {!form.cnpjBeneficiario && (
                      <p className="text-xs text-amber-600">Campo obrigatório — sem ele o arquivo será rejeitado pelo banco</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome Beneficiário</Label>
                    <Input
                      value={form.nomeBeneficiario}
                      onChange={e => update("nomeBeneficiario", e.target.value)}
                      placeholder="Nome conforme cadastro no banco"
                    />
                  </div>
                </div>
              </div>

              {/* Convênio */}
              <div className="space-y-1.5">
                <Label>Convênio / Código do Cedente</Label>
                <Input
                  value={form.convenio}
                  onChange={e => update("convenio", e.target.value)}
                  placeholder="Código fornecido pelo BTG Pactual"
                />
                <p className="text-xs text-muted-foreground">
                  Código de convênio fornecido pelo banco ao habilitar a cobrança. Deixe em branco se não utilizar.
                </p>
              </div>

              <Separator />

              {/* Flags */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ativo"
                    checked={form.ativo}
                    onCheckedChange={v => update("ativo", !!v)}
                  />
                  <Label htmlFor="ativo">Ativo</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="contaRepasse"
                    checked={form.contaRepasse}
                    onCheckedChange={v => update("contaRepasse", !!v)}
                  />
                  <Label htmlFor="contaRepasse">Conta Repasse</Label>
                </div>
              </div>

              <Separator />

              {/* Configuração de Remessa */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Configuração de Remessa para Registro no Banco</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="usarMinimoDias"
                      checked={form.usarMinimoDias}
                      onCheckedChange={v => update("usarMinimoDias", !!v)}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="usarMinimoDias">
                        Mínimo de dias antes do vencimento para registro do título
                      </Label>
                      {form.usarMinimoDias && (
                        <Input
                          type="number"
                          min={0}
                          max={30}
                          value={form.minimosDiasAntesVencimento}
                          onChange={e => update("minimosDiasAntesVencimento", parseInt(e.target.value) || 0)}
                          className="w-24"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="primeiraPaga"
                      checked={form.enviarParcelasApenasPrimeiraPaga}
                      onCheckedChange={v => update("enviarParcelasApenasPrimeiraPaga", !!v)}
                    />
                    <Label htmlFor="primeiraPaga">
                      Envia registro das parcelas apenas se primeira parcela paga
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="anteriorPaga"
                      checked={form.enviarParcelasApenasAnteriorPaga}
                      onCheckedChange={v => update("enviarParcelasApenasAnteriorPaga", !!v)}
                    />
                    <Label htmlFor="anteriorPaga">
                      Envia registro das parcelas apenas se a parcela anterior estiver paga
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ABA 2: Dados do Boleto ──────────────────────────────────────── */}
        <TabsContent value="boleto">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do Boleto</CardTitle>
              <CardDescription>
                Informações impressas no boleto bancário
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Carteira + Espécie + Aceite + Moeda + Nosso Número */}
              <div className="grid grid-cols-5 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label>Carteira</Label>
                  <Select value={form.carteira} onValueChange={v => update("carteira", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 | Cobrança Simples</SelectItem>
                      <SelectItem value="2">2 | Cobrança Vinculada</SelectItem>
                      <SelectItem value="3">3 | Cobrança Caucionada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Espécie</Label>
                  <Select value={form.especieDocumento} onValueChange={v => update("especieDocumento", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESPECIES.map(e => (
                        <SelectItem key={e.codigo} value={e.codigo}>{e.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Aceite</Label>
                  <Select value={form.aceite} onValueChange={v => update("aceite", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="N">N</SelectItem>
                      <SelectItem value="S">S</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Nome e CNPJ do Beneficiário */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nome Beneficiário</Label>
                  <Input
                    value={form.nomeBeneficiario}
                    onChange={e => update("nomeBeneficiario", e.target.value)}
                    placeholder="Nome do condomínio ou empresa"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>CNPJ Beneficiário</Label>
                  <Input
                    value={form.cnpjBeneficiario}
                    onChange={e => update("cnpjBeneficiario", e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>

              {/* Endereço do Beneficiário */}
              <div className="space-y-1.5">
                <Label>Endereço Beneficiário</Label>
                <Input
                  value={form.enderecoBeneficiario}
                  onChange={e => update("enderecoBeneficiario", e.target.value)}
                  placeholder="Rua, número, complemento"
                />
              </div>

              {/* Local de Pagamento */}
              <div className="space-y-1.5">
                <Label>Local de Pagamento</Label>
                <Textarea
                  value={form.localPagamento}
                  onChange={e => update("localPagamento", e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Instruções de Caixa */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label>Instruções de Caixa</Label>
                  <span className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">#MULTA#</code> e <code className="bg-muted px-1 rounded">#JUROS#</code> como variáveis
                  </span>
                </div>
                <Textarea
                  value={form.instrucoesCaixa}
                  onChange={e => update("instrucoesCaixa", e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Juros e Multa */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label>% Juros ao Dia</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={form.taxaJurosDia}
                      onChange={e => update("taxaJurosDia", e.target.value)}
                      placeholder="0.03330"
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">
                      = {jurosMes}% ao Mês
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    1% ao mês = 0,03333% ao dia
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>% Multa</Label>
                  <Input
                    value={form.taxaMulta}
                    onChange={e => update("taxaMulta", e.target.value)}
                    placeholder="2.00"
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    Multa aplicada após o vencimento
                  </p>
                </div>
              </div>

              {/* Preview das instruções */}
              {(form.instrucoesCaixa.includes("#MULTA#") || form.instrucoesCaixa.includes("#JUROS#")) && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Preview:</strong>{" "}
                    {form.instrucoesCaixa
                      .replace("#MULTA#", `${form.taxaMulta}%`)
                      .replace("#JUROS#", `${form.taxaJurosDia}% ao dia`)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ABA 3: Arquivo CNAB ─────────────────────────────────────────── */}
        <TabsContent value="arquivo">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuração do Arquivo Bancário</CardTitle>
              <CardDescription>
                Parâmetros do arquivo CNAB 240 de remessa e retorno
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Nº Sequencial + Nome + Layout */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Nº Sequencial do Arquivo</Label>
                  <Input
                    value={configExistente?.numeroSequencialArquivo ?? 1}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Incrementado automaticamente a cada remessa gerada
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Nome Arquivo</Label>
                  <Input
                    value={form.padraoNomeArquivo}
                    onChange={e => update("padraoNomeArquivo", e.target.value)}
                    placeholder="BTG_ddmmyyyy.txt"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">ddmmyyyy</code> para data
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Layout do Arquivo</Label>
                  <Select value={form.layoutArquivo} onValueChange={v => update("layoutArquivo", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CNAB240">CNAB240</SelectItem>
                      <SelectItem value="CNAB400">CNAB400</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Preview do nome */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>Exemplo de nome:</strong>{" "}
                  {form.padraoNomeArquivo
                    .replace("ddmmyyyy", new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ""))
                    .replace("ddmmaa", new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, ""))}
                </AlertDescription>
              </Alert>

              <Separator />

              {/* Protesto */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="protesto"
                    checked={form.enviarInstrucoesProtesto}
                    onCheckedChange={v => update("enviarInstrucoesProtesto", !!v)}
                  />
                  <Label htmlFor="protesto">Enviar instruções de protesto</Label>
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Quando marcado, o segmento P da remessa incluirá instrução de protesto após 10 dias do vencimento
                </p>
              </div>

              <Separator />

              {/* Informações técnicas */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Informações Técnicas</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between bg-muted/50 rounded p-2">
                    <span className="text-muted-foreground">Segmentos gerados</span>
                    <span className="font-medium">P, Q, R</span>
                  </div>
                  <div className="flex justify-between bg-muted/50 rounded p-2">
                    <span className="text-muted-foreground">Versão do layout</span>
                    <span className="font-medium">089 (CNAB 240)</span>
                  </div>
                  <div className="flex justify-between bg-muted/50 rounded p-2">
                    <span className="text-muted-foreground">Código do banco</span>
                    <span className="font-medium">{form.banco} — {form.nomeBanco}</span>
                  </div>
                  <div className="flex justify-between bg-muted/50 rounded p-2">
                    <span className="text-muted-foreground">Moeda</span>
                    <span className="font-medium">09 — Real (R$)</span>
                  </div>
                  {configExistente && (
                    <div className="flex justify-between bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Nosso Número atual</span>
                      <span className="font-medium">{configExistente.nossoNumeroAtual}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ABA 4: Forma de Pagamento ───────────────────────────────────── */}
        <TabsContent value="pagamento">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cadastro de Forma de Pagamento</CardTitle>
              <CardDescription>
                Defina as taxas e meios de pagamento aceitos nos acordos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Meios habilitados */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Meios de Pagamento</Label>
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="boleto"
                      checked={form.habilitarBoleto}
                      onCheckedChange={v => update("habilitarBoleto", !!v)}
                    />
                    <Label htmlFor="boleto">Boleto</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pix"
                      checked={form.habilitarPix}
                      onCheckedChange={v => update("habilitarPix", !!v)}
                    />
                    <Label htmlFor="pix">PIX</Label>
                  </div>
                </div>
              </div>

              {/* Chave Pix */}
              {form.habilitarPix && (
                <div className="space-y-3 rounded-lg border border-dashed border-green-300 bg-green-50/50 p-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-green-600" />
                    <Label className="text-sm font-semibold text-green-700">Configuração da Chave Pix</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Tipo de Chave</Label>
                      <Select
                        value={form.tipoChavePix}
                        onValueChange={v => update("tipoChavePix", v as FormState["tipoChavePix"])}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CNPJ">CNPJ</SelectItem>
                          <SelectItem value="CPF">CPF</SelectItem>
                          <SelectItem value="EMAIL">E-mail</SelectItem>
                          <SelectItem value="TELEFONE">Telefone</SelectItem>
                          <SelectItem value="ALEATORIA">Chave Aleatória</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Chave Pix</Label>
                      <Input
                        value={form.chavePix}
                        onChange={e => update("chavePix", e.target.value)}
                        placeholder={
                          form.tipoChavePix === "CNPJ" ? "00.000.000/0000-00" :
                          form.tipoChavePix === "CPF" ? "000.000.000-00" :
                          form.tipoChavePix === "EMAIL" ? "email@exemplo.com" :
                          form.tipoChavePix === "TELEFONE" ? "+55 (11) 99999-9999" :
                          "Chave aleatória (UUID)"
                        }
                      />
                    </div>
                  </div>
                  {form.chavePix && (
                    <p className="text-xs text-green-600">
                      ✓ Botão "Copiar Pix" ficará disponível nos boletos gerados
                    </p>
                  )}
                  {!form.chavePix && (
                    <p className="text-xs text-muted-foreground">
                      Preencha a chave Pix para habilitar o botão "Copiar Pix" nos boletos
                    </p>
                  )}
                </div>
              )}

              <Separator />

              {/* Despesa */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Despesa:{" "}
                  <span className="font-normal text-muted-foreground">
                    reembolsada pelo Credor na prestação de contas.
                  </span>
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Valor</Label>
                    <Input
                      value={form.despesaValor}
                      onChange={e => update("despesaValor", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Percentual (%)</Label>
                    <Input
                      value={form.despesaPercentual}
                      onChange={e => update("despesaPercentual", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Taxa de Cobrança */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  Taxa de Cobrança:{" "}
                  <span className="font-normal text-muted-foreground">
                    cobrada do Devedor em cada parcela do acordo.
                  </span>
                </Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Valor</Label>
                    <Input
                      value={form.taxaCobrancaValor}
                      onChange={e => update("taxaCobrancaValor", e.target.value)}
                      placeholder="3.50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Percentual (%)</Label>
                    <Input
                      value={form.taxaCobrancaPercentual}
                      onChange={e => update("taxaCobrancaPercentual", e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Botões de ação */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            if (configExistente) {
              // Recarregar do servidor
              utils.cnab.getConfiguracaoBoleto.invalidate();
            } else {
              setForm(DEFAULT_FORM);
            }
            setDirty(false);
          }}
          disabled={!dirty}
        >
          Cancelar
        </Button>
        <Button
          onClick={handleSalvar}
          disabled={salvarMutation.isPending || !dirty}
          className="gap-2"
        >
          <Save className="h-4 w-4" />
          {salvarMutation.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
