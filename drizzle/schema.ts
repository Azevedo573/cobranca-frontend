import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["admin", "sindico", "cobrador"]).default("cobrador").notNull(),
  condominioId: int("condominioId"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const condominios = mysqlTable("condominios", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 2 }),
  zipCode: varchar("zipCode", { length: 10 }),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 320 }),
  managerName: varchar("managerName", { length: 255 }),
  managerEmail: varchar("managerEmail", { length: 320 }),
  username: varchar("username", { length: 100 }),
  password: varchar("password", { length: 255 }),
  taxaJurosMensal: decimal("taxaJurosMensal", { precision: 5, scale: 2 }).default("1.00"),
  taxaMulta: decimal("taxaMulta", { precision: 5, scale: 2 }).default("2.00"),
  taxaHonorarios: decimal("taxaHonorarios", { precision: 5, scale: 2 }).default("10.00"),
  descontoMaximo: decimal("descontoMaximo", { precision: 5, scale: 2 }).default("0.00"),
  correcaoMonetaria: decimal("correcaoMonetaria", { precision: 5, scale: 2 }).default("0.00"),
  indiceCorrecao: mysqlEnum("indiceCorrecao", ["NENHUM", "IPCA", "IGP-M", "INPC", "IGP-DI"]).default("NENHUM"),
  aplicarCorrecaoAuto: int("aplicarCorrecaoAuto").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const devedores = mysqlTable("devedores", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cpfCnpj: varchar("cpfCnpj", { length: 18 }),
  unitNumber: varchar("unitNumber", { length: 50 }).notNull(),
  bloco: varchar("bloco", { length: 50 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  totalDue: int("totalDue").default(0).notNull(),
  status: mysqlEnum("status", ["ativo", "pago", "acordo"]).default("ativo").notNull(),
  prioridade: mysqlEnum("prioridade", ["alta", "media", "baixa"]).default("media"),
  score: int("score").default(0),
  ultimaAtualizacaoScore: timestamp("ultimaAtualizacaoScore"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const cobrancas = mysqlTable("cobrancas", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
  tipoCobranca: mysqlEnum("tipoCobranca", ["condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).default("condominio").notNull(),
  description: text("description"),
  amount: int("amount").notNull(),
  custasJudiciais: int("custasJudiciais").default(0).notNull(),
  dueDate: timestamp("dueDate"),
  monthReference: varchar("monthReference", { length: 20 }),
  status: mysqlEnum("status", ["pendente", "em_cobranca", "pago", "acordo", "em_acordo", "acordo_atrasado"]).default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tentativasCobranca = mysqlTable("tentativasCobranca", {
  id: int("id").autoincrement().primaryKey(),
  cobrancaId: int("cobrancaId").notNull(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
  userId: int("userId").notNull(),
  contactType: mysqlEnum("contactType", ["telefone", "email", "pessoal", "whatsapp"]).notNull(),
  notes: text("notes"),
  result: mysqlEnum("result", ["sem_resposta", "promessa_pagamento", "deseja_acordo", "recusa", "outro"]),
  attemptDate: timestamp("attemptDate").defaultNow().notNull(),
  nextAttemptDate: timestamp("nextAttemptDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const acordos = mysqlTable("acordos", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
  acordoOrigemId: int("acordoOrigemId").notNull().default(0), // ID do acordo anterior que foi consolidado (0 = não é consolidação)
  valorPago: int("valorPago").default(0).notNull(),
  totalAmount: int("totalAmount").notNull(),
  agreedAmount: int("agreedAmount").notNull(),
  installments: int("installments").notNull(),
  firstPaymentDate: timestamp("firstPaymentDate").notNull(),
  paymentFrequency: mysqlEnum("paymentFrequency", ["mensal", "semanal", "quinzenal"]).default("mensal").notNull(),
  status: mysqlEnum("status", ["ativo", "pago", "cancelado"]).default("ativo").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const acordoCobrancas = mysqlTable("acordoCobrancas", {
  id: int("id").autoincrement().primaryKey(),
  acordoId: int("acordoId").notNull(),
  cobrancaId: int("cobrancaId").notNull(),
  valorOriginal: int("valorOriginal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const parcelasAcordo = mysqlTable("parcelasAcordo", {
  id: int("id").autoincrement().primaryKey(),
  acordoId: int("acordoId").notNull(),
  installmentNumber: int("installmentNumber").notNull(),
  amount: int("amount").notNull(),
  dueDate: timestamp("dueDate").notNull(),
  paymentDate: timestamp("paymentDate"),
  status: mysqlEnum("status", ["pendente", "pago", "atrasado"]).default("pendente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Condominio = typeof condominios.$inferSelect;
export type InsertCondominio = typeof condominios.$inferInsert;
export type Devedor = typeof devedores.$inferSelect;
export type InsertDevedor = typeof devedores.$inferInsert;
export type Cobranca = typeof cobrancas.$inferSelect;
export type InsertCobranca = typeof cobrancas.$inferInsert;
export type TentativaCobranca = typeof tentativasCobranca.$inferSelect;
export type InsertTentativaCobranca = typeof tentativasCobranca.$inferInsert;
export type Acordo = typeof acordos.$inferSelect;
export type InsertAcordo = typeof acordos.$inferInsert;
export type AcordoCobranca = typeof acordoCobrancas.$inferSelect;
export type InsertAcordoCobranca = typeof acordoCobrancas.$inferInsert;
export type ParcelaAcordo = typeof parcelasAcordo.$inferSelect;
export type InsertParcelaAcordo = typeof parcelasAcordo.$inferInsert;

// Tabela para armazenar índices de correção monetária do Banco Central
// Usa nome indicesBCB (com B maiúsculo) para manter compatibilidade com tabela existente
export const indicesbcb = mysqlTable("indicesBCB", {
  id: int("id").autoincrement().primaryKey(),
  indice: mysqlEnum("indice", ["IPCA", "IGP-M", "INPC", "IGP-DI"]).notNull(),
  mesReferencia: varchar("mesReferencia", { length: 10 }).notNull(), // Formato: YYYY-MM-01
  valor: decimal("valor", { precision: 10, scale: 4 }).notNull(), // Valor percentual do índice
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IndiceBCB = typeof indicesbcb.$inferSelect;
export type InsertIndiceBCB = typeof indicesbcb.$inferInsert;