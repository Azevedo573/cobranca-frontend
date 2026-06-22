/**
 * PermissionRoute.tsx
 *
 * Componente de rota que combina controle por role (allowedRoles) com controle
 * dinâmico por permissão RBAC (para colaboradores e advogados).
 *
 * Lógica:
 * - Se o usuário não estiver logado → redireciona para /login
 * - Se allowedRoles for definido e o role não estiver na lista → redireciona para /
 * - Se requiredModulo for definido E o usuário for colaborador/advogado:
 *     → verifica can(requiredModulo, "visualizar") via usePermissions
 *     → se não tiver permissão → exibe tela de "Acesso negado"
 * - Admin, síndico e cobrador sempre passam (bypass total)
 */
import { Redirect } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePermissions, type Modulo } from "@/hooks/usePermissions";
import { ShieldOff } from "lucide-react";

interface PermissionRouteProps {
  component: React.ComponentType;
  /** Roles que podem acessar a rota. Se omitido, qualquer role autenticado pode acessar. */
  allowedRoles?: string[];
  /** Módulo RBAC necessário para visualizar. Aplicado apenas a colaboradores e advogados. */
  requiredModulo?: Modulo;
}

// Roles que usam o sistema de perfis (não têm bypass total)
const PROFILE_ROLES = ["colaborador", "advogado"];

export default function PermissionRoute({
  component: Component,
  allowedRoles,
  requiredModulo,
}: PermissionRouteProps) {
  const { user, loading } = useAuth();
  const { can, isLoading: permsLoading } = usePermissions();

  // Aguarda carregamento da sessão
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // Não autenticado
  if (!user) return <Redirect to="/login" />;

  // Verifica role permitido
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Redirect to="/" />;
  }

  // Para colaboradores e advogados: verifica permissão RBAC
  if (requiredModulo && PROFILE_ROLES.includes(user.role)) {
    // Aguarda carregamento das permissões
    if (permsLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-muted-foreground">Verificando permissões...</p>
          </div>
        </div>
      );
    }

    // Sem permissão de visualizar o módulo
    if (!can(requiredModulo, "visualizar")) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <ShieldOff className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Acesso negado</h2>
            <p className="text-sm text-muted-foreground">
              Você não tem permissão para acessar este módulo. Entre em contato com o administrador para solicitar acesso.
            </p>
          </div>
        </div>
      );
    }
  }

  return <Component />;
}
