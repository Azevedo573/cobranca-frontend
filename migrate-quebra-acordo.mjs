import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL não definida'); process.exit(1); }

const conn = await createConnection(url);

const queries = [
  // Verificar se colunas já existem antes de adicionar
  `SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acordos' AND COLUMN_NAME = 'motivoQuebra')`,
  `ALTER TABLE acordos MODIFY COLUMN status ENUM('ativo','pago','cancelado','inadimplente') NOT NULL DEFAULT 'ativo'`,
  `ALTER TABLE parcelasAcordo MODIFY COLUMN status ENUM('pendente','pago','atrasado','cancelado') NOT NULL DEFAULT 'pendente'`,
];

const addCols = [
  `ALTER TABLE acordos ADD COLUMN motivoQuebra TEXT NULL`,
  `ALTER TABLE acordos ADD COLUMN dataQuebra TIMESTAMP NULL`,
  `ALTER TABLE acordos ADD COLUMN valorPagoAcordo INT NOT NULL DEFAULT 0`,
];

// Verificar colunas existentes
const [rows] = await conn.execute(`DESCRIBE acordos`);
const cols = rows.map(r => r.Field.toLowerCase());
console.log('Colunas atuais:', cols.join(', '));

for (const q of queries) {
  try {
    await conn.execute(q);
    console.log('OK:', q.substring(0, 60));
  } catch(e) {
    console.log('SKIP:', e.message.substring(0, 80));
  }
}

for (const q of addCols) {
  const colName = q.match(/ADD COLUMN (\w+)/)?.[1]?.toLowerCase();
  if (colName && cols.includes(colName)) {
    console.log('SKIP (já existe):', colName);
    continue;
  }
  try {
    await conn.execute(q);
    console.log('ADDED:', q.substring(0, 60));
  } catch(e) {
    console.log('ERROR:', e.message.substring(0, 80));
  }
}

await conn.end();
console.log('Migração concluída!');
