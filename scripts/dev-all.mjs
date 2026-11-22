#!/usr/bin/env node
// Chạy song song API, web và worker cho môi trường dev: `pnpm dev` hoặc `make dev`.
// Log 3 service được gộp chung với tiền tố màu; Ctrl+C dừng cả cây tiến trình
// (Windows dùng taskkill /T vì pnpm và node --watch tạo tiến trình con).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SERVICES = [
  { name: 'api', script: 'dev:api', color: 31, hint: 'http://127.0.0.1:3100' },
  { name: 'web', script: 'dev:web', color: 36, hint: 'http://localhost:3001' },
  { name: 'worker', script: 'dev:worker', color: 33, hint: 'hàng đợi llm/render' },
];

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const label = (service) => (useColor ? `\x1b[${service.color}m[${service.name}]\x1b[0m ` : `[${service.name}] `);

/** @type {{ service: (typeof SERVICES)[number]; child: import('node:child_process').ChildProcess }[]} */
const children = [];
let stopping = false;

function stopTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children) stopTree(child);
  process.exit(code);
}

if (!existsSync(`${ROOT}.env`)) {
  console.warn('! Chưa có .env — chép .env.example thành .env rồi chạy `pnpm db:up` trước.');
}

for (const service of SERVICES) {
  const child = spawn('pnpm', ['run', service.script], {
    cwd: ROOT,
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? '1' },
  });
  children.push({ service, child });

  for (const stream of [child.stdout, child.stderr]) {
    readline
      .createInterface({ input: stream, crlfDelay: Infinity })
      .on('line', (line) => process.stdout.write(`${label(service)}${line}\n`));
  }

  child.on('error', (err) => console.error(`${label(service)}không khởi chạy được: ${err.message}`));
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.log(`${label(service)}đã dừng (${signal ?? code})`);
  });
}

console.log('Affilio dev — đang chạy 3 service:');
for (const service of SERVICES) console.log(`  ${label(service)}${service.hint}`);
console.log('Ctrl+C để dừng cả 3.');

process.on('SIGINT', () => stopAll(130));
process.on('SIGTERM', () => stopAll(143));
process.on('exit', () => {
  for (const { child } of children) stopTree(child);
});
