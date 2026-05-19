// Shared Anthropic call with bounded exponential backoff on 5xx/429.
//
// Returns the successful Response. Throws on persistent failure or any
// 4xx-except-429. Mirrors the retry logic that's lived inside
// analyze-document.ts since session 13; now reused by summary/* and
// ai-doctor-chat so a single transient blip doesn't dump the whole
// request onto the user.

export async function callAnthropicWithRetry(apiKey: string, body: unknown): Promise<Response> {
  const delays = [250, 1000, 4000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) return resp;
    const status = resp.status;
    const transient = status >= 500 || status === 429;
    const errText = await resp.text().catch(() => '');
    console.error(`Anthropic error (attempt ${attempt + 1}):`, status, errText.slice(0, 300));
    lastErr = new Error(`AI request failed: ${status}`);
    if (!transient || attempt === delays.length) throw lastErr;
    await new Promise(r => setTimeout(r, delays[attempt]));
  }
  throw lastErr ?? new Error('AI request failed');
}
