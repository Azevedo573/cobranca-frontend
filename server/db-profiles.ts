/**
 * db-profiles.ts
 * Helpers de banco de dados para o módulo de Perfis e Permissões (RBAC).
 */
import { getDb } from "./db";
import { profiles, profilePermissions, userProfileHistory, users } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── Definição dos módulos e ações disponíveis ────────────────────────────────

export const MODULOS = [
  { id: "dashboard",      label: "Dashboard",           grupo: "Visão Geral" },
  { id: "condominios",    label: "Condomínios",          grupo: "Cadastros" },
  { id: "devedores",      label: "Devedores",            grupo: "Cadastros" },
  { id: "cobrancas",      label: "Cobranças",            grupo: "Operações" },
  { id: "acordos",        label: "Acordos",              grupo: "Operações" },
  { id: "tentativas",     label: "Tentativas de Cobrança",grupo: "Operações" },
  { id: "importacoes",    label: "Importações",          grupo: "Operações" },
  { id: "banco",          label: "Banco / CNAB",         grupo: "Financeiro" },
  { id: "relatorios",     label: "Relatórios",           grupo: "Financeiro" },
  { id: "automacao",      label: "Automação / Réguas",   grupo: "Automação" },
  { id: "juridico_processos",  label: "Processos Judiciais",   grupo: "Jurídico" },
  { id: "juridico_prazos",      label: "Prazos Jurídicos",       grupo: "Jurídico" },
  { id: "juridico_demandas",    label: "Central de Demandas",   grupo: "Jurídico" },
  { id: "juridico_assembleias", label: "Assembleias",            grupo: "Jurídico" },
  { id: "juridico_intimacoes",  label: "Central de Intimações",  grupo: "Jurídico" },
  { id: "juridico_publicacoes", label: "Publicações Jurídicas",   grupo: "Jurídico" },
  { id: "juridico_config",      label: "Config. Jurídico / MNI", grupo: "Jurídico" },
  { id: "modelos_documento", label: "Modelos de Documentos", grupo: "Operações" },
  { id: "whatsapp",        label: "WhatsApp / Atendimento", grupo: "Comunicação" },
  { id: "configuracoes",  label: "Configurações",        grupo: "Administração" },
  { id: "usuarios",       label: "Usuários",             grupo: "Administração" },
  { id: "perfis",         label: "Perfis e Permissões",  grupo: "Administração" },
  { id: "auditoria",      label: "Auditoria",            grupo: "Administração" },
] as const;

export const ACOES = [
  { id: "visualizar", label: "Visualizar" },
  { id: "criar",      label: "Criar" },
  { id: "editar",     label: "Editar" },
  { id: "excluir",    label: "Excluir" },
  { id: "exportar",   label: "Exportar" },
  { id: "aprovar",    label: "Aprovar" },
] as const;

export type ModuloId = typeof MODULOS[number]["id"];
export type AcaoId   = typeof ACOES[number]["id"];

// ─── Perfis ───────────────────────────────────────────────────────────────────

export async function getAllProfiles() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(profiles).orderBy(profiles.nome);
}

export async function getProfileById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return result[0] ?? null;
}

