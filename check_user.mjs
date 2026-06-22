import { createConnection } from 'mysql2/promise';

const url = process.env.DATABASE_URL || '';
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!match) { console.log('No DB URL'); process.exit(1); }
const [,user,pass,host,port,db] = match;

const conn = await createConnection({ host, port: Number(port), user, password: pass, database: db });
const [rows] = await conn.execute("SELECT id, name, email, role, isActive FROM users WHERE email='haubrick@gmail.com'");
console.log(JSON.stringify(rows, null, 2));
const [all] = await conn.execute("SELECT COUNT(*) as total FROM users");
console.log('Total users:', JSON.stringify(all));
await conn.end();
