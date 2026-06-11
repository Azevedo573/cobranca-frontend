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
  Building2, CreditCard, FileText, Settings2, Save, AlertCircle, CheckCircle2, Info, Globe,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Campos que são globais (dados bancários do portador — empresa/escritório) */
interface GlobalForm {
  banco: string;
  nomeBanco: string;
  agencia: string;
  digitoAgencia: string;
  conta: string;
  digitoConta: string;
  convenio: string;
  ativo: boolean;
  // Remessa
  usarMinimoDias: boolean;
  minimosDiasAntesVencimento: number;
  enviarParcelasApenasPrimeiraPaga: boolean;
  enviarParcelasApenasAnteriorPaga: boolean;
  // Boleto
  carteira: string;
  especieDocumento: string;
  aceite: string;
  localPagamento: string;
  instrucoesCaixa: string;
  taxaJurosDia: string;
  taxaMulta: string;
  // Arquivo CNAB
  padraoNomeArquivo: string;
  layoutArquivo: string;
  enviarInstrucoesProtesto: boolean;
  habilitarBoleto: boolean;
  habilitarPix: boolean;
}

/** Campos que variam por condomínio (dados do beneficiário + PIX + taxas) */
interface CondForm {
  nomeBeneficiario: string;
  cnpjBeneficiario: string;
  enderecoBeneficiario: string;
  chavePix: string;
  tipoChavePix: "CPF" | "CNPJ" | "EMAIL" | "TELEFONE" | "ALEATORIA";
  taxaCobrancaValor: string;
  taxaCobrancaPercentual: string;
  despesaValor: string;
  despesaPercentual: string;
}

const DEFAULT_GLOBAL: GlobalForm = {
  banco: "208",
  nomeBanco: "BTG PACTUAL",
  agencia: "0050",
  digitoAgencia: "0",
  conta: "",
  digitoConta: "0",
  convenio: "",
  ativo: true,
  usarMinimoDias: false,
  minimosDiasAntesVencimento: 0,
  enviarParcelasApenasPrimeiraPaga: false,
  enviarParcelasApenasAnteriorPaga: true,
  carteira: "1",
  especieDocumento: "DD",
  aceite: "N",
  localPagamento: "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO",
  instrucoesCaixa: "APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#",
  taxaJurosDia: "0.03330",
  taxaMulta: "2.00",
  padraoNomeArquivo: "REMESSA_ddmmyyyy.rem",
  layoutArquivo: "CNAB240",
  enviarInstrucoesProtesto: false,
  habilitarBoleto: true,
  habilitarPix: true,
};

