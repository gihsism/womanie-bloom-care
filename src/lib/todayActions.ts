import { Activity, Baby, CalendarDays, ClipboardList, Droplets, HeartPulse, Milk, Pill, Scale, Timer, type LucideIcon } from 'lucide-react';

// Quick-log actions per life stage, used by TodayActions on the dashboard.
export interface Action { label: string; icon: LucideIcon; target: string } // '#id' scrolls, '/path' navigates

export function actionsFor(mode: string, weeksPregnant: number | null): Action[] {
  const meds: Action = { label: 'Medicines', icon: Pill, target: '#medicines' };
  const log: Action = { label: "Today's log", icon: ClipboardList, target: '#daily-log' };
  switch (mode) {
    case 'pregnancy': {
      const w = weeksPregnant ?? 0;
      const list: Action[] = [];
      if (w >= 36) list.push({ label: 'Contractions', icon: Timer, target: '#contraction-timer' });
      if (w >= 28) list.push({ label: 'Kick count', icon: Activity, target: '#kick-counter' });
      list.push({ label: 'Weight', icon: Scale, target: '#weight' });
      list.push(meds);
      if (w >= 32) list.push({ label: 'Labour & birth', icon: Baby, target: '/dashboard/birth' });
      return list.slice(0, 4);
    }
    case 'postpartum':
      return [
        { label: 'Feed', icon: Milk, target: '/dashboard/baby?tab=feed' },
        { label: 'Nappy', icon: Droplets, target: '/dashboard/baby?tab=nappy' },
        { label: 'Mood check', icon: HeartPulse, target: '#mood-check' },
        meds,
      ];
    case 'menopause':
    case 'post-menopause':
      return [{ label: 'Symptoms', icon: CalendarDays, target: '#symptoms' }, meds, log];
    case 'ivf':
      return [meds, log];
    case 'contraception':
      return [meds, log];
    case 'pre-menstrual':
      return [log, meds];
    default:
      return [{ label: 'Period', icon: CalendarDays, target: '#cycle-calendar' }, log, meds];
  }
}

