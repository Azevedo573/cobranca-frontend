import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Building2, Lock, User } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function LoginCondominio() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  const loginMutation = trpc.auth.loginCustom.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Login realizado com sucesso!");
        // Recarregar página para atualizar contexto de autenticação
        window.location.href = "/";
      } else {
        toast.error(result.error || "Erro ao fazer login");
      }
    },
    onError: (error) => {
      toast.error("Erro ao fazer login: " + error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim()) {
      toast.error("Digite o usuário");
      return;
    }

    if (!formData.password) {
      toast.error("Digite a senha");
      return;
    }

    loginMutation.mutate(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md shadow-2xl border-accent/20">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
            <Building2 className="w-8 h-8 text-accent" />
          </div>
          <div>
            <CardTitle className="text-3xl font-display">Gomes & Silva</CardTitle>
            <CardDescription className="text-base mt-2">
              Acesso para Condomínios
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Usuário
              </Label>
              <Input
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="Digite seu usuário"
                autoComplete="username"
                required
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Senha
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Digite sua senha"
                autoComplete="current-password"
                required
                className="h-12"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground text-lg font-semibold"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>

            <div className="text-center text-sm text-muted-foreground pt-4 space-y-2">
              <button
                type="button"
                onClick={() => setLocation("/esqueci-senha")}
                className="text-primary text-sm hover:underline"
              >
                Esqueceu sua senha?
              </button>
              <p>Sistema de Gestão de Cobranças Condominiais</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
