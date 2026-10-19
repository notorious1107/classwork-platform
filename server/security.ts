import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(scrypt);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, encoded] = stored.split(':');
  if (!salt || !encoded) return false;
  const key = (await deriveKey(password, salt, 64)) as Buffer;
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
