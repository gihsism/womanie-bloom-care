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

  const { messages, model: requestedModel, personalContext } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages required' });
  }
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : 'claude-haiku-4-5-20251001';

  // Client-supplied context: things the server can't see (age lives in
  // localStorage), or things we precomputed there and don't want to
  // re-derive here (AMH age-bracket assessment). Validated shape only;
  // anything else is dropped. Free-form `summary` lets the client send
  // a pre-built block without us reaching into its internals.
  const personalContextBlock: string = (() => {
    if (!personalContext || typeof personalContext !== 'object') return '';
    const lines: string[] = [];
    const age = typeof personalContext.age === 'number' && personalContext.age > 0 && personalContext.age < 130
      ? Math.floor(personalContext.age)
      : null;
    if (age !== null) lines.push(`Age: ${age}`);
    const amhSummary = typeof personalContext.amhSummary === 'string'
      ? personalContext.amhSummary.slice(0, 400)
      : null;
    if (amhSummary) lines.push(`AMH context: ${amhSummary}`);
    const flags = typeof personalContext.flags === 'string'
      ? personalContext.flags.slice(0, 400)
      : null;
    if (flags) lines.push(`Lab signals: ${flags}`);
    if (lines.length === 0) return '';
    return `\n## Personal context\n${lines.join('\n')}\n`;
  })();

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

  const [docs, extracted, profileRow, upcomingApts, visibleNotes] = await Promise.all([
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
    sql.query(
      `SELECT full_name, life_stage, pregnancy_due_date, ivf_start_date, ivf_phase
         FROM profiles WHERE id = $1`,
      [user.id]
    ),
    sql.query(
      `SELECT a.scheduled_at, a.consultation_type, a.duration,
              p.full_name AS doctor_name, p.title AS doctor_title, p.specialties AS doctor_specialties
         FROM appointments a
         LEFT JOIN doctor_profiles p ON p.user_id = a.doctor_id
        WHERE a.patient_id = $1
          AND a.scheduled_at >= NOW()
          AND COALESCE(a.status, 'scheduled') <> 'cancelled'
        ORDER BY a.scheduled_at ASC
        LIMIT 5`,
      [user.id]
    ),
    sql.query(
      `SELECT n.title, n.content, n.note_type, n.created_at,
              p.full_name AS doctor_name, p.title AS doctor_title
         FROM doctor_notes n
         LEFT JOIN doctor_profiles p ON p.user_id = n.doctor_id
        WHERE n.patient_id = $1 AND n.is_visible_to_patient = TRUE
        ORDER BY n.created_at DESC
        LIMIT 5`,
      [user.id]
    ),
  ]);

  const profile = profileRow[0];

  let medicalContext = '';
  if (profile) {
    medicalContext += `Patient: ${profile.full_name || 'Unknown'}, Life stage: ${profile.life_stage || 'Not specified'}`;

    // Enrich with mode-specific anchor data so the assistant can
    // answer "what week am I?" / "where am I in my IVF cycle?"
    // without having to ask the user. profiles already stores these
    // — they were just not being passed into the prompt.
    if (profile.pregnancy_due_date) {
      const due = new Date(profile.pregnancy_due_date as string);
      if (!Number.isNaN(due.getTime())) {
        const today = new Date();
        const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86_400_000);
        const totalDays = 280 - daysUntilDue;
        const weeksPregnant = Math.max(0, Math.min(42, Math.floor(totalDays / 7)));
        const daysExtra = Math.max(0, totalDays % 7);
        medicalContext += `\nPregnancy: due ${due.toISOString().split('T')[0]} (week ${weeksPregnant}${daysExtra ? ` + ${daysExtra}d` : ''}, ${daysUntilDue} days to go)`;
      }
    }
    if (profile.ivf_phase) {
      medicalContext += `\nIVF phase: ${profile.ivf_phase}`;
      if (profile.ivf_start_date) {
        const startDate = new Date(profile.ivf_start_date as string);
        if (!Number.isNaN(startDate.getTime())) {
          const days = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86_400_000));
          medicalContext += ` (day ${days + 1} of journey)`;
        }
      }
    }
    medicalContext += '\n\n';
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

  if (upcomingApts.length > 0) {
    medicalContext += '\n## Upcoming Appointments\n';
    (upcomingApts as Row[]).forEach((a) => {
      const doctorLabel = [a.doctor_title, a.doctor_name].filter(Boolean).join(' ') || 'a doctor';
      const specialties = Array.isArray(a.doctor_specialties) ? a.doctor_specialties as string[] : [];
      const spec = specialties.length > 0 ? `, ${specialties[0]}` : '';
      medicalContext += `- ${new Date(String(a.scheduled_at)).toISOString()} with ${doctorLabel}${spec} — ${a.consultation_type || 'consultation'}${a.duration ? `, ${a.duration} min` : ''}\n`;
    });
  }

  if (visibleNotes.length > 0) {
    medicalContext += '\n## Doctor Notes (visible to patient)\n';
    (visibleNotes as Row[]).forEach((n) => {
      const doctorLabel = [n.doctor_title, n.doctor_name].filter(Boolean).join(' ') || 'A doctor';
      const created = new Date(String(n.created_at)).toLocaleDateString();
      medicalContext += `- ${created} — ${doctorLabel} (${n.note_type || 'note'}): ${n.title}\n  ${String(n.content || '').replace(/\n/g, '\n  ')}\n`;
    });
  }

  if (personalContextBlock) {
    medicalContext += personalContextBlock;
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

  // Retry the initial connection on transient 5xx — the stream itself
  // can't be safely resumed once it's started, but a single failed
  // handshake shouldn't dump the user back to a generic error.
  // 429 / 402 short-circuit so the client surfaces the right code.
  const requestBody = {
    model,
    max_tokens: model.includes('haiku') ? 2000 : 4000,
    system: systemPrompt,
    messages: anthropicMessages,
    stream: true,
  };
  const initialDelays = [250, 1000];
  let aiResponse: Response | null = null;
  for (let attempt = 0; attempt <= initialDelays.length; attempt++) {
    aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    if (aiResponse.ok) break;
    if (aiResponse.status >= 500 && attempt < initialDelays.length) {
      console.warn(`Anthropic ${aiResponse.status} on chat handshake (attempt ${attempt + 1}); retrying`);
      await new Promise(r => setTimeout(r, initialDelays[attempt]));
      continue;
    }
    break;
  }

  if (!aiResponse || !aiResponse.ok) {
    if (aiResponse?.status === 429) return res.status(429).json({ error: 'Rate limit exceeded. Please try again shortly.' });
    if (aiResponse?.status === 402) return res.status(402).json({ error: 'AI usage limit reached.' });
    const errText = aiResponse ? await aiResponse.text() : '';
    console.error('Anthropic error:', aiResponse?.status, errText);
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
