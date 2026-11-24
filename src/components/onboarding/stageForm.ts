// Props every stage form gets from ModeSetup. Each form asks two
// questions, one per screen: part 0 = screen 2, part 1 = screen 3.
// A form saves its first answers when moving on (so a reload of screen 3
// keeps them) and everything again on finish, with the same rules for
// "can continue" as the old one-page form.
export interface StageFormProps {
  part: 0 | 1;
  onNext: () => void;
  onBack: () => void;
  onFinish: () => void;
}

/** Cycle lengths offered (days), as before: 21 to 45. */
export const CYCLE_LENGTHS = Array.from({ length: 25 }, (_, i) => i + 21);
