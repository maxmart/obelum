#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { run } from './cli.js';

// Someone to ask only when there is a terminal on both ends. Piped, in CI or
// in a script, the translator's questions are printed and left unanswered.
const interactive = process.stdin.isTTY && process.stderr.isTTY;

const code = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: line => process.stdout.write(line + '\n'),
  stderr: line => process.stderr.write(line + '\n'),
  stdin: () => new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', () => resolve(data.replace(/\r\n/g, '\n')));
    process.stdin.on('error', reject);
  }),
  ask: interactive
    ? async ({ question, options, guess }) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
          process.stderr.write(`\n? ${question}\n`);
          options.forEach((o, i) => process.stderr.write(`  ${i + 1}. ${o}\n`));
          process.stderr.write(`  (Enter: no answer; it would ${guess.replace(/^./, c => c.toLowerCase())})\n`);
          const answer = (await rl.question('> ')).trim();
          if (!answer) return null;
          const n = Number(answer);
          return Number.isInteger(n) && n >= 1 && n <= options.length ? options[n - 1] : answer;
        } finally {
          rl.close();
        }
      }
    : undefined,
});
process.exit(code);
