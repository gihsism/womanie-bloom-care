// A neutral placeholder for a number or line whose data is still loading
// ("…" on screen, "Loading" for screen readers), so an empty-state text
// such as "No feeds yet" only shows once the data has arrived and is empty.
export const LOADING = '…';

export function LoadingValue({ testId }: { testId?: string }) {
  return (
    <span data-testid={testId} data-loading="true">
      <span aria-hidden="true">{LOADING}</span>
      <span className="sr-only">Loading</span>
    </span>
  );
}

/** Shows `value`, or the placeholder while `loaded` is false (or value is LOADING). */
export function ValueOrLoading({ loaded = true, value }: { loaded?: boolean; value: React.ReactNode }) {
  return loaded && value !== LOADING ? <>{value}</> : <LoadingValue />;
}
