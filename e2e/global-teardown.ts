import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { request, type FullConfig } from '@playwright/test';

// In CI only (the nightly GitHub Actions run): end every session the run
// used, server side. The repo is public and a failing run uploads its
// report, whose traces include request headers, so a session cookie in
// them must already be dead. Locally the sessions are kept and reused,
// because sign-ins are rate-limited (see global-setup.ts).

export default async function globalTeardown(config: FullConfig) {
  if (!process.env.CI) return;
  for (const project of config.projects) {
    const { baseURL, storageState } = project.use as { baseURL?: string; storageState?: unknown };
    if (typeof storageState !== 'string' || typeof baseURL !== 'string') continue;
    const statePath = resolve(config.configFile ? dirname(config.configFile) : process.cwd(), storageState);
    if (!existsSync(statePath)) continue;
    const ctx = await request.newContext({ baseURL, storageState: statePath });
    try {
      await ctx.get('/api/auth/logout', { maxRedirects: 0 });
    } catch (e) {
      console.warn(`[${project.name}] logout in teardown failed: ${(e as Error).message}`);
    } finally {
      await ctx.dispose();
    }
  }
}
