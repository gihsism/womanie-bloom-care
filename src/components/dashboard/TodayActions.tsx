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
      <p className="label-mono mb-2">Quick log</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <button key={a.label} type="button" onClick={() => go(a.target)}
            className={`inline-flex items-center gap-1.5 rounded-full border border-foreground px-3.5 py-2 text-[13px] font-medium active:scale-[0.98] transition ${i === 0 ? 'bg-foreground text-background' : 'hover:bg-foreground/5'}`}>
            <a.icon className="h-3.5 w-3.5" aria-hidden="true" />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
