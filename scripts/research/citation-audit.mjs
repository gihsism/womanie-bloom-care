// Citation accuracy audit for the AI chat.
//
// For realistic questions across all 9 life stages it runs exactly what the
// chat runs (api/_lib/research/chat-prompt.ts: hybrid source selection,
// full-text passages, the chat's system prompt), asks the chat's default
// model for an answer, then has a stronger model judge every sentence that
// carries a citation against the text the chat model was given for that
// source: supported / partially / unsupported.
//
// Run from the repo root (tsx loads the TypeScript modules):
//   npx tsx scripts/research/citation-audit.mjs --tag before
//   npx tsx scripts/research/citation-audit.mjs --tag after --stages ivf,menopause --limit 10
// Options: --tag NAME (result file name), --stages a,b, --limit N,
//   --relevance (judge also rates every given source as relevant or not:
//   coverage-gap data, costs ~2x), --concurrency N (default 4),
//   --budget USD (cap across ALL runs, default 3; ledger in .cache/),
//   --rejudge TAG (judge the answers stored by run TAG again, no new
//   answers: keeps runs comparable after a judge or claim-splitter change),
//   --set qa (the 4 QA cases + 10 regression questions instead of all 45).
// Needs ANTHROPIC_API_KEY (env or .env.local; never printed).
// Results: scripts/research/.cache/citation-audit-<tag>.json

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { buildChatSystemPrompt, selectChatEvidence, selectChatEvidenceForTurn } from '../../api/_lib/research/chat-prompt.ts';
import { getLibrary, stripUnknownCitations } from '../../api/_lib/research/library.ts';
import { bestPassages } from '../../api/_lib/research/fulltext.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const cacheDir = path.join(here, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });

const args = process.argv.slice(2);
const opt = (name, d) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : d;
};
const TAG = opt('tag', 'run');
const STAGES = opt('stages', '') ? opt('stages').split(',') : null;
const LIMIT = Number(opt('limit', Infinity));
const RELEVANCE = args.includes('--relevance');
const CONCURRENCY = Number(opt('concurrency', 4));
const BUDGET_USD = Number(opt('budget', 3));
// Re-judge the answers stored by an earlier run (no new chat answers), e.g.
// after a change to the claim splitter or the judge, so runs stay comparable.
const REJUDGE = opt('rejudge', null);
// --set qa: the QA cases + QA_REGRESSION instead of AUDIT_QUESTIONS.
const SET = opt('set', 'all');

const CHAT_MODEL = 'claude-haiku-5-5'; // the chat's DEFAULT_MODEL
const JUDGE_MODEL = 'claude-sonnet-5-5';
const PRICE = { [CHAT_MODEL]: [0.1, 0.5], [JUDGE_MODEL]: [2, 10] }; // $ per 1M in / out

// ── Questions: everyday wording, 5 per life stage ─────────────────────

