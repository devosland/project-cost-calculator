import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey } from '../apiKeys.js';

describe('api key generation', () => {
  it('generates a key with prefix ckc_live_', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^ckc_live_[a-zA-Z0-9_-]{32}$/);
    expect(prefix).toBe(key.slice(0, 16));
    expect(hash).not.toBe(key);
  });

  it('generates distinct keys each call', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hashApiKey produces a deterministic SHA-256 hash', () => {
    const h1 = hashApiKey('ckc_live_test123');
    const h2 = hashApiKey('ckc_live_test123');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifyApiKey matches generated key against stored hash', () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey('ckc_live_wrong', hash)).toBe(false);
  });
});
