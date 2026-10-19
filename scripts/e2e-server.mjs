import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

process.env.PORT = '3101';
process.env.HOST = '127.0.0.1';
process.env.DATABASE_PATH = join(process.cwd(), 'test-results', `browser-${randomUUID()}.sqlite`);
process.env.SEED_DEMO = 'true';
process.env.COOKIE_SECURE = 'false';
mkdirSync(join(process.cwd(), 'test-results'), { recursive: true });
writeFileSync(
  join(process.cwd(), 'test-results', 'e2e-runtime.json'),
  JSON.stringify({ databasePath: process.env.DATABASE_PATH }),
);
await import('../dist/server/server/index.js');
