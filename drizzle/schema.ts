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
  role: mysqlEnum("role", ["admin", "sindico", "cobrador", "colaborador"]).default("cobrador").notNull(),
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
  // Campos de boleto CNAB 240
  nossoNumero: varchar("nossoNumero", { length: 30 }), // Nosso número BTG atribuído ao criar o acordo
  pixCopiaCola: text("pixCopiaCola"),                   // Pix copia e cola (EMV) retornado pelo banco no retorno D+1 (Bolepix)
  statusRemessa: mysqlEnum("statusRemessa", ["nao_enviado", "remessa_gerada", "enviado", "retorno_recebido"]).default("nao_enviado"),
  remessaId: int("remessaId"), // ID da remessa CNAB que incluiu esta parcela
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

// ===== RÉGUA DE COBRANÇA =====

// Tabela principal: define uma régua de cobrança para um condomínio
export const reguasCobranca = mysqlTable("reguasCobranca", {
  id: int("id").autoincrement().primaryKey(),
  condominioId: int("condominioId").notNull(),
  nome: varchar("nome", { length: 255 }).notNull(),
  descricao: text("descricao"),
  tipoCobranca: mysqlEnum("tipoCobranca", ["todos", "condominio", "salao_jogos", "churrasqueira", "cota_extra", "multa", "outros"]).default("todos").notNull(),
  ativa: int("ativa").default(1).notNull(), // 1 = ativa, 0 = inativa
  ultimaExecucao: timestamp("ultimaExecucao"),
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
