import { trpc } from "@/lib/trpc";

/**
 * Hook para controlar permissões e visibilidade de UI baseado no papel do usuário
 */
export function usePermissions() {
  const { data: user } = trpc.auth.me.useQuery();

  const isAdmin = user?.role === "admin";
  const isSindico = user?.role === "sindico";
  const isColaborador = user?.role === "cobrador";

  return {
    user,
    isAdmin,
    isSindico,
    isColaborador,
    
    // Permissões de visualização de menus
    canViewCondominios: isAdmin,
    canViewUsuarios: isAdmin,
    canViewImportacao: isAdmin,
    canViewRelatorios: isAdmin,
    
    // Permissões de ações
    canEditTaxas: isAdmin,
    canManageUsers: isAdmin,
    canManageCondominios: isAdmin,
    canViewAllCondominios: isAdmin || isColaborador,
    
    // Filtros de dados
    shouldFilterByCondominio: isSindico,
    condominioId: user?.condominioId,
    
    // Labels para UI
    roleLabel: isAdmin ? "Administrador" : isSindico ? "Síndico" : "Colaborador",
    roleBadgeColor: isAdmin ? "bg-red-500" : isSindico ? "bg-blue-500" : "bg-green-500",
  };
}
