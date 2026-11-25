import { describe, it, expect } from 'vitest';
import { scrubEvent } from './sentry';

describe('scrubEvent', () => {
  it('drops request bodies, cookies and auth headers before an event leaves', () => {
    const event = {
      message: 'Handled HTTP 500',
      request: {
        url: '/api/ai-doctor-chat',
        data: { messages: [{ role: 'user', content: 'my AMH is 0.4' }] },
        cookies: { womanie_session: 'jwt' },
        headers: { Cookie: 'womanie_session=jwt', authorization: 'Bearer x', 'user-agent': 'ua' } as Record<string, string>,
      },
    };
    const out = scrubEvent(event);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({ 'user-agent': 'ua' });
    expect((out.request as { url?: string }).url).toBe('/api/ai-doctor-chat');
  });
  it('passes events without a request through unchanged', () => {
    const event: { message: string; request?: undefined } = { message: 'x' };
    expect(scrubEvent(event)).toEqual({ message: 'x' });
  });
});
