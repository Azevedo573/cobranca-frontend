/** Valores em centavos. Esta camada nunca recalcula encargos ou altera títulos. */
export interface VinculoOrigemDocumento {
  cobrancaId: number;
  valorOriginal: number | null;
  titulo: string | null;
  vencimento: Date | null;
}
export interface SnapshotOrigemDocumento {
  snapshotPrincipal?: number | null;
  snapshotJuros?: number | null;
  snapshotMulta?: number | null;
  snapshotCorrecao?: number | null;
  snapshotHonorarios?: number | null;
  snapshotValorAtualizado?: number | null;
}
export interface OrigemDividaDocumento {
  itens: { cobrancaId: number; titulo: string; vencimento: Date | null; principal: number | null }[];
  quantidade: number;
  primeiroVencimento: Date | null;
  ultimoVencimento: Date | null;
  principal: number | null;
  juros: number | null;
  multa: number | null;
  correcao: number | null;
  honorarios: number | null;
  /** Base bruta dos títulos na formalização, antes dos ajustes da negociação. */
  totalFechamento: number | null;
  avisos: string[];
}
const valorValido = (valor: unknown): valor is number => typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0;
const CAMPOS_SNAPSHOT = ["snapshotPrincipal", "snapshotJuros", "snapshotMulta", "snapshotCorrecao", "snapshotHonorarios", "snapshotValorAtualizado"] as const;

export function montarOrigemDividaAcordo(vinculos: VinculoOrigemDocumento[], snapshots: SnapshotOrigemDocumento[]): OrigemDividaDocumento {
  const porId = new Map<number, OrigemDividaDocumento["itens"][number]>();
  const avisos: string[] = [];
  for (const vinculo of vinculos) {
    // Gravadores antigos podem registrar zero quando a cobrança não foi encontrada.
    const principal = valorValido(vinculo.valorOriginal) && vinculo.valorOriginal > 0 ? vinculo.valorOriginal : null;
    if (!vinculo.titulo?.trim()) avisos.push("Há cobranças sem descrição disponível no cadastro vinculado.");
    const anterior = porId.get(vinculo.cobrancaId);
    if (anterior) {
      if (anterior.principal !== principal) {
        anterior.principal = null;
        avisos.push("Vínculos de origem com valores divergentes; composição requer conferência.");
      }
      continue;
    }
    porId.set(vinculo.cobrancaId, {
      cobrancaId: vinculo.cobrancaId,
      titulo: vinculo.titulo?.trim() || `Cobrança #${vinculo.cobrancaId} — descrição indisponível`,
      vencimento: vinculo.vencimento && Number.isFinite(new Date(vinculo.vencimento).getTime()) ? new Date(vinculo.vencimento) : null,
      principal,
    });
  }
  const itens = Array.from(porId.values()).sort((a, b) =>
    (a.vencimento?.getTime() ?? Infinity) - (b.vencimento?.getTime() ?? Infinity) || a.cobrancaId - b.cobrancaId);
  const datas = itens.map(i => i.vencimento?.getTime()).filter((d): d is number => d != null);
  const principal = itens.length && itens.every(i => i.principal != null) ? itens.reduce((s, i) => s + i.principal!, 0) : null;
  const candidatos = snapshots.filter(s => CAMPOS_SNAPSHOT.some(c => s[c] != null));
  const primeiro = candidatos[0];
  // Snapshots antigos eram rateados por parcela; não somar ou escolher um deles.
  const consistente = !!primeiro && principal != null && CAMPOS_SNAPSHOT.every(c => valorValido(primeiro[c]))
    && candidatos.every(s => CAMPOS_SNAPSHOT.every(c => s[c] === primeiro[c]))
    && primeiro.snapshotPrincipal === principal
    && primeiro.snapshotValorAtualizado! >= primeiro.snapshotPrincipal! + primeiro.snapshotJuros! + primeiro.snapshotMulta! + primeiro.snapshotCorrecao! + primeiro.snapshotHonorarios!;
  if (!consistente) avisos.push("Encargos e base histórica dos títulos sem snapshot agregado consistente; não foram recalculados.");
  if (candidatos.length && candidatos.length < snapshots.length) avisos.push("Algumas parcelas não têm snapshot; foram usados somente registros agregados consistentes disponíveis.");
  if (!itens.length) avisos.push("Não há dívidas de origem vinculadas disponíveis neste acordo.");
  if (itens.some(i => !i.vencimento || i.principal == null)) avisos.push("Existem dados de origem indisponíveis; confira o demonstrativo e o cadastro vinculado.");
  if (consistente && primeiro.snapshotValorAtualizado! > primeiro.snapshotPrincipal! + primeiro.snapshotJuros! + primeiro.snapshotMulta! + primeiro.snapshotCorrecao! + primeiro.snapshotHonorarios!) {
    avisos.push("A base histórica inclui valores sem discriminação no snapshot; consulte a formalização do acordo.");
  }
  return {
    itens, quantidade: itens.length,
    primeiroVencimento: datas.length ? new Date(Math.min(...datas)) : null,
    ultimoVencimento: datas.length ? new Date(Math.max(...datas)) : null,
    principal,
    juros: consistente ? primeiro.snapshotJuros! : null,
    multa: consistente ? primeiro.snapshotMulta! : null,
    correcao: consistente ? primeiro.snapshotCorrecao! : null,
    honorarios: consistente ? primeiro.snapshotHonorarios! : null,
    totalFechamento: consistente ? primeiro.snapshotValorAtualizado! : null,
    avisos: Array.from(new Set(avisos)),
  };
}

