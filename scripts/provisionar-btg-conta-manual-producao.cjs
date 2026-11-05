#!/usr/bin/env node
/**
 * Estrutura exclusiva do cadastro manual BTG de Produção (migration 0099).
 * Não executa migrations gerais, não altera contas/tokens e não ativa emissão.
 * Uso: node scripts/provisionar-btg-conta-manual-producao.cjs --check
 * Aplicação, somente após backup/aprovação operacional:
 * node scripts/provisionar-btg-conta-manual-producao.cjs --apply --confirmar=AMPLIAR_CONTA_MANUAL_BTG_PRODUCAO
 * DDL MySQL faz commit implícito; em falha parcial, corrigir causa e reavaliar.
 */
const CONFIRMACAO = "AMPLIAR_CONTA_MANUAL_BTG_PRODUCAO";
const ENUM_ANTIGO = "enum('api','manual_sandbox')";
const ENUM_NOVO = "enum('api','manual_sandbox','manual_producao')";
const DDL = Object.freeze({
  origemCadastro: "ALTER TABLE `btgContasRecebedoras` MODIFY COLUMN `origemCadastro` enum('api','manual_sandbox','manual_producao') NOT NULL DEFAULT 'api'",
  confirmadoPorId: "ALTER TABLE `btgContasRecebedoras` ADD COLUMN `confirmadoPorId` int NULL",
  confirmadoEm: "ALTER TABLE `btgContasRecebedoras` ADD COLUMN `confirmadoEm` timestamp NULL DEFAULT NULL",
});

function planoEstrutural(colunas) {
  if (!Array.isArray(colunas) || !colunas.length) {
    throw new Error("Tabela btgContasRecebedoras ausente. Nenhuma estrutura será criada por este utilitário.");
  }
  const mapa = new Map(colunas.map(c => [c.name, c]));
  const origem = mapa.get("origemCadastro");
  if (!origem || ![ENUM_ANTIGO, ENUM_NOVO].includes(origem.type?.toLowerCase()) || origem.nullable !== "NO" || origem.defaultValue !== "api") {
    throw new Error("Origem de cadastro diferente da estrutura revisada. Operação recusada.");
  }
  for (const nome of ["id", "btgIntegracaoId", "accountId", "agencia", "numero", "documentoBeneficiario"]) {
    if (!mapa.has(nome)) throw new Error("Tabela de contas incompleta. Operação recusada.");
  }
  const plano = [];
  if (origem.type.toLowerCase() === ENUM_ANTIGO) plano.push({ campo: "origemCadastro", sql: DDL.origemCadastro });
  for (const [nome, tipo] of [["confirmadoPorId", "int"], ["confirmadoEm", "timestamp"]]) {
    const coluna = mapa.get(nome);
    if (!coluna) {
      plano.push({ campo: nome, sql: DDL[nome] });
    } else if (coluna.dataType?.toLowerCase() !== tipo || coluna.nullable !== "YES" || coluna.defaultValue !== null || coluna.extra) {
      throw new Error(`Coluna ${nome} incompatível. Nenhuma coluna existente será corrigida automaticamente.`);
    }
  }
  return plano;
}

function argumentosValidos(args) {
  const permitido = new Set(["--check", "--apply", `--confirmar=${CONFIRMACAO}`]);
  if (!args.length || args.some(a => !permitido.has(a)) || new Set(args).size !== args.length || args.includes("--check") === args.includes("--apply")) {
    throw new Error("Use --check ou --apply com a confirmação obrigatória. Argumentos inesperados foram recusados.");
  }
  if (args.includes("--apply") && !args.includes(`--confirmar=${CONFIRMACAO}`)) {
    throw new Error("Confirmação de aplicação ausente. Nenhuma conexão foi iniciada.");
  }
  if (args.includes("--check") && args.length !== 1) throw new Error("--check não aceita confirmação de aplicação.");
  return args.includes("--apply");
}

async function consultarEstrutura(db) {
  const [rows] = await db.query(
    "SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, DATA_TYPE AS dataType, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS defaultValue, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
    ["btgContasRecebedoras"],
  );
  return rows;
}

async function main(args = process.argv.slice(2)) {
  const aplicar = argumentosValidos(args);
  require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env", quiet: true });
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente. Nenhuma conexão iniciada.");
  const db = await require("mysql2/promise").createConnection(process.env.DATABASE_URL);
  let lock = false;
  try {
    if (aplicar) {
      const [rows] = await db.query("SELECT GET_LOCK(?, 10) AS adquirido", ["luminus:btg-manual-producao:estrutura"]);
      if (Number(rows[0]?.adquirido) !== 1) throw new Error("Outro provisionamento está em execução. Nenhuma DDL aplicada.");
      lock = true;
      await db.query("SET SESSION lock_wait_timeout = 15");
    }
    const plano = planoEstrutural(await consultarEstrutura(db));
    if (!plano.length) {
      console.log("Estrutura BTG de conta manual de Produção já completa. Nenhuma alteração realizada.");
      return;
    }
    console.log("Campos estruturais pendentes:", plano.map(p => p.campo).join(", "));
    if (!aplicar) {
      console.log("Modo somente leitura. Contas, tokens e emissão não foram alterados.");
      return;
    }
    for (const etapa of plano) {
      await db.query(etapa.sql);
      console.log("DDL aplicada:", etapa.campo);
    }
    if (planoEstrutural(await consultarEstrutura(db)).length) throw new Error("Verificação estrutural incompleta. Não prossiga com o aplicativo.");
    console.log("Estrutura verificada. Contas/tokens preservados; emissão não ativada; nenhuma migração Jurídica executada.");
  } finally {
    try {
      if (lock) await db.query("SELECT RELEASE_LOCK(?)", ["luminus:btg-manual-producao:estrutura"]);
    } finally {
      await db.end();
    }
  }
}

module.exports = { CONFIRMACAO, DDL, planoEstrutural, argumentosValidos, main };
if (require.main === module) {
  main().catch(error => {
    // Não mostrar erro SQL/driver, URL do banco ou valores de ambiente.
    console.error("Provisionamento recusado ou incompleto. Verifique argumentos, estrutura e acesso ao banco com --check. A aplicação exige --apply --confirmar=AMPLIAR_CONTA_MANUAL_BTG_PRODUCAO. Nenhum detalhe de conexão foi exibido; se alguma DDL iniciou, não prossiga com o rollout antes de reavaliar.");
    process.exitCode = 1;
  });
}
