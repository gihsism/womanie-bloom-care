import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { normalizeLifeStage } from '@/lib/lifeStage';

// The profile + period facts that Home and the stage page (/dashboard/stage)
// both need, and the handlers the stage trackers call to save them. Moved
// out of PatientDashboard unchanged so the two pages read and write the same
// columns in the same way. Never rewrites the stored life_stage except
// through the explicit switchToPostpartum action (as before).

export interface StageProfile {
  full_name?: string;
  life_stage?: string;
  pregnancy_due_date?: string | null;
  ivf_start_date?: string | null;
  ivf_phase?: string | null;
}

export interface PeriodData {
  lastPeriodStart: Date;
  cycleLength: number;
}

/**
 * A stored calendar date ('YYYY-MM-DD', or an ISO timestamp at UTC midnight)
 * as LOCAL midnight of that same day. new Date('2027-01-24') is UTC midnight,
 * which west of UTC (New York) is still the 23rd: the due date, last period
 * and IVF start then sat a day early (one day further along, a period shown
 * "late" a day too soon).
 */
export function localDay(raw: string | Date | null | undefined): Date | null {
  if (raw == null || raw === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw instanceof Date ? raw.toISOString() : String(raw));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function weeksPregnantFrom(dueDate: Date | null, now = Date.now()): number | null {
  if (!dueDate) return null;
  return Math.max(0, Math.floor((now - (dueDate.getTime() - 280 * 86400000)) / (7 * 86400000)));
}

export function useStageProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [profile, setProfile] = useState<StageProfile | null>(null);
  const [selectedMode, setSelectedMode] = useState<LifeStage | null>(null);
  const [periodData, setPeriodData] = useState<PeriodData | null>(null);
  const [pregnancyDueDate, setPregnancyDueDate] = useState<Date | null>(null);
  const [ivfStartDate, setIvfStartDate] = useState<Date | null>(null);
  const [ivfPhase, setIvfPhase] = useState<string | null>(null);

  const loadPeriodData = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await db
        .from('period_tracking')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setPeriodData({ lastPeriodStart: localDay(data.period_start_date) ?? new Date(data.period_start_date), cycleLength: data.cycle_length });
      } else {
        // No period data yet — leave as null so CycleCalendar shows empty state
        setPeriodData(null);
      }
    } catch (error) {
      console.error('Error loading period data:', error);
    }
  }, [user]);

  useEffect(() => {
    loadPeriodData();
  }, [loadPeriodData]);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data: existing, error } = await db
        .from('profiles')
        .select('full_name, life_stage, pregnancy_due_date, ivf_start_date, ivf_phase')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;

      // Auto-create profile if it doesn't exist. `data` is reassigned in
      // that branch, so it must be `let` (see 9a31240).
      let data = existing;
      if (!data) {
        const userName = user?.user_metadata?.full_name || null;
        await db.from('profiles').insert({ id: userId, full_name: userName, life_stage: 'menstrual-cycle' });
        data = { full_name: userName, life_stage: 'menstrual-cycle', pregnancy_due_date: null, ivf_start_date: null, ivf_phase: null };
      }

      setProfile(data);
      setSelectedMode(normalizeLifeStage(data?.life_stage));
      if (data?.pregnancy_due_date) setPregnancyDueDate(localDay(data.pregnancy_due_date));
      if (data?.ivf_start_date) setIvfStartDate(localDay(data.ivf_start_date));
      if (data?.ivf_phase) setIvfPhase(data.ivf_phase);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setSelectedMode('menstrual-cycle');
    }
  }, [user]);

  // Fetch profile when user is available or when navigating back to the page
  useEffect(() => {
    if (user) fetchProfile(user.id);
  }, [user, location.key, fetchProfile]);

  const setPregnancyDue = async (date: Date) => {
    setPregnancyDueDate(date);
    if (!user) return;
    try {
      await db.from('profiles').update({ pregnancy_due_date: format(date, 'yyyy-MM-dd') }).eq('id', user.id);
    } catch (error) {
      console.error('Error saving due date:', error);
    }
  };

  const resetPregnancy = async () => {
    setPregnancyDueDate(null);
    if (!user) return;
    try {
      await db.from('profiles').update({ pregnancy_due_date: null }).eq('id', user.id);
      toast({ title: 'Pregnancy tracking reset', description: 'You can set it up again anytime.' });
    } catch (error) {
      console.error('Error resetting pregnancy:', error);
    }
  };

  // Past-due transition: when a user is 14+ days past their due date,
  // PregnancyTracker surfaces a "did baby arrive?" prompt. Yes → life_stage
  // flips to postpartum and the pregnancy due date is cleared.
  const switchToPostpartum = async () => {
    if (!user) return;
    try {
      await db.from('profiles').update({ life_stage: 'postpartum', pregnancy_due_date: null }).eq('id', user.id);
      setPregnancyDueDate(null);
      setSelectedMode('postpartum');
      toast({
        title: 'Switched to after birth',
        description: "Add your baby's birth date in the recovery section to anchor recovery milestones.",
      });
    } catch (error) {
      console.error('Error switching to postpartum:', error);
      toast({ title: 'Could not switch mode', description: 'Try again in a moment.', variant: 'destructive' });
    }
  };

  const setIVFStart = async (date: Date, phase: string) => {
    setIvfStartDate(date);
    setIvfPhase(phase);
    if (!user) return;
    try {
      await db.from('profiles').update({ ivf_start_date: format(date, 'yyyy-MM-dd'), ivf_phase: phase }).eq('id', user.id);
    } catch (error) {
      console.error('Error saving IVF data:', error);
    }
  };

  const updateIVFPhase = async (phase: string) => {
    setIvfPhase(phase);
    setIvfStartDate(new Date()); // reset phase start to today
    if (!user) return;
    try {
      await db.from('profiles').update({ ivf_phase: phase, ivf_start_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', user.id);
    } catch (error) {
      console.error('Error updating IVF phase:', error);
    }
  };

  return {
    profile,
    setProfile,
    selectedMode,
    periodData,
    pregnancyDueDate,
    ivfStartDate,
    ivfPhase,
    weeksPregnant: weeksPregnantFrom(pregnancyDueDate),
    setPregnancyDue,
    resetPregnancy,
    switchToPostpartum,
    setIVFStart,
    updateIVFPhase,
  };
}
