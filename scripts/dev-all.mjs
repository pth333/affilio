#!/usr/bin/env node
// Chạy môi trường dev trọn gói: `pnpm dev` hoặc `make dev`.
//
//   1. bật hạ tầng bằng Docker: Postgres + Temporal server + Temporal UI
//   2. chờ Postgres healthy và Temporal mở cổng, rồi chạy migration (idempotent)
//   3. chạy song song API, web và worker; Ctrl+C dừng 3 service của app
//      (Windows dùng taskkill /T vì pnpm và node --watch tạo tiến trình con)
//
// Hạ tầng Docker KHÔNG bị tắt khi thoát để giữ dữ liệu và trạng thái Temporal;
// tắt bằng `make db-down`.
//
// Cờ:
//   --no-infra    không đụng tới Docker (khi Postgres/Temporal đã chạy sẵn ở nơi khác)
//   --no-migrate  bật hạ tầng nhưng không chạy migration
//   --infra-only  chỉ bật hạ tầng + migrate rồi thoát
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPOSE_FILE = 'deploy/docker-compose.dev.yml';
const COMPOSE = ['compose', '-f', COMPOSE_FILE];
const INFRA_SERVICES = ['postgres', 'temporal', 'temporal-ui'];
const DB_SERVICE = 'postgres';
const DB_READY_TIMEOUT_MS = 90_000;
const TEMPORAL_PORT = 7233;
const TEMPORAL_UI_PORT = 8233;
const TEMPORAL_TIMEOUT_MS = 90_000;
const isWindows = process.platform === 'win32';
const API_PORT = Number(process.env.API_PORT ?? 3100);

const flags = new Set(process.argv.slice(2));
const says = (name, message) => console.log(`[${name}] ${message}`);

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  console.error(`! ${message}`);
  process.exit(1);
}

// Windows: pnpm là pnpm.cmd nên buộc phải qua cmd; truyền cả chuỗi lệnh để tránh cảnh báo DEP0190.
// docker là .exe thật nên gọi trực tiếp, không cần shell.

function runDocker(args, { quiet = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: ROOT,
    stdio: quiet ? 'ignore' : 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

function runPnpm(args, { quiet = false } = {}) {
  const options = { cwd: ROOT, stdio: quiet ? 'ignore' : 'inherit', env: process.env };
  const result = isWindows ? spawnSync(`pnpm ${args.join(' ')}`, { ...options, shell: true }) : spawnSync('pnpm', args, options);
  return result.status ?? 1;
}

function spawnPnpmService(script) {
  const options = {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    // NO_COLOR được ưu tiên: đặt FORCE_COLOR sẽ làm Node cảnh báo "NO_COLOR bị bỏ qua".
    env: { ...process.env, ...(useColor && !process.env.FORCE_COLOR ? { FORCE_COLOR: '1' } : {}) },
    detached: !isWindows,
  };
  return isWindows ? spawn(`pnpm run ${script}`, { ...options, shell: true }) : spawn('pnpm', ['run', script], options);
}

/** pg_isready đọc biến môi trường của chính container nên không cần biết user/password ở đây. */
function databaseReady() {
  return runDocker([...COMPOSE, 'exec', '-T', DB_SERVICE, 'sh', '-c', 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'], { quiet: true }) === 0;
}

/** Cổng TCP đã mở chưa (dùng cho healthcheck không có sẵn: Temporal chỉ cần mở 7233 là dùng được). */
function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1500, () => done(false));
  });
}

/** Cổng TCP còn trống không (để báo lỗi rõ thay vì EADDRINUSE trong log của api). */
function portBusy(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen({ port, host: '0.0.0.0', exclusive: true });
  });
}

async function waitFor(name, check, timeoutMs) {
  const startedAt = Date.now();
  process.stdout.write(`[infra] chờ ${name}`);
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      process.stdout.write(` — ok (${Math.round((Date.now() - startedAt) / 1000)}s)\n`);
      return true;
    }
    process.stdout.write('.');
    await sleep(1000);
  }
  process.stdout.write('\n');
  return false;
}

