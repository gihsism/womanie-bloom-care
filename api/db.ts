import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const { table, operation, selectColumns, insertData, updateData, upsertData, upsertOptions, filters, orderBy, limitCount, isSingle, isMaybeSingle } = req.body;

    if (!table) return res.status(400).json({ error: 'Missing table' });

    // Build SQL based on operation
    let query = '';
    let params: any[] = [];
    let paramIdx = 1;

    if (operation === 'select') {
      query = `SELECT ${selectColumns || '*'} FROM ${table}`;
    } else if (operation === 'insert') {
      const data = Array.isArray(insertData) ? insertData[0] : insertData;
      const keys = Object.keys(data);
      const values = keys.map(k => data[k]);
      query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => `$${paramIdx++}`).join(', ')}) RETURNING *`;
      params = values;
    } else if (operation === 'update') {
      const keys = Object.keys(updateData);
      const setClauses = keys.map(k => `${k} = $${paramIdx++}`);
      params = keys.map(k => updateData[k]);
      query = `UPDATE ${table} SET ${setClauses.join(', ')}, updated_at = now()`;
    } else if (operation === 'upsert') {
      const data = Array.isArray(upsertData) ? upsertData[0] : upsertData;
      const keys = Object.keys(data);
      const values = keys.map(k => data[k]);
      const conflictCol = upsertOptions?.onConflict || 'id';
      const updateClauses = keys.filter(k => k !== conflictCol).map(k => `${k} = EXCLUDED.${k}`);
      query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => `$${paramIdx++}`).join(', ')}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateClauses.join(', ')} RETURNING *`;
      params = values;
    } else if (operation === 'delete') {
      query = `DELETE FROM ${table}`;
    } else {
      return res.status(400).json({ error: 'Unknown operation' });
    }

    // Apply filters
    if (filters && filters.length > 0) {
      const whereClauses = filters.map(([col, op, val]: [string, string, any]) => {
        params.push(val);
        const p = `$${paramIdx++}`;
        switch (op) {
          case 'eq': return `${col} = ${p}`;
          case 'neq': return `${col} != ${p}`;
          case 'gt': return `${col} > ${p}`;
          case 'gte': return `${col} >= ${p}`;
          case 'lt': return `${col} < ${p}`;
          case 'lte': return `${col} <= ${p}`;
          default: return `${col} = ${p}`;
        }
      });
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // For update/delete, add RETURNING
    if (operation === 'update' || operation === 'delete') {
      query += ' RETURNING *';
    }

    // Order
    if (orderBy) {
      query += ` ORDER BY ${orderBy.column} ${orderBy.ascending ? 'ASC' : 'DESC'}`;
      if (orderBy.nullsFirst) query += ' NULLS FIRST';
    }

    // Limit
    if (limitCount) {
      query += ` LIMIT ${limitCount}`;
    }

    const rows = await sql(query, params);
    return res.status(200).json({ rows, rowCount: rows.length });
  } catch (error) {
    console.error('DB error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Database error' });
  }
}
