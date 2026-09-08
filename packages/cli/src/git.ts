/**
 * The repository, through plain git.
 *
 * Reads come from HEAD's tree, not the working directory: the committed
 * state is what the copies describe, and a verb is a commit. `git ls-tree`
 * once gives every path's blob id; contents come through one long-lived
 * `git cat-file --batch`, cached by id, so a copy that equals its real file
 * is read once. Writes become blobs and a commit on top of HEAD without
 * passing through the working directory or the index, so nothing the user
 * has staged or edited is touched, and a sparse checkout that leaves
 * `.obelum/` off disk works as it is.
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export class Git {
  readonly root: string;
  private tree = new Map<string, string>();
  private blobs = new Map<string, string>();
  private batch: ReturnType<typeof spawn> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(root: string) {
    this.root = root;
  }

  static open(dir = process.cwd()): Git {
    let root: string;
    try {
      root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' }).trim();
    } catch {
      throw new Error(`${dir} is not inside a git repository`);
    }
    const git = new Git(root);
    git.refresh();
    return git;
  }

  /** Re-read HEAD's tree; after a commit. */
  refresh(): void {
    this.tree = new Map();
    let out: string;
    try {
      out = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD'], { cwd: this.root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch {
      return; // no commits yet
    }
    for (const entry of out.split('\0')) {
      if (!entry) continue;
      const tab = entry.indexOf('\t');
      const [, , oid] = entry.slice(0, tab).split(' ');
      this.tree.set(entry.slice(tab + 1), oid);
    }
  }

  /** Every path in HEAD. */
  paths(): string[] {
    return [...this.tree.keys()];
  }

  has(p: string): boolean {
    return this.tree.has(p);
  }

  oid(p: string): string | undefined {
    return this.tree.get(p);
  }

  /** The content at HEAD, or null when the path is not there. CRLF is
   *  normalised: staleness compares bytes, and copies must agree on them. */
  async read(p: string): Promise<string | null> {
    const oid = this.tree.get(p);
    if (!oid) return null;
    const cached = this.blobs.get(oid);
    if (cached !== undefined) return cached;
    const content = (await this.catFile(oid)).replace(/\r\n/g, '\n');
    this.blobs.set(oid, content);
    return content;
  }

  private catFile(oid: string): Promise<string> {
    const run = async () => {
      if (!this.batch) {
        this.batch = spawn('git', ['cat-file', '--batch'], { cwd: this.root, stdio: ['pipe', 'pipe', 'inherit'] });
        this.batch.stdout!.setEncoding('utf8');
      }
      const proc = this.batch;
      return new Promise<string>((resolve, reject) => {
        let buf = '';
        let want = -1;
        let headerLen = 0;
        const onData = (chunk: string) => {
          buf += chunk;
          if (want < 0) {
            const nl = buf.indexOf('\n');
            if (nl < 0) return;
            const header = buf.slice(0, nl);
            if (header.endsWith(' missing')) { cleanup(); reject(new Error(`git: no object ${oid}`)); return; }
            want = Number(header.split(' ')[2]);
            headerLen = nl + 1;
          }
          // Byte length, not string length: count what git said it would send.
          if (Buffer.byteLength(buf.slice(headerLen), 'utf8') >= want + 1) {
            cleanup();
            const body = Buffer.from(buf.slice(headerLen), 'utf8').subarray(0, want).toString('utf8');
            resolve(body);
          }
        };
        const cleanup = () => proc.stdout!.off('data', onData);
        proc.stdout!.on('data', onData);
        proc.stdin!.write(oid + '\n');
      });
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }

  /** The working-directory content, or null. Used to take a hand edit in. */
  readWorking(p: string): string | null {
    const full = path.join(this.root, p);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  }

  /**
   * Commit exactly these files, on top of HEAD, through objects: each
   * content becomes a blob, a temporary index holds HEAD's tree plus these
   * entries, and the resulting tree is committed and HEAD moved. The
   * repository's own index and working directory are then brought up to
   * date for these paths only, so whatever else the user has staged or
   * edited is left exactly as it was.
   *
   * A path that is not checked out — the copies, under a sparse checkout
   * that excludes `.obelum/` — gets an index entry with skip-worktree and
   * nothing on disk. The rule: copies go to disk when `.obelum/` is checked
   * out; real files always do.
   */
  commit(message: string, files: Map<string, string>): void {
    if (files.size === 0) return;
    const oids = new Map<string, string>();
    for (const [p, content] of files) {
      oids.set(p, execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: this.root, input: content, encoding: 'utf8' }).trim());
    }
    const tmp = path.join(this.root, '.git', `obelum-index-${process.pid}`);
    const env = { ...process.env, GIT_INDEX_FILE: tmp };
    try {
      const head = this.headOid();
      if (head) execFileSync('git', ['read-tree', 'HEAD'], { cwd: this.root, env, stdio: 'pipe' });
      else execFileSync('git', ['read-tree', '--empty'], { cwd: this.root, env, stdio: 'pipe' });
      for (const [p, oid] of oids) {
        execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${oid},${p}`], { cwd: this.root, env, stdio: 'pipe' });
      }
      const tree = execFileSync('git', ['write-tree'], { cwd: this.root, env, encoding: 'utf8' }).trim();
      const commit = execFileSync('git', ['commit-tree', tree, ...(head ? ['-p', head] : []), '-m', message], { cwd: this.root, encoding: 'utf8' }).trim();
      execFileSync('git', ['update-ref', 'HEAD', commit], { cwd: this.root, stdio: 'pipe' });
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    const copiesOnDisk = this.copiesCheckedOut();
    for (const [p, content] of files) {
      const oid = oids.get(p)!;
      execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${oid},${p}`], { cwd: this.root, stdio: 'pipe' });
      if (p.startsWith('.obelum/') && !copiesOnDisk) {
        execFileSync('git', ['update-index', '--skip-worktree', '--', p], { cwd: this.root, stdio: 'pipe' });
        continue;
      }
      const full = path.join(this.root, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    this.refresh();
  }

  private headOid(): string | null {
    try {
      return execFileSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: this.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch {
      return null;
    }
  }

  /** Whether `.obelum/` is part of this checkout: its index entries are not
   *  skip-worktree, or there are none yet and the checkout is not sparse. */
  private copiesCheckedOut(): boolean {
    let flags: string;
    try {
      flags = execFileSync('git', ['ls-files', '-t', '--', '.obelum'], { cwd: this.root, encoding: 'utf8' });
    } catch {
      flags = '';
    }
    const entries = flags.split('\n').filter(Boolean);
    if (entries.length > 0) return entries.some(l => l.startsWith('H '));
    try {
      return execFileSync('git', ['config', '--get', 'core.sparseCheckout'], { cwd: this.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== 'true';
    } catch {
      return true;
    }
  }

  /** `git log` of merge commits: hash and parents. */
  merges(limit: number): { hash: string; parents: string[] }[] {
    let out: string;
    try {
      out = execFileSync('git', ['log', '--merges', `-n${limit}`, '--format=%H %P'], { cwd: this.root, encoding: 'utf8' });
    } catch {
      return [];
    }
    return out.split('\n').filter(Boolean).map(line => {
      const [hash, ...parents] = line.split(' ');
      return { hash, parents };
    });
  }

  /** A path's blob id in another commit, or undefined. */
  oidAt(commit: string, p: string): string | undefined {
    try {
      const out = execFileSync('git', ['ls-tree', commit, '--', p], { cwd: this.root, encoding: 'utf8' }).trim();
      return out ? out.split('\t')[0].split(' ')[2] : undefined;
    } catch {
      return undefined;
    }
  }

  /** End the cat-file process. Awaited, so the repository directory is
   *  free by the time a caller removes it. */
  close(): Promise<void> {
    const proc = this.batch;
    this.batch = null;
    if (!proc) return Promise.resolve();
    return new Promise(resolve => {
      proc.once('exit', () => resolve());
      proc.stdin?.end();
      setTimeout(() => proc.kill(), 200).unref();
    });
  }
}
