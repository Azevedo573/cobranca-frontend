import { and, eq } from "drizzle-orm";
import { acordos, acordoCobrancas, parcelasAcordo, tentativasCobranca, users, InsertAcordo, InsertParcelaAcordo, InsertTentativaCobranca } from "../drizzle/schema";
import { getDb } from "./db";

// Tentativas de Cobrança
export async function getTentativasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar tentativas com informações do usuário (colaborador)
  const result = await db
    .select({
      id: tentativasCobranca.id,
      cobrancaId: tentativasCobranca.cobrancaId,
      devedorId: tentativasCobranca.devedorId,
      condominioId: tentativasCobranca.condominioId,
      userId: tentativasCobranca.userId,
      contactType: tentativasCobranca.contactType,
      notes: tentativasCobranca.notes,
      result: tentativasCobranca.result,
      attemptDate: tentativasCobranca.attemptDate,
      nextAttemptDate: tentativasCobranca.nextAttemptDate,
      createdAt: tentativasCobranca.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tentativasCobranca)
    .leftJoin(users, eq(tentativasCobranca.userId, users.id))
    .where(eq(tentativasCobranca.condominioId, condominioId));
  
  return result;
}

export async function getAllTentativas() {
  const db = await getDb();
  if (!db) return [];
  
  // Buscar todas as tentativas com informações do usuário (para admin)
  const result = await db
    .select({
      id: tentativasCobranca.id,
      cobrancaId: tentativasCobranca.cobrancaId,
      devedorId: tentativasCobranca.devedorId,
      condominioId: tentativasCobranca.condominioId,
      userId: tentativasCobranca.userId,
      contactType: tentativasCobranca.contactType,
      notes: tentativasCobranca.notes,
      result: tentativasCobranca.result,
      attemptDate: tentativasCobranca.attemptDate,
      nextAttemptDate: tentativasCobranca.nextAttemptDate,
      createdAt: tentativasCobranca.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(tentativasCobranca)
    .leftJoin(users, eq(tentativasCobranca.userId, users.id));
  
  return result;
}

export async function getTentativasByDevedor(devedorId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tentativasCobranca).where(eq(tentativasCobranca.devedorId, devedorId));
}

export async function createTentativa(data: InsertTentativaCobranca) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(tentativasCobranca).values(data);
  return result;
}

// Acordos
export async function getAcordosByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { devedores } = await import("../drizzle/schema");
  
  const result = await db
    .select({
      id: acordos.id,
      devedorId: acordos.devedorId,
      condominioId: acordos.condominioId,
      valorPago: acordos.valorPago,
      totalAmount: acordos.totalAmount,
      agreedAmount: acordos.agreedAmount,
      installments: acordos.installments,
      firstPaymentDate: acordos.firstPaymentDate,
      paymentFrequency: acordos.paymentFrequency,
      status: acordos.status,
      notes: acordos.notes,
      createdAt: acordos.createdAt,
      updatedAt: acordos.updatedAt,
      devedorName: devedores.name,
      devedorUnidade: devedores.unitNumber,
      devedorBloco: devedores.bloco,
    })
    .from(acordos)
    .leftJoin(devedores, eq(acordos.devedorId, devedores.id))
    .where(eq(acordos.condominioId, condominioId));
  
  return result;
}

export async function getAcordoById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(acordos).where(eq(acordos.id, id)).limit(1);
  return result[0] || null;
}

export async function createAcordo(data: InsertAcordo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(acordos).values(data);
  return result;
}

export async function updateAcordo(id: number, data: Partial<InsertAcordo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(acordos).set(data).where(eq(acordos.id, id));
  return await getAcordoById(id);
}

// Parcelas de Acordo
export async function getParcelasByAcordo(acordoId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(parcelasAcordo).where(eq(parcelasAcordo.acordoId, acordoId));
}

export async function createParcela(data: InsertParcelaAcordo) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(parcelasAcordo).values(data);
  return result;
}

export async function createParcelas(parcelas: InsertParcelaAcordo[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (parcelas.length === 0) return [];
  
  // Usar SQL raw para evitar problema do Drizzle ORM
  // Formatar datas corretamente para MySQL
  const formatDate = (date: any): string => {
    if (date instanceof Date) {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    }
    if (typeof date === 'string') {
      // Se já é string, tentar converter para Date e formatar
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 19).replace('T', ' ');
      }
    }
    // Fallback: usar data atual
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  };
  
  const values = parcelas.map(p => 
    `(${p.acordoId}, ${p.installmentNumber}, '${p.amount}', '${formatDate(p.dueDate)}', '${p.status}')`
  ).join(', ');
  
  const sql = `
    INSERT INTO parcelasAcordo (acordoId, installmentNumber, amount, dueDate, status)
    VALUES ${values}
  `;
  
  await db.execute(sql);
  return { success: true };
}

export async function updateParcela(id: number, data: Partial<InsertParcelaAcordo>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(parcelasAcordo).set(data).where(eq(parcelasAcordo.id, id));
}

