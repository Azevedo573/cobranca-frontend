import { and, eq } from "drizzle-orm";
import { cobrancas, InsertCobranca, condominios } from "../drizzle/schema";
import { getDb } from "./db";
import { calcularValorDevido, BreakdownValor } from "../shared/calculos";
import { calcularCorrecaoBCB } from "./bcb-api";

export async function getCobrancasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(eq(cobrancas.condominioId, condominioId));
}

export async function getCobrancasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(cobrancas).where(eq(cobrancas.devedorId, devedorId));
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
  
  // Buscar cobranças
  const cobrancasList = await db.select().from(cobrancas).where(eq(cobrancas.devedorId, devedorId));
  
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
  
  // Calcular valores para cada cobrança
  const cobrancasComCalculos: CobrancaComCalculos[] = [];
  
  for (const cobranca of cobrancasList) {
    const valorOriginal = cobranca.amount / 100; // converter de centavos
    if (!cobranca.dueDate) continue; // pular cobranças sem data de vencimento
    const dataVencimento = new Date(cobranca.dueDate);
    const custasJudiciais = cobranca.custasJudiciais ? cobranca.custasJudiciais / 100 : 0;
    
    // Calcular valores base (juros, multa, honorários)
    let breakdown = calcularValorDevido(valorOriginal, dataVencimento, taxas, custasJudiciais);
    
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
          valorTotal: valorOriginal + breakdown.juros + breakdown.multa + honorarios + custasJudiciais + correcaoBCB,
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
      let dueDate: Date;
      if (typeof row["Vencimento"] === "number") {
        // Converter número serial do Excel para data
        const excelEpoch = new Date(1899, 11, 30);
        dueDate = new Date(excelEpoch.getTime() + row["Vencimento"] * 86400000);
      } else {
        // Tentar parsear string (formato DD/MM/YYYY ou YYYY-MM-DD)
        const dateStr = String(row["Vencimento"]);
        if (dateStr.includes("/")) {
          const [day, month, year] = dateStr.split("/");
          dueDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
