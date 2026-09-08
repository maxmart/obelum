/**
 * An in-memory host for the traces: a tree of paths, a commit graph with
 * branches, and git's three-way merge modelled over node-diff3 (which is
 * what isomorphic-git merges with, so the model is the browser host's git).
 *
 * The document over it is the five lines §9h says a host writes. `commit` also
 * checks core's invariant: the files a verb names as written are exactly
 * the paths that changed since the last commit.
 */
import { merge as diff3 } from 'node-diff3';
import { obelum, type Document, type Session, type File } from '../index.js';

export type Tree = Map<string, string>;

export interface Commit {
  id: number;
  message: string;
  tree: Tree;
  parents: Commit[];
}

export class Repo {
  tree: Tree = new Map();
  head!: Commit;
  branches = new Map<string, Commit>();
  current = 'main';
  /** Paths left unresolved by the last merge; commit refuses while any remain. */
  conflicts: string[] = [];
  private nextId = 1;

  constructor() {
    this.commitTree('init', []);
  }

  private commitTree(message: string, parents: Commit[]): Commit {
    const c: Commit = { id: this.nextId++, message, tree: new Map(this.tree), parents };
    this.head = c;
    this.branches.set(this.current, c);
    return c;
  }

  commit(message: string): Commit {
    if (this.conflicts.length) throw new Error(`unresolved conflicts: ${this.conflicts.join(', ')}`);
    const c = this.commitTree(message, [this.head, ...(this.pendingParents)]);
    this.pendingParents = [];
    return c;
  }
  private pendingParents: Commit[] = [];

  branch(name: string): void {
    this.branches.set(name, this.head);
    this.checkout(name);
  }

  checkout(name: string): void {
    const c = this.branches.get(name);
    if (!c) throw new Error(`no branch ${name}`);
    this.current = name;
    this.head = c;
    this.tree = new Map(c.tree);
    this.conflicts = [];
  }

  show(commit: Commit, path: string): string | null {
    return commit.tree.get(path) ?? null;
  }

  mergeBase(a: Commit, b: Commit): Commit {
    const seen = new Set<number>();
    const stack = [a];
    while (stack.length) { const c = stack.pop()!; if (seen.has(c.id)) continue; seen.add(c.id); stack.push(...c.parents); }
    const queue = [b];
    const visited = new Set<number>();
    while (queue.length) {
      const c = queue.shift()!;
      if (seen.has(c.id)) return c;
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      queue.push(...c.parents);
    }
    throw new Error('no merge base');
  }

  /** Three-way merge `theirs` into the working tree. Conflicting paths are
   *  left as they were and listed in `conflicts`; a clean merge commits. */
  merge(name: string, message = `merge ${name}`): { clean: boolean; conflicts: string[] } {
    const theirs = this.branches.get(name)!;
    const base = this.mergeBase(this.head, theirs);
    this.conflicts = mergeTrees(this.tree, base.tree, theirs.tree);
    this.pendingParents = [theirs];
    if (!this.conflicts.length) this.commit(message);
    return { clean: !this.conflicts.length, conflicts: [...this.conflicts] };
  }

  /** `git checkout --ours|--theirs -- <prefix>` for every conflicted path under prefix. */
  resolve(side: 'ours' | 'theirs', prefix: string, theirsBranch: string): void {
    const theirs = this.branches.get(theirsBranch)!;
    for (const p of [...this.conflicts]) {
      if (!p.startsWith(prefix)) continue;
      const v = side === 'ours' ? this.head.tree.get(p) : theirs.tree.get(p);
      if (v === undefined) this.tree.delete(p); else this.tree.set(p, v);
      this.conflicts = this.conflicts.filter(q => q !== p);
    }
  }

  /** `git revert <commit>`: merge the change commit → parent into the tree. */
  revert(c: Commit): Commit {
    const conflicts = mergeTrees(this.tree, c.tree, c.parents[0].tree);
    if (conflicts.length) throw new Error(`revert conflicts: ${conflicts.join(', ')}`);
    return this.commit(`revert ${c.message}`);
  }

  /** `git merge --squash <name>; git commit`: same tree, one parent. */
  squash(name: string): Commit {
    const theirs = this.branches.get(name)!;
    const base = this.mergeBase(this.head, theirs);
    const conflicts = mergeTrees(this.tree, base.tree, theirs.tree);
    if (conflicts.length) throw new Error(`squash conflicts: ${conflicts.join(', ')}`);
    return this.commit(`squash ${name}`);
  }

