import { getDb } from "./db";
import { and, eq, gte, lte, inArray, desc, like } from "drizzle-orm";
import {
  cobrancas, devedores, condominios, acordos, users, tentativasCobranca,
  acordoCobrancas, parcelasAcordo,
} from "../drizzle/schema";

type FiltroBase = {
  dataInicio?: string;
  dataFim?: string;
  condominioId?: number;
  devedorId?: number;
};

// ─── 1. Inadimplência ────────────────────────────────────────────────────────
export async function getRelatorioInadimplencia(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalDevedores: 0, totalValor: 0, totalCobrado: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));
  cond.push(
    inArray(cobrancas.status, [
      "pendente", "em_cobranca", "em_acordo", "acordo",
      "acordo_atrasado", "em_negociacao", "suspenso", "judicial",
    ])
  );

  const rows = await db
    .select({
      devedorId: devedores.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      cobrancaId: cobrancas.id,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      valorOriginal: cobrancas.amount,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(and(...cond))
    .orderBy(desc(cobrancas.dueDate))
    .limit(2000);

  return {
    rows,
    totais: {
      totalDevedores: new Set(rows.map((r) => r.devedorId)).size,
      totalValor: rows.reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
      totalCobrado: rows.length,
    },
  };
}

// ─── 2. Acordos ──────────────────────────────────────────────────────────────
export async function getRelatorioAcordos(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalAcordos: 0, valorTotal: 0, valorRecuperado: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.dataInicio) cond.push(gte(acordos.createdAt, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(acordos.createdAt, new Date(filtro.dataFim)));

  const rows = await db
    .select({
      acordoId: acordos.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      status: acordos.status,
      valorTotal: acordos.agreedAmount,
      numParcelas: acordos.installments,
      valorPago: acordos.valorPago,
      dataCriacao: acordos.createdAt,
    })
    .from(acordos)
    .innerJoin(devedores, eq(acordos.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(acordos.createdAt))
    .limit(2000);

  return {
    rows,
    totais: {
      totalAcordos: rows.length,
      valorTotal: rows.reduce((s, r) => s + (r.valorTotal ?? 0), 0),
      valorRecuperado: rows
        .filter((r) => r.status === "pago")
        .reduce((s, r) => s + (r.valorTotal ?? 0), 0),
    },
  };
}

// ─── 3. Extrato ──────────────────────────────────────────────────────────────
export async function getRelatorioExtrato(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalCobrado: 0, totalPago: 0, totalPendente: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.devedorId) cond.push(eq(cobrancas.devedorId, filtro.devedorId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));

  const rows = await db
    .select({
      cobrancaId: cobrancas.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      dataPagamento: cobrancas.paidAt,
      valorOriginal: cobrancas.amount,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(cobrancas.dueDate))
    .limit(2000);

  return {
    rows,
    totais: {
      totalCobrado: rows.reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
      totalPago: rows
        .filter((r) => r.status === "pago")
        .reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
      totalPendente: rows
        .filter((r) => r.status !== "pago")
        .reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
    },
  };
}

// ─── 4. Recuperação ──────────────────────────────────────────────────────────
export async function getRelatorioRecuperacao(filtro: FiltroBase, condominioIdUsuario?: number) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalRecuperado: 0, totalEmAberto: 0, taxaRecuperacao: 0 } };

  const cond: ReturnType<typeof eq>[] = [];
  const condId = filtro.condominioId ?? condominioIdUsuario;
  if (condId) cond.push(eq(devedores.condominioId, condId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));

  const todasRows = await db
    .select({
      cobrancaId: cobrancas.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      dataPagamento: cobrancas.paidAt,
      valorOriginal: cobrancas.amount,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(cobrancas.paidAt))
    .limit(2000);

  const pagos = todasRows.filter((r) => r.status === "pago");
  const totalRecuperado = pagos.reduce((s, r) => s + (r.valorOriginal ?? 0), 0);
  const totalEmAberto = todasRows
    .filter((r) => r.status !== "pago")
    .reduce((s, r) => s + (r.valorOriginal ?? 0), 0);
  const taxaRecuperacao =
    todasRows.length > 0 ? Math.round((pagos.length / todasRows.length) * 100) : 0;

  return {
    rows: pagos,
    totais: { totalRecuperado, totalEmAberto, taxaRecuperacao },
  };
}

