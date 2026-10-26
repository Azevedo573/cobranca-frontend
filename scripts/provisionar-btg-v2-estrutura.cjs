#!/usr/bin/env node
/**
 * Provisionamento controlado da estrutura BTG v2.
 *
 * Este utilitário não usa Drizzle e não registra migrations históricas.
 * Ele cria somente tabelas e índices inéditos da integração BTG v2.
 * Não executa INSERT, UPDATE, DELETE ou ALTER em tabelas existentes.
 *
 * Uso:
 *   node scripts/provisionar-btg-v2-estrutura.cjs --check
 *   node scripts/provisionar-btg-v2-estrutura.cjs --apply --confirmar=CRIAR_ESTRUTURA_BTG_V2
 */

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env", quiet: true });
const mysql = require("mysql2/promise");

const CONFIRMACAO_EXIGIDA = "CRIAR_ESTRUTURA_BTG_V2";
const TABELAS_BTG_V2 = [
  "btgOauthEstados",
  "btgOauthTokens",
  "btgIntegracoes",
  "btgContasRecebedoras",
  "btgContaRecebedoraCondominios",
  "btgCobrancasEmitidas",
  "btgWebhookEntregas",
  "btgRemessas",
  "btgRemessaItens",
];

const DDL = [
  {
    table: "btgOauthEstados",
    sql: `CREATE TABLE \`btgOauthEstados\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`stateHash\` varchar(64) NOT NULL,
      \`adminUserId\` int NOT NULL,
      \`ambiente\` enum('sandbox','producao') NOT NULL,
      \`redirectUri\` varchar(500) NOT NULL,
      \`expiresAt\` timestamp NOT NULL,
      \`usedAt\` timestamp NULL,
      \`errorCode\` varchar(80) NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`btgOauthEstados_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgOauthEstados_stateHash_unique\` UNIQUE(\`stateHash\`)
    )`,
  },
  {
    table: "btgOauthTokens",
    sql: `CREATE TABLE \`btgOauthTokens\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`ambiente\` enum('sandbox','producao') NOT NULL,
      \`accessTokenCifrado\` text NOT NULL,
      \`refreshTokenCifrado\` text NOT NULL,
      \`tokenExpiresAt\` timestamp NOT NULL,
      \`scopes\` varchar(1000) NULL,
      \`companyId\` varchar(50) NOT NULL,
      \`status\` enum('conectado','requer_reconexao') NOT NULL DEFAULT 'conectado',
      \`lastErrorCode\` varchar(80) NULL,
      \`connectedAt\` timestamp NOT NULL DEFAULT (now()),
      \`refreshedAt\` timestamp NOT NULL DEFAULT (now()),
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgOauthTokens_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgOauthTokens_ambiente_unique\` UNIQUE(\`ambiente\`)
    )`,
  },
  {
    table: "btgIntegracoes",
    sql: `CREATE TABLE \`btgIntegracoes\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`ambiente\` enum('sandbox','producao') NOT NULL,
      \`companyId\` varchar(50) NOT NULL,
      \`ativo\` int NOT NULL DEFAULT 0,
      \`emissaoHabilitada\` int NOT NULL DEFAULT 0,
      \`ultimaConsultaContasEm\` timestamp NULL,
      \`diasLimitePagamento\` int NOT NULL DEFAULT 60,
      \`instrucoes\` text NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgIntegracoes_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgIntegracoes_ambiente_unique\` UNIQUE(\`ambiente\`)
    )`,
  },
  {
    table: "btgContasRecebedoras",
    sql: `CREATE TABLE \`btgContasRecebedoras\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`btgIntegracaoId\` int NOT NULL,
      \`accountId\` varchar(150) NOT NULL,
      \`agencia\` varchar(30) NOT NULL,
      \`numero\` varchar(50) NOT NULL,
      \`documentoBeneficiario\` varchar(20) NULL,
      \`nomeBeneficiario\` varchar(255) NULL,
      \`rotulo\` varchar(255) NULL,
      \`ativo\` int NOT NULL DEFAULT 1,
      \`origemCadastro\` enum('api','manual_sandbox') NOT NULL DEFAULT 'api',
      \`ultimaSincronizacaoEm\` timestamp NOT NULL DEFAULT (now()),
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgContasRecebedoras_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgContasRecebedoras_integracao_account_unique\` UNIQUE(\`btgIntegracaoId\`,\`accountId\`)
    )`,
  },
  {
    table: "btgContaRecebedoraCondominios",
    sql: `CREATE TABLE \`btgContaRecebedoraCondominios\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`btgIntegracaoId\` int NOT NULL,
      \`condominioId\` int NOT NULL,
      \`btgContaRecebedoraId\` int NOT NULL,
      \`ativo\` int NOT NULL DEFAULT 1,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgContaRecebedoraCondominios_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgContaRecebedoraCondominios_integracao_condominio_unique\` UNIQUE(\`btgIntegracaoId\`,\`condominioId\`)
    )`,
  },
  {
    table: "btgCobrancasEmitidas",
    sql: `CREATE TABLE \`btgCobrancasEmitidas\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`btgIntegracaoId\` int NOT NULL,
      \`btgContaRecebedoraId\` int NOT NULL,
      \`condominioId\` int NOT NULL,
      \`origemTipo\` enum('cobranca','parcela_acordo') NOT NULL,
      \`origemId\` int NOT NULL,
      \`revisao\` int NOT NULL DEFAULT 1,
      \`instrumento\` enum('bolepix') NOT NULL DEFAULT 'bolepix',
      \`externalId\` varchar(180) NOT NULL,
      \`idempotencyKey\` varchar(128) NOT NULL,
      \`btgCollectionId\` varchar(150) NULL,
      \`status\` enum('reservada','enviando','emitida','incerta','paga','cancelada','expirada','falha') NOT NULL DEFAULT 'reservada',
      \`amount\` int NOT NULL,
      \`dueDate\` timestamp NOT NULL,
      \`agenciaRecebedora\` varchar(30) NOT NULL,
      \`contaRecebedora\` varchar(50) NOT NULL,
      \`documentoBeneficiario\` varchar(20) NULL,
      \`nomeBeneficiario\` varchar(255) NULL,
      \`bankSlipUrl\` text NULL,
      \`pixQrCode\` text NULL,
      \`pixCopiaECola\` text NULL,
      \`codigoBarras\` varchar(300) NULL,
      \`linhaDigitavel\` varchar(300) NULL,
      \`nossoNumero\` varchar(100) NULL,
      \`erroCodigo\` varchar(80) NULL,
      \`emitidaEm\` timestamp NULL,
      \`btgRemessaId\` int NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgCobrancasEmitidas_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgCobrancasEmitidas_integracao_origem_revisao_unique\` UNIQUE(\`btgIntegracaoId\`,\`origemTipo\`,\`origemId\`,\`revisao\`),
      CONSTRAINT \`btgCobrancasEmitidas_integracao_externalId_unique\` UNIQUE(\`btgIntegracaoId\`,\`externalId\`),
      CONSTRAINT \`btgCobrancasEmitidas_integracao_idempotencyKey_unique\` UNIQUE(\`btgIntegracaoId\`,\`idempotencyKey\`)
    )`,
  },
  {
    table: "btgWebhookEntregas",
    sql: `CREATE TABLE \`btgWebhookEntregas\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`btgIntegracaoId\` int NOT NULL,
      \`providerEventId\` varchar(150) NULL,
      \`payloadHash\` varchar(64) NOT NULL,
      \`evento\` varchar(100) NOT NULL,
      \`btgCollectionId\` varchar(150) NULL,
      \`assinaturaValida\` int NOT NULL DEFAULT 0,
      \`statusProcessamento\` enum('recebido','processado','ignorado','falha') NOT NULL DEFAULT 'recebido',
      \`erroCodigo\` varchar(100) NULL,
      \`recebidoEm\` timestamp NOT NULL DEFAULT (now()),
      \`processadoEm\` timestamp NULL,
      CONSTRAINT \`btgWebhookEntregas_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgWebhookEntregas_integracao_payloadHash_unique\` UNIQUE(\`btgIntegracaoId\`,\`payloadHash\`)
    )`,
  },
  {
    table: "btgRemessas",
    sql: `CREATE TABLE \`btgRemessas\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`btgIntegracaoId\` int NOT NULL,
      \`btgContaRecebedoraId\` int NOT NULL,
      \`condominioId\` int NOT NULL,
      \`status\` enum('rascunho','enviando','processada','processada_parcialmente','falha','cancelada') NOT NULL DEFAULT 'rascunho',
      \`totalSelecionado\` int NOT NULL DEFAULT 0,
      \`totalEmitido\` int NOT NULL DEFAULT 0,
      \`totalFalha\` int NOT NULL DEFAULT 0,
      \`valorTotalCentavos\` int NOT NULL DEFAULT 0,
      \`usuarioCriadorId\` int NOT NULL,
      \`observacao\` varchar(500) NULL,
      \`erroResumo\` varchar(500) NULL,
      \`correlationId\` varchar(64) NULL,
      \`criadaEm\` timestamp NOT NULL DEFAULT (now()),
      \`iniciadaEm\` timestamp NULL,
      \`finalizadaEm\` timestamp NULL,
      \`canceladaEm\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgRemessas_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgRemessas_correlationId_unique\` UNIQUE(\`correlationId\`)
    )`,
  },
  {
    table: "btgRemessaItens",
    sql: `CREATE TABLE \`btgRemessaItens\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`btgRemessaId\` int NOT NULL,
      \`parcelaAcordoId\` int NOT NULL,
      \`btgCobrancaEmitidaId\` int NULL,
      \`installmentNumber\` int NOT NULL,
      \`valorCentavos\` int NOT NULL,
      \`resultado\` enum('pendente','emitida','ja_existia','falha') NOT NULL DEFAULT 'pendente',
      \`mensagem\` varchar(500) NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`btgRemessaItens_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`btgRemessaItens_remessa_parcela_unique\` UNIQUE(\`btgRemessaId\`,\`parcelaAcordoId\`)
    )`,
  },
];

