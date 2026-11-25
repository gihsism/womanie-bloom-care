import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Every ReactMarkdown in the app renders model output that is built from
// uploaded documents (summaries, chat answers). A remote image in that
// markdown would make the browser call any https host the text names (the
// CSP allows https: images), carrying data in the URL: an exfiltration
// channel for a prompt-injected document. So every ReactMarkdown must drop
// <img> via NO_REMOTE_IMAGES (src/lib/safeMarkdown.ts).

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [p] : [];
  });
}

describe('ReactMarkdown usage', () => {
  it('every <ReactMarkdown> drops remote images', () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<ReactMarkdown\b[^>]*>/g)) {
        if (!/disallowedElements=\{NO_REMOTE_IMAGES\}/.test(m[0])) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
