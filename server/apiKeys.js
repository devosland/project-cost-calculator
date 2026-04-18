/**
 * Low-level utilities for API key generation, hashing, and constant-time verification.
 * Keys use a "ckc_live_" prefix to make them identifiable in logs and secrets scanners.
 * SHA-256 (not bcrypt) is used here because API keys have ~192 bits of entropy from
 * crypto.randomBytes — brute-force preimage attacks are infeasible, and SHA-256 is
 * orders of magnitude faster for per-request hash lookups.
 */
import crypto from 'crypto';

const KEY_PREFIX = 'ckc_live_';
const KEY_BODY_LENGTH = 32;

/**
 * Generates a new random API key and returns its plaintext, display prefix, and hash.
 * The plaintext key is returned only here — callers must store the hash, not the key.
 * @returns {{ key: string, prefix: string, hash: string }}
 *   key    — full plaintext key shown to the user once (e.g. "ckc_live_...")
 *   prefix — first 16 chars used as a safe display identifier in the UI
 *   hash   — SHA-256 hex digest stored in the database for lookup
 */
export function generateApiKey() {
  const body = crypto.randomBytes(24).toString('base64url').slice(0, KEY_BODY_LENGTH);
  const key = `${KEY_PREFIX}${body}`;
  const prefix = key.slice(0, 16);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

/**
 * Hashes an API key with SHA-256, producing the hex digest stored in the database.
 * @param {string} key - The plaintext API key.
 * @returns {string} SHA-256 hex digest.
 */
export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Compares a submitted key against a stored hash using constant-time comparison
 * to prevent timing-based side-channel attacks.
 * @param {string} key - The plaintext key from the request.
 * @param {string} storedHash - The SHA-256 hex digest from the database.
 * @returns {boolean} True if the key matches the stored hash.
 */
export function verifyApiKey(key, storedHash) {
  const computed = hashApiKey(key);
  // Length check first: timingSafeEqual throws if buffers have different lengths.
  if (computed.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}
