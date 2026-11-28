import { DATE_FMT } from '@/lib/dateFormat';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useTtcStart } from '@/hooks/useTtcStart';
import { useUserHealthContext } from '@/hooks/useUserHealthContext';
import { ttcDoctorAdvice, ttcDoctorText, parseYmd, isTtcStartInput, ttcStartMin } from '@/lib/ttc';
import { CalendarHeart, FileText, Stethoscope } from 'lucide-react';

// TTC stage: "When did you start trying?" and, once it has been 12 months
// (6 from age 35, straight away from 40), a calm suggestion to see a
// doctor with a link to the visit summary. Rule and sources: lib/ttc.ts.

export default function TtcDoctorCard() {
  const { user } = useAuth();
  const { ttcStart, save } = useTtcStart(user?.id);
  const { age } = useUserHealthContext();
  const advice = ttcDoctorAdvice(ttcStart, age);
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  return (
    <Card className="p-4" data-testid="ttc-doctor-card">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <CalendarHeart className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold">Trying since</p>
          <p className="text-[11px] text-muted-foreground">
            {advice
              ? `${format(parseYmd(ttcStart as string), DATE_FMT)} · ${advice.monthsTrying} ${advice.monthsTrying === 1 ? 'month' : 'months'}`
              : 'Add the day you started trying (roughly is fine)'}
          </p>
        </div>
      </div>

      <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Started trying on</span>
        <Input
          type="date"
          className="h-8 w-40"
          min={ttcStartMin(todayIso)}
          max={todayIso}
          value={ttcStart ?? ''}
          onChange={e => {
            const v = e.target.value;
            if (!v) save(null);
            else if (isTtcStartInput(v, todayIso)) save(v);
          }}
        />
      </label>

      {advice?.due && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3" data-testid="ttc-see-doctor">
          <p className="text-sm font-medium flex items-center gap-1.5 mb-1">
            <Stethoscope className="h-4 w-4 text-primary" aria-hidden="true" />
            A good time for a check-up
          </p>
          <p className="text-[13px] text-muted-foreground leading-snug">{ttcDoctorText(advice)}</p>
          <div className="flex flex-wrap gap-3 mt-2 text-xs">
            <Link to="/dashboard/visit-summary/print" className="inline-flex items-center gap-1 text-primary underline">
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Your visit summary
            </Link>
            <Link to="/find-doctor" className="text-primary underline">Find a gynaecologist</Link>
          </div>
        </div>
      )}

      {advice && !advice.due && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Most couples conceive within a year. If it has not happened after {advice.thresholdMonths} months
          {advice.thresholdMonths === 6 ? ' (the advice from 35)' : ''}, we will suggest a check-up here.
        </p>
      )}

      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
        See a doctor sooner if your periods are very irregular or absent, if you have had pelvic infections,
        endometriosis or surgery, or if you know of a fertility problem for you or your partner.
      </p>
    </Card>
  );
}
