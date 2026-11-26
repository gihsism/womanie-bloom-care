import { test, expect } from './helpers';

// Flow 5 — Ask AI: send one short question, see a streamed answer, then
// delete that one chat from Past chats (confirm dialog). One model call per
// run (iphone project only) to keep the cost down. afterAll removes the
// test's chat by its conversation_id if the UI step did not get to it.

const QUESTION = 'In one sentence: why does drinking water help with headaches?';

test.afterAll(async ({ request }) => {
  const resp = await request.get('/api/chat/messages');
  if (!resp.ok()) return;
  const left = ((await resp.json()).messages ?? []) as Array<{ content: string; conversation_id?: string | null }>;
  const ids = new Set(left.filter((m) => m.content === QUESTION && m.conversation_id).map((m) => m.conversation_id));
  for (const conversationId of ids) {
    await request.delete('/api/chat/conversation', { data: { conversationId } });
  }
});

test('send one question and get a streamed answer', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'one chat call per run: iphone project only');
  test.setTimeout(120_000);

  await page.goto('/dashboard/ai-doctor');
  await expect(page.getByRole('heading', { level: 1, name: 'Ask AI' })).toBeVisible();
  const box = page.getByRole('textbox', { name: /^Ask (about your health records|anything about your health)/ });
  const send = page.getByRole('button', { name: 'Send' });
  await expect(send).toBeDisabled();
  const question = QUESTION;
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

  // Delete just this chat from Past chats; cancel first, then confirm.
  await page.getByRole('button', { name: 'Past chats' }).click();
  // (A run that stopped early can leave an older copy; the newest is first.)
  const dels = page.getByRole('button', { name: /^Delete chat: In one sentence: why does drinking water/ });
  await expect(dels.first()).toBeVisible();
  const n = await dels.count();
  const del = dels.first();
  page.once('dialog', (d) => d.dismiss());
  await del.click();
  await expect(dels).toHaveCount(n);
  page.once('dialog', (d) => d.accept());
  const deleted = page.waitForResponse((r) => r.url().includes('/api/chat/conversation') && r.request().method() === 'DELETE');
  await del.click();
  expect((await deleted).status()).toBe(200);
  await expect(dels).toHaveCount(n - 1);
});
