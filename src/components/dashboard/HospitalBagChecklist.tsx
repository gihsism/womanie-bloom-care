import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle2, Circle, Briefcase, RotateCcw, Plus, X, Pencil } from 'lucide-react';
import { pushAccountData, useAccountDataVersion } from '@/lib/account-data';
import {
  addCustomItem, bagProgress, BAG_SECTIONS, clearPacked, EMPTY_BAG, parseBagState, removeItem,
  restoreDefaults, toggleItem, visibleItems, type BagSectionId, type BagState,
} from '@/lib/hospitalBag';

// Hospital bag checklist for late pregnancy (week 32+), Swiss context:
// insurance card, Familienbüchlein / civil-status papers, pregnancy record.
// Editable: she can add her own items and remove ones she doesn't need.
// The list lives in src/lib/hospitalBag.ts; state is synced to the
// account (womanie_hospital_bag_{uid}).

interface HospitalBagChecklistProps {
  weeksPregnant: number;
}

const KEY = (uid: string) => `womanie_hospital_bag_${uid}`;

const HospitalBagChecklist = ({ weeksPregnant }: HospitalBagChecklistProps) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState<BagState>(EMPTY_BAG);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<BagSectionId, string>>>({});

  const accountVersion = useAccountDataVersion([userId ? KEY(userId) : null]);
  useEffect(() => {
    if (!userId) return;
    try {
      setState(parseBagState(localStorage.getItem(KEY(userId))));
    } catch {
      setState(EMPTY_BAG);
    }
  }, [userId, accountVersion]);

  const persist = (next: BagState) => {
    setState(next);
    if (!userId) return;
    try {
      localStorage.setItem(KEY(userId), JSON.stringify(next));
      pushAccountData(userId, KEY(userId));
    } catch {
      // Quota / private mode — accept in-memory state.
    }
  };

  const reset = () => {
    if (state.packed.length === 0) return;
    if (!window.confirm('Untick all packed items?')) return;
    persist(clearPacked(state));
  };

  const addItem = (section: BagSectionId) => {
    const label = drafts[section] ?? '';
    if (!label.trim()) return;
    persist(addCustomItem(state, section, label, crypto.randomUUID()));
    setDrafts(d => ({ ...d, [section]: '' }));
  };

  const progress = bagProgress(state);
  const isComplete = progress.total > 0 && progress.packed === progress.total;
  const overdue = weeksPregnant >= 36 && !isComplete;
  const packedSet = useMemo(() => new Set(state.packed), [state.packed]);

  const sections = useMemo(() => {
    const items = visibleItems(state);
    return BAG_SECTIONS.map(sec => {
      const list = items.filter(i => i.section === sec.id);
      return { ...sec, items: list, done: list.filter(i => packedSet.has(i.id)).length };
    });
  }, [state, packedSet]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" />
          Hospital bag
        </h4>
        {isComplete ? (
          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
            All packed
          </Badge>
        ) : overdue ? (
          <Badge variant="outline" className="text-[10px] border-foreground/30 text-foreground/80">
            Pack by week 36
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            {progress.packed} / {progress.total} packed
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <Progress value={progress.percent} className="h-2" />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{progress.percent}% complete</span>
          <span className="flex items-center gap-3">
            <button onClick={() => setEditing(e => !e)} className="inline-flex items-center gap-1 hover:text-foreground">
              <Pencil className="h-3 w-3" />
              {editing ? 'Done editing' : 'Edit list'}
            </button>
            {state.packed.length > 0 && (
              <button onClick={reset} className="inline-flex items-center gap-1 hover:text-foreground">
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            )}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {sections.map(sec => (
          <details key={sec.id} className="border rounded-lg" open={editing || sec.done < sec.items.length}>
            <summary className="flex items-center justify-between gap-2 p-3 cursor-pointer select-none">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{sec.title}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {sec.done}/{sec.items.length}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{sec.description}</p>
              </div>
            </summary>
            <ul className="px-3 pb-3 space-y-1.5">
              {sec.items.map(item => {
                const isPacked = packedSet.has(item.id);
                return (
                  <li key={item.id} className="flex items-start gap-1">
                    <button
                      type="button"
                      onClick={() => persist(toggleItem(state, item.id))}
                      className={`flex-1 flex items-start gap-2 p-2 rounded-lg text-left transition-colors ${
                        isPacked ? 'bg-primary/5' : 'hover:bg-muted/40'
                      }`}
                    >
                      {isPacked ? (
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
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
                    {editing && (
                      <button
                        type="button"
                        onClick={() => persist(removeItem(state, item.id))}
                        className="p-2 text-muted-foreground/70 hover:text-destructive"
                        aria-label={`Remove ${item.label}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
              {editing && (
                <li>
                  <form
                    className="flex items-center gap-2 pt-1"
                    onSubmit={e => { e.preventDefault(); addItem(sec.id); }}
                  >
                    <Input
                      value={drafts[sec.id] ?? ''}
                      onChange={e => setDrafts(d => ({ ...d, [sec.id]: e.target.value }))}
                      placeholder="Add your own item"
                      maxLength={120}
                      className="h-9 text-sm"
                      aria-label={`Add an item to ${sec.title}`}
                    />
                    <Button type="submit" size="sm" variant="outline" className="gap-1" disabled={!(drafts[sec.id] ?? '').trim()}>
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </form>
                </li>
              )}
            </ul>
          </details>
        ))}
      </div>

      {editing && state.hidden.length > 0 && (
        <button
          type="button"
          onClick={() => persist(restoreDefaults(state))}
          className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Bring back {state.hidden.length} removed suggestion{state.hidden.length === 1 ? '' : 's'}
        </button>
      )}

      <p className="text-[11px] text-muted-foreground text-center">
        Have the bag ready by week 36. Your hospital or birth centre may give you its own list,
        often at the registration visit; add anything it asks for.
      </p>
    </Card>
  );
};

export default HospitalBagChecklist;
