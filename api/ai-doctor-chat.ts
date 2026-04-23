import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { checkAndConsume } from './_lib/ratelimit.js';
import { withSentry } from './_lib/sentry.js';

export const config = {
  maxDuration: 60,
};

const ALLOWED_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
];

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const rate = checkAndConsume('ai-doctor-chat', user.id, 150);
  if (!rate.ok) {
    return res.status(429).json({
      error: `You've reached today's chat limit (${rate.limit}). Try again in ${Math.ceil(rate.retryInSec / 60)} minutes.`,
      retryInSec: rate.retryInSec,
    });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const { messages, model: requestedModel } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages required' });
  }
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'claude-haiku-4-5-20251001';

  const sql = neon(process.env.DATABASE_URL!);

  // Capture the latest user turn now but don't persist until we
  // actually have an assistant reply — a stream that fails before a
  // single content_block_delta shouldn't leave an orphan user message
  // sitting in chat_messages with no response next to it.
  const lastMsg = messages[messages.length - 1];
  const userTurnContent =
    lastMsg?.role === 'user' && typeof lastMsg.content === 'string'
      ? lastMsg.content
      : null;

  const [docs, extracted, profileRow] = await Promise.all([
    sql.query(
      `SELECT file_name, ai_suggested_name, ai_summary, ai_suggested_category, document_type
       FROM health_documents WHERE user_id = $1 ORDER BY uploaded_at DESC LIMIT 20`,
      [user.id]
    ),
    sql.query(
      `SELECT data_type, title, value, unit, reference_range, status, date_recorded, notes
       FROM medical_extracted_data WHERE user_id = $1 ORDER BY date_recorded DESC NULLS LAST LIMIT 100`,
      [user.id]
    ),
    sql.query('SELECT full_name, life_stage FROM profiles WHERE id = $1', [user.id]),
  ]);

  const profile = profileRow[0];

  let medicalContext = '';
  if (profile) {
    medicalContext += `Patient: ${profile.full_name || 'Unknown'}, Life stage: ${profile.life_stage || 'Not specified'}\n\n`;
  }

  type Row = Record<string, unknown>;

  if (docs.length > 0) {
    medicalContext += '## Uploaded Documents\n';
    (docs as Row[]).forEach((d, i) => {
      medicalContext += `${i + 1}. ${d.ai_suggested_name || d.file_name} (${d.ai_suggested_category || d.document_type})\n`;
      if (d.ai_summary) medicalContext += `   Summary: ${d.ai_summary}\n`;
    });
    medicalContext += '\n';
  }

  if (extracted.length > 0) {
    const grouped: Record<string, Row[]> = {};
    for (const item of extracted as Row[]) {
      const t = item.data_type || 'other';
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(item);
    }
    medicalContext += '## Extracted Medical Data\n';
    for (const [type, items] of Object.entries(grouped)) {
      medicalContext += `\n### ${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n`;
      for (const item of items) {
        let line = `- ${item.title}`;
        if (item.value) line += `: ${item.value}${item.unit ? ' ' + item.unit : ''}`;
        if (item.reference_range) line += ` (ref: ${item.reference_range})`;
        if (item.status) line += ` [${item.status}]`;
        if (item.date_recorded) line += ` — ${item.date_recorded}`;
        if (item.notes) line += `\n  Note: ${item.notes}`;
        medicalContext += line + '\n';
      }
    }
  }

  const systemPrompt = `You are an AI medical assistant for a women's health platform called Womanie. You have access to the patient's uploaded health documents and extracted medical data shown below. Use this information to provide personalized, empathetic health guidance.

IMPORTANT RULES:
- You are NOT a replacement for a real doctor. Always recommend consulting a healthcare professional for serious concerns.
- Be warm, supportive, and use clear language.
- Reference specific findings from the patient's records when relevant.
- If asked about something not in the records, say so honestly.
- Keep answers concise but thorough.
- Format responses with markdown for readability.
- Focus on women's health topics: reproductive health, menstrual cycles, fertility, pregnancy, menopause, general wellness.
- Never fabricate medical data not present in the records.
- When discussing lab results, explain what values mean in plain language.

## Patient Medical Records
${medicalContext || 'No medical records available yet. Encourage the patient to upload their health documents for personalized advice.'}`;

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: m.content,
  }));

  const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: model.includes('haiku') ? 2000 : 4000,
      system: systemPrompt,
      messages: anthropicMessages,
      stream: true,
    }),
  });

  if (!aiResponse.ok) {
    if (aiResponse.status === 429) return res.status(429).json({ error: 'Rate limit exceeded. Please try again shortly.' });
    if (aiResponse.status === 402) return res.status(402).json({ error: 'AI usage limit reached.' });
    const errText = await aiResponse.text();
    console.error('Anthropic error:', aiResponse.status, errText);
    return res.status(500).json({ error: 'AI service unavailable' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const reader = aiResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            const text = event.delta.text;
            assistantText += text;
            const openaiChunk = { choices: [{ delta: { content: text } }] };
            res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
  } finally {
    // Persist the pair together. If the stream yielded no assistant
    // text we also skip the user message — keeps chat history
    // internally consistent instead of half-logged conversations.
    if (assistantText) {
      try {
        if (userTurnContent) {
          await sql.transaction([
            sql`INSERT INTO chat_messages (user_id, role, content) VALUES (${user.id}, 'user', ${userTurnContent})`,
            sql`INSERT INTO chat_messages (user_id, role, content, model) VALUES (${user.id}, 'assistant', ${assistantText}, ${model})`,
          ]);
        } else {
          await sql.query(
            'INSERT INTO chat_messages (user_id, role, content, model) VALUES ($1, $2, $3, $4)',
            [user.id, 'assistant', assistantText, model]
          );
        }
      } catch (err) {
        console.error('Chat persistence error:', err);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

export default withSentry(handler);
