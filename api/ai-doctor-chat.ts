import { neon } from '@neondatabase/serverless';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser } from './_lib/auth.js';
import { checkAndConsume } from './_lib/ratelimit.js';
import { withSentry } from './_lib/sentry.js';
import { applyChatLimits } from './_lib/chat-limits.js';
import { parseConversationId, persistChatTurn } from './_lib/chatConversation.js';
import { buildLifeContext } from './_lib/life-context.js';
import { buildProfileContext } from './_lib/profile-context.js';
import { fetchPersonalRows, selectPersonalContext } from './_lib/personal-retrieval.js';
import { SOURCES_FOOTER_MARK, formatSourcesFooter, stripUnknownCitations } from './_lib/research/library.js';
import { buildChatSystemPrompt, selectChatEvidenceForTurn } from './_lib/research/chat-prompt.js';
import { checkCitations, evidenceTexts } from './_lib/research/citation-check.js';

export const config = {
  maxDuration: 60,
};

// Must match the model picker in src/pages/AIDoctorChat.tsx.
// Haiku 4.5 (claude-haiku-4-5-20251001) was replaced by Haiku 5.5.
const DEFAULT_MODEL = 'claude-haiku-5-5';
const ALLOWED_MODELS = [
  DEFAULT_MODEL,
  'claude-sonnet-5-5',
  'claude-opus-5-5',
];

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const rate = await checkAndConsume('ai-doctor-chat', user.id, 150);
  if (!rate.ok) {
    return res.status(429).json({
      error: `You've reached today's chat limit (${rate.limit}). Try again in ${Math.ceil(rate.retryInSec / 60)} minutes.`,
      retryInSec: rate.retryInSec,
    });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const { messages: rawMessages, model: requestedModel, personalContext, conversationId: rawConversationId } = req.body || {};
  // Groups this turn with the rest of its chat in "Past chats". Only a
  // well-formed UUID is kept; the rows are still owned by user.id.
  const conversationId = parseConversationId(rawConversationId);
  // Caps the history size and the new message's length (see chat-limits.ts).
  const limited = applyChatLimits(rawMessages);
  if (!limited.ok) return res.status(limited.status).json({ error: limited.error });
  const messages = limited.messages;
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL;

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
    const postpartumWeeks = typeof personalContext.postpartumWeeks === 'number'
      && personalContext.postpartumWeeks >= 0
      && personalContext.postpartumWeeks <= 104
      ? Math.floor(personalContext.postpartumWeeks)
      : null;
    if (postpartumWeeks !== null) {
      lines.push(`Postpartum week ${postpartumWeeks} (${postpartumWeeks * 7} days since birth)`);
    }
    const cyclePhase = typeof personalContext.cyclePhase === 'string'
      ? personalContext.cyclePhase.slice(0, 200)
      : null;
    if (cyclePhase) lines.push(`Cycle: ${cyclePhase}`);
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

  // Her documents and extracted values, read in full (paged, capped) and
  // filtered per question below; see api/_lib/personal-retrieval.ts.
  const [personalRows, profileRow, upcomingApts, visibleNotes, lifeMeds, lifeEvents, lifeBirth, lifeBabies] = await Promise.all([
    fetchPersonalRows(sql, user.id),
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
    // Life-cycle logs (medicines, birth record, baby tracker, pregnancy
    // self-monitoring). Best-effort: a failure here must not break chat.
    sql.query(`SELECT id, name, dose, reminder_times FROM medications WHERE user_id = $1 AND active = TRUE ORDER BY created_at LIMIT 15`, [user.id]).catch(() => []),
    sql.query(`SELECT kind, baby_id, occurred_at, ended_at, data FROM life_events
                WHERE user_id = $1 AND occurred_at >= NOW() - INTERVAL '7 days'
                ORDER BY occurred_at DESC LIMIT 600`, [user.id]).catch(() => []),
    sql.query(`SELECT * FROM birth_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [user.id]).catch(() => []),
    sql.query(`SELECT id, name, birth_date FROM babies WHERE user_id = $1 ORDER BY created_at LIMIT 3`, [user.id]).catch(() => []),
  ]);

  const profile = profileRow[0];

  let medicalContext = '';
  if (profile) {
    // Stage anchors ("what week am I?") only for the stage she is in now.
    medicalContext += buildProfileContext(profile, new Date());
  }

  type Row = Record<string, unknown>;

  // Question-aware personal records: the full history of every test the
  // question names, matching documents, recent out-of-range values and a
  // small baseline, within a token budget (replaces "latest 20 documents
  // + latest 100 values" regardless of the question).
  const previousUserTurn = [...messages.slice(0, -1)].reverse()
    .find((m: { role?: unknown; content?: unknown }) => m?.role === 'user' && typeof m.content === 'string')?.content as string | undefined;
  medicalContext += selectPersonalContext({
    question: userTurnContent,
    previousQuestion: previousUserTurn,
    labs: personalRows.labs,
    docs: personalRows.docs,
  }).block;

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

  medicalContext += buildLifeContext({
    now: new Date(),
    medications: lifeMeds as Row[],
    events: lifeEvents as Row[],
    birth: ((lifeBirth as Row[])[0] ?? null),
    babies: lifeBabies as Row[],
  });

  if (personalContextBlock) {
    medicalContext += personalContextBlock;
  }

  // Research library: the 0-6 best-matching guideline/review summaries
  // for this question and life stage, given to the model as numbered
  // sources, plus the best open-access full-text passages under the same
  // [n]. Hybrid keyword + semantic search; the question is embedded on
  // this server (never sent to a third party) and the search falls back
  // to keywords only if the model is unavailable or slower than ~3 s.
  // Never allowed to break the chat.
  // A follow-up that finds nothing on its own is searched together with
  // the question before it (see selectChatEvidenceForTurn).
  const { chatSources, researchItems, passages, block: evidenceBlock } = await selectChatEvidenceForTurn(userTurnContent, previousUserTurn, profile?.life_stage);
  const systemPrompt = buildChatSystemPrompt(medicalContext, evidenceBlock);

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role === 'system' ? 'user' : m.role,
    content: typeof m.content === 'string' ? m.content.split(SOURCES_FOOTER_MARK)[0] : m.content, // drop stored Sources footers
  }));

  // Retry the initial connection on transient 5xx — the stream itself
  // can't be safely resumed once it's started, but a single failed
  // handshake shouldn't dump the user back to a generic error.
  // 429 / 402 short-circuit so the client surfaces the right code.
  const requestBody = {
    model,
    max_tokens: model.includes('haiku') ? 2000 : 4000,
    // Haiku 4.5 answered without a thinking pass; Haiku 5.5 thinks by
    // default, so switch it off to keep the fast replies (and the 2000
    // token cap) as they were. Sonnet/Opus keep their defaults.
    ...(model.includes('haiku') ? { thinking: { type: 'disabled' as const } } : {}),
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
  // Numbered sources first, so the page can link [n] while text streams.
  if (chatSources.length > 0) res.write(`data: ${JSON.stringify({ sources: chatSources })}\n\n`);

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
      // Drop any [n] that is not one of the sources we gave the model, so
      // the saved reply never points at a source that does not exist.
      // Then drop any [n] whose sentence names a medicine, a number or an
      // effect direction that source n does not support (deterministic,
      // no model call; see api/_lib/research/citation-check.ts).
      let cleanText = stripUnknownCitations(assistantText, chatSources.map((s) => s.n));
      try {
        const checked = checkCitations(cleanText, evidenceTexts(researchItems, passages), {
          exemptText: `${medicalContext}\n${userTurnContent ?? ''}`,
        });
        if (checked.removed.length) {
          // Only the failing token (drug name or number), never the sentence.
          console.warn('citation-check removed', checked.removed.map((r) => `[${r.n}] ${r.issue}: ${r.token}`).join('; '));
        }
        cleanText = checked.text;
      } catch (err) {
        console.error('citation-check failed:', err);
      }
      // The page showed the raw stream: hand it the text that is saved.
      if (cleanText !== assistantText) {
        try {
          res.write(`data: ${JSON.stringify({ replace: cleanText })}\n\n`);
        } catch { /* client gone; the saved reply is still the clean one */ }
      }
      const storedText = cleanText + formatSourcesFooter(chatSources, cleanText);
      try {
        await persistChatTurn(sql, {
          userId: user.id,
          conversationId,
          userText: userTurnContent,
          assistantText: storedText,
          model,
        });
      } catch (err) {
        console.error('Chat persistence error:', err);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

export default withSentry(handler);
