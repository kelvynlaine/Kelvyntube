#!/usr/bin/env node
/**
 * Lance l'ensemble de la stack de développement :
 *   - API Fastify        (http://localhost:4000)
 *   - Workers BullMQ     (transcodage, notifications, analytics…)
 *   - Frontend Next.js   (http://localhost:3000)
 *
 * Vérifie d'abord que l'infrastructure Docker répond.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const SERVICES = [
  { name: 'PostgreSQL', host: 'localhost', port: 5433 },
  { name: 'Redis', host: 'localhost', port: 6380 },
  { name: 'MinIO', host: 'localhost', port: 9000 },
  { name: 'Meilisearch', host: 'localhost', port: 7700 },
];

const COLORS = {
  api: '\x1b[36m', // cyan
  worker: '\x1b[35m', // magenta
  web: '\x1b[32m', // vert
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

function checkPort({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1200);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function checkInfra() {
  const results = await Promise.all(
    SERVICES.map(async (s) => ({ ...s, up: await checkPort(s) })),
  );
  const down = results.filter((r) => !r.up);
  for (const r of results) {
    console.log(`  ${r.up ? '✅' : '❌'} ${r.name} (:${r.port})`);
  }
  if (down.length) {
    console.log(
      `\n${COLORS.yellow}⚠️  Services manquants : ${down.map((d) => d.name).join(', ')}${COLORS.reset}`,
    );
    console.log(`   Démarre l'infrastructure avec :  ${COLORS.dim}npm run infra:up${COLORS.reset}\n`);
    if (down.some((d) => d.name === 'PostgreSQL' || d.name === 'Redis')) {
      console.log(`${COLORS.red}PostgreSQL et Redis sont indispensables. Arrêt.${COLORS.reset}`);
      process.exit(1);
    }
  }
}

function run(label, args) {
  const color = COLORS[label] ?? '';
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });

  const pipe = (stream, isError) => {
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        process.stdout.write(
          `${color}[${label}]${COLORS.reset} ${isError ? COLORS.red : ''}${line}${COLORS.reset}\n`,
        );
      }
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on('exit', (code) => {
    console.log(`${color}[${label}]${COLORS.reset} arrêté (code ${code})`);
  });
  return child;
}

console.log('\n🎬 Kelvyn Tube — environnement de développement\n');
await checkInfra();
console.log('');

const children = [
  run('api', ['run', 'dev:api']),
  run('worker', ['run', 'dev:worker']),
  run('web', ['run', 'dev:web']),
];

const shutdown = () => {
  console.log('\nArrêt…');
  children.forEach((c) => c.kill('SIGTERM'));
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
