import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Circle, Briefcase, RotateCcw } from 'lucide-react';

// Hospital bag checklist for late pregnancy (week 32+). Curated from
// common OB/midwife packing lists. Grouped by recipient so the user
// can pack one set at a time. Per-user localStorage for state.

interface HospitalBagChecklistProps {
  weeksPregnant: number;
}

interface BagItem {
  id: string;
  label: string;
  hint?: string;
}

interface BagSection {
  id: string;
  title: string;
  description: string;
  items: BagItem[];
}

const SECTIONS: BagSection[] = [
  {
    id: 'mom',
    title: 'For you',
    description: 'Things you\'ll want during labor and the first day after.',
    items: [
      { id: 'mom-id', label: 'Photo ID + insurance card', hint: 'Hospital admit needs both' },
      { id: 'mom-birth-plan', label: 'Birth plan (if you have one)', hint: 'Bring a copy for staff' },
      { id: 'mom-glasses', label: 'Glasses / contact-lens case', hint: 'Hospitals are bright; contacts get tired' },
      { id: 'mom-toiletries', label: 'Toiletries kit', hint: 'Toothbrush, toothpaste, deodorant, hair ties' },
      { id: 'mom-phone-charger', label: 'Phone + long charging cable', hint: 'Outlets are rarely near the bed' },
      { id: 'mom-comfort', label: 'Pillow / blanket from home', hint: 'Hospital pillows are notoriously thin' },
      { id: 'mom-slippers', label: 'Non-slip slippers / socks', hint: 'Floors are slick' },
      { id: 'mom-robe', label: 'Robe or cardigan', hint: 'Something warm for the hallway walk' },
      { id: 'mom-snacks', label: 'Snacks for partner', hint: 'You probably can\'t eat in labor; they can' },
      { id: 'mom-lip-balm', label: 'Lip balm', hint: 'IV fluids dry you out' },
      { id: 'mom-going-home', label: 'Loose going-home outfit', hint: 'You\'ll still look ~5 months pregnant' },
      { id: 'mom-pads', label: 'Heavy maternity pads', hint: 'Hospital provides some, bring backup' },
      { id: 'mom-nursing-bra', label: 'Nursing bra / sleep bra', hint: 'No underwire' },
    ],
  },
  {
    id: 'baby',
    title: 'For baby',
    description: 'What baby needs for the hospital stay and the ride home.',
    items: [
      { id: 'baby-going-home', label: 'Going-home outfit (newborn + 0–3m)', hint: 'Bring both sizes — newborn doesn\'t fit some babies' },
      { id: 'baby-onesies', label: '3–4 onesies', hint: 'Long-sleeve in winter, short in summer' },
      { id: 'baby-car-seat', label: 'Car seat — installed', hint: 'Hospital checks before discharge' },
      { id: 'baby-hat', label: 'Soft hat', hint: 'Newborns lose heat fast' },
      { id: 'baby-blanket', label: 'Receiving blanket', hint: 'For the car ride' },
      { id: 'baby-mittens', label: 'Mittens / socks', hint: 'Their fingernails are sharp' },
    ],
  },
  {
    id: 'partner',
    title: 'For partner / support person',
    description: 'Anyone staying with you through labor.',
    items: [
      { id: 'partner-change', label: 'Change of clothes + pajamas', hint: 'Labor can be long' },
      { id: 'partner-toiletries', label: 'Toiletries', hint: 'Same idea as yours' },
      { id: 'partner-snacks', label: 'Snacks + drinks', hint: 'Hospital cafes have limited hours' },
      { id: 'partner-pillow', label: 'Pillow', hint: 'The fold-out chairs are unkind' },
      { id: 'partner-cash', label: 'Cash / coins', hint: 'Parking, vending machines' },
    ],
  },
  {
    id: 'docs',
    title: 'Documents + admin',
    description: 'The paperwork side of the visit.',
    items: [
      { id: 'docs-records', label: 'Maternity records / prenatal book', hint: 'Especially if delivering somewhere other than where you had visits' },
      { id: 'docs-meds', label: 'List of current medications', hint: 'Names, doses, frequencies' },
      { id: 'docs-emergency', label: 'Emergency contacts', hint: 'Written, in case your phone dies' },
      { id: 'docs-pediatrician', label: 'Pediatrician name + contact', hint: 'Some hospitals call them before discharge' },
    ],
  },
];

const TOTAL_ITEMS = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
const KEY = (uid: string) => `womanie_hospital_bag_${uid}`;

const HospitalBagChecklist = ({ weeksPregnant }: HospitalBagChecklistProps) => {
  const { user } = useAuth();
  const [packed, setPacked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    try {
      const raw = localStorage.getItem(KEY(user.id));
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setPacked(new Set(arr));
      }
    } catch {
      // Corrupt JSON — start empty.
    }
  }, [user?.id]);

  const persist = (next: Set<string>) => {
    setPacked(next);
    if (!user) return;
    try {
      localStorage.setItem(KEY(user.id), JSON.stringify(Array.from(next)));
    } catch {
      // Quota / private mode — accept in-memory state.
    }
  };

  const toggle = (itemId: string) => {
    const next = new Set(packed);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    persist(next);
  };

  const reset = () => {
    if (packed.size === 0) return;
    if (!window.confirm('Clear all packed items?')) return;
    persist(new Set());
  };

  const packedCount = packed.size;
  const packedPercent = Math.round((packedCount / TOTAL_ITEMS) * 100);
  const isComplete = packedCount === TOTAL_ITEMS;

  // Recommended pack date is around week 36 — if user is past that and
  // not done, surface a gentle nudge.
  const overdue = weeksPregnant >= 36 && !isComplete;

  const sectionProgress = useMemo(
    () =>
      SECTIONS.map(sec => ({
        ...sec,
        done: sec.items.filter(i => packed.has(i.id)).length,
        total: sec.items.length,
      })),
    [packed]
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Hospital bag
        </h4>
        {isComplete ? (
          <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 dark:text-emerald-300">
            All packed ✓
          </Badge>
        ) : overdue ? (
          <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 dark:text-amber-300">
            Pack by week 36
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            {packedCount} / {TOTAL_ITEMS} packed
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <Progress value={packedPercent} className="h-2" />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{packedPercent}% complete</span>
          {packedCount > 0 && (
            <button onClick={reset} className="inline-flex items-center gap-1 hover:text-foreground">
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {sectionProgress.map(sec => (
          <details key={sec.id} className="border rounded-lg" open={sec.done < sec.total}>
            <summary className="flex items-center justify-between gap-2 p-3 cursor-pointer select-none">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{sec.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {sec.done}/{sec.total}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sec.description}</p>
              </div>
            </summary>
            <ul className="px-3 pb-3 space-y-1.5">
              {sec.items.map(item => {
                const isPacked = packed.has(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggle(item.id)}
                      className={`w-full flex items-start gap-2 p-2 rounded-lg text-left transition-colors ${
                        isPacked
                          ? 'bg-emerald-50/40 dark:bg-emerald-900/10'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      {isPacked ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${isPacked ? 'line-through text-muted-foreground' : ''}`}>
                          {item.label}
                        </p>
                        {item.hint && !isPacked && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{item.hint}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Most providers recommend having the bag fully packed by week 36. Adjust to your
        hospital's specific list — many give one at your 32-week visit.
      </p>
    </Card>
  );
};

export default HospitalBagChecklist;
