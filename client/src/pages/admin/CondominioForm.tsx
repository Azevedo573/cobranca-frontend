import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Save, Building2, Receipt, Info, Lock, Crown, Users, ExternalLink,
  Scale, FileText, ToggleLeft, ToggleRight, AlertCircle, Settings2, Gavel,
  MapPin, BookOpen, Briefcase, Upload, X, FileCheck, Loader2
} from "lucide-react";
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
    // Geral
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
    // Cobrança
    taxaJurosMensal: "1.00",
    taxaMulta: "2.00",
    taxaHonorarios: "10.00",
    correcaoMonetaria: "0.00",
    descontoMaximo: "0.00",
    billingIssuer: "administradora" as "emissao_propria" | "administradora" | "outro",
    customBillingIssuer: "",
    indiceCorrecao: "IPCA" as "NENHUM" | "IPCA" | "IGP-M" | "INPC" | "IGP-DI",
    aplicarCorrecaoAuto: 1,
    maxParcelas: 12,
    cancelamentoAutoAtivo: 0,
    cancelamentoPrazoDias: 20,
    modoBoleto: "cnab240" as "cnab240" | "api_btg",
    // Jurídico
    juridicoAdvogadoResponsavel: "",
    juridicoAdvogadoOAB: "",
    juridicoVaraCompetente: "",
    juridicoForoComarca: "",
    juridicoTribunalEstado: "",
    juridicoConvencaoUrl: "",
    juridicoRegimentoUrl: "",
    // estados de upload

    juridicoObservacoes: "",
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
        password: "",
        taxaJurosMensal: condominio.taxaJurosMensal || "1.00",
        taxaMulta: condominio.taxaMulta || "2.00",
        taxaHonorarios: condominio.taxaHonorarios || "10.00",
        correcaoMonetaria: condominio.correcaoMonetaria || "0.00",
        descontoMaximo: condominio.descontoMaximo || "0.00",
        billingIssuer: (condominio.billingIssuer as "emissao_propria" | "administradora" | "outro") || "administradora",
        customBillingIssuer: condominio.customBillingIssuer || "",
        indiceCorrecao: ((condominio as any).indiceCorrecao || "IPCA") as "NENHUM" | "IPCA" | "IGP-M" | "INPC" | "IGP-DI",
        aplicarCorrecaoAuto: (condominio as any).aplicarCorrecaoAuto ?? 1,
        maxParcelas: (condominio as any).maxParcelas ?? 12,
        cancelamentoAutoAtivo: (condominio as any).cancelamentoAutoAtivo ?? 0,
        cancelamentoPrazoDias: (condominio as any).cancelamentoPrazoDias ?? 20,
        modoBoleto: ((condominio as any).modoBoleto || "cnab240") as "cnab240" | "api_btg",
        juridicoAdvogadoResponsavel: (condominio as any).juridicoAdvogadoResponsavel || "",
        juridicoAdvogadoOAB: (condominio as any).juridicoAdvogadoOAB || "",
        juridicoVaraCompetente: (condominio as any).juridicoVaraCompetente || "",
        juridicoForoComarca: (condominio as any).juridicoForoComarca || "",
        juridicoTribunalEstado: (condominio as any).juridicoTribunalEstado || "",
        juridicoConvencaoUrl: (condominio as any).juridicoConvencaoUrl || "",
        juridicoRegimentoUrl: (condominio as any).juridicoRegimentoUrl || "",
        juridicoObservacoes: (condominio as any).juridicoObservacoes || "",
      });
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
      juridicoAdvogadoResponsavel: formData.juridicoAdvogadoResponsavel || undefined,
      juridicoAdvogadoOAB: formData.juridicoAdvogadoOAB || undefined,
      juridicoVaraCompetente: formData.juridicoVaraCompetente || undefined,
      juridicoForoComarca: formData.juridicoForoComarca || undefined,
      juridicoTribunalEstado: formData.juridicoTribunalEstado || undefined,
      juridicoConvencaoUrl: formData.juridicoConvencaoUrl || undefined,
      juridicoRegimentoUrl: formData.juridicoRegimentoUrl || undefined,
      juridicoObservacoes: formData.juridicoObservacoes || undefined,
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

  // Estados de upload de documentos jurídicos
  const [uploadingConvencao, setUploadingConvencao] = useState(false);
  const [uploadingRegimento, setUploadingRegimento] = useState(false);

  const uploadDocMutation = trpc.condominios.uploadDocumento.useMutation({
    onSuccess: (data, variables) => {
      if (variables.tipo === "convencao") {
        setFormData(prev => ({ ...prev, juridicoConvencaoUrl: data.url }));
        setUploadingConvencao(false);
        toast.success(`Convenção Condominial enviada: ${data.fileName}`);
      } else {
        setFormData(prev => ({ ...prev, juridicoRegimentoUrl: data.url }));
        setUploadingRegimento(false);
        toast.success(`Regimento Interno enviado: ${data.fileName}`);
      }
    },
    onError: (error) => {
      setUploadingConvencao(false);
      setUploadingRegimento(false);
      toast.error("Erro ao enviar documento: " + error.message);
    },
  });

  const handleUploadDoc = (tipo: "convencao" | "regimento") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!condominioId) {
      toast.error("Salve o condomínio primeiro antes de enviar documentos.");
      return;
    }
    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo 16MB.");
      return;
    }
    if (tipo === "convencao") setUploadingConvencao(true);
    else setUploadingRegimento(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      uploadDocMutation.mutate({
        condominioId: condominioId!,
        tipo,
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

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
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="geral" className="space-y-6">
            {/* Tab Navigation */}
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="geral" className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4" />
                Geral
              </TabsTrigger>
              <TabsTrigger value="cobranca" className="flex items-center gap-2 text-sm">
                <Receipt className="h-4 w-4" />
                Cobrança
              </TabsTrigger>
              <TabsTrigger value="juridico" className="flex items-center gap-2 text-sm">
                <Gavel className="h-4 w-4" />
                Jurídico
              </TabsTrigger>
            </TabsList>

            {/* ─── ABA GERAL ──────────────────────────────────────────────────── */}
            <TabsContent value="geral">
              <Card>
                <CardContent className="pt-6 space-y-6">
                  {/* Dados Básicos */}
                  <div>
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Dados Básicos
                    </h3>
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
                  </div>

                  {/* Endereço */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      Endereço
                    </h3>
                    <div className="space-y-4">
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
                          <Input id="city" name="city" value={formData.city} onChange={handleChange} placeholder="Ex: São Paulo" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="state">Estado</Label>
                          <Input id="state" name="state" value={formData.state} onChange={handleChange} placeholder="UF" maxLength={2} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="zipCode">CEP</Label>
                          <Input id="zipCode" name="zipCode" value={formData.zipCode} onChange={handleChange} placeholder="00000-000" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contato */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      Contato
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input id="phone" name="phone" type="tel" value={formData.phone} onChange={handleChange} placeholder="(00) 00000-0000" maxLength={15} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">E-mail</Label>
                        <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="contato@condominio.com.br" />
                      </div>
                    </div>
                  </div>

                  {/* Responsável */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Responsável pelo Condomínio
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="managerName">Nome do Síndico/Gestor</Label>
                        <Input id="managerName" name="managerName" value={formData.managerName} onChange={handleChange} placeholder="Nome completo" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="managerEmail">E-mail do Responsável</Label>
                        <Input id="managerEmail" name="managerEmail" type="email" value={formData.managerEmail} onChange={handleChange} placeholder="sindico@email.com" />
                      </div>
                    </div>
                  </div>

                  {/* Usuário Administrador Principal */}
                  <div className="border-t pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Crown className="h-5 w-5 text-amber-500" />
                      <h3 className="text-base font-semibold">Usuário Administrador Principal</h3>
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

                  {/* Módulos do Condomínio */}
                  {user?.role === "admin" && (
                    <div className="border-t pt-6 space-y-4">
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
                              <div className={`mt-0.5 rounded-lg p-1.5 ${ativo ? modulo.bg : "bg-muted"}`}>
                                <Icon className={`h-5 w-5 ${ativo ? modulo.cor : "text-muted-foreground"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{modulo.nome}</span>
                                  {ativo ? (
                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">Ativo</span>
                                  ) : (
                                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Inativo</span>
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

                  {/* Botão Salvar */}
                  <div className="flex gap-4 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setLocation("/admin/condominios")} className="flex-1">
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── ABA COBRANÇA ───────────────────────────────────────────────── */}
            <TabsContent value="cobranca">
              <Card>
                <CardContent className="pt-6 space-y-6">
                  {/* Taxas e Encargos */}
                  <div>
                    <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      Taxas e Encargos
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Configure os percentuais aplicados no cálculo de valores devidos
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="taxaJurosMensal">Taxa de Juros Mensal (%)</Label>
                        <Input id="taxaJurosMensal" name="taxaJurosMensal" type="number" step="0.01" min="0" value={formData.taxaJurosMensal} onChange={handleChange} placeholder="1.00" />
                        <p className="text-xs text-muted-foreground">Aplicado por mês de atraso</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxaMulta">Taxa de Multa (%)</Label>
                        <Input id="taxaMulta" name="taxaMulta" type="number" step="0.01" min="0" value={formData.taxaMulta} onChange={handleChange} placeholder="2.00" />
                        <p className="text-xs text-muted-foreground">Aplicado uma vez após vencimento</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxaHonorarios">Taxa de Honorários (%)</Label>
                        <Input id="taxaHonorarios" name="taxaHonorarios" type="number" step="0.01" min="0" value={formData.taxaHonorarios} onChange={handleChange} placeholder="10.00" />
                        <p className="text-xs text-muted-foreground">Aplicado sobre valor original</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="correcaoMonetaria">Correção Monetária Mensal (%)</Label>
                        <Input id="correcaoMonetaria" name="correcaoMonetaria" type="number" step="0.01" min="0" value={formData.correcaoMonetaria} onChange={handleChange} placeholder="0.00" />
                        <p className="text-xs text-muted-foreground">Percentual fixo por mês de atraso (usado quando índice = Nenhum)</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="indiceCorrecao">Índice de Correção Monetária</Label>
                        <Select
                          value={formData.indiceCorrecao}
                          onValueChange={(v) => setFormData(prev => ({ ...prev, indiceCorrecao: v as typeof prev.indiceCorrecao }))}
                        >
                          <SelectTrigger id="indiceCorrecao">
                            <SelectValue placeholder="Selecione o índice" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NENHUM">Nenhum (usar % fixo)</SelectItem>
                            <SelectItem value="IPCA">IPCA (Banco Central)</SelectItem>
                            <SelectItem value="IGP-M">IGP-M (FGV)</SelectItem>
                            <SelectItem value="INPC">INPC (IBGE)</SelectItem>
                            <SelectItem value="IGP-DI">IGP-DI (FGV)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Quando selecionado, substitui o percentual fixo pelo índice acumulado desde o vencimento</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Aplicação Automática</Label>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, aplicarCorrecaoAuto: prev.aplicarCorrecaoAuto === 1 ? 0 : 1 }))}
                          className="flex items-center gap-2 text-sm"
                        >
                          {formData.aplicarCorrecaoAuto === 1
                            ? <ToggleRight className="h-6 w-6 text-green-500" />
                            : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                          <span className={formData.aplicarCorrecaoAuto === 1 ? "text-green-600 font-medium" : "text-muted-foreground"}>
                            {formData.aplicarCorrecaoAuto === 1 ? "Ativado" : "Desativado"}
                          </span>
                        </button>
                        <p className="text-xs text-muted-foreground">Quando ativado, o sistema busca os dados do índice selecionado no Banco Central automaticamente</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="maxParcelas">Máximo de Parcelas no Acordo</Label>
                        <Select
                          value={String(formData.maxParcelas)}
                          onValueChange={(v) => setFormData(prev => ({ ...prev, maxParcelas: parseInt(v) }))}
                        >
                          <SelectTrigger id="maxParcelas">
                            <SelectValue placeholder="Selecione o máximo" />
                          </SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4,5,6,7,8,9,10,11,12,15,18,24,36,48,60].map(n => (
                              <SelectItem key={n} value={String(n)}>Até {n}x</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Número máximo de parcelas aceito em acordos de negociação</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="descontoMaximo">Desconto Máximo Permitido (%)</Label>
                        <Input id="descontoMaximo" name="descontoMaximo" type="number" step="0.01" min="0" max="100" value={formData.descontoMaximo} onChange={handleChange} placeholder="0.00" />
                        <p className="text-xs text-muted-foreground">Limite de desconto para acordos de cobrança</p>
                      </div>
                    </div>
                  </div>

                  {/* Cancelamento Automático */}
                  <div className="border-t pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertCircle className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-semibold">Cancelamento Automático de Acordos</h3>
                      <Badge variant="outline" className="text-xs font-normal text-primary border-primary/30 bg-primary/5">Negociação</Badge>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">Cancelamento automático ativo</p>
                          <p className="text-xs text-muted-foreground">Cancela acordos cuja primeira parcela não seja paga dentro do prazo configurado</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, cancelamentoAutoAtivo: prev.cancelamentoAutoAtivo === 1 ? 0 : 1 }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            formData.cancelamentoAutoAtivo === 1 ? "bg-primary" : "bg-input"
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                            formData.cancelamentoAutoAtivo === 1 ? "translate-x-6" : "translate-x-1"
                          }`} />
                        </button>
                      </div>
                      {formData.cancelamentoAutoAtivo === 1 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="cancelamentoPrazoDias">Prazo para pagamento da 1ª parcela (dias)</Label>
                            <Select
                              value={String(formData.cancelamentoPrazoDias)}
                              onValueChange={(v) => setFormData(prev => ({ ...prev, cancelamentoPrazoDias: parseInt(v) }))}
                            >
                              <SelectTrigger id="cancelamentoPrazoDias">
                                <SelectValue placeholder="Selecione o prazo" />
                              </SelectTrigger>
                              <SelectContent>
                                {[5,7,10,15,20,25,30,45,60].map(n => (
                                  <SelectItem key={n} value={String(n)}>{n} dias</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Se a 1ª parcela não for paga em até {formData.cancelamentoPrazoDias} dias após a criação do acordo, ele será cancelado automaticamente
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Emissor de Cobrança */}
                  <div className="border-t pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <Receipt className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-semibold">Emissor de Cobrança</h3>
                      <Badge variant="outline" className="text-xs font-normal text-primary border-primary/30 bg-primary/5">Obrigatório</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">
                      Define quem será o responsável pela emissão dos boletos bancários deste condomínio.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="billingIssuer" className="flex items-center gap-1.5">Emissor do boleto *</Label>
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
                                <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-green-600" />Emissão própria</div>
                              </SelectItem>
                              <SelectItem value="administradora">
                                <div className="flex items-center gap-2"><Receipt className="h-4 w-4 text-blue-600" />Administradora</div>
                              </SelectItem>
                              <SelectItem value="outro">
                                <div className="flex items-center gap-2"><Info className="h-4 w-4 text-amber-600" />Outro</div>
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
                      </div>
                      {formData.billingIssuer === "outro" && (
                        <div className="space-y-2">
                          <Label htmlFor="customBillingIssuer">Informe o emissor *</Label>
                          {user?.role === "admin" ? (
                            <Input id="customBillingIssuer" name="customBillingIssuer" value={formData.customBillingIssuer} onChange={handleChange} placeholder="Ex: Imobiliária Exemplo Ltda" maxLength={255} required />
                          ) : (
                            <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                              <Lock className="h-3.5 w-3.5" />
                              {formData.customBillingIssuer || "—"}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
                      <div className="flex items-start gap-3">
                        <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                        <div className="text-sm text-blue-800 dark:text-blue-300">
                          {formData.billingIssuer === "emissao_propria" ? (
                            <><strong>Emissão própria ativada:</strong> ao fechar um acordo, o sistema gerará automaticamente o boleto bancário (BTG Pactual) com código de barras, linha digitável e QR Code Pix.</>
                          ) : formData.billingIssuer === "administradora" ? (
                            <><strong>Administradora como emissora:</strong> ao fechar um acordo, o sistema gerará um relatório PDF com os dados do devedor, parcelas e valores para envio à administradora.</>
                          ) : (
                            <><strong>Emissor personalizado:</strong> ao fechar um acordo, o sistema gerará um relatório PDF identificado com o nome do emissor informado acima para envio externo.</>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modo de Emissão de Boleto */}
                  <div className="border-t pt-6">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-5 w-5 text-primary" />
                      <h3 className="text-base font-semibold">Modo de Emissão de Boleto</h3>
                      <Badge variant="outline" className="text-xs font-normal text-primary border-primary/30 bg-primary/5">Integração Bancária</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-5">
                      Define como os boletos das parcelas de acordo serão gerados.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div
                        className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                          formData.modoBoleto === "cnab240" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        }`}
                        onClick={() => setFormData(prev => ({ ...prev, modoBoleto: "cnab240" }))}
                      >
                        {formData.modoBoleto === "cnab240" && (
                          <span className="absolute top-3 right-3 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                            <span className="h-2 w-2 rounded-full bg-white" />
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                          <span className="font-semibold text-sm">CNAB 240</span>
                          <Badge className="text-xs bg-green-100 text-green-700 border-green-200">Recomendado</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Gera arquivo de remessa CNAB 240 para envio ao banco. Compatível com qualquer banco que suporte o padrão FEBRABAN.</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          <li className="flex items-center gap-1"><span className="text-green-600">✓</span> Compatível com qualquer banco</li>
                          <li className="flex items-center gap-1"><span className="text-green-600">✓</span> Padrão FEBRABAN consolidado</li>
                          <li className="flex items-center gap-1"><span className="text-green-600">✓</span> Pronto para produção</li>
                        </ul>
                      </div>
                      <div
                        className={`relative flex flex-col gap-2 rounded-xl border-2 p-4 cursor-pointer transition-all ${
                          formData.modoBoleto === "api_btg" ? "border-amber-500 bg-amber-50 dark:bg-amber-950/20" : "border-border hover:border-amber-400/40"
                        }`}
                        onClick={() => setFormData(prev => ({ ...prev, modoBoleto: "api_btg" }))}
                      >
                        {formData.modoBoleto === "api_btg" && (
                          <span className="absolute top-3 right-3 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center">
                            <span className="h-2 w-2 rounded-full bg-white" />
                          </span>
                        )}
                        <div className="flex items-center gap-2">
                          <Settings2 className="h-5 w-5 text-amber-600" />
                          <span className="font-semibold text-sm">API BTG Pactual</span>
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">Beta</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Emite boletos em tempo real via API do BTG Pactual. Requer configuração de credenciais BTG e está em fase de testes.</p>
                        <ul className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          <li className="flex items-center gap-1"><span className="text-green-600">✓</span> Emissão instantânea</li>
                          <li className="flex items-center gap-1"><span className="text-green-600">✓</span> PIX integrado</li>
                          <li className="flex items-center gap-1"><span className="text-amber-600">⚠</span> Apenas BTG Pactual</li>
                          <li className="flex items-center gap-1"><span className="text-amber-600">⚠</span> Em fase de testes</li>
                        </ul>
                      </div>
                    </div>
                    {formData.modoBoleto === "api_btg" && (
                      <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-800 dark:text-amber-300">
                            <strong>Modo Beta:</strong> a integração com a API BTG está em fase de testes. Configure as credenciais em <strong>Configurações &gt; BTG Config</strong> antes de usar.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Botão Salvar */}
                  <div className="flex gap-4 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setLocation("/admin/condominios")} className="flex-1">
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── ABA JURÍDICO ───────────────────────────────────────────────── */}
            <TabsContent value="juridico">
              <Card>
                <CardContent className="pt-6 space-y-6">
                  {/* Advogado Responsável */}
                  <div>
                    <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" />
                      Advogado Responsável
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Advogado ou escritório responsável pelas demandas jurídicas deste condomínio
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="juridicoAdvogadoResponsavel">Nome do Advogado / Escritório</Label>
                        <Input
                          id="juridicoAdvogadoResponsavel"
                          name="juridicoAdvogadoResponsavel"
                          value={formData.juridicoAdvogadoResponsavel}
                          onChange={handleChange}
                          placeholder="Ex: Dr. João da Silva / Escritório XYZ"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="juridicoAdvogadoOAB">OAB</Label>
                        <Input
                          id="juridicoAdvogadoOAB"
                          name="juridicoAdvogadoOAB"
                          value={formData.juridicoAdvogadoOAB}
                          onChange={handleChange}
                          placeholder="Ex: OAB/RJ 123456"
                          maxLength={30}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Foro e Vara */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                      <Gavel className="h-4 w-4 text-primary" />
                      Foro e Vara Competente
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Informações sobre a competência jurisdicional para ações deste condomínio
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="juridicoTribunalEstado">Tribunal Estadual</Label>
                        <Select
                          value={formData.juridicoTribunalEstado || ""}
                          onValueChange={(v) => setFormData(prev => ({ ...prev, juridicoTribunalEstado: v }))}
                        >
                          <SelectTrigger id="juridicoTribunalEstado">
                            <SelectValue placeholder="Selecione o tribunal" />
                          </SelectTrigger>
                          <SelectContent>
                            {["TJAC","TJAL","TJAP","TJAM","TJBA","TJCE","TJDF","TJES","TJGO","TJMA","TJMT","TJMS","TJMG","TJPA","TJPB","TJPR","TJPE","TJPI","TJRJ","TJRN","TJRS","TJRO","TJRR","TJSC","TJSP","TJSE","TJTO"].map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="juridicoForoComarca">Foro / Comarca</Label>
                        <Input
                          id="juridicoForoComarca"
                          name="juridicoForoComarca"
                          value={formData.juridicoForoComarca}
                          onChange={handleChange}
                          placeholder="Ex: Comarca de São Paulo"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="juridicoVaraCompetente">Vara Competente</Label>
                        <Input
                          id="juridicoVaraCompetente"
                          name="juridicoVaraCompetente"
                          value={formData.juridicoVaraCompetente}
                          onChange={handleChange}
                          placeholder="Ex: 3ª Vara Cível"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Documentos */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Documentos do Condomínio
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Envie os documentos legais do condomínio em PDF (máx. 16MB cada).
                      {!condominioId && <span className="ml-1 text-amber-600 font-medium">Salve o condomínio antes de enviar documentos.</span>}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Convenção Condominial */}
                      <div className="space-y-2">
                        <Label>Convenção Condominial</Label>
                        {formData.juridicoConvencaoUrl ? (
                          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3">
                            <FileCheck className="h-5 w-5 text-green-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-green-700 dark:text-green-400 truncate">Documento enviado</p>
                              <a
                                href={formData.juridicoConvencaoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" /> Visualizar PDF
                              </a>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setFormData(prev => ({ ...prev, juridicoConvencaoUrl: "" }))}
                              title="Remover documento"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                            condominioId
                              ? "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
                              : "border-muted-foreground/20 opacity-50 cursor-not-allowed"
                          }`}>
                            {uploadingConvencao ? (
                              <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Enviando...</span></>
                            ) : (
                              <><Upload className="h-6 w-6 text-muted-foreground" /><span className="text-sm text-muted-foreground">Clique para enviar PDF</span><span className="text-xs text-muted-foreground/70">PDF, máx. 16MB</span></>
                            )}
                            <input
                              type="file"
                              accept=".pdf,application/pdf"
                              className="hidden"
                              disabled={!condominioId || uploadingConvencao}
                              onChange={handleUploadDoc("convencao")}
                            />
                          </label>
                        )}
                      </div>

                      {/* Regimento Interno */}
                      <div className="space-y-2">
                        <Label>Regimento Interno</Label>
                        {formData.juridicoRegimentoUrl ? (
                          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-3">
                            <FileCheck className="h-5 w-5 text-green-600 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-green-700 dark:text-green-400 truncate">Documento enviado</p>
                              <a
                                href={formData.juridicoRegimentoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="h-3 w-3" /> Visualizar PDF
                              </a>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setFormData(prev => ({ ...prev, juridicoRegimentoUrl: "" }))}
                              title="Remover documento"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                            condominioId
                              ? "border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5"
                              : "border-muted-foreground/20 opacity-50 cursor-not-allowed"
                          }`}>
                            {uploadingRegimento ? (
                              <><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-sm text-muted-foreground">Enviando...</span></>
                            ) : (
                              <><Upload className="h-6 w-6 text-muted-foreground" /><span className="text-sm text-muted-foreground">Clique para enviar PDF</span><span className="text-xs text-muted-foreground/70">PDF, máx. 16MB</span></>
                            )}
                            <input
                              type="file"
                              accept=".pdf,application/pdf"
                              className="hidden"
                              disabled={!condominioId || uploadingRegimento}
                              onChange={handleUploadDoc("regimento")}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Observações Jurídicas */}
                  <div className="border-t pt-6">
                    <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Observações Jurídicas
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Informações relevantes para a equipe jurídica sobre este condomínio
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="juridicoObservacoes">Observações</Label>
                      <Textarea
                        id="juridicoObservacoes"
                        name="juridicoObservacoes"
                        value={formData.juridicoObservacoes}
                        onChange={handleChange}
                        placeholder="Ex: Condomínio com histórico de inadimplência elevada. Síndico prefere comunicação por e-mail. Atenção para prazo de assembleia em março..."
                        rows={5}
                      />
                    </div>
                  </div>

                  {/* Aviso informativo */}
                  <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 p-4">
                    <div className="flex items-start gap-3">
                      <Scale className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-purple-800 dark:text-purple-300">
                        <strong>Módulo Jurídico:</strong> para que este condomínio tenha acesso ao canal jurídico (demandas, publicações, processos), ative o módulo <strong>Jurídico</strong> na aba <strong>Geral</strong>.
                      </div>
                    </div>
                  </div>

                  {/* Botão Salvar */}
                  <div className="flex gap-4 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setLocation("/admin/condominios")} className="flex-1">
                      Cancelar
                    </Button>
                    <Button type="submit" className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </main>
    </div>
  );
}
