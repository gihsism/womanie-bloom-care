import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import DailyLogging from '@/components/dashboard/DailyLogging';
import MedicineLog from '@/components/dashboard/MedicineLog';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { actionsFor } from '@/lib/todayActions';
import type { SheetKind } from '@/components/dashboard/HomeBlocks';

// Home's Log sheet: today's log (DailyLogging) and the medicine ticks
// (MedicineLog), opened from the primary button or a Today row instead of
// scrolling the page. The stage's other quick-log shortcuts sit on top as
// small links (kick count, weight, mood check …).

interface Props {
  open: SheetKind | null;
  onOpenChange: (open: boolean) => void;
  mode: LifeStage;
  weeksPregnant: number | null;
}

export default function LogSheet({ open, onOpenChange, mode, weeksPregnant }: Props) {
  const navigate = useNavigate();
  const shortcuts = actionsFor(mode, weeksPregnant).filter(a => !a.target.startsWith('sheet:') && a.label !== 'Medicines');
  const medsFirst = open === 'medicines';
  const log = <DailyLogging selectedMode={mode} />;
  const meds = <MedicineLog stage={mode} />;

  return (
    <Sheet open={open !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl p-4 sm:p-6">
        <SheetHeader className="text-left mb-3">
          <SheetTitle>{medsFirst ? 'Medicines today' : 'Log today'}</SheetTitle>
          <SheetDescription className="sr-only">Log how you feel today and tick off your medicines.</SheetDescription>
        </SheetHeader>
        {shortcuts.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {shortcuts.map(a => (
              <button
                key={a.label}
                type="button"
                onClick={() => { onOpenChange(false); navigate(a.target); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[13px] hover:bg-muted"
              >
                <a.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {a.label}
              </button>
            ))}
          </div>
        )}
        <div className="space-y-4">
          {medsFirst ? <>{meds}{log}</> : <>{log}{meds}</>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
