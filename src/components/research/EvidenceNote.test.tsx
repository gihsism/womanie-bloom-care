import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EvidenceNote from './EvidenceNote';
import { evidenceSpec } from '@/lib/evidenceTopics';
import { _resetEvidenceNotes } from '@/lib/evidence-notes';
import { evidenceNotes } from '../../../api/_lib/research/evidence-notes';

function mockApi() {
  return vi.fn(async (url: string) => {
    const ids = decodeURIComponent(new URL(url, 'http://x').searchParams.get('notes') ?? '').split(',');
    return new Response(JSON.stringify({ notes: evidenceNotes(ids) }), { status: 200 });
  });
}

function renderNotes(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('EvidenceNote', () => {
  let fetchMock: ReturnType<typeof mockApi>;
  beforeEach(() => {
    _resetEvidenceNotes();
    fetchMock = mockApi();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing without a spec', () => {
    const { container } = renderNotes(<EvidenceNote specs={[null, evidenceSpec('glucose', 'menstrual-cycle')]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts collapsed and fetches nothing until opened', () => {
    renderNotes(<EvidenceNote specs={[evidenceSpec('blood-pressure', 'pregnancy')]} />);
    const button = screen.getByRole('button', { name: /what the research says/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/not medical advice/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens to takeaways, source links, a library link and the small print', async () => {
    renderNotes(<EvidenceNote specs={[evidenceSpec('blood-pressure', 'pregnancy')]} />);
    fireEvent.click(screen.getByRole('button', { name: /what the research says/i }));
    expect(await screen.findByText(/Preeclampsia is estimated to affect 2-8% of pregnancies/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /read the source/i })[0]).toHaveAttribute('href', expect.stringMatching(/^https:\/\/pubmed/));
    expect(screen.getByRole('link', { name: /more in the library/i })).toHaveAttribute('href', '/library?stage=pregnancy&topic=pre-eclampsia');
    expect(screen.getByText(/General information from published research, not medical advice\./)).toBeInTheDocument();
    expect(screen.getAllByText(/Clinical guideline|Study|Research review/).length).toBeGreaterThan(0);
  });

  it('one request serves every note on the screen', async () => {
    renderNotes(
      <>
        <EvidenceNote specs={[evidenceSpec('blood-pressure', 'pregnancy')]} />
        <EvidenceNote specs={[evidenceSpec('epds', 'pregnancy')]} />
        <EvidenceNote specs={[evidenceSpec('iron', 'pregnancy'), evidenceSpec('vitamin-d', 'pregnancy')]} />
      </>,
    );
    const buttons = screen.getAllByRole('button', { name: /what the research says/i });
    fireEvent.click(buttons[0]);
    await screen.findByText(/Preeclampsia is estimated/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain('iron-pregnancy,mood-pregnancy,pre-eclampsia,vitamin-d-pregnancy');
    fireEvent.click(buttons[2]);
    // Two specs: the top item of each, labelled.
    expect(await screen.findByText('Iron & ferritin')).toBeInTheDocument();
    expect(screen.getByText('Vitamin D')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says so quietly when the notes cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    renderNotes(<EvidenceNote specs={[evidenceSpec('hrt', 'menopause')]} />);
    fireEvent.click(screen.getByRole('button', { name: /what the research says/i }));
    expect(await screen.findByText(/couldn.t load right now/i)).toBeInTheDocument();
  });
});