export async function createProfile(data: {
  nome: string;
  descricao?: string;
  cor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(profiles).values({
    nome: data.nome,
    descricao: data.descricao ?? null,
    cor: data.cor ?? "#6366f1",
    isSystem: 0,
  });
  return { id: Number((result as any).insertId) };
}

export async function updateProfile(id: number, data: {
  nome?: string;
  descricao?: string;
  cor?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(profiles).set(data).where(eq(profiles.id, id));
  return { success: true };
}

export async function deleteProfile(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remover permissões associadas
  await db.delete(profilePermissions).where(eq(profilePermissions.profileId, id));
  // Desvincular usuários
  await db.update(users).set({ profileId: null }).where(eq(users.profileId, id));
  await db.delete(profiles).where(eq(profiles.id, id));
  return { success: true };
}

// ─── Permissões ───────────────────────────────────────────────────────────────

export async function getPermissionsByProfile(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(profilePermissions).where(eq(profilePermissions.profileId, profileId));
}

/**
 * Substitui todas as permissões de um perfil de uma vez.
 * Recebe um array de { modulo, acao, permitido }.
 */
export async function setPermissions(profileId: number, perms: Array<{
  modulo: string;
  acao: string;
  permitido: number;
}>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Apaga as existentes e reinsere
  await db.delete(profilePermissions).where(eq(profilePermissions.profileId, profileId));
  if (perms.length > 0) {
    await db.insert(profilePermissions).values(
      perms.map((p) => ({ profileId, modulo: p.modulo, acao: p.acao, permitido: p.permitido }))
    );
  }
  return { success: true };
}

// ─── Atribuição de perfil a usuário ──────────────────────────────────────────

export async function assignProfileToUser(userId: number, profileId: number | null, atribuidoPorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ profileId }).where(eq(users.id, userId));
  // Registrar histórico
  if (profileId !== null) {
    await db.insert(userProfileHistory).values({ userId, profileId, atribuidoPorId });
  }
  return { success: true };
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────

export async function getProfileStats() {
  const db = await getDb();
  if (!db) return [];
  const allProfiles = await db.select().from(profiles).orderBy(profiles.nome);
  const allUsers = await db.select({ id: users.id, profileId: users.profileId }).from(users);

  return allProfiles.map((p) => ({
    ...p,
    id: Number(p.id),
    totalUsuarios: allUsers.filter((u) => Number(u.profileId) === Number(p.id)).length,
  }));
}

// ─── Perfis padrão do sistema ─────────────────────────────────────────────────

export const PERFIS_PADRAO = [
  {
    nome: "Administrador Master",
    descricao: "Acesso total a todos os módulos e funcionalidades do sistema.",
    cor: "#ef4444",
    permissoes: "all", // atalho: todas as permissões
  },
  {
    nome: "Supervisor",
    descricao: "Visualiza e aprova operações. Pode exportar relatórios. Não pode excluir dados críticos.",
    cor: "#f59e0b",
    permissoes: ["dashboard:visualizar", "condominios:visualizar", "devedores:visualizar", "devedores:editar",
      "cobrancas:visualizar", "cobrancas:criar", "cobrancas:editar", "acordos:visualizar", "acordos:criar",
      "acordos:editar", "acordos:aprovar", "tentativas:visualizar", "tentativas:criar", "relatorios:visualizar",
      "relatorios:exportar", "automacao:visualizar",
      "juridico_processos:visualizar", "juridico_processos:criar", "juridico_processos:editar",
      "juridico_prazos:visualizar", "juridico_prazos:criar", "juridico_prazos:editar",
      "juridico_demandas:visualizar", "juridico_demandas:criar", "juridico_demandas:editar",
      "juridico_assembleias:visualizar", "juridico_intimacoes:visualizar", "juridico_publicacoes:visualizar",
      "usuarios:visualizar"],
  },
  {
    nome: "Operador",
    descricao: "Realiza cobranças e registra tentativas. Acesso operacional básico.",
    cor: "#3b82f6",
    permissoes: ["dashboard:visualizar", "devedores:visualizar", "cobrancas:visualizar", "cobrancas:criar",
      "tentativas:visualizar", "tentativas:criar", "acordos:visualizar", "acordos:criar"],
  },
  {
    nome: "Financeiro",
    descricao: "Acesso a relatórios, acordos e exportações financeiras.",
    cor: "#10b981",
    permissoes: ["dashboard:visualizar", "cobrancas:visualizar", "cobrancas:exportar", "acordos:visualizar",
      "acordos:criar", "acordos:editar", "acordos:aprovar", "relatorios:visualizar", "relatorios:exportar",
      "banco:visualizar", "banco:criar", "importacoes:visualizar", "importacoes:criar"],
  },
  {
    nome: "Jurídico",
    descricao: "Acesso ao módulo jurídico e visualização de devedores e cobranças.",
    cor: "#8b5cf6",
    permissoes: ["dashboard:visualizar", "devedores:visualizar", "cobrancas:visualizar",
      "juridico_processos:visualizar", "juridico_processos:criar", "juridico_processos:editar", "juridico_processos:aprovar",
      "juridico_prazos:visualizar", "juridico_prazos:criar", "juridico_prazos:editar",
      "juridico_demandas:visualizar", "juridico_demandas:criar", "juridico_demandas:editar",
      "juridico_assembleias:visualizar", "juridico_assembleias:criar",
      "juridico_intimacoes:visualizar", "juridico_publicacoes:visualizar",
      "relatorios:visualizar"],
  },
  {
    nome: "Síndico",
    descricao: "Acesso ao painel do condomínio. Visualização de cobranças e solicitações jurídicas.",
    cor: "#06b6d4",
    permissoes: ["dashboard:visualizar", "devedores:visualizar", "cobrancas:visualizar",
      "acordos:visualizar",
      "juridico_processos:visualizar", "juridico_processos:criar",
      "juridico_prazos:visualizar", "juridico_demandas:visualizar", "juridico_demandas:criar"],
  },
] as const;
