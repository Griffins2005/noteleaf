import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-please-set-JWT_SECRET-in-production',
);

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface JwtPayload {
  userId: string;
  email:  string | null;
  name:   string | null;
  exp?:   number;
}

// Access token

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setJti(randomBytes(16).toString('hex'))
    .setExpirationTime('15m')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  const result: JwtPayload = {
    userId: payload['userId'] as string,
    email:  (payload['email'] as string | null) ?? null,
    name:   (payload['name'] as string | null) ?? null,
  };
  if (payload.exp !== undefined) result.exp = payload.exp;
  return result;
}

// Refresh token helpers

/** Returns a cryptographically random opaque refresh token (80 hex chars). */
export function generateRefreshToken(): string {
  return randomBytes(40).toString('hex');
}

/** SHA-256 hash for safe DB storage of opaque tokens. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// OTP helpers

/** SHA-256 hash for OTP codes — bound to email and JWT_SECRET so hashes are
 *  specific to this server even if the DB is exfiltrated. */
export function hashOtp(code: string, email: string): string {
  const pepper = process.env['JWT_SECRET'] ?? 'dev-secret';
  return createHash('sha256').update(`${email}:${code}:${pepper}`).digest('hex');
}

// Request guard

/**
 * Extracts and validates the JWT from the nl_access httpOnly cookie (preferred)
 * or the Authorization: Bearer header (fallback for programmatic API clients).
 * Returns the userId on success, or sends a 401 and returns '' on failure.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<string> {
  const cookies    = (request as unknown as { cookies?: Record<string, string | undefined> }).cookies;
  const cookieToken = cookies?.['nl_access'];
  const authHeader  = request.headers['authorization'];
  const raw = cookieToken ?? (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!raw) {
    void reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      timestamp: new Date().toISOString(),
    });
    return '';
  }

  try {
    const { userId } = await verifyToken(raw);
    return userId;
  } catch {
    void reply.code(401).send({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token. Please sign in again.' },
      timestamp: new Date().toISOString(),
    });
    return '';
  }
}
