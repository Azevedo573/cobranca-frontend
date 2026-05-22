import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save, Building2, Receipt, Info, Lock, Crown, Users, ExternalLink, Scale, FileText, ToggleLeft, ToggleRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

// Componente inline: exibe o admin principal do condomínio e link para gerenciar usuários
function AdminPrincipalInfo({ condominioId }: { condominioId: number }) {
  const { data: usersData, isLoading } = trpc.users.listByCondominio.useQuery({ condominioId });
  const adminPrincipal = usersData?.find(u => u.isPrimaryAdmin === 1);
  const totalUsers = usersData?.length ?? 0;

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground animate-pulse">
        Carregando usuários...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4 flex items-start gap-3">
        <Crown className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {adminPrincipal ? (
            <>
              <p className="font-medium text-sm">{adminPrincipal.name || "Sem nome"}</p>
              <p className="text-xs text-muted-foreground font-mono">{adminPrincipal.email || "—"}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
                  Admin Principal
                </Badge>
                <Badge variant={adminPrincipal.isActive ? "default" : "outline"} className={adminPrincipal.isActive ? "text-xs bg-green-100 text-green-700 border-green-200" : "text-xs"}>
                  {adminPrincipal.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">Nenhum administrador principal definido</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{totalUsers} usuário(s)</p>
        </div>
      </div>
      <a href="/admin/usuarios" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
        <Users className="h-4 w-4" />
        Gerenciar usuários deste condomínio
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function CondominioForm() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/condominios/:id");
  const isEdit = params?.id && params.id !== "novo";
  const condominioId = isEdit ? parseInt(params.id) : null;

  const [formData, setFormData] = useState({
    name: "",
    cnpj: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    managerName: "",
    managerEmail: "",
    username: "",
    password: "",
    taxaJurosMensal: "1.00",
    taxaMulta: "2.00",
    taxaHonorarios: "10.00",
    correcaoMonetaria: "0.00",
    descontoMaximo: "0.00",
    billingIssuer: "administradora" as "emissao_propria" | "administradora" | "outro",
    customBillingIssuer: "",
  });

  // Módulos ativos do condomínio
  const [modulosAtivos, setModulosAtivos] = useState<string[]>(["cobranca"]);

  const MODULOS_DISPONIVEIS = [
    {
      id: "cobranca",
      nome: "Cobrança",
      descricao: "Gestão de dívidas, boletos, acordos e régua de cobrança",
      icone: Receipt,
      cor: "text-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      borda: "border-blue-200 dark:border-blue-800",
    },
    {
      id: "juridico",
      nome: "Jurídico",
      descricao: "Canal de atendimento jurídico, solicitações e comunicação com o escritório",
      icone: Scale,
      cor: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-950/30",
      borda: "border-purple-200 dark:border-purple-800",
    },
  ];

  const { data: condominio } = trpc.condominios.getById.useQuery(
    { id: condominioId! },
    { enabled: !!condominioId }
  );

  const utils = trpc.useUtils();

  useEffect(() => {
    if (condominio) {
      setFormData({
        name: condominio.name || "",
        cnpj: condominio.cnpj || "",
        address: condominio.address || "",
        city: condominio.city || "",
        state: condominio.state || "",
        zipCode: condominio.zipCode || "",
        phone: condominio.phone || "",
        email: condominio.email || "",
        managerName: condominio.managerName || "",
        managerEmail: condominio.managerEmail || "",
        username: condominio.username || "",
        password: "", // Não preencher senha por segurança
        taxaJurosMensal: condominio.taxaJurosMensal || "1.00",
        taxaMulta: condominio.taxaMulta || "2.00",
        taxaHonorarios: condominio.taxaHonorarios || "10.00",
        correcaoMonetaria: condominio.correcaoMonetaria || "0.00",
        descontoMaximo: condominio.descontoMaximo || "0.00",
        billingIssuer: (condominio.billingIssuer as "emissao_propria" | "administradora" | "outro") || "administradora",
        customBillingIssuer: condominio.customBillingIssuer || "",
      });
      // Carregar módulos ativos
      try {
        const mods = JSON.parse((condominio as any).modulosAtivos || '["cobranca"]');
        setModulosAtivos(Array.isArray(mods) ? mods : ["cobranca"]);
      } catch {
        setModulosAtivos(["cobranca"]);
      }
    }
  }, [condominio]);

  const createMutation = trpc.condominios.create.useMutation({
    onSuccess: () => {
      toast.success("Condomínio cadastrado com sucesso!");
      utils.condominios.list.invalidate();
      setLocation("/admin/condominios");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar: " + error.message);
    },
  });

  const updateMutation = trpc.condominios.update.useMutation({
    onSuccess: () => {
      toast.success("Condomínio atualizado com sucesso!");
      utils.condominios.list.invalidate();
      utils.condominios.getById.invalidate();
      setLocation("/admin/condominios");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Nome do condomínio é obrigatório");
      return;
    }
    if (formData.billingIssuer === "outro" && !formData.customBillingIssuer.trim()) {
      toast.error("Informe o nome do emissor personalizado.");
      return;
    }

    const payload = {
      ...formData,
      customBillingIssuer: formData.billingIssuer === "outro" ? formData.customBillingIssuer : undefined,
      modulosAtivos: JSON.stringify(modulosAtivos),
    };

    if (isEdit && condominioId) {
      updateMutation.mutate({ id: condominioId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      const digits = value.replace(/\D/g, "").slice(0, 11);
      let formatted = digits;
      if (digits.length > 6) {
        formatted = digits.length <= 10
          ? `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
          : `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
      } else if (digits.length > 2) {
        formatted = `(${digits.slice(0,2)}) ${digits.slice(2)}`;
      } else if (digits.length > 0) {
        formatted = `(${digits}`;
      }
      setFormData({ ...formData, phone: formatted });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/condominios")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">
                  {isEdit ? "Editar Condomínio" : "Novo Condomínio"}
                </h1>
                <p className="text-sm text-muted-foreground">Preencha os dados abaixo</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Dados do Condomínio</CardTitle>
              <CardDescription>Informações cadastrais e de contato</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Dados Básicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Condomínio *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Ex: Residencial Jardim das Flores"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ</Label>
                  <Input
                    id="cnpj"
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>

              {/* Endereço */}
              <div className="space-y-2">
                <Label htmlFor="address">Endereço Completo</Label>
                <Textarea
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Rua, número, complemento"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Ex: São Paulo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    name="zipCode"
                    value={formData.zipCode}
                    onChange={handleChange}
                    placeholder="00000-000"
                  />
                </div>
              </div>

              {/* Contato */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="contato@condominio.com.br"
                  />
                </div>
              </div>

              {/* Responsável */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Responsável pelo Condomínio</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="managerName">Nome do Síndico/Gestor</Label>
                    <Input
                      id="managerName"
                      name="managerName"
                      value={formData.managerName}
                      onChange={handleChange}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="managerEmail">E-mail do Responsável</Label>
                    <Input
                      id="managerEmail"
                      name="managerEmail"
                      type="email"
                      value={formData.managerEmail}
                      onChange={handleChange}
                      placeholder="sindico@email.com"
                    />
                  </div>
                </div>
              </div>

              {/* Usuário Administrador Principal */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-5 w-5 text-amber-500" />
                  <h3 className="text-lg font-semibold">Usuário Administrador Principal</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  O acesso ao condomínio é gerenciado pela <strong>tela de usuários</strong>.
                  Cada condomínio pode ter múltiplos usuários, sendo um deles o administrador principal.
                </p>

                {isEdit && condominioId ? (
                  <AdminPrincipalInfo condominioId={condominioId} />
                ) : (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                    <div className="flex items-start gap-3">
                      <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <strong>Novo condomínio:</strong> após salvar, acesse a{" "}
                        <strong>tela de Usuários</strong> para cadastrar o administrador principal deste condomínio
                        e definir suas credenciais de acesso.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Taxas e Encargos */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Taxas e Encargos</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure os percentuais aplicados no cálculo de valores devidos
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxaJurosMensal">Taxa de Juros Mensal (%)</Label>
                    <Input
                      id="taxaJurosMensal"
                      name="taxaJurosMensal"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.taxaJurosMensal}
                      onChange={handleChange}
                      placeholder="1.00"
                    />
                    <p className="text-xs text-muted-foreground">Aplicado por mês de atraso</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxaMulta">Taxa de Multa (%)</Label>
                    <Input
                      id="taxaMulta"
                      name="taxaMulta"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.taxaMulta}
                      onChange={handleChange}
                      placeholder="2.00"
                    />
                    <p className="text-xs text-muted-foreground">Aplicado uma vez após vencimento</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taxaHonorarios">Taxa de Honorários (%)</Label>
                    <Input
                      id="taxaHonorarios"
                      name="taxaHonorarios"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.taxaHonorarios}
                      onChange={handleChange}
                      placeholder="10.00"
                    />
                    <p className="text-xs text-muted-foreground">Aplicado sobre valor original</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="correcaoMonetaria">Correção Monetária Mensal (%)</Label>
                    <Input
                      id="correcaoMonetaria"
                      name="correcaoMonetaria"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.correcaoMonetaria}
                      onChange={handleChange}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">Aplicado por mês de atraso</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="descontoMaximo">Desconto Máximo Permitido (%)</Label>
                    <Input
                      id="descontoMaximo"
                      name="descontoMaximo"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.descontoMaximo}
                      onChange={handleChange}
                      placeholder="0.00"
                    />
                    <p className="text-xs text-muted-foreground">Limite de desconto para acordos de cobrança</p>
                  </div>
                </div>
              </div>

              {/* Emissor de Cobrança */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <Receipt className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold">Emissor de Cobrança</h3>
                  <Badge variant="outline" className="text-xs font-normal text-primary border-primary/30 bg-primary/5">
                    Obrigatório
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-5">
                  Define quem será o responsável pela emissão dos boletos bancários deste condomínio.
                  Quando <strong>Emissão própria</strong> for selecionado, o sistema gera o boleto automaticamente ao fechar um acordo.
                  Para <strong>Administradora</strong> ou <strong>Outro</strong>, um relatório PDF será gerado para envio externo.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Select de emissor */}
                  <div className="space-y-2">
                    <Label htmlFor="billingIssuer" className="flex items-center gap-1.5">
                      Emissor do boleto *
                    </Label>
                    {user?.role === "admin" ? (
                      <Select
                        value={formData.billingIssuer}
                        onValueChange={(v) =>
                          setFormData({
                            ...formData,
                            billingIssuer: v as "emissao_propria" | "administradora" | "outro",
                            customBillingIssuer: v !== "outro" ? "" : formData.customBillingIssuer,
                          })
                        }
                      >
                        <SelectTrigger id="billingIssuer">
                          <SelectValue placeholder="Selecione o emissor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="emissao_propria">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-green-600" />
                              Emissão própria
                            </div>
                          </SelectItem>
                          <SelectItem value="administradora">
                            <div className="flex items-center gap-2">
                              <Receipt className="h-4 w-4 text-blue-600" />
                              Administradora
                            </div>
                          </SelectItem>
                          <SelectItem value="outro">
                            <div className="flex items-center gap-2">
                              <Info className="h-4 w-4 text-amber-600" />
                              Outro
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        {formData.billingIssuer === "emissao_propria" ? "Emissão própria"
                          : formData.billingIssuer === "administradora" ? "Administradora"
                          : "Outro"}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formData.billingIssuer === "emissao_propria"
                        ? "Boleto gerado automaticamente pelo sistema ao fechar um acordo."
                        : formData.billingIssuer === "administradora"
                        ? "Relatório PDF gerado para envio à administradora ao fechar um acordo."
                        : "Relatório PDF gerado para envio ao emissor informado abaixo."}
                    </p>
                  </div>

                  {/* Campo personalizado — visível apenas quando 'outro' */}
                  {formData.billingIssuer === "outro" && (
                    <div className="space-y-2">
                      <Label htmlFor="customBillingIssuer">
                        Informe o emissor *
                      </Label>
                      {user?.role === "admin" ? (
                        <Input
                          id="customBillingIssuer"
                          name="customBillingIssuer"
                          value={formData.customBillingIssuer}
                          onChange={handleChange}
                          placeholder="Ex: Imobiliária Exemplo Ltda"
                          maxLength={255}
                          required
                        />
                      ) : (
                        <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" />
                          {formData.customBillingIssuer || "—"}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">Nome completo do emissor externo</p>
                    </div>
                  )}
                </div>

                {/* Card informativo sobre o comportamento */}
                <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800 dark:text-blue-300">
                      {formData.billingIssuer === "emissao_propria" ? (
                        <>
                          <strong>Emissão própria ativada:</strong> ao fechar um acordo, o sistema gerará automaticamente
                          o boleto bancário (BTG Pactual) com código de barras, linha digitável e QR Code Pix.
                        </>
                      ) : formData.billingIssuer === "administradora" ? (
                        <>
                          <strong>Administradora como emissora:</strong> ao fechar um acordo, o sistema gerará um
                          relatório PDF com os dados do devedor, parcelas e valores para envio à administradora.
                          A administradora será responsável pela emissão dos boletos.
                        </>
                      ) : (
                        <>
                          <strong>Emissor personalizado:</strong> ao fechar um acordo, o sistema gerará um
                          relatório PDF identificado com o nome do emissor informado acima para envio externo.
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Módulos do Condomínio */}
              {user?.role === "admin" && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 pb-1 border-b">
                    <Scale className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">Módulos Contratados</h3>
                    <span className="text-xs text-muted-foreground ml-1">Ative ou desative os módulos disponíveis para este condomínio</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {MODULOS_DISPONIVEIS.map((modulo) => {
                      const ativo = modulosAtivos.includes(modulo.id);
                      const Icon = modulo.icone;
                      const toggle = () => {
                        setModulosAtivos(prev =>
                          ativo ? prev.filter(m => m !== modulo.id) : [...prev, modulo.id]
                        );
                      };
                      return (
                        <button
                          key={modulo.id}
                          type="button"
                          onClick={toggle}
                          className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all cursor-pointer ${
                            ativo
                              ? `${modulo.borda} ${modulo.bg} shadow-sm`
                              : "border-border bg-muted/30 opacity-60 hover:opacity-80"
                          }`}
                        >
                          <div className={`mt-0.5 rounded-lg p-1.5 ${
                            ativo ? modulo.bg : "bg-muted"
                          }`}>
                            <Icon className={`h-5 w-5 ${ativo ? modulo.cor : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{modulo.nome}</span>
                              {ativo ? (
                                <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                                  Ativo
                                </span>
                              ) : (
                                <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                  Inativo
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{modulo.descricao}</p>
                          </div>
                          <div className="shrink-0 mt-0.5">
                            {ativo
                              ? <ToggleRight className={`h-5 w-5 ${modulo.cor}`} />
                              : <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                            }
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {modulosAtivos.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <Info className="h-3.5 w-3.5" />
                      Nenhum módulo ativo. O condomínio não terá acesso ao sistema.
                    </p>
                  )}
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/admin/condominios")}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
