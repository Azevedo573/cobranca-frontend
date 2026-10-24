/**
 * Contexto de condomínio selecionado.
 *
 * Admin visualiza todos os condomínios; os demais usuários recebem do servidor
 * somente seus vínculos ativos. A seleção é uma preferência de interface: cada
 * procedure continua validando o vínculo no backend.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const storageKey = (userId?: number) => `selected_condominio_id_${userId ?? "anon"}`;

export function useAdminCondominio() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(() => {
    if (!user) return null;
    const saved = localStorage.getItem(storageKey(user.id));
    return saved ? parseInt(saved, 10) : (user.condominioId ?? null);
  });

  const { data: condominios, isLoading: condominiosLoading } = trpc.condominios.list.useQuery(
    undefined,
    { enabled: !!user },
  );

  useEffect(() => {
    if (!user || !condominios?.length) return;
    const salvo = localStorage.getItem(storageKey(user.id));
    const idSalvo = salvo ? parseInt(salvo, 10) : null;
    const candidato = idSalvo && condominios.some((condominio) => condominio.id === idSalvo)
      ? idSalvo
      : (user.condominioId && condominios.some((condominio) => condominio.id === user.condominioId)
        ? user.condominioId
        : condominios[0].id);
    if (selectedCondominioId !== candidato) setSelectedCondominioId(candidato);
  }, [condominios, selectedCondominioId, user]);

  useEffect(() => {
    if (user && selectedCondominioId !== null) {
      localStorage.setItem(storageKey(user.id), String(selectedCondominioId));
    }
  }, [selectedCondominioId, user]);

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