/** A tabela curta só é mantida se couber inteira com a ficha de compensação. */
export function deveResumirOrigem(quantidade: number, alturaTabela: number, alturaDisponivel: number, alturaFicha: number): boolean {
  return quantidade === 0 || quantidade > 5 || alturaTabela + alturaFicha > alturaDisponivel;
}

/** Leitura de vínculos e snapshots, sem BCB, cálculo por data ou alterações financeiras. */
export async function carregarOrigemDividaAcordo(acordoId: number): Promise<OrigemDividaDocumento> {
  const { getDb } = await import("./db");
  const { acordos, acordoCobrancas, cobrancas, parcelasAcordo } = await import("../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) throw new Error("Não foi possível consultar a origem do acordo");
  const [vinculos, snapshots, acordo] = await Promise.all([
    db.select({
      cobrancaId: acordoCobrancas.cobrancaId,
      valorOriginal: acordoCobrancas.valorOriginal,
      titulo: cobrancas.description,
      vencimento: cobrancas.dueDate,
    }).from(acordoCobrancas).innerJoin(acordos, eq(acordos.id, acordoCobrancas.acordoId))
      .leftJoin(cobrancas, and(eq(cobrancas.id, acordoCobrancas.cobrancaId),
        eq(cobrancas.condominioId, acordos.condominioId), eq(cobrancas.devedorId, acordos.devedorId)))
      .where(eq(acordoCobrancas.acordoId, acordoId)),
    db.select({
      snapshotPrincipal: parcelasAcordo.snapshotPrincipal,
      snapshotJuros: parcelasAcordo.snapshotJuros,
      snapshotMulta: parcelasAcordo.snapshotMulta,
      snapshotCorrecao: parcelasAcordo.snapshotCorrecao,
      snapshotHonorarios: parcelasAcordo.snapshotHonorarios,
      snapshotValorAtualizado: parcelasAcordo.snapshotValorAtualizado,
    }).from(parcelasAcordo).where(eq(parcelasAcordo.acordoId, acordoId)),
    db.select({ acordoOrigemId: acordos.acordoOrigemId }).from(acordos).where(eq(acordos.id, acordoId)).limit(1),
  ]);
  const origem = montarOrigemDividaAcordo(vinculos, snapshots);
  if (acordo[0]?.acordoOrigemId) origem.avisos.push("Acordo consolidado: pode existir saldo de acordo anterior não discriminado nesta lista de títulos.");
  return origem;
}
