import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Tile } from '@/lib/quickLog/tiles';

// A two-option tile (Sex: protected / not; LH test: positive / negative):
// one more tap on a big button, then it logs like any other tile.

export default function ChoiceSheet({ tile, onPick, onClose }: {
  tile: Tile | null;
  onPick: (tile: Tile, option: { label: string; value: string }) => void;
  onClose: () => void;
}) {
  const a = tile?.action.kind === 'choice' ? tile.action : null;
  return (
    <Sheet open={!!a} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="text-[22px] font-extrabold">{a?.label}</SheetTitle>
          <SheetDescription className="sr-only">Pick one to log it for today.</SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3">
          {a?.options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { if (tile) onPick(tile, o); }}
              className="h-16 rounded-2xl bg-stage-tint text-[18px] font-bold hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent"
            >
              {o.label}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
