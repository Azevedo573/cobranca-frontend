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
  const [, params] = useRoute("/devedores/:id");
  const isEdit = params?.id && params.id !== "novo";
  const devedorId = isEdit ? parseInt(params.id) : null;

  const [formData, setFormData] = useState({
    condominioId: "",
    name: "",
    unitNumber: "",
    bloco: "",
    email: "",
    phone: "",
    totalDue: "",
  });

  const { data: devedor } = trpc.devedores.getById.useQuery(
    { id: devedorId! },
    { enabled: !!devedorId }
  );

  const { data: condominios } = trpc.condominios.list.useQuery(
    undefined,
    { enabled: user?.role === "admin" }
  );

  useEffect(() => {
    if (devedor) {
      setFormData({
        condominioId: devedor.condominioId.toString(),
        name: devedor.name || "",
        unitNumber: devedor.unitNumber || "",
        bloco: devedor.bloco || "",
        email: devedor.email || "",
        phone: devedor.phone || "",
        totalDue: (devedor.totalDue / 100).toFixed(2),
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

    if (isEdit && devedorId) {
      updateMutation.mutate({
        id: devedorId,
        name: formData.name,
        unitNumber: formData.unitNumber,
        bloco: formData.bloco || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        totalDue: totalDueInCents,
      });
    } else {
      createMutation.mutate({
        condominioId: parseInt(formData.condominioId),
        name: formData.name,
        unitNumber: formData.unitNumber,
        bloco: formData.bloco || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        totalDue: totalDueInCents,
      });
    }
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
                    onValueChange={(value) => setFormData({ ...formData, condominioId: value })}
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

              {/* Valor Devido */}
              <div className="space-y-2">
                <Label htmlFor="totalDue">Valor Total Devido (R$)</Label>
                <Input
                  id="totalDue"
                  name="totalDue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.totalDue}
                  onChange={handleChange}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Valor total da dívida atual do condômino
                </p>
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