export const AUDIT_QUESTIONS = [
  { stage: 'menstrual-cycle', q: 'my periods are really heavy and I feel exhausted, could I be low on iron?' },
  { stage: 'menstrual-cycle', q: 'what actually works for bad period cramps besides ibuprofen?' },
  { stage: 'menstrual-cycle', q: 'I get really low and irritable the week before my period, is that PMDD?' },
  { stage: 'menstrual-cycle', q: 'does endometriosis always need surgery to diagnose?' },
  { stage: 'menstrual-cycle', q: 'can stress or losing weight make my periods stop?' },
  { stage: 'conception', q: 'how long should it take to get pregnant at 32 before we see someone?' },
  { stage: 'conception', q: 'how much folic acid should I take while trying to conceive?' },
  { stage: 'conception', q: 'does my partner drinking and smoking affect our chances?' },
  { stage: 'conception', q: 'I have PCOS, what helps me ovulate?' },
  { stage: 'conception', q: 'do ovulation test strips actually help you get pregnant faster?' },
  { stage: 'pregnancy', q: 'how much coffee is safe while pregnant?' },
  { stage: 'pregnancy', q: 'should I take low dose aspirin in pregnancy?' },
  { stage: 'pregnancy', q: 'is it safe to keep running while pregnant?' },
  { stage: 'pregnancy', q: 'can I take paracetamol for a headache when pregnant?' },
  { stage: 'pregnancy', q: 'is it safe to fly when I am 30 weeks pregnant?' },
  { stage: 'postpartum', q: 'how do I know if it is baby blues or postnatal depression?' },
  { stage: 'postpartum', q: 'when can I start exercising again after a c-section?' },
  { stage: 'postpartum', q: 'my baby has a tongue tie and feeding hurts, should it be cut?' },
  { stage: 'postpartum', q: 'what is the safest way for my newborn to sleep?' },
  { stage: 'postpartum', q: 'can I take ibuprofen while breastfeeding?' },
  { stage: 'contraception', q: 'which contraception is the most effective?' },
  { stage: 'contraception', q: 'does the pill make you gain weight or cause depression?' },
  { stage: 'contraception', q: 'how effective is the morning after pill if I take it after 3 days?' },
  { stage: 'contraception', q: 'is the hormonal coil or the copper coil better for heavy periods?' },
  { stage: 'contraception', q: 'does the pill raise my risk of blood clots?' },
  { stage: 'ivf', q: 'how many IVF cycles does it usually take to have a baby?' },
  { stage: 'ivf', q: 'is it worth paying for embryo glue or endometrial scratching?' },
  { stage: 'ivf', q: 'should we transfer a fresh embryo or freeze all?' },
  { stage: 'ivf', q: 'what is my risk of OHSS during stimulation?' },
  { stage: 'ivf', q: 'should we do genetic testing (PGT-A) on our embryos?' },
  { stage: 'menopause', q: 'is HRT safe if I am 52 and having bad hot flushes?' },
  { stage: 'menopause', q: 'what can I take for hot flushes if I cannot have HRT?' },
  { stage: 'menopause', q: 'does menopause cause anxiety and low mood?' },
  { stage: 'menopause', q: 'is testosterone worth trying for low libido in menopause?' },
  { stage: 'menopause', q: 'my joints ache since perimenopause started, is that hormonal?' },
  { stage: 'post-menopause', q: 'I have osteoporosis, how well do bisphosphonates work and for how long?' },
  { stage: 'post-menopause', q: 'is vaginal estrogen safe long term?' },
  { stage: 'post-menopause', q: 'how much calcium and vitamin d should I take after menopause?' },
  { stage: 'post-menopause', q: 'my bladder leaks when I cough, will pelvic floor exercises help at 65?' },
  { stage: 'post-menopause', q: 'how often should I have a mammogram after 60?' },
  { stage: 'general', q: 'I keep getting UTIs, does cranberry help?' },
  { stage: 'general', q: 'how often do I need a cervical smear test?' },
  { stage: 'general', q: 'what ferritin level means iron deficiency?' },
  { stage: 'general', q: 'should I take vitamin d every day in winter?' },
  { stage: 'general', q: 'I have thrush again, what treatment works for recurrent thrush?' },
];

// QA findings on the live app (Nov 2026). `prev` = the user's previous
// turn (answered first, then the follow-up is asked as in the chat).
// `expect` = regexes the answer must match, `avoid` = must not match;
// printed as pass/fail next to the judge's verdicts.
export const QA_CASES = [
  // The library's opioid items do not say codeine is advised against: the
  // answer must say the evidence here does not cover it and refer on.
  { stage: 'postpartum', q: 'Is codeine safe while breastfeeding?', expect: ['pharmacist|doctor|GP', "(don't|do not|doesn't|does not|not) (directly )?(cover|address|answer|say|include)|no (direct|specific|clear)|limited"] },
  // Sources were diabetes diets, Japanese intakes and vegetarian diets.
  { stage: 'pregnancy', q: 'Can I eat sushi while pregnant?', expect: ['midwife|doctor'] },
  // Refused any dose although a dysmenorrhoea guideline was given. The
  // library states no ibuprofen dose, so: say what the sources do support
  // (cited), point to the label / pharmacist, and invent no mg figure.
  { stage: 'menstrual-cycle', q: 'What ibuprofen dose works for period pain?', expect: ['label|packet|pharmacist', '\\[\\d\\]'], avoid: ['\\b\\d{2,4}\\s?mg\\b'] },
  // Follow-up: the library has no sertraline dosing; say so, refer to the prescriber.
  {
    stage: 'postpartum',
    prev: 'Is sertraline safe while breastfeeding?',
    q: 'What dose?',
    expect: ['prescri|doctor|GP|psychiatrist'],
    avoid: ['\\b\\d+\\s?mg\\b'],
  },
];

