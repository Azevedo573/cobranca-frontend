/**
 * Hook para gerenciar o condomínio selecionado pelo administrador.
 *
 * - Para usuários com role "admin": permite selecionar qualquer condomínio.
 *   O ID selecionado é persistido no localStorage para não perder ao navegar.
 * - Para outros roles (sindico, cobrador): retorna automaticamente o condominioId do usuário.
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const STORAGE_KEY = "admin_selected_condominio_id";

export function useAdminCondominio() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(() => {
    if (!isAdmin) return null;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  // Buscar lista de condomínios (apenas para admin)
  const { data: condominios, isLoading: condominiosLoading } = trpc.condominios.list.useQuery(
    undefined,
    { enabled: isAdmin }
  );

  // Persistir seleção no localStorage
  useEffect(() => {
    if (isAdmin && selectedCondominioId !== null) {
      localStorage.setItem(STORAGE_KEY, String(selectedCondominioId));
    }
  }, [isAdmin, selectedCondominioId]);

  // Auto-selecionar o primeiro condomínio se nenhum estiver selecionado
  useEffect(() => {
    if (isAdmin && condominios && condominios.length > 0 && selectedCondominioId === null) {
      setSelectedCondominioId(condominios[0].id);
    }
  }, [isAdmin, condominios, selectedCondominioId]);

  const condominioId: number | null = isAdmin
    ? selectedCondominioId
    : (user?.condominioId ?? null);

  return {
    condominioId,
    isAdmin,
    condominios: isAdmin ? condominios : undefined,
    condominiosLoading: isAdmin ? condominiosLoading : false,
    selectedCondominioId: isAdmin ? selectedCondominioId : (user?.condominioId ?? null),
    setSelectedCondominioId: isAdmin ? setSelectedCondominioId : undefined,
  };
}
