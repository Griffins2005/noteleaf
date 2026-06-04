-- Persist Ask notes conversation per session
ALTER TABLE "sessions" ADD COLUMN "chat_messages" JSONB NOT NULL DEFAULT '[]';
