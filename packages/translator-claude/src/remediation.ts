/**
 * Whether every change the model failed to make was later put right.
 *
 * This is the rule that decides if a run may be saved, It is small, and it
 * is the most consequential thing in the agent: a failed edit means the change it was making is *missing*
 * from the result, so saving that and stamping it synced hides the loss
 * forever.
 *
 * The subtlety, and the reason this is a type rather than a boolean: a
 * success only answers a failure if it came from a **later turn**. Tool calls
 * batched into one response were composed before the model saw any of their
 * results, so a same-turn success proves nothing about the failure beside it.
 * That applies to a whole-file write as much as to an edit — a file that is
 * complete without the change the edit was attempting is complete and wrong.
 */
export class Remediation {
  #failedAt = -1;

  /** A tool call failed on this turn. */
  failed(turn: number): void {
    this.#failedAt = turn;
  }

  /** A tool call succeeded on this turn. Answers an earlier failure, not a
   *  simultaneous one. */
  succeeded(turn: number): void {
    if (turn > this.#failedAt) this.#failedAt = -1;
  }

  /** Nothing is outstanding — the run's result reflects every change attempted. */
  get settled(): boolean {
    return this.#failedAt === -1;
  }
}

/**
 * What to tell a model whose edit failed.
 *
 * Without a way to say "this file already contains the change", a benign
 * trailing failure leaves the run permanently unsettled: a translation that
 * cannot be saved.
 *
 * It must name a **no-op edit** and never a whole-file tool. A sibling agent's
 * ramp once pointed at a whole-file choice, so a model that had merged five
 * hunks and tripped on the sixth took the advice, discarded all five, and
 * marked the file done. The work was undone by the thing meant to rescue it.
 */
export const CONFIRM_UNCHANGED =
  'If the file already contains this change, confirm it with an edit_file call ' +
  'whose old_string and new_string are both the text exactly as it stands in the file.';
