import { Activity, Baby, CalendarDays, ClipboardList, Droplets, HeartPulse, Milk, Pill, Scale, Timer, type LucideIcon } from '@/components/icons';

// Quick-log shortcuts per life stage, shown as chips inside Home's Log
// sheet. Targets: '/path' or '/dashboard/stage#id' navigates (the stage
// page scrolls to the anchor); 'sheet:log' is today's log in the sheet.
export interface Action { label: string; icon: LucideIcon; target: string }

const STAGE = '/dashboard/stage';

export function actionsFor(mode: string, weeksPregnant: number | null): Action[] {
  const meds: Action = { label: 'Medicines', icon: Pill, target: `${STAGE}#medicines` };
  const log: Action = { label: "Today's log", icon: ClipboardList, target: 'sheet:log' };
  switch (mode) {
    case 'pregnancy': {
      const w = weeksPregnant ?? 0;
      const list: Action[] = [];
      if (w >= 36) list.push({ label: 'Contractions', icon: Timer, target: `${STAGE}#contraction-timer` });
      if (w >= 28) list.push({ label: 'Kick count', icon: Activity, target: `${STAGE}#kick-counter` });
      list.push({ label: 'Weight', icon: Scale, target: `${STAGE}#weight` });
      list.push(meds);
      if (w >= 32) list.push({ label: 'Labour & birth', icon: Baby, target: '/dashboard/birth' });
      return list.slice(0, 4);
    }
    case 'postpartum':
      return [
        { label: 'Feed', icon: Milk, target: '/dashboard/baby?tab=feed' },
        { label: 'Nappy', icon: Droplets, target: '/dashboard/baby?tab=nappy' },
        { label: 'Mood check', icon: HeartPulse, target: `${STAGE}#mood-check` },
        meds,
      ];
    case 'menopause':
    case 'post-menopause':
      return [{ label: 'Symptoms', icon: CalendarDays, target: `${STAGE}#symptoms` }, meds, log];
    case 'ivf':
      return [meds, log];
    case 'contraception':
      return [meds, log];
    case 'pre-menstrual':
      return [log, meds];
    default:
      return [{ label: 'Period', icon: CalendarDays, target: `${STAGE}#cycle-calendar` }, log, meds];
  }
}

