/**
 * keys.test.ts
 *
 * Tests for the /keys route — GET, POST, DELETE.
 * Supabase and auth middleware are fully mocked.
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Mock auth middleware so we can control authentication in each test
// ---------------------------------------------------------------------------

let mockUserId: string | undefined = 'user-test-123';

jest.mock('../middleware/auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    if (!mockUserId) {
      _res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    (req as Request & { userId?: string }).userId = mockUserId;
    next();
  },
}));

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

const mockSelect  = jest.fn();
const mockUpsert  = jest.fn();
const mockDelete  = jest.fn();
const mockEq      = jest.fn();
const mockEq2     = jest.fn();
const mockEqChain = jest.fn();

// Build a chainable query mock
function buildSelectChain(result: { data: unknown; error: unknown }) {
  const chain = {
    eq: jest.fn().mockReturnValue({ data: result.data, error: result.error }),
  };
  return chain;
}

const mockFrom = jest.fn();

jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: mockFrom,
    auth: { getUser: jest.fn() },
  }),
}));

// Import after mocks
import request from 'supertest';
import keysRouter from '../routes/keys';

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use('/keys', keysRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupSelectMock(data: unknown[], error: unknown = null) {
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ data, error }),
    }),
    upsert: jest.fn().mockReturnValue({ error: null }),
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ error: null }),
      }),
    }),
  });
}

function setupUpsertMock(error: unknown = null) {
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ data: [], error: null }),
    }),
    upsert: jest.fn().mockReturnValue({ error }),
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ error: null }),
      }),
    }),
  });
}

function setupDeleteMock(error: unknown = null) {
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({ data: [], error: null }),
    }),
    upsert: jest.fn().mockReturnValue({ error: null }),
    delete: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ error }),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// GET /keys
// ---------------------------------------------------------------------------

describe('GET /keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-test-123';
  });

  it('returns 401 without authentication', async () => {
    mockUserId = undefined;
    const res = await request(app).get('/keys');
    expect(res.status).toBe(401);
  });

  it('returns empty keys array when no keys are stored', async () => {
    setupSelectMock([]);
    const res = await request(app)
      .get('/keys')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ keys: [] });
  });

  it('returns masked keys — never actual key values', async () => {
    setupSelectMock([
      { provider: 'openai',     api_key: 'sk-openai-real-key-12345', updated_at: '2025-01-01T00:00:00Z' },
      { provider: 'anthropic',  api_key: 'sk-ant-real-key-abc',      updated_at: '2025-01-02T00:00:00Z' },
    ]);

    const res = await request(app)
      .get('/keys')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(2);

    // Verify masking — real key must never appear
    for (const k of res.body.keys) {
      expect(k.maskedKey).toBe('••••••••••••');
      expect(k).not.toHaveProperty('api_key');
      expect(k).not.toHaveProperty('apiKey');
    }

    // Verify provider and updatedAt are present
    expect(res.body.keys[0].provider).toBe('openai');
    expect(res.body.keys[0].updatedAt).toBeDefined();
    expect(res.body.keys[1].provider).toBe('anthropic');
  });
});

// ---------------------------------------------------------------------------
// POST /keys
// ---------------------------------------------------------------------------

describe('POST /keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-test-123';
  });

  it('returns 401 without authentication', async () => {
    mockUserId = undefined;
    const res = await request(app)
      .post('/keys')
      .send({ provider: 'openai', apiKey: 'sk-valid-key-12345' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid provider', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', 'Bearer valid-token')
      .send({ provider: 'invalid-provider', apiKey: 'sk-key-12345678' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provider/i);
  });

  it('returns 400 for all invalid providers', async () => {
    const invalidProviders = ['aws-bedrock', 'huggingface', '', 123, null];
    for (const provider of invalidProviders) {
      const res = await request(app)
        .post('/keys')
        .set('Authorization', 'Bearer valid-token')
        .send({ provider, apiKey: 'sk-key-12345678' });
      expect(res.status).toBe(400);
    }
  });

  it('returns 400 when apiKey is too short (< 8 chars)', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', 'Bearer valid-token')
      .send({ provider: 'openai', apiKey: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/apiKey/i);
  });

  it('returns 400 when apiKey is not a string', async () => {
    const res = await request(app)
      .post('/keys')
      .set('Authorization', 'Bearer valid-token')
      .send({ provider: 'openai', apiKey: 12345678 });

    expect(res.status).toBe(400);
  });

  it('upserts a valid key and returns 200', async () => {
    setupUpsertMock();

    const res = await request(app)
      .post('/keys')
      .set('Authorization', 'Bearer valid-token')
      .send({ provider: 'openai', apiKey: 'sk-valid-key-12345' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('accepts all valid provider values', async () => {
    const validProviders = ['openai', 'anthropic', 'together', 'google', 'cohere'];
    for (const provider of validProviders) {
      setupUpsertMock();
      const res = await request(app)
        .post('/keys')
        .set('Authorization', 'Bearer valid-token')
        .send({ provider, apiKey: 'sk-valid-key-12345' });
      expect(res.status).toBe(200);
    }
  });

  it('returns 500 when database upsert fails', async () => {
    setupUpsertMock({ message: 'DB constraint error' });

    const res = await request(app)
      .post('/keys')
      .set('Authorization', 'Bearer valid-token')
      .send({ provider: 'anthropic', apiKey: 'sk-ant-valid-key-12345' });

    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// DELETE /keys/:provider
// ---------------------------------------------------------------------------

describe('DELETE /keys/:provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'user-test-123';
  });

  it('returns 401 without authentication', async () => {
    mockUserId = undefined;
    const res = await request(app).delete('/keys/openai');
    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid provider', async () => {
    const res = await request(app)
      .delete('/keys/invalid-provider')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provider/i);
  });

  it('deletes a key and returns 200', async () => {
    setupDeleteMock();

    const res = await request(app)
      .delete('/keys/openai')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('returns 500 when database delete fails', async () => {
    setupDeleteMock({ message: 'DB error' });

    const res = await request(app)
      .delete('/keys/anthropic')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(500);
  });
});
