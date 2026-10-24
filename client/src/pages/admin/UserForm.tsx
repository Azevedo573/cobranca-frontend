import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Eye, EyeOff, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

type UserRole = "admin" | "sindico" | "cobrador" | "colaborador" | "advogado";

type UserFormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  condominioId: string;
  condominioIds: string[];
  isActive: number;
};

export default function UserForm() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/admin/usuarios/:id");
  const isEdit = params?.id && params.id !== "novo";
  const userId = isEdit ? parseInt(params.id) : null;
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<UserFormState>({
    name: "",
    email: "",
    password: "",
    role: "cobrador",
    condominioId: "",
    condominioIds: [],
    isActive: 1,
  });

  const { data: userData } = trpc.users.getById.useQuery(
    { id: userId! },
    { enabled: !!userId },
  );
  const { data: vinculosCondominios } = trpc.users.getVinculosCondominios.useQuery(
    { userId: userId! },
    { enabled: !!userId },
  );
  const { data: condominios } = trpc.condominios.list.useQuery();

  useEffect(() => {
    if (!userData) return;
    setFormData({
      name: userData.name || "",
      email: userData.email || "",
      password: "",
      role: userData.role,
      condominioId: userData.condominioId?.toString() || "",
      condominioIds: vinculosCondominios?.filter((vinculo) => vinculo.isActive === 1).map((vinculo) => String(vinculo.condominioId))
        ?? (userData.condominioId ? [String(userData.condominioId)] : []),
      isActive: userData.isActive,
    });
  }, [userData, vinculosCondominios]);

  const utils = trpc.useUtils();
  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário cadastrado com sucesso!");
      utils.users.list.invalidate();
      setLocation("/admin/usuarios");
    },
    onError: (error) => toast.error("Erro ao cadastrar: " + error.message),
  });
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso!");
      utils.users.list.invalidate();
      utils.users.getById.invalidate();
      utils.users.getVinculosCondominios.invalidate();
      setLocation("/admin/usuarios");
    },
    onError: (error) => toast.error("Erro ao atualizar: " + error.message),
  });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) return toast.error("Nome é obrigatório");
    if (!formData.email.trim()) return toast.error("E-mail é obrigatório");
    if (!isEdit && !formData.password.trim()) return toast.error("Senha é obrigatória para novos usuários");
    if (formData.password && (formData.password.length < 10 || !/[a-z]/.test(formData.password) || !/[A-Z]/.test(formData.password) || !/\d/.test(formData.password))) {
      return toast.error("A senha deve ter ao menos 10 caracteres, letra maiúscula, minúscula e número");
    }
    if (formData.role !== "admin" && formData.condominioIds.length === 0) {
      return toast.error("Informe ao menos um condomínio autorizado para este usuário");
    }
    if (formData.condominioId && !formData.condominioIds.includes(formData.condominioId)) {
      return toast.error("O condomínio principal deve constar entre os condomínios autorizados");
    }

    const payload = {
      name: formData.name,
      email: formData.email,
      role: formData.role,
      condominioId: formData.condominioId ? parseInt(formData.condominioId, 10) : undefined,
      condominioIds: formData.condominioIds.map((id) => parseInt(id, 10)),
      isActive: formData.isActive,
    };

    if (isEdit && userId) {
      updateMutation.mutate({ id: userId, ...(formData.password.trim() ? { password: formData.password } : {}), ...payload });
    } else {
      createMutation.mutate({ ...payload, password: formData.password });
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const selecionarCondominioPrincipal = (value: string) => {
    const condominioId = value === "none" ? "" : value;
    setFormData((atual) => ({
      ...atual,
      condominioId,
      condominioIds: condominioId && !atual.condominioIds.includes(condominioId)
        ? [...atual.condominioIds, condominioId]
        : atual.condominioIds,
    }));
  };

  const alternarVinculo = (condominioId: string, checked: boolean) => {
    setFormData((atual) => {
      if (checked) {
        return atual.condominioIds.includes(condominioId)
          ? atual
          : { ...atual, condominioIds: [...atual.condominioIds, condominioId] };
      }
      if (atual.condominioId === condominioId) {
        toast.error("Defina outro condomínio principal antes de remover este vínculo.");
        return atual;
      }
      return { ...atual, condominioIds: atual.condominioIds.filter((id) => id !== condominioId) };
    });
  };

  const salvando = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/usuarios")} aria-label="Voltar para usuários">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">{isEdit ? "Editar Usuário" : "Novo Usuário"}</h1>
                <p className="text-sm text-muted-foreground">Dados pessoais, perfil e condomínios autorizados</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>Sair</Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-8">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Dados do Usuário</CardTitle>
              <CardDescription>
                {isEdit ? "Atualize os dados. Deixe a senha em branco para mantê-la." : "Crie um acesso individual e defina os condomínios autorizados."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome completo *</Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Nome do usuário" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail * (usado para login)</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="usuario@email.com" required />
                  <p className="text-xs text-muted-foreground">Este e-mail identifica o acesso individual e a auditoria.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{isEdit ? "Nova senha (deixe em branco para não alterar)" : "Senha *"}</Label>
                <div className="relative">
                  <Input id="password" name="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} placeholder={isEdit ? "Digite apenas se quiser alterar" : "Mínimo 10 caracteres, maiúscula, minúscula e número"} required={!isEdit} />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="role">Perfil de acesso *</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value as UserRole })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="sindico">Síndico</SelectItem>
                      <SelectItem value="cobrador">Cobrador</SelectItem>
                      <SelectItem value="colaborador">Colaborador interno</SelectItem>
                      <SelectItem value="advogado">Advogado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="condominioId">Condomínio principal {formData.role !== "admin" && "*"}</Label>
                  <Select value={formData.condominioId || "none"} onValueChange={selecionarCondominioPrincipal}>
                    <SelectTrigger><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {condominios?.map((condominio) => <SelectItem key={condominio.id} value={String(condominio.id)}>{condominio.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Usado como contexto inicial após o login. Administradores mantêm visão global.</p>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                <div>
                  <Label>Condomínios autorizados {formData.role !== "admin" && "*"}</Label>
                  <p className="mt-1 text-xs text-muted-foreground">Síndicos, cobradores, colaboradores e advogados acessam somente os condomínios marcados.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {condominios?.map((condominio) => {
                    const id = String(condominio.id);
                    return (
                      <label key={condominio.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50">
                        <Checkbox checked={formData.condominioIds.includes(id)} onCheckedChange={(checked) => alternarVinculo(id, checked === true)} aria-label={`Autorizar acesso a ${condominio.name}`} />
                        <span>{condominio.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="isActive">Status</Label>
                <Select value={formData.isActive.toString()} onValueChange={(value) => setFormData({ ...formData, isActive: parseInt(value, 10) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Ativo</SelectItem>
                    <SelectItem value="0">Inativo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Usuários inativos não conseguem fazer login.</p>
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => setLocation("/admin/usuarios")} className="flex-1">Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" disabled={salvando}>
                  <Save className="mr-2 h-4 w-4" />
                  {salvando ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
