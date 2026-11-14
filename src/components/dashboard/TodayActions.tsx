import { useNavigate } from 'react-router-dom';
import { actionsFor } from '@/lib/todayActions';

// One row of big, thumb-friendly buttons at the top of the dashboard for
// the things people log most often in their current life stage. Each one
// scrolls to the tracker further down (or opens its page), so the main
// actions are one tap away instead of several screens of scrolling.

export default function TodayActions({ mode, weeksPregnant }: { mode: string; weeksPregnant: number | null }) {
  const navigate = useNavigate();
  const actions = actionsFor(mode, weeksPregnant);
  const go = (target: string) => {
    if (target.startsWith('/')) { navigate(target); return; }
    const el = document.getElementById(target.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.add('ring-2', 'ring-primary/40', 'rounded-xl');
      window.setTimeout(() => el.classList.remove('ring-2', 'ring-primary/40', 'rounded-xl'), 1600);
    }
  };
  if (!actions.length) return null;
  return (
    <div className="mb-5">
      <p className="text-xs font-medium text-muted-foreground mb-2">Quick log</p>
      <div className={`grid gap-2 ${actions.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {actions.map(a => (
          <button key={a.label} type="button" onClick={() => go(a.target)}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-card border py-3 px-1 text-center hover:bg-muted/50 active:scale-[0.98] transition min-h-[72px]">
            <span className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <a.icon className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
            </span>
            <span className="text-[11px] font-medium leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
