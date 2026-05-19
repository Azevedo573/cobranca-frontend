/**
 * Script de migração segura: converte os logins dos condomínios em usuários
 * administradores principais na tabela users.
 *
 * Regras:
 * - Para cada condomínio com username + password preenchidos:
 *   - Verificar se já existe um usuário com esse email/username
 *   - Se não existir, criar usuário com isPrimaryAdmin=1, role='sindico', condominioId
 * - Idempotente: pode ser executado múltiplas vezes sem duplicar dados
 */

import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carregar .env do projeto
const envPath = join(__dirname, "../.env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  const lines = envContent.split("\n");
  for (const line of lines) {
    const [key, ...vals] = line.split("=");
    if (key && vals.length) {
      process.env[key.trim()] = vals.join("=").trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // .env pode não existir em produção — usar process.env diretamente
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL não encontrada. Defina a variável de ambiente.");
  process.exit(1);
}

async function run() {
  const conn = await createConnection(DATABASE_URL);
  console.log("✅ Conectado ao banco de dados.");

  try {
    // Buscar todos os condomínios com username e password preenchidos
    const [condominios] = await conn.execute(
      "SELECT id, name, username, password FROM condominios WHERE username IS NOT NULL AND username != '' AND password IS NOT NULL AND password != ''"
    );

    console.log(`📋 Encontrados ${condominios.length} condomínio(s) com login configurado.`);

    let criados = 0;
    let ignorados = 0;

    for (const cond of condominios) {
      const email = cond.username.includes("@") ? cond.username : `${cond.username}@condominio.local`;

      // Verificar se já existe usuário com esse email para esse condomínio
      const [existing] = await conn.execute(
        "SELECT id FROM users WHERE (email = ? OR openId = ?) AND condominioId = ?",
        [email, `cond_${cond.id}_primary`, cond.id]
      );

      if (existing.length > 0) {
        console.log(`  ⏭️  Condomínio #${cond.id} (${cond.name}): usuário já existe, ignorando.`);
        ignorados++;
        continue;
      }

      // Criar usuário administrador principal
      const openId = `cond_${cond.id}_primary`;
      const now = new Date();

      await conn.execute(
        `INSERT INTO users 
          (openId, name, email, passwordHash, loginMethod, role, condominioId, isPrimaryAdmin, isActive, createdAt, updatedAt, lastSignedIn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          openId,
          `Administrador — ${cond.name}`,
          email,
          cond.password, // já é hash bcrypt
          "custom",
          "sindico",
          cond.id,
          1, // isPrimaryAdmin
          1, // isActive
          now,
          now,
          now,
        ]
      );

      console.log(`  ✅ Condomínio #${cond.id} (${cond.name}): usuário criado com email "${email}".`);
      criados++;
    }

    console.log(`\n📊 Resumo: ${criados} usuário(s) criado(s), ${ignorados} ignorado(s).`);
  } finally {
    await conn.end();
    console.log("🔌 Conexão encerrada.");
  }
}

run().catch((err) => {
  console.error("❌ Erro na migração:", err);
  process.exit(1);
});
