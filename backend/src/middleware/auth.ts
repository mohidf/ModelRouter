/**
 * auth.ts
 *
 * Express middleware for Supabase JWT authentication.
 *
 * - optionalAuth: Attaches req.userId if a valid Bearer token is present.
 *   Never blocks the request — anonymous callers pass through.
 *
 * - requireAuth: Same token verification, but returns 401 if the token is
 *   missing, malformed, or invalid.
 *
 * Extend Express's Request type locally so TypeScript knows about userId.
 */

import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Type augmentation — available throughout the backend via module augmentation
// ---------------------------------------------------------------------------

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// ---------------------------------------------------------------------------
// Internal token extraction
// ---------------------------------------------------------------------------

/**
 * Extract the Bearer token from the Authorization header.
 * Returns null if the header is absent or not a Bearer scheme.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ---------------------------------------------------------------------------
// Internal verification
// ---------------------------------------------------------------------------

/**
 * Verify a JWT token with Supabase and return the user ID on success.
 * Returns null on any error (invalid token, network failure, etc.)
 */
async function verifyToken(token: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Optional authentication middleware.
 *
 * If a valid Bearer token is present, attaches the authenticated user's ID to
 * req.userId. If the token is absent or invalid, the request continues without
 * req.userId set. Never rejects the request.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);
  if (token) {
    const userId = await verifyToken(token);
    if (userId) req.userId = userId;
  }
  next();
}

/**
 * Required authentication middleware.
 *
 * Verifies the Bearer token in the Authorization header. On success, attaches
 * req.userId and calls next(). Returns 401 if the token is absent or invalid.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const userId = await verifyToken(token);
  if (!userId) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  req.userId = userId;
  next();
}
