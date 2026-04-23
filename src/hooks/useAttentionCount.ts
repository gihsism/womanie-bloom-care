import { useCallback, useEffect, useState } from 'react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';

// Count of "needs your attention" items across the app — matches the
// three sections on /dashboard/notifications: pending doctor
// connections, stalled analyses (upload > 3 min old + no ai_summary),
// critical findings. Returns the raw numbers and the total so the
// caller can decide how to render a badge.
//
// Subscribes to onHealthDataChange, so the number re-evaluates the
// moment a new analysis lands, a doctor is approved, etc.

const STALLED_THRESHOLD_MS = 3 * 60 * 1000;

export interface AttentionCounts {
  total: number;
  pendingConnections: number;
  stalledDocuments: number;
  criticalFindings: number;
}

const ZERO: AttentionCounts = {
  total: 0,
  pendingConnections: 0,
  stalledDocuments: 0,
  criticalFindings: 0,
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
      const [pendingResp, docsRes, findingsRes] = await Promise.all([
        fetch('/api/connections/pending').then(r => (r.ok ? r.json() : { pending: [] })),
        db.from('health_documents')
          .select('id, ai_summary, uploaded_at')
          .eq('user_id', user.id),
        db.from('current_extracted_data')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'critical'),
      ]);

      const pendingConnections = Array.isArray(pendingResp?.pending) ? pendingResp.pending.length : 0;
      const threshold = Date.now() - STALLED_THRESHOLD_MS;
      const docs = (docsRes.data ?? []) as Array<{ ai_summary: string | null; uploaded_at: string | null }>;
      const stalledDocuments = docs.filter(
        d => !d.ai_summary && d.uploaded_at && Date.parse(d.uploaded_at) < threshold,
      ).length;
      const criticalFindings = Array.isArray(findingsRes.data) ? findingsRes.data.length : 0;

      setCounts({
        total: pendingConnections + stalledDocuments + criticalFindings,
        pendingConnections,
        stalledDocuments,
        criticalFindings,
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
