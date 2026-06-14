// SQL identifier validation for the /api/db generic router.
//
// Values in that router are always parameterized ($1, $2, …), but column
// and ON CONFLICT *identifiers* are interpolated into the query string.
// `table` is whitelisted separately; every other client-supplied
// identifier (select columns, filter columns, order-by column, conflict
// target, insert/update keys) is validated with these helpers so an
// authenticated client can't smuggle a subquery or extra clause through
// an identifier slot. All legitimate callers send plain column names,
// comma-separated lists, or '*'.

export const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export const isIdent = (s: unknown): s is string =>
  typeof s === 'string' && IDENT_RE.test(s);

// A non-empty comma-separated list of identifiers (column lists, composite
// ON CONFLICT targets like 'user_id,period_start_date').
export const isIdentList = (s: unknown): s is string =>
  typeof s === 'string' && s.length > 0 && s.split(',').every(p => IDENT_RE.test(p.trim()));
