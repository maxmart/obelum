/**
 * A document's place in the vector clock: its own revision, and the revision
 * it last incorporated from each sibling language.
 *
 * The engine's central value, and deliberately declared here rather than
 * beside the code that reads it out of YAML frontmatter. Where the clock is
 * *stored* is the document layer's business; what it means is this one's.
 *
 * This file used to hold more: the agent's parameters and event stream, and
 * four UI shapes describing a task list on screen. None of them had anything
 * to do with a vector clock. They were here because this was the directory
 * with "translation" in the name, and they made the module's own claim —
 * four files, no imports, liftable as it stands — quietly untrue, since
 * lifting it would have taken a React log reducer along.
 */
export interface SyncMeta {
  rev: number;
  synced: Record<string, number>;
}
