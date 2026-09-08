/**
 * The repository, through plain git.
 *
 * Reads come from HEAD's tree, not the working directory: the committed
 * state is what the copies describe, and a verb is a commit. `git ls-tree`
 * once gives every path's blob id; contents come through one long-lived
 * `git cat-file --batch`, cached by id, so a copy that equals its real file
 * is read once. Writes go to the working directory and are committed by
 * path, so an uncommitted change elsewhere is left where it was.
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

  /** Write into the working directory. The commit picks it up by path. */
  write(p: string, content: string): void {
    const full = path.join(this.root, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }

  /** The working-directory content, or null. Used to take a hand edit in. */
  readWorking(p: string): string | null {
    const full = path.join(this.root, p);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  }

  /** Commit exactly these paths as they stand in the working directory. */
  commit(message: string, paths: string[]): void {
    if (paths.length === 0) return;
    execFileSync('git', ['add', '--', ...paths], { cwd: this.root, stdio: 'pipe' });
    execFileSync('git', ['commit', '-q', '-m', message, '--', ...paths], { cwd: this.root, stdio: 'pipe' });
    this.refresh();
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
