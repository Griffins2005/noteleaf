-- Migration: 20260527000000_add_fk_sessions_users
--
-- Adds a proper foreign key from sessions.user_uuid to users.id so that
-- deleting a user cascades to all their sessions and ai_summaries.
--
-- Safety: orphaned sessions (user_uuid not in users) are deleted first to
-- avoid a constraint violation. These would only exist if sessions were
-- created before the users table was introduced in migration 20260521.

DELETE FROM "sessions"
WHERE "user_uuid" NOT IN (SELECT "id" FROM "users");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_uuid_fkey"
  FOREIGN KEY ("user_uuid") REFERENCES "users"("id") ON DELETE CASCADE;
