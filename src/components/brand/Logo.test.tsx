import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Logo, { LOOP_PATH } from './Logo';

const root = join(__dirname, '..', '..', '..');

describe('Logo', () => {
  it('wordmark has the accessible name Womanie', () => {
    render(<Logo />);
    expect(screen.getByRole('img', { name: 'Womanie' })).toBeInTheDocument();
  });

  it('mark alone has an accessible name and a custom title', () => {
    render(<Logo variant="mark" title="Womanie home" />);
    expect(screen.getByRole('img', { name: 'Womanie home' })).toBeInTheDocument();
  });

  it('every icon the manifest and index.html reference exists in public/', () => {
    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const iconBlock = vite.slice(vite.indexOf('icons: ['), vite.indexOf('],', vite.indexOf('icons: [')));
    const refs = new Set<string>([
      ...[...iconBlock.matchAll(/src: "\/([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g)].map((m) => m[1]),
    ]);
    expect(refs.size).toBeGreaterThanOrEqual(4);
    for (const f of refs) expect(existsSync(join(root, 'public', f)), f).toBe(true);
  });

  it('favicon.svg is drawn from the same loop as the component', () => {
    expect(readFileSync(join(root, 'public', 'favicon.svg'), 'utf8')).toContain(LOOP_PATH);
  });
});
