import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAL_LAB_SQL } from './personal-retrieval';

// Re-analysis guard. Each re-analysis writes a NEW set of
// medical_extracted_data rows under a new document_analyses row and only
// then flips is_current; old rows stay as history, and a run killed
// mid-flight leaves rows under an analysis that never became current.
// Anything that shows values to her (or to the AI) must therefore read the
// current_extracted_data view, or every re-analysed document shows its
// values twice. Only maintenance paths (export, delete, title clean-up,
// admin claim, the analysis writer) may touch the raw table.

const root = fileURLToPath(new URL('../../', import.meta.url));

const RAW_TABLE_ALLOWED = new Set([
  'api/analyze-document.ts',          // writer
  'api/_routes/docs/delete.ts',       // deletes all versions of a document
  'api/_routes/me/delete-account.ts', // deletes everything
  'api/_routes/me/export.ts',         // "Download my data" includes history
  'api/_routes/me/normalize-titles.ts', // rewrites titles on every version
  'api/_routes/admin/docs.ts',        // moves orphaned records between ids
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (name === 'node_modules') continue;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

describe('readers of extracted values use the current-analysis view', () => {
  it('chat personal context reads current_extracted_data, scoped to $1', () => {
    expect(PERSONAL_LAB_SQL).toMatch(/FROM current_extracted_data/);
    expect(PERSONAL_LAB_SQL).toMatch(/WHERE user_id = \$1/);
  });

  it('no page, hook or API reader queries the raw medical_extracted_data table', () => {
    const offenders: string[] = [];
    for (const file of [...walk('src'), ...walk('api')]) {
      if (RAW_TABLE_ALLOWED.has(file)) continue;
      const code = readFileSync(join(root, file), 'utf8');
      if (/from\(\s*['"]medical_extracted_data['"]\s*\)/.test(code) ||
          /\bFROM\s+medical_extracted_data\b/.test(code)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
