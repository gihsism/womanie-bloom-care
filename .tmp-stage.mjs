import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const [, , ls] = process.argv;
const [{ id }] = await sql`select id from auth_users where email='ux-review@womanie.test'`;
const dd = ls==='pregnancy' ? new Date(Date.now() + 70*86400e3).toISOString().slice(0,10) : null;
await sql`update profiles set life_stage=${ls}, pregnancy_due_date=${dd} where id=${id}`;