const INDICES = [
  ["btgOauthEstados_expiresAt_idx", "btgOauthEstados", "`expiresAt`"],
  ["btgContaRecebedoraCondominios_conta_idx", "btgContaRecebedoraCondominios", "`btgContaRecebedoraId`"],
  ["btgContasRecebedoras_integracao_ativo_idx", "btgContasRecebedoras", "`btgIntegracaoId`, `ativo`"],
  ["btgCobrancasEmitidas_integracao_status_idx", "btgCobrancasEmitidas", "`btgIntegracaoId`, `status`, `dueDate`"],
  ["btgWebhookEntregas_integracao_collection_idx", "btgWebhookEntregas", "`btgIntegracaoId`, `btgCollectionId`"],
  ["btgWebhookEntregas_recebidoEm_idx", "btgWebhookEntregas", "`recebidoEm`"],
  ["btgRemessaItens_emissao_idx", "btgRemessaItens", "`btgCobrancaEmitidaId`"],
  ["btgRemessas_integracao_condominio_status_idx", "btgRemessas", "`btgIntegracaoId`, `condominioId`, `status`, `criadaEm`"],
  ["btgCobrancasEmitidas_remessa_idx", "btgCobrancasEmitidas", "`btgRemessaId`"],
  ["btgCobrancasEmitidas_integracao_collection_idx", "btgCobrancasEmitidas", "`btgIntegracaoId`, `btgCollectionId`"],
];

