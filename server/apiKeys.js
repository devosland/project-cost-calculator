import crypto from 'crypto';

const KEY_PREFIX = 'ckc_live_';
const KEY_BODY_LENGTH = 32;

export function generateApiKey() {
  const body = crypto.randomBytes(24).toString('base64url').slice(0, KEY_BODY_LENGTH);
  const key = `${KEY_PREFIX}${body}`;
  const prefix = key.slice(0, 16);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key, storedHash) {
  const computed = hashApiKey(key);
  if (computed.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}
