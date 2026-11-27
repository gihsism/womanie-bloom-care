import type { Page } from '@playwright/test';
import { test, expect, mockAccount, resolveTokens, STAGES } from './fixtures';
import type { Row } from './mock-api';

// Every main page, every life stage, with (a) a brand-new account that has
// no data at all and (b) rows whose optional columns are empty (null), as
// older rows and partly-filled forms leave them. The page must render
// without the error screen and without console errors.

const PAGES = [
  '/dashboard',
  '/dashboard/stage',
  '/dashboard/medical-history',
  '/dashboard/ai-doctor',
  '/dashboard/appointments',
  '/dashboard/settings',
  '/dashboard/appointments/apt-1/prep',
];

const SPARSE: { tables: Record<string, Row[]>; appointments: Row[] } = {
  tables: {
    period_tracking: [
      { id: 'per-1', user_id: 'e2e-user-1', period_start_date: '{{day:-12}}', period_end_date: null, cycle_length: null },
    ],
    medications: [
      { id: 'med-1', user_id: 'e2e-user-1', name: 'Iron', dose: null, times_per_day: null, reminder_times: null, active: true, started_on: null },
    ],
    health_documents: [
      { id: 'doc-1', user_id: 'e2e-user-1', file_name: 'scan.pdf', mime_type: null, ai_suggested_name: null, ai_summary: null, ai_suggested_category: null, document_type: null, uploaded_at: null },
    ],
    current_extracted_data: [
      { id: 'res-1', user_id: 'e2e-user-1', document_id: 'doc-1', data_type: 'lab_result', title: 'Ferritin', value: '12', unit: null, reference_range: null, status: null, date_recorded: null },
    ],
  },
  appointments: [
    { id: 'apt-1', doctor_id: 'doc-user-1', scheduled_at: '{{at:5}}', status: null, consultation_type: null, duration: null, payment_status: null, notes: null, booked_at: null, doctor_practice_address: null, doctor_name: null, doctor_title: null, doctor_specialties: null, doctor_avatar_url: null, doctor_verified: null },
  ],
};

async function sweep(page: Page, consoleErrors: string[]) {
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Something went wrong' }), `${path} shows the error screen`).toHaveCount(0, { timeout: 1_000 });
    expect(consoleErrors, `console errors on ${path}`).toEqual([]);
  }
}

for (const stage of STAGES) {
  test.describe(`${stage.label} (${stage.key})`, () => {
    test('new account with no data: every page renders', async ({ page, consoleErrors }) => {
      const api = await mockAccount(page, stage.key, {
        tables: { medications: [], health_documents: [], current_extracted_data: [], period_tracking: [] },
        appointments: [],
      });
      await sweep(page, consoleErrors);
      expect(api.unhandled).toEqual([]);
    });

    test('rows with empty optional fields: every page renders', async ({ page, consoleErrors }) => {
      const sparse = resolveTokens(SPARSE);
      const api = await mockAccount(page, stage.key, sparse);
      await sweep(page, consoleErrors);
      expect(api.unhandled).toEqual([]);
    });
  });
}
