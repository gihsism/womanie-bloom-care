// Pull a user-friendly message out of an unknown caught value. TS 5
// with useUnknownInCatchVariables narrows `catch (e)` to `unknown`,
// so this replaces the common `catch (e: any)` + `e.message` pattern
// with something the linter is happy with and that actually copes
// with non-Error throws.

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