async function startInfra() {
  if (flags.has('--no-infra')) {
    says('infra', 'bỏ qua Docker (--no-infra), dùng hạ tầng đang có sẵn');
    return;
  }
  if (!existsSync(join(ROOT, COMPOSE_FILE))) fail(`không thấy ${COMPOSE_FILE}`);
  if (runDocker(['info'], { quiet: true }) !== 0) {
    fail('Docker chưa chạy — mở Docker Desktop rồi thử lại, hoặc dùng `--no-infra` nếu hạ tầng đã chạy sẵn.');
  }

  says('infra', `bật Docker: ${INFRA_SERVICES.join(', ')}…`);
  if (runDocker([...COMPOSE, 'up', '-d', ...INFRA_SERVICES]) !== 0) {
    fail(`docker compose up thất bại — xem log: docker compose -f ${COMPOSE_FILE} logs`);
  }
  if (!(await waitFor('Postgres', databaseReady, DB_READY_TIMEOUT_MS))) {
    fail(`Postgres không sẵn sàng sau ${DB_READY_TIMEOUT_MS / 1000}s — xem log: docker compose -f ${COMPOSE_FILE} logs ${DB_SERVICE}`);
  }

  const temporalReady = await waitFor(`Temporal (cổng ${TEMPORAL_PORT})`, () => portOpen(TEMPORAL_PORT), TEMPORAL_TIMEOUT_MS);
  const uiReady = await waitFor(`Temporal UI (cổng ${TEMPORAL_UI_PORT})`, () => portOpen(TEMPORAL_UI_PORT), TEMPORAL_TIMEOUT_MS);
  if (!temporalReady || !uiReady) {
    console.warn(`! Temporal chưa sẵn sàng — app vẫn chạy. Xem log: docker compose -f ${COMPOSE_FILE} logs temporal temporal-ui`);
  }

  if (!flags.has('--no-migrate')) {
    says('infra', 'chạy migration…');
    if (runPnpm(['db:migrate']) !== 0) fail('migration lỗi — sửa rồi chạy lại `pnpm db:migrate`');
  }
  says('infra', 'hạ tầng sẵn sàng: Postgres :5432 · Temporal :7233 · UI http://localhost:8233');
}

function stopTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (isWindows) {
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

function startServices() {
  for (const service of SERVICES) {
    const child = spawnPnpmService(service.script);
    children.push({ service, child });

    for (const stream of [child.stdout, child.stderr]) {
      readline.createInterface({ input: stream, crlfDelay: Infinity }).on('line', (line) => process.stdout.write(`${label(service)}${line}\n`));
    }

    child.on('error', (err) => console.error(`${label(service)}không khởi chạy được: ${err.message}`));
    child.on('exit', (code, signal) => {
      if (stopping) return;
      console.log(`${label(service)}đã dừng (${signal ?? code})`);
    });
  }

  console.log('Affilio dev — hạ tầng Docker + 3 service:');
  console.log('  [infra] Postgres :5432 · Temporal :7233 · UI http://localhost:8233');
  for (const service of SERVICES) console.log(`  ${label(service)}${service.hint}`);
  console.log('Ctrl+C để dừng 3 service (hạ tầng Docker vẫn chạy).');
}

if (!existsSync(join(ROOT, '.env'))) {
  console.warn('! Chưa có .env — chép .env.example thành .env trước khi chạy dev.');
}

await startInfra();

if (flags.has('--infra-only')) {
  says('infra', 'xong (--infra-only)');
  process.exit(0);
}

if (await portBusy(API_PORT)) {
  fail(`cổng ${API_PORT} đang bị chiếm (api đã chạy sẵn?) — tắt tiến trình đó rồi chạy lại, hoặc đổi API_PORT trong .env`);
}

startServices();

process.on('SIGINT', () => stopAll(130));
process.on('SIGTERM', () => stopAll(143));
process.on('exit', () => {
  for (const { child } of children) stopTree(child);
});
