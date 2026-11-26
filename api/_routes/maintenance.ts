import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isMaintenanceOn, maintenanceMessage } from '../_lib/maintenance.js';

// GET /api/maintenance -> { maintenance: boolean, message: string | null }
// Read by the app's MaintenanceBanner. No database access, no auth: it only
// reports the MAINTENANCE_MODE env flag (OFF by default).
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const on = isMaintenanceOn();
  return res.status(200).json({ maintenance: on, message: on ? maintenanceMessage() : null });
}
