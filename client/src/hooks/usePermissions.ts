/**
 * usePermissions.ts
 *
 * Hook que expõe as permissões RBAC do usuário logado.
 * - Admin, síndico e cobrador: bypass total (can() sempre retorna true)
 * - Colaborador e Advogado: verifica as permissões do perfil atribuído via profiles.getMyPermissions
 *
 * Uso:
 *   const { can, isLoading } = usePermissions();
 *   if (can("juridico", "criar")) { ... }
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
  // Submódulos jurídicos granulares
  | "juridico_processos"
  | "juridico_prazos"
  | "juridico_demandas"
  | "juridico_assembleias"
  | "juridico_intimacoes"
  | "juridico_publicacoes"
  | "juridico_config"
  | "modelos_documento"
  | "whatsapp"
  | "configuracoes"
  | "usuarios"
  | "perfis"
  | "auditoria";

export type Acao = "visualizar" | "criar" | "editar" | "excluir" | "exportar" | "aprovar";

// Roles que têm acesso total sem verificação de perfil
const BYPASS_ROLES = ["admin", "sindico", "cobrador"];

// Roles que usam o sistema de perfis para controle granular
const PROFILE_ROLES = ["colaborador", "advogado"];

export function usePermissions() {
  const { user } = useAuth();

  // Busca permissões para colaboradores e advogados
  const { data: myPerms, isLoading } = trpc.profiles.getMyPermissions.useQuery(undefined, {
    enabled: !!user && PROFILE_ROLES.includes(user.role),
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  const isAdmin = user?.role === "admin";
  const isSindico = user?.role === "sindico";
  const isColaborador = user?.role === "cobrador" || user?.role === "colaborador";
  const isAdvogado = user?.role === "advogado";

  /**
   * Verifica se o usuário logado pode executar uma ação em um módulo.
   * Retorna true para roles com bypass total (admin, síndico, cobrador).
   * Para colaboradores e advogados, verifica a matriz de permissões do perfil.
   */
  const can = (modulo: Modulo, acao: Acao): boolean => {
    if (!user) return false;

    // Roles com acesso total
    if (BYPASS_ROLES.includes(user.role)) return true;

    // Colaborador/Advogado sem perfil atribuído: sem acesso
    if (!myPerms?.permissoes) return false;

    const permsDoModulo = myPerms.permissoes[modulo];
    if (!permsDoModulo) return false;

    return permsDoModulo[acao] === true;
  };

  /**
   * Verifica se o usuário pode visualizar um módulo inteiro.
   * Útil para ocultar grupos inteiros no menu.
   */
  const canView = (modulo: Modulo): boolean => can(modulo, "visualizar");

  /**
   * Retorna o nome do perfil do usuário logado (ou role formatado para outros).
   */
  const profileLabel = (): string => {
    if (!user) return "";
    if (user.role === "admin") return "Administrador";
    if (user.role === "sindico") return "Síndico";
    if (user.role === "cobrador") return "Cobrador";
    if (user.role === "advogado") return myPerms?.profileNome ?? "Advogado";
    return myPerms?.profileNome ?? "Colaborador";
  };

  return {
    // ── RBAC moderno ──────────────────────────────────────────────────────────
    can,
    canView,
    profileLabel,
    isLoading: !!user && PROFILE_ROLES.includes(user.role) && isLoading,
    hasProfile: !user || !PROFILE_ROLES.includes(user.role) || !!myPerms?.profileNome,
    permissoes: myPerms?.permissoes ?? {},

    // ── Compatibilidade retroativa ────────────────────────────────────────────
    user,
    isAdmin,
    isSindico,
    isAdvogado,
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
    roleLabel: isAdmin ? "Administrador" : isSindico ? "Síndico" : isAdvogado ? "Advogado" : "Colaborador",
    roleBadgeColor: isAdmin ? "bg-red-500" : isSindico ? "bg-blue-500" : isAdvogado ? "bg-purple-500" : "bg-green-500",
  };
}
