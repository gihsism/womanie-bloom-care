import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest } from '@vercel/node';

const query = vi.fn();
vi.mock('@neondatabase/serverless', () => ({ neon: () => ({ query }) }));
vi.mock('./auth.js', () => ({ getAuthUser: vi.fn() }));

import { getAdminUser, isVerifiedAdmin, auditLogInsert } from './admin';
import { getAuthUser } from './auth.js';

const req = {} as VercelRequest;

describe('getAdminUser: ADMIN_EMAILS + Google-verified account', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'founder@womanie.info, second@womanie.info';
    process.env.DATABASE_URL = 'postgres://test';
    query.mockReset();
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user_a', email: 'founder@womanie.info' });
  });
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it('accepts a listed email whose account is linked to Google', async () => {
    query.mockResolvedValue([{ email: 'Founder@Womanie.info', google_id: 'g-123' }]);
    const u = await getAdminUser(req);
    expect(u?.id).toBe('user_a');
    expect(u?.email).toBe('founder@womanie.info');
    expect(query.mock.calls[0][1]).toEqual(['user_a']);
  });

  // The auditor's finding: password signup never verifies the address, so a
  // stranger could register founder@... with a password first. Without a
  // Google link that account must NOT be an admin.
  it('refuses a listed email on a password-only (unverified) account', async () => {
    query.mockResolvedValue([{ email: 'founder@womanie.info', google_id: null }]);
    expect(await getAdminUser(req)).toBeNull();
  });

  it('uses the email stored on the account, not the one in the session token', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ id: 'user_b', email: 'founder@womanie.info' });
    query.mockResolvedValue([{ email: 'someone@else.com', google_id: 'g-9' }]);
    expect(await getAdminUser(req)).toBeNull();
  });

  it('refuses an email that is not listed', async () => {
    query.mockResolvedValue([{ email: 'patient@x.com', google_id: 'g-1' }]);
    expect(await getAdminUser(req)).toBeNull();
  });

  it('fails closed when ADMIN_EMAILS is unset (no DB lookup at all)', async () => {
    delete process.env.ADMIN_EMAILS;
    expect(await getAdminUser(req)).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('fails closed when signed out', async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    expect(await getAdminUser(req)).toBeNull();
  });

  it('fails closed when the lookup errors', async () => {
    query.mockRejectedValue(new Error('db down'));
    expect(await getAdminUser(req)).toBeNull();
  });

  it('isVerifiedAdmin refuses a missing account row', async () => {
    const q = vi.fn().mockResolvedValue([]);
    expect((await isVerifiedAdmin(q, 'nobody')).ok).toBe(false);
  });
});

describe('auditLogInsert', () => {
  it('records who did what to whom, with detail as JSON', () => {
    const [text, params] = auditLogInsert({ id: 'admin_1', email: 'a@w.info' }, 'doctor_reject', { userId: 'doc_1', email: 'd@x.ch' }, { reason: 'no GLN' });
    expect(text).toMatch(/INSERT INTO admin_audit_log/);
    expect(params).toEqual(['admin_1', 'a@w.info', 'doctor_reject', 'doc_1', 'd@x.ch', JSON.stringify({ reason: 'no GLN' })]);
  });
});
