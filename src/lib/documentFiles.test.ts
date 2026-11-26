import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const upload = vi.fn();
vi.mock('@vercel/blob/client', () => ({ upload: (...a: unknown[]) => upload(...a) }));

import { documentFileUrl, uploadDocumentBlob, documentFileProblem, recentDoctorDocuments, sendDocumentToPatient } from './documentFiles';

describe('documentFileUrl', () => {
  it('is a same-origin proxy URL keyed by document id', () => {
    expect(documentFileUrl('d1')).toBe('/api/docs/file?id=d1');
    expect(documentFileUrl('a&b=c/../x')).toBe('/api/docs/file?id=a%26b%3Dc%2F..%2Fx');
  });
});

describe('uploadDocumentBlob', () => {
  const file = { type: 'application/pdf' } as File;
  const fetchMock = vi.fn();
  beforeEach(() => {
    upload.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the access mode the server reports (private)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access: 'private' }) });
    upload.mockResolvedValue({ url: 'https://s.private.blob.vercel-storage.com/u/a.pdf' });
    await uploadDocumentBlob('u/a.pdf', file);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][2]).toMatchObject({ access: 'private', handleUploadUrl: '/api/upload' });
  });

  it('falls back to public once if the store refuses private uploads', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access: 'private' }) });
    upload.mockRejectedValueOnce(new Error('private not supported')).mockResolvedValueOnce({ url: 'https://s.public.blob.vercel-storage.com/u/a.pdf' });
    const r = await uploadDocumentBlob('u/a.pdf', file);
    expect(r.url).toContain('public');
    expect(upload.mock.calls.map(c => c[2].access)).toEqual(['private', 'public']);
  });

  it('defaults to public when the config call fails (uploads never break)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    upload.mockResolvedValue({ url: 'x' });
    await uploadDocumentBlob('u/a.pdf', file);
    expect(upload.mock.calls.map(c => c[2].access)).toEqual(['public']);
  });
});

describe('doctor -> patient documents (client)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    upload.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the same type and size limits as the patient upload', () => {
    expect(documentFileProblem({ name: 'lab.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
    expect(documentFileProblem({ name: 'scan.HEIC', size: 1000, type: '' })).toBeNull();
    expect(documentFileProblem({ name: 'x.html', size: 10, type: 'text/html' })).toMatch(/PDF/);
    expect(documentFileProblem({ name: 'x.pdf', size: 10, type: 'text/html' })).toMatch(/PDF/);
    expect(documentFileProblem({ name: 'big.pdf', size: 200 * 1024 * 1024 + 1, type: 'application/pdf' })).toMatch(/200 MB/);
  });

  it("uploads into the patient's folder with the forPatient payload, then registers and analyses it", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/upload') return { ok: true, json: async () => ({ access: 'public' }) };
      if (url === '/api/docs/from-doctor') return { ok: true, json: async () => ({ document: { id: 'd9', sent_by_me: true } }) };
      return { ok: true, json: async () => ({}) };
    });
    upload.mockResolvedValue({ url: 'https://s.public.blob.vercel-storage.com/pat_1/1-lab.pdf' });
    const file = new File(['x'], 'lab.pdf', { type: 'application/pdf' });
    const doc = await sendDocumentToPatient('pat_1', file, { note: 'hi' });
    expect(doc.id).toBe('d9');
    expect(String(upload.mock.calls[0][0])).toMatch(/^pat_1\//);
    expect(upload.mock.calls[0][2]).toMatchObject({ clientPayload: JSON.stringify({ forPatient: 'pat_1' }) });
    const register = fetchMock.mock.calls.find(c => c[0] === '/api/docs/from-doctor')!;
    expect(JSON.parse(register[1].body)).toMatchObject({ patientId: 'pat_1', note: 'hi', fileName: 'lab.pdf' });
    const analyse = fetchMock.mock.calls.find(c => c[0] === '/api/analyze-document')!;
    expect(JSON.parse(analyse[1].body)).toMatchObject({ documentId: 'd9', userId: 'pat_1' });
  });

  it('surfaces the server refusal (e.g. no approved connection)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/upload') return { ok: true, json: async () => ({ access: 'public' }) };
      return { ok: false, json: async () => ({ error: 'No approved connection to this patient' }) };
    });
    upload.mockResolvedValue({ url: 'u' });
    await expect(sendDocumentToPatient('pat_1', new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow(/approved connection/);
  });

  it('the in-app notice keeps the last 14 days, newest first', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    const list = recentDoctorDocuments([
      { id: 'old', doctor_name: 'Dr A', note: null, uploaded_at: '2026-11-01T00:00:00Z' },
      { id: 'a', doctor_name: 'Dr A', note: null, uploaded_at: '2026-11-20T00:00:00Z' },
      { id: 'b', doctor_name: 'Dr B', note: null, uploaded_at: '2026-11-25T00:00:00Z' },
      { id: 'none', doctor_name: 'Dr B', note: null, uploaded_at: null },
    ], now);
    expect(list.map(d => d.id)).toEqual(['b', 'a']);
  });
});

// Static guard over the client source: the browser must never read or open
// a document's storage URL. The only allowed mention of file_path is the
// one-time write right after upload (DocumentUpload inserts the new row).
describe('client source uses the proxy, never raw Blob URLs', () => {
  const root = join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(root);

  it('no client code reads health_documents.file_path', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/file_path|filePath/.test(line)) return;
        if (/^\s*(\/\/|\*)/.test(line)) return; // comments
        if (f.endsWith(join('dashboard', 'DocumentUpload.tsx')) && /^\s*file_path: fileUrl,$/.test(line)) return;
        offenders.push(`${f.slice(root.length)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the doctor chart opens documents through /api/docs/file', () => {
    const src = readFileSync(join(root, 'components/doctor/patient/PatientDocuments.tsx'), 'utf8');
    expect(src).toMatch(/openDocumentFile\(doc\.id\)/);
    expect(src).not.toMatch(/window\.open\(/);
  });
});
