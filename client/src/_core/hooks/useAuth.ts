import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const previousIdentity = useRef<string | undefined>(undefined);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });

  useEffect(() => {
    // Remove a projeção antiga (role, escopo e perfil não são estado persistível).
    try { window.localStorage.removeItem("manus-runtime-user-info"); } catch { /* storage indisponível */ }
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const key = event.mutation.options.mutationKey?.[0];
      if (!Array.isArray(key) || !["users", "profiles"].includes(String(key[0]))) return;
      void utils.auth.me.invalidate();
      void utils.condominios.list.invalidate();
      void utils.profiles.getMyPermissions.invalidate();
    });
  }, [queryClient, utils]);

  useEffect(() => {
    if (meQuery.data === undefined) return;
    const user = meQuery.data;
    const identity = JSON.stringify(user ? [user.id, user.role, user.profileId, user.condominioId, user.escopoCondominios, user.isActive, user.isDeleted] : null);
    if (identity !== previousIdentity.current) {
      previousIdentity.current = identity;
      void utils.condominios.list.invalidate();
      void utils.profiles.getMyPermissions.invalidate();
    }
  }, [meQuery.data, utils]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
