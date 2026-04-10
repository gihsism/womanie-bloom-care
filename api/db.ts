import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const { sql: query, params = [] } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Missing SQL query' });
    }

    // Security: only allow SELECT, INSERT, UPDATE, DELETE — no DDL
    const normalized = query.trim().toUpperCase();
    if (!['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH'].some(cmd => normalized.startsWith(cmd))) {
      return res.status(403).json({ error: 'Forbidden query type' });
    }

    const rows = await sql(query, params);
    return res.status(200).json({ rows, rowCount: rows.length });
  } catch (error) {
    console.error('DB query error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
}
