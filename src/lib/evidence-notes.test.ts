import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _resetEvidenceNotes, idsToFetch, loadEvidenceNote, readableTitle, registerEvidenceNote } from './evidence-notes';

describe('idsToFetch', () => {
  it('adds uncached on-screen notes, sorted and capped', () => {
    expect(idsToFetch('b', ['a', 'c', 'b'], (x) => x === 'c')).toEqual(['a', 'b']);
    expect(idsToFetch('a', [], () => false)).toEqual(['a']);
    expect(idsToFetch('a', 'bcdefghijk'.split(''), () => false)).toHaveLength(8);
  });
});

describe('loadEvidenceNote', () => {
  const fetchMock = vi.fn(async (url: string) => {
    const ids = decodeURIComponent(url.split('notes=')[1]).split(',');
    return new Response(JSON.stringify({ notes: ids.map((id) => ({ id, topic: 't', items: [{ id: `i-${id}` }] })) }));
  });
  beforeEach(() => {
    _resetEvidenceNotes();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('one request for the opened note and the others on screen; then cached', async () => {
    const off = [registerEvidenceNote('x'), registerEvidenceNote('y')];
    expect((await loadEvidenceNote('x'))?.id).toBe('x');
    expect((await loadEvidenceNote('y'))?.id).toBe('y');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/research/library?notes=x%2Cy');
    off.forEach((f) => f());
  });

  it('a failed request is not cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    expect(await loadEvidenceNote('x')).toBeNull();
    await Promise.resolve();
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadEvidenceNote('x'))?.id).toBe('x');
  });
});

describe('readableTitle', () => {
  it('sentence-cases ALL-CAPS titles only', () => {
    expect(readableTitle('AMERICAN ASSOCIATION OF CLINICAL ENDOCRINOLOGISTS POSITION')).toBe('American association of clinical endocrinologists position');
    expect(readableTitle('Thyroid Disease in Pregnancy: ACOG Practice Bulletin')).toBe('Thyroid Disease in Pregnancy: ACOG Practice Bulletin');
    expect(readableTitle('ACOG 202')).toBe('ACOG 202');
  });
});
