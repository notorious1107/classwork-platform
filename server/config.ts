import 'dotenv/config';
import { resolve } from 'node:path';
export const config = {
  databasePath: resolve(process.env.DATABASE_PATH ?? './data/classwork.sqlite'),
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  secureCookies: process.env.COOKIE_SECURE === 'true',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
  init: {
    demo: process.env.SEED_DEMO !== 'false',
    teacherUsername: process.env.TEACHER_USERNAME,
    teacherPassword: process.env.TEACHER_PASSWORD,
    teacherName: process.env.TEACHER_NAME,
    className: process.env.CLASS_NAME,
  },
};
