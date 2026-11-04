import { httpBatchLink, httpLink, splitLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { DOCUMENTO_CONDOMINIO_PROCEDURE } from "@shared/documentos-condominio";

export function criarLinksTransporteTrpc(url = "/api/trpc") {
  const options = {
    url, transformer: superjson,
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
    },
  };
  return [splitLink<AppRouter>({
    condition: op => op.path === DOCUMENTO_CONDOMINIO_PROCEDURE,
    true: httpLink<AppRouter>(options),
    false: httpBatchLink<AppRouter>(options),
  })];
}
