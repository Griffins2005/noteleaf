-- Create users table.
-- id is a UUID supplied by the application layer (not defaulted by Postgres)
-- so we can preserve existing UUIDs from the user_emails table on first sign-in.

CREATE TABLE "users" (
  "id"         UUID        NOT NULL,
  "email"      TEXT,
  "name"       TEXT,
  "avatar"     TEXT,
  "google_id"  TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "users_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "users_email_key" UNIQUE ("email"),
  CONSTRAINT "users_google_id_key" UNIQUE ("google_id")
);