const DEFAULT_COND: CondForm = {
  nomeBeneficiario: "",
  cnpjBeneficiario: "",
  enderecoBeneficiario: "",
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

  // ── Estado Global ──────────────────────────────────────────────────────────
  const [globalForm, setGlobalForm] = useState<GlobalForm>(DEFAULT_GLOBAL);
  const [globalDirty, setGlobalDirty] = useState(false);

  // ── Estado por Condomínio ──────────────────────────────────────────────────
  const [condForm, setCondForm] = useState<CondForm>(DEFAULT_COND);
  const [condDirty, setCondDirty] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: configGlobal, isLoading: loadingGlobal } = trpc.cnab.getCnabConfigGlobal.useQuery();

  const { data: configCond, isLoading: loadingCond } = trpc.cnab.getConfiguracaoBoleto.useQuery(
    { condominioId: effectiveCondominioId! },
    { enabled: !!effectiveCondominioId }
  );

  // ── Preencher formulário global ────────────────────────────────────────────
  useEffect(() => {
    if (configGlobal) {
      setGlobalForm({
        banco: configGlobal.banco,
        nomeBanco: configGlobal.nomeBanco,
        agencia: configGlobal.agencia,
        digitoAgencia: configGlobal.digitoAgencia,
        conta: configGlobal.conta,
        digitoConta: configGlobal.digitoConta,
        convenio: configGlobal.convenio,
        ativo: configGlobal.ativo === 1,
        usarMinimoDias: configGlobal.usarMinimoDias === 1,
        minimosDiasAntesVencimento: configGlobal.minimosDiasAntesVencimento,
        enviarParcelasApenasPrimeiraPaga: configGlobal.enviarParcelasApenasPrimeiraPaga === 1,
        enviarParcelasApenasAnteriorPaga: configGlobal.enviarParcelasApenasAnteriorPaga === 1,
        carteira: configGlobal.carteira,
        especieDocumento: configGlobal.especieDocumento,
        aceite: configGlobal.aceite,
        localPagamento: configGlobal.localPagamento,
        instrucoesCaixa: configGlobal.instrucoesCaixa,
        taxaJurosDia: configGlobal.taxaJurosDia,
        taxaMulta: configGlobal.taxaMulta,
        padraoNomeArquivo: configGlobal.padraoNomeArquivo,
        layoutArquivo: configGlobal.layoutArquivo,
        enviarInstrucoesProtesto: configGlobal.enviarInstrucoesProtesto === 1,
        habilitarBoleto: configGlobal.habilitarBoleto === 1,
        habilitarPix: configGlobal.habilitarPix === 1,
      });
      setGlobalDirty(false);
    }
  }, [configGlobal]);

  // ── Preencher formulário por condomínio ────────────────────────────────────
  useEffect(() => {
    if (configCond) {
      setCondForm({
        nomeBeneficiario: configCond.nomeBeneficiario || "",
        cnpjBeneficiario: configCond.cnpjBeneficiario || "",
        enderecoBeneficiario: configCond.enderecoBeneficiario || "",
        chavePix: configCond.chavePix || "",
        tipoChavePix: configCond.tipoChavePix || "CNPJ",
        taxaCobrancaValor: configCond.taxaCobrancaValor,
        taxaCobrancaPercentual: configCond.taxaCobrancaPercentual,
        despesaValor: configCond.despesaValor,
        despesaPercentual: configCond.despesaPercentual,
      });
      setCondDirty(false);
    }
  }, [configCond]);

  const utils = trpc.useUtils();

  // ── Mutations ─────────────────────────────────────────────────────────────
  const salvarGlobalMutation = trpc.cnab.salvarCnabConfigGlobal.useMutation({
    onSuccess: () => {
      toast.success("Configuração global CNAB salva com sucesso!");
      setGlobalDirty(false);
      utils.cnab.getCnabConfigGlobal.invalidate();
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  const salvarCondMutation = trpc.cnab.salvarConfiguracaoBoleto.useMutation({
    onSuccess: () => {
      toast.success("Dados do beneficiário salvos com sucesso!");
      setCondDirty(false);
      utils.cnab.getConfiguracaoBoleto.invalidate();
    },
    onError: (err) => toast.error(`Erro ao salvar: ${err.message}`),
  });

  function updateGlobal<K extends keyof GlobalForm>(key: K, value: GlobalForm[K]) {
    setGlobalForm(prev => ({ ...prev, [key]: value }));
    setGlobalDirty(true);
  }

  function updateCond<K extends keyof CondForm>(key: K, value: CondForm[K]) {
    setCondForm(prev => ({ ...prev, [key]: value }));
    setCondDirty(true);
  }

  function handleSalvarGlobal() {
    salvarGlobalMutation.mutate({
      banco: globalForm.banco,
      nomeBanco: globalForm.nomeBanco,
      agencia: globalForm.agencia,
      digitoAgencia: globalForm.digitoAgencia,
      conta: globalForm.conta,
      digitoConta: globalForm.digitoConta,
      convenio: globalForm.convenio,
      ativo: globalForm.ativo ? 1 : 0,
      usarMinimoDias: globalForm.usarMinimoDias ? 1 : 0,
      minimosDiasAntesVencimento: globalForm.minimosDiasAntesVencimento,
      enviarParcelasApenasPrimeiraPaga: globalForm.enviarParcelasApenasPrimeiraPaga ? 1 : 0,
      enviarParcelasApenasAnteriorPaga: globalForm.enviarParcelasApenasAnteriorPaga ? 1 : 0,
      carteira: globalForm.carteira,
      especieDocumento: globalForm.especieDocumento,
      aceite: globalForm.aceite,
      localPagamento: globalForm.localPagamento,
      instrucoesCaixa: globalForm.instrucoesCaixa,
      taxaJurosDia: globalForm.taxaJurosDia,
      taxaMulta: globalForm.taxaMulta,
      padraoNomeArquivo: globalForm.padraoNomeArquivo,
      layoutArquivo: globalForm.layoutArquivo,
      enviarInstrucoesProtesto: globalForm.enviarInstrucoesProtesto ? 1 : 0,
      habilitarBoleto: globalForm.habilitarBoleto ? 1 : 0,
      habilitarPix: globalForm.habilitarPix ? 1 : 0,
    });
  }

  function handleSalvarCond() {
    if (!effectiveCondominioId) {
      toast.error("Selecione um condomínio primeiro.");
      return;
    }
    // Envia apenas os campos do beneficiário — os campos bancários são ignorados pelo backend
    // mas a procedure ainda aceita condominioId + campos opcionais
    salvarCondMutation.mutate({
      condominioId: effectiveCondominioId,
      // Manter campos bancários com valores existentes (não sobrescrever)
      banco: configCond?.banco ?? "208",
      nomeBanco: configCond?.nomeBanco ?? "BTG PACTUAL",
      agencia: configCond?.agencia ?? "0001",
      digitoAgencia: configCond?.digitoAgencia ?? "0",
      conta: configCond?.conta ?? "",
      digitoConta: configCond?.digitoConta ?? "0",
      convenio: configCond?.convenio ?? "",
      ativo: configCond?.ativo ?? 1,
      contaRepasse: configCond?.contaRepasse ?? 0,
      usarMinimoDias: configCond?.usarMinimoDias ?? 0,
      minimosDiasAntesVencimento: configCond?.minimosDiasAntesVencimento ?? 0,
      enviarParcelasApenasPrimeiraPaga: configCond?.enviarParcelasApenasPrimeiraPaga ?? 0,
      enviarParcelasApenasAnteriorPaga: configCond?.enviarParcelasApenasAnteriorPaga ?? 1,
      carteira: configCond?.carteira ?? "1",
      especieDocumento: configCond?.especieDocumento ?? "DD",
      aceite: configCond?.aceite ?? "N",
      localPagamento: configCond?.localPagamento ?? "PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO",
      instrucoesCaixa: configCond?.instrucoesCaixa ?? "APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#",
      taxaJurosDia: configCond?.taxaJurosDia ?? "0.03330",
      taxaMulta: configCond?.taxaMulta ?? "2.00",
      padraoNomeArquivo: configCond?.padraoNomeArquivo ?? "REMESSA_ddmmyyyy.rem",
      layoutArquivo: configCond?.layoutArquivo ?? "CNAB240",
      enviarInstrucoesProtesto: configCond?.enviarInstrucoesProtesto ?? 0,
      habilitarBoleto: configCond?.habilitarBoleto ?? 1,
      habilitarPix: configCond?.habilitarPix ?? 1,
      // Campos do beneficiário (por condomínio)
      nomeBeneficiario: condForm.nomeBeneficiario || undefined,
      cnpjBeneficiario: condForm.cnpjBeneficiario || undefined,
      enderecoBeneficiario: condForm.enderecoBeneficiario || undefined,
      chavePix: condForm.chavePix || undefined,
      tipoChavePix: condForm.tipoChavePix || undefined,
      taxaCobrancaValor: condForm.taxaCobrancaValor,
      taxaCobrancaPercentual: condForm.taxaCobrancaPercentual,
      despesaValor: condForm.despesaValor,
      despesaPercentual: condForm.despesaPercentual,
    });
  }

  const jurosMes = (parseFloat(globalForm.taxaJurosDia || "0") * 30).toFixed(4);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-primary" />
            Configuração CNAB 240
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure os dados bancários globais do portador e os dados do beneficiário por condomínio
          </p>
        </div>
      </div>

      {/* ─── SEÇÃO 1: Configuração Global (Portador Bancário) ────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Configuração Global do Portador</h2>
          </div>
          <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
            Compartilhado por todos os condomínios
          </Badge>
          {configGlobal ? (
            <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configurado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-600 border-amber-600 gap-1">
              <AlertCircle className="h-3 w-3" /> Não configurado
            </Badge>
          )}
          {globalDirty && (
            <Badge variant="secondary" className="text-xs">Alterações não salvas</Badge>
          )}
        </div>

        <Alert className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-700 text-sm">
            Estes dados são do <strong>portador bancário</strong> (empresa/escritório) e se aplicam a todos os condomínios.
            Configure aqui o banco, agência, conta e convênio utilizados para emissão de boletos via CNAB 240.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="portador" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="portador" className="gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              Dados Bancários
            </TabsTrigger>
            <TabsTrigger value="boleto" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Parâmetros do Boleto
            </TabsTrigger>
            <TabsTrigger value="arquivo" className="gap-1.5">
              <Settings2 className="h-3.5 w-3.5" />
              Arquivo CNAB
            </TabsTrigger>
          </TabsList>

          {/* ABA: Dados Bancários */}
          <TabsContent value="portador">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Portador Bancário</CardTitle>
                <CardDescription>Conta bancária utilizada para emissão de boletos CNAB 240</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Banco */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Portador</Label>
                    <Input
                      value={globalForm.nomeBanco}
                      onChange={e => updateGlobal("nomeBanco", e.target.value)}
                      placeholder="BTG Pactual"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Banco</Label>
                    <Select value={globalForm.banco} onValueChange={v => {
                      const b = BANCOS.find(b => b.codigo === v);
                      updateGlobal("banco", v);
                      if (b) updateGlobal("nomeBanco", b.nome);
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BANCOS.map(b => (
                          <SelectItem key={b.codigo} value={b.codigo}>{b.codigo} — {b.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Agência */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Agência</Label>
                    <Input value={globalForm.agencia} onChange={e => updateGlobal("agencia", e.target.value)} placeholder="0050" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dígito Agência</Label>
                    <Input value={globalForm.digitoAgencia} onChange={e => updateGlobal("digitoAgencia", e.target.value)} maxLength={1} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Preview</Label>
                    <div className="text-sm text-muted-foreground pt-2">Ag. {globalForm.agencia}-{globalForm.digitoAgencia}</div>
                  </div>
                </div>

                {/* Conta */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Conta</Label>
                    <Input value={globalForm.conta} onChange={e => updateGlobal("conta", e.target.value)} placeholder="432260" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dígito Conta</Label>
                    <Input value={globalForm.digitoConta} onChange={e => updateGlobal("digitoConta", e.target.value)} maxLength={1} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Preview</Label>
                    <div className="text-sm text-muted-foreground pt-2">Conta {globalForm.conta}-{globalForm.digitoConta}</div>
                  </div>
                </div>

                {/* Convênio */}
                <div className="space-y-1.5">
                  <Label>Convênio / Código do Cedente</Label>
                  <Input value={globalForm.convenio} onChange={e => updateGlobal("convenio", e.target.value)} placeholder="Código fornecido pelo banco ao habilitar a cobrança" />
                  <p className="text-xs text-muted-foreground">Deixe em branco se não utilizar convênio.</p>
                </div>

                <Separator />

                {/* Flags */}
                <div className="flex items-center gap-2">
                  <Checkbox id="ativo" checked={globalForm.ativo} onCheckedChange={v => updateGlobal("ativo", !!v)} />
                  <Label htmlFor="ativo">Portador ativo</Label>
                </div>

                <Separator />

                {/* Configuração de Remessa */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm">Configuração de Remessa</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Checkbox id="usarMinimoDias" checked={globalForm.usarMinimoDias} onCheckedChange={v => updateGlobal("usarMinimoDias", !!v)} />
                      <div className="space-y-1">
                        <Label htmlFor="usarMinimoDias">Mínimo de dias antes do vencimento para registro do título</Label>
                        {globalForm.usarMinimoDias && (
                          <Input type="number" min={0} max={30} value={globalForm.minimosDiasAntesVencimento}
                            onChange={e => updateGlobal("minimosDiasAntesVencimento", parseInt(e.target.value) || 0)} className="w-24" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="primeiraPaga" checked={globalForm.enviarParcelasApenasPrimeiraPaga} onCheckedChange={v => updateGlobal("enviarParcelasApenasPrimeiraPaga", !!v)} />
                      <Label htmlFor="primeiraPaga">Envia registro das parcelas apenas se primeira parcela paga</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="anteriorPaga" checked={globalForm.enviarParcelasApenasAnteriorPaga} onCheckedChange={v => updateGlobal("enviarParcelasApenasAnteriorPaga", !!v)} />
                      <Label htmlFor="anteriorPaga">Envia registro das parcelas apenas se a parcela anterior estiver paga</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: Parâmetros do Boleto */}
          <TabsContent value="boleto">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parâmetros do Boleto</CardTitle>
                <CardDescription>Informações técnicas impressas no boleto bancário</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-5 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <Label>Carteira</Label>
                    <Select value={globalForm.carteira} onValueChange={v => updateGlobal("carteira", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 | Cobrança Simples</SelectItem>
                        <SelectItem value="2">2 | Cobrança Vinculada</SelectItem>
                        <SelectItem value="3">3 | Cobrança Caucionada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label>Espécie</Label>
                    <Select value={globalForm.especieDocumento} onValueChange={v => updateGlobal("especieDocumento", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESPECIES.map(e => (
                          <SelectItem key={e.codigo} value={e.codigo}>{e.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Aceite</Label>
                    <Select value={globalForm.aceite} onValueChange={v => updateGlobal("aceite", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="N">N</SelectItem>
                        <SelectItem value="S">S</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Local de Pagamento</Label>
                  <Textarea value={globalForm.localPagamento} onChange={e => updateGlobal("localPagamento", e.target.value)} rows={2} className="resize-none" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label>Instruções de Caixa</Label>
                    <span className="text-xs text-muted-foreground">
                      Use <code className="bg-muted px-1 rounded">#MULTA#</code> e <code className="bg-muted px-1 rounded">#JUROS#</code> como variáveis
                    </span>
                  </div>
                  <Textarea value={globalForm.instrucoesCaixa} onChange={e => updateGlobal("instrucoesCaixa", e.target.value)} rows={2} className="resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <Label>% Juros ao Dia</Label>
                    <div className="flex items-center gap-2">
                      <Input value={globalForm.taxaJurosDia} onChange={e => updateGlobal("taxaJurosDia", e.target.value)} placeholder="0.03330" className="w-32" />
                      <span className="text-sm text-muted-foreground">= {jurosMes}% ao Mês</span>
                    </div>
                    <p className="text-xs text-muted-foreground">1% ao mês = 0,03333% ao dia</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>% Multa</Label>
                    <Input value={globalForm.taxaMulta} onChange={e => updateGlobal("taxaMulta", e.target.value)} placeholder="2.00" className="w-32" />
                    <p className="text-xs text-muted-foreground">Multa aplicada após o vencimento</p>
                  </div>
                </div>

                {(globalForm.instrucoesCaixa.includes("#MULTA#") || globalForm.instrucoesCaixa.includes("#JUROS#")) && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>Preview:</strong>{" "}
                      {globalForm.instrucoesCaixa
                        .replace("#MULTA#", `${globalForm.taxaMulta}%`)
                        .replace("#JUROS#", `${globalForm.taxaJurosDia}% ao dia`)}
                    </AlertDescription>
                  </Alert>
                )}

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Meios de Pagamento</Label>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <Checkbox id="boleto" checked={globalForm.habilitarBoleto} onCheckedChange={v => updateGlobal("habilitarBoleto", !!v)} />
                      <Label htmlFor="boleto">Boleto</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="pix" checked={globalForm.habilitarPix} onCheckedChange={v => updateGlobal("habilitarPix", !!v)} />
                      <Label htmlFor="pix">PIX</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ABA: Arquivo CNAB */}
          <TabsContent value="arquivo">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração do Arquivo Bancário</CardTitle>
                <CardDescription>Parâmetros do arquivo CNAB 240 de remessa e retorno</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nº Sequencial do Arquivo</Label>
                    <Input value={configGlobal?.numeroSequencialArquivo ?? 1} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">Incrementado automaticamente a cada remessa</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome Arquivo</Label>
                    <Input value={globalForm.padraoNomeArquivo} onChange={e => updateGlobal("padraoNomeArquivo", e.target.value)} placeholder="REMESSA_ddmmyyyy.rem" />
                    <p className="text-xs text-muted-foreground">Use <code className="bg-muted px-1 rounded">ddmmyyyy</code> para data</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Layout do Arquivo</Label>
                    <Select value={globalForm.layoutArquivo} onValueChange={v => updateGlobal("layoutArquivo", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CNAB240">CNAB240</SelectItem>
                        <SelectItem value="CNAB400">CNAB400</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Exemplo de nome:</strong>{" "}
                    {globalForm.padraoNomeArquivo
                      .replace("ddmmyyyy", new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ""))
                      .replace("ddmmaa", new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, ""))}
                  </AlertDescription>
                </Alert>

                <Separator />

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox id="protesto" checked={globalForm.enviarInstrucoesProtesto} onCheckedChange={v => updateGlobal("enviarInstrucoesProtesto", !!v)} />
                    <Label htmlFor="protesto">Enviar instruções de protesto</Label>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    Quando marcado, o segmento P da remessa incluirá instrução de protesto após 10 dias do vencimento
                  </p>
                </div>

                <Separator />

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
                      <span className="font-medium">{globalForm.banco} — {globalForm.nomeBanco}</span>
                    </div>
                    <div className="flex justify-between bg-muted/50 rounded p-2">
                      <span className="text-muted-foreground">Moeda</span>
                      <span className="font-medium">09 — Real (R$)</span>
                    </div>
                    {configGlobal && (
                      <div className="flex justify-between bg-muted/50 rounded p-2">
                        <span className="text-muted-foreground">Nosso Número atual</span>
                        <span className="font-medium">{configGlobal.nossoNumeroAtual}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Botões de ação global */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => { utils.cnab.getCnabConfigGlobal.invalidate(); setGlobalDirty(false); }} disabled={!globalDirty}>
            Cancelar
          </Button>
          <Button onClick={handleSalvarGlobal} disabled={salvarGlobalMutation.isPending || !globalDirty} className="gap-2">
            <Save className="h-4 w-4" />
            {salvarGlobalMutation.isPending ? "Salvando..." : "Salvar Configuração Global"}
          </Button>
        </div>
      </div>

      <Separator className="my-2" />

      {/* ─── SEÇÃO 2: Dados do Beneficiário por Condomínio ───────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Dados do Beneficiário</h2>
          </div>
          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50">
            Por condomínio
          </Badge>
          {condDirty && (
            <Badge variant="secondary" className="text-xs">Alterações não salvas</Badge>
          )}
        </div>

        <Alert className="border-emerald-200 bg-emerald-50/50">
          <Info className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-emerald-700 text-sm">
            Estes dados identificam o <strong>beneficiário do boleto</strong> (condomínio) e variam por condomínio.
            O CNPJ deve corresponder exatamente ao cadastro no banco para que o arquivo CNAB seja aceito.
          </AlertDescription>
        </Alert>

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
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {!effectiveCondominioId ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Selecione um condomínio para configurar os dados do beneficiário.</AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação do Beneficiário</CardTitle>
              <CardDescription>Nome e CNPJ que aparecem no boleto como beneficiário</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* CNPJ + Nome */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-semibold">Dados obrigatórios para o arquivo CNAB</span>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  O CNPJ deve corresponder exatamente ao cadastro da conta no banco. O banco rejeita o arquivo se houver divergência.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      CNPJ / CPF Beneficiário <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={condForm.cnpjBeneficiario}
                      onChange={e => updateCond("cnpjBeneficiario", e.target.value)}
                      placeholder="32.311.089/0001-01"
                      className={!condForm.cnpjBeneficiario ? "border-amber-400 focus-visible:ring-amber-400" : ""}
                    />
                    {!condForm.cnpjBeneficiario && (
                      <p className="text-xs text-amber-600">Campo obrigatório — sem ele o arquivo será rejeitado pelo banco</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome Beneficiário</Label>
                    <Input
                      value={condForm.nomeBeneficiario}
                      onChange={e => updateCond("nomeBeneficiario", e.target.value)}
                      placeholder="Nome conforme cadastro no banco"
                    />
                  </div>
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-1.5">
                <Label>Endereço Beneficiário</Label>
                <Input
                  value={condForm.enderecoBeneficiario}
                  onChange={e => updateCond("enderecoBeneficiario", e.target.value)}
                  placeholder="Rua, número, complemento"
                />
              </div>

              <Separator />

              {/* Chave Pix */}
              <div className="space-y-3 rounded-lg border border-dashed border-green-300 bg-green-50/50 p-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-green-600" />
                  <Label className="text-sm font-semibold text-green-700">Chave Pix do Condomínio</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tipo de Chave</Label>
                    <Select value={condForm.tipoChavePix} onValueChange={v => updateCond("tipoChavePix", v as CondForm["tipoChavePix"])}>
                      <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
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
                      value={condForm.chavePix}
                      onChange={e => updateCond("chavePix", e.target.value)}
                      placeholder={
                        condForm.tipoChavePix === "CNPJ" ? "00.000.000/0000-00" :
                        condForm.tipoChavePix === "CPF" ? "000.000.000-00" :
                        condForm.tipoChavePix === "EMAIL" ? "email@exemplo.com" :
                        condForm.tipoChavePix === "TELEFONE" ? "+55 (11) 99999-9999" :
                        "Chave aleatória (UUID)"
                      }
                    />
                  </div>
                </div>
                {condForm.chavePix && (
                  <p className="text-xs text-green-600">✓ Botão "Copiar Pix" ficará disponível nos boletos gerados</p>
                )}
              </div>

              <Separator />

              {/* Taxas por condomínio */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Taxa de Cobrança:{" "}
                    <span className="font-normal text-muted-foreground">cobrada do Devedor em cada parcela do acordo.</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Valor</Label>
                      <Input value={condForm.taxaCobrancaValor} onChange={e => updateCond("taxaCobrancaValor", e.target.value)} placeholder="3.50" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Percentual (%)</Label>
                      <Input value={condForm.taxaCobrancaPercentual} onChange={e => updateCond("taxaCobrancaPercentual", e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Despesa:{" "}
                    <span className="font-normal text-muted-foreground">reembolsada pelo Credor na prestação de contas.</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Valor</Label>
                      <Input value={condForm.despesaValor} onChange={e => updateCond("despesaValor", e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Percentual (%)</Label>
                      <Input value={condForm.despesaPercentual} onChange={e => updateCond("despesaPercentual", e.target.value)} placeholder="0.00" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botões de ação por condomínio */}
        {effectiveCondominioId && (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { utils.cnab.getConfiguracaoBoleto.invalidate(); setCondDirty(false); }} disabled={!condDirty}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarCond} disabled={salvarCondMutation.isPending || !condDirty} className="gap-2">
              <Save className="h-4 w-4" />
              {salvarCondMutation.isPending ? "Salvando..." : "Salvar Dados do Beneficiário"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
