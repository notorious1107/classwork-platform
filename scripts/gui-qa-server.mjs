import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// A separate, disposable database for exploratory GUI checks.
process.env.PORT = '3100';
process.env.HOST = '127.0.0.1';
process.env.DATABASE_PATH = process.argv[2]
  ? resolve(process.argv[2])
  : join(process.cwd(), 'data', `gui-qa-${randomUUID()}.sqlite`);
process.env.SEED_DEMO = 'true';
await import('../dist/server/server/index.js');
