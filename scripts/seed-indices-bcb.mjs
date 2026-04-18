/**
 * Script para popular a tabela indicesbcb com dados históricos dos últimos 10 anos
 * 
 * Busca dados da API do Banco Central para os 4 índices principais:
 * - IPCA (código 433)
 * - IGP-M (código 189)
 * - INPC (código 188)
 * - IGP-DI (código 190)
 * 
 * Uso:
 *   node scripts/seed-indices-bcb.mjs
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { indicesbcb } from '../drizzle/schema.ts';
import { eq, and } from 'drizzle-orm';

// Códigos dos índices na API do BCB
const INDICES = {
  IPCA: 433,
  'IGP-M': 189,
  INPC: 188,
  'IGP-DI': 190,
};

// Configuração de anos (últimos 10 anos)
const ANO_INICIAL = 2016;
const ANO_FINAL = 2026;

/**
 * Busca dados de um índice na API do BCB para um período
 * Tenta múltiplas URLs para contornar instabilidades da API
 */
async function buscarDadosBCB(codigoIndice, dataInicio, dataFim) {
  // URLs alternativas para o mesmo índice
  const urls = [
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoIndice}/dados?formato=json&dataInicial=${dataInicio}&dataFinal=${dataFim}`,
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigoIndice}/dados/ultimos/120?formato=json`,
  ];
  
  let lastError = null;
  
  for (const url of urls) {
    try {
      console.log(`  Buscando dados da API: ${url}`);
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Erro na API do BCB: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        throw new Error(`Resposta não é JSON (content-type: ${contentType})`);
      }
      
      const dados = await response.json();
      
      if (!Array.isArray(dados)) {
        throw new Error(`Resposta inesperada: ${JSON.stringify(dados).substring(0, 100)}`);
      }
      
      console.log(`  Recebidos ${dados.length} registros`);
      return dados;
    } catch (error) {
      lastError = error;
      console.warn(`  ⚠️ Tentativa falhou: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw lastError || new Error('Todas as tentativas falharam');
}

/**
 * Converte data DD/MM/YYYY para YYYY-MM-01
 */
function converterData(dataStr) {
  const [dia, mes, ano] = dataStr.split('/');
  return `${ano}-${mes.padStart(2, '0')}-01`;
}

/**
 * Popula índices no banco de dados
 */
async function popularIndices() {
  console.log('🚀 Iniciando população de índices BCB...\n');
  
  // Conectar ao banco
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);
  
  console.log('✅ Conectado ao banco de dados\n');
  
  // Datas de busca
  const dataInicio = `01/01/${ANO_INICIAL}`;
  const dataFim = `31/12/${ANO_FINAL}`;
  
  let totalInseridos = 0;
  let totalAtualizados = 0;
  let totalErros = 0;
  
  // Processar cada índice
  for (const [nomeIndice, codigoIndice] of Object.entries(INDICES)) {
    console.log(`📊 Processando ${nomeIndice} (código ${codigoIndice})...`);
    
    try {
      // Buscar dados da API
      const dados = await buscarDadosBCB(codigoIndice, dataInicio, dataFim);
      
      // Inserir/atualizar cada registro
      for (const registro of dados) {
        const mesReferencia = converterData(registro.data);
        const valor = parseFloat(registro.valor);
        
        try {
          // Verificar se já existe
          const existente = await db
            .select()
            .from(indicesbcb)
            .where(
              and(
                eq(indicesbcb.indice, nomeIndice),
                eq(indicesbcb.mesReferencia, mesReferencia)
              )
            )
            .limit(1);
          
          if (existente.length > 0) {
            // Atualizar
            await db
              .update(indicesbcb)
              .set({ valor })
              .where(
                and(
                  eq(indicesbcb.indice, nomeIndice),
                  eq(indicesbcb.mesReferencia, mesReferencia)
                )
              );
            totalAtualizados++;
          } else {
            // Inserir
            await db.insert(indicesbcb).values({
              indice: nomeIndice,
              mesReferencia,
              valor,
            });
            totalInseridos++;
          }
        } catch (error) {
          console.error(`  ❌ Erro ao processar ${mesReferencia}: ${error.message}`);
          totalErros++;
        }
      }
      
      console.log(`  ✅ ${nomeIndice} processado com sucesso\n`);
      
      // Aguardar 1 segundo entre índices para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`  ❌ Erro ao processar ${nomeIndice}: ${error.message}\n`);
      totalErros++;
    }
  }
  
  // Fechar conexão
  await connection.end();
  
  // Resumo
  console.log('\n📈 Resumo da População:');
  console.log(`  ✅ Registros inseridos: ${totalInseridos}`);
  console.log(`  🔄 Registros atualizados: ${totalAtualizados}`);
  console.log(`  ❌ Erros: ${totalErros}`);
  console.log(`  📊 Total processado: ${totalInseridos + totalAtualizados}`);
  
  console.log('\n✅ População de índices concluída!');
}

// Executar
popularIndices().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
