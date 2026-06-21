import { getDb } from "./db";
import { reguasCobranca, reguaPosicoes, reguaDisparos, cobrancas, devedores, tentativasCobranca } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

type TipoCobrancaRegua = "todos" | "condominio" | "salao_jogos" | "churrasqueira" | "cota_extra" | "multa" | "outros";
type TipoAcao = "whatsapp" | "email" | "sms" | "carta" | "ligacao" | "notificacao_interna";

// ===== RÉGUAS =====

export async function listReguasGlobal() {
  const db = await getDb();
  if (!db) return null as any;
  const reguas = await db
    .select()
    .from(reguasCobranca)
    .orderBy(desc(reguasCobranca.createdAt));

  const result = await Promise.all(
    reguas.map(async (regua) => {
      const posicoes = await db
        .select()
        .from(reguaPosicoes)
        .where(eq(reguaPosicoes.reguaId, regua.id))
        .orderBy(reguaPosicoes.diasInadimplencia);
      return { ...regua, posicoes };
    })
  );

  return result;
}

export async function listReguasByCondominio(condominioId: number) {
  const db = await getDb();
  if (!db) return null as any;
  const reguas = await db
    .select()
    .from(reguasCobranca)
    .where(eq(reguasCobranca.condominioId, condominioId))
    .orderBy(desc(reguasCobranca.createdAt));

  const result = await Promise.all(
    reguas.map(async (regua) => {
      const posicoes = await db
        .select()
        .from(reguaPosicoes)
        .where(eq(reguaPosicoes.reguaId, regua.id))
        .orderBy(reguaPosicoes.diasInadimplencia);
      return { ...regua, posicoes };
    })
  );

  return result;
}

export async function getReguaById(id: number) {
  const db = await getDb();
  if (!db) return null as any;
  const [regua] = await db
    .select()
    .from(reguasCobranca)
    .where(eq(reguasCobranca.id, id))
    .limit(1);

  if (!regua) return null;

  const posicoes = await db
    .select()
    .from(reguaPosicoes)
    .where(eq(reguaPosicoes.reguaId, id))
    .orderBy(reguaPosicoes.diasInadimplencia);

  return { ...regua, posicoes };
}

export async function createRegua(data: {
  condominioId?: number | null;
  nome: string;
  descricao?: string;
  tipoCobranca?: TipoCobrancaRegua;
  ativa?: number;
  abrangenciaCondominio?: "todos" | "selecionados";
  condominiosSelecionados?: string | null;
  abrangenciaCategoria?: "todos" | "padrao" | "ajuizada";
  finalidades?: string | null;
  criterios?: string | null;
  regrasBloqueio?: string | null;
  prioridade?: number;
  intervaloMinimoContatos?: number;
}) {
  const db = await getDb();
  if (!db) return null as any;
  const [result] = await db.insert(reguasCobranca).values({
    condominioId: data.condominioId ?? null,
    nome: data.nome,
    descricao: data.descricao,
    tipoCobranca: data.tipoCobranca ?? "todos",
    ativa: data.ativa ?? 1,
    abrangenciaCondominio: data.abrangenciaCondominio ?? "todos",
    condominiosSelecionados: data.condominiosSelecionados ?? null,
    abrangenciaCategoria: data.abrangenciaCategoria ?? "todos",
    finalidades: data.finalidades ?? null,
    criterios: data.criterios ?? null,
    regrasBloqueio: data.regrasBloqueio ?? null,
    prioridade: data.prioridade ?? 0,
    intervaloMinimoContatos: data.intervaloMinimoContatos ?? 0,
  });
  return result.insertId;
}

export async function updateRegua(id: number, data: {
  nome?: string;
  descricao?: string;
  tipoCobranca?: TipoCobrancaRegua;
  ativa?: number;
  abrangenciaCondominio?: "todos" | "selecionados";
  condominiosSelecionados?: string | null;
  abrangenciaCategoria?: "todos" | "padrao" | "ajuizada";
  finalidades?: string | null;
  criterios?: string | null;
  regrasBloqueio?: string | null;
  prioridade?: number;
  intervaloMinimoContatos?: number;
}) {
  const db = await getDb();
  if (!db) return null as any;
  await db.update(reguasCobranca).set(data).where(eq(reguasCobranca.id, id));
}

