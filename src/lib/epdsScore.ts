// EPDS scoring. The screener lists every item's four options from the
// best answer to the worst ("No, never" ... "Yes, most of the time"),
// so an answer's score is simply its position: 0 for the first option,
// 3 for the last. (The paper form prints items 3 and 5-10 worst-first and
// scores them 3..0 top to bottom; with best-first ordering that reversal
// must NOT be applied again, or "Never" on item 10 scores 3 and every
// calm answer reads as "likely depression · item 10 flagged".)

export interface EpdsScore {
  total: number;
  /** Item 10 (thoughts of self-harm) answered above "Never". */
  flaggedItem10: boolean;
}

/** Score of one answer, given its option position 0..3 (best..worst). */
export function epdsItemScore(optionIndex: number): number {
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return 0;
  return Math.min(optionIndex, 3);
}

/** Total 0..30 and the item-10 flag from the ten answer positions. */
export function scoreEpds(answers: readonly number[]): EpdsScore {
  const total = answers.slice(0, 10).reduce((sum, a) => sum + epdsItemScore(a), 0);
  return { total, flaggedItem10: epdsItemScore(answers[9]) > 0 };
}
