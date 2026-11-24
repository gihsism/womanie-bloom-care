import { useEffect, useState } from 'react';
import { Moon } from 'lucide-react';
import {
  getColorSchemePref,
  onColorSchemePrefChange,
  setColorSchemePref,
  type ColorSchemePref,
} from '@/lib/colorScheme';

const OPTIONS: { value: ColorSchemePref; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

// Me -> Appearance: Automatic (follows the phone) · Light · Dark. Stored on
// this device only (src/lib/colorScheme.ts); default Automatic.
export function AppearancePicker() {
  const [pref, setPref] = useState<ColorSchemePref>(getColorSchemePref);
  useEffect(() => onColorSchemePrefChange(setPref), []);

  return (
    <div className="row-group" data-testid="me-appearance">
      <div className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Moon className="h-5 w-5 text-stage-accent flex-shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span id="appearance-label" className="flex-1 text-[17px] font-medium">Appearance</span>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="appearance-label"
          className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-muted p-1"
        >
          {OPTIONS.map((o) => {
            const on = pref === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`appearance-${o.value}`}
                onClick={() => setColorSchemePref(o.value)}
                className={`h-11 rounded-full text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stage-accent ${
                  on ? 'bg-card text-foreground shadow-sm ring-1 ring-line' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[14px] text-muted-foreground">
          {pref === 'auto' ? 'Follows your phone: dark at night if your phone is set to dark.' : 'Saved on this device.'}
        </p>
      </div>
    </div>
  );
}
