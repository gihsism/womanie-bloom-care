// Server-side Telegram notifier for operational events Alena should
// hear about without polling (doctor signups, etc.). Uses the same bot
// as the session digests; TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID live in
// Vercel env. Always fire-and-forget: a notification failure must
// never fail the user-facing request, so callers don't await rejection
// paths and we swallow everything here.

export async function notifyAdmin(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // not configured — silently skip

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // Best-effort only.
  }
}
