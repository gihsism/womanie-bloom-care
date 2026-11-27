import { useState } from 'react';

/**
 * True from the first time `value` is true, and stays true. Lets a page
 * mount a lazily-loaded dialog only once she first opens it (so its code,
 * e.g. the date picker, isn't downloaded with the page) and then keep it
 * mounted, so closing still animates exactly as before.
 */
export function useOnceTrue(value: boolean): boolean {
  const [seen, setSeen] = useState(value);
  if (value && !seen) setSeen(true);
  return seen || value;
}
