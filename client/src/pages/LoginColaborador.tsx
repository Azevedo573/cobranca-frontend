import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Briefcase, Lock, User } from "lucide-react";

export default function LoginColaborador() {
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });

  const loginMutation = trpc.auth.loginColaborador.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success("Login realizado com sucesso!");
        // Recarregar a página para atualizar o contexto de autenticação
        window.location.href = "/";
      } else {
        toast.error(result.message || "Credenciais inválidas");
      }
    },
    onError: (error: any) => {
      toast.error(`Erro ao fazer login: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.username || !formData.password) {
      toast.error("Preencha todos os campos");
      return;
    }

    loginMutation.mutate({
      username: formData.username,
      password: formData.password,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
            <Briefcase className="h-8 w-8 text-accent" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold text-primary" style={{ fontFamily: "'Playfair Display', serif" }}>
              Gomes & Silva
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Acesso para Colaboradores
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Usuário
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Digite seu usuário"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={loginMutation.isPending}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Digite sua senha"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                disabled={loginMutation.isPending}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Outros acessos:
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/login-condominio")}
                className="flex-1"
              >
                Síndico
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/login")}
                className="flex-1"
              >
                Admin
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
