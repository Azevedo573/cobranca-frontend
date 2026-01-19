import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const devedores = mysqlTable("devedores", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  unitNumber: varchar("unitNumber", { length: 50 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  totalDue: int("totalDue").default(0).notNull(),
  status: mysqlEnum("status", ["ativo", "pago", "acordo"]).default("ativo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const cobrancas = mysqlTable("cobrancas", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
  description: text("description"),
  amount: int("amount").notNull(),
  dueDate: timestamp("dueDate"),
  monthReference: varchar("monthReference", { length: 20 }),
  status: mysqlEnum("status", ["pendente", "em_cobranca", "pago", "acordo"]).default("pendente").notNull(),
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
  result: mysqlEnum("result", ["sem_resposta", "promessa_pagamento", "recusa", "outro"]),
  attemptDate: timestamp("attemptDate").defaultNow().notNull(),
  nextAttemptDate: timestamp("nextAttemptDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const acordos = mysqlTable("acordos", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
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
export type ParcelaAcordo = typeof parcelasAcordo.$inferSelect;
export type InsertParcelaAcordo = typeof parcelasAcordo.$inferInsert;