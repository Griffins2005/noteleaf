-- Store verbatim timestamped transcript segments separately from the
-- concatenated transcript string so users can review exactly what was said.
ALTER TABLE "sessions"
ADD COLUMN "transcriptSegments" JSONB NOT NULL DEFAULT '[]';
