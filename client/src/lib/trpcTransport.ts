import { httpBatchLink, httpLink, splitLink, type TRPCLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { DOCUMENTO_CONDOMINIO_PROCEDURE } from "@shared/documentos-condominio";
import { criarFetchComProgresso, type CallbacksUpload } from "./uploadComProgresso";

export function criarLinksTransporteTrpc(url = "/api/trpc") {
  const options = {
    url, transformer: superjson,
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
    },
  };
  const uploadLink: TRPCLink<AppRouter> = runtime => ({ op, next }) => {
    // Contexto permanece no cliente: callbacks não entram no JSON/headers.
    const progresso = (op.context.documentoUpload ?? {}) as CallbacksUpload;
    const fetchUpload = criarFetchComProgresso(progresso);
    return httpLink<AppRouter>({ ...options,
      fetch: (input, init) => fetchUpload(input, { ...(init ?? {}), credentials: "include" }),
    })(runtime)({ op, next });
  };
  return [splitLink<AppRouter>({
    condition: op => op.path === DOCUMENTO_CONDOMINIO_PROCEDURE,
    true: uploadLink,
    false: httpBatchLink<AppRouter>(options),
  })];
}