export async function deleteRegua(id: number) {
  const db = await getDb();
  if (!db) return null as any;
  const posicoes = await db
    .select({ id: reguaPosicoes.id })
    .from(reguaPosicoes)
    .where(eq(reguaPosicoes.reguaId, id));

  if (posicoes.length > 0) {
    const posicaoIds = posicoes.map((p) => p.id);
    await db.delete(reguaDisparos).where(inArray(reguaDisparos.posicaoId, posicaoIds));
    await db.delete(reguaPosicoes).where(eq(reguaPosicoes.reguaId, id));
  }
  await db.delete(reguasCobranca).where(eq(reguasCobranca.id, id));
}

// ===== POSIÇÕES =====

export async function createPosicao(data: {
  reguaId: number;
  diasInadimplencia: number;
  tipoAcao: TipoAcao;
  titulo: string;
  template?: string;
  ordem?: number;
  ativa?: number;
}) {
  const db = await getDb();
  if (!db) return null as any;
  const [result] = await db.insert(reguaPosicoes).values({
    reguaId: data.reguaId,
    diasInadimplencia: data.diasInadimplencia,
    tipoAcao: data.tipoAcao,
    titulo: data.titulo,
    template: data.template,
    ordem: data.ordem ?? 0,
    ativa: data.ativa ?? 1,
  });
  return result.insertId;
}

export async function updatePosicao(id: number, data: {
  diasInadimplencia?: number;
  tipoAcao?: TipoAcao;
  titulo?: string;
  template?: string;
  ordem?: number;
  ativa?: number;
}) {
  const db = await getDb();
  if (!db) return null as any;
  await db.update(reguaPosicoes).set(data).where(eq(reguaPosicoes.id, id));
}

export async function deletePosicao(id: number) {
  const db = await getDb();
  if (!db) return null as any;
  await db.delete(reguaDisparos).where(eq(reguaDisparos.posicaoId, id));
  await db.delete(reguaPosicoes).where(eq(reguaPosicoes.id, id));
}

// ===== ENGINE DE EXECUÇÃO =====

