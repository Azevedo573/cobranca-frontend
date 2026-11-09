import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  acordoCobrancas,
  acordos,
  auditLogs,
  btgCobrancasEmitidas,
  cobrancas,
  parcelasAcordo,
} from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  assertAdministradorTituloBtg,
  carregarTituloBtg,
  erroTituloBtg,
} from "../btg-v2/titulo-contexto";
import { projetarBoletoBtg } from "../btg-v2/boleto-projecao";
import { obterSnapshotBoletoBtg } from "../btg-v2/boleto-snapshot";
import { consultarDadosBoletoBtg } from "../btg-v2/boleto-consulta";
import { montarDadosPdfBtg } from "../btg-v2/boleto-dados";
import {
  validarDadosBancariosBtg,
  validarPixBtg,
} from "../btg-v2/boleto-bancario";
import { gerarBoletoPDF } from "../boleto-pdf";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function dbObrigatorio() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco indisponível.",
    });
  return db;
}
const parcelaInput = z.object({ parcelaId: z.number().int().positive() });
const documentoProcedure = adminProcedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Não foi possível obter o documento bancário. Confira o estado e os dados da emissão.",
    });
  return result;
});
async function gerarDocumento(db: Db, usuarioId: number, parcelaId: number) {
  const preparado = await db.transaction(async tx => {
    await tx
      .select()
      .from(parcelasAcordo)
      .where(eq(parcelasAcordo.id, parcelaId))
      .limit(1)
      .for("share");
    const c = await carregarTituloBtg(tx, usuarioId, parcelaId),
      e = c.emissao;
    if (
      !e ||
      !c.identidadeValida ||
      !c.situacao.pagamentoPermitido ||
      !e.codigoBarras ||
      !e.linhaDigitavel ||
      !e.nossoNumero
    )
      throw erroTituloBtg();
    const validos = validarDadosBancariosBtg({
      codigoBarras: e.codigoBarras,
      linhaDigitavel: e.linhaDigitavel,
      valorCentavos: e.amount,
      vencimento: e.dueDate,
      banco: "208",
    });
    const s = await obterSnapshotBoletoBtg(tx, e, usuarioId, true);
    if (!s)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Histórico documental indisponível; não foi utilizado o cadastro atual como snapshot.",
      });
    const plano = await tx
      .select()
      .from(parcelasAcordo)
      .where(eq(parcelasAcordo.acordoId, c.acordo.id));
    const origem = await tx
      .select({
        cobrancaId: acordoCobrancas.cobrancaId,
        valorOriginal: acordoCobrancas.valorOriginal,
        titulo: cobrancas.description,
        vencimento: cobrancas.dueDate,
      })
      .from(acordoCobrancas)
      .leftJoin(
        cobrancas,
        and(
          eq(cobrancas.id, acordoCobrancas.cobrancaId),
          eq(cobrancas.condominioId, c.acordo.condominioId),
          eq(cobrancas.devedorId, c.acordo.devedorId)
        )
      )
      .where(eq(acordoCobrancas.acordoId, c.acordo.id));
    let pix: string | undefined;
    if (e.pixCopiaECola) {
      try {
        pix = validarPixBtg(e.pixCopiaECola);
      } catch {
        /* Pix inválido não é inventado no PDF. */
      }
    }
    const dados = montarDadosPdfBtg(
      c,
      s,
      plano,
      origem,
      validos.codigoBarras,
      validos.linhaDigitavel,
      pix
    );
    return {
      dados,
      emissaoId: e.id,
      revisao: e.revisao,
      condominioId: e.condominioId,
      parcelaId: c.parcela.id,
    };
  });
  // Geração local pura: nenhuma rede, configuração CNAB, armazenamento público ou conciliação.
  const bytes = await gerarBoletoPDF(preparado.dados);
  await db.transaction(async tx => {
    await tx
      .select()
      .from(btgCobrancasEmitidas)
      .where(eq(btgCobrancasEmitidas.id, preparado.emissaoId))
      .limit(1)
      .for("share");
    const c = await carregarTituloBtg(tx, usuarioId, parcelaId);
    if (
      !c.identidadeValida ||
      !c.situacao.pagamentoPermitido ||
      c.emissao?.id !== preparado.emissaoId ||
      c.emissao.revisao !== preparado.revisao ||
      c.emissao.amount !== preparado.dados.valor ||
      c.emissao.dueDate.getTime() !==
        preparado.dados.dataVencimento.getTime() ||
      !c.emissao.codigoBarras ||
      !c.emissao.linhaDigitavel ||
      c.emissao.nossoNumero !== preparado.dados.nossoNumero ||
      (preparado.dados.pixCopiaCola &&
        c.emissao.pixCopiaECola !== preparado.dados.pixCopiaCola)
    )
      throw erroTituloBtg();
    const final = validarDadosBancariosBtg({
      codigoBarras: c.emissao.codigoBarras,
      linhaDigitavel: c.emissao.linhaDigitavel,
      valorCentavos: c.emissao.amount,
      vencimento: c.emissao.dueDate,
      banco: "208",
    });
    if (
      final.codigoBarras !== preparado.dados.pagamentoBancario?.codigoBarras ||
      final.linhaDigitavel !== preparado.dados.pagamentoBancario?.linhaDigitavel
    )
      throw erroTituloBtg();
    await tx
      .insert(auditLogs)
      .values({
        userId: usuarioId,
        userRole: "admin",
        action: "config_change",
        entity: "configuracao",
        entityId: `btg-boleto:${preparado.emissaoId}`,
        condominioId: preparado.condominioId,
        metadata: JSON.stringify({
          evento: "pdf_btg_gerado",
          emissaoId: preparado.emissaoId,
          revisao: preparado.revisao,
          parcelaId,
        }),
        success: 1,
        severity: "info",
        ipAddress: "unknown",
      });
  });
  return {
    parcelaId,
    base64: bytes.toString("base64"),
    nomeArquivo: `boleto-btg-parcela-${parcelaId}-r${preparado.revisao}.pdf`,
    mimeType: "application/pdf" as const,
  };
}

