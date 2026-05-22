/**
 * usePermissions.ts
 *
 * Hook que expõe as permissões RBAC do usuário logado.
 * - Admin, síndico e cobrador: bypass total (can() sempre retorna true)
 * - Colaborador: verifica as permissões do perfil atribuído via profiles.getMyPermissions
 *
 * Uso:
 *   const { can, isLoading } = usePermissions();
 *   if (can("cobrancas", "criar")) { ... }
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export type Modulo =
  | "dashboard"
  | "condominios"
  | "devedores"
  | "cobrancas"
  | "acordos"
  | "tentativas"
  | "importacoes"
  | "banco"
  | "relatorios"
  | "automacao"
  | "juridico"
  | "configuracoes"
  | "usuarios"
  | "perfis"
  | "auditoria";

export type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar" | "aprovar";

// Roles que têm acesso total sem verificação de perfil
const BYPASS_ROLES = ["admin", "sindico", "cobrador"];

export function usePermissions() {
  const { user } = useAuth();

  // Só busca permissões para colaboradores
  const { data: myPerms, isLoading } = trpc.profiles.getMyPermissions.useQuery(undefined, {
    enabled: user?.role === "colaborador",
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  const isAdmin = user?.role === "admin";
  const isSindico = user?.role === "sindico";
  const isColaborador = user?.role === "cobrador" || user?.role === "colaborador";

  /**
   * Verifica se o usuário logado pode executar uma ação em um módulo.
   * Retorna true para roles com bypass total (admin, síndico, cobrador).
   * Para colaboradores, verifica a matriz de permissões do perfil.
   */
  const can = (modulo: Modulo, acao: Acao): boolean => {
    if (!user) return false;

    // Roles com acesso total
    if (BYPASS_ROLES.includes(user.role)) return true;

    // Colaborador (novo role) sem perfil atribuído: sem acesso
    if (!myPerms?.permissoes) return false;

    const permsDoModulo = myPerms.permissoes[modulo];
    if (!permsDoModulo) return false;

    return permsDoModulo[acao] === true;
  };

  /**
   * Verifica se o colaborador pode visualizar um módulo inteiro.
   * Útil para ocultar grupos inteiros no menu.
   */
  const canView = (modulo: Modulo): boolean => can(modulo, "visualizar");

  /**
   * Retorna o nome do perfil do colaborador logado (ou role formatado para outros).
   */
  const profileLabel = (): string => {
    if (!user) return "";
    if (user.role === "admin") return "Administrador";
    if (user.role === "sindico") return "Síndico";
    if (user.role === "cobrador") return "Cobrador";
    return myPerms?.profileNome ?? "Colaborador";
  };

  return {
    // ── RBAC moderno ──────────────────────────────────────────────────────────
    can,
    canView,
    profileLabel,
    isLoading: user?.role === "colaborador" && isLoading,
    hasProfile: user?.role !== "colaborador" || !!myPerms?.profileNome,
    permissoes: myPerms?.permissoes ?? {},

    // ── Compatibilidade retroativa ────────────────────────────────────────────
    user,
    isAdmin,
    isSindico,
    isColaborador,
    canViewCondominios: isAdmin,
    canViewUsuarios: isAdmin,
    canViewImportacao: isAdmin,
    canViewRelatorios: isAdmin,
    canEditTaxas: isAdmin,
    canManageUsers: isAdmin,
    canManageCondominios: isAdmin,
    canViewAllCondominios: isAdmin || isColaborador,
    shouldFilterByCondominio: isSindico,
    condominioId: user?.condominioId,
    roleLabel: isAdmin ? "Administrador" : isSindico ? "Síndico" : "Colaborador",
    roleBadgeColor: isAdmin ? "bg-red-500" : isSindico ? "bg-blue-500" : "bg-green-500",
  };
}
