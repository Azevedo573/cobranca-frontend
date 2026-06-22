import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL || '';
// Remove ssl param from URL if present
const cleanUrl = url.replace(/\?.*$/, '');
const match = cleanUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) { console.log('No DB URL, raw:', url.substring(0, 50)); process.exit(1); }
const [,user,pass,host,port,db] = match;

console.log('Connecting to:', host, port, db.substring(0, 10));

const conn = await createConnection({ 
  host, port: Number(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const [rows] = await conn.execute("SELECT id, name, email, role, isActive, condominioId FROM users WHERE id = 24420015");
console.log('User 24420015:', JSON.stringify(rows, null, 2));

const [allRoles] = await conn.execute("SELECT role, COUNT(*) as cnt FROM users GROUP BY role");
console.log('Roles:', JSON.stringify(allRoles, null, 2));

await conn.end();
