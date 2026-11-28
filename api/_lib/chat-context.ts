// Everything the Ask AI handler (api/ai-doctor-chat.ts) puts in front of
// the model besides the conversation itself: her profile line, the
// question-aware records block, visits, doctor notes, app logs and the
// small "personal context" the page sends. Pure functions over rows the
// handler has already loaded, so the prompt test harness
// (ask-ai-prompt.test.ts) assembles exactly the prompt the chat sends,
// without a database or a model call.

import { buildLifeContext } from './life-context.js';
import { buildProfileContext } from './profile-context.js';
import { selectPersonalContext, type DocRow, type LabRow, type PersonalSelection } from './personal-retrieval.js';
import { buildChatSystemPrompt } from './research/chat-prompt.js';
import { FOLLOWUPS_PROMPT } from './chat-followups.js';

type Row = Record<string, unknown>;

/**
 * Stages in which a cycle phase from old period rows is wrong, not just
 * unhelpful: pregnant or after birth (rows from before the pregnancy read
 * as "late-luteal, next period in 5 days" at week 31, seen live
 * 2026-11-27), before a first period, and after menopause. The page
 * suppresses it too; the server is the gate, because the page decides
 * before her profile has loaded.
 */
export const STAGES_WITHOUT_CYCLE_PHASE = new Set(['pregnancy', 'postpartum', 'pre-menstrual', 'post-menopause']);

/** Doctor notes are copied in full up to this many characters each. */
export const DOCTOR_NOTE_MAX_CHARS = 800;

/**
 * The page's small context block (age, AMH assessment, lab signals, weeks
 * since birth, cycle phase), validated field by field. Anything else in
 * the payload is dropped. Stage anchors only for the stage she is in now:
 * no cycle phase in the stages above, and weeks since birth only after
 * birth (the page keeps the birth date in the browser; a new pregnancy
 * would otherwise be told "postpartum week 60").
 */
export function buildPersonalContextBlock(personalContext: unknown, lifeStage: string | null | undefined): string {
  if (!personalContext || typeof personalContext !== 'object') return '';
  const pc = personalContext as Record<string, unknown>;
  const stage = typeof lifeStage === 'string' ? lifeStage : '';
  const lines: string[] = [];
  const age = typeof pc.age === 'number' && pc.age > 0 && pc.age < 130 ? Math.floor(pc.age) : null;
  if (age !== null) lines.push(`Age: ${age}`);
  const amhSummary = typeof pc.amhSummary === 'string' ? pc.amhSummary.slice(0, 400) : null;
  if (amhSummary) lines.push(`AMH context: ${amhSummary}`);
  const flags = typeof pc.flags === 'string' ? pc.flags.slice(0, 400) : null;
  if (flags) lines.push(`Lab signals: ${flags}`);
  const postpartumWeeks = typeof pc.postpartumWeeks === 'number'
    && pc.postpartumWeeks >= 0
    && pc.postpartumWeeks <= 104
    && (stage === '' || stage === 'postpartum')
    ? Math.floor(pc.postpartumWeeks)
    : null;
  if (postpartumWeeks !== null) {
    lines.push(`Postpartum week ${postpartumWeeks} (${postpartumWeeks * 7} days since birth)`);
  }
  const cyclePhase = typeof pc.cyclePhase === 'string'
    && postpartumWeeks === null
    && !STAGES_WITHOUT_CYCLE_PHASE.has(stage)
    ? pc.cyclePhase.slice(0, 200)
    : null;
  if (cyclePhase) lines.push(`Cycle: ${cyclePhase}`);
  if (lines.length === 0) return '';
  return `\n## Personal context\n${lines.join('\n')}\n`;
}

const escRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Personal identifiers that records text can carry and no answer needs:
 * uploaded documents' summaries and file names often repeat the letter
 * head (her surname, an email, the Swiss AHV / social insurance number,
 * an IBAN). The model gets her first name from the profile line; these
 * are replaced in the records, the visits and the doctor notes before
 * they leave the server. Lab values, dates and units are left alone.
 */
