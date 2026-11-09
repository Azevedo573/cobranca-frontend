import { and, eq } from "drizzle-orm";
import {
  acordos,
  auditLogs,
  btgBoletoSnapshots,
  btgCobrancasEmitidas,
  btgHttpDiagnosticos,
  condominios,
  parcelasAcordo,
} from "../../drizzle/schema";
import type { BtgTransaction } from "./manual-producao";
import {
  aadDiagnosticoBtg,
  decifrarDiagnosticoBtg,
} from "./diagnosticos-crypto";
import {
  aadSnapshotBoletoBtg,
  cifrarSnapshotBoletoBtg,
  decifrarSnapshotBoletoBtg,
  hashBoletoBtg,
  snapshotDoPedidoBtg,
  type SnapshotBoletoBtg,
} from "./boleto-snapshot-dominio";
import type { EmissaoTituloBtg } from "./titulo-contexto";

export async function registrarSnapshotDoPedidoBtg(
  tx: BtgTransaction,
  e: EmissaoTituloBtg,
  body: string,
  usuarioId: number,
  diagnosticoId: number | null = null
): Promise<void> {
  const [existente] = await tx
    .select()
    .from(btgBoletoSnapshots)
    .where(eq(btgBoletoSnapshots.btgCobrancaEmitidaId, e.id))
    .limit(1);
  if (existente) {
    if (existente.payloadSha256 !== hashBoletoBtg(body))
      throw new Error("Snapshot existente incompatível.");
    return;
  }
  let snapshot: SnapshotBoletoBtg | null = null;
  try {
    snapshot = snapshotDoPedidoBtg(body, e);
  } catch {
    /* Pedido parcial nunca será completado com cadastro atual. */
  }
  if (snapshot) {
    const [p] = await tx
      .select()
      .from(parcelasAcordo)
      .where(eq(parcelasAcordo.id, e.origemId))
      .limit(1);
    const [a] = p
      ? await tx
          .select()
          .from(acordos)
          .where(eq(acordos.id, p.acordoId))
          .limit(1)
      : [];
    const [c] = a
      ? await tx
          .select()
          .from(condominios)
          .where(eq(condominios.id, a.condominioId))
          .limit(1)
      : [];
    if (a && c && a.condominioId === e.condominioId) {
      const plano = await tx
        .select()
        .from(parcelasAcordo)
        .where(eq(parcelasAcordo.acordoId, a.id));
      snapshot.contextoAcordo = {
        acordoId: a.id,
        totalNegociado: a.agreedAmount,
        credorTitulo: c.name,
        parcelas: plano.map(p => ({
          id: p.id,
          installmentNumber: p.installmentNumber,
          amount: p.amount,
          dueDate: p.dueDate.toISOString(),
          status: p.status,
        })),
      };
    }
  }
  const json = snapshot ? JSON.stringify(snapshot) : null;
  await tx
    .insert(btgBoletoSnapshots)
    .values({
      btgCobrancaEmitidaId: e.id,
      btgIntegracaoId: e.btgIntegracaoId,
      parcelaAcordoId: e.origemId,
      condominioId: e.condominioId,
      revisao: e.revisao,
      diagnosticoId,
      usuarioId,
      estado: snapshot ? "completo" : "incompleto",
      dadosCifrados: snapshot ? cifrarSnapshotBoletoBtg(snapshot, e) : null,
      dadosSha256: json ? hashBoletoBtg(json) : null,
      payloadSha256: hashBoletoBtg(body),
      criadoEm: new Date(),
    });
  await tx
    .insert(auditLogs)
    .values({
      userId: usuarioId,
      userRole: "admin",
      action: "config_change",
      entity: "configuracao",
      entityId: `btg-boleto-snapshot:${e.id}`,
      condominioId: e.condominioId,
      metadata: JSON.stringify({
        evento: "snapshot_registrado",
        emissaoId: e.id,
        revisao: e.revisao,
        completo: !!snapshot,
      }),
      success: 1,
      severity: "info",
      ipAddress: "unknown",
    });
}

/** Só deriva captura passada ainda íntegra/vigente. Não usa cadastro atual para pagador. */
export async function obterSnapshotBoletoBtg(
  tx: BtgTransaction,
  e: EmissaoTituloBtg,
  usuarioId: number,
  permitirDerivar: boolean
): Promise<SnapshotBoletoBtg | null> {
  const [row] = await tx
    .select()
    .from(btgBoletoSnapshots)
    .where(eq(btgBoletoSnapshots.btgCobrancaEmitidaId, e.id))
    .limit(1);
  if (row) {
    if (
      row.btgIntegracaoId !== e.btgIntegracaoId ||
      row.condominioId !== e.condominioId ||
      row.parcelaAcordoId !== e.origemId ||
      row.revisao !== e.revisao ||
      row.estado !== "completo" ||
      !row.dadosCifrados ||
      !row.dadosSha256
    )
      return null;
    return decifrarSnapshotBoletoBtg(row.dadosCifrados, row.dadosSha256, e);
  }
  const [d] = await tx
    .select()
    .from(btgHttpDiagnosticos)
    .where(
      and(
        eq(btgHttpDiagnosticos.btgCobrancaEmitidaId, e.id),
        eq(btgHttpDiagnosticos.parcelaAcordoId, e.origemId)
      )
    )
    .limit(1);
  if (
    !d ||
    d.btgIntegracaoId !== e.btgIntegracaoId ||
    d.condominioId !== e.condominioId ||
    d.conteudoExpurgadoEm ||
    !d.payloadCifrado ||
    d.respostaCompleta !== 1 ||
    !d.httpStatus ||
    d.httpStatus < 200 ||
    d.httpStatus >= 300
  )
    return null;
  const idade = Date.now() - d.capturaCriadaEm.getTime();
  if (!Number.isFinite(idade) || idade < 0 || idade > 30 * 24 * 60 * 60 * 1000)
    return null;
  const bytes = decifrarDiagnosticoBtg(d.payloadCifrado, aadDiagnosticoBtg(d));
  if (
    hashBoletoBtg(bytes) !== d.payloadSha256 ||
    bytes.length !== d.payloadBytes
  )
    throw new Error("Captura documental inválida.");
  // Sem contexto original do acordo no request: não atribuir dados atuais como snapshot.
  const s = snapshotDoPedidoBtg(bytes.toString("utf8"), e);
  if (!permitirDerivar) return s;
  const json = JSON.stringify(s);
  await tx
    .insert(btgBoletoSnapshots)
    .values({
      btgCobrancaEmitidaId: e.id,
      btgIntegracaoId: e.btgIntegracaoId,
      parcelaAcordoId: e.origemId,
      condominioId: e.condominioId,
      revisao: e.revisao,
      diagnosticoId: d.id,
      usuarioId,
      estado: "completo",
      dadosCifrados: cifrarSnapshotBoletoBtg(s, e),
      dadosSha256: hashBoletoBtg(json),
      payloadSha256: d.payloadSha256,
      criadoEm: new Date(),
    });
  await tx
    .insert(auditLogs)
    .values({
      userId: usuarioId,
      userRole: "admin",
      action: "config_change",
      entity: "configuracao",
      entityId: `btg-boleto-snapshot:${e.id}`,
      condominioId: e.condominioId,
      metadata: JSON.stringify({
        evento: "snapshot_derivado_captura",
        emissaoId: e.id,
        diagnosticoId: d.id,
      }),
      success: 1,
      severity: "info",
      ipAddress: "unknown",
    });
  return s;
}
