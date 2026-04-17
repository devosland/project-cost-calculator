import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiKeyAuth } from '../apiKeyAuth.js';
import { db, createApiKeyRecord } from '../db.js';
import { generateApiKey } from '../apiKeys.js';

function mockReqRes(headers = {}) {
  const req = { headers, ip: '1.2.3.4', originalUrl: '/api/v1/test', method: 'POST' };
  const res = {
    statusCode: 200,
    status: vi.fn(function (c) { this.statusCode = c; return this; }),
    json: vi.fn().mockReturnThis(),
    on: vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('apiKeyAuth middleware', () => {
  let userId, validKey, keyId;

  beforeEach(() => {
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM users WHERE email = ?').run('apiauth@test.com');
    const u = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run('apiauth@test.com', 'T', 'x');
    userId = Number(u.lastInsertRowid);
    const { key, prefix, hash } = generateApiKey();
    keyId = createApiKeyRecord(userId, 'test', prefix, hash, ['roadmap:import'], 60);
    validKey = key;
  });

  it('401 when header missing', () => {
    const { req, res, next } = mockReqRes();
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 when key unknown', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': 'ckc_live_notfound' });
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('403 when scope insufficient', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': validKey });
    apiKeyAuth({ requiredScope: 'roadmap:admin' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('401 when key revoked', () => {
    db.prepare('UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(keyId);
    const { req, res, next } = mockReqRes({ 'x-api-key': validKey });
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches req.apiKey + req.user and calls next on success', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': validKey });
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiKey.id).toBe(keyId);
    expect(req.user.id).toBe(userId);
  });
});
