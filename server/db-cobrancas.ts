import { and, eq, ne } from "drizzle-orm";
import { cobrancas, InsertCobranca, condominios, acordos, acordoCobrancas, parcelasAcordo, custasJudiciais as custasJudiciaisTable } from "../drizzle/schema";
import { getDb } from "./db";
import { calcularValorDevido, BreakdownValor } from "../shared/calculos";
import { calcularCorrecaoBCB } from "./bcb-api";

export async function getCobrancasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  // Excluir cobranças em acordo ativo — elas são substituídas pelas parcelas do acordo
  return await db.select().from(cobrancas).where(
    and(eq(cobrancas.condominioId, condominioId), ne(cobrancas.status, "em_acordo"))
  );
}

export async function getCobrancasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  // Excluir cobranças em acordo ativo — elas são substituídas pelas parcelas do acordo
  return await db.select().from(cobrancas).where(
    and(eq(cobrancas.devedorId, devedorId), ne(cobrancas.status, "em_acordo"))
  );
}

/**
 * Busca cobranças em acordo de um devedor (para histórico/auditoria)
 */
export async function getCobrancasEmAcordoByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(
    and(eq(cobrancas.devedorId, devedorId), eq(cobrancas.status, "em_acordo"))
  );
}

/**
 * Busca parcelas ativas de acordos de um devedor para exibição na tela de cobranças.
 * Retorna parcelas de acordos com status 'ativo' ou 'inadimplente'.
 */
export async function getParcelasAcordoAtivasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  // Buscar acordos ativos do devedor
  const acordosAtivos = await db.select().from(acordos).where(
    and(eq(acordos.devedorId, devedorId), eq(acordos.status, "ativo"))
  );
  if (acordosAtivos.length === 0) return [];
  const acordoIds = acordosAtivos.map(a => a.id);
  // Buscar parcelas pendentes/atrasadas desses acordos
  const { inArray } = await import("drizzle-orm");
  const parcelas = await db.select({
    id: parcelasAcordo.id,
    acordoId: parcelasAcordo.acordoId,
    installmentNumber: parcelasAcordo.installmentNumber,
    amount: parcelasAcordo.amount,
    dueDate: parcelasAcordo.dueDate,
    status: parcelasAcordo.status,
    nossoNumero: parcelasAcordo.nossoNumero,
    statusRemessa: parcelasAcordo.statusRemessa,
    remessaId: parcelasAcordo.remessaId,
    pixCopiaCola: parcelasAcordo.pixCopiaCola,
    btgCollectionId: parcelasAcordo.btgCollectionId,
    btgBankSlipUrl: parcelasAcordo.btgBankSlipUrl,
    btgPixQrCode: parcelasAcordo.btgPixQrCode,
    btgPixCopiaECola: parcelasAcordo.btgPixCopiaECola,
    btgStatus: parcelasAcordo.btgStatus,
    // Snapshot de breakdown
    snapshotPrincipal: parcelasAcordo.snapshotPrincipal,
    snapshotJuros: parcelasAcordo.snapshotJuros,
    snapshotMulta: parcelasAcordo.snapshotMulta,
    snapshotCorrecao: parcelasAcordo.snapshotCorrecao,
    snapshotHonorarios: parcelasAcordo.snapshotHonorarios,
    snapshotValorAtualizado: parcelasAcordo.snapshotValorAtualizado,
    snapshotDescricao: parcelasAcordo.snapshotDescricao,
  }).from(parcelasAcordo).where(
    inArray(parcelasAcordo.acordoId, acordoIds)
  ).orderBy(parcelasAcordo.installmentNumber);
  // Enriquecer com info do acordo
  return parcelas.map(p => ({
    ...p,
    _tipo: "parcela_acordo" as const,
    _acordo: acordosAtivos.find(a => a.id === p.acordoId)!,
  }));
}

export async function getCobrancaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(cobrancas).where(eq(cobrancas.id, id)).limit(1);
  return result[0] || null;
}

export async function createCobranca(data: InsertCobranca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(cobrancas).values(data);
  return result;
}