export function redactRecordText(text: string, fullName: unknown): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    // AHV number 756.1234.5678.97 (dots, spaces or none).
    .replace(/\b756[.\s]?\d{4}[.\s]?\d{4}[.\s]?\d{2}\b/g, '[insurance number]')
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g, '[IBAN]');
  const parts = typeof fullName === 'string' ? fullName.trim().split(/\s+/).slice(1) : [];
  for (const p of parts) {
    const name = p.replace(/[^\p{L}'-]/gu, '');
    if (name.length < 3) continue;
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escRe(name)}(?=$|[^\\p{L}])`, 'giu'), '$1[surname]');
  }
  return out;
}

export interface ChatContextInput {
  /** profiles row (full_name, life_stage, pregnancy_due_date, ivf_start_date, ivf_phase), or undefined. */
  profile: Row | undefined;
  personalRows: { labs: LabRow[]; docs: DocRow[] };
  upcomingApts: Row[];
  visibleNotes: Row[];
  lifeMeds: Row[];
  lifeEvents: Row[];
  lifeBirth: Row | null;
  lifeBabies: Row[];
  /** The page's personalContext payload, unvalidated. */
  personalContext: unknown;
  /** The conversation after applyChatLimits (newest last). */
  messages: Array<{ role: string; content: unknown }>;
  now: Date;
  clientToday?: unknown;
}

export interface ChatContext {
  medicalContext: string;
  personalSelection: PersonalSelection;
  /** Her newest message (what the sources are searched for), or null. */
  userTurnContent: string | null;
  /** Her message before that, for follow-ups that name no topic. */
  previousUserTurn: string | undefined;
}

export function buildChatContext(input: ChatContextInput): ChatContext {
  const { profile, messages } = input;
  const lastMsg = messages[messages.length - 1];
  const userTurnContent = lastMsg?.role === 'user' && typeof lastMsg.content === 'string' ? lastMsg.content : null;
  const previousUserTurn = [...messages.slice(0, -1)].reverse()
    .find((m) => m?.role === 'user' && typeof m.content === 'string')?.content as string | undefined;

  let medicalContext = '';
  // Stage anchors ("what week am I?") only for the stage she is in now.
  if (profile) medicalContext += buildProfileContext(profile, input.now, input.clientToday);

  // Question-aware personal records (see personal-retrieval.ts).
  const personalSelection = selectPersonalContext({
    question: userTurnContent,
    previousQuestion: previousUserTurn,
    labs: input.personalRows.labs,
    docs: input.personalRows.docs,
  });
  let records = personalSelection.block;

  if (input.upcomingApts.length > 0) {
    records += '\n## Upcoming Appointments\n';
    for (const a of input.upcomingApts) {
      const doctorLabel = [a.doctor_title, a.doctor_name].filter(Boolean).join(' ') || 'a doctor';
      const specialties = Array.isArray(a.doctor_specialties) ? a.doctor_specialties as string[] : [];
      const spec = specialties.length > 0 ? `, ${specialties[0]}` : '';
      records += `- ${new Date(String(a.scheduled_at)).toISOString()} with ${doctorLabel}${spec} — ${a.consultation_type || 'consultation'}${a.duration ? `, ${a.duration} min` : ''}\n`;
    }
  }

  if (input.visibleNotes.length > 0) {
    records += '\n## Doctor Notes (visible to patient)\n';
    for (const n of input.visibleNotes) {
      const doctorLabel = [n.doctor_title, n.doctor_name].filter(Boolean).join(' ') || 'A doctor';
      const created = new Date(String(n.created_at)).toISOString().slice(0, 10);
      const content = String(n.content || '');
      const body = content.length > DOCTOR_NOTE_MAX_CHARS ? `${content.slice(0, DOCTOR_NOTE_MAX_CHARS)}… (note shortened)` : content;
      records += `- ${created} — ${doctorLabel} (${n.note_type || 'note'}): ${n.title}\n  ${body.replace(/\n/g, '\n  ')}\n`;
    }
  }

  medicalContext += redactRecordText(records, profile?.full_name);

  medicalContext += buildLifeContext({
    now: input.now,
    medications: input.lifeMeds,
    events: input.lifeEvents,
    birth: input.lifeBirth,
    babies: input.lifeBabies,
  });

  medicalContext += buildPersonalContextBlock(input.personalContext, profile?.life_stage as string | undefined);

  return { medicalContext, personalSelection, userTurnContent, previousUserTurn };
}

/** The exact system prompt the chat sends: rules, records, sources, follow-up tail. */
export function assembleChatSystemPrompt(medicalContext: string, evidenceBlock: string): string {
  return buildChatSystemPrompt(medicalContext, evidenceBlock) + FOLLOWUPS_PROMPT;
}
