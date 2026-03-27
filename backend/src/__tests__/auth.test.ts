/**
 * auth.test.ts
 *
 * Tests for the auth middleware — optionalAuth and requireAuth.
 * Supabase client is mocked; no real network calls are made.
 */

import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Mock Supabase before importing the middleware
// ---------------------------------------------------------------------------

const mockGetUser = jest.fn();

jest.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Must import after jest.mock() calls
import { optionalAuth, requireAuth } from '../middleware/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(authHeader?: string): Request {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  } as unknown as Request;
}

function makeRes(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

const next: NextFunction = jest.fn();

// ---------------------------------------------------------------------------
// optionalAuth
// ---------------------------------------------------------------------------

describe('optionalAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes through when no Authorization header is present', async () => {
    const req = makeReq();
    const res = makeRes();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request & { userId?: string }).userId).toBeUndefined();
  });

  it('passes through when Authorization header is not a Bearer token', async () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const res = makeRes();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request & { userId?: string }).userId).toBeUndefined();
  });

  it('attaches userId when a valid Bearer token is provided', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const req = makeReq('Bearer valid-token');
    const res = makeRes();

    await optionalAuth(req, res, next);

    expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    expect((req as Request & { userId?: string }).userId).toBe('user-123');
    expect(next).toHaveBeenCalledWith();
  });

  it('passes through (no userId) when token verification fails', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const req = makeReq('Bearer bad-token');
    const res = makeRes();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request & { userId?: string }).userId).toBeUndefined();
  });

  it('passes through when getUser throws', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('Network error'));

    const req = makeReq('Bearer some-token');
    const res = makeRes();

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as Request & { userId?: string }).userId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// requireAuth
// ---------------------------------------------------------------------------

describe('requireAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const req = makeReq();
    const res = makeRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not a Bearer token', async () => {
    const req = makeReq('Basic dXNlcjpwYXNz');
    const res = makeRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid/expired token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Token expired' },
    });

    const req = makeReq('Bearer expired-token');
    const res = makeRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required.' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches userId and calls next for a valid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-abc' } },
      error: null,
    });

    const req = makeReq('Bearer valid-token');
    const res = makeRes();

    await requireAuth(req, res, next);

    expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    expect((req as Request & { userId?: string }).userId).toBe('user-abc');
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when getUser throws', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('Network failure'));

    const req = makeReq('Bearer some-token');
    const res = makeRes();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