/** Busca título equivalente para impedir reimportação acidental da mesma cobrança. */
export async function encontrarCobrancaEquivalenteImportacao(input: {
  condominioId: number;
  devedorId: number;
  dueDate: Date;
  amount: number;
  tipoCobranca: NonNullable<InsertCobranca["tipoCobranca"]>;
}) {
  const db = await getDb();
  if (!db) return null;

  const [existente] = await db.select()
    .from(cobrancas)
    .where(and(
      eq(cobrancas.condominioId, input.condominioId),
      eq(cobrancas.devedorId, input.devedorId),
      eq(cobrancas.dueDate, input.dueDate),
      eq(cobrancas.amount, input.amount),
      eq(cobrancas.tipoCobranca, input.tipoCobranca),
    ))
    .limit(1);
  return existente ?? null;
}

export async function updateCobranca(id: number, data: Partial<InsertCobranca>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(cobrancas).set(data).where(eq(cobrancas.id, id));
  return await getCobrancaById(id);
}

export async function deleteCobranca(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(cobrancas).where(eq(cobrancas.id, id));
}

export interface CobrancaComCalculos {
  id: number;
  devedorId: number;
  condominioId: number;
  tipoCobranca: string | null;
  description: string | null;
  amount: number;
  dueDate: Date | null;
  monthReference: string | null;
  status: string;
  custasJudiciais: number | null;
  nossoNumero: string | null;
  pixCopiaCola: string | null;
  statusRemessa: string | null;
  createdAt: Date;
  updatedAt: Date | null;
  // Campos calculados
  breakdown: BreakdownValor;
}

/**
 * Busca cobranças de um devedor com valores calculados (incluindo correção BCB se ativado)
 */
export async function getCobrancasComCalculos(devedorId: number): Promise<CobrancaComCalculos[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar cobranças (excluindo as em acordo ativo — substituídas pelas parcelas do acordo)
  const cobrancasList = await db.select().from(cobrancas).where(
    and(eq(cobrancas.devedorId, devedorId), ne(cobrancas.status, "em_acordo"))
  );
  
  if (cobrancasList.length === 0) {
    return [];
  }
  
  // Buscar configurações do condomínio
  const condominioId = cobrancasList[0].condominioId;
  const condominioData = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
  
  if (!condominioData[0]) {
    return [];
  }
  
  const condominio = condominioData[0];
  const taxas = {
    taxaJurosMensal: Number(condominio.taxaJurosMensal || 0),
    taxaMulta: Number(condominio.taxaMulta || 0),
    taxaHonorarios: Number(condominio.taxaHonorarios || 0),
    correcaoMonetaria: Number(condominio.correcaoMonetaria || 0),
  };
  
  const aplicarCorrecaoBCB = Boolean(condominio.aplicarCorrecaoAuto) && 
                             condominio.indiceCorrecao && 
                             condominio.indiceCorrecao !== "NENHUM";
  
  // Buscar total de custas judiciais da tabela separada (cadastradas no perfil do devedor)
  const custasRows = await db.select().from(custasJudiciaisTable).where(eq(custasJudiciaisTable.devedorId, devedorId));
  const totalCustasDevedor = custasRows.reduce((sum, c) => sum + c.valor, 0) / 100; // em reais

  // Distribuir custas proporcionalmente entre as cobranças ativas (por valor original)
  const totalAmountCobrancas = cobrancasList.reduce((sum, c) => sum + c.amount, 0);

  // Calcular valores para cada cobrança
  const cobrancasComCalculos: CobrancaComCalculos[] = [];
  
  for (const cobranca of cobrancasList) {
    const valorOriginal = cobranca.amount / 100; // converter de centavos
    if (!cobranca.dueDate) continue; // pular cobranças sem data de vencimento
    const dataVencimento = new Date(cobranca.dueDate);
    // Custas: apenas o campo da própria cobrança (campo custasJudiciais da tabela cobrancas)
    // As custas da tabela separada (custasJudiciais) NÃO entram no valorTotal individual —
    // elas são exibidas como lançamento separado no perfil do devedor.
    const custasPropriaCobranca = cobranca.custasJudiciais ? cobranca.custasJudiciais / 100 : 0;
    
    // Calcular valores base (juros, multa, honorários)
    let breakdown = calcularValorDevido(valorOriginal, dataVencimento, taxas, custasPropriaCobranca);
    
    // Se correção BCB estiver ativada, substituir correção monetária
    if (aplicarCorrecaoBCB && condominio.indiceCorrecao) {
      try {
        const correcaoBCB = await calcularCorrecaoBCB(
          valorOriginal,
          dataVencimento,
          condominio.indiceCorrecao
        );
        
        // Recalcular honorários sobre o valor atualizado (com correção BCB)
        const baseHonorarios = valorOriginal + breakdown.juros + breakdown.multa + correcaoBCB;
        const mesesAtraso = breakdown.mesesAtraso;
        const honorarios = mesesAtraso > 0 ? (baseHonorarios * (taxas.taxaHonorarios / 100)) : 0;
        
        // Recalcular valor total com correção BCB e honorários atualizados
        breakdown = {
          ...breakdown,
          honorarios,
          correcaoMonetaria: correcaoBCB,
          valorTotal: valorOriginal + breakdown.juros + breakdown.multa + honorarios + custasPropriaCobranca + correcaoBCB,
        };
      } catch (error) {
        console.error("Erro ao calcular correção BCB, usando percentual fixo:", error);
        // Mantém o breakdown original com percentual fixo
      }
    }
    
    cobrancasComCalculos.push({
      ...cobranca,
      breakdown,
    });
  }
  
  return cobrancasComCalculos;
}