  /** `git rebase <onto>`: replay this branch's commits since the base onto `onto`. */
  rebase(onto: string): void {
    const target = this.branches.get(onto)!;
    const base = this.mergeBase(this.head, target);
    const replay: Commit[] = [];
    for (let c = this.head; c !== base; c = c.parents[0]) replay.unshift(c);
    const branch = this.current;
    this.tree = new Map(target.tree);
    this.head = target;
    for (const c of replay) {
      const conflicts = mergeTrees(this.tree, c.parents[0].tree, c.tree);
      if (conflicts.length) throw new Error(`rebase conflicts: ${conflicts.join(', ')}`);
      this.current = branch;
      this.commit(c.message);
    }
  }
}

/** git's merge of three trees into `ours` in place; returns the conflicting paths. */
function mergeTrees(ours: Tree, base: Tree, theirs: Tree): string[] {
  const conflicts: string[] = [];
  for (const p of new Set([...ours.keys(), ...base.keys(), ...theirs.keys()])) {
    const o = ours.get(p), b = base.get(p), t = theirs.get(p);
    if (o === t || t === b) continue;
    if (o === b) { if (t === undefined) ours.delete(p); else ours.set(p, t); continue; }
    if (o === undefined || t === undefined || b === undefined) { conflicts.push(p); continue; }
    const r = diff3(o.split('\n'), b.split('\n'), t.split('\n'), { excludeFalseConflicts: true });
    if (r.conflict) conflicts.push(p); else ours.set(p, r.result.join('\n'));
  }
  return conflicts.sort();
}

// ---------------------------------------------------------------------------
// The document, and a session over it
// ---------------------------------------------------------------------------

export const LANGS = ['sv', 'no', 'en'] as const;
export const real = (lang: string, f = 'pricing.mdx') => `pages/${lang}/${f}`;
export const copy = (viewer: string, viewed: string, f = 'pricing.mdx') => `pages/.obelum/${viewer}/${viewed}/${f}`;

export interface Lab {
  repo: Repo;
  session: Session;
  /** Every commit a verb made, with the paths its writes staged. */
  commits: { message: string; paths: string[] }[];
  open(f: string): Session;
}

export function lab(langs: readonly string[] = LANGS): Lab {
  const repo = new Repo();
  const commits: Lab['commits'] = [];
  /** What `write` staged since the last commit, as `git add` would. */
  let staged = new Set<string>();
  const file = (path: string): File => ({
    read: () => repo.tree.get(path) ?? null,
    write: content => { repo.tree.set(path, content); staged.add(path); },
  });
  const open = (f: string) => {
    const document: Document = {
      langs,
      file: lang => file(`pages/${lang}/${f}`),
      synced: viewer => ({ file: lang => file(`pages/.obelum/${viewer}/${lang}/${f}`) }),
      commit: (verb, lang) => {
        const message = `${verb} ${lang}`;
        // Core's invariant: a verb writes only what changed, so what it
        // staged is exactly the diff between this commit and the last.
        const paths = [...staged].sort();
        const changed = [...new Set([...repo.tree.keys(), ...repo.head.tree.keys()])]
          .filter(p => repo.tree.get(p) !== repo.head.tree.get(p)).sort();
        if (changed.join() !== paths.join()) {
          throw new Error(`"${message}" staged [${paths}] but the tree changed at [${changed}]`);
        }
        commits.push({ message, paths });
        staged = new Set();
        repo.commit(message);
      },
    };
    return obelum(document);
  };
  return { repo, session: open('pricing.mdx'), commits, open };
}

/** `printf 'Pricing (%s)\nline A\n...\n'`: the traces' document shape. */
export const page = (lang: string, ...lines: string[]) => [`Pricing (${lang})`, ...lines].join('\n') + '\n';
export const ABC = ['line A', 'line B', 'line C'];

/** Three languages, all in sync, one commit: the traces' `fresh`. */
export function fresh(): Lab {
  const l = lab();
  for (const L of LANGS) l.repo.tree.set(real(L), page(L, ...ABC));
  for (const V of LANGS) for (const S of LANGS) l.repo.tree.set(copy(V, S), page(S, ...ABC));
  l.repo.commit('initial, all in sync');
  return l;
}

/** The matrix the traces print: per viewer, `no:STALE en:ok`. */
export async function matrix(session: Session): Promise<Record<string, string>> {
  const s = await session.stale();
  const out: Record<string, string> = {};
  for (const L of session.langs) {
    out[L] = session.langs.filter(V => V !== L).map(V => `${V}:${s[L].stale.includes(V) ? 'STALE' : 'ok'}`).join(' ');
  }
  return out;
}

export const ALL_OK = { sv: 'no:ok en:ok', no: 'sv:ok en:ok', en: 'sv:ok no:ok' };

/** The brief's diff for `viewer` from `viewed`; '' when in sync. */
export async function evidence(session: Session, viewer: string, viewed: string): Promise<string> {
  const b = await session.brief(viewer);
  return b.langDiffs.find(d => d.lang === viewed)?.diff ?? '';
}