// Regression questions run next to the QA cases (named medicines, doses,
// supplements, stages): answers must not get worse.
export const QA_REGRESSION = [
  'can I take paracetamol for a headache when pregnant?',
  'should I take low dose aspirin in pregnancy?',
  'can I take ibuprofen while breastfeeding?',
  'how much coffee is safe while pregnant?',
  'how much folic acid should I take while trying to conceive?',
  'what actually works for bad period cramps besides ibuprofen?',
  'how effective is the morning after pill if I take it after 3 days?',
  'is HRT safe if I am 52 and having bad hot flushes?',
  'I have osteoporosis, how well do bisphosphonates work and for how long?',
  'I keep getting UTIs, does cranberry help?',
].map((q) => AUDIT_QUESTIONS.find((x) => x.q === q));

// ── API key + spend ledger (shared by every run, so the cap is total) ──

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  for (const f of [path.join(repoRoot, '.env.local'), path.join(os.homedir(), 'womanie-bloom-care', '.env.local')]) {
    try {
      const line = fs.readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('ANTHROPIC_API_KEY='));
      if (line) return line.slice('ANTHROPIC_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
    } catch { /* next */ }
  }
  throw new Error('ANTHROPIC_API_KEY not found (env or .env.local)');
}

const LEDGER = path.join(cacheDir, 'citation-audit-spend.json');
const ledger = (() => { try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')); } catch { return { usd: 0, runs: [] }; } })();
const run = { tag: TAG, at: new Date().toISOString(), tokens: {}, usd: 0 };
ledger.runs.push(run);
function track(model, usage) {
  const t = (run.tokens[model] ??= { input: 0, output: 0 });
  t.input += usage.input_tokens;
  t.output += usage.output_tokens;
  const usd = (usage.input_tokens * PRICE[model][0] + usage.output_tokens * PRICE[model][1]) / 1e6;
  run.usd += usd;
  ledger.usd += usd;
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
}
const overBudget = () => ledger.usd >= BUDGET_USD;

// ── Claims: sentences that carry a [n] ────────────────────────────────

const CITE = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;

/** Splits a markdown answer into sentences and keeps those with citations. */
export function citedClaims(answer) {
  const pieces = [];
  for (const rawLine of answer.split('\n')) {
    const line = rawLine.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').replace(/^#+\s*/, '').trim();
    if (!line) continue;
    for (const seg of line.split(/(?<=[.!?])\s+(?=\S)/)) {
      // "... risk. [1]" puts the marker after the full stop: give it back.
      const lead = seg.match(/^((?:\s*\[\d{1,2}(?:\s*,\s*\d{1,2})*\])+)\s*(.*)$/);
      if (lead && pieces.length) {
        pieces[pieces.length - 1] += ` ${lead[1].trim()}`;
        if (lead[2]) pieces.push(lead[2]);
      } else pieces.push(seg);
    }
  }
  const claims = [];
  for (const p of pieces) {
    const nums = new Set();
    for (const m of p.matchAll(CITE)) for (const n of m[1].split(',')) nums.add(Number(n.trim()));
    if (!nums.size) continue;
    // Words after the last marker ("... pain [1], so get it checked.") are
    // not attributed to any source, so they are not part of the claim.
    const last = [...p.matchAll(CITE)].pop();
    const text = p.slice(0, last.index + last[0].length);
    claims.push({ text: text.replace(/\*\*/g, '').trim(), cites: [...nums].sort((a, b) => a - b) });
  }
  return claims;
}

/** The exact text the chat model saw for source n (summary block + its passages). */
function sourceText(ev, n) {
  const it = ev.researchItems[n - 1];
  if (!it) return null;
  const certainty = it.certainty && it.certainty !== 'not stated' ? `; certainty of evidence: ${it.certainty}` : '';
  const passages = ev.passages
    .filter((p) => p.pmid === it.pmid)
    .map((p) => `Full-text passage (${p.section}): """${p.text}"""`);
  return [`[${n}] ${it.title} — ${it.source}, ${it.year} (${it.evidenceLevel}${certainty})`, `Finding: ${it.summary}`, `Key points: ${it.keyPoints.join(' | ')}`, ...passages].join('\n');
}

const JUDGE_SYSTEM = `You audit citations in answers written by a women's health chat assistant. The assistant was given numbered research sources (a summary, key points and sometimes full-text passages) and told to cite a source only after a sentence that source directly supports.

For each numbered claim, compare the claim with the text of the sources it cites (all cited sources together) and give one verdict:
- "supported": the cited text states what the claim says, including every number, dose, timing, population, direction and strength of effect in the claim. Faithful paraphrase is fine.
- "partially": the core of the claim is in the cited text, but some specific detail is not (an added number, dose, population, mechanism or extra recommendation), or the claim states it more strongly or more certainly than the source.
- "unsupported": the cited text does not say this, says something different or contradicts it, or is only about the same topic. General advice ("see your doctor", "everyone is different") attached to a citation is unsupported unless the source says it.
Judge only against the source text shown, never against your own medical knowledge: a true statement the source does not make is "unsupported".
"problem": empty for "supported"; otherwise at most 20 words naming what is missing or wrong.`;

const RELEVANCE_RULE = `
Also rate every source listed under SOURCES GIVEN: "relevant" is true if it would help answer the patient's question (directly about the asked topic and population), false if it is only loosely related.`;

function judgeSchema(withRelevance) {
  const props = {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'verdict', 'problem'],
        properties: {
          id: { type: 'integer' },
          verdict: { type: 'string', enum: ['supported', 'partially', 'unsupported'] },
          problem: { type: 'string' },
        },
      },
    },
  };
  if (withRelevance) {
    props.relevance = {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['n', 'relevant'],
        properties: { n: { type: 'integer' }, relevant: { type: 'boolean' } },
      },
    };
  }
  return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props };
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= 2 || (err?.status && err.status < 500 && err.status !== 429)) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

