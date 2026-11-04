import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { condominios } from "../drizzle/schema";
import { getDb } from "./db";

export type TipoDocumentoCondominio = "convencao" | "regimento";

export function campoDocumentoCondominio(tipo: TipoDocumentoCondominio) {
  return tipo === "convencao" ? "juridicoConvencaoUrl" : "juridicoRegimentoUrl";
}

/** Troca somente o vínculo; os objetos físicos anteriores permanecem no storage. */
export async function trocarUrlDocumentoCondominio(
  id: number,
  tipo: TipoDocumentoCondominio,
  urlEsperada: string | null,
  novaUrl: string | null,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
  const campo = campoDocumentoCondominio(tipo);
  // O lock é curto: upload e chamadas externas NÃO acontecem nesta transação.
  return db.transaction(async tx => {
    const [atual] = await tx.select({ url: condominios[campo] }).from(condominios)
      .where(eq(condominios.id, id)).limit(1).for("update");
    if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Condomínio não encontrado." });
    const urlAtual = atual.url || null;
    if (urlAtual !== (urlEsperada || null)) {
      throw new TRPCError({ code: "CONFLICT", message: "O documento foi alterado em outra sessão. Atualize a página antes de tentar novamente." });
    }
    await tx.update(condominios).set({ [campo]: novaUrl }).where(eq(condominios.id, id));
    return { urlAnterior: urlAtual, url: novaUrl };
  });
}
