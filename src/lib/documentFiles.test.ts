import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const upload = vi.fn();
vi.mock('@vercel/blob/client', () => ({ upload: (...a: unknown[]) => upload(...a) }));

import { documentFileUrl, uploadDocumentBlob } from './documentFiles';

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