function usage() {
  console.log("Uso:\n  node scripts/provisionar-btg-v2-estrutura.cjs --check\n  node scripts/provisionar-btg-v2-estrutura.cjs --apply --confirmar=CRIAR_ESTRUTURA_BTG_V2");
}

function hasArg(value) {
  return process.argv.includes(value);
}

function argValue(prefix) {
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function existingTables(db) {
  const placeholders = TABELAS_BTG_V2.map(() => "?").join(", ");
  const [rows] = await db.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders}) ORDER BY TABLE_NAME`,
    TABELAS_BTG_V2,
  );
  return rows.map((row) => row.TABLE_NAME);
}

async function existingIndexes(db) {
  const [rows] = await db.query(
    `SELECT TABLE_NAME, INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${TABELAS_BTG_V2.map(() => "?").join(", ")})
     GROUP BY TABLE_NAME, INDEX_NAME
     ORDER BY TABLE_NAME, INDEX_NAME`,
    TABELAS_BTG_V2,
  );
  return rows;
}

async function main() {
  const apply = hasArg("--apply");
  const check = hasArg("--check");
  const confirmation = argValue("--confirmar=");

  if ((apply && check) || (!apply && !check)) {
    usage();
    process.exitCode = 64;
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não encontrada no .env.");
  if (apply && confirmation !== CONFIRMACAO_EXIGIDA) {
    throw new Error(`Confirmação inválida. Para aplicar, use --confirmar=${CONFIRMACAO_EXIGIDA}.`);
  }

  const db = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const found = await existingTables(db);
    console.log("=== PRÉ-CHECAGEM BTG V2 ===");
    console.log(`Tabelas-alvo existentes: ${found.length ? found.join(", ") : "nenhuma"}`);
    console.log("Esta rotina não executa INSERT, UPDATE, DELETE, ALTER, DROP ou migrations Drizzle.");

    if (check) {
      if (found.length === 0) {
        console.log("RESULTADO: VPS apta para criar exclusivamente a estrutura BTG v2.");
      } else if (found.length === TABELAS_BTG_V2.length) {
        console.log("RESULTADO: estrutura BTG v2 já existe; nenhuma ação necessária.");
      } else {
        console.log("RESULTADO: estrutura parcial detectada. A aplicação foi bloqueada por segurança; não use --apply.");
      }
      return;
    }

    if (found.length !== 0) {
      throw new Error(`Aplicação bloqueada: foram encontradas tabelas BTG v2 (${found.join(", ")}). Não é seguro criar estrutura sobre estado existente ou parcial.`);
    }

    console.log("=== CRIANDO SOMENTE ESTRUTURAS NOVAS BTG V2 ===");
    for (const item of DDL) {
      await db.query(item.sql);
      console.log(`CRIADA: ${item.table}`);
    }
    for (const [indexName, tableName, columns] of INDICES) {
      await db.query(`CREATE INDEX \`${indexName}\` ON \`${tableName}\` (${columns})`);
      console.log(`ÍNDICE: ${indexName}`);
    }

    const created = await existingTables(db);
    const indexes = await existingIndexes(db);
    const missingTables = TABELAS_BTG_V2.filter((table) => !created.includes(table));
    const indexNames = new Set(indexes.map((index) => index.INDEX_NAME));
    const missingIndexes = INDICES.map(([name]) => name).filter((name) => !indexNames.has(name));

    if (missingTables.length || missingIndexes.length) {
      throw new Error(`Verificação final falhou. Tabelas ausentes: ${missingTables.join(", ") || "nenhuma"}; índices ausentes: ${missingIndexes.join(", ") || "nenhum"}.`);
    }

    console.log("RESULTADO: estrutura BTG v2 criada com sucesso.");
    console.log("EMISSÃO BTG: permanece bloqueada até configuração separada de credenciais, OAuth, conta oficial, webhook e ativação administrativa.");
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(`ERRO: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
