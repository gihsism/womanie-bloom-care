#!/usr/bin/env -S npx tsx
// DRY RUN, READ-ONLY: what a backfill with the shared lab parser
// (api/_lib/lab-value.ts) would change in medical_extracted_data. Prints
// COUNTS ONLY: no values, titles, ids or connection strings.
//
// Nothing is written. Stored values stay verbatim (screens re-parse them at
// read time); this only sizes the difference between the old readers and the
// new one so a real backfill can be decided on.
//
// Usage:
//   npx tsx scripts/lab-value-backfill-dry-run.ts
// DATABASE_URL comes from the environment, else from ENV_FILE (a path), else
// from .env.local in the current directory. Every query runs in a READ ONLY
// transaction.
//
//   npx tsx scripts/lab-value-backfill-dry-run.ts --fixture
//     runs on a small built-in invented sample (no database).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseLabValue, parseLabRange, numberStylesByDocument, type NumberStyle,
} from '../api/_lib/lab-value.js';

export interface DryRunRow {
  document_id: string | null;
  title: string | null;
  value: string | null;
  unit: string | null;
  reference_range: string | null;
  raw_data: unknown;
}

// ---- the old readers, copied verbatim from before the shared parser ----

/** healthOverview / hormone-reference: first comma -> point, first number. */
function oldCommaToPoint(v: string | null): number | null {
  if (v == null) return null;
  const m = String(v).replace(/,/g, '.').replace(/[<>≤≥]/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}
/** parseFloat readers (charts, PanelDetail sparkline, comparisons). */
function oldParseFloat(v: string | null): number | null {
  if (v == null) return null;
  const m = String(v).match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
/** bodyMap.parseRange before the shared parser. */
function oldRange(range: string | null): { low: number | null; high: number | null } | null {
  if (!range) return null;
  const r = range.replace(/,/g, '.');
  const between = r.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (between) return { low: Number(between[1]), high: Number(between[2]) };
  const lt = r.match(/^\s*(?:<|≤|<=)\s*(\d+(?:\.\d+)?)/);
  if (lt) return { low: null, high: Number(lt[1]) };
  const gt = r.match(/^\s*(?:>|≥|>=)\s*(\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null };
  return null;
}

export interface DryRunSummary {
  labRows: number;
  documents: number;
  documentStyle: Record<'comma' | 'point' | 'unknown', number>;
  values: {
    withNumber: number;
    changedVsCommaToPointReader: number;
    changedVsParseFloatReader: number;
    nowFlaggedCheckValue: number;
    ambiguousTwoReadings: number;
    qualitativeRecognised: number;
    boundsRecognised: number;
  };
  ranges: {
    present: number;
    parsedBefore: number;
    parsedNow: number;
    newlyParsed: number;
    noLongerParsed: number;
    boundsChanged: number;
    sexSpecificPicked: number;
    qualitative: number;
    stillUnreadable: number;
  };
}

const same = (a: number | null, b: number | null) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);

export function summarise(rows: DryRunRow[]): DryRunSummary {
  const styles = numberStylesByDocument(rows);
  const docStyle: Record<'comma' | 'point' | 'unknown', number> = { comma: 0, point: 0, unknown: 0 };
  for (const s of styles.values()) docStyle[s ?? 'unknown']++;
  const out: DryRunSummary = {
    labRows: rows.length,
    documents: styles.size,
    documentStyle: docStyle,
    values: { withNumber: 0, changedVsCommaToPointReader: 0, changedVsParseFloatReader: 0, nowFlaggedCheckValue: 0, ambiguousTwoReadings: 0, qualitativeRecognised: 0, boundsRecognised: 0 },
    ranges: { present: 0, parsedBefore: 0, parsedNow: 0, newlyParsed: 0, noLongerParsed: 0, boundsChanged: 0, sexSpecificPicked: 0, qualitative: 0, stillUnreadable: 0 },
  };
  for (const r of rows) {
    const style: NumberStyle | null = styles.get(r.document_id ?? '') ?? null;
    const ctx = { style, title: r.title, unit: r.unit };
    const p = parseLabValue(r.value, ctx);
    const now = p.kind === 'number' || p.kind === 'bound' ? p.value : null;
    if (now != null) out.values.withNumber++;
    if (!same(now, oldCommaToPoint(r.value))) out.values.changedVsCommaToPointReader++;
    if (!same(now, oldParseFloat(r.value))) out.values.changedVsParseFloatReader++;
    if (p.check) out.values.nowFlaggedCheckValue++;
    if (p.alternatives) out.values.ambiguousTwoReadings++;
    if (p.kind === 'qualitative') out.values.qualitativeRecognised++;
    if (p.kind === 'bound') out.values.boundsRecognised++;

    if (r.reference_range && r.reference_range.trim()) {
      out.ranges.present++;
      const before = oldRange(r.reference_range);
      const after = parseLabRange(r.reference_range, { style, sex: 'female' });
      const afterBounds = after && (after.low != null || after.high != null) ? after : null;
      if (before) out.ranges.parsedBefore++;
      if (afterBounds) out.ranges.parsedNow++;
      if (!before && afterBounds) out.ranges.newlyParsed++;
      if (before && !afterBounds) out.ranges.noLongerParsed++;
      if (before && afterBounds && (!same(before.low, afterBounds.low) || !same(before.high, afterBounds.high))) out.ranges.boundsChanged++;
      if (after?.sexSpecific) out.ranges.sexSpecificPicked++;
      if (after?.qualitative) out.ranges.qualitative++;
      if (!after) out.ranges.stillUnreadable++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- live

function loadDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const file = process.env.ENV_FILE || '.env.local';
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* no file */ }
  return null;
}

const FIXTURE: DryRunRow[] = [
  { document_id: 'ch', title: 'TSH', value: '1,250', unit: 'mU/l', reference_range: '0,27 - 4,20', raw_data: null },
  { document_id: 'ch', title: 'Thrombozyten', value: "265'000", unit: '/µl', reference_range: "150'000 - 400'000", raw_data: null },
  { document_id: 'ch', title: 'Hämoglobin', value: '128', unit: 'g/l', reference_range: 'w: 120-160 m: 140-180', raw_data: null },
  { document_id: 'ch', title: 'HIV-Test', value: 'negativ', unit: null, reference_range: 'negativ', raw_data: null },
  { document_id: 'en', title: 'Estradiol', value: '1,250', unit: 'pmol/L', reference_range: '45.5-854.5', raw_data: null },
  { document_id: 'x', title: 'Lipase', value: '1,250', unit: 'U/L', reference_range: 'siehe Kommentar', raw_data: null },
];

async function main() {
  if (process.argv.includes('--fixture')) {
    console.log(JSON.stringify(summarise(FIXTURE), null, 2));
    return;
  }
  const url = loadDatabaseUrl();
  if (!url) { console.error('DATABASE_URL not set (env, ENV_FILE or ./.env.local).'); process.exit(2); }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  const rows: DryRunRow[] = [];
  const PAGE = 2000;
  for (let offset = 0; ; offset += PAGE) {
    const [page] = await sql.transaction((tx) => [
      tx.query(
        `SELECT document_id::text AS document_id, title, value, unit, reference_range, raw_data
           FROM medical_extracted_data
          WHERE data_type = 'lab_result'
          ORDER BY id
          LIMIT $1 OFFSET $2`,
        [PAGE, offset],
      ),
    ], { readOnly: true });
    const list = page as unknown as DryRunRow[];
    rows.push(...list);
    if (list.length < PAGE) break;
  }
  console.log(JSON.stringify(summarise(rows), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    // Never echo the error object: drivers can include the connection string.
    console.error('dry run failed:', e instanceof Error ? e.name : 'error');
    process.exit(2);
  });
}
