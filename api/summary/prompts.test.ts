import { describe, it, expect, vi } from 'vitest';

vi.mock('../_lib/sentry.js', () => ({ withSentry: (h: unknown) => h }));

import { SYSTEM_PROMPT as GENERATE } from './generate';
import { SYSTEM_PROMPT as PANEL } from './panel';
import { STATIC_RULES as ANALYZE } from '../analyze-document';

// Uploaded documents are the patient's, but their text is not trusted: a
// PDF can carry lines that read like instructions to the model. Every
// prompt that sees document-derived text must say it is data.
describe('document-derived prompts treat the content as data', () => {
  it.each([
    ['summary/generate', GENERATE],
    ['summary/panel', PANEL],
    ['analyze-document', ANALYZE],
  ])('%s says instructions inside the data are not to be followed', (_name, prompt) => {
    expect(prompt).toMatch(/data[^.]*not instructions/i);
  });

  it('summaries never ask for images or links to outside sites', () => {
    for (const p of [GENERATE, PANEL]) expect(p).toMatch(/no images/i);
  });
});