function substituirVariaveis(template: string, dados: {
  nome: string;
  cpfCnpj?: string | null;
  unidade: string;
  bloco?: string | null;
  valor: number;
  vencimento: Date | null;
  diasAtraso: number;
  condominio: string;
}): string {
  const valorFormatado = (dados.valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const vencimentoFormatado = dados.vencimento
    ? new Date(dados.vencimento).toLocaleDateString("pt-BR")
    : "N/A";

  return template
    .replace(/\{\{nome\}\}/gi, dados.nome)
    .replace(/\{\{cpf_cnpj\}\}/gi, dados.cpfCnpj ?? "")
    .replace(/\{\{unidade\}\}/gi, dados.unidade)
    .replace(/\{\{bloco\}\}/gi, dados.bloco ?? "")
    .replace(/\{\{valor\}\}/gi, valorFormatado)
    .replace(/\{\{vencimento\}\}/gi, vencimentoFormatado)
    .replace(/\{\{dias_atraso\}\}/gi, String(dados.diasAtraso))
    .replace(/\{\{condominio\}\}/gi, dados.condominio);
}

export async function executarRegua(reguaId: number, condominioId?: number | null): Promise<{
  disparosRealizados: number;
  disparosIgnorados: number;
  erros: string[];
}> {
  const db = await getDb();
  if (!db) return { disparosRealizados: 0, disparosIgnorados: 0, erros: ["DB não disponível"] };
  const regua = await getReguaById(reguaId);
  if (!regua || !regua.ativa) {
    return { disparosRealizados: 0, disparosIgnorados: 0, erros: ["Régua não encontrada ou inativa"] };
  }

  const posicoes = regua.posicoes.filter((p: { ativa: number | null }) => p.ativa);
  if (posicoes.length === 0) {
    return { disparosRealizados: 0, disparosIgnorados: 0, erros: ["Nenhuma posição ativa na régua"] };
  }

  // Régua global: aplica a todos os condomínios; régua específica: filtra pelo condominioId
  const condIdFiltro = condominioId ?? regua.condominioId;

  const cobrancasFiltradas = await db
    .select({
      id: cobrancas.id,
      devedorId: cobrancas.devedorId,
      amount: cobrancas.amount,
      dueDate: cobrancas.dueDate,
      tipoCobranca: cobrancas.tipoCobranca,
      status: cobrancas.status,
    })
    .from(cobrancas)
    .where(
      condIdFiltro
        ? and(eq(cobrancas.condominioId, condIdFiltro), inArray(cobrancas.status, ["pendente", "em_cobranca"]))
        : inArray(cobrancas.status, ["pendente", "em_cobranca"])
    );

  const cobrancasAlvo = regua.tipoCobranca === "todos"
    ? cobrancasFiltradas
    : cobrancasFiltradas.filter((c) => c.tipoCobranca === regua.tipoCobranca);

  if (cobrancasAlvo.length === 0) {
    return { disparosRealizados: 0, disparosIgnorados: 0, erros: [] };
  }

  const devedorIdsSet = new Set<number>(cobrancasAlvo.map((c) => c.devedorId));
  const devedorIds = Array.from(devedorIdsSet);
  const devedoresMap = new Map<number, { name: string | null; cpfCnpj: string | null; unitNumber: string; bloco: string | null }>();

  if (devedorIds.length > 0) {
    const devedoresList = await db
      .select({ id: devedores.id, name: devedores.name, cpfCnpj: devedores.cpfCnpj, unitNumber: devedores.unitNumber, bloco: devedores.bloco })
      .from(devedores)
      .where(inArray(devedores.id, devedorIds));
    devedoresList.forEach((d) => devedoresMap.set(d.id, d));
  }

  const disparosExistentes = await db
    .select({ posicaoId: reguaDisparos.posicaoId, cobrancaId: reguaDisparos.cobrancaId })
    .from(reguaDisparos)
    .where(eq(reguaDisparos.reguaId, reguaId));

  const disparosSet = new Set<string>(disparosExistentes.map((d) => `${d.posicaoId}-${d.cobrancaId}`));

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let disparosRealizados = 0;
  let disparosIgnorados = 0;
  const erros: string[] = [];

  for (const cobranca of cobrancasAlvo) {
    if (!cobranca.dueDate) continue;

    const vencimento = new Date(cobranca.dueDate);
    vencimento.setHours(0, 0, 0, 0);
    const diffMs = hoje.getTime() - vencimento.getTime();
    const diasAtraso = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const devedor = devedoresMap.get(cobranca.devedorId);
    if (!devedor) continue;

    const nomeDevedor = devedor.name ?? `${devedor.bloco ? devedor.bloco + " - " : ""}Unidade ${devedor.unitNumber}`;

    for (const posicao of posicoes) {
      const chave = `${posicao.id}-${cobranca.id}`;

      if (disparosSet.has(chave)) {
        disparosIgnorados++;
        continue;
      }

      const deveDisparar = posicao.diasInadimplencia <= diasAtraso;
      if (!deveDisparar) {
        disparosIgnorados++;
        continue;
      }

      try {
        const mensagem = posicao.template
          ? substituirVariaveis(posicao.template, {
              nome: nomeDevedor,
              cpfCnpj: devedor.cpfCnpj,
              unidade: devedor.unitNumber,
              bloco: devedor.bloco,
              valor: cobranca.amount,
              vencimento: cobranca.dueDate,
              diasAtraso,
              condominio: "Condomínio",
            })
          : null;

        let tentativaId: number | null = null;
        if (["whatsapp", "email", "ligacao"].includes(posicao.tipoAcao)) {
          const contactTypeMap: Record<string, "telefone" | "email" | "pessoal" | "whatsapp"> = {
            whatsapp: "whatsapp",
            email: "email",
            ligacao: "telefone",
          };
          const [tentResult] = await db.insert(tentativasCobranca).values({
            cobrancaId: cobranca.id,
            devedorId: cobranca.devedorId,
            condominioId: condIdFiltro ?? 0,
            userId: 1,
            contactType: contactTypeMap[posicao.tipoAcao] ?? "whatsapp",
            notes: `[AUTOMÁTICO - Régua: ${regua.nome}] ${mensagem ?? posicao.titulo}`,
            result: "outro",
            attemptDate: new Date(),
          });
          tentativaId = tentResult.insertId;
        }

        await db.insert(reguaDisparos).values({
          reguaId,
          posicaoId: posicao.id,
          cobrancaId: cobranca.id,
          devedorId: cobranca.devedorId,
          condominioId: condIdFiltro ?? 0,
          diasInadimplencia: diasAtraso,
          tipoAcao: posicao.tipoAcao,
          mensagemGerada: mensagem,
          status: "enviado",
          tentativaId,
          dataDisparo: new Date(),
        });

        disparosSet.add(chave);
        disparosRealizados++;
      } catch (err) {
        erros.push(`Erro ao disparar posição ${posicao.id} para cobrança ${cobranca.id}: ${String(err)}`);
      }
    }
  }

  await db.update(reguasCobranca).set({ ultimaExecucao: new Date() }).where(eq(reguasCobranca.id, reguaId));

  return { disparosRealizados, disparosIgnorados, erros };
}

// ===== HISTÓRICO DE DISPAROS =====

export async function getDisparosByRegua(reguaId: number, limit = 100) {
  const db = await getDb();
  if (!db) return null as any;
  return db
    .select({
      id: reguaDisparos.id,
      posicaoId: reguaDisparos.posicaoId,
      cobrancaId: reguaDisparos.cobrancaId,
      devedorId: reguaDisparos.devedorId,
      diasInadimplencia: reguaDisparos.diasInadimplencia,
      tipoAcao: reguaDisparos.tipoAcao,
      mensagemGerada: reguaDisparos.mensagemGerada,
      status: reguaDisparos.status,
      dataDisparo: reguaDisparos.dataDisparo,
      devedorNome: devedores.name,
      devedorUnidade: devedores.unitNumber,
      devedorBloco: devedores.bloco,
    })
    .from(reguaDisparos)
    .leftJoin(devedores, eq(reguaDisparos.devedorId, devedores.id))
    .where(eq(reguaDisparos.reguaId, reguaId))
    .orderBy(desc(reguaDisparos.dataDisparo))
    .limit(limit);
}

export async function getDisparosByCondominio(condominioId: number, limit = 200) {
  const db = await getDb();
  if (!db) return null as any;
  return db
    .select({
      id: reguaDisparos.id,
      reguaId: reguaDisparos.reguaId,
      posicaoId: reguaDisparos.posicaoId,
      cobrancaId: reguaDisparos.cobrancaId,
      devedorId: reguaDisparos.devedorId,
      diasInadimplencia: reguaDisparos.diasInadimplencia,
      tipoAcao: reguaDisparos.tipoAcao,
      mensagemGerada: reguaDisparos.mensagemGerada,
      status: reguaDisparos.status,
      dataDisparo: reguaDisparos.dataDisparo,
      devedorNome: devedores.name,
      devedorUnidade: devedores.unitNumber,
      devedorBloco: devedores.bloco,
    })
    .from(reguaDisparos)
    .leftJoin(devedores, eq(reguaDisparos.devedorId, devedores.id))
    .where(eq(reguaDisparos.condominioId, condominioId))
    .orderBy(desc(reguaDisparos.dataDisparo))
    .limit(limit);
}
