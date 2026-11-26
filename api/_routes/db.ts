import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from '../_lib/auth.js';
import { withSentry } from '../_lib/sentry.js';
import { isIdent, isIdentList } from '../_lib/sql-ident.js';
import { checkAppointmentUpdate } from '../_lib/appointment-update.js';
import { DOCTOR_ONLY_WRITE_TABLES, hasDoctorRole } from '../_lib/doctor-account.js';
import { notifyDoctorOfBooking } from '../_lib/doctor-notify.js';

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
  life_events: 'user_id',
  medications: 'user_id',
  babies: 'user_id',
  birth_records: 'user_id',
  // Personal data older versions kept only on the device (migration 011).
  user_app_data: 'user_id',
  // Questions to bring, saved per upcoming visit (migration 012). The
  // patient owns them; the visit's doctor reads them via /api/doctors/patient.
  visit_questions: 'user_id',
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
  // The consent gate for /api/doctors/patient. Rows are created by
  // /api/connections/redeem-code and /api/appointments/book (always
  // 'pending') and approved/removed only by the patient through
  // /api/connections/respond. A generic insert/update here would let any
  // account write { doctor_id: me, patient_id: <anyone>, status: 'approved' }
  // and open that patient's whole chart. The app only reads it here.
  'doctor_patient_connections',
]);

// Rows that may be edited but not CREATED through /api/db. doctor_profiles
// rows are created by /api/auth/doctor-signup (pending verification); a
// client-side insert would let any patient mint their own doctor profile.
// appointments are created by /api/appointments/book, which checks the
// doctor, the slot and the overlap; a direct insert would skip all of that.
const INSERT_BLOCKED: Set<string> = new Set([
  'doctor_profiles',
  'appointments',
]);

// Tables where an UPDATE may only touch the listed columns. Which party
// may set which appointment status is checked per row by
// checkAppointmentUpdate (api/_lib/appointment-update.ts); moving the slot
// goes through /api/appointments/reschedule, which re-checks overlaps.
const UPDATABLE_COLUMNS: Record<string, string[]> = {
  appointments: ['status', 'notes'],
};

// Columns only server endpoints may write. is_verified/verification_status
// are flipped by /api/admin/doctors on approval; letting the owner set them
// would put an unvetted "verified doctor" in every patient's directory.
const PROTECTED_COLUMNS: Record<string, string[]> = {
  doctor_profiles: ['is_verified', 'verification_status', 'rating', 'review_count'],
};

// Columns the client may set when CREATING a row but never read back or
// change later. health_documents.file_path is the document's Blob URL: the
// browser writes it once right after uploading, and from then on every read
// goes through /api/docs/file by document id. Masking it here keeps the URL
// off every /api/db response (select *, RETURNING *), and refusing updates
// stops a row being re-pointed at someone else's file.
const SERVER_ONLY_READ_COLUMNS: Record<string, string[]> = {
  health_documents: ['file_path'],
};

function maskRows(table: string, rows: unknown[]): unknown[] {
  const hidden = SERVER_ONLY_READ_COLUMNS[table];
  if (!hidden) return rows;
  return rows.map(r => {
    if (!r || typeof r !== 'object') return r;
    const copy = { ...(r as Record<string, unknown>) };
    for (const c of hidden) delete copy[c];
    return copy;
  });
}

