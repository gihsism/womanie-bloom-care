import { describe, it, expect, vi, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isMaintenanceOn,
  isAllowedInMaintenance,
  blockIfMaintenance,
  withMaintenance,
  maintenanceMessage,
  DEFAULT_MAINTENANCE_MESSAGE,
} from './maintenance';
import routerHandler from '../router';
import maintenanceRoute from '../_routes/maintenance';

function mockRes() {
  const res: Record<string, unknown> & { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  res.setHeader = vi.fn((k: string, v: string) => { res.headers[k] = v; return res; });
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((b: unknown) => { res.body = b; return res; });
  res.end = vi.fn(() => res);
  return res as unknown as VercelResponse & { statusCode?: number; body?: any; headers: Record<string, string> };
}
const req = (method: string, body?: unknown, url = '/api/x') =>
  ({ method, body, url, query: {}, headers: {} }) as unknown as VercelRequest;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('maintenance flag', () => {
  it('is OFF by default and for anything but an explicit yes', () => {
    expect(isMaintenanceOn({})).toBe(false);
    for (const v of ['', '0', 'false', 'off', 'no', 'maybe']) expect(isMaintenanceOn({ MAINTENANCE_MODE: v })).toBe(false);
    for (const v of ['1', 'true', 'TRUE', ' on ', 'yes']) expect(isMaintenanceOn({ MAINTENANCE_MODE: v })).toBe(true);
  });

  it('uses the default message unless one is configured', () => {
    expect(maintenanceMessage({})).toBe(DEFAULT_MAINTENANCE_MESSAGE);
    expect(maintenanceMessage({ MAINTENANCE_MESSAGE: '  Back at 22:15  ' })).toBe('Back at 22:15');
  });

  it('lets only reads through', () => {
    expect(isAllowedInMaintenance('db', req('POST', { operation: 'select', table: 'profiles' }))).toBe(true);
    for (const op of ['insert', 'update', 'upsert', 'delete', undefined]) {
      expect(isAllowedInMaintenance('db', req('POST', { operation: op, table: 'profiles' }))).toBe(false);
    }
    expect(isAllowedInMaintenance('db', req('POST', undefined))).toBe(false);
    expect(isAllowedInMaintenance('auth/me', req('GET'))).toBe(true);
    expect(isAllowedInMaintenance('maintenance', req('GET'))).toBe(true);
    expect(isAllowedInMaintenance('chat/messages', req('GET'))).toBe(true);
    expect(isAllowedInMaintenance('chat/messages', req('POST', {}))).toBe(false);
    expect(isAllowedInMaintenance('chat/messages', req('DELETE'))).toBe(false);
    expect(isAllowedInMaintenance('me/export', req('GET'))).toBe(true);
    // Writers, including GET routes that write (OAuth callback, cron) and logins.
    for (const r of ['auth/login', 'auth/signup', 'auth/callback', 'auth/logout', 'push/send-due',
      'me/delete-account', 'upload', 'analyze-document', 'ai-doctor-chat', 'summary/panel', 'docs/file', 'doctors/patient']) {
      expect(isAllowedInMaintenance(r, req('GET'))).toBe(false);
      expect(isAllowedInMaintenance(r, req('POST', {}))).toBe(false);
    }
    expect(isAllowedInMaintenance('upload', req('OPTIONS'))).toBe(true);
  });

  it('does nothing while OFF', () => {
    const res = mockRes();
    expect(blockIfMaintenance('auth/signup', req('POST', {}), res, {})).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 + Retry-After while ON', () => {
    const res = mockRes();
    expect(blockIfMaintenance('auth/signup', req('POST', {}), res, { MAINTENANCE_MODE: '1' })).toBe(true);
    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('600');
    expect(res.body).toEqual({ error: DEFAULT_MAINTENANCE_MESSAGE, maintenance: true });
  });

  it('withMaintenance wraps a standalone function', async () => {
    const inner = vi.fn();
    const wrapped = withMaintenance('upload', inner);
    wrapped(req('POST', {}), mockRes());
    expect(inner).toHaveBeenCalledTimes(1);

    vi.stubEnv('MAINTENANCE_MODE', 'true');
    const res = mockRes();
    wrapped(req('POST', {}), res);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(503);
  });
});

describe('router + /api/maintenance', () => {
  it('blocks a write route before its handler runs, and reports the flag', async () => {
    vi.stubEnv('MAINTENANCE_MODE', '1');
    const res = mockRes();
    await routerHandler(req('POST', { email: 'a@b.c' }, '/api/auth/signup'), res);
    expect(res.statusCode).toBe(503);

    const status = mockRes();
    await routerHandler(req('GET', undefined, '/api/maintenance'), status);
    expect(status.statusCode).toBe(200);
    expect(status.body).toEqual({ maintenance: true, message: DEFAULT_MAINTENANCE_MESSAGE });
  });

  it('reports OFF by default', () => {
    const res = mockRes();
    maintenanceRoute(req('GET'), res);
    expect(res.body).toEqual({ maintenance: false, message: null });
  });
});
