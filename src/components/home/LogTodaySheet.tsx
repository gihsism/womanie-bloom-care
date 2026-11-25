import { ChevronRight } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Tile } from '@/lib/quickLog/tiles';
import type { Badge } from '@/lib/quickLog/state';
import TileGrid from './TileGrid';

// Round 6: the one-tap tiles moved off Home into this sheet, behind the
// page's one action ("Log today"). Tap a tile = saved (the sheet closes
// and Home shows it under Today, with Undo). Hold = details.

export interface LogTodaySheetProps {
  open: boolean;
  onClose: () => void;
  tiles: Tile[];
  badges: Record<string, Badge>;
  busyId: string | null;
  onTap: (t: Tile) => void;
  onDetails: (t: Tile) => void;
  /** The full form: a note, several symptoms, flow, sleep… */
  onMore: () => void;
}

export default function LogTodaySheet({ open, onClose, tiles, badges, busyId, onTap, onDetails, onMore }: LogTodaySheetProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[90dvh] overflow-y-auto">
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="text-[22px] font-extrabold">Log today</SheetTitle>
          <SheetDescription className="text-[15px]">One tap saves it. Hold a tile for details.</SheetDescription>
        </SheetHeader>
        <TileGrid tiles={tiles} badges={badges} busyId={busyId} onTap={onTap} onDetails={onDetails} />
        <button
          type="button"
          onClick={onMore}
          className="mt-3 w-full flex items-center gap-3 min-h-12 px-1 text-left text-[17px] font-semibold text-stage-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent rounded-xl"
        >
          <span className="flex-1">Add more detail or a note</span>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </SheetContent>
    </Sheet>
  );
}
