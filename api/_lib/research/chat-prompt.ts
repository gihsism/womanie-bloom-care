// The AI chat's evidence step and system prompt, shared by the chat
// handler (api/ai-doctor-chat.ts) and the citation audit
// (scripts/research/citation-audit.mjs), so the audit always measures
// exactly what the chat sends to the model.

import { buildSourcesPrompt, toChatSources, type ChatSource, type ResearchItem } from './library.js';
import { selectChatSourcesHybrid, type SemanticDeps } from './hybrid.js';
import { bestPassages, formatPassagesForPrompt, fulltextAttribution, type Passage } from './fulltext.js';

/** Full-text passages added to the prompt per question. */
export const CHAT_PASSAGES = 3;

/**
 * BM25 score a passage needs to reach the prompt. In the citation audit
 * (scripts/research/citation-audit.mjs, 45 questions) passages below ~10
 * came almost only from sources the judge rated off-topic for the
 * question (17 of 22), while 17 of the 18 at or above 10 came from
 * relevant ones; off-topic passages invite citations the source does
 * not support.
 */
export const CHAT_PASSAGE_MIN_SCORE = 10;

export interface ChatEvidence {
  researchItems: ResearchItem[];
  chatSources: ChatSource[];
  passages: Passage[];
  /** Sources + passages block appended to the system prompt. */
  block: string;
}

/**
 * Research library sources (0-6, hybrid search) and the open-access
 * full-text passages that best match the question, as numbered prompt
 * blocks. Never throws: a failing part degrades to "no sources" or "no
 * passages" so it can never break the chat.
 */
export async function selectChatEvidence(
  question: string | null | undefined,
  lifeStage: string | null | undefined,
  deps?: SemanticDeps,
): Promise<ChatEvidence> {
  let researchItems: ResearchItem[] = [];
  try {
    researchItems = await selectChatSourcesHybrid(question, lifeStage, deps);
  } catch (err) {
    console.error('Research library unavailable:', err);
  }
  const chatSources = toChatSources(researchItems);

  // Open-access full text (CC0 / CC BY / CC BY-SA only) for the chosen
  // studies, under the same [n] as their study.
  let passages: Passage[] = [];
  try {
    passages = bestPassages(question ?? '', researchItems.map((it) => it.pmid), CHAT_PASSAGES, {
      minScore: CHAT_PASSAGE_MIN_SCORE,
    });
    for (const s of chatSources) {
      const a = fulltextAttribution(s.pmid);
      if (a) s.fulltext = a.licence;
    }
  } catch (err) {
    console.error('Full-text passages unavailable:', err);
  }
  const sourceNumber = (pmid: string) => chatSources.find((s) => s.pmid === pmid)?.n;
  const passagesBlock = passages.length ? `\n\n${formatPassagesForPrompt(passages, sourceNumber)}` : '';
  return { researchItems, chatSources, passages, block: `${buildSourcesPrompt(researchItems)}${passagesBlock}` };
}

/**
 * A short follow-up ("How many cups a day exactly?") names no topic, so
 * the library finds nothing for it and the answer goes out unsourced. When
 * the question alone finds no source, search again with the previous
 * question in front of it. Questions that find sources on their own
 * ("And what about ibuprofen?") are searched exactly as before.
 */
export async function selectChatEvidenceForTurn(
  question: string | null | undefined,
  previousQuestion: string | null | undefined,
  lifeStage: string | null | undefined,
  select: typeof selectChatEvidence = selectChatEvidence,
): Promise<ChatEvidence> {
  const first = await select(question, lifeStage);
  const prev = previousQuestion?.trim();
  if (first.chatSources.length > 0 || !prev || !question?.trim()) return first;
  const again = await select(`${prev}\n${question}`, lifeStage);
  return again.chatSources.length > 0 ? again : first;
}

/** The chat's system prompt around the patient's records and the evidence block. */
export function buildChatSystemPrompt(medicalContext: string, evidenceBlock: string): string {
  return `You are an AI medical assistant for a women's health platform called Womanie. You have access to the patient's uploaded health documents and extracted medical data shown below. Use this information to provide personalized, empathetic health guidance.

IMPORTANT RULES:
- You are NOT a replacement for a real doctor. Always recommend consulting a healthcare professional for serious concerns.
- Be warm, supportive, and use clear language.
- Reference specific findings from the patient's records when relevant.
- If asked about something not in the records, say so honestly.
- Keep answers concise but thorough.
- Format responses with markdown for readability.
- Focus on women's health topics: reproductive health, menstrual cycles, fertility, pregnancy, menopause, general wellness.
- Never fabricate medical data not present in the records.
- Medicine, birth, baby and pregnancy logs are self-reported in the app; use them to answer questions like "how did my baby feed overnight?" and say when something is worth raising with a midwife, health visitor or doctor.
- When discussing lab results, explain what values mean in plain language.

## Patient Medical Records
${medicalContext || 'No medical records available yet. Encourage the patient to upload their health documents for personalized advice.'}${evidenceBlock}`;
}
