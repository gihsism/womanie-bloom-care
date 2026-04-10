// Compatibility layer — routes queries to Neon via API
// This file replaces the Supabase client while keeping the same interface
// so existing code doesn't break during migration

const API_BASE = '/api';

interface QueryBuilder {
  select: (columns?: string) => QueryBuilder;
  insert: (data: any) => QueryBuilder;
  update: (data: any) => QueryBuilder;
  delete: () => QueryBuilder;
  upsert: (data: any, options?: any) => QueryBuilder;
  eq: (column: string, value: any) => QueryBuilder;
  neq: (column: string, value: any) => QueryBuilder;
  gt: (column: string, value: any) => QueryBuilder;
  gte: (column: string, value: any) => QueryBuilder;
  lt: (column: string, value: any) => QueryBuilder;
  lte: (column: string, value: any) => QueryBuilder;
  order: (column: string, options?: any) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<{ data: any; error: any }>;
  maybeSingle: () => Promise<{ data: any; error: any }>;
  then: (resolve: any) => Promise<any>;
}

function createQueryBuilder(table: string): QueryBuilder {
  let operation = 'select';
  let selectColumns = '*';
  let insertData: any = null;
  let updateData: any = null;
  let upsertData: any = null;
  let upsertOptions: any = null;
  const filters: [string, string, any][] = [];
  let orderBy: { column: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;
  let isSingle = false;
  let isMaybeSingle = false;

  const builder: QueryBuilder = {
    select(columns = '*') { selectColumns = columns; operation = 'select'; return builder; },
    insert(data) { insertData = data; operation = 'insert'; return builder; },
    update(data) { updateData = data; operation = 'update'; return builder; },
    delete() { operation = 'delete'; return builder; },
    upsert(data, opts) { upsertData = data; upsertOptions = opts; operation = 'upsert'; return builder; },
    eq(col, val) { filters.push([col, 'eq', val]); return builder; },
    neq(col, val) { filters.push([col, 'neq', val]); return builder; },
    gt(col, val) { filters.push([col, 'gt', val]); return builder; },
    gte(col, val) { filters.push([col, 'gte', val]); return builder; },
    lt(col, val) { filters.push([col, 'lt', val]); return builder; },
    lte(col, val) { filters.push([col, 'lte', val]); return builder; },
    order(col, opts) { orderBy = { column: col, ascending: opts?.ascending ?? true }; return builder; },
    limit(count) { limitCount = count; return builder; },
    single() { isSingle = true; return execute(); },
    maybeSingle() { isMaybeSingle = true; return execute(); },
    then(resolve) { return execute().then(resolve); },
  };

  async function execute(): Promise<{ data: any; error: any }> {
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

// Mock supabase client that routes to our API
export const supabase = {
  from: (table: string) => createQueryBuilder(table),
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => {
      // Use Clerk's sign out
      try {
        const { Clerk } = await import('@clerk/clerk-react');
        // Access clerk instance from window
        if ((window as any).__clerk) {
          await (window as any).__clerk.signOut();
        }
      } catch { /* ignore */ }
      window.location.href = '/';
    },
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: async () => ({ data: null, error: null }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
    signUp: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
    resetPasswordForEmail: async () => ({ data: null, error: { message: 'Use Clerk for authentication' } }),
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
    invoke: async (name: string, options?: { body: any }) => {
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
