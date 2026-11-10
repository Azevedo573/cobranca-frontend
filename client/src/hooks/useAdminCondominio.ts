/**
 * Contexto de condomínio selecionado.
 *
 * Admin visualiza todos os condomínios; os demais usuários recebem do servidor
 * somente seus vínculos ativos. A seleção é uma preferência de interface: cada
 * procedure continua validando o vínculo no backend.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const storageKey = (userId?: number) => `selected_condominio_id_${userId ?? "anon"}`;

export function useAdminCondominio() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const identityKey = JSON.stringify(user ? [user.id, user.role, user.condominioId, user.escopoCondominios] : null);
  const freshness = useRef({ identityKey, after: Date.now() });
  if (freshness.current.identityKey !== identityKey) freshness.current = { identityKey, after: Date.now() };
  const [selection, setSelection] = useState<{ identityKey: string; id: number | null }>({ identityKey, id: null });

  const { data, dataUpdatedAt, isLoading, isFetching, refetch } = trpc.condominios.list.useQuery(
    undefined,
    { enabled: !!user, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: "always" },
  );
  const isFresh = !!user && dataUpdatedAt >= freshness.current.after;
  const condominios = isFresh ? data : undefined;
  const selectedCondominioId = selection.identityKey === identityKey && condominios?.some(item => item.id === selection.id)
    ? selection.id : null;
  const condominiosLoading = !!user && (isLoading || !isFresh || isFetching);

  useEffect(() => {
    if (user) void refetch();
  }, [identityKey, refetch]);

  const setSelectedCondominioId = useCallback((id: number | null) => {
    const validId = id !== null && condominios?.some(item => item.id === id) ? id : null;
    setSelection({ identityKey, id: validId });
    if (!user) return;
    try {
      if (validId === null) localStorage.removeItem(storageKey(user.id));
      else localStorage.setItem(storageKey(user.id), String(validId));
    } catch { /* seleção funciona mesmo sem storage */ }
  }, [condominios, identityKey, user]);

  useEffect(() => {
    if (!user) { setSelection({ identityKey, id: null }); return; }
    if (!condominios) return;
    if (!condominios.length) { setSelectedCondominioId(null); return; }
    if (selectedCondominioId !== null) return;
    let idSalvo: number | null = null;
    try { idSalvo = Number(localStorage.getItem(storageKey(user.id))) || null; } catch { /* sem storage */ }
    const candidato = idSalvo && condominios.some((condominio) => condominio.id === idSalvo)
      ? idSalvo
      : (user.condominioId && condominios.some((condominio) => condominio.id === user.condominioId)
        ? user.condominioId
        : condominios[0].id);
    setSelectedCondominioId(candidato);
  }, [condominios, identityKey, selectedCondominioId, setSelectedCondominioId, user]);

  const podeSelecionarCondominio = Boolean(isAdmin || (condominios?.length ?? 0) > 1);

  return {
    condominioId: selectedCondominioId,
    isAdmin,
    podeSelecionarCondominio,
    condominios,
    condominiosLoading,
    selectedCondominioId,
    setSelectedCondominioId,
  };
}