export const btgBoletosRouter = router({
  situacaoParcela: documentoProcedure
    .input(parcelaInput)
    .query(async ({ ctx, input }) => {
      const db = await dbObrigatorio();
      return db.transaction(async tx =>
        projetarBoletoBtg(
          tx,
          await carregarTituloBtg(tx, ctx.user.id, input.parcelaId),
          ctx.user.id
        )
      );
    }),
  listarAcordo: documentoProcedure
    .input(z.object({ acordoId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await dbObrigatorio();
      return db.transaction(async tx => {
        await assertAdministradorTituloBtg(tx, ctx.user.id);
        const [a] = await tx
          .select()
          .from(acordos)
          .where(eq(acordos.id, input.acordoId))
          .limit(1);
        if (!a) throw erroTituloBtg();
        const ps = await tx
          .select()
          .from(parcelasAcordo)
          .where(eq(parcelasAcordo.acordoId, input.acordoId));
        const parcelas = [];
        for (const p of ps)
          parcelas.push(
            await projetarBoletoBtg(
              tx,
              await carregarTituloBtg(tx, ctx.user.id, p.id),
              ctx.user.id
            )
          );
        return { acordoId: input.acordoId, parcelas };
      });
    }),
  consultarDados: documentoProcedure
    .input(parcelaInput)
    .mutation(async ({ ctx, input }) =>
      consultarDadosBoletoBtg({
        db: await dbObrigatorio(),
        usuarioId: ctx.user.id,
        parcelaId: input.parcelaId,
      })
    ),
  gerarPdf: documentoProcedure
    .input(parcelaInput)
    .mutation(async ({ ctx, input }) =>
      gerarDocumento(await dbObrigatorio(), ctx.user.id, input.parcelaId)
    ),
  gerarLote: documentoProcedure
    .input(
      z.object({
        acordoId: z.number().int().positive(),
        parcelaIds: z.array(z.number().int().positive()).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await dbObrigatorio(),
        ids = Array.from(new Set(input.parcelaIds));
      await db.transaction(async tx => {
        await assertAdministradorTituloBtg(tx, ctx.user.id);
        for (const id of ids) {
          const c = await carregarTituloBtg(tx, ctx.user.id, id);
          if (c.acordo.id !== input.acordoId) throw erroTituloBtg();
        }
      });
      const itens = [];
      for (const id of ids) {
        try {
          itens.push({
            ok: true as const,
            ...(await gerarDocumento(db, ctx.user.id, id)),
          });
        } catch {
          itens.push({
            ok: false as const,
            parcelaId: id,
            mensagem:
              "Documento indisponível; confira a situação e os dados da emissão.",
          });
        }
      }
      return { itens };
    }),
});
