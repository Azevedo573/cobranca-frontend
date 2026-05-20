import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, KeyRound, Mail, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function ForgotPassword() {
  const [, navigate] = useLocation();
  const [identifier, setIdentifier] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: () => {
      // Mesmo em caso de erro interno, mostrar a mensagem genérica
      // para não revelar informações sobre o sistema
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    requestMutation.mutate({ identifier: identifier.trim() });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">

        {/* Back link */}
        <button
          onClick={() => navigate("/login-condominio")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao login
        </button>

        <Card className="shadow-2xl border-accent/20">
          <CardHeader className="space-y-4 text-center pb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
              {submitted ? (
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              ) : (
                <KeyRound className="w-8 h-8 text-accent" />
              )}
            </div>
            <div>
              <CardTitle
                className="text-2xl font-bold text-primary"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {submitted ? "E-mail enviado" : "Esqueceu sua senha?"}
              </CardTitle>
              <CardDescription className="text-sm mt-2">
                {submitted
                  ? "Verifique sua caixa de entrada"
                  : "Informe seu e-mail ou usuário para receber o link de recuperação"}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {submitted ? (
              /* ── Estado de sucesso ── */
              <div className="space-y-6">
                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4 text-sm text-green-800 dark:text-green-300 leading-relaxed">
                  Se existir uma conta vinculada a este e-mail ou usuário, enviaremos
                  um link para redefinição de senha. O link é válido por{" "}
                  <strong>15 minutos</strong>.
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Não recebeu o e-mail? Verifique a pasta de spam ou{" "}
                  <button
                    onClick={() => setSubmitted(false)}
                    className="text-primary underline hover:no-underline"
                  >
                    tente novamente
                  </button>
                  .
                </p>

                <Button
                  onClick={() => navigate("/login-condominio")}
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                >
                  Voltar ao login
                </Button>
              </div>
            ) : (
              /* ── Formulário ── */
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="identifier" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    E-mail ou usuário
                  </Label>
                  <Input
                    id="identifier"
                    type="text"
                    placeholder="seu@email.com ou nome.usuario"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    disabled={requestMutation.isPending}
                    autoComplete="email"
                    autoFocus
                    className="h-12"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o e-mail ou nome de usuário cadastrado na sua conta.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground text-base font-semibold"
                  disabled={requestMutation.isPending || !identifier.trim()}
                >
                  {requestMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                      Enviando...
                    </span>
                  ) : (
                    "Enviar link de recuperação"
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Lembrou sua senha?{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/login-condominio")}
                    className="text-primary underline hover:no-underline"
                  >
                    Fazer login
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Sistema de Gestão de Cobranças Condominiais — Gomes &amp; Silva
        </p>
      </div>
    </div>
  );
}
