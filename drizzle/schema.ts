import { boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  role: mysqlEnum("role", ["admin", "sindico", "cobrador", "colaborador", "advogado"]).default("cobrador").notNull(),
  condominioId: int("condominioId"),
  isPrimaryAdmin: int("isPrimaryAdmin").default(0).notNull(), // 1 = administrador principal do condomínio
  isActive: int("isActive").default(1).notNull(),
  profileId: int("profileId"), // FK para profiles.id (nullable = sem perfil personalizado)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const condominios = mysqlTable("condominios", {
  id: int("id").autoincrement().primaryKey(),
  tipo: mysqlEnum("tipo", ["condominio", "empresa"]).default("condominio").notNull(),
  statusCadastro: varchar("statusCadastro", { length: 20 }).default("ativo").notNull(),
  dataRescisao: varchar("dataRescisao", { length: 10 }),
  motivoSaida: text("motivoSaida"),
  situacaoJuridica: varchar("situacaoJuridica", { length: 30 }),
  observacoesSaida: text("observacoesSaida"),
  name: varchar("name", { length: 255 }).notNull(),
  cnpj: varchar("cnpj", { length: 18 }),
  address: varchar("address", { length: 255 }),       // Logradouro
  addressNumber: varchar("addressNumber", { length: 20 }), // Número
  addressComplement: varchar("addressComplement", { length: 100 }), // Complemento
  neighborhood: varchar("neighborhood", { length: 100 }), // Bairro
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
  indiceCorrecao: mysqlEnum("indiceCorrecao", ["NENHUM", "IPCA", "IGP-M", "INPC", "IGP-DI"]).default("IPCA"),
  aplicarCorrecaoAuto: int("aplicarCorrecaoAuto").default(1).notNull(),
  // Emissor de Cobrança: define quem emite os boletos deste condomínio
  billingIssuer: mysqlEnum("billingIssuer", ["emissao_propria", "administradora", "outro"]).default("administradora").notNull(),
  customBillingIssuer: varchar("customBillingIssuer", { length: 255 }), // preenchido quando billingIssuer = 'outro'
  // Módulos ativos: JSON array com os módulos habilitados para este condomínio
  // Exemplo: '["cobranca","juridico"]'
  modulosAtivos: varchar("modulosAtivos", { length: 500 }).default('["cobranca"]').notNull(),
  maxParcelas: int("maxParcelas").default(12).notNull(),
  // Cancelamento automático de acordos com primeira parcela não paga
  cancelamentoAutoAtivo: int("cancelamentoAutoAtivo").default(0).notNull(),
  cancelamentoPrazoDias: int("cancelamentoPrazoDias").default(20).notNull(),
  // Régua de alertas progressivos de inadimplência de parcelas de acordo
  alertaParcela1Ativo: int("alertaParcela1Ativo").default(1).notNull(),   // Alerta 1: X dias após vencimento
  alertaParcela1Dias: int("alertaParcela1Dias").default(5).notNull(),
  alertaParcela2Ativo: int("alertaParcela2Ativo").default(1).notNull(),   // Alerta 2: X dias após vencimento
  alertaParcela2Dias: int("alertaParcela2Dias").default(10).notNull(),
  alertaParcela3Ativo: int("alertaParcela3Ativo").default(1).notNull(),   // Alerta crítico: X dias após vencimento
  alertaParcela3Dias: int("alertaParcela3Dias").default(30).notNull(),
  // Modo de emissão de boleto: cnab240 (padrão) ou api_btg (integração BTG em fase de testes)
  modoBoleto: mysqlEnum("modoBoleto", ["cnab240", "api_btg"]).default("cnab240").notNull(),
  // ─── Dados Jurídicos do Condomínio ───────────────────────────────────────
  juridicoAdvogadoResponsavel: varchar("juridicoAdvogadoResponsavel", { length: 255 }),  // Advogado responsável pelo condomínio
  juridicoAdvogadoOAB: varchar("juridicoAdvogadoOAB", { length: 30 }),                  // OAB do advogado responsável
  juridicoVaraCompetente: varchar("juridicoVaraCompetente", { length: 255 }),            // Vara competente para ações do condomínio
  juridicoForoComarca: varchar("juridicoForoComarca", { length: 255 }),                  // Foro/Comarca
  juridicoTribunalEstado: varchar("juridicoTribunalEstado", { length: 100 }),            // Tribunal estadual (ex: TJRJ, TJSP)
  juridicoConvencaoUrl: varchar("juridicoConvencaoUrl", { length: 500 }),               // URL da convenção condominial (S3)
  juridicoRegimentoUrl: varchar("juridicoRegimentoUrl", { length: 500 }),               // URL do regimento interno (S3)
  juridicoObservacoes: text("juridicoObservacoes"),                                     // Observações jurídicas gerais
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const devedores = mysqlTable("devedores", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  name: varchar("name", { length: 255 }), // Opcional: pode usar Bloco + Unidade como identificador
  cpfCnpj: varchar("cpfCnpj", { length: 18 }),
  unitNumber: varchar("unitNumber", { length: 50 }).notNull(),
  bloco: varchar("bloco", { length: 50 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }),
  // Endereço (necessário para emissão de boleto BTG)
  address: varchar("address", { length: 255 }),           // Logradouro
  addressNumber: varchar("addressNumber", { length: 20 }), // Número
  addressComplement: varchar("addressComplement", { length: 100 }), // Complemento
  neighborhood: varchar("neighborhood", { length: 100 }), // Bairro
  city: varchar("city", { length: 100 }),                 // Cidade
  state: varchar("state", { length: 2 }),                 // UF
  zipCode: varchar("zipCode", { length: 10 }),            // CEP
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
  status: mysqlEnum("status", ["pendente", "em_cobranca", "pago", "acordo", "em_acordo", "acordo_atrasado", "em_negociacao", "suspenso", "judicial", "cancelado"]).default("pendente").notNull(),
  paidAt: timestamp("paidAt"),
  paidAmount: int("paidAmount"),
  nossoNumero: varchar("nossoNumero", { length: 30 }), // Número do boleto/título para CNAB
  pixCopiaCola: text("pixCopiaCola"),                   // Pix copia e cola (EMV) retornado pelo banco no retorno D+1 (Bolepix)
  statusRemessa: mysqlEnum("statusRemessa", ["nao_enviado", "remessa_gerada", "enviado", "retorno_recebido"]).default("nao_enviado"),
  remessaId: int("remessaId"), // ID da remessa CNAB que gerou este boleto
  // Campos de integração BTG API
  btgCollectionId: varchar("btgCollectionId", { length: 100 }), // ID da cobrança no BTG
  btgBankSlipUrl: text("btgBankSlipUrl"),                        // URL do boleto PDF no BTG
  btgPixQrCode: text("btgPixQrCode"),                            // QR Code PIX (base64 ou URL)
  btgPixCopiaECola: text("btgPixCopiaECola"),                    // PIX copia e cola BTG
  btgStatus: varchar("btgStatus", { length: 30 }),               // Status no BTG: CREATED, PAID, CANCELED, EXPIRED...
  btgEmitidoEm: timestamp("btgEmitidoEm"),                       // Quando o boleto foi emitido via BTG
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const tentativasCobranca = mysqlTable("tentativasCobranca", {
  id: int("id").autoincrement().primaryKey(),
  cobrancaId: int("cobrancaId"),
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
  status: mysqlEnum("status", ["ativo", "pago", "cancelado", "inadimplente"]).default("ativo").notNull(),
  motivoQuebra: text("motivoQuebra"), // Motivo da quebra do acordo
  dataQuebra: timestamp("dataQuebra"),  // Data em que o acordo foi quebrado
  valorPagoAcordo: int("valorPagoAcordo").default(0), // Total efetivamente pago nas parcelas do acordo
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
  status: mysqlEnum("status", ["pendente", "pago", "atrasado", "cancelado"]).default("pendente").notNull(),
  // Snapshot de breakdown no momento do acordo (valores em centavos)
  snapshotPrincipal: int("snapshotPrincipal"),       // Valor principal da cobrança original
  snapshotJuros: int("snapshotJuros"),               // Juros acumulados na data do acordo
  snapshotMulta: int("snapshotMulta"),               // Multa na data do acordo
  snapshotCorrecao: int("snapshotCorrecao"),         // Correção monetária na data do acordo
  snapshotHonorarios: int("snapshotHonorarios"),     // Honorários na data do acordo
  snapshotValorAtualizado: int("snapshotValorAtualizado"), // Valor total atualizado na data do acordo
  snapshotDescricao: text("snapshotDescricao"),      // Descrição/referência da cobrança original
  // Campos de boleto CNAB 240
  nossoNumero: varchar("nossoNumero", { length: 30 }), // Nosso número BTG atribuído ao criar o acordo
  pixCopiaCola: text("pixCopiaCola"),                   // Pix copia e cola (EMV) retornado pelo banco no retorno D+1 (Bolepix)
  statusRemessa: mysqlEnum("statusRemessa", ["nao_enviado", "remessa_gerada", "enviado", "retorno_recebido"]).default("nao_enviado"),
  remessaId: int("remessaId"), // ID da remessa CNAB que incluiu esta parcela
  // Campos de integração BTG API
  btgCollectionId: varchar("btgCollectionId", { length: 100 }),
  btgBankSlipUrl: text("btgBankSlipUrl"),
  btgPixQrCode: text("btgPixQrCode"),
  btgPixCopiaECola: text("btgPixCopiaECola"),
  btgStatus: varchar("btgStatus", { length: 30 }),
  btgEmitidoEm: timestamp("btgEmitidoEm"),
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

// ─── Configuração BTG Pactual API ─────────────────────────────────────────────
// Credenciais de integração com a API BTG Empresas por condomínio
export const btgConfig = mysqlTable("btgConfig", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull().unique(), // 1 config por condomínio
  clientId: varchar("clientId", { length: 255 }).notNull(),
  clientSecret: text("clientSecret").notNull(), // armazenado criptografado
  companyId: varchar("companyId", { length: 50 }).notNull(), // CNPJ sem pontuação
  webhookSecret: varchar("webhookSecret", { length: 255 }), // Secret para validar webhooks
  // Token de acesso em cache
  accessToken: text("accessToken"),
  tokenExpiresAt: timestamp("tokenExpiresAt"),
  // Configurações de emissão
  diasVencimentoPadrao: int("diasVencimentoPadrao").default(30).notNull(), // dias até vencimento
  diasLimitePagamento: int("diasLimitePagamento").default(60).notNull(),   // dias após vencimento
  instrucoes: text("instrucoes"), // Instruções do boleto (texto livre)
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BtgConfig = typeof btgConfig.$inferSelect;
export type InsertBtgConfig = typeof btgConfig.$inferInsert;

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

// ===== RÉGUA DE COBRANÇA =====

// Tabela principal: define uma régua de cobrança para um condomínio
export const reguasCobranca = mysqlTable("reguasCobranca", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId"), // null = régua global (aplica a todos os condomínios)
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipoCobranca: mysqlEnum("tipoCobranca", ["todos", "condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).default("todos").notNull(),
  ativa: int("ativa").default(1).notNull(), // 1 = ativa, 0 = inativa
  ultimaExecucao: timestamp("ultimaExecucao"),
  // Abrangência
  abrangenciaCondominio: mysqlEnum("abrangenciaCondominio", ["todos", "selecionados"]).default("todos").notNull(),
  condominiosSelecionados: text("condominiosSelecionados"), // JSON: [1,2,3]
  abrangenciaCategoria: mysqlEnum("abrangenciaCategoria", ["todos", "padrao", "ajuizada"]).default("todos").notNull(),
  // Finalidades (JSON array de strings)
  finalidades: text("finalidades"), // JSON: ["debitos_abertos","acordo_ativo",...]
  // Critérios de elegibilidade (JSON)
  criterios: text("criterios"), // JSON com os filtros avançados
  // Regras de bloqueio (JSON)
  regrasBloqueio: text("regrasBloqueio"), // JSON com as regras de bloqueio
  // Prioridade entre réguas
  prioridade: int("prioridade").default(0).notNull(), // maior = mais prioritário
  // Intervalo mínimo entre contatos (dias)
  intervaloMinimoContatos: int("intervaloMinimoContatos").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Posições da régua: cada posição define uma ação em X dias de inadimplência
export const reguaPosicoes = mysqlTable("reguaPosicoes", {
  id: int("id").autoincrement().primaryKey(),
  reguaId: int("reguaId").notNull(),
  diasInadimplencia: int("diasInadimplencia").notNull(), // Ex: -3, 0, 5, 15, 30, 60
  tipoAcao: mysqlEnum("tipoAcao", ["whatsapp", "email", "sms", "carta", "ligacao", "notificacao_interna"]).notNull(),
  titulo: varchar("titulo", { length: 255 }).notNull(), // Ex: "Aviso de Vencimento"
  template: text("template"), // Texto da mensagem com variáveis: {{nome}}, {{valor}}, {{vencimento}}
  ordem: int("ordem").default(0).notNull(), // Ordem de exibição na linha do tempo
  ativa: int("ativa").default(1).notNull(),
  // Looping: repetir a partir de uma etapa específica
  loopAtivo: int("loopAtivo").default(0).notNull(), // 0=sem loop, 1=com loop
  loopAlvoPosicaoId: int("loopAlvoPosicaoId"), // ID da posição alvo do loop (null = repetir esta mesma)
  loopIntervaloDias: int("loopIntervaloDias").default(7), // Dias entre cada repetição do loop
  loopMaxRepeticoes: int("loopMaxRepeticoes").default(3), // Máximo de repetições (0 = ilimitado)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Histórico de disparos: registra cada vez que uma posição foi disparada para uma cobrança
export const reguaDisparos = mysqlTable("reguaDisparos", {
  id: int("id").autoincrement().primaryKey(),
  reguaId: int("reguaId").notNull(),
  posicaoId: int("posicaoId").notNull(),
  cobrancaId: int("cobrancaId").notNull(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
  diasInadimplencia: int("diasInadimplencia").notNull(), // Dias reais no momento do disparo
  tipoAcao: varchar("tipoAcao", { length: 50 }).notNull(),
  mensagemGerada: text("mensagemGerada"), // Mensagem com variáveis substituídas
  status: mysqlEnum("status", ["pendente", "enviado", "erro", "ignorado"]).default("pendente").notNull(),
  tentativaId: int("tentativaId"), // ID da tentativa criada automaticamente (se aplicável)
  dataDisparo: timestamp("dataDisparo").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ReguaCobranca = typeof reguasCobranca.$inferSelect;
export type InsertReguaCobranca = typeof reguasCobranca.$inferInsert;
export type ReguaPosicao = typeof reguaPosicoes.$inferSelect;
export type InsertReguaPosicao = typeof reguaPosicoes.$inferInsert;
export type ReguaDisparo = typeof reguaDisparos.$inferSelect;
export type InsertReguaDisparo = typeof reguaDisparos.$inferInsert;
// ============================================================
// Sprint 6 — Arquivos e Integração Bancária
// ============================================================

// Histórico de todas as importações realizadas no sistema
export const historicoImportacoes = mysqlTable("historicoImportacoes", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId"),
  usuarioId: int("usuarioId").notNull(),
  tipo: mysqlEnum("tipo", ["devedores", "dividas", "baixa_lote", "cnab_remessa", "cnab_retorno"]).notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  urlArquivo: text("urlArquivo"), // URL no S3 para download posterior
  totalRegistros: int("totalRegistros").default(0).notNull(),
  registrosSucesso: int("registrosSucesso").default(0).notNull(),
  registrosErro: int("registrosErro").default(0).notNull(),
  detalhesErros: text("detalhesErros"), // JSON com lista de erros por linha
  status: mysqlEnum("status", ["processando", "concluido", "erro"]).default("processando").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Remessas CNAB 240 geradas para envio ao banco
export const remessasCNAB = mysqlTable("remessasCNAB", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  usuarioId: int("usuarioId").notNull(),
  banco: varchar("banco", { length: 50 }).default("BTG").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  urlArquivo: text("urlArquivo"), // URL no S3
  totalTitulos: int("totalTitulos").default(0).notNull(),
  valorTotal: int("valorTotal").default(0).notNull(), // em centavos
  nossoNumeroInicio: varchar("nossoNumeroInicio", { length: 20 }),
  nossoNumeroFim: varchar("nossoNumeroFim", { length: 20 }),
  status: mysqlEnum("status", ["gerado", "enviado", "processado"]).default("gerado").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Retornos CNAB 240 processados
export const retornosCNAB = mysqlTable("retornosCNAB", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  usuarioId: int("usuarioId").notNull(),
  remessaId: int("remessaId"), // Referência à remessa original (opcional)
  banco: varchar("banco", { length: 50 }).default("BTG").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  urlArquivo: text("urlArquivo"),
  totalTitulos: int("totalTitulos").default(0).notNull(),
  titulosPagos: int("titulosPagos").default(0).notNull(),
  titulosRejeitados: int("titulosRejeitados").default(0).notNull(),
  valorTotalPago: int("valorTotalPago").default(0).notNull(), // em centavos
  detalhes: text("detalhes"), // JSON com detalhes de cada título processado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Boletos PDF enviados pelos usuários para disponibilização no sistema
export const boletosUpload = mysqlTable("boletosUpload", {
  id: int("id").autoincrement().primaryKey(),
  cobrancaId: int("cobrancaId").notNull(),
  condominioId: int("condominioId").notNull(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  urlS3: text("urlS3").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  tamanhoBytes: int("tamanhoBytes").default(0),
  mimeType: varchar("mimeType", { length: 100 }).default("application/pdf"),
  uploadedBy: int("uploadedBy").notNull(), // userId
  uploadedByName: varchar("uploadedByName", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Configuração Global CNAB 240 ─────────────────────────────────────────────
// Dados bancários do portador (empresa/escritório) — um único registro para toda a instalação.
// Os dados do beneficiário (nome, CNPJ) continuam por condomínio em configuracaoBoleto.
export const cnabConfigGlobal = mysqlTable("cnabConfigGlobal", {
  id: int("id").autoincrement().primaryKey(), // Sempre id=1 (registro único)
  // === Portador (Dados Bancários) ===
  banco: varchar("banco", { length: 10 }).default("208").notNull(),
  nomeBanco: varchar("nomeBanco", { length: 50 }).default("BTG PACTUAL").notNull(),
  agencia: varchar("agencia", { length: 10 }).default("0001").notNull(),
  digitoAgencia: varchar("digitoAgencia", { length: 2 }).default("0").notNull(),
  conta: varchar("conta", { length: 20 }).default("").notNull(),
  digitoConta: varchar("digitoConta", { length: 2 }).default("0").notNull(),
  convenio: varchar("convenio", { length: 30 }).default("").notNull(),
  ativo: int("ativo").default(1).notNull(),
  // === Configuração de Remessa ===
  minimosDiasAntesVencimento: int("minimosDiasAntesVencimento").default(0).notNull(),
  usarMinimoDias: int("usarMinimoDias").default(0).notNull(),
  enviarParcelasApenasPrimeiraPaga: int("enviarParcelasApenasPrimeiraPaga").default(0).notNull(),
  enviarParcelasApenasAnteriorPaga: int("enviarParcelasApenasAnteriorPaga").default(1).notNull(),
  // === Dados do Boleto ===
  carteira: varchar("carteira", { length: 5 }).default("1").notNull(),
  especieDocumento: varchar("especieDocumento", { length: 5 }).default("DD").notNull(),
  aceite: varchar("aceite", { length: 1 }).default("N").notNull(),
  localPagamento: varchar("localPagamento", { length: 500 }).default("PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO").notNull(),
  instrucoesCaixa: varchar("instrucoesCaixa", { length: 500 }).default("APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#").notNull(),
  taxaJurosDia: varchar("taxaJurosDia", { length: 10 }).default("0.03330").notNull(),
  taxaMulta: varchar("taxaMulta", { length: 10 }).default("2.00").notNull(),
  // === Configuração do Arquivo CNAB ===
  numeroSequencialArquivo: int("numeroSequencialArquivo").default(1).notNull(),
  padraoNomeArquivo: varchar("padraoNomeArquivo", { length: 100 }).default("REMESSA_ddmmyyyy.rem").notNull(),
  layoutArquivo: varchar("layoutArquivo", { length: 20 }).default("CNAB240").notNull(),
  enviarInstrucoesProtesto: int("enviarInstrucoesProtesto").default(0).notNull(),
  // === Forma de Pagamento ===
  habilitarBoleto: int("habilitarBoleto").default(1).notNull(),
  habilitarPix: int("habilitarPix").default(1).notNull(),
  // === Nosso Número (sequencial global) ===
  nossoNumeroAtual: int("nossoNumeroAtual").default(1000000001).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CnabConfigGlobal = typeof cnabConfigGlobal.$inferSelect;
export type InsertCnabConfigGlobal = typeof cnabConfigGlobal.$inferInsert;

// Configuração de Boleto/CNAB por condomínio (portador bancário + dados do boleto + config arquivo)
export const configuracaoBoleto = mysqlTable("configuracaoBoleto", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull().unique(), // 1 config por condomínio
  // === Portador (Dados Bancários) ===
  banco: varchar("banco", { length: 10 }).default("208").notNull(),     // 208 = BTG Pactual
  nomeBanco: varchar("nomeBanco", { length: 50 }).default("BTG PACTUAL").notNull(),
  agencia: varchar("agencia", { length: 10 }).default("0001").notNull(),
  digitoAgencia: varchar("digitoAgencia", { length: 2 }).default("0").notNull(),
  conta: varchar("conta", { length: 20 }).notNull(),
  digitoConta: varchar("digitoConta", { length: 2 }).default("0").notNull(),
  convenio: varchar("convenio", { length: 30 }).default("").notNull(),   // Código do convênio/cedente no banco
  ativo: int("ativo").default(1).notNull(),
  contaRepasse: int("contaRepasse").default(0).notNull(),
  // === Configuração de Remessa ===
  minimosDiasAntesVencimento: int("minimosDiasAntesVencimento").default(0).notNull(),
  usarMinimoDias: int("usarMinimoDias").default(0).notNull(),
  enviarParcelasApenasPrimeiraPaga: int("enviarParcelasApenasPrimeiraPaga").default(0).notNull(),
  enviarParcelasApenasAnteriorPaga: int("enviarParcelasApenasAnteriorPaga").default(1).notNull(),
  // === Dados do Boleto ===
  carteira: varchar("carteira", { length: 5 }).default("1").notNull(),   // 1 = Cobrança Simples
  especieDocumento: varchar("especieDocumento", { length: 5 }).default("DD").notNull(), // DD, DM, etc.
  aceite: varchar("aceite", { length: 1 }).default("N").notNull(),       // N ou S
  nomeBeneficiario: varchar("nomeBeneficiario", { length: 100 }),        // Pode diferir do nome do condomínio
  cnpjBeneficiario: varchar("cnpjBeneficiario", { length: 18 }),
  enderecoBeneficiario: varchar("enderecoBeneficiario", { length: 200 }),
  localPagamento: varchar("localPagamento", { length: 500 }).default("PAGAVEL EM QUALQUER BANCO ATE O VENCIMENTO").notNull(),
  instrucoesCaixa: varchar("instrucoesCaixa", { length: 500 }).default("APOS VENCIMENTO COBRAR MULTA DE #MULTA# e MORA DIARIA DE #JUROS#").notNull(),
  taxaJurosDia: varchar("taxaJurosDia", { length: 10 }).default("0.03330").notNull(), // % ao dia
  taxaMulta: varchar("taxaMulta", { length: 10 }).default("2.00").notNull(),           // % multa
  // === Configuração do Arquivo CNAB ===
  numeroSequencialArquivo: int("numeroSequencialArquivo").default(1).notNull(), // Incrementado a cada remessa
  padraoNomeArquivo: varchar("padraoNomeArquivo", { length: 100 }).default("BTG_ddmmyyyy.txt").notNull(),
  layoutArquivo: varchar("layoutArquivo", { length: 20 }).default("CNAB240").notNull(),
  enviarInstrucoesProtesto: int("enviarInstrucoesProtesto").default(0).notNull(),
  // === Forma de Pagamento ===
  habilitarBoleto: int("habilitarBoleto").default(1).notNull(),
  habilitarPix: int("habilitarPix").default(1).notNull(),
  taxaCobrancaValor: varchar("taxaCobrancaValor", { length: 15 }).default("3.50").notNull(), // Taxa cobrada do devedor por parcela
  taxaCobrancaPercentual: varchar("taxaCobrancaPercentual", { length: 10 }).default("0.00").notNull(),
  despesaValor: varchar("despesaValor", { length: 15 }).default("0.00").notNull(),
  despesaPercentual: varchar("despesaPercentual", { length: 10 }).default("0.00").notNull(),
  // === Pix ===
  chavePix: varchar("chavePix", { length: 100 }).default(""),           // Chave Pix do beneficiário
  tipoChavePix: mysqlEnum("tipoChavePix", ["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]).default("CNPJ"),
  // === Nosso Número ===
  nossoNumeroAtual: int("nossoNumeroAtual").default(1000000001).notNull(), // Sequencial por condomínio
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConfiguracaoBoleto = typeof configuracaoBoleto.$inferSelect;
export type InsertConfiguracaoBoleto = typeof configuracaoBoleto.$inferInsert;

export type BoletoUpload = typeof boletosUpload.$inferSelect;
export type InsertBoletoUpload = typeof boletosUpload.$inferInsert;
export type HistoricoImportacao = typeof historicoImportacoes.$inferSelect;
export type InsertHistoricoImportacao = typeof historicoImportacoes.$inferInsert;
export type RemessaCNAB = typeof remessasCNAB.$inferSelect;
export type InsertRemessaCNAB = typeof remessasCNAB.$inferInsert;
export type RetornoCNAB = typeof retornosCNAB.$inferSelect;
export type InsertRetornoCNAB = typeof retornosCNAB.$inferInsert;

// Itens individuais do arquivo de retorno CNAB 240
export const retornoItens = mysqlTable("retornoItens", {
  id: int("id").autoincrement().primaryKey(),
  retornoId: int("retornoId").notNull(),           // FK para retornosCNAB
  cobrancaId: int("cobrancaId"),                    // FK para cobrancas (pode ser null se não encontrado)
  nossoNumero: varchar("nossoNumero", { length: 30 }).notNull(),
  codMovimento: varchar("codMovimento", { length: 5 }).notNull(),
  descMovimento: varchar("descMovimento", { length: 100 }).notNull(),
  codOcorrencia: varchar("codOcorrencia", { length: 5 }),
  descOcorrencia: varchar("descOcorrencia", { length: 100 }),
  dataVencimento: timestamp("dataVencimento"),
  valorTitulo: int("valorTitulo").default(0).notNull(),  // em centavos
  valorPago: int("valorPago").default(0).notNull(),      // em centavos
  valorLiquido: int("valorLiquido").default(0),          // em centavos
  jurosMora: int("jurosMora").default(0),                // em centavos
  desconto: int("desconto").default(0),                  // em centavos
  abatimento: int("abatimento").default(0),              // em centavos
  iof: int("iof").default(0),                            // em centavos
  dataOcorrencia: timestamp("dataOcorrencia"),
  dataCredito: timestamp("dataCredito"),
  cpfCnpjPagador: varchar("cpfCnpjPagador", { length: 20 }),
  nomePagador: varchar("nomePagador", { length: 100 }),
  statusProcessamento: mysqlEnum("statusProcessamento", ["processado", "nao_encontrado", "erro"]).default("processado").notNull(),
  statusAnterior: varchar("statusAnterior", { length: 30 }),  // status da cobrança antes do processamento
  statusNovo: varchar("statusNovo", { length: 30 }),          // status da cobrança após o processamento
  observacao: text("observacao"),
  // Dados do Bolepix (Segmento Y-04) — preenchidos apenas quando o BTG retorna dados Pix
  pixTipoChave: varchar("pixTipoChave", { length: 20 }),      // CPF, CNPJ, Telefone, E-mail, Chave Aleatória
  pixChave: varchar("pixChave", { length: 100 }),             // Chave Pix ou URL do QRCode
  pixTxid: varchar("pixTxid", { length: 35 }),               // TXID do QRCode
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type RetornoItem = typeof retornoItens.$inferSelect;
export type InsertRetornoItem = typeof retornoItens.$inferInsert;

// ─── Recuperação de Senha ──────────────────────────────────────────────────
// Tokens temporários para fluxo "Esqueci minha senha"
// tokenHash = SHA-256 do token enviado por e-mail (nunca armazenar o token bruto)
export const passwordResetTokens = mysqlTable("passwordResetTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(), // SHA-256 hex
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  ipAddress: varchar("ipAddress", { length: 45 }), // IPv4 ou IPv6
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// ─── Módulo de Auditoria ──────────────────────────────────────────────────────
// Registra TODAS as ações relevantes do sistema para rastreabilidade e compliance.
// Imutável por design: nunca atualizar ou deletar registros de auditoria.
// Severidade: info | warning | critical
// Ação: login_success | login_failed | logout | create | update | delete |
//        export | generate_boleto | generate_remessa | process_retorno |
//        password_reset_request | password_reset_success | role_change |
//        bulk_action | access_denied
export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  // Quem fez a ação
  userId: int("userId"),                                        // null = ação anônima (ex: login falho)
  userName: varchar("userName", { length: 255 }),               // snapshot do nome no momento
  userRole: varchar("userRole", { length: 50 }),                // admin | user | colaborador | sindico
  userEmail: varchar("userEmail", { length: 255 }),             // snapshot do email
  // O que foi feito
  action: varchar("action", { length: 100 }).notNull(),         // ex: "create", "login_success"
  entity: varchar("entity", { length: 100 }),                   // ex: "devedor", "cobranca", "acordo"
  entityId: varchar("entityId", { length: 100 }),               // ID do registro afetado
  entityLabel: varchar("entityLabel", { length: 255 }),         // ex: "João Silva - Apto 101"
  // Contexto
  condominioId: int("condominioId"),                            // condomínio afetado
  condominioNome: varchar("condominioNome", { length: 255 }),   // snapshot do nome
  // Dados de auditoria
  beforeData: text("beforeData"),                               // JSON do estado anterior
  afterData: text("afterData"),                                 // JSON do estado posterior
  metadata: text("metadata"),                                   // JSON com dados extras
  // Segurança
  ipAddress: varchar("ipAddress", { length: 45 }).notNull().default("unknown"),
  userAgent: varchar("userAgent", { length: 500 }),
  sessionId: varchar("sessionId", { length: 100 }),
  // Classificação
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).notNull().default("info"),
  success: int("success").notNull().default(1),                 // 1=sucesso, 0=falha
  errorMessage: varchar("errorMessage", { length: 500 }),       // mensagem de erro se falhou
  // Timestamp imutável
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Modelos de Documentos ───────────────────────────────────────────────────
export const modelosDocumento = mysqlTable("modelosDocumento", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId"), // null = modelo global (todos os condomínios)
  nome: varchar("nome", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipo", [
    "proposta_acordo",
    "termo_acordo",
    "notificacao_debito",
    "carta_cobranca",
    "recibo_pagamento",
    "contrato_parcelamento",
    "outro",
  ]).notNull().default("outro"),
  // Conteúdo HTML do editor TipTap (inclui variáveis {{nomeDevedor}} etc.)
  conteudoHtml: text("conteudoHtml").notNull(),
  // Configurações visuais — Logo
  logoUrl: text("logoUrl"),           // URL S3 da logo do escritório
  logoAlinhamento: mysqlEnum("logoAlinhamento", ["esquerda", "centro", "direita"]).default("esquerda"),
  logoPosicaoVertical: mysqlEnum("logoPosicaoVertical", ["topo", "rodape"]).default("topo"),
  logoLargura: int("logoLargura").default(120), // largura em px (max 300)
  // Configurações visuais — Marca d'água
  marcaDaguaUrl: text("marcaDaguaUrl"), // URL S3 da imagem de marca d'água
  marcaDaguaOpacidade: int("marcaDaguaOpacidade").default(8), // 1-50 (%)
  marcaDaguaPosicao: mysqlEnum("marcaDaguaPosicao", ["diagonal", "centro", "topo", "rodape"]).default("diagonal"),
  // Editor visual (Canva-like) — JSON com array de CanvasElement
  canvasElements: text("canvasElements"), // JSON serializado
  // Configurações de página
  margemSuperior: int("margemSuperior").default(40),
  margemInferior: int("margemInferior").default(40),
  margemEsquerda: int("margemEsquerda").default(50),
  margemDireita: int("margemDireita").default(50),
  // Metadados
  ativo: int("ativo").default(1).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModeloDocumento = typeof modelosDocumento.$inferSelect;
export type InsertModeloDocumento = typeof modelosDocumento.$inferInsert;

// Anexos de imagens vinculados a um modelo de documento
export const modeloAnexos = mysqlTable("modeloAnexos", {
  id: int("id").autoincrement().primaryKey(),
  modeloId: int("modeloId").notNull(),
  url: text("url").notNull(),           // URL S3 do arquivo
  nomeOriginal: varchar("nomeOriginal", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  tamanhoBytes: int("tamanhoBytes").default(0),
  ordem: int("ordem").default(0),       // ordem de exibição no documento
  legenda: varchar("legenda", { length: 255 }),
  largura: int("largura").default(400), // largura em px no PDF
  alinhamento: mysqlEnum("alinhamento", ["esquerda", "centro", "direita"]).default("centro"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModeloAnexo = typeof modeloAnexos.$inferSelect;
export type InsertModeloAnexo = typeof modeloAnexos.$inferInsert;

// ─── Módulo Jurídico ─────────────────────────────────────────────────────────

export const juridicoTickets = mysqlTable("juridico_tickets", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  descricao: text("descricao").notNull(),
  categoria: mysqlEnum("categoria", [
    "consultoria",
    "notificacao",
    "acao_judicial",
    "cobranca_judicial",
    "assembleia",
    "contrato",
    "outro",
  ]).notNull().default("outro"),
  prioridade: mysqlEnum("prioridade", ["baixa", "media", "alta", "urgente"]).notNull().default("media"),
  status: mysqlEnum("status", [
    "aberto",
    "em_andamento",
    "aguardando_cliente",
    "resolvido",
    "cancelado",
  ]).notNull().default("aberto"),
  responsavelId: int("responsavelId"), // admin/cobrador responsável
  criadoPorId: int("criadoPorId").notNull(), // usuário que abriu
  resolvidoEm: timestamp("resolvidoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type JuridicoTicket = typeof juridicoTickets.$inferSelect;
export type InsertJuridicoTicket = typeof juridicoTickets.$inferInsert;

export const juridicoMensagens = mysqlTable("juridico_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  autorId: int("autorId").notNull(),
  conteudo: text("conteudo").notNull(),
  tipoAutor: mysqlEnum("tipoAutor", ["cliente", "escritorio", "sistema"]).notNull(),
  // Anexos armazenados como JSON array de { nome, url, tipo }
  anexos: text("anexos"), // JSON
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type JuridicoMensagem = typeof juridicoMensagens.$inferSelect;
export type InsertJuridicoMensagem = typeof juridicoMensagens.$inferInsert;

// ─── Módulo de Perfis e Permissões (RBAC) ────────────────────────────────────

/**
 * Perfis de acesso (ex: Supervisor, Operador, Financeiro, Jurídico)
 * Cada perfil agrupa um conjunto de permissões por módulo.
 */
export const profiles = mysqlTable("profiles", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"),
  cor: varchar("cor", { length: 20 }).default("#6366f1"), // cor do badge
  isSystem: int("isSystem").default(0).notNull(), // 1 = perfil do sistema, não pode ser excluído
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = typeof profiles.$inferInsert;

/**
 * Permissões por módulo/recurso para cada perfil.
 * Cada linha representa: perfil X pode fazer ação Y no módulo Z.
 *
 * Módulos disponíveis: dashboard, condominios, devedores, cobrancas, acordos,
 *   tentativas, relatorios, importacoes, automacao, juridico, banco, configuracoes,
 *   usuarios, perfis, auditoria
 *
 * Ações disponíveis: visualizar, criar, editar, excluir, exportar, aprovar
 */
export const profilePermissions = mysqlTable("profile_permissions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  modulo: varchar("modulo", { length: 60 }).notNull(),
  acao: varchar("acao", { length: 30 }).notNull(), // visualizar | criar | editar | excluir | exportar | aprovar
  permitido: int("permitido").default(1).notNull(), // 1 = permitido, 0 = negado
});
export type ProfilePermission = typeof profilePermissions.$inferSelect;
export type InsertProfilePermission = typeof profilePermissions.$inferInsert;

/**
 * Vínculo entre usuário e perfil.
 * Um usuário pode ter exatamente um perfil ativo.
 * O campo profileId é armazenado diretamente na tabela users (via coluna separada abaixo).
 * Esta tabela armazena o histórico de atribuições para auditoria.
 */
export const userProfileHistory = mysqlTable("user_profile_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  profileId: int("profileId").notNull(),
  atribuidoPorId: int("atribuidoPorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type UserProfileHistory = typeof userProfileHistory.$inferSelect;

// ─── Configuração de E-mail Microsoft 365 ────────────────────────────────────
export const emailConfig = mysqlTable("emailConfig", {
  id: int("id").autoincrement().primaryKey(),
  // Credenciais Azure AD (Microsoft Graph)
  tenantId: varchar("tenantId", { length: 255 }).notNull(),
  clientId: varchar("clientId", { length: 255 }).notNull(),
  clientSecret: text("clientSecret").notNull(), // armazenado criptografado
  emailRemetente: varchar("emailRemetente", { length: 255 }).notNull(), // ex: cobranca@escritorio.com.br
  nomeRemetente: varchar("nomeRemetente", { length: 255 }).notNull().default("Sistema de Cobranças"),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailConfig = typeof emailConfig.$inferSelect;
export type InsertEmailConfig = typeof emailConfig.$inferInsert;

// ─── Histórico de E-mails Enviados ───────────────────────────────────────────
export const emailsEnviados = mysqlTable("emailsEnviados", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId"),
  enviadoPorId: int("enviadoPorId"), // userId do operador
  destinatario: varchar("destinatario", { length: 255 }).notNull(), // e-mail do devedor
  assunto: varchar("assunto", { length: 500 }).notNull(),
  corpo: text("corpo").notNull(), // HTML do e-mail enviado
  modeloId: int("modeloId"), // modelo de documento usado (opcional)
  status: mysqlEnum("status", ["enviado", "erro", "pendente"]).default("pendente").notNull(),
  erro: text("erro"), // mensagem de erro se falhou
  enviadoEm: timestamp("enviadoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type EmailEnviado = typeof emailsEnviados.$inferSelect;
export type InsertEmailEnviado = typeof emailsEnviados.$inferInsert;

// ─── WhatsApp Z-API ───────────────────────────────────────────────────────────
export const whatsappInstancias = mysqlTable("whatsappInstancias", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(), // ex: "Cobrança", "Jurídico"
  setor: mysqlEnum("setor", ["cobranca", "juridico", "geral"]).default("geral").notNull(),
  instanceId: varchar("instanceId", { length: 255 }).notNull(),
  token: varchar("token", { length: 500 }).notNull(),
  clientToken: varchar("clientToken", { length: 500 }).notNull(),
  webhookUrl: varchar("webhookUrl", { length: 500 }),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappInstancia = typeof whatsappInstancias.$inferSelect;
export type InsertWhatsappInstancia = typeof whatsappInstancias.$inferInsert;

export const whatsappConversas = mysqlTable("whatsappConversas", {
  id: int("id").autoincrement().primaryKey(),
  instanciaId: int("instanciaId").notNull(),
  telefone: varchar("telefone", { length: 30 }).notNull(), // ex: 5521999999999
  nomeContato: varchar("nomeContato", { length: 255 }),
  devedorId: int("devedorId"), // vínculo opcional com devedor
  ultimaMensagem: text("ultimaMensagem"),
  ultimaMensagemEm: timestamp("ultimaMensagemEm"),
  naoLidas: int("naoLidas").default(0).notNull(),
  status: mysqlEnum("status", ["aberta", "fechada", "aguardando"]).default("aberta").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WhatsappConversa = typeof whatsappConversas.$inferSelect;
export type InsertWhatsappConversa = typeof whatsappConversas.$inferInsert;

export const whatsappMensagens = mysqlTable("whatsappMensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  instanciaId: int("instanciaId").notNull(),
  direction: mysqlEnum("direction", ["in", "out"]).notNull(),
  tipo: mysqlEnum("tipo", ["text", "image", "document", "audio", "video", "sticker"]).default("text").notNull(),
  conteudo: text("conteudo"),
  mediaUrl: varchar("mediaUrl", { length: 1000 }),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }),
  status: mysqlEnum("status", ["enviada", "entregue", "lida", "erro"]).default("enviada").notNull(),
  zApiMessageId: varchar("zApiMessageId", { length: 255 }),
  enviadoPorId: int("enviadoPorId"), // userId do operador (para mensagens out)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WhatsappMensagem = typeof whatsappMensagens.$inferSelect;
export type InsertWhatsappMensagem = typeof whatsappMensagens.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// MÓDULO DE MULTIATENDIMENTO
// ═══════════════════════════════════════════════════════════════════════════

// Departamentos de atendimento (ex: Cobrança, Jurídico, Suporte)
export const atendimentoDepartamentos = mysqlTable("atendimentoDepartamentos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"),
  cor: varchar("cor", { length: 20 }).default("#6366f1").notNull(), // cor para UI
  instanciaId: int("instanciaId"), // instância WhatsApp vinculada (opcional)
  slaMinutos: int("slaMinutos").default(60).notNull(), // SLA padrão em minutos
  limiteChatsSimultaneos: int("limiteChatsSimultaneos").default(5).notNull(),
  distribuicaoAutomatica: int("distribuicaoAutomatica").default(1).notNull(), // 0=manual, 1=auto
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AtendimentoDepartamento = typeof atendimentoDepartamentos.$inferSelect;
export type InsertAtendimentoDepartamento = typeof atendimentoDepartamentos.$inferInsert;

// Vínculo operador ↔ departamento
export const atendimentoOperadores = mysqlTable("atendimentoOperadores", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  departamentoId: int("departamentoId").notNull(),
  status: mysqlEnum("status", ["online", "offline", "ausente", "ocupado"]).default("offline").notNull(),
  limiteChats: int("limiteChats").default(5).notNull(),
  chatsAtivos: int("chatsAtivos").default(0).notNull(),
  ultimaAtividade: timestamp("ultimaAtividade"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AtendimentoOperador = typeof atendimentoOperadores.$inferSelect;
export type InsertAtendimentoOperador = typeof atendimentoOperadores.$inferInsert;

// Etiquetas para categorizar conversas
export const atendimentoEtiquetas = mysqlTable("atendimentoEtiquetas", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 80 }).notNull(),
  cor: varchar("cor", { length: 20 }).default("#22c55e").notNull(),
  descricao: text("descricao"),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AtendimentoEtiqueta = typeof atendimentoEtiquetas.$inferSelect;
export type InsertAtendimentoEtiqueta = typeof atendimentoEtiquetas.$inferInsert;

// Mensagens rápidas (respostas pré-definidas)
export const atendimentoMensagensRapidas = mysqlTable("atendimentoMensagensRapidas", {
  id: int("id").autoincrement().primaryKey(),
  titulo: varchar("titulo", { length: 100 }).notNull(), // nome de exibição
  atalho: varchar("atalho", { length: 50 }).notNull(), // ex: "/boleto"
  conteudo: text("conteudo").notNull(),
  departamentoId: int("departamentoId"), // null = global
  criadoPorId: int("criadoPorId").notNull(),
  ativo: int("ativo").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AtendimentoMensagemRapida = typeof atendimentoMensagensRapidas.$inferSelect;
export type InsertAtendimentoMensagemRapida = typeof atendimentoMensagensRapidas.$inferInsert;

// Atendimentos (cada conversa aberta vira um atendimento)
export const atendimentos = mysqlTable("atendimentos", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(), // FK → whatsappConversas
  departamentoId: int("departamentoId"),
  operadorId: int("operadorId"), // userId do operador atual (null = na fila)
  devedorId: int("devedorId"), // vínculo com devedor
  cobrancaId: int("cobrancaId"), // vínculo com cobrança específica
  protocolo: varchar("protocolo", { length: 30 }).notNull(), // número único ex: "ATD-2024-00001"
  status: mysqlEnum("status", [
    "automatico",   // sendo atendido pelo bot (fluxo automático)
    "aguardando",   // na fila, sem operador
    "em_atendimento", // com operador
    "transferido",  // aguardando novo operador após transferência
    "resolvido",    // finalizado com sucesso
    "abandonado",   // cliente saiu sem ser atendido
  ]).default("aguardando").notNull(),
  prioridade: mysqlEnum("prioridade", ["baixa", "normal", "alta", "urgente"]).default("normal").notNull(),
  slaLimite: timestamp("slaLimite"), // deadline do SLA
  slaViolado: int("slaViolado").default(0).notNull(), // 0=ok, 1=violado
  tempoEspera: int("tempoEspera"), // segundos na fila até ser atendido
  tempoAtendimento: int("tempoAtendimento"), // segundos totais do atendimento
  iniciadoEm: timestamp("iniciadoEm").defaultNow().notNull(),
  atendidoEm: timestamp("atendidoEm"), // quando operador assumiu
  resolvidoEm: timestamp("resolvidoEm"),
  motivoFechamento: text("motivoFechamento"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Atendimento = typeof atendimentos.$inferSelect;
export type InsertAtendimento = typeof atendimentos.$inferInsert;

// Histórico de transferências
export const atendimentoTransferencias = mysqlTable("atendimentoTransferencias", {
  id: int("id").autoincrement().primaryKey(),
  atendimentoId: int("atendimentoId").notNull(),
  deOperadorId: int("deOperadorId"), // null = sistema/fila
  paraOperadorId: int("paraOperadorId"), // null = fila
  paraDepartamentoId: int("paraDepartamentoId"),
  motivo: text("motivo"),
  transferidoPorId: int("transferidoPorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AtendimentoTransferencia = typeof atendimentoTransferencias.$inferSelect;

// Etiquetas aplicadas a atendimentos (N:N)
export const atendimentoEtiquetasAplicadas = mysqlTable("atendimentoEtiquetasAplicadas", {
  id: int("id").autoincrement().primaryKey(),
  atendimentoId: int("atendimentoId").notNull(),
  etiquetaId: int("etiquetaId").notNull(),
  aplicadoPorId: int("aplicadoPorId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Notas internas (visíveis apenas para operadores, não para o cliente)
export const atendimentoNotas = mysqlTable("atendimentoNotas", {
  id: int("id").autoincrement().primaryKey(),
  atendimentoId: int("atendimentoId").notNull(),
  autorId: int("autorId").notNull(),
  conteudo: text("conteudo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AtendimentoNota = typeof atendimentoNotas.$inferSelect;
export type InsertAtendimentoNota = typeof atendimentoNotas.$inferInsert;

// Avaliações de atendimento (CSAT)
export const atendimentoAvaliacoes = mysqlTable("atendimentoAvaliacoes", {
  id: int("id").autoincrement().primaryKey(),
  atendimentoId: int("atendimentoId").notNull(),
  nota: int("nota").notNull(), // 1-5
  comentario: text("comentario"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AtendimentoAvaliacao = typeof atendimentoAvaliacoes.$inferSelect;

// Atualizações de status do operador (para supervisão em tempo real)
export const atendimentoStatusLog = mysqlTable("atendimentoStatusLog", {
  id: int("id").autoincrement().primaryKey(),
  operadorId: int("operadorId").notNull(), // userId
  statusAnterior: varchar("statusAnterior", { length: 20 }),
  statusNovo: varchar("statusNovo", { length: 20 }).notNull(),
  motivo: varchar("motivo", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ─── Fluxos de Atendimento (Chatbot) ─────────────────────────────────────────

// Fluxo principal: conjunto de nós que formam o bot
export const botFluxos = mysqlTable("botFluxos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(), // true=ativo, false=inativo
  instanciaId: int("instanciaId"), // null = todos as instâncias
  gatilho: varchar("gatilho", { length: 20 }).default("primeira_mensagem").notNull(), // primeira_mensagem | palavra_chave
  palavraChave: varchar("palavraChave", { length: 100 }), // usado quando gatilho=palavra_chave
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BotFluxo = typeof botFluxos.$inferSelect;
export type InsertBotFluxo = typeof botFluxos.$inferInsert;

// Nós do fluxo: cada passo do bot
// tipo: inicio | mensagem | botoes | transferir | encerrar
export const botNos = mysqlTable("botNos", {
  id: int("id").autoincrement().primaryKey(),
  fluxoId: int("fluxoId").notNull(),
  tipo: varchar("tipo", { length: 30 }).notNull(), // inicio | mensagem | botoes | transferir | encerrar
  titulo: varchar("titulo", { length: 100 }).notNull(), // nome interno do nó
  // conteudo JSON: { texto, botoes: [{label, proximoNoId}], departamentoId, mensagemEncerramento }
  conteudo: json("conteudo").notNull(),
  ordem: int("ordem").default(0).notNull(), // ordem de exibição no editor
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BotNo = typeof botNos.$inferSelect;
export type InsertBotNo = typeof botNos.$inferInsert;

// Sessões ativas do bot por conversa
export const botSessoes = mysqlTable("botSessoes", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  fluxoId: int("fluxoId").notNull(),
  noAtualId: int("noAtualId"), // null = fluxo encerrado
  status: varchar("status", { length: 20 }).default("ativa").notNull(), // ativa | encerrada | transferida
  dados: json("dados"), // dados coletados durante o fluxo
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BotSessao = typeof botSessoes.$inferSelect;
export type InsertBotSessao = typeof botSessoes.$inferInsert;

// ─── Custas Judiciais ──────────────────────────────────────────────────────────
// Lançamentos de custas judiciais por devedor (distribuição, citação, perícia, etc.)
export const custasJudiciais = mysqlTable("custasJudiciais", {
  id: int("id").autoincrement().primaryKey(),
  devedorId: int("devedorId").notNull(),
  condominioId: int("condominioId").notNull(),
  descricao: varchar("descricao", { length: 255 }).notNull(),
  valor: int("valor").notNull(), // em centavos
  data: timestamp("data").notNull(),
  tipo: mysqlEnum("tipoCusta", [
    "distribuicao",
    "citacao",
    "pericia",
    "honorarios_periciais",
    "diligencia",
    "outros",
  ]).default("outros").notNull(),
  observacoes: text("observacoes"),
  createdBy: int("createdBy"), // userId do operador que lançou
  // Controle de inclusão em acordo: null = livre para novo acordo, >0 = já incluída no acordo informado
  acordoId: int("acordoId"), // FK para acordos.id (nullable = custa livre)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CustaJudicial = typeof custasJudiciais.$inferSelect;
export type InsertCustaJudicial = typeof custasJudiciais.$inferInsert;

// ─── Módulo Jurídico — Central de Demandas ────────────────────────────────────

// Colunas do quadro Kanban de demandas (customizáveis pelo admin)
export const colunasDemanda = mysqlTable("colunasDemanda", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 100 }).notNull(),
  icone: varchar("icone", { length: 10 }).default("📋").notNull(),
  cor: varchar("cor", { length: 30 }).default("slate").notNull(), // tailwind color name
  ordem: int("ordem").default(0).notNull(),
  padrao: int("padrao").default(0).notNull(), // 1 = coluna padrão do sistema (não pode ser excluída)
  tipo: mysqlEnum("tipoColuna", ["entrada", "intermediaria", "saida"]).default("intermediaria").notNull(), // entrada=Demandas Recebidas, saida=Demandas Resolvidas
  userId: int("userId"), // null = coluna global (fixas); preenchido = coluna pessoal do usuário
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ColunaDemanda = typeof colunasDemanda.$inferSelect;
export type InsertColunaDemanda = typeof colunasDemanda.$inferInsert;

// Demandas jurídicas
export const demandas = mysqlTable("demandas", {
  id: int("id").autoincrement().primaryKey(),
  numero: varchar("numero", { length: 20 }).notNull().unique(), // ex: #1258
  condominioId: int("condominioId"),
  colunaId: int("colunaId").notNull(), // FK para colunasDemanda.id
  // Solicitante
  solicitante: varchar("solicitante", { length: 255 }),
  solicitanteTipo: varchar("solicitanteTipo", { length: 50 }), // Síndico, Morador, Administradora, etc.
  // Canal de origem
  canal: mysqlEnum("canalDemanda", [
    "whatsapp",
    "email",
    "portal",
    "telefone",
    "presencial",
    "assembleia",
    "processo_interno",
    "manual",
  ]).default("manual").notNull(),
  // Classificação
  assunto: varchar("assunto", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipo: mysqlEnum("tipoDemanda", [
    // Jurídico Consultivo
    "parecer",
    "convencao",
    "assembleia",
    "multa",
    "notificacao",
    "contratos",
    // Jurídico Contencioso
    "cobranca_judicial",
    "processo",
    "audiencia",
    "execucao",
    "acompanhamento",
    // Administrativo
    "documentacao",
    "relatorio",
    "cadastro",
    "outro",
  ]).default("outro").notNull(),
  // Prioridade e SLA
  prioridade: mysqlEnum("prioridadeDemanda", ["baixa", "media", "alta", "urgente"]).default("media").notNull(),
  prazo: timestamp("prazo"), // data limite (SLA)
  // Responsável
  responsavelId: int("responsavelId"), // FK para users.id
  responsavelNome: varchar("responsavelNome", { length: 255 }), // nome livre (caso não seja usuário do sistema)
  // Vinculação com devedor/cobrança (opcional)
  devedorId: int("devedorId"),
  cobrancaId: int("cobrancaId"),
  // Dados do devedor no momento da escalada (snapshot)
  valorDivida: int("valorDivida"), // em centavos
  nomeDevedor: varchar("nomeDevedor", { length: 255 }),
  cpfDevedor: varchar("cpfDevedor", { length: 20 }),
  unidadeDevedor: varchar("unidadeDevedor", { length: 50 }),
  qtdCobrancas: int("qtdCobrancas"),
  // Status da demanda (controlado pelo Kanban)
  status: mysqlEnum("statusDemanda", ["aberta", "em_andamento", "concluida", "cancelada"]).default("aberta").notNull(),
  resolvidoEm: timestamp("resolvidoEm"), // data de conclusão
  ordemColuna: int("ordemColuna").default(0).notNull(), // posição dentro da coluna (para reordenamento estilo Trello)
  // Controle
  criadoPorId: int("criadoPorId"), // userId
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Demanda = typeof demandas.$inferSelect;
export type InsertDemanda = typeof demandas.$inferInsert;

// Timeline de eventos de cada demanda
export const timelineDemanda = mysqlTable("timelineDemanda", {
  id: int("id").autoincrement().primaryKey(),
  demandaId: int("demandaId").notNull(),
  tipo: mysqlEnum("tipoEventoDemanda", [
    "criacao",
    "atribuicao",
    "movimentacao",
    "comentario",
    "anexo",
    "email",
    "whatsapp",
    "conclusao",
    "cancelamento",
    "outro",
  ]).default("outro").notNull(),
  descricao: text("descricao").notNull(),
  usuarioId: int("usuarioId"),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TimelineEventoDemanda = typeof timelineDemanda.$inferSelect;
export type InsertTimelineEventoDemanda = typeof timelineDemanda.$inferInsert;

// Anexos de demandas
export const anexosDemanda = mysqlTable("anexosDemanda", {
  id: int("id").autoincrement().primaryKey(),
  demandaId: int("demandaId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  url: text("url").notNull(),
  fileKey: varchar("fileKey", { length: 500 }),
  tamanho: int("tamanho"), // bytes
  mimeType: varchar("mimeType", { length: 100 }),
  uploadadoPorId: int("uploadadoPorId"),
  uploadadoPorNome: varchar("uploadadoPorNome", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AnexoDemanda = typeof anexosDemanda.$inferSelect;
export type InsertAnexoDemanda = typeof anexosDemanda.$inferInsert;

// Assembleias
export const assembleias = mysqlTable("assembleias", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId"),
  tipo: mysqlEnum("tipoAssembleia", [
    "ordinaria",
    "extraordinaria",
    "prestacao_contas",
    "eleicao",
    "outro",
  ]).default("ordinaria").notNull(),
  data: timestamp("data").notNull(),
  hora: varchar("hora", { length: 5 }).notNull(), // "HH:MM"
  endereco: varchar("endereco", { length: 500 }),
  advogadoResponsavelId: int("advogadoResponsavelId"), // FK para users.id
  advogadoNome: varchar("advogadoNome", { length: 255 }),
  status: mysqlEnum("statusAssembleia", ["agendada", "realizada", "cancelada"]).default("agendada").notNull(),
  pauta: text("pauta"),
  ata: text("ata"),
  horasGastas: decimal("horasGastas", { precision: 5, scale: 2 }),
  observacoes: text("observacoes"),
  criadoPorId: int("criadoPorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Assembleia = typeof assembleias.$inferSelect;
export type InsertAssembleia = typeof assembleias.$inferInsert;

// ─── Processos Judiciais ──────────────────────────────────────────────────────
export const processosJudiciais = mysqlTable("processosJudiciais", {
  id: int("id").autoincrement().primaryKey(),
  numeroCNJ: varchar("numeroCNJ", { length: 30 }).notNull(),
  tribunal: varchar("tribunal", { length: 20 }).notNull(),
  tribunalAlias: varchar("tribunalAlias", { length: 50 }),
  comarca: varchar("comarca", { length: 255 }),
  vara: varchar("vara", { length: 255 }),
  classe: varchar("classe", { length: 255 }),
  assunto: varchar("assunto", { length: 500 }),
  tipo: mysqlEnum("tipoProcesso", [
    "civel", "trabalhista", "previdenciario", "criminal", "tributario", "administrativo", "outro",
  ]).default("civel").notNull(),
  faseProcessual: mysqlEnum("faseProcessual", [
    "distribuicao", "citacao", "contestacao", "instrucao", "audiencia",
    "sentenca", "recurso", "transito_julgado", "execucao", "arquivado", "outro",
  ]).default("distribuicao").notNull(),
  status: mysqlEnum("statusProcesso", ["ativo", "suspenso", "arquivado", "encerrado"]).default("ativo").notNull(),
  dataAjuizamento: timestamp("dataAjuizamento"),
  dataUltimaMovimentacao: timestamp("dataUltimaMovimentacao"),
  condominioId: int("condominioId"),
  condominioNome: varchar("condominioNome", { length: 255 }),
  demandaId: int("demandaId"),
  advogadoId: int("advogadoId"),
  advogadoNome: varchar("advogadoNome", { length: 255 }),
  valorCausa: int("valorCausa"),
  valorCondenacao: int("valorCondenacao"),
  datajudId: varchar("datajudId", { length: 200 }),
  datajudSincronizadoEm: timestamp("datajudSincronizadoEm"),
  observacoes: text("observacoes"),
  criadoPorId: int("criadoPorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ProcessoJudicial = typeof processosJudiciais.$inferSelect;
export type InsertProcessoJudicial = typeof processosJudiciais.$inferInsert;

export const partesProcesso = mysqlTable("partesProcesso", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  tipo: mysqlEnum("tipoParteProcesso", ["autor", "reu", "terceiro", "outro"]).default("autor").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  representante: varchar("representante", { length: 255 }),
  observacoes: varchar("observacoes", { length: 500 }),
  // Advogados estruturados (JSON array: [{nome, oab}])
  advogadosJson: text("advogadosJson"), // JSON serializado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ParteProcesso = typeof partesProcesso.$inferSelect;
export type InsertParteProcesso = typeof partesProcesso.$inferInsert;

export const movimentacoesProcesso = mysqlTable("movimentacoesProcesso", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  data: timestamp("data").notNull(),
  descricao: text("descricao").notNull(),
  tipo: mysqlEnum("tipoMovimentacao", [
    "distribuicao", "citacao", "contestacao", "audiencia", "sentenca",
    "recurso", "despacho", "decisao", "peticao", "transito_julgado", "execucao", "outro",
  ]).default("outro").notNull(),
  origem: mysqlEnum("origemMovimentacao", ["manual", "datajud"]).default("manual").notNull(),
  codigoDatajud: int("codigoDatajud"),
  // Complementos do DataJud (inteiro teor, publicação, etc.) — JSON array
  complementosJson: text("complementosJson"), // JSON serializado [{nome, valor}]
  // Dados de publicação
  nomeOrgao: varchar("nomeOrgao", { length: 255 }),
  tipoComunicacao: varchar("tipoComunicacao", { length: 100 }),
  meioPublicacao: varchar("meioPublicacao", { length: 100 }),
  usuarioId: int("usuarioId"),
  usuarioNome: varchar("usuarioNome", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MovimentacaoProcesso = typeof movimentacoesProcesso.$inferSelect;
export type InsertMovimentacaoProcesso = typeof movimentacoesProcesso.$inferInsert;

export const financeirosProcesso = mysqlTable("financeirosProcesso", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId").notNull(),
  tipo: mysqlEnum("tipoFinanceiroProcesso", [
    "custas", "honorarios", "despesas", "deposito", "condenacao", "reembolso", "outro",
  ]).default("custas").notNull(),
  descricao: varchar("descricao", { length: 500 }).notNull(),
  valor: int("valor").notNull(),
  data: timestamp("data").notNull(),
  pago: boolean("pago").default(false).notNull(),
  dataPagamento: timestamp("dataPagamento"),
  criadoPorId: int("criadoPorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type FinanceiroProcesso = typeof financeirosProcesso.$inferSelect;
export type InsertFinanceiroProcesso = typeof financeirosProcesso.$inferInsert;

// ─── Prazos Jurídicos ─────────────────────────────────────────────────────────
export const prazosJuridicos = mysqlTable("prazosJuridicos", {
  id: int("id").autoincrement().primaryKey(),
  titulo: varchar("titulo", { length: 255 }).notNull(),
  tipo: mysqlEnum("tipoPrazo", [
    "processual", "contratual", "administrativo", "audiencia", "recurso", "interno", "outro",
  ]).default("processual").notNull(),
  processoId: int("processoId"),
  demandaId: int("demandaId"),
  condominioId: int("condominioId"),
  condominioNome: varchar("condominioNome", { length: 255 }),
  responsavelId: int("responsavelId"),
  responsavelNome: varchar("responsavelNome", { length: 255 }),
  dataLimite: timestamp("dataLimite").notNull(),
  alertas: text("alertas"),
  status: mysqlEnum("statusPrazo", ["pendente", "concluido", "cancelado", "atrasado"]).default("pendente").notNull(),
  concluidoEm: timestamp("concluidoEm"),
  observacoes: text("observacoes"),
  criadoPorId: int("criadoPorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PrazoJuridico = typeof prazosJuridicos.$inferSelect;
export type InsertPrazoJuridico = typeof prazosJuridicos.$inferInsert;

// ─── MNI TJRJ — Credenciais ───────────────────────────────────────────────────
export const mniCredenciais = mysqlTable("mniCredenciais", {
  id: int("id").autoincrement().primaryKey(),
  tribunal: varchar("tribunal", { length: 50 }).notNull().default("TJRJ"),
  idConsultante: varchar("idConsultante", { length: 255 }).notNull(),
  senhaConsultante: varchar("senhaConsultante", { length: 500 }).notNull(),
  ambiente: mysqlEnum("ambienteMNI", ["homologacao", "producao"]).default("homologacao").notNull(),
  urlWsdl: varchar("urlWsdl", { length: 500 }),
  ativo: boolean("ativo").default(false).notNull(),
  ultimoTesteEm: timestamp("ultimoTesteEm"),
  ultimoTesteStatus: varchar("ultimoTesteStatus", { length: 50 }),
  criadoPorId: int("criadoPorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MniCredencial = typeof mniCredenciais.$inferSelect;
export type InsertMniCredencial = typeof mniCredenciais.$inferInsert;

// ─── MNI TJRJ — Intimações / Avisos ──────────────────────────────────────────
export const intimacoesMNI = mysqlTable("intimacoesMNI", {
  id: int("id").autoincrement().primaryKey(),
  idAviso: varchar("idAviso", { length: 255 }).unique(),
  processoId: int("processoId"),
  numeroCNJ: varchar("numeroCNJ", { length: 30 }),
  tipoAviso: varchar("tipoAviso", { length: 100 }),
  tipoComunicacao: varchar("tipoComunicacao", { length: 100 }),
  dataDisponibilizacao: timestamp("dataDisponibilizacao"),
  dataPublicacao: timestamp("dataPublicacao"),
  orgao: varchar("orgao", { length: 255 }),
  vara: varchar("vara", { length: 255 }),
  comarca: varchar("comarca", { length: 255 }),
  teor: text("teor"),
  parametrosJson: text("parametrosJson"),
  partesJson: text("partesJson"),
  status: mysqlEnum("statusIntimacao", [
    "pendente", "visualizado", "tratado", "descartado",
  ]).default("pendente").notNull(),
  tratadoPorId: int("tratadoPorId"),
  tratadoPorNome: varchar("tratadoPorNome", { length: 255 }),
  tratadoEm: timestamp("tratadoEm"),
  observacoes: text("observacoes"),
  prazoGeradoId: int("prazoGeradoId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type IntimacaoMNI = typeof intimacoesMNI.$inferSelect;
export type InsertIntimacaoMNI = typeof intimacoesMNI.$inferInsert;

// ─── MNI TJRJ — Log de Sincronizações ────────────────────────────────────────
export const sincronizacoesMNI = mysqlTable("sincronizacoesMNI", {
  id: int("id").autoincrement().primaryKey(),
  processoId: int("processoId"),
  numeroCNJ: varchar("numeroCNJ", { length: 30 }),
  tipo: mysqlEnum("tipoSincMNI", ["processo", "avisos", "teor"]).default("processo").notNull(),
  status: mysqlEnum("statusSincMNI", ["sucesso", "erro", "parcial"]).default("sucesso").notNull(),
  movimentacoesImportadas: int("movimentacoesImportadas").default(0),
  avisosImportados: int("avisosImportados").default(0),
  erroMsg: text("erroMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SincronizacaoMNI = typeof sincronizacoesMNI.$inferSelect;
export type InsertSincronizacaoMNI = typeof sincronizacoesMNI.$inferInsert;

// ─── Publicações Jurídicas — Monitoramentos ───────────────────────────────────
export const monitoramentosPublicacoes = mysqlTable("monitoramentosPublicacoes", {
  id: int("id").autoincrement().primaryKey(),
  advogadoNome: varchar("advogadoNome", { length: 255 }).notNull(), // Nome do advogado a monitorar
  oab: varchar("oab", { length: 30 }),          // Ex: OAB/RJ 123456
  uf: varchar("uf", { length: 2 }),             // Ex: RJ, SP, MG
  palavrasChave: text("palavrasChave"),          // Palavras adicionais separadas por vírgula
  ativo: int("ativo").default(1).notNull(),      // 1 = ativo, 0 = pausado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MonitoramentoPublicacao = typeof monitoramentosPublicacoes.$inferSelect;
export type InsertMonitoramentoPublicacao = typeof monitoramentosPublicacoes.$inferInsert;

// ─── Publicações Jurídicas — Publicações Capturadas ──────────────────────────
export const publicacoes = mysqlTable("publicacoes", {
  id: int("id").autoincrement().primaryKey(),
  monitoramentoId: int("monitoramentoId"),       // FK para monitoramentosPublicacoes.id (nullable = entrada manual)
  // Dados do diário
  tribunal: varchar("tribunal", { length: 100 }),  // Ex: TJRJ, TJSP, STJ
  comarca: varchar("comarca", { length: 100 }),
  vara: varchar("vara", { length: 150 }),
  dataPublicacao: timestamp("dataPublicacao"),
  tipo: mysqlEnum("tipoPublicacao", [
    "intimacao", "sentenca", "despacho", "audiencia", "decisao", "outro"
  ]).default("outro").notNull(),
  // Conteúdo
  textoCompleto: text("textoCompleto").notNull(),
  numeroCNJ: varchar("numeroCNJ", { length: 30 }), // Número do processo CNJ quando identificado
  encontradoPor: varchar("encontradoPor", { length: 50 }), // "nome" | "oab" | "palavra_chave" | "manual"
  // Fluxo de trabalho
  status: mysqlEnum("statusPublicacao", [
    "nova", "analisando", "aguardando_providencia", "providenciada", "arquivada"
  ]).default("nova").notNull(),
  lida: int("lida").default(0).notNull(),         // 0 = não lida, 1 = lida
  // Metadados
  observacoes: text("observacoes"),
  responsavelNome: varchar("responsavelNome", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Publicacao = typeof publicacoes.$inferSelect;
export type InsertPublicacao = typeof publicacoes.$inferInsert;

// ─── Alertas de Inadimplência de Acordos ──────────────────────────────────────
// Registra alertas progressivos gerados pelo job de monitoramento de parcelas em atraso.
// Cada alerta é único por (parcelaId + nivel) para evitar duplicidade.
export const alertasInadimplenciaAcordo = mysqlTable("alertasInadimplenciaAcordo", {
  id: int("id").autoincrement().primaryKey(),
  acordoId: int("acordoId").notNull(),
  parcelaId: int("parcelaId").notNull(),
  condominioId: int("condominioId").notNull(),
  devedorId: int("devedorId").notNull(),
  // Nível do alerta: 1 = primeiro aviso (5d), 2 = segundo aviso (10d), 3 = crítico (30d), 0 = primeira parcela não paga
  nivel: int("nivel").notNull(),
  diasAtraso: int("diasAtraso").notNull(),
  valorParcela: int("valorParcela").notNull(),         // em centavos
  dataVencimento: timestamp("dataVencimento").notNull(),
  installmentNumber: int("installmentNumber").notNull(), // número da parcela
  totalParcelas: int("totalParcelas").notNull(),
  // Status do boleto vinculado à parcela
  statusBoleto: varchar("statusBoleto", { length: 50 }),  // pendente, enviado, liquidado, etc.
  temBoletoAtualizado: int("temBoletoAtualizado").default(0).notNull(), // 1 = sim
  // Tratativa da equipe
  status: mysqlEnum("status", ["pendente", "em_tratativa", "resolvido", "ignorado"]).default("pendente").notNull(),
  resolvidoPor: int("resolvidoPor"),    // userId de quem resolveu
  resolvidoEm: timestamp("resolvidoEm"),
  observacao: text("observacao"),       // nota da equipe ao resolver
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlertaInadimplenciaAcordo = typeof alertasInadimplenciaAcordo.$inferSelect;
export type InsertAlertaInadimplenciaAcordo = typeof alertasInadimplenciaAcordo.$inferInsert;

// ─── Fila de Envio WhatsApp (cadência anti-ban) ───────────────────────────────
export const whatsappFilaEnvio = mysqlTable("whatsappFilaEnvio", {
  id: int("id").autoincrement().primaryKey(),
  instanciaId: int("instanciaId").notNull(),       // FK → whatsappInstancias
  telefone: varchar("telefone", { length: 30 }).notNull(),
  mensagem: text("mensagem").notNull(),
  // Contexto do disparo
  reguaId: int("reguaId"),                         // FK → reguasCobranca (se veio da régua)
  posicaoId: int("posicaoId"),                     // FK → reguaPosicoes
  cobrancaId: int("cobrancaId"),                   // FK → cobrancas
  devedorId: int("devedorId"),                     // FK → devedores
  condominioId: int("condominioId"),
  // Controle de envio
  status: mysqlEnum("status", ["aguardando", "enviando", "enviado", "erro", "cancelado"]).default("aguardando").notNull(),
  tentativas: int("tentativas").default(0).notNull(),
  proximaTentativa: timestamp("proximaTentativa"),  // quando pode ser enviado
  enviadoEm: timestamp("enviadoEm"),
  erro: text("erro"),
  messageId: varchar("messageId", { length: 255 }), // ID retornado pela Z-API
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WhatsappFilaEnvio = typeof whatsappFilaEnvio.$inferSelect;
export type InsertWhatsappFilaEnvio = typeof whatsappFilaEnvio.$inferInsert;