/**
 * Busca cobranças originais de um acordo (via tabela acordoCobrancas) com valores calculados.
 * Usa esta função no boleto do acordo para mostrar as dívidas originais mesmo quando
 * o status das cobranças já é "em_acordo".
 */
export async function getCobrancasComCalculosPorAcordo(acordoId: number): Promise<CobrancaComCalculos[]> {
  const db = await getDb();
  if (!db) return [];

  // 1. Buscar os vínculos acordoCobrancas → cobrancaId
  const vinculos = await db.select().from(acordoCobrancas).where(eq(acordoCobrancas.acordoId, acordoId));
  if (vinculos.length === 0) return [];

  const { inArray } = await import("drizzle-orm");
  const cobrancaIds = vinculos.map(v => v.cobrancaId);

  // 2. Buscar as cobranças originais (independente do status)
  const cobrancasList = await db.select().from(cobrancas).where(inArray(cobrancas.id, cobrancaIds));
  if (cobrancasList.length === 0) return [];

  // 3. Buscar configurações do condomínio
  const condominioId = cobrancasList[0].condominioId;
  const condominioData = await db.select().from(condominios).where(eq(condominios.id, condominioId)).limit(1);
  if (!condominioData[0]) return [];

  const condominio = condominioData[0];
  const taxas = {
    taxaJurosMensal: Number(condominio.taxaJurosMensal || 0),
    taxaMulta: Number(condominio.taxaMulta || 0),
    taxaHonorarios: Number(condominio.taxaHonorarios || 0),
    correcaoMonetaria: Number(condominio.correcaoMonetaria || 0),
  };

  const aplicarCorrecaoBCB = Boolean(condominio.aplicarCorrecaoAuto) &&
    condominio.indiceCorrecao &&
    condominio.indiceCorrecao !== "NENHUM";

  const cobrancasComCalculos: CobrancaComCalculos[] = [];

  for (const cobranca of cobrancasList) {
    const valorOriginal = cobranca.amount / 100;
    if (!cobranca.dueDate) continue;
    const dataVencimento = new Date(cobranca.dueDate);
    const custasPropriaCobranca = cobranca.custasJudiciais ? cobranca.custasJudiciais / 100 : 0;

    let breakdown = calcularValorDevido(valorOriginal, dataVencimento, taxas, custasPropriaCobranca);

    if (aplicarCorrecaoBCB && condominio.indiceCorrecao) {
      try {
        const correcaoBCB = await calcularCorrecaoBCB(valorOriginal, dataVencimento, condominio.indiceCorrecao);
        const baseHonorarios = valorOriginal + breakdown.juros + breakdown.multa + correcaoBCB;
        const mesesAtraso = breakdown.mesesAtraso;
        const honorarios = mesesAtraso > 0 ? (baseHonorarios * (taxas.taxaHonorarios / 100)) : 0;
        breakdown = {
          ...breakdown,
          honorarios,
          correcaoMonetaria: correcaoBCB,
          valorTotal: valorOriginal + breakdown.juros + breakdown.multa + honorarios + custasPropriaCobranca + correcaoBCB,
        };
      } catch {
        // mantém breakdown original
      }
    }

    cobrancasComCalculos.push({ ...cobranca, breakdown });
  }

  return cobrancasComCalculos;
}


