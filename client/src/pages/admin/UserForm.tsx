import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Save, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

export default function UserForm() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/usuarios/:id");
  const isEdit = params?.id && params.id !== "novo";
  const userId = isEdit ? parseInt(params.id) : null;
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "cobrador" as "admin" | "sindico" | "cobrador" | "colaborador" | "advogado",
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
        name: userData.name || "",
        email: userData.email || "",
        password: "", // Não carregar senha existente
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

    if (!isEdit && !formData.password.trim()) {
      toast.error("Senha é obrigatória para novos usuários");
      return;
    }

    if (formData.password && (formData.password.length < 10 || !/[a-z]/.test(formData.password) || !/[A-Z]/.test(formData.password) || !/\d/.test(formData.password))) {
      toast.error("A senha deve ter ao menos 10 caracteres, letra maiúscula, minúscula e número");
      return;
    }

    // Validar condomínio apenas para síndicos
    if (formData.role === "sindico" && !formData.condominioId) {
      toast.error("Condomínio é obrigatório para Síndicos");
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
      // Se está editando e tem senha, incluir
      if (formData.password.trim()) {
        payload.password = formData.password;
      }
      updateMutation.mutate({ id: userId, ...payload });
    } else {
      // Criando novo usuário, senha é obrigatória
      createMutation.mutate({ ...payload, password: formData.password });
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
              <CardDescription>
                {isEdit 
                  ? "Atualize as informações do usuário. Deixe a senha em branco para não alterá-la."
                  : "Preencha os dados para criar um novo usuário no sistema"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                  <Label htmlFor="email">E-mail * (usado para login)</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="usuario@email.com"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Este email será usado como username no login
                  </p>
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-2">
                <Label htmlFor="password">
                  {isEdit ? "Nova Senha (deixe em branco para não alterar)" : "Senha *"}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={isEdit ? "Digite apenas se quiser alterar" : "Mínimo 10 caracteres, maiúscula, minúscula e número"}
                    required={!isEdit}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {!isEdit && (
                  <p className="text-xs text-muted-foreground">
                    Esta senha será usada pelo colaborador para fazer login
                  </p>
                )}
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
                      <SelectItem value="colaborador">Colaborador Interno</SelectItem>
                      <SelectItem value="advogado">Advogado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="condominioId">
                    Condomínio {formData.role === "sindico" && "*"}
                  </Label>
                  <Select
                    value={formData.condominioId || "none"}
                    onValueChange={(value) => setFormData({ ...formData, condominioId: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o condomínio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {condominios?.map((cond) => (
                        <SelectItem key={cond.id} value={cond.id.toString()}>
                          {cond.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.role === "sindico" && "Obrigatório para Síndicos. "}
                    {formData.role === "cobrador" && "Colaboradores podem trabalhar em vários condomínios. "}
                    {formData.role === "admin" && "Administradores têm acesso a todos os condomínios."}
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
                <p className="text-xs text-muted-foreground">
                  Usuários inativos não conseguem fazer login
                </p>
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