async function chatAnswer(client, stage, ev, messages) {
  const system = buildChatSystemPrompt(`Patient: Audit user, Life stage: ${stage}\n\n`, ev.block);
  const resp = await withRetry(() =>
    client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      thinking: { type: 'disabled' }, // as in the chat
      system,
      messages,
    }),
  );
  track(CHAT_MODEL, resp.usage);
  const raw = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return stripUnknownCitations(raw, ev.chatSources.map((s) => s.n));
}

const semDeps = { timeoutMs: 20_000 };

async function auditOne(client, job) {
  const { stage, q, prev } = job;
  const messages = [];
  if (prev) {
    // The previous turn, answered exactly as the chat would.
    const prevEv = await selectChatEvidence(prev, stage, semDeps);
    const prevAnswer = await chatAnswer(client, stage, prevEv, [{ role: 'user', content: prev }]);
    messages.push({ role: 'user', content: prev }, { role: 'assistant', content: prevAnswer });
  }
  messages.push({ role: 'user', content: q });
  const ev = await selectChatEvidenceForTurn(q, prev, stage, (qq, st) => selectChatEvidence(qq, st, semDeps));
  const answer = await chatAnswer(client, stage, ev, messages);
  const out = await judge(client, job, ev, answer);
  if (prev) out.prev = prev;
  if (job.expect || job.avoid) {
    out.checks = [
      ...(job.expect ?? []).map((re) => ({ re, want: true, ok: new RegExp(re, 'i').test(answer) })),
      ...(job.avoid ?? []).map((re) => ({ re, want: false, ok: !new RegExp(re, 'i').test(answer) })),
    ];
  }
  return out;
}