/**
 * Importar múltiplas cobranças de uma planilha Excel
 */
export async function importarCobrancasPlanilha(
  devedorId: number,
  condominioId: number,
  fileBase64: string
): Promise<{ success: boolean; imported: number; errors: string[] }> {
  const xlsx = await import("xlsx");
  
  // Decodificar base64 para buffer
  const buffer = Buffer.from(fileBase64.split(",")[1] || fileBase64, "base64");
  
  // Ler planilha
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Converter para JSON
  const rows: any[] = xlsx.utils.sheet_to_json(worksheet);
  
  const errors: string[] = [];
  let imported = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 porque linha 1 é cabeçalho e índice começa em 0
    
    try {
      // Validar campos obrigatórios
      if (!row["Descrição"] && !row["Descricao"]) {
        errors.push(`Linha ${rowNum}: Campo "Descrição" é obrigatório`);
        continue;
      }
      
      if (!row["Valor"]) {
        errors.push(`Linha ${rowNum}: Campo "Valor" é obrigatório`);
        continue;
      }
      
      if (!row["Vencimento"]) {
        errors.push(`Linha ${rowNum}: Campo "Vencimento" é obrigatório`);
        continue;
      }
      
      // Processar data de vencimento (pode vir como número serial do Excel ou string)
      // IMPORTANTE: usar Date.UTC() para evitar deslocamento de fuso horário.
      // new Date(year, month, day) cria data no fuso local do servidor, mas o cliente
      // pode estar em fuso diferente (ex: UTC-3), causando exibição de um dia a menos.
      let dueDate: Date;
      if (typeof row["Vencimento"] === "number") {
        // Converter número serial do Excel para data usando UTC puro
        // Excel conta dias desde 01/01/1900, com bug intencional (trata 1900 como bissexto)
        const serial = row["Vencimento"];
        const diasDesde1900 = serial > 60 ? serial - 2 : serial - 1;
        const msBase = Date.UTC(1900, 0, 1); // 01/01/1900 UTC
        const ms = msBase + diasDesde1900 * 86400000;
        const d = new Date(ms);
        dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      } else {
        // Tentar parsear string (formato DD/MM/YYYY ou YYYY-MM-DD)
        const dateStr = String(row["Vencimento"]).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
          // Formato DD/MM/YYYY
          const [day, month, year] = dateStr.split("/").map(Number);
          dueDate = new Date(Date.UTC(year, month - 1, day));
        } else if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
          // Formato ISO YYYY-MM-DD
          const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
          dueDate = new Date(Date.UTC(year, month - 1, day));
        } else {
          dueDate = new Date(dateStr);
        }
      }
      
      if (isNaN(dueDate.getTime())) {
        errors.push(`Linha ${rowNum}: Data de vencimento inválida`);
        continue;
      }
      
      // Processar valor (remover R$, pontos e trocar vírgula por ponto)
      let amount = row["Valor"];
      if (typeof amount === "string") {
        amount = parseFloat(amount.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
      }
      
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Linha ${rowNum}: Valor inválido`);
        continue;
      }
      
      // Tipo de cobrança (opcional, padrão: condominio)
      const tipoCobranca = row["Tipo"] || "condominio";
      const tiposValidos = ["condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"];
      if (!tiposValidos.includes(tipoCobranca)) {
        errors.push(`Linha ${rowNum}: Tipo "${tipoCobranca}" inválido. Use: ${tiposValidos.join(", ")}`);
        continue;
      }
      
      // Criar cobrança
      await createCobranca({
        devedorId,
        condominioId,
        description: row["Descrição"] || row["Descricao"] || "",
        amount: Math.round(amount * 100), // converter para centavos
        dueDate,
        tipoCobranca: tipoCobranca as any,
        custasJudiciais: row["Custas Judiciais"] ? Math.round(parseFloat(row["Custas Judiciais"]) * 100) : undefined,
        monthReference: row["Mês Referência"] || row["Mes Referencia"] || undefined,
      });
      
      imported++;
    } catch (error: any) {
      errors.push(`Linha ${rowNum}: ${error.message}`);
    }
  }
  
  return {
    success: errors.length === 0,
    imported,
    errors,
  };
}
