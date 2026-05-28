-- Migration: 20260527000001_add_otp_and_refresh_tokens
--
-- otp_codes: persists email sign-in codes to survive restarts / multi-instance.
--   code_hash = SHA-256(email:code:JWT_SECRET) — never store raw OTP digits.
--   attempts tracks failed verify calls for brute-force protection (max 5).
--
-- refresh_tokens: enables access-token renewal without re-login.
--   token_hash = SHA-256(opaque_random_token) — never store raw tokens.
--   Tokens are rotated on every use (old row revoked, new row created).
--   Cascades from users so all tokens are revoked when a user is deleted.

CREATE TABLE "otp_codes" (
  "id"         UUID        NOT NULL,
  "email"      TEXT        NOT NULL,
  "code_hash"  TEXT        NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "used_at"    TIMESTAMPTZ,
  "attempts"   INTEGER     NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_codes_email_created_at_idx" ON "otp_codes" ("email", "created_at" DESC);

CREATE TABLE "refresh_tokens" (
  "id"         UUID        NOT NULL,
  "user_id"    UUID        NOT NULL,
  "token_hash" TEXT        NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "refresh_tokens_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "refresh_tokens_token_hash_key" UNIQUE      ("token_hash"),
  CONSTRAINT "refresh_tokens_user_id_fkey"   FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");