/** Evidence of a stored result, rebuilt from the library and the stored passage ids. */
export function storedEvidence(r) {
  const byPmid = new Map(getLibrary().items.map((it) => [it.pmid, it]));
  const researchItems = r.sources.map((s) => byPmid.get(s.pmid));
  if (researchItems.some((it) => !it)) throw new Error(`library item missing for: ${r.q}`);
  const pool = bestPassages(r.q, r.sources.map((s) => s.pmid), 50, { perStudy: 50 });
  const passages = r.passages.map((p) =>
    pool.find((c) => (p.id ? c.id === p.id : c.pmid === p.pmid && c.section === p.section && Math.abs(c.score - p.score) < 0.01)),
  );
  if (passages.some((p) => !p)) throw new Error(`passage not found for: ${r.q}`);
  return { researchItems, passages };
}

async function judge(client, { stage, q }, ev, answer) {
  const claims = citedClaims(answer);
  const out = {
    stage,
    q,
    sources: ev.researchItems.map((it, i) => ({ n: i + 1, pmid: it.pmid, title: it.title, topics: it.topics })),
    passages: ev.passages.map((p) => ({ id: p.id, pmid: p.pmid, section: p.section, score: p.score })),
    answer,
    claims: claims.map((c, i) => ({ id: i + 1, ...c })),
    relevance: null,
  };
  if (!claims.length && !(RELEVANCE && ev.researchItems.length)) return out;

  const cited = [...new Set(claims.flatMap((c) => c.cites))];
  const shown = RELEVANCE ? ev.researchItems.map((_, i) => i + 1) : cited;
  const user = [
    `PATIENT QUESTION: ${q}`,
    '',
    'SOURCES GIVEN (exact text the assistant saw):',
    ...shown.map((n) => sourceText(ev, n)).filter(Boolean).flatMap((t) => [t, '']),
    'CLAIMS:',
    ...(claims.length ? claims.map((c, i) => `${i + 1}. ${c.text}`) : ['(none)']),
  ].join('\n');
  const jr = await withRetry(() =>
    client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 3000,
      thinking: { type: 'between_tools' },
      system: JUDGE_SYSTEM + (RELEVANCE ? RELEVANCE_RULE : ''),
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema: judgeSchema(RELEVANCE) } },
    }),
  );
  track(JUDGE_MODEL, jr.usage);
  const text = jr.content.find((b) => b.type === 'text')?.text ?? '{}';
  const verdicts = JSON.parse(text);
  for (const v of verdicts.claims ?? []) {
    const c = out.claims.find((x) => x.id === v.id);
    if (c) Object.assign(c, { verdict: v.verdict, problem: v.problem });
  }
  if (verdicts.relevance) out.relevance = verdicts.relevance;
  return out;
}

// ── Report ────────────────────────────────────────────────────────────

export function summarise(results) {
  const byStage = {};
  const all = { claims: 0, supported: 0, partially: 0, unsupported: 0, answers: 0, uncitedAnswers: 0, sources: 0 };
  for (const r of results) {
    const s = (byStage[r.stage] ??= { claims: 0, supported: 0, partially: 0, unsupported: 0, answers: 0, uncitedAnswers: 0, sources: 0 });
    for (const bucket of [s, all]) {
      bucket.answers++;
      bucket.sources += r.sources.length;
      if (!r.claims.length) bucket.uncitedAnswers++;
      for (const c of r.claims) {
        if (!c.verdict) continue;
        bucket.claims++;
        bucket[c.verdict]++;
      }
    }
  }
  return { byStage, all };
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '  n/a');