// Relacionamento Acordo-Cobranças
export async function createAcordoCobrancas(acordoId: number, cobrancaIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Buscar valores originais das cobranças
  const { cobrancas } = await import("../drizzle/schema");
  const cobrancasData = await db.select().from(cobrancas).where(
    eq(cobrancas.id, cobrancaIds[0]) // Simplificado para primeira implementação
  );
  
  const relacionamentos = cobrancaIds.map(cobrancaId => ({
    acordoId,
    cobrancaId,
    valorOriginal: cobrancasData[0]?.amount || 0,
  }));
  
  const result = await db.insert(acordoCobrancas).values(relacionamentos);
  return result;
}

export async function getCobrancasByAcordo(acordoId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const { cobrancas } = await import("../drizzle/schema");
  
  const result = await db
    .select({
      id: cobrancas.id,
      devedorId: cobrancas.devedorId,
      condominioId: cobrancas.condominioId,
      tipoCobranca: cobrancas.tipoCobranca,
      description: cobrancas.description,
      amount: cobrancas.amount,
      custasJudiciais: cobrancas.custasJudiciais,
      dueDate: cobrancas.dueDate,
      monthReference: cobrancas.monthReference,
      status: cobrancas.status,
      createdAt: cobrancas.createdAt,
      updatedAt: cobrancas.updatedAt,
      valorOriginal: acordoCobrancas.valorOriginal,
    })
    .from(acordoCobrancas)
    .innerJoin(cobrancas, eq(acordoCobrancas.cobrancaId, cobrancas.id))
    .where(eq(acordoCobrancas.acordoId, acordoId));
  
  return result;
}

// Buscar acordos ativos do devedor com informações de parcelas restantes
export async function getAcordosAtivosComParcelas(devedorId: number) {
  try {
    const db = await getDb();
    if (!db) return [];
    
    // Buscar acordos ativos do devedor
    const acordosAtivos = await db.select().from(acordos).where(
      and(
        eq(acordos.devedorId, devedorId),
        eq(acordos.status, "ativo")
      )
    );
    
    // Se não houver acordos ativos, retornar array vazio
    if (!acordosAtivos || acordosAtivos.length === 0) {
      return [];
    }
    
    // Para cada acordo, buscar parcelas pendentes
    const acordosComParcelas = await Promise.all(
      acordosAtivos.map(async (acordo) => {
        try {
          const parcelas = await db.select().from(parcelasAcordo).where(
            eq(parcelasAcordo.acordoId, acordo.id)
          );
          
          const parcelasPendentes = parcelas.filter(p => p.status === "pendente" || p.status === "atrasado");
          const valorRestante = parcelasPendentes.reduce((sum, p) => sum + p.amount, 0);
          const valorParcela = parcelasPendentes.length > 0 ? parcelasPendentes[0].amount : 0;
          
          return {
            ...acordo,
            totalParcelas: parcelas.length,
            parcelasPendentes: parcelasPendentes.length,
            parcelasPagas: parcelas.filter(p => p.status === "pago").length,
            valorRestante, // em centavos
            valorParcela, // em centavos
          };
        } catch (error) {
          console.error(`Erro ao buscar parcelas do acordo ${acordo.id}:`, error);
          // Retornar acordo sem parcelas em caso de erro
          return {
            ...acordo,
            totalParcelas: 0,
            parcelasPendentes: 0,
            parcelasPagas: 0,
            valorRestante: 0,
            valorParcela: 0,
          };
        }
      })
    );
    
    return acordosComParcelas;
  } catch (error) {
    console.error('Erro ao buscar acordos ativos:', error);
    return [];
  }
}


// Buscar histórico de consolidações de um acordo (recursivo)
export async function getHistoricoConsolidacoes(acordoId: number) {
  const db = await getDb();
  if (!db) return [];
  
  const historico: any[] = [];
  let currentId: number | null = acordoId;
  
  // Buscar recursivamente até encontrar o acordo original (sem acordoOrigemId)
  while (currentId) {
    const acordoResult: any = await db
      .select()
      .from(acordos)
      .where(eq(acordos.id, currentId))
      .limit(1);
    
    if (acordoResult.length === 0) break;
    
    const acordoData: any = acordoResult[0];
    
    // Buscar parcelas do acordo
    let parcelas: any[] = [];
    try {
      parcelas = await db
        .select()
        .from(parcelasAcordo)
        .where(eq(parcelasAcordo.acordoId, currentId));
    } catch (error) {
      console.error(`Erro ao buscar parcelas do acordo ${currentId}:`, error);
      parcelas = [];
    }
    
    historico.push({
      ...acordoData,
      parcelas: parcelas.length,
      parcelasPagas: parcelas.filter(p => p.status === 'paga').length,
    });
    
    // Ir para o acordo origem
    currentId = acordoData.acordoOrigemId;
  }
  
  return historico;
}
