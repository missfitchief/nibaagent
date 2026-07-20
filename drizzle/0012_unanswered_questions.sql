-- Additive + idempotent. "Bot nije znao" loop: questions the AI answered with
-- no knowledge coverage. resolved_at NULL = open; resolution points at the
-- knowledge source that answered it.
CREATE TABLE IF NOT EXISTS "unanswered_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL REFERENCES "businesses"("id"),
	"conversation_id" uuid REFERENCES "conversations"("id"),
	"question_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_knowledge_source_id" uuid REFERENCES "knowledge_sources"("id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unanswered_questions_business_idx" ON "unanswered_questions" ("business_id", "created_at");
