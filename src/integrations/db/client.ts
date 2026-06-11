// Thin client facade over /api/db (Neon). Exposes a fluent query builder
// (.from(...).select(...).eq(...).order(...).single()) plus .functions.invoke()
// and .auth helpers so page code can use one import.

const API_BASE = '/api';

// Extends PromiseLike so `await db.from(...).select(...)...` resolves to a
// typed { data, error } instead of `unknown` — without this the await operand
// is an untyped thenable, which both errors (TS1320) and makes every `.data`
// access an error (TS18046/TS2339) across the app.
//
// `data: any` is the one deliberate loose boundary in the codebase: rows come
// back from /api/db untyped, and call sites narrow them locally. Params, by
// contrast, only get serialized into the request body, so `unknown` suffices.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbResult = { data: any; error: unknown };

interface QueryBuilder extends PromiseLike<DbResult> {
  select: (columns?: string) => QueryBuilder;
  insert: (data: unknown) => QueryBuilder;
  update: (data: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  upsert: (data: unknown, options?: { onConflict?: string }) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  gt: (column: string, value: unknown) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  lt: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<DbResult>;
  maybeSingle: () => Promise<DbResult>;
  // `then` is provided by the PromiseLike base (makes the builder awaitable).
}

function createQueryBuilder(table: string): QueryBuilder {
  let operation = 'select';
  let selectColumns = '*';
  let insertData: unknown = null;
  let updateData: unknown = null;
  let upsertData: unknown = null;
  let upsertOptions: { onConflict?: string } | null = null;
  const filters: [string, string, unknown][] = [];
  let orderBy: { column: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;
  let isSingle = false;
  let isMaybeSingle = false;

  const builder: QueryBuilder = {
    select(columns = '*') { selectColumns = columns; if (!insertData && !updateData && !upsertData) operation = 'select'; return builder; },
    insert(data) { insertData = data; operation = 'insert'; return builder; },
    update(data) { updateData = data; operation = 'update'; return builder; },
    delete() { operation = 'delete'; return builder; },
    upsert(data, opts) { upsertData = data; upsertOptions = opts ?? null; operation = 'upsert'; return builder; },
    eq(col, val) { filters.push([col, 'eq', val]); return builder; },
    neq(col, val) { filters.push([col, 'neq', val]); return builder; },
    gt(col, val) { filters.push([col, 'gt', val]); return builder; },
    gte(col, val) { filters.push([col, 'gte', val]); return builder; },
    lt(col, val) { filters.push([col, 'lt', val]); return builder; },
    lte(col, val) { filters.push([col, 'lte', val]); return builder; },
    in(col, vals) { filters.push([col, 'in', vals]); return builder; },
    order(col, opts) { orderBy = { column: col, ascending: opts?.ascending ?? true }; return builder; },
    limit(count) { limitCount = count; return builder; },
    single() { isSingle = true; return execute(); },
    maybeSingle() { isMaybeSingle = true; return execute(); },
    then(onfulfilled, onrejected) { return execute().then(onfulfilled, onrejected); },
  };

  async function execute(): Promise<DbResult> {
    try {
      const resp = await fetch(`${API_BASE}/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table, operation, selectColumns,
          insertData, updateData, upsertData, upsertOptions,
          filters, orderBy, limitCount,
          isSingle, isMaybeSingle,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        return { data: null, error: err };
      }

      const result = await resp.json();

      if (isSingle || isMaybeSingle) {
        return { data: result.rows?.[0] || null, error: null };
      }
      return { data: result.rows || [], error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  return builder;
}

// DB client facade that routes queries to our /api/db endpoint (Neon)
export const db = {
  from: (table: string) => createQueryBuilder(table),
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => {
      window.location.href = '/api/auth/logout';
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: async () => ({ data: null, error: null }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Use /api/auth/login (JWT auth)' } }),
    signUp: async () => ({ data: null, error: { message: 'Use /api/auth/signup (JWT auth)' } }),
    resetPasswordForEmail: async () => ({ data: null, error: { message: 'Use /api/auth/change-password' } }),
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: { message: 'Use Vercel Blob for storage' } }),
      download: async () => ({ data: null, error: { message: 'Use Vercel Blob for storage' } }),
      createSignedUrl: async () => ({ data: null, error: null }),
      remove: async () => ({ data: null, error: null }),
    }),
  },
  functions: {
    invoke: async (name: string, options?: { body: unknown }) => {
      const resp = await fetch(`/api/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options?.body || {}),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Function call failed' }));
        throw new Error(err.error || 'Function error');
      }
      return { data: await resp.json(), error: null };
    },
  },
};
