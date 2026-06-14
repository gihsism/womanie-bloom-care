import { useCallback, useEffect, useState } from 'react';
import { differenceInYears, parseISO } from 'date-fns';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { onHealthDataChange } from '@/lib/data-events';
import {
  AMH_BY_AGE,
  assessAmh,
  deriveLabFlags,
  hormoneKeyForTitle,
  parseLabValue,
  type HormoneKey,
} from '@/lib/hormone-reference';

// Loads age + the lab signals that are most likely to affect cycle
// prediction: AMH, FSH, LH, TSH, prolactin, testosterone. Returns a
// normalized "context" object that other hooks/components can lean on
// instead of re-parsing the same data each.
//
// Age comes from the localStorage basic-info blob (DOB lives client-
// side until profiles picks up a date_of_birth column — see HANDOFF).
// Labs come from current_extracted_data so we always have the latest
// value, not stale per-document rows.

export interface LatestLab {
  key: HormoneKey;
  title: string;
  value: number;
  unit: string | null;
  status: string | null;
  dateRecorded: string | null;
}

export interface UserHealthContext {
  loaded: boolean;
  age: number | null;
  ageBracket: string | null;
  labs: Partial<Record<HormoneKey, LatestLab>>;

  // Derived signals — convenience flags so consumers don't repeat the
  // same threshold logic. All `null` until the relevant lab arrives.
  tshOutOfRange: boolean | null;
  highFsh: boolean | null;        // FSH > 10 IU/L (diminished reserve threshold)
  menopausalFsh: boolean | null;  // FSH > 25 IU/L
  pcosLhFshPattern: boolean | null; // LH/FSH > 2.0 with elevated LH
  highProlactin: boolean | null;  // > 23 ng/mL (can suppress ovulation)
  highTestosterone: boolean | null;
  amhAssessment: ReturnType<typeof assessAmh>;
}

const EMPTY: UserHealthContext = {
  loaded: false,
  age: null,
  ageBracket: null,
  labs: {},
  tshOutOfRange: null,
  highFsh: null,
  menopausalFsh: null,
  pcosLhFshPattern: null,
  highProlactin: null,
  highTestosterone: null,
  amhAssessment: null,
};

function ageBracketLabel(age: number): string {
  const bracket = AMH_BY_AGE.find(b => age >= b.ageFrom && age <= b.ageTo);
  if (!bracket) return `${age}`;
  return bracket.ageTo >= 99 ? `${bracket.ageFrom}+` : `${bracket.ageFrom}–${bracket.ageTo}`;
}

function readAgeFromLocal(userId: string): number | null {
  try {
    const raw = window.localStorage.getItem(`womanie_basic_info_${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { dateOfBirth?: string | null };
    if (!parsed.dateOfBirth) return null;
    const dob = parseISO(parsed.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    const years = differenceInYears(new Date(), dob);
    return years > 0 && years < 130 ? years : null;
  } catch {
    return null;
  }
}

export function useUserHealthContext(): UserHealthContext {
  const { user } = useAuth();
  const [state, setState] = useState<UserHealthContext>(EMPTY);

  const load = useCallback(async () => {
    if (!user) {
      setState(EMPTY);
      return;
    }
    const age = readAgeFromLocal(user.id);
    try {
      const { data } = await db
        .from('current_extracted_data')
        .select('title, value, unit, status, date_recorded')
        .eq('user_id', user.id)
        .eq('data_type', 'lab_result');
      const rows = (data ?? []) as Array<{
        title: string;
        value: string | number | null;
        unit: string | null;
        status: string | null;
        date_recorded: string | null;
      }>;

      // Group by hormone key; keep the newest reading per key.
      const labs: Partial<Record<HormoneKey, LatestLab>> = {};
      for (const r of rows) {
        const key = hormoneKeyForTitle(r.title);
        if (!key) continue;
        const value = parseLabValue(r.value);
        if (value === null) continue;
        const prev = labs[key];
        const candidate: LatestLab = {
          key,
          title: r.title,
          value,
          unit: r.unit,
          status: r.status,
          dateRecorded: r.date_recorded,
        };
        if (!prev) {
          labs[key] = candidate;
        } else {
          const prevT = prev.dateRecorded ? Date.parse(prev.dateRecorded) : 0;
          const candT = candidate.dateRecorded ? Date.parse(candidate.dateRecorded) : 0;
          if (candT >= prevT) labs[key] = candidate;
        }
      }

      // Derived flags (pure, shared logic — see deriveLabFlags).
      const { tshOutOfRange, highFsh, menopausalFsh, pcosLhFshPattern, highProlactin, highTestosterone } =
        deriveLabFlags(labs);
      const amhAssessment = labs.amh ? assessAmh(labs.amh.value, age) : null;

      setState({
        loaded: true,
        age,
        ageBracket: age !== null ? ageBracketLabel(age) : null,
        labs,
        tshOutOfRange,
        highFsh,
        menopausalFsh,
        pcosLhFshPattern,
        highProlactin,
        highTestosterone,
        amhAssessment,
      });
    } catch (e) {
      console.error('useUserHealthContext: load failed', e);
      setState(s => ({ ...s, loaded: true, age }));
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => onHealthDataChange(load), [load]);

  return state;
}
