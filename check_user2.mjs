import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL || '';
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) { console.log('No DB URL'); process.exit(1); }
const [,user,pass,host,port,db] = match;

const conn = await createConnection({ 
  host, port: Number(port), user, password: pass, database: db,
  ssl: { rejectUnauthorized: false }
});

const [rows] = await conn.execute("SELECT id, name, email, role, isActive, condominioId FROM users WHERE id = 24420015");
console.log('User 24420015:', JSON.stringify(rows, null, 2));

const [allRoles] = await conn.execute("SELECT role, COUNT(*) as count FROM users GROUP BY role");
console.log('Roles distribution:', JSON.stringify(allRoles, null, 2));

await conn.end();
