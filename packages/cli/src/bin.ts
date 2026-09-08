#!/usr/bin/env node
import { run } from './cli.js';

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
});
process.exit(code);