function ownerCols(table: string): string[] | null {
  // Own keys only: 'constructor', '__proto__' etc. must not resolve
  // through Object.prototype and pass as a table.
  if (typeof table !== 'string' || !Object.prototype.hasOwnProperty.call(OWNER_COLUMN, table)) return null;
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

    // Every client-supplied filter must name a real column. (Server-added
    // owner filters and the '__owner_or__' sentinel are appended later and
    // are trusted.)
    // '__owner_or__' is itself a valid identifier, so it is rejected by name:
    // its value carries column names that are interpolated into the SQL
    // unchecked, and a client copy would inject an arbitrary WHERE clause
    // (e.g. `true) OR (true`) that escapes the owner scope.
    for (const f of filters) {
      if (!Array.isArray(f) || !isIdent(f[0]) || f[0].startsWith('__')) {
        return res.status(400).json({ error: 'Invalid filter column' });
      }
    }

    if (!table) return res.status(400).json({ error: 'Missing table' });

    const cols = ownerCols(table);
    if (!cols) return res.status(403).json({ error: `Table not accessible: ${table}` });

    if (
      WRITE_BLOCKED.has(table) &&
      (operation === 'insert' || operation === 'update' || operation === 'upsert' || operation === 'delete')
    ) {
      return res.status(403).json({ error: `Table is read-only via /api/db: ${table}` });
    }
    if (INSERT_BLOCKED.has(table) && (operation === 'insert' || operation === 'upsert')) {
      return res.status(403).json({ error: `Rows can't be created via /api/db: ${table}` });
    }
    if (operation === 'insert' || operation === 'update' || operation === 'upsert') {
      const raw = operation === 'insert' ? insertData : operation === 'update' ? updateData : upsertData;
      const rows = Array.isArray(raw) ? raw : [raw];
      const blocked = (PROTECTED_COLUMNS[table] ?? []).filter(c =>
        rows.some(r => r && typeof r === 'object' && c in r)
      );
      if (blocked.length) {
        return res.status(403).json({ error: `Column(s) not writable via /api/db: ${blocked.join(', ')}` });
      }
    }
    if ((operation === 'update' || operation === 'upsert') && SERVER_ONLY_READ_COLUMNS[table]) {
      const raw = operation === 'update' ? updateData : upsertData;
      const rows = Array.isArray(raw) ? raw : [raw];
      const blocked = SERVER_ONLY_READ_COLUMNS[table].filter(c =>
        rows.some(r => r && typeof r === 'object' && c in r)
      );
      if (blocked.length) {
        return res.status(403).json({ error: `Column(s) not writable via /api/db: ${blocked.join(', ')}` });
      }
    }
    if (operation === 'update' && UPDATABLE_COLUMNS[table]) {
      const allowed = UPDATABLE_COLUMNS[table];
      const extra = Object.keys(updateData && typeof updateData === 'object' ? updateData : {})
        .filter(k => k !== 'updated_at' && !allowed.includes(k));
      if (extra.length) {
        return res.status(403).json({ error: `Column(s) not writable via /api/db: ${extra.join(', ')}` });
      }
    }

    // doctor_notes are shown to the patient (/api/me/doctor-notes) and fed
    // to her AI chat. Only a doctor with an APPROVED connection to that
    // patient may write one, and an existing note can't be re-pointed at
    // another patient.
    if (table === 'doctor_notes') {
      if (operation === 'update' && updateData && typeof updateData === 'object' && 'patient_id' in updateData) {
        return res.status(403).json({ error: 'Column(s) not writable via /api/db: patient_id' });
      }
      // Editing a note the patient can already read also needs the
      // connection to still be approved: once she removes the doctor, the
      // doctor can no longer change what she sees (deleting stays possible,
      // so a doctor can still withdraw a note). One note per update, by id.
      if (operation === 'update') {
        const idFilter = filters.find(f => f[0] === 'id' && f[1] === 'eq');
        if (!idFilter || typeof idFilter[2] !== 'string' || !idFilter[2]) {
          return res.status(400).json({ error: 'Note id required' });
        }
        const ok = await sql.query(
          `SELECT 1 FROM doctor_notes n
             JOIN doctor_patient_connections c
               ON c.doctor_id = n.doctor_id AND c.patient_id = n.patient_id AND c.status = 'approved'
             JOIN user_roles r ON r.user_id = n.doctor_id AND r.role = 'doctor'
            WHERE n.id = $1 AND n.doctor_id = $2
            LIMIT 1`,
          [idFilter[2], user.id]
        );
        if (ok.length === 0) {
          return res.status(403).json({ error: 'No approved connection to this patient' });
        }
      }
      if (operation === 'insert' || operation === 'upsert') {
        const raw = operation === 'insert' ? insertData : upsertData;
        const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
        const patientId = row && typeof row === 'object' ? row.patient_id : undefined;
        if (typeof patientId !== 'string' || !patientId) {
          return res.status(400).json({ error: 'patient_id required' });
        }
        const conn = await sql.query(
          `SELECT 1 FROM doctor_patient_connections c
             JOIN user_roles r ON r.user_id = c.doctor_id AND r.role = 'doctor'
            WHERE c.doctor_id = $1 AND c.patient_id = $2 AND c.status = 'approved' LIMIT 1`,
          [user.id, patientId]
        );
        if (conn.length === 0) {
          return res.status(403).json({ error: 'No approved connection to this patient' });
        }
      }
    }

    // Doctor-only rows: a patient account must not create a schedule or
    // consultation settings under its own id.
    if (
      DOCTOR_ONLY_WRITE_TABLES.has(table) &&
      (operation === 'insert' || operation === 'update' || operation === 'upsert' || operation === 'delete') &&
      !(await hasDoctorRole((text, params) => sql.query(text, params) as Promise<unknown[]>, user.id))
    ) {
      return res.status(403).json({ error: 'Only doctor accounts can change this' });
    }

    // Appointments: who may set which status is decided per row (patient:
    // cancel / undo her own cancellation of an upcoming visit; doctor:
    // close-out). Deleting would erase a visit without a trace, and nothing
    // in the app does it, so it is blocked.
    if (table === 'appointments') {
      if (operation === 'delete') {
        return res.status(403).json({ error: 'Appointments cannot be deleted via /api/db' });
      }
      if (operation === 'update') {
        const check = await checkAppointmentUpdate(
          (text, params) => sql.query(text, params) as Promise<unknown[]>,
          user.id,
          filters,
          updateData,
        );
        if (!check.ok) return res.status(check.status).json({ error: check.error });
      }
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
      const sel = selectColumns || '*';
      if (sel !== '*' && !isIdentList(sel)) {
        return res.status(400).json({ error: 'Invalid selectColumns' });
      }
      query = `SELECT ${sel} FROM ${table}`;
    } else if (operation === 'insert') {
      const data = Array.isArray(insertData) ? insertData[0] : insertData;
      const keys = Object.keys(data);
      if (!keys.every(isIdent)) return res.status(400).json({ error: 'Invalid column name' });
      const values = keys.map(k => data[k]);
      query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => `$${paramIdx++}`).join(', ')}) RETURNING *`;
      params = values;
    } else if (operation === 'update') {
      // Never allow a client to change an owner column.
      const safeUpdate: Record<string, unknown> = { ...updateData };
      for (const c of cols) delete safeUpdate[c];
      // updated_at is always set by the server below; a client copy would
      // make Postgres fail with "multiple assignments to same column".
      delete safeUpdate.updated_at;
      const keys = Object.keys(safeUpdate);
      if (keys.length === 0) return res.status(400).json({ error: 'No updatable columns' });
      if (!keys.every(isIdent)) return res.status(400).json({ error: 'Invalid column name' });
      const setClauses = keys.map(k => `${k} = $${paramIdx++}`);
      params = keys.map(k => safeUpdate[k]);
      query = `UPDATE ${table} SET ${setClauses.join(', ')}, updated_at = now()`;
    } else if (operation === 'upsert') {
      const data = Array.isArray(upsertData) ? upsertData[0] : upsertData;
      const keys = Object.keys(data);
      if (!keys.every(isIdent)) return res.status(400).json({ error: 'Invalid column name' });
      const conflictCol = upsertOptions?.onConflict || 'id';
      if (!isIdentList(conflictCol)) return res.status(400).json({ error: 'Invalid onConflict target' });
      const values = keys.map(k => data[k]);
      const conflictKeys = conflictCol.split(',').map((c: string) => c.trim());
      const updateClauses = keys.filter(k => !conflictKeys.includes(k) && !cols.includes(k)).map(k => `${k} = EXCLUDED.${k}`);
      const placeholders = keys.map(() => `$${paramIdx++}`).join(', ');
      // The ownership check above only vets the INCOMING row. On conflict the
      // EXISTING row is updated, so it must also belong to the caller —
      // otherwise an upsert carrying another user's row id would overwrite
      // that row and RETURNING * would hand it back. With nothing to update,
      // DO NOTHING (an empty SET list is invalid SQL).
      let onConflict = 'DO NOTHING';
      params = values;
      if (updateClauses.length) {
        const ownerParam = `$${paramIdx++}`;
        const ownerGuard = cols.map(c => `${table}.${c} = ${ownerParam}`).join(' OR ');
        onConflict = `DO UPDATE SET ${updateClauses.join(', ')} WHERE ${ownerGuard}`;
        params = [...values, user.id];
      }
      query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflictCol}) ${onConflict} RETURNING *`;
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
      if (!isIdent(orderBy.column)) return res.status(400).json({ error: 'Invalid orderBy column' });
      query += ` ORDER BY ${orderBy.column} ${orderBy.ascending ? 'ASC' : 'DESC'}`;
      if (orderBy.nullsFirst) query += ' NULLS FIRST';
    }

    if (limitCount !== undefined && limitCount !== null) {
      // Coerce to a bounded positive integer — never interpolate a raw
      // client value into the LIMIT clause.
      const lim = Math.floor(Number(limitCount));
      if (Number.isFinite(lim) && lim > 0) {
        query += ` LIMIT ${Math.min(lim, 1000)}`;
      }
    }

    const rows = maskRows(table, await sql.query(query, params));

    // A patient cancelled her visit (or undid her cancellation): tell the
    // doctor on her phone if she switched Booking alerts on. Only when the
    // session user is the visit's PATIENT; doctors' own close-outs are not
    // echoed back to them. Best effort, never fails the update.
    if (table === 'appointments' && operation === 'update' && rows.length === 1
        && updateData && typeof updateData === 'object' && 'status' in updateData) {
      const apt = rows[0] as { id?: string; patient_id?: string; doctor_id?: string; status?: string | null; scheduled_at?: string };
      if (apt.patient_id === user.id && apt.doctor_id && apt.doctor_id !== user.id && apt.id && apt.scheduled_at) {
        const event = apt.status === 'cancelled' ? 'cancelled' : apt.status === 'scheduled' ? 'booked' : null;
        if (event) {
          await notifyDoctorOfBooking(
            (text, p) => sql.query(text, p) as Promise<unknown[]>,
            apt.doctor_id, event, apt.scheduled_at, apt.id,
          );
        }
      }
    }

    return res.status(200).json({ rows, rowCount: rows.length });
  } catch (error) {
    // Postgres error text echoes the offending values ("Key (email)=(...)",
    // 'invalid input syntax for type uuid: "..."') and leaks schema detail,
    // so neither the client nor the log gets it: the client gets a generic
    // message, the log gets the SQLSTATE code, constraint and table only.
    const { status, message } = clientDbError(error);
    const body = (req.body ?? {}) as { table?: unknown; operation?: unknown };
    console.error('DB error:', JSON.stringify({
      code: pgField(error, 'code') ?? (error instanceof Error ? error.name : 'unknown'),
      constraint: pgField(error, 'constraint'),
      table: typeof body.table === 'string' ? body.table.slice(0, 64) : undefined,
      operation: typeof body.operation === 'string' ? body.operation.slice(0, 16) : undefined,
    }));
    return res.status(status).json({ error: message });
  }
}

function pgField(err: unknown, key: 'code' | 'constraint'): string | undefined {
  if (!err || typeof err !== 'object' || !(key in err)) return undefined;
  const v = (err as Record<string, unknown>)[key];
  return typeof v === 'string' ? v.slice(0, 128) : undefined;
}

// Generic, value-free messages by SQLSTATE class.
function clientDbError(err: unknown): { status: number; message: string } {
  const code = pgField(err, 'code') ?? '';
  if (code === '23505') return { status: 409, message: 'This record already exists.' };
  if (code.startsWith('23')) return { status: 400, message: 'The data was rejected by a database rule.' };
  if (code.startsWith('22')) return { status: 400, message: 'Invalid value in request.' };
  if (code === '42703' || code === '42P01') return { status: 400, message: 'Invalid request.' };
  return { status: 500, message: 'Database error' };
}

export default withSentry(handler);
