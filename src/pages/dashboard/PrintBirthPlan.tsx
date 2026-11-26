import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { db } from '@/integrations/db/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { BIRTH_PLAN_FOOTER, BIRTH_PLAN_LOCAL_KEY, parsePlan, planSummary, type BirthPlan } from '@/lib/birthPlan';
import { localDate } from '@/lib/visitSummary';

// Printable birth plan: same print decisions as the visit summary (white
// page, black text, toolbar hidden on paper). Reads the account copy
// (birth_plans) and falls back to the device copy.

export interface BirthPlanSheetData {
  name: string | null;
  dueDate: string | null;
  plan: BirthPlan;
}

const H2 = 'text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1';

/** The printable page itself (pure: data in, page out). */
export function BirthPlanSheet({ data, now = new Date() }: { data: BirthPlanSheetData; now?: Date }) {
  const sections = planSummary(data.plan);
  const due = data.dueDate ? new Date(`${data.dueDate.slice(0, 10)}T12:00:00`) : null;
  return (
    <article className="max-w-3xl mx-auto px-8 py-8 print:px-0 print:py-0" data-testid="birth-plan-sheet">
      <header className="mb-4 pb-3 border-b border-gray-300">
        <p className="text-xs uppercase tracking-wide text-gray-500">Birth plan</p>
        <h1 className="text-xl font-bold">{data.name || 'My birth plan'}</h1>
        <p className="text-xs text-gray-600">
          {due && !Number.isNaN(due.getTime()) ? `Due ${localDate(due)} · ` : ''}Prepared {localDate(now)}
        </p>
      </header>
      {sections.length === 0 && <p className="text-sm text-gray-500">No wishes filled in yet.</p>}
      {sections.map(s => (
        <section key={s.id} className="mb-4 break-inside-avoid" data-section={s.id}>
          <h2 className={H2}>{s.title}</h2>
          {s.wishes.length > 0 && (
            <ul className="text-sm list-disc pl-5">{s.wishes.map(w => <li key={w}>{w}</li>)}</ul>
          )}
          {s.note && <p className="text-sm mt-1 whitespace-pre-wrap">{s.note}</p>}
        </section>
      ))}
      <footer className="mt-6 pt-2 border-t border-gray-200 text-[10px] text-gray-500">{BIRTH_PLAN_FOOTER}</footer>
    </article>
  );
}

export default function PrintBirthPlan() {
  usePageTitle('Birth plan');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<BirthPlanSheetData | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [profileRes, planRes] = await Promise.all([
        db.from('profiles').select('full_name, pregnancy_due_date').eq('id', user.id).maybeSingle(),
        db.from('birth_plans').select('plan').eq('user_id', user.id).maybeSingle(),
      ]);
      let plan = !planRes.error && planRes.data ? parsePlan((planRes.data as { plan: unknown }).plan) : null;
      if (!plan) {
        try { plan = parsePlan(localStorage.getItem(BIRTH_PLAN_LOCAL_KEY(user.id))); } catch { plan = parsePlan(null); }
      }
      const p = (profileRes.data ?? null) as { full_name: string | null; pregnancy_due_date: string | null } | null;
      setData({ name: p?.full_name || user.name || null, dueDate: p?.pregnancy_due_date ?? null, plan });
    })();
  }, [user]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="border-b border-gray-200 print:hidden">
        <div className="px-4 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="h-11 w-11 text-black hover:bg-gray-100 hover:text-black" aria-label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <p className="text-[15px] font-bold">Birth plan</p>
            <p className="text-[13px] text-gray-600">Print a copy for your Hebamme and the hospital bag, or save as PDF.</p>
          </div>
          <Button className="gap-1.5 bg-black text-white hover:bg-black/85" onClick={() => window.print()} data-testid="birth-plan-print">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>
      <BirthPlanSheet data={data} />
    </div>
  );
}
