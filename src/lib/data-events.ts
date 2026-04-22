// Lightweight module-level event emitter so any page or widget can
// subscribe to "the user's health data just changed" and refetch — no
// context provider, no React Query, no prop drilling. Emit from
// DocumentUpload when a new doc row is inserted, and from
// MedicalHistory when a polled analysis completes (ai_summary arrives).
// Subscribers on CycleLabInsights, PregnancyLabInsights, HealthSummary,
// HealthTimeline etc. refetch on every tick.

type Listener = () => void;

const listeners = new Set<Listener>();

export function onHealthDataChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHealthDataChange(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (err) {
      // Don't let one bad listener take down the rest.
      console.error('onHealthDataChange listener threw:', err);
    }
  }
}
