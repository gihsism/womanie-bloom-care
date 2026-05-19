import { useCallback, useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';

// Count of "needs your attention" items across the app — matches the
// sections on /dashboard/notifications: pending doctor connections,
// stalled analyses (upload > 3 min old + no ai_summary), critical
// findings, and recent doctor notes (written in the last 14 days).
// Returns the raw numbers and the total so the caller can decide how
// to render a badge.
//
// Subscribes to onHealthDataChange, so the number re-evaluates the
// moment a new analysis lands, a doctor is approved, etc.

const STALLED_THRESHOLD_MS = 3 * 60 * 1000;
const RECENT_NOTE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_CANCEL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface AttentionCounts {
  total: number;
  pendingConnections: number;
  stalledDocuments: number;
  criticalFindings: number;
  recentDoctorNotes: number;
  upcomingAppointments: number;
  recentDoctorCancellations: number;
}

const ZERO: AttentionCounts = {
  total: 0,
  pendingConnections: 0,
  stalledDocuments: 0,
  criticalFindings: 0,
  recentDoctorNotes: 0,
  upcomingAppointments: 0,
  recentDoctorCancellations: 0,
};

export function useAttentionCount(): AttentionCounts {
  const { user } = useAuth();
  const [counts, setCounts] = useState<AttentionCounts>(ZERO);

  const load = useCallback(async () => {
    if (!user) {
      setCounts(ZERO);
      return;
    }
    try {
      const [pendingResp, docsRes, findingsRes, notesResp, aptsResp] = await Promise.all([
        fetch('/api/connections/pending').then(r => (r.ok ? r.json() : { pending: [] })),
        db.from('health_documents')
          .select('id, ai_summary, uploaded_at')
          .eq('user_id', user.id),
        db.from('current_extracted_data')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'critical'),
        fetch('/api/me/doctor-notes').then(r => (r.ok ? r.json() : { notes: [] })),
        // Fetch the full history (capped server-side at 200) so we can
        // derive both upcoming + recent doctor-initiated cancellations
        // from one round-trip.
        fetch('/api/me/appointments').then(r => (r.ok ? r.json() : { appointments: [] })),
      ]);

      const pendingConnections = Array.isArray(pendingResp?.pending) ? pendingResp.pending.length : 0;
      const threshold = Date.now() - STALLED_THRESHOLD_MS;
      const docs = (docsRes.data ?? []) as Array<{ ai_summary: string | null; uploaded_at: string | null }>;
      const stalledDocuments = docs.filter(
        d => !d.ai_summary && d.uploaded_at && Date.parse(d.uploaded_at) < threshold,
      ).length;
      const criticalFindings = Array.isArray(findingsRes.data) ? findingsRes.data.length : 0;
      const noteCutoff = Date.now() - RECENT_NOTE_WINDOW_MS;
      const notes = Array.isArray(notesResp?.notes)
        ? notesResp.notes as Array<{ created_at: string | null }>
        : [];
      const recentDoctorNotes = notes.filter(
        n => n.created_at && Date.parse(n.created_at) >= noteCutoff,
      ).length;
      const allAppts = Array.isArray(aptsResp?.appointments)
        ? (aptsResp.appointments as Array<{
            scheduled_at: string;
            status: string | null;
            notes: string | null;
          }>)
        : [];
      const now = Date.now();
      const cancelCutoff = now - RECENT_CANCEL_WINDOW_MS;
      const upcomingAppointments = allAppts.filter(a => {
        const s = (a.status ?? '').toLowerCase();
        if (s === 'cancelled') return false;
        return Date.parse(a.scheduled_at) >= now;
      }).length;
      const recentDoctorCancellations = allAppts.filter(a => {
        const s = (a.status ?? '').toLowerCase();
        if (s !== 'cancelled') return false;
        // Only doctor-initiated cancellations carry the prefix; patient-
        // initiated ones leave notes null. We only flag the ones the
        // patient didn't initiate themselves.
        if (!a.notes || !/^Cancelled by doctor:/i.test(a.notes)) return false;
        return Date.parse(a.scheduled_at) >= cancelCutoff;
      }).length;

      // upcomingAppointments is informational on its own nav entry — it
      // doesn't roll into the bell-icon total (those are unread/needs-
      // attention items; an upcoming visit is just a heads-up).
      // recentDoctorCancellations *does* roll in — the patient needs to
      // know and (usually) rebook.
      setCounts({
        total:
          pendingConnections +
          stalledDocuments +
          criticalFindings +
          recentDoctorNotes +
          recentDoctorCancellations,
        pendingConnections,
        stalledDocuments,
        criticalFindings,
        recentDoctorNotes,
        upcomingAppointments,
        recentDoctorCancellations,
      });
    } catch {
      // Silently keep last known counts — a badge is cosmetic.
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => onHealthDataChange(load), [load]);

  return counts;
}
