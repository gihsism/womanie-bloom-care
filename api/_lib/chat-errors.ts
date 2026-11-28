// What /api/ai-doctor-chat answers when the model call fails, in words the
// Ask AI page shows as they are (src/lib/chatErrors.ts picks the title
// from the status: 429 = rate limit, 504 = timeout, anything else = could
// not answer). Never the provider's own error text.

/** How long the model API may take to start answering before we give up. */
export const MODEL_HANDSHAKE_TIMEOUT_MS = 25_000;

export type UpstreamFailure = number | 'timeout' | 'network';

export function upstreamFailure(failure: UpstreamFailure): { status: number; error: string } {
  if (failure === 'timeout') return { status: 504, error: 'Ask AI took too long to answer. Please try again.' };
  if (failure === 'network') return { status: 502, error: 'Ask AI could not be reached just now. Please try again in a moment.' };
  if (failure === 429) return { status: 429, error: 'Ask AI is busy right now. Please wait a minute and try again.' };
  if (failure === 402) return { status: 402, error: 'Ask AI is not available right now. Please try again later.' };
  if (failure === 529 || failure >= 500) return { status: 503, error: 'Ask AI is busy or unavailable right now. Please try again in a moment.' };
  return { status: 500, error: 'Ask AI could not answer just now. Please try again.' };
}

/** Sent in place of the rest of an answer that broke off mid-stream. */
export const STREAM_INTERRUPTED_MESSAGE = 'The answer stopped before it was finished. Please try again.';

export function streamErrorEvent(message = STREAM_INTERRUPTED_MESSAGE): string {
  return `data: ${JSON.stringify({ error: { message } })}\n\n`;
}

/** A thrown fetch error that is our handshake timeout (AbortSignal.timeout). */
export function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: unknown })?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}
