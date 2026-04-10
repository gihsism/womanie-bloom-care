// Neon PostgreSQL client for the frontend
// Uses the @neondatabase/serverless package for HTTP-based queries

const DATABASE_URL = import.meta.env.VITE_DATABASE_URL || '';

interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

// Simple HTTP-based query function using Neon's serverless driver
// For frontend use — authenticated queries go through API routes
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  token?: string
): Promise<QueryResult<T>> {
  const resp = await fetch('/api/db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Query failed' }));
    throw new Error(err.error || `Database error: ${resp.status}`);
  }

  return resp.json();
}