function printReport(results) {
  const { byStage, all } = summarise(results);
  console.log(`\nCitation audit "${TAG}": ${results.length} questions, ${all.claims} cited sentences`);
  console.log('stage              answers  claims  supported  partially  unsupported  no-citation answers');
  for (const [stage, s] of Object.entries(byStage)) {
    console.log(
      `${stage.padEnd(18)} ${String(s.answers).padStart(7)} ${String(s.claims).padStart(7)} ${pct(s.supported, s.claims).padStart(10)} ${pct(s.partially, s.claims).padStart(10)} ${pct(s.unsupported, s.claims).padStart(12)} ${String(s.uncitedAnswers).padStart(20)}`,
    );
  }
  console.log(
    `${'ALL'.padEnd(18)} ${String(all.answers).padStart(7)} ${String(all.claims).padStart(7)} ${pct(all.supported, all.claims).padStart(10)} ${pct(all.partially, all.claims).padStart(10)} ${pct(all.unsupported, all.claims).padStart(12)} ${String(all.uncitedAnswers).padStart(20)}`,
  );
  const worst = results
    .flatMap((r) => r.claims.filter((c) => c.verdict === 'unsupported').map((c) => ({ r, c })))
    .slice(0, 12);
  if (worst.length) console.log('\nUnsupported examples:');
  for (const { r, c } of worst) {
    const titles = c.cites.map((n) => `[${n}] ${r.sources[n - 1]?.title.slice(0, 70) ?? '?'}`).join('; ');
    console.log(`- (${r.stage}) Q: ${r.q}\n  Claim: ${c.text.slice(0, 220)}\n  Cited: ${titles}\n  Problem: ${c.problem}`);
  }
  const checked = results.filter((r) => r.checks);
  if (checked.length) console.log('\nQA checks (answer must / must not match):');
  for (const r of checked) {
    const bad = r.checks.filter((c) => !c.ok).map((c) => `${c.want ? 'missing' : 'has'} /${c.re}/`);
    console.log(`  ${bad.length ? 'FAIL' : 'ok  '}  ${r.prev ? `${r.prev} -> ` : ''}${r.q}${bad.length ? `: ${bad.join('; ')}` : ''}`);
  }
  if (results.some((r) => r.relevance)) {
    console.log('\nRelevant sources per question (judge):');
    for (const r of results) {
      const rel = (r.relevance ?? []).filter((x) => x.relevant).length;
      console.log(`  ${String(rel).padStart(2)}/${r.sources.length}  (${r.stage}) ${r.q}`);
    }
  }
}

async function main() {
  const stored = REJUDGE ? JSON.parse(fs.readFileSync(path.join(cacheDir, `citation-audit-${REJUDGE}.json`), 'utf8')).results : null;
  let qs = (stored ?? (SET === 'qa' ? [...QA_CASES, ...QA_REGRESSION] : AUDIT_QUESTIONS)).filter((x) => !STAGES || STAGES.includes(x.stage));
  if (Number.isFinite(LIMIT)) qs = qs.slice(0, LIMIT);
  if (overBudget()) throw new Error(`Budget $${BUDGET_USD} already spent ($${ledger.usd.toFixed(3)}); raise --budget to continue.`);
  const client = new Anthropic({ apiKey: loadApiKey(), timeout: 120_000, maxRetries: 2 });

  // Warm the embedding model once so the first questions are not keyword-only.
  if (!stored) await selectChatEvidence('warm up', null, { timeoutMs: 30_000 });

  const results = [];
  const queue = qs.map((x, i) => ({ ...x, i }));
  let skipped = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const job = queue.shift();
        if (overBudget()) { skipped++; continue; }
        try {
          results[job.i] = stored
            ? await judge(client, job, storedEvidence(job), job.answer)
            : await auditOne(client, job);
          process.stdout.write('.');
        } catch (err) {
          console.warn(`\n  failed: ${job.q}: ${err.message}`);
        }
      }
    }),
  );
  const done = results.filter(Boolean);
  const file = path.join(cacheDir, `citation-audit-${TAG}.json`);
  fs.writeFileSync(file, JSON.stringify({ tag: TAG, at: run.at, chatModel: CHAT_MODEL, judgeModel: JUDGE_MODEL, results: done, summary: summarise(done), spend: run }, null, 1));
  printReport(done);
  if (skipped) console.log(`\n${skipped} questions skipped: budget cap $${BUDGET_USD} reached.`);
  const tok = Object.entries(run.tokens).map(([m, t]) => `${m} ${t.input} in / ${t.output} out`).join('; ');
  console.log(`\nSpend this run: $${run.usd.toFixed(3)} (${tok}); all audit runs: $${ledger.usd.toFixed(3)} of $${BUDGET_USD}`);
  console.log(`Results: ${path.relative(repoRoot, file)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
