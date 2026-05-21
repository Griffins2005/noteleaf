-- Migration: 20260516000001_add_user_emails
-- Adds the user_emails table that links a verified email address to a user UUID.
-- This enables cross-device recovery: user enters their email on a new device,
-- receives a one-time code, and gets back their UUID.
--
-- Design:
--   email is the PRIMARY KEY — one email can only ever map to one UUID.
--   user_uuid is NOT UNIQUE — a single user may link multiple email addresses.
--   The server validates email ownership via a one-time code before writing here.

CREATE TABLE "user_emails" (
  "email"      TEXT          NOT NULL,
  "user_uuid"  UUID          NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_emails_pkey" PRIMARY KEY ("email")
);

-- Fast lookup of all emails for a given UUID (e.g. to list linked emails).
CREATE INDEX "user_emails_user_uuid_idx" ON "user_emails"("user_uuid");
