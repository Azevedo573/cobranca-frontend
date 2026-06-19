import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

export default function DevedorForm() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, paramsNovo] = useRoute("/devedores/:id");
  const [, paramsEditar] = useRoute("/devedores/:id/editar");
  const params = paramsEditar || paramsNovo;
  const isEdit = !!(paramsEditar?.id) || (paramsNovo?.id && paramsNovo.id !== "novo");
  const devedorId = isEdit ? parseInt(params!.id) : null;

  const [formData, setFormData] = useState({
    condominioId: "",
    name: "",
    unitNumber: "",
    bloco: "",
    cpfCnpj: "",
    email: "",
    phone: "",
    totalDue: "",
    // Endereço (necessário para boleto BTG)
    address: "",
    addressNumber: "",
    addressComplement: "",
    neighborhood: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const { data: devedor } = trpc.devedores.getById.useQuery(
    { id: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: condominios } = trpc.condominios.list.useQuery(
    undefined,
    { enabled: user?.role === "admin" }
  );

  // Buscar dados do condomínio selecionado para herdar endereço
  const condominioSelecionadoId = formData.condominioId ? parseInt(formData.condominioId) : null;
  const { data: condominioSelecionado } = trpc.condominios.getById.useQuery(
    { id: condominioSelecionadoId! },
    { enabled: !!condominioSelecionadoId }
  );

  // Ao selecionar condomínio (novo devedor), herdar endereço automaticamente
  const handleCondominioChange = (value: string) => {
    setFormData(prev => ({ ...prev, condominioId: value }));
  };

  // Preencher endereço do condomínio quando ele for carregado (apenas para novos devedores)
  useEffect(() => {
    if (condominioSelecionado && !isEdit) {
      setFormData(prev => ({
        ...prev,
        address: (condominioSelecionado as any).address || prev.address,
        addressNumber: (condominioSelecionado as any).addressNumber || prev.addressNumber,
        addressComplement: (condominioSelecionado as any).addressComplement || prev.addressComplement,
        neighborhood: (condominioSelecionado as any).neighborhood || prev.neighborhood,
        city: condominioSelecionado.city || prev.city,
        state: condominioSelecionado.state || prev.state,
        zipCode: condominioSelecionado.zipCode || prev.zipCode,
      }));
    }
  }, [condominioSelecionado, isEdit]);

  useEffect(() => {
    if (devedor) {
      setFormData({
        condominioId: devedor.condominioId.toString(),
        name: devedor.name || "",
        unitNumber: devedor.unitNumber || "",
        bloco: devedor.bloco || "",
        cpfCnpj: devedor.cpfCnpj || "",
        email: devedor.email || "",
        phone: devedor.phone || "",
        totalDue: (devedor.totalDue / 100).toFixed(2),
        address: (devedor as Record<string, unknown>).address as string || "",
        addressNumber: (devedor as Record<string, unknown>).addressNumber as string || "",
        addressComplement: (devedor as Record<string, unknown>).addressComplement as string || "",
        neighborhood: (devedor as Record<string, unknown>).neighborhood as string || "",
        city: (devedor as Record<string, unknown>).city as string || "",
        state: (devedor as Record<string, unknown>).state as string || "",
        zipCode: (devedor as Record<string, unknown>).zipCode as string || "",
      });
    } else if (user?.condominioId && !isEdit) {
      // Pré-selecionar condomínio do usuário logado
      setFormData(prev => ({ ...prev, condominioId: user.condominioId!.toString() }));
    }
  }, [devedor, user, isEdit]);

  const utils = trpc.useUtils();

  const createMutation = trpc.devedores.create.useMutation({
    onSuccess: () => {
      toast.success("Devedor cadastrado com sucesso!");
      utils.devedores.list.invalidate();
      setLocation("/devedores");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar: " + error.message);
    },
  });

  const updateMutation = trpc.devedores.update.useMutation({
    onSuccess: () => {
      toast.success("Devedor atualizado com sucesso!");
      utils.devedores.list.invalidate();
      utils.devedores.getById.invalidate();
      setLocation("/devedores");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validação: deve ter Nome OU (Bloco + Unidade)
    if (!formData.name.trim() && !formData.bloco.trim()) {
      toast.error("Preencha o Nome ou o Bloco para identificar o devedor");
      return;
    }

    if (!formData.unitNumber.trim()) {
      toast.error("Número da unidade é obrigatório");
      return;
    }

    if (!formData.condominioId) {
      toast.error("Condomínio é obrigatório");
      return;
    }

    const totalDueInCents = Math.round(parseFloat(formData.totalDue || "0") * 100);

    const enderecoPayload = {
      address: formData.address || undefined,
      addressNumber: formData.addressNumber || undefined,
      addressComplement: formData.addressComplement || undefined,
      neighborhood: formData.neighborhood || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      zipCode: formData.zipCode || undefined,
    };

    if (isEdit && devedorId) {
      updateMutation.mutate({
        id: devedorId,
        name: formData.name,
        unitNumber: formData.unitNumber,
        bloco: formData.bloco || undefined,
        cpfCnpj: formData.cpfCnpj || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        totalDue: totalDueInCents,
        ...enderecoPayload,
      });
    } else {
      createMutation.mutate({
        condominioId: parseInt(formData.condominioId),
        name: formData.name,
        unitNumber: formData.unitNumber,
        bloco: formData.bloco || undefined,
        cpfCnpj: formData.cpfCnpj || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        totalDue: totalDueInCents,
        ...enderecoPayload,
      });
    }
  };

  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length <= 11) {
      // CPF: 000.000.000-00
      if (value.length > 9) value = value.slice(0, 9) + "-" + value.slice(9);
      if (value.length > 6) value = value.slice(0, 6) + "." + value.slice(6);
      if (value.length > 3) value = value.slice(0, 3) + "." + value.slice(3);
    } else {
      // CNPJ: 00.000.000/0000-00
      value = value.slice(0, 14);
      if (value.length > 12) value = value.slice(0, 12) + "-" + value.slice(12);
      if (value.length > 8) value = value.slice(0, 8) + "/" + value.slice(8);
      if (value.length > 5) value = value.slice(0, 5) + "." + value.slice(5);
      if (value.length > 2) value = value.slice(0, 2) + "." + value.slice(2);
    }
    setFormData({ ...formData, cpfCnpj: value });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "phone") {
      // Aplicar máscara de telefone
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
              <Button variant="ghost" size="icon" onClick={() => setLocation("/devedores")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">
                  {isEdit ? "Editar Devedor" : "Novo Devedor"}
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
              <CardTitle>Dados do Devedor</CardTitle>
              <CardDescription>Informações do condômino inadimplente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Condomínio */}
              {user?.role === "admin" ? (
                <div className="space-y-2">
                  <Label htmlFor="condominioId">Condomínio *</Label>
                  <Select
                    value={formData.condominioId}
                    onValueChange={handleCondominioChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o condomínio" />
                    </SelectTrigger>
                    <SelectContent>
                      {condominios?.map((cond) => (
                        <SelectItem key={cond.id} value={cond.id.toString()}>
                          {cond.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <input type="hidden" name="condominioId" value={formData.condominioId} />
              )}

              {/* Dados Básicos */}
              <div className="space-y-2 mb-4">
                <p className="text-sm text-muted-foreground">
                  Preencha o <strong>Nome</strong> ou o <strong>Bloco</strong> para identificar o devedor
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Nome do condômino"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitNumber">Unidade *</Label>
                  <Input
                    id="unitNumber"
                    name="unitNumber"
                    value={formData.unitNumber}
                    onChange={handleChange}
                    placeholder="Ex: 101"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bloco">Bloco</Label>
                  <Input
                    id="bloco"
                    name="bloco"
                    value={formData.bloco}
                    onChange={handleChange}
                    placeholder="Ex: A, B, C"
                  />
                </div>
              </div>

              {/* CPF/CNPJ */}
              <div className="space-y-2">
                <Label htmlFor="cpfCnpj">CPF / CNPJ</Label>
                <Input
                  id="cpfCnpj"
                  name="cpfCnpj"
                  value={formData.cpfCnpj}
                  onChange={handleCpfCnpjChange}
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  maxLength={18}
                />
                <p className="text-xs text-muted-foreground">
                  Usado na geração do boleto CNAB 240 (Segmento Q)
                </p>
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
                    placeholder="(00) 00000-0000"
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
                    placeholder="devedor@email.com"
                  />
                </div>
              </div>

              {/* Endereço (herdado do condomínio) */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">
                    Endereço
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      Herdado do condomínio — edite apenas se diferente
                    </span>
                  </p>
                  {condominioSelecionado && !isEdit && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          address: (condominioSelecionado as any).address || "",
                          addressNumber: (condominioSelecionado as any).addressNumber || "",
                          addressComplement: (condominioSelecionado as any).addressComplement || "",
                          neighborhood: (condominioSelecionado as any).neighborhood || "",
                          city: condominioSelecionado.city || "",
                          state: condominioSelecionado.state || "",
                          zipCode: condominioSelecionado.zipCode || "",
                        }));
                        toast.info("Endereço restaurado do condomínio.");
                      }}
                    >
                      ↺ Restaurar do condomínio
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="address">Logradouro</Label>
                    <Input
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Rua, Av., etc."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressNumber">Número</Label>
                    <Input
                      id="addressNumber"
                      name="addressNumber"
                      value={formData.addressNumber}
                      onChange={handleChange}
                      placeholder="123"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addressComplement">Complemento</Label>
                    <Input
                      id="addressComplement"
                      name="addressComplement"
                      value={formData.addressComplement}
                      onChange={handleChange}
                      placeholder="Apto, Sala..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input
                      id="neighborhood"
                      name="neighborhood"
                      value={formData.neighborhood}
                      onChange={handleChange}
                      placeholder="Bairro"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input
                      id="zipCode"
                      name="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value.replace(/\D/g, "") })}
                      placeholder="00000000"
                      maxLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="Cidade"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">UF</Label>
                    <Input
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase().slice(0, 2) })}
                      placeholder="SP"
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/devedores")}
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