// ─── 5. Inadimplência Completa (com encargos e filtros avançados) ─────────────
type FiltroInadimplenciaCompleto = {
  dataInicio?: string;
  dataFim?: string;
  condominioId?: number;
  devedorId?: number;
  atualizadoAte?: string;       // data base para cálculo de encargos
  tiposCobranca?: string[];     // filtro por tipo de cobrança
  categoria?: "todos" | "padrao" | "ajuizada";
  honorariosPerc?: number;      // % adicional de honorários (sobrescreve taxa do condomínio)
  custasJudiciais?: number;     // R$ em centavos (acréscimo global)
  outrasDespesas?: number;      // R$ em centavos (acréscimo global)
};

export async function getRelatorioInadimplenciaCompleto(filtro: FiltroInadimplenciaCompleto) {
  const db = await getDb();
  if (!db) return { rows: [], totais: { totalDevedores: 0, totalValorOriginal: 0, totalJuros: 0, totalMulta: 0, totalCorrecao: 0, totalHonorarios: 0, totalCustas: 0, totalOutras: 0, totalAtualizado: 0, totalCobrado: 0 } };

  const { calcularValorDevido } = await import("../shared/calculos");

  const cond: any[] = [];

  if (filtro.condominioId) cond.push(eq(devedores.condominioId, filtro.condominioId));
  if (filtro.devedorId) cond.push(eq(cobrancas.devedorId, filtro.devedorId));
  if (filtro.dataInicio) cond.push(gte(cobrancas.dueDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) cond.push(lte(cobrancas.dueDate, new Date(filtro.dataFim)));

  // Filtro de categoria: ajuizada = status "judicial", padrão = todos os outros em aberto
  type StatusCobranca = "pendente" | "em_cobranca" | "em_acordo" | "acordo" | "acordo_atrasado" | "em_negociacao" | "suspenso" | "judicial" | "pago" | "cancelado";
  if (filtro.categoria === "ajuizada") {
    cond.push(inArray(cobrancas.status, ["judicial"] as StatusCobranca[]));
  } else if (filtro.categoria === "padrao") {
    cond.push(inArray(cobrancas.status, ["pendente", "em_cobranca", "em_acordo", "acordo", "acordo_atrasado", "em_negociacao", "suspenso"] as StatusCobranca[]));
  } else {
    cond.push(inArray(cobrancas.status, ["pendente", "em_cobranca", "em_acordo", "acordo", "acordo_atrasado", "em_negociacao", "suspenso", "judicial"] as StatusCobranca[]));
  }

  // Filtro de tipo de cobrança
  if (filtro.tiposCobranca && filtro.tiposCobranca.length > 0 && !filtro.tiposCobranca.includes("todos")) {
    cond.push(inArray(cobrancas.tipoCobranca, filtro.tiposCobranca as any[]));
  }

  const rows = await db
    .select({
      devedorId: devedores.id,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      condominioId: condominios.id,
      nomeCondominio: condominios.name,
      taxaJurosMensal: condominios.taxaJurosMensal,
      taxaMulta: condominios.taxaMulta,
      taxaHonorarios: condominios.taxaHonorarios,
      correcaoMonetaria: condominios.correcaoMonetaria,
      cobrancaId: cobrancas.id,
      tipoCobranca: cobrancas.tipoCobranca,
      descricao: cobrancas.description,
      dataVencimento: cobrancas.dueDate,
      valorOriginal: cobrancas.amount,
      custasJudiciaisCobranca: cobrancas.custasJudiciais,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .innerJoin(devedores, eq(cobrancas.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(and(...cond))
    .orderBy(devedores.name, cobrancas.dueDate)
    .limit(5000);

  // Data base para cálculo de encargos
  const dataBase = filtro.atualizadoAte ? new Date(filtro.atualizadoAte + "T23:59:59") : new Date();

  // Calcular encargos para cada linha
  const rowsComEncargos = rows.map((r) => {
    const taxas = {
      taxaJurosMensal: Number(r.taxaJurosMensal ?? 1),
      taxaMulta: Number(r.taxaMulta ?? 2),
      taxaHonorarios: filtro.honorariosPerc !== undefined ? filtro.honorariosPerc : Number(r.taxaHonorarios ?? 10),
      correcaoMonetaria: Number(r.correcaoMonetaria ?? 0),
    };

    const valorOriginalReais = (r.valorOriginal ?? 0) / 100;
    const custasCobrancaReais = (r.custasJudiciaisCobranca ?? 0) / 100;

    // Calcular meses de atraso até a data base
    const vencimento = r.dataVencimento ? new Date(r.dataVencimento) : new Date();
    const mesesAtraso = vencimento < dataBase
      ? Math.max(0, (dataBase.getFullYear() - vencimento.getFullYear()) * 12 + (dataBase.getMonth() - vencimento.getMonth()) + (dataBase.getDate() > vencimento.getDate() ? 1 : 0))
      : 0;

    const juros = (valorOriginalReais * (taxas.taxaJurosMensal / 100)) * mesesAtraso;
    const multa = mesesAtraso > 0 ? (valorOriginalReais * (taxas.taxaMulta / 100)) : 0;
    const correcao = (valorOriginalReais * (taxas.correcaoMonetaria / 100)) * mesesAtraso;
    const baseHonorarios = valorOriginalReais + juros + multa + correcao;
    const honorarios = mesesAtraso > 0 ? (baseHonorarios * (taxas.taxaHonorarios / 100)) : 0;

    // Custas: da cobrança + acréscimo global proporcional (dividido pelo total de linhas depois)
    const custasTotal = custasCobrancaReais;

    const totalAtualizado = valorOriginalReais + juros + multa + correcao + honorarios + custasTotal;

    return {
      ...r,
      mesesAtraso,
      juros: Math.round(juros * 100),
      multa: Math.round(multa * 100),
      correcao: Math.round(correcao * 100),
      honorarios: Math.round(honorarios * 100),
      custas: Math.round(custasTotal * 100),
      totalAtualizado: Math.round(totalAtualizado * 100),
      categoria: r.status === "judicial" ? "ajuizada" : "padrao",
    };
  });

  // Acréscimos globais distribuídos igualmente por linha
  const custasGlobais = filtro.custasJudiciais ?? 0;
  const outrasDespesas = filtro.outrasDespesas ?? 0;
  const numLinhas = rowsComEncargos.length;
  const custasGlobaisPorLinha = numLinhas > 0 ? Math.round(custasGlobais / numLinhas) : 0;
  const outrasPorLinha = numLinhas > 0 ? Math.round(outrasDespesas / numLinhas) : 0;

  const rowsFinal = rowsComEncargos.map((r) => ({
    ...r,
    custasGlobais: custasGlobaisPorLinha,
    outrasDespesas: outrasPorLinha,
    totalFinal: r.totalAtualizado + custasGlobaisPorLinha + outrasPorLinha,
  }));

  // Totalizadores
  const totais = {
    totalDevedores: new Set(rowsFinal.map((r) => r.devedorId)).size,
    totalCobrado: rowsFinal.length,
    totalValorOriginal: rowsFinal.reduce((s, r) => s + (r.valorOriginal ?? 0), 0),
    totalJuros: rowsFinal.reduce((s, r) => s + r.juros, 0),
    totalMulta: rowsFinal.reduce((s, r) => s + r.multa, 0),
    totalCorrecao: rowsFinal.reduce((s, r) => s + r.correcao, 0),
    totalHonorarios: rowsFinal.reduce((s, r) => s + r.honorarios, 0),
    totalCustas: rowsFinal.reduce((s, r) => s + r.custas + r.custasGlobais, 0),
    totalOutras: rowsFinal.reduce((s, r) => s + r.outrasDespesas, 0),
    totalAtualizado: rowsFinal.reduce((s, r) => s + r.totalFinal, 0),
  };

  return { rows: rowsFinal, totais };
}

// ─── 6. Relatório de Cobrança / Produtividade Detalhado ──────────────────────
type FiltroRelatorioCobranca = {
  condominioId?: number;
  devedorId?: number;
  dataInicio?: string;
  dataFim?: string;
  resultadoContato?: string[];
  tipoContato?: string[];
  responsavelId?: number;
};

export async function getRelatorioCobranca(filtro: FiltroRelatorioCobranca) {
  const db = await getDb();
  if (!db) return {
    rows: [],
    totais: { total: 0, semResposta: 0, promessa: 0, deseja_acordo: 0, recusa: 0, outro: 0 },
    porTipo: {},
    porResponsavel: [],
  };

  const cond: any[] = [];

  if (filtro.condominioId) cond.push(eq(devedores.condominioId, filtro.condominioId));
  if (filtro.devedorId) cond.push(eq(tentativasCobranca.devedorId, filtro.devedorId));
  if (filtro.dataInicio) cond.push(gte(tentativasCobranca.attemptDate, new Date(filtro.dataInicio)));
  if (filtro.dataFim) {
    const fim = new Date(filtro.dataFim);
    fim.setHours(23, 59, 59, 999);
    cond.push(lte(tentativasCobranca.attemptDate, fim));
  }
  if (filtro.responsavelId) cond.push(eq(tentativasCobranca.userId, filtro.responsavelId));

  // Filtro de resultado
  if (filtro.resultadoContato && filtro.resultadoContato.length > 0) {
    type ResultadoEnum = "sem_resposta" | "promessa_pagamento" | "deseja_acordo" | "recusa" | "outro";
    cond.push(inArray(tentativasCobranca.result, filtro.resultadoContato as ResultadoEnum[]));
  }

  // Filtro de tipo de contato (sistema = não tem userId de operador real, ou contactType não existe no enum)
  // "sistema" é tratado como tentativas sem userId humano (automação)
  if (filtro.tipoContato && filtro.tipoContato.length > 0) {
    const tiposHumanos = filtro.tipoContato.filter(t => t !== "sistema");
    const incluiSistema = filtro.tipoContato.includes("sistema");

    if (tiposHumanos.length > 0 && !incluiSistema) {
      type ContactEnum = "telefone" | "email" | "pessoal" | "whatsapp";
      cond.push(inArray(tentativasCobranca.contactType, tiposHumanos as ContactEnum[]));
    }
    // Se inclui sistema e humanos: sem filtro de tipo (busca todos)
    // Se só sistema: filtramos por notes contendo "[AUTOMÁTICO" ou userId nulo
    if (incluiSistema && tiposHumanos.length === 0) {
      // Tentativas automáticas têm notes com prefixo [AUTOMÁTICO
      cond.push(like(tentativasCobranca.notes, "[AUTOMÁTICO%"));
    }
  }

  const rows = await db
    .select({
      id: tentativasCobranca.id,
      devedorId: tentativasCobranca.devedorId,
      nomeDevedor: devedores.name,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      responsavelId: users.id,
      responsavelNome: users.name,
      responsavelEmail: users.email,
      tipoContato: tentativasCobranca.contactType,
      resultado: tentativasCobranca.result,
      notas: tentativasCobranca.notes,
      dataContato: tentativasCobranca.attemptDate,
      proximaData: tentativasCobranca.nextAttemptDate,
    })
    .from(tentativasCobranca)
    .innerJoin(users, eq(tentativasCobranca.userId, users.id))
    .innerJoin(devedores, eq(tentativasCobranca.devedorId, devedores.id))
    .innerJoin(condominios, eq(devedores.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(tentativasCobranca.attemptDate))
    .limit(5000);

  // Totalizadores
  const totais = {
    total: rows.length,
    semResposta: rows.filter(r => r.resultado === "sem_resposta").length,
    promessa: rows.filter(r => r.resultado === "promessa_pagamento").length,
    deseja_acordo: rows.filter(r => r.resultado === "deseja_acordo").length,
    recusa: rows.filter(r => r.resultado === "recusa").length,
    outro: rows.filter(r => r.resultado === "outro" || !r.resultado).length,
  };

  // Por tipo de contato
  const porTipo: Record<string, number> = {};
  for (const r of rows) {
    const tipo = r.tipoContato ?? "desconhecido";
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
  }

  // Por responsável
  const mapaResp = new Map<number, { nome: string; total: number; promessa: number; semResposta: number; recusa: number }>();
  for (const r of rows) {
    const existing = mapaResp.get(r.responsavelId);
    if (existing) {
      existing.total++;
      if (r.resultado === "promessa_pagamento") existing.promessa++;
      if (r.resultado === "sem_resposta") existing.semResposta++;
      if (r.resultado === "recusa") existing.recusa++;
    } else {
      mapaResp.set(r.responsavelId, {
        nome: r.responsavelNome ?? "Sem nome",
        total: 1,
        promessa: r.resultado === "promessa_pagamento" ? 1 : 0,
        semResposta: r.resultado === "sem_resposta" ? 1 : 0,
        recusa: r.resultado === "recusa" ? 1 : 0,
      });
    }
  }
  const porResponsavel = Array.from(mapaResp.entries()).map(([id, v]) => ({
    id,
    nome: v.nome,
    total: v.total,
    promessa: v.promessa,
    semResposta: v.semResposta,
    recusa: v.recusa,
    taxaSucesso: v.total > 0 ? Math.round((v.promessa / v.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);

  return { rows, totais, porTipo, porResponsavel };
}

// ─── Relatório de Acordos Detalhado ──────────────────────────────────────────
export async function getRelatorioAcordosDetalhado(filtro: FiltroBase) {
  const db = await getDb();
  if (!db) return { acordos: [], totais: { totalAcordos: 0, valorTotal: 0, valorPago: 0 } };

  // Usar imports do topo do arquivo
  const acordosTable = acordos;

  const cond: any[] = [];
  if (filtro.condominioId) cond.push(eq(acordosTable.condominioId, filtro.condominioId));
  if (filtro.dataInicio) cond.push(gte(acordosTable.createdAt, new Date(filtro.dataInicio)));
  if (filtro.dataFim) {
    const fim = new Date(filtro.dataFim);
    fim.setHours(23, 59, 59, 999);
    cond.push(lte(acordosTable.createdAt, fim));
  }

  // 1. Buscar acordos com dados do devedor e condomínio
  const listaAcordos = await db
    .select({
      acordoId: acordosTable.id,
      status: acordosTable.status,
      totalAmount: acordosTable.totalAmount,
      agreedAmount: acordosTable.agreedAmount,
      installments: acordosTable.installments,
      firstPaymentDate: acordosTable.firstPaymentDate,
      valorPago: acordosTable.valorPago,
      notes: acordosTable.notes,
      createdAt: acordosTable.createdAt,
      nomeDevedor: devedores.name,
      cpfCnpj: devedores.cpfCnpj,
      unidade: devedores.unitNumber,
      bloco: devedores.bloco,
      nomeCondominio: condominios.name,
      condominioId: condominios.id,
    })
    .from(acordosTable)
    .innerJoin(devedores, eq(acordosTable.devedorId, devedores.id))
    .innerJoin(condominios, eq(acordosTable.condominioId, condominios.id))
    .where(cond.length > 0 ? and(...cond) : undefined)
    .orderBy(desc(acordosTable.createdAt))
    .limit(500);

  if (listaAcordos.length === 0) {
    return { acordos: [], totais: { totalAcordos: 0, valorTotal: 0, valorPago: 0 } };
  }

  const acordoIds = listaAcordos.map((a) => a.acordoId);

  // 2. Buscar cobranças originais de todos os acordos (via acordoCobrancas)
  const cobrancasOriginais = await db
    .select({
      acordoId: acordoCobrancas.acordoId,
      cobrancaId: acordoCobrancas.cobrancaId,
      valorOriginalAcordo: acordoCobrancas.valorOriginal,
      descricao: cobrancas.description,
      tipoCobranca: cobrancas.tipoCobranca,
      dataVencimento: cobrancas.dueDate,
      monthReference: cobrancas.monthReference,
      valorCobranca: cobrancas.amount,
    })
    .from(acordoCobrancas)
    .innerJoin(cobrancas, eq(acordoCobrancas.cobrancaId, cobrancas.id))
    .where(inArray(acordoCobrancas.acordoId, acordoIds))
    .orderBy(cobrancas.dueDate);

  // 3. Buscar parcelas de todos os acordos
  const parcelas = await db
    .select({
      acordoId: parcelasAcordo.acordoId,
      parcelaId: parcelasAcordo.id,
      installmentNumber: parcelasAcordo.installmentNumber,
      amount: parcelasAcordo.amount,
      dueDate: parcelasAcordo.dueDate,
      paymentDate: parcelasAcordo.paymentDate,
      status: parcelasAcordo.status,
      nossoNumero: parcelasAcordo.nossoNumero,
      snapshotDescricao: parcelasAcordo.snapshotDescricao,
      snapshotPrincipal: parcelasAcordo.snapshotPrincipal,
      snapshotJuros: parcelasAcordo.snapshotJuros,
      snapshotMulta: parcelasAcordo.snapshotMulta,
      snapshotCorrecao: parcelasAcordo.snapshotCorrecao,
      snapshotHonorarios: parcelasAcordo.snapshotHonorarios,
      snapshotValorAtualizado: parcelasAcordo.snapshotValorAtualizado,
    })
    .from(parcelasAcordo)
    .where(inArray(parcelasAcordo.acordoId, acordoIds))
    .orderBy(parcelasAcordo.installmentNumber);

  // 4. Agrupar por acordoId
  const cobrancasPorAcordo: Record<number, typeof cobrancasOriginais> = {};
  for (const c of cobrancasOriginais) {
    if (!cobrancasPorAcordo[c.acordoId]) cobrancasPorAcordo[c.acordoId] = [];
    cobrancasPorAcordo[c.acordoId].push(c);
  }

  const parcelasPorAcordo: Record<number, typeof parcelas> = {};
  for (const p of parcelas) {
    if (!parcelasPorAcordo[p.acordoId]) parcelasPorAcordo[p.acordoId] = [];
    parcelasPorAcordo[p.acordoId].push(p);
  }

  // 5. Montar resultado final
  const resultado = listaAcordos.map((a) => {
    const cobsAcordo = cobrancasPorAcordo[a.acordoId] ?? [];
    const parcsAcordo = parcelasPorAcordo[a.acordoId] ?? [];
    const somaOriginal = cobsAcordo.reduce((s, c) => s + (c.valorOriginalAcordo ?? 0), 0);
    const acrescimos = (a.agreedAmount ?? 0) - somaOriginal;
    const valorPagoEfetivo = parcsAcordo
      .filter((p) => p.status === "pago")
      .reduce((s, p) => s + (p.amount ?? 0), 0);

    return {
      ...a,
      cobrancasOriginais: cobsAcordo,
      parcelas: parcsAcordo,
      somaOriginal,
      acrescimos: acrescimos > 0 ? acrescimos : 0,
      valorPagoEfetivo,
    };
  });

  const totais = {
    totalAcordos: resultado.length,
    valorTotal: resultado.reduce((s, a) => s + (a.agreedAmount ?? 0), 0),
    valorPago: resultado.reduce((s, a) => s + a.valorPagoEfetivo, 0),
  };

  return { acordos: resultado, totais };
}
