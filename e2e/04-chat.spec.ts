import { test, expect } from './helpers';

// Flow 5 — Ask AI: send one short question and see a streamed answer.
// One model call per run (iphone project only) to keep the cost down.
// Chats can only be deleted all at once, so the test clears them afterwards
// only when the account had no chats before; otherwise its one exchange
// stays in Past chats (see docs/e2e.md).

let hadHistory: boolean | undefined;

test.afterAll(async ({ request }) => {
  if (hadHistory === false) {
    const resp = await request.delete('/api/chat/messages');
    expect(resp.ok()).toBeTruthy();
  }
});

test('send one question and get a streamed answer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'one chat call per run: iphone project only');
  test.setTimeout(120_000);

  const before = await page.request.get('/api/chat/messages');
  expect(before.ok()).toBeTruthy();
  hadHistory = ((await before.json()).messages ?? []).length > 0;

  await page.goto('/dashboard/ai-doctor');
  await expect(page.getByRole('heading', { level: 1, name: 'Ask AI' })).toBeVisible();
  const box = page.getByRole('textbox', { name: 'Ask about your health records...' });
  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();
  const question = 'In one sentence: why does drinking water help with headaches?';
  await box.fill(question);

  const streamed = page.waitForResponse((r) => r.url().includes('/api/ai-doctor-chat') && r.request().method() === 'POST');
  await send.click();
  const resp = await streamed;
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type'] ?? '').toContain('text/event-stream');

  await expect(page.getByText(question, { exact: true })).toBeVisible();
  // The copy button appears under an assistant reply once it has text.
  const copy = page.getByRole('button', { name: 'Copy this reply' });
  await expect(copy).toHaveCount(1, { timeout: 90_000 });
  const reply = copy.locator('xpath=..');
  await expect.poll(async () => (await reply.innerText()).replace(/Copy/g, '').trim().length, { timeout: 90_000 })
    .toBeGreaterThan(20);
  // The send button comes back when streaming has finished.
  await box.fill('x');
  await expect(send).toBeEnabled({ timeout: 90_000 });
  await box.fill('');
});
