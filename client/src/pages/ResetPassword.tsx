import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";

// ── Utilitários de força de senha ────────────────────────────────────────────

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0=vazio, 1=fraca, 2=razoável, 3=boa, 4=forte
  label: string;
  color: string;
  barColor: string;
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasNumber: boolean;
    hasSpecial: boolean;
  };
}

function evaluatePassword(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
  };

  if (!password) {
    return { score: 0, label: "", color: "text-muted-foreground", barColor: "bg-muted", checks };
  }

  const passed = Object.values(checks).filter(Boolean).length;

  if (passed <= 1) return { score: 1, label: "Fraca", color: "text-red-500", barColor: "bg-red-500", checks };
  if (passed === 2) return { score: 2, label: "Razoável", color: "text-orange-500", barColor: "bg-orange-500", checks };
  if (passed === 3) return { score: 3, label: "Boa", color: "text-yellow-500", barColor: "bg-yellow-500", checks };
  return { score: 4, label: "Forte", color: "text-green-500", barColor: "bg-green-500", checks };
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => evaluatePassword(newPassword), [newPassword]);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  // Validar token ao montar
  const tokenQuery = trpc.auth.validateResetToken.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const resetMutation = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setDone(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (strength.score < 4 || !passwordsMatch) return;
    resetMutation.mutate({ token, newPassword });
  };

  const allChecksPassed = Object.values(strength.checks).every(Boolean);

  // ── Token inválido / expirado ─────────────────────────────────────────────
  if (!token || (tokenQuery.data && !tokenQuery.data.valid)) {
    const reason = tokenQuery.data?.reason;
    const isExpired = reason === "TOKEN_EXPIRED";
    const isUsed = reason === "TOKEN_USED";

    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-accent/20">
          <CardHeader className="space-y-4 text-center pb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-primary" style={{ fontFamily: "'Playfair Display', serif" }}>
                {isExpired ? "Link expirado" : isUsed ? "Link já utilizado" : "Link inválido"}
              </CardTitle>
              <CardDescription className="text-sm mt-2">
                {isExpired
                  ? "Este link de recuperação expirou após 15 minutos."
                  : isUsed
                  ? "Este link já foi utilizado para redefinir a senha."
                  : "O link de recuperação é inválido ou foi adulterado."}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => navigate("/esqueci-senha")}
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Solicitar novo link
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/login-condominio")}
              className="w-full"
            >
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl border-accent/20">
          <CardHeader className="space-y-4 text-center pb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-primary" style={{ fontFamily: "'Playfair Display', serif" }}>
                Senha redefinida com sucesso
              </CardTitle>
              <CardDescription className="text-sm mt-2">
                Sua nova senha foi salva. Você já pode fazer login.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate("/login-condominio")}
              className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground text-base font-semibold"
            >
              Ir para o login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Formulário de redefinição ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <Card className="shadow-2xl border-accent/20">
          <CardHeader className="space-y-4 text-center pb-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-accent" />
            </div>
            <div>
              <CardTitle
                className="text-2xl font-bold text-primary"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Criar nova senha
              </CardTitle>
              <CardDescription className="text-sm mt-2">
                Escolha uma senha segura para a sua conta
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Nova senha */}
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Nova senha
                </Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    placeholder="Digite a nova senha"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={resetMutation.isPending}
                    autoComplete="new-password"
                    className="h-12 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Barra de força */}
                {newPassword.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                            strength.score >= level ? strength.barColor : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-xs font-medium ${strength.color}`}>
                      {strength.label}
                    </p>
                  </div>
                )}

                {/* Checklist de requisitos */}
                <ul className="space-y-1 mt-2">
                  {[
                    { key: "minLength", label: "Mínimo 8 caracteres" },
                    { key: "hasUpper", label: "Letra maiúscula (A-Z)" },
                    { key: "hasNumber", label: "Número (0-9)" },
                    { key: "hasSpecial", label: "Caractere especial (!@#$...)" },
                  ].map(({ key, label }) => {
                    const ok = strength.checks[key as keyof typeof strength.checks];
                    return (
                      <li key={key} className={`flex items-center gap-2 text-xs transition-colors ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Confirmar senha */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Confirmar nova senha
                </Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={resetMutation.isPending}
                    autoComplete="new-password"
                    className={`h-12 pr-10 transition-colors ${
                      passwordsMismatch
                        ? "border-red-400 focus-visible:ring-red-400"
                        : passwordsMatch
                        ? "border-green-400 focus-visible:ring-green-400"
                        : ""
                    }`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordsMismatch && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> As senhas não coincidem
                  </p>
                )}
                {passwordsMatch && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> As senhas coincidem
                  </p>
                )}
              </div>

              {/* Erro da mutation */}
              {resetMutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">
                  {resetMutation.error.message === "TOKEN_EXPIRED"
                    ? "O link expirou. Solicite um novo link de recuperação."
                    : resetMutation.error.message === "TOKEN_INVALID"
                    ? "Link inválido. Solicite um novo link de recuperação."
                    : "Ocorreu um erro ao redefinir a senha. Tente novamente."}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-accent hover:bg-accent/90 text-accent-foreground text-base font-semibold"
                disabled={
                  resetMutation.isPending ||
                  !allChecksPassed ||
                  !passwordsMatch
                }
              >
                {resetMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                    Salvando...
                  </span>
                ) : (
                  "Salvar nova senha"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Sistema de Gestão de Cobranças Condominiais — Gomes &amp; Silva
        </p>
      </div>
    </div>
  );
}
