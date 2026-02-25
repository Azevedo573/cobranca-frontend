/**
 * Script para popular o cache de índices do BCB
 * 
 * Busca índices dos últimos 2 anos e salva no banco de dados local
 * para cálculos rápidos de correção monetária.
 * 
 * Uso: node scripts/popular-cache-indices.mjs
 */

import { atualizarCacheTodosIndices } from "../server/bcb-cache.ts";

async function main() {
  console.log("🚀 Iniciando população do cache de índices do BCB...\n");

  try {
    const resultados = await atualizarCacheTodosIndices();

    console.log("\n✅ Cache populado com sucesso!");
    console.log("\nResumo:");
    console.log(`  - IPCA: ${resultados["IPCA"]} índices`);
    console.log(`  - IGP-M: ${resultados["IGP-M"]} índices`);
    console.log(`  - INPC: ${resultados["INPC"]} índices`);
    console.log(`  - IGP-DI: ${resultados["IGP-DI"]} índices`);
    console.log(`\n  Total: ${Object.values(resultados).reduce((a, b) => a + b, 0)} índices\n`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Erro ao popular cache:", error);
    process.exit(1);
  }
}

main();
