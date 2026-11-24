import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Check, type LucideIcon } from 'lucide-react';
import type { LifeStage } from '@/components/dashboard/DashboardHeader';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// Big tappable answers for the first-run screens (idea 4). A choice can
// carry its own life stage (data-stage), so the stage picker shows every
// stage in its own colour before anything is picked.

/** Shared look of text inputs and select triggers on these screens. */
export const FIELD = 'h-12 rounded-full px-5 text-[16px] md:text-[16px]';

export function ChoiceGroup({ label, multi, children, className }: { label: string; multi?: boolean; children: ReactNode; className?: string }) {
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label={label} className={cn('space-y-2.5', className)}>
      {children}
    </div>
  );
}

interface ChoiceProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  stage?: LifeStage;
  multi?: boolean;
}

export function Choice({ selected, onSelect, title, description, icon: Icon, stage, multi }: ChoiceProps) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      data-stage={stage}
      onClick={onSelect}
      className={cn(
        'w-full min-h-16 flex items-center gap-3.5 rounded-[1.25rem] border px-4 py-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent',
        selected ? 'border-stage-accent bg-stage-tint ring-1 ring-stage-accent' : 'border-line bg-card hover:bg-muted/60',
      )}
    >
      {Icon && (
        <span className="grid place-items-center h-11 w-11 shrink-0 rounded-full bg-stage-head text-stage-ink" aria-hidden="true">
          <Icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-bold leading-snug text-foreground">{title}</span>
        {description && <span className="block mt-0.5 text-[14px] leading-snug text-muted-foreground">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'grid place-items-center h-6 w-6 shrink-0 border-2',
          multi ? 'rounded-md' : 'rounded-full',
          selected ? 'border-stage-accent bg-stage-accent text-stage-on' : 'border-input bg-background',
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Short multi-select answers ("Sleep", "Mood") as pills that wrap. */
export function Chip({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 min-h-11 rounded-full border px-4 text-[15px] font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent',
        selected ? 'border-stage-accent bg-stage-tint text-stage-ink' : 'border-line bg-card text-foreground hover:bg-muted/60',
      )}
    >
      {selected && <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function FieldLabel({ htmlFor, children, optional }: { htmlFor?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-[15px] font-semibold text-foreground mb-2">
      {children}
      {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
    </label>
  );
}

/** A date answer: one big button that opens the calendar. */
export function DateField({ value, onChange, disabled, label, placeholder = 'Pick a date', captionDropdowns }: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  disabled?: (d: Date) => boolean;
  label: string;
  placeholder?: string;
  captionDropdowns?: { fromYear: number; toYear: number };
}) {
  const shown = value ? new Date(value) : undefined; // the onboarding cache hands back strings
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={shown ? `${label}: ${format(shown, 'd MMMM yyyy')}` : label}
          className={cn(
            'w-full h-14 flex items-center gap-3 rounded-[1.25rem] border border-input bg-background px-4 text-left text-[17px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent',
            shown ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="h-5 w-5 text-stage-accent shrink-0" aria-hidden="true" />
          {shown ? format(shown, 'EEEE, d MMMM yyyy') : placeholder}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={shown}
          defaultMonth={shown}
          onSelect={onChange}
          disabled={disabled}
          initialFocus
          {...(captionDropdowns ? { captionLayout: 'dropdown-buttons' as const, ...captionDropdowns } : {})}
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
