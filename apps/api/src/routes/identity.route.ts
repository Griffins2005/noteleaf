/**
 * @file identity.route.ts
 * @description Email-based UUID recovery routes.
 *
 * POST /api/identity/send-code   — send a 6-digit one-time code to an email address
 * POST /api/identity/verify-code — validate the code, link or recover a UUID
 *
 * Email delivery:
 *   Set RESEND_API_KEY in .env to enable real email delivery via Resend.
 *   Set FROM_EMAIL to your verified sender (default: onboarding@resend.dev).
 *
 *   When RESEND_API_KEY is not set the code is returned in devCode so you can
 *   test without an email provider. Remove devCode from the response once you
 *   have a key configured.
 *
 * Resend setup (free, 3 000 emails/month):
 *   1. Sign up at https://resend.com
 *   2. Create an API key
 *   3. Add RESEND_API_KEY=re_... to root .env (or Render env)
 *   4. Optionally add FROM_EMAIL=you@yourdomain.com (must be a verified sender)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Resend } from 'resend';
import type {
  SendCodeRequest,
  SendCodeResponse,
  VerifyCodeRequest,
  VerifyCodeResponse,
} from '@noteleaf/shared-types';
import type { ApiResponse } from '@noteleaf/shared-types';
import { logger } from '../logger.js';

// ─── Email client ─────────────────────────────────────────────────────────────

const resendApiKey = process.env['RESEND_API_KEY'];
const fromEmail    = process.env['FROM_EMAIL'] ?? 'Noteleaf <onboarding@resend.dev>';
const resend       = resendApiKey ? new Resend(resendApiKey) : null;

// ─── In-memory code store ─────────────────────────────────────────────────────

interface PendingCode {
  code:      string;
  expiresAt: number;
}

const pendingCodes = new Map<string, PendingCode>();
const CODE_TTL_MS  = 10 * 60 * 1000; // 10 minutes

function generateCode(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

function sweepExpired() {
  const now = Date.now();
  for (const [email, entry] of pendingCodes) {
    if (entry.expiresAt < now) pendingCodes.delete(email);
  }
}

// ─── Email template ───────────────────────────────────────────────────────────

function buildEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f3ee;margin:0;padding:40px 20px;">
  <div style="max-width:480px;margin:0 auto;background:#fdfaf7;border-radius:14px;border:1px solid #e8e0d5;overflow:hidden;">
    <div style="background:#1c1814;padding:24px 32px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;font-weight:700;color:#e8ddd0;letter-spacing:-0.3px;">Noteleaf</span>
    </div>
    <div style="padding:32px;">
      <h1 style="font-size:20px;font-weight:600;color:#1e1710;margin:0 0 8px;">Your verification code</h1>
      <p style="font-size:14px;color:#4c3d2e;margin:0 0 28px;line-height:1.6;">
        Use this code to link your recovery email. It expires in <strong>10 minutes</strong>
        and can only be used once.
      </p>
      <div style="background:#f4f0e8;border:1px solid #e8e0d5;border-radius:10px;padding:20px;text-align:center;margin-bottom:28px;">
        <span style="font-size:36px;font-weight:700;color:#b85d1a;letter-spacing:8px;font-family:'Courier New',monospace;">
          ${code}
        </span>
      </div>
      <p style="font-size:12px;color:#8c7560;margin:0;line-height:1.6;">
        If you didn't request this code, you can safely ignore this email.
        Your account is not at risk.
      </p>
    </div>
    <div style="background:#f4f0e8;padding:16px 32px;border-top:1px solid #e8e0d5;">
      <p style="font-size:11px;color:#8c7560;margin:0;">
        Sent by Noteleaf · Capture. Understand. Grow.
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

// ─── Validation ───────────────────────────────────────────────────────────────

const sendCodeSchema = z.object({
  email: z.string().email('A valid email address is required.'),
});

const verifyCodeSchema = z.object({
  email:       z.string().email(),
  code:        z.string().length(6, 'Code must be exactly 6 digits.'),
  currentUuid: z.string().uuid().optional(),
});

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function identityRoute(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/identity/send-code ──────────────────────────────────────────

  fastify.post<{ Body: SendCodeRequest }>(
    '/identity/send-code',
    async (request, reply): Promise<ApiResponse<SendCodeResponse>> => {
      const parsed = sendCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'Invalid email.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<SendCodeResponse>;
      }

      sweepExpired();

      const { email } = parsed.data;
      const code = generateCode();
      pendingCodes.set(email, { code, expiresAt: Date.now() + CODE_TTL_MS });

      let emailSent = false;

      if (resend) {
        // ── Real email via Resend ──────────────────────────────────────────
        try {
          await resend.emails.send({
            from:    fromEmail,
            to:      email,
            subject: `${code} is your Noteleaf verification code`,
            html:    buildEmailHtml(code),
          });
          emailSent = true;
          logger.info({ email }, 'Verification code sent via Resend');
        } catch (err) {
          logger.error({ err, email }, 'Resend email failed — falling back to devCode');
          // Fall through: return devCode so user is not blocked
        }
      }

      if (!emailSent) {
        // ── No email provider / delivery failed — log prominently ─────────
        logger.info(
          { email, code },
          '\n┌──────────────────────────────────────────┐\n' +
          `│  NOTELEAF verification code: ${code}     │\n` +
          '│  (set RESEND_API_KEY to send real emails) │\n' +
          '└──────────────────────────────────────────┘',
        );
      }

      return {
        success: true,
        data: {
          sent: true,
          // Always return devCode until a verified email sender is configured.
          // Remove this once RESEND_API_KEY + a verified FROM_EMAIL are set.
          ...(!emailSent && { devCode: code }),
        },
        timestamp: new Date().toISOString(),
      };
    },
  );

  // ── POST /api/identity/verify-code ────────────────────────────────────────

  fastify.post<{ Body: VerifyCodeRequest }>(
    '/identity/verify-code',
    async (request, reply): Promise<ApiResponse<VerifyCodeResponse>> => {
      const parsed = verifyCodeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'Invalid request.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<VerifyCodeResponse>;
      }

      const { email, code, currentUuid } = parsed.data;

      const entry = pendingCodes.get(email);
      if (!entry || entry.expiresAt < Date.now()) {
        return reply.code(400).send({
          success: false,
          error: { code: 'CODE_EXPIRED', message: 'Code expired or not found. Request a new one.' },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<VerifyCodeResponse>;
      }

      if (entry.code !== code) {
        return reply.code(400).send({
          success: false,
          error: { code: 'INVALID_CODE', message: 'Incorrect code. Please try again.' },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<VerifyCodeResponse>;
      }

      // Code is valid — consume it (single-use).
      pendingCodes.delete(email);

      const existing = await fastify.db.userEmail.findUnique({ where: { email } });

      if (existing) {
        // Recovery: return the UUID that was previously linked to this email.
        logger.info({ email, uuid: existing.userUuid }, 'UUID recovered via email');
        return {
          success: true,
          data: { uuid: existing.userUuid, isNewLink: false },
          timestamp: new Date().toISOString(),
        };
      }

      if (!currentUuid) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'UUID_REQUIRED',
            message: 'currentUuid is required when linking a new email.',
          },
          timestamp: new Date().toISOString(),
        }) as unknown as ApiResponse<VerifyCodeResponse>;
      }

      // New link: record email → UUID in the database.
      await fastify.db.userEmail.create({
        data: { email, userUuid: currentUuid },
      });

      logger.info({ email, uuid: currentUuid }, 'Email linked to UUID');

      return {
        success: true,
        data: { uuid: currentUuid, isNewLink: true },
        timestamp: new Date().toISOString(),
      };
    },
  );
}
