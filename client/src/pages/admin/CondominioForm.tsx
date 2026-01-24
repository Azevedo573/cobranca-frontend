import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

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
  });

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
      });
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

    if (isEdit && condominioId) {
      updateMutation.mutate({ id: condominioId, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
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
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="(00) 0000-0000"
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

              {/* Credenciais de Acesso */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Credenciais de Acesso</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Defina usuário e senha para acesso do condomínio ao sistema
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Usuário</Label>
                    <Input
                      id="username"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      placeholder="usuario.condominio"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder={isEdit ? "Deixe em branco para manter" : "Digite a senha"}
                    />
                  </div>
                </div>
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
                </div>
              </div>

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
