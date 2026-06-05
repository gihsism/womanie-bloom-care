import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { withSentry } from './_lib/sentry.js';

// Which column identifies "mine" for each table accessible via /api/db.
// - string: single owner column; its value must equal the session user id.
// - string[]: relational table where the session user may appear as any of
//   the listed columns (OR'd together in the filter).
// Any table not listed here is rejected.
const OWNER_COLUMN: Record<string, string | string[]> = {
  health_documents: 'user_id',
  medical_extracted_data: 'user_id',
  current_extracted_data: 'user_id',
  daily_health_signals: 'user_id',
  period_tracking: 'user_id',
  ivf_events: 'user_id',
  patient_access_codes: 'patient_id',
  user_roles: 'user_id',
  document_analyses: 'user_id',
  profiles: 'id',
  doctor_profiles: 'user_id',
  doctor_schedule: 'doctor_id',
  doctor_notes: 'doctor_id',
  consultation_settings: 'doctor_id',
  appointments: ['patient_id', 'doctor_id'],
  doctor_patient_connections: ['patient_id', 'doctor_id'],
};

// Tables whose writes must NOT be reachable through the generic /api/db
// router. Reads are still allowed (and still scoped to the session user
// by OWNER_COLUMN), but mutations have to go through a dedicated server
// endpoint. user_roles is the load-bearing one — without this a client
// could POST an insert with { user_id: session.id, role: 'doctor' } and
// walk through every doctor-only flow in the app.
const WRITE_BLOCKED: Set<string> = new Set([
  'user_roles',
]);

function ownerCols(table: string): string[] | null {
  const o = OWNER_COLUMN[table];
  if (!o) return null;
  return Array.isArray(o) ? o : [o];
}

async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const { table, operation, selectColumns, insertData, updateData, upsertData, upsertOptions, orderBy, limitCount } = req.body;
    let { filters } = req.body as { filters?: Array<[string, string, unknown]> };
    filters = Array.isArray(filters) ? [...filters] : [];

    if (!table) return res.status(400).json({ error: 'Missing table' });

    const cols = ownerCols(table);
    if (!cols) return res.status(403).json({ error: `Table not accessible: ${table}` });

    if (
      WRITE_BLOCKED.has(table) &&
      (operation === 'insert' || operation === 'update' || operation === 'upsert' || operation === 'delete')
    ) {
      return res.status(403).json({ error: `Table is read-only via /api/db: ${table}` });
    }

    // Ownership enforcement — reads / updates / deletes.
    // For single-owner tables, force a filter on the owner column. Reject if
    // the client tried to target a different user.
    // For relational tables, require the client to have included a filter on
    // at least one owner column matching the session; otherwise inject an
    // OR-style fallback that selects rows where the session user is either
    // party.
    if (operation === 'select' || operation === 'update' || operation === 'delete') {
      if (cols.length === 1) {
        const col = cols[0];
        const existing = filters.find(f => f[0] === col && f[1] === 'eq');
        if (existing) {
          if (existing[2] !== user.id) return res.status(403).json({ error: 'Owner mismatch' });
        } else {
          filters.push([col, 'eq', user.id]);
        }
      } else {
        const matched = filters.some(f => cols.includes(f[0]) && f[1] === 'eq' && f[2] === user.id);
        if (!matched) {
          // No ownership filter supplied — add a placeholder we'll expand
          // into an OR clause below. Using a sentinel op '__owner_or__' so
          // the later clause builder can special-case it.
          filters.push(['__owner_or__', 'in', { cols, value: user.id }]);
        }
      }
    }

    // Ownership enforcement — inserts / upserts.
    if (operation === 'insert' || operation === 'upsert') {
      const data = operation === 'insert'
        ? (Array.isArray(insertData) ? insertData[0] : insertData)
        : (Array.isArray(upsertData) ? upsertData[0] : upsertData);
      if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Missing data' });
      if (cols.length === 1) {
        const col = cols[0];
        if (data[col] !== undefined && data[col] !== user.id) {
          return res.status(403).json({ error: 'Owner mismatch' });
        }
        data[col] = user.id;
      } else {
        const matched = cols.some(c => data[c] === user.id);
        if (!matched) return res.status(403).json({ error: 'Insert must set an owner column to the session user' });
      }
    }

    // Build SQL based on operation.
    let query = '';
    let params: unknown[] = [];
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
      // Never allow a client to change an owner column.
      const safeUpdate: Record<string, unknown> = { ...updateData };
      for (const c of cols) delete safeUpdate[c];
      const keys = Object.keys(safeUpdate);
      if (keys.length === 0) return res.status(400).json({ error: 'No updatable columns' });
      const setClauses = keys.map(k => `${k} = $${paramIdx++}`);
      params = keys.map(k => safeUpdate[k]);
      query = `UPDATE ${table} SET ${setClauses.join(', ')}, updated_at = now()`;
    } else if (operation === 'upsert') {
      const data = Array.isArray(upsertData) ? upsertData[0] : upsertData;
      const keys = Object.keys(data);
      const values = keys.map(k => data[k]);
      const conflictCol = upsertOptions?.onConflict || 'id';
      const updateClauses = keys.filter(k => k !== conflictCol && !cols.includes(k)).map(k => `${k} = EXCLUDED.${k}`);
      query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => `$${paramIdx++}`).join(', ')}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateClauses.join(', ')} RETURNING *`;
      params = values;
    } else if (operation === 'delete') {
      query = `DELETE FROM ${table}`;
    } else {
      return res.status(400).json({ error: 'Unknown operation' });
    }

    // Apply filters.
    if (filters.length > 0) {
      const whereClauses = filters.map(([col, op, val]) => {
        if (col === '__owner_or__' && op === 'in') {
          const sentinel = val as { cols: string[]; value: unknown };
          const ors = sentinel.cols.map(c => {
            params.push(sentinel.value);
            return `${c} = $${paramIdx++}`;
          });
          return `(${ors.join(' OR ')})`;
        }
        params.push(val);
        const p = `$${paramIdx++}`;
        switch (op) {
          case 'eq': return `${col} = ${p}`;
          case 'neq': return `${col} != ${p}`;
          case 'gt': return `${col} > ${p}`;
          case 'gte': return `${col} >= ${p}`;
          case 'lt': return `${col} < ${p}`;
          case 'lte': return `${col} <= ${p}`;
          // `.in(col, [a, b, c])` — val is an array; `= ANY($p)` matches any
          // element (and correctly matches nothing for an empty array).
          case 'in': return `${col} = ANY(${p})`;
          default: return `${col} = ${p}`;
        }
      });
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    // For update/delete, add RETURNING.
    if (operation === 'update' || operation === 'delete') {
      query += ' RETURNING *';
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy.column} ${orderBy.ascending ? 'ASC' : 'DESC'}`;
      if (orderBy.nullsFirst) query += ' NULLS FIRST';
    }

    if (limitCount) {
      query += ` LIMIT ${limitCount}`;
    }

    const rows = await sql.query(query, params);
    return res.status(200).json({ rows, rowCount: rows.length });
  } catch (error) {
    console.error('DB error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Database error' });
  }
}

export default withSentry(handler);
