/**
 * @file auth.route.ts
 * @description Authentication routes — Google OAuth + email OTP sign-in.
 *
 * Routes:
 *   GET  /api/auth/google          → Redirect to Google OAuth consent screen
 *   GET  /api/auth/google/callback → Handle Google callback, issue JWT + refresh token
 *   POST /api/auth/email/send      → Send 6-digit OTP to email (max 3/10 min)
 *   POST /api/auth/email/verify    → Verify OTP (max 5 attempts), issue JWT + refresh token
 *   POST /api/auth/refresh         → Exchange refresh token for a new access + refresh token
 *   POST /api/auth/signout         → Revoke a refresh token
 *   GET  /api/auth/me              → Return current user from JWT
 *
 * OTP security:
 *   - Codes are hashed (SHA-256 + pepper) before DB storage — raw digits never persisted.
 *   - Max 3 send requests per email per 10-minute window (DB count).
 *   - Max 5 failed verify attempts before the code is invalidated.
 *
 * Refresh token security:
 *   - Token values are hashed (SHA-256) before DB storage.
 *   - Tokens are rotated on every use (old revoked, new issued).
 *   - Cascade delete on user removal.
 *   - Access tokens are short-lived (1 h); revocation = don't refresh.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { Resend } from 'resend';
import {
  signToken,
  verifyToken,
  requireAuth,
  generateRefreshToken,
  hashToken,
  hashOtp,
} from '../lib/auth.js';
import { logger } from '../logger.js';
import type { PrismaClient } from '@prisma/client';

// ─── Config ───────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env['GOOGLE_CLIENT_ID']     ?? '';
const GOOGLE_CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] ?? '';
const APP_URL              = process.env['APP_URL']              ?? 'http://localhost:3000';
const API_URL              = process.env['API_URL']              ?? 'http://localhost:3001';

const GOOGLE_REDIRECT_URI = `${API_URL}/api/auth/google/callback`;
const GOOGLE_AUTH_URL     = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL    = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// ─── Email setup ──────────────────────────────────────────────────────────────

const resendApiKey = process.env['RESEND_API_KEY'];
const fromEmail    = process.env['FROM_EMAIL'] ?? 'Noteleaf <onboarding@resend.dev>';
const resend       = resendApiKey ? new Resend(resendApiKey) : null;

// resend.dev test-sender only delivers to the Resend account owner, not arbitrary addresses.
// Expose devCode in the response whenever this sender is in use so dev/staging flows work.
const isDevSender  = fromEmail.includes('resend.dev');

// ─── OTP constants ────────────────────────────────────────────────────────────

const CODE_TTL_MS         = 10 * 60 * 1000;   // 10 minutes
const OTP_SEND_MAX        = 3;                 // max sends per email per window
const OTP_SEND_WINDOW_MS  = 10 * 60 * 1000;   // window for send rate limit
const OTP_MAX_ATTEMPTS    = 5;                 // max failed verify attempts

// ─── Refresh token constants ──────────────────────────────────────────────────

const REFRESH_TTL_DAYS = 30;

// ─── Validation ───────────────────────────────────────────────────────────────

const sendEmailSchema       = z.object({ email: z.email() });
const verifyEmailSchema     = z.object({
  email: z.email(),
  code:  z.string().min(6).max(6),
});
const refreshSchema         = z.object({ refreshToken: z.string().min(1) });
const signoutSchema         = z.object({ refreshToken: z.string().min(1) });
const userPrefsSchema       = z.object({
  retentionDays: z.number().int().positive().nullable().optional(),
});

// ─── DB helpers ───────────────────────────────────────────────────────────────

type Db = PrismaClient;

interface UserRecord {
  id:     string;
  email:  string | null;
  name:   string | null;
  avatar: string | null;
}

function generateCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

async function findOrCreateByEmail(db: Db, email: string, name?: string | null): Promise<UserRecord> {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing;

  const linked = await db.userEmail.findUnique({ where: { email } });
  const id = linked?.userUuid ?? uuidv4();

  return db.user.create({ data: { id, email, name: name ?? null } });
}

async function findOrCreateByGoogle(
  db: Db,
  googleId: string,
  email: string,
  name: string,
  avatar: string,
): Promise<UserRecord> {
  const byGoogleId = await db.user.findUnique({ where: { googleId } });
  if (byGoogleId) {
    return db.user.update({ where: { id: byGoogleId.id }, data: { name, avatar } });
  }

  const byEmail = await db.user.findUnique({ where: { email } });
  if (byEmail) {
    return db.user.update({ where: { id: byEmail.id }, data: { googleId, name, avatar } });
  }

  const linked = await db.userEmail.findUnique({ where: { email } });
  const id = linked?.userUuid ?? uuidv4();

  return db.user.create({ data: { id, email, name, avatar, googleId } });
}

/** Stores a new refresh token in the DB. Returns the raw (unhashed) token. */
async function createRefreshToken(db: Db, userId: string): Promise<string> {
  const raw  = generateRefreshToken();
  const hash = hashToken(raw);
  const exp  = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.refreshToken.create({
    data: { id: uuidv4(), userId, tokenHash: hash, expiresAt: exp },
  });

  // Prune expired/revoked tokens for this user to keep the table tidy.
  await db.refreshToken.deleteMany({
    where: {
      userId,
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });

  return raw;
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildEmailHtml(code: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#0f172a;padding:24px 32px;">
      <span style="font-size:18px;font-weight:500;color:#f8fafc;letter-spacing:-0.3px;font-family:'Courier New',monospace;">Noteleaf</span>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:20px;font-weight:600;color:#0f172a;margin:0 0 8px;">Your sign-in code</h1>
      <p style="font-size:14px;color:#334155;margin:0 0 28px;line-height:1.6;">
        Enter this code to sign in to Noteleaf. It expires in <strong>10 minutes</strong> and can only be used once.
      </p>
      <div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:20px;text-align:center;margin-bottom:28px;">
        <span style="font-size:36px;font-weight:700;color:#2563eb;letter-spacing:8px;font-family:'Courier New',monospace;">${code}</span>
      </div>
      <p style="font-size:12px;color:#64748b;margin:0;line-height:1.6;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="font-size:11px;color:#64748b;margin:0;">Noteleaf · Capture. Understand. Grow.</p>
    </div>
  </div>
</body>
</html>`.trim();
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function authRoute(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/auth/google ─────────────────────────────────────────────────

  fastify.get('/auth/google', async (_request, reply) => {
    if (!GOOGLE_CLIENT_ID) {
      return reply.code(503).send({
        success: false,
        error: { code: 'GOOGLE_NOT_CONFIGURED', message: 'Google sign-in is not configured on this server.' },
        timestamp: new Date().toISOString(),
      });
    }

    const params = new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      redirect_uri:  GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope:         'openid email profile',
      access_type:   'offline',
      prompt:        'select_account',
    });

    return reply.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  });

  // ── GET /api/auth/google/callback ────────────────────────────────────────

  fastify.get<{ Querystring: { code?: string; error?: string } }>(
    '/auth/google/callback',
    async (request, reply) => {
      const { code, error } = request.query;

      if (error || !code) {
        return reply.redirect(`${APP_URL}/auth?error=google_cancelled`);
      }

      try {
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id:     GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri:  GOOGLE_REDIRECT_URI,
            grant_type:    'authorization_code',
          }),
        });

        if (!tokenRes.ok) throw new Error('Token exchange failed');

        const tokens = (await tokenRes.json()) as { access_token: string };

        const userRes = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userRes.ok) throw new Error('Failed to fetch Google user info');

        const g = (await userRes.json()) as {
          id: string; email: string; name: string; picture: string;
        };

        const user = await findOrCreateByGoogle(fastify.db, g.id, g.email, g.name, g.picture);

        const [accessToken, refreshToken] = await Promise.all([
          signToken({ userId: user.id, email: user.email, name: user.name }),
          createRefreshToken(fastify.db, user.id),
        ]);

        logger.info({ userId: user.id, email: user.email }, 'Google sign-in success');

        return reply.redirect(
          `${APP_URL}/auth?token=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`,
        );
      } catch (err) {
        logger.error({ err }, 'Google OAuth callback error');
        return reply.redirect(`${APP_URL}/auth?error=google_failed`);
      }
    },
  );

  // ── POST /api/auth/email/send ────────────────────────────────────────────

  fastify.post<{ Body: { email: string } }>('/auth/email/send', async (request, reply) => {
    const parsed = sendEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'A valid email address is required.' },
        timestamp: new Date().toISOString(),
      });
    }

    const { email } = parsed.data;

    // Rate limit: max OTP_SEND_MAX sends per email per OTP_SEND_WINDOW_MS.
    const windowStart = new Date(Date.now() - OTP_SEND_WINDOW_MS);
    const recentCount = await fastify.db.otpCode.count({
      where: { email, createdAt: { gte: windowStart } },
    });

    if (recentCount >= OTP_SEND_MAX) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'TOO_MANY_CODES',
          message: 'Too many sign-in codes requested. Please wait 10 minutes before trying again.',
        },
        timestamp: new Date().toISOString(),
      });
    }

    const code     = generateCode();
    const codeHash = hashOtp(code, email);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await fastify.db.otpCode.create({
      data: { id: uuidv4(), email, codeHash, expiresAt },
    });

    let emailSent = false;

    if (resend) {
      try {
        await resend.emails.send({
          from:    fromEmail,
          to:      email,
          subject: `${code} — your Noteleaf sign-in code`,
          html:    buildEmailHtml(code),
        });
        emailSent = true;
        logger.info({ email }, 'Sign-in code sent via Resend');
      } catch (err) {
        logger.error({ err, email }, 'Resend failed — falling back to dev log');
      }
    }

    if (!emailSent) {
      logger.info(
        { email, code },
        '\n┌───────────────────────────────────────────┐\n' +
        `│  NOTELEAF sign-in code: ${code}            │\n` +
        '│  (set RESEND_API_KEY to send real emails)  │\n' +
        '└───────────────────────────────────────────┘',
      );
    }

    return {
      success: true,
      data: {
        sent: true,
        ...( (!emailSent || isDevSender) && { devCode: code }),
      },
      timestamp: new Date().toISOString(),
    };
  });

  // ── POST /api/auth/email/verify ──────────────────────────────────────────

  fastify.post<{ Body: { email: string; code: string } }>('/auth/email/verify', async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid email and 6-digit code required.' },
        timestamp: new Date().toISOString(),
      });
    }

    const { email, code } = parsed.data;

    // Find the most recent unused, unexpired code for this email.
    const otpRecord = await fastify.db.otpCode.findFirst({
      where: {
        email,
        usedAt:    null,
        expiresAt: { gt: new Date() },
        attempts:  { lt: OTP_MAX_ATTEMPTS },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return reply.code(400).send({
        success: false,
        error: { code: 'CODE_EXPIRED', message: 'Code expired or not found. Request a new one.' },
        timestamp: new Date().toISOString(),
      });
    }

    const expectedHash = hashOtp(code, email);

    if (otpRecord.codeHash !== expectedHash) {
      // Increment attempts. If maxed out, the WHERE clause above will exclude this record.
      await fastify.db.otpCode.update({
        where: { id: otpRecord.id },
        data:  { attempts: { increment: 1 } },
      });

      const attemptsLeft = OTP_MAX_ATTEMPTS - (otpRecord.attempts + 1);
      return reply.code(400).send({
        success: false,
        error: {
          code: 'INVALID_CODE',
          message: attemptsLeft > 0
            ? `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.`
            : 'Incorrect code. This code has been invalidated — request a new one.',
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Mark the code as used (single-use enforcement).
    await fastify.db.otpCode.update({
      where: { id: otpRecord.id },
      data:  { usedAt: new Date() },
    });

    const user = await findOrCreateByEmail(fastify.db, email);

    const [accessToken, refreshToken] = await Promise.all([
      signToken({ userId: user.id, email: user.email, name: user.name }),
      createRefreshToken(fastify.db, user.id),
    ]);

    logger.info({ userId: user.id, email }, 'Email sign-in success');

    return {
      success: true,
      data: {
        token:        accessToken,
        refreshToken: refreshToken,
        user: { id: user.id, email: user.email, name: user.name },
      },
      timestamp: new Date().toISOString(),
    };
  });

  // ── POST /api/auth/refresh ───────────────────────────────────────────────
  // Rotates the refresh token: old record is revoked, new record is created.

  fastify.post<{ Body: { refreshToken: string } }>('/auth/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' },
        timestamp: new Date().toISOString(),
      });
    }

    const { refreshToken } = parsed.data;
    const tokenHash = hashToken(refreshToken);

    const record = await fastify.db.refreshToken.findUnique({ where: { tokenHash } });

    if (!record || record.revokedAt !== null || record.expiresAt < new Date()) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired. Please sign in again.' },
        timestamp: new Date().toISOString(),
      });
    }

    const user = await fastify.db.user.findUnique({ where: { id: record.userId } });

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
        timestamp: new Date().toISOString(),
      });
    }

    // Revoke the old token and issue a fresh pair atomically.
    const [, newRefreshToken] = await Promise.all([
      fastify.db.refreshToken.update({
        where: { id: record.id },
        data:  { revokedAt: new Date() },
      }),
      createRefreshToken(fastify.db, user.id),
    ]);

    const newAccessToken = await signToken({ userId: user.id, email: user.email, name: user.name });

    logger.info({ userId: user.id }, 'Token refreshed');

    return {
      success: true,
      data: {
        token:        newAccessToken,
        refreshToken: newRefreshToken,
        user: { id: user.id, email: user.email, name: user.name },
      },
      timestamp: new Date().toISOString(),
    };
  });

  // ── POST /api/auth/signout ───────────────────────────────────────────────

  fastify.post<{ Body: { refreshToken: string } }>('/auth/signout', async (request, reply) => {
    const parsed = signoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'refreshToken is required.' },
        timestamp: new Date().toISOString(),
      });
    }

    const tokenHash = hashToken(parsed.data.refreshToken);

    const record = await fastify.db.refreshToken.findUnique({ where: { tokenHash } });

    if (record && !record.revokedAt) {
      await fastify.db.refreshToken.update({
        where: { id: record.id },
        data:  { revokedAt: new Date() },
      });
      logger.info({ userId: record.userId }, 'User signed out');
    }

    // Always return success — idempotent sign-out.
    return {
      success: true,
      data: { signedOut: true },
      timestamp: new Date().toISOString(),
    };
  });

  // ── DELETE /api/auth/account ────────────────────────────────────────────
  // Permanently deletes the authenticated user and all their data via cascade.

  fastify.delete('/auth/account', async (request, reply) => {
    const userId = await requireAuth(request, reply);
    if (!userId) return;

    await fastify.db.user.delete({ where: { id: userId } });

    logger.info({ userId }, 'Account deleted');

    return {
      success: true,
      data: { deleted: true },
      timestamp: new Date().toISOString(),
    };
  });

  // ── PATCH /api/user/preferences ──────────────────────────────────────────
  // Updates per-user preferences stored server-side (e.g. retentionDays).

  fastify.patch<{ Body: { retentionDays?: number | null } }>(
    '/user/preferences',
    async (request, reply) => {
      const userId = await requireAuth(request, reply);
      if (!userId) return;

      const parsed = userPrefsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid preferences payload.' },
          timestamp: new Date().toISOString(),
        });
      }

      const { retentionDays } = parsed.data;

      const updated = await fastify.db.user.update({
        where: { id: userId },
        data: { retentionDays: retentionDays ?? null },
      });

      logger.info({ userId, retentionDays: updated.retentionDays }, 'Preferences updated');

      return {
        success: true,
        data: {
          id: updated.id,
          retentionDays: updated.retentionDays,
        },
        timestamp: new Date().toISOString(),
      };
    },
  );

  // ── GET /api/auth/me ─────────────────────────────────────────────────────

  fastify.get('/auth/me', async (request, reply) => {
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const { userId } = await verifyToken(authHeader.slice(7));
      const user = await fastify.db.user.findUnique({ where: { id: userId } });

      if (!user) {
        return reply.code(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found.' },
          timestamp: new Date().toISOString(),
        });
      }

      return {
        success: true,
        data: { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
        timestamp: new Date().toISOString(),
      };
    } catch {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token.' },
        timestamp: new Date().toISOString(),
      });
    }
  });
}
