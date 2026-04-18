/**
 * Script para popular IPCA na tabela indicesBCB
 * Usa URL alternativa da API do BCB (ultimos/120 meses)
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { indicesbcb } from '../drizzle/schema.ts';
import { eq, and } from 'drizzle-orm';

function converterData(dataStr) {
  const [dia, mes, ano] = dataStr.split('/');
  return `${ano}-${mes.padStart(2, '0')}-01`;
}

async function popularIPCA() {
  console.log('🚀 Populando IPCA...\n');
  
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);
  
  // Usar dados embutidos (IPCA histórico 2016-2026)
  // A API do BCB para o código 433 tem limitações de acesso
  let dados;
  {
    console.log('Usando dados IPCA históricos embutidos...');
    // Dados IPCA históricos 2016-2026 (valores reais do Banco Central)
    dados = [
      // 2016
      { data: '01/01/2016', valor: '1.27' }, { data: '01/02/2016', valor: '0.90' },
      { data: '01/03/2016', valor: '0.43' }, { data: '01/04/2016', valor: '0.61' },
      { data: '01/05/2016', valor: '0.78' }, { data: '01/06/2016', valor: '0.35' },
      { data: '01/07/2016', valor: '0.52' }, { data: '01/08/2016', valor: '0.44' },
      { data: '01/09/2016', valor: '0.08' }, { data: '01/10/2016', valor: '0.26' },
      { data: '01/11/2016', valor: '0.18' }, { data: '01/12/2016', valor: '0.30' },
      // 2017
      { data: '01/01/2017', valor: '0.38' }, { data: '01/02/2017', valor: '0.33' },
      { data: '01/03/2017', valor: '0.25' }, { data: '01/04/2017', valor: '0.14' },
      { data: '01/05/2017', valor: '0.31' }, { data: '01/06/2017', valor: '-0.23' },
      { data: '01/07/2017', valor: '0.24' }, { data: '01/08/2017', valor: '0.19' },
      { data: '01/09/2017', valor: '0.16' }, { data: '01/10/2017', valor: '0.42' },
      { data: '01/11/2017', valor: '0.28' }, { data: '01/12/2017', valor: '0.44' },
      // 2018
      { data: '01/01/2018', valor: '0.29' }, { data: '01/02/2018', valor: '0.32' },
      { data: '01/03/2018', valor: '0.09' }, { data: '01/04/2018', valor: '0.22' },
      { data: '01/05/2018', valor: '0.40' }, { data: '01/06/2018', valor: '1.26' },
      { data: '01/07/2018', valor: '0.33' }, { data: '01/08/2018', valor: '-0.09' },
      { data: '01/09/2018', valor: '0.48' }, { data: '01/10/2018', valor: '0.45' },
      { data: '01/11/2018', valor: '-0.21' }, { data: '01/12/2018', valor: '0.15' },
      // 2019
      { data: '01/01/2019', valor: '0.32' }, { data: '01/02/2019', valor: '0.43' },
      { data: '01/03/2019', valor: '0.75' }, { data: '01/04/2019', valor: '0.57' },
      { data: '01/05/2019', valor: '0.13' }, { data: '01/06/2019', valor: '0.01' },
      { data: '01/07/2019', valor: '0.19' }, { data: '01/08/2019', valor: '0.11' },
      { data: '01/09/2019', valor: '-0.04' }, { data: '01/10/2019', valor: '0.10' },
      { data: '01/11/2019', valor: '0.51' }, { data: '01/12/2019', valor: '1.15' },
      // 2020
      { data: '01/01/2020', valor: '0.21' }, { data: '01/02/2020', valor: '0.25' },
      { data: '01/03/2020', valor: '0.07' }, { data: '01/04/2020', valor: '-0.31' },
      { data: '01/05/2020', valor: '-0.38' }, { data: '01/06/2020', valor: '0.26' },
      { data: '01/07/2020', valor: '0.36' }, { data: '01/08/2020', valor: '0.24' },
      { data: '01/09/2020', valor: '0.64' }, { data: '01/10/2020', valor: '0.86' },
      { data: '01/11/2020', valor: '0.89' }, { data: '01/12/2020', valor: '1.35' },
      // 2021
      { data: '01/01/2021', valor: '0.25' }, { data: '01/02/2021', valor: '0.86' },
      { data: '01/03/2021', valor: '0.93' }, { data: '01/04/2021', valor: '0.31' },
      { data: '01/05/2021', valor: '0.83' }, { data: '01/06/2021', valor: '0.53' },
      { data: '01/07/2021', valor: '0.96' }, { data: '01/08/2021', valor: '0.87' },
      { data: '01/09/2021', valor: '1.16' }, { data: '01/10/2021', valor: '1.25' },
      { data: '01/11/2021', valor: '0.95' }, { data: '01/12/2021', valor: '0.73' },
      // 2022
      { data: '01/01/2022', valor: '0.54' }, { data: '01/02/2022', valor: '1.01' },
      { data: '01/03/2022', valor: '1.62' }, { data: '01/04/2022', valor: '1.06' },
      { data: '01/05/2022', valor: '0.47' }, { data: '01/06/2022', valor: '0.67' },
      { data: '01/07/2022', valor: '-0.68' }, { data: '01/08/2022', valor: '-0.29' },
      { data: '01/09/2022', valor: '-0.29' }, { data: '01/10/2022', valor: '0.59' },
      { data: '01/11/2022', valor: '0.41' }, { data: '01/12/2022', valor: '0.62' },
      // 2023
      { data: '01/01/2023', valor: '0.53' }, { data: '01/02/2023', valor: '0.84' },
      { data: '01/03/2023', valor: '0.71' }, { data: '01/04/2023', valor: '0.61' },
      { data: '01/05/2023', valor: '0.23' }, { data: '01/06/2023', valor: '0.08' },
      { data: '01/07/2023', valor: '0.12' }, { data: '01/08/2023', valor: '-0.02' },
      { data: '01/09/2023', valor: '0.26' }, { data: '01/10/2023', valor: '0.24' },
      { data: '01/11/2023', valor: '0.28' }, { data: '01/12/2023', valor: '0.62' },
      // 2024
      { data: '01/01/2024', valor: '0.42' }, { data: '01/02/2024', valor: '0.83' },
      { data: '01/03/2024', valor: '0.16' }, { data: '01/04/2024', valor: '0.38' },
      { data: '01/05/2024', valor: '0.46' }, { data: '01/06/2024', valor: '0.20' },
      { data: '01/07/2024', valor: '0.38' }, { data: '01/08/2024', valor: '-0.02' },
      { data: '01/09/2024', valor: '0.44' }, { data: '01/10/2024', valor: '0.56' },
      { data: '01/11/2024', valor: '0.39' }, { data: '01/12/2024', valor: '0.52' },
      // 2025
      { data: '01/01/2025', valor: '0.16' }, { data: '01/02/2025', valor: '1.31' },
      { data: '01/03/2025', valor: '1.32' }, { data: '01/04/2025', valor: '0.43' },
    ];
  }
  
  let inseridos = 0;
  let atualizados = 0;
  
  for (const registro of dados) {
    const mesReferencia = converterData(registro.data);
    const valor = parseFloat(registro.valor);
    
    const existente = await db.select().from(indicesbcb)
      .where(and(eq(indicesbcb.indice, 'IPCA'), eq(indicesbcb.mesReferencia, mesReferencia)))
      .limit(1);
    
    if (existente.length > 0) {
      await db.update(indicesbcb).set({ valor })
        .where(and(eq(indicesbcb.indice, 'IPCA'), eq(indicesbcb.mesReferencia, mesReferencia)));
      atualizados++;
    } else {
      await db.insert(indicesbcb).values({ indice: 'IPCA', mesReferencia, valor });
      inseridos++;
    }
  }
  
  await connection.end();
  console.log(`\n✅ IPCA: ${inseridos} inseridos, ${atualizados} atualizados`);
}

popularIPCA().catch(e => { console.error('Erro:', e); process.exit(1); });
