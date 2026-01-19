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

export default function UserForm() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/usuarios/:id");
  const isEdit = params?.id && params.id !== "novo";
  const userId = isEdit ? parseInt(params.id) : null;

  const [formData, setFormData] = useState({
    openId: "",
    name: "",
    email: "",
    role: "cobrador" as "admin" | "sindico" | "cobrador",
    condominioId: "",
    isActive: 1,
  });

  const { data: userData } = trpc.users.getById.useQuery(
    { id: userId! },
    { enabled: !!userId }
  );

  const { data: condominios } = trpc.condominios.list.useQuery();

  useEffect(() => {
    if (userData) {
      setFormData({
        openId: userData.openId || "",
        name: userData.name || "",
        email: userData.email || "",
        role: userData.role,
        condominioId: userData.condominioId?.toString() || "",
        isActive: userData.isActive,
      });
    }
  }, [userData]);

  const utils = trpc.useUtils();

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário cadastrado com sucesso!");
      utils.users.list.invalidate();
      setLocation("/admin/usuarios");
    },
    onError: (error) => {
      toast.error("Erro ao cadastrar: " + error.message);
    },
  });

  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso!");
      utils.users.list.invalidate();
      utils.users.getById.invalidate();
      setLocation("/admin/usuarios");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (!formData.email.trim()) {
      toast.error("E-mail é obrigatório");
      return;
    }

    if (!isEdit && !formData.openId.trim()) {
      toast.error("OpenID é obrigatório para novos usuários");
      return;
    }

    const payload: any = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      condominioId: formData.condominioId ? parseInt(formData.condominioId) : undefined,
      isActive: formData.isActive,
    };

    if (isEdit && userId) {
      updateMutation.mutate({ id: userId, ...payload });
    } else {
      createMutation.mutate({ ...payload, openId: formData.openId });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/usuarios")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">
                  {isEdit ? "Editar Usuário" : "Novo Usuário"}
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
              <CardTitle>Dados do Usuário</CardTitle>
              <CardDescription>Informações de acesso e permissões</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* OpenID (apenas criação) */}
              {!isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="openId">OpenID (Manus) *</Label>
                  <Input
                    id="openId"
                    name="openId"
                    value={formData.openId}
                    onChange={handleChange}
                    placeholder="ID único do Manus OAuth"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Identificador único retornado pelo sistema de autenticação Manus
                  </p>
                </div>
              )}

              {/* Dados Básicos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Nome do usuário"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="usuario@email.com"
                    required
                  />
                </div>
              </div>

              {/* Perfil e Condomínio */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Perfil de Acesso *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="sindico">Síndico</SelectItem>
                      <SelectItem value="cobrador">Cobrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="condominioId">Condomínio</Label>
                  <Select
                    value={formData.condominioId}
                    onValueChange={(value) => setFormData({ ...formData, condominioId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o condomínio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Nenhum (Admin)</SelectItem>
                      {condominios?.map((cond) => (
                        <SelectItem key={cond.id} value={cond.id.toString()}>
                          {cond.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Obrigatório para Síndicos e Cobradores
                  </p>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="isActive">Status</Label>
                <Select
                  value={formData.isActive.toString()}
                  onValueChange={(value) => setFormData({ ...formData, isActive: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Ativo</SelectItem>
                    <SelectItem value="0">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Botões */}
              <div className="flex gap-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/admin/usuarios")}
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
