CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"last_four" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "ai_provider" text DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "ai_strategy" text DEFAULT 'rules_first' NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "persiranje" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "image_recognition_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "reply_delay_seconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "unknown_behavior" text DEFAULT 'offer_handoff' NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "handoff_threshold" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD COLUMN "business_hours" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL;