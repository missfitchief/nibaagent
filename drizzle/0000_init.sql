CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text DEFAULT '' NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"date" date NOT NULL,
	"messages_count" integer DEFAULT 0 NOT NULL,
	"ai_replies_count" integer DEFAULT 0 NOT NULL,
	"conversations_count" integer DEFAULT 0 NOT NULL,
	"orders_count" integer DEFAULT 0 NOT NULL,
	"handoff_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost" numeric(10, 4) DEFAULT '0' NOT NULL,
	"estimated_saved_money" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"greeting_behavior" text DEFAULT 'greet_once' NOT NULL,
	"order_collection_enabled" boolean DEFAULT true NOT NULL,
	"order_prompt" text DEFAULT '' NOT NULL,
	"handoff_words" jsonb DEFAULT '["reklamacija","kasni","problem","ljut","agent","čovek","covek","podrška","podrska","hitno"]'::jsonb NOT NULL,
	"faq" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_instructions" text DEFAULT '' NOT NULL,
	"old_chats_summary" text DEFAULT '' NOT NULL,
	"old_chats_analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_settings_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"handoff_enabled" boolean DEFAULT true NOT NULL,
	"ai_mode" text DEFAULT 'draft' NOT NULL,
	"daily_message_limit" integer DEFAULT 200 NOT NULL,
	"monthly_message_limit" integer DEFAULT 3000 NOT NULL,
	"selected_model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"tone" text DEFAULT 'friendly' NOT NULL,
	"default_language" text DEFAULT 'sr' NOT NULL,
	"google_sheet_url" text DEFAULT '' NOT NULL,
	"telegram_channel_id" text DEFAULT '' NOT NULL,
	"whatsapp_notification_target" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_conversation_id" text DEFAULT '' NOT NULL,
	"sender_id" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ai' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"human_takeover_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"level" text DEFAULT 'info' NOT NULL,
	"area" text NOT NULL,
	"message" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"trigger_word" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"source_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"external_message_id" text DEFAULT '' NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
	"sender_id" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"model_used" text DEFAULT '' NOT NULL,
	"token_usage_estimate" integer DEFAULT 0 NOT NULL,
	"cost_estimate" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"page_id" text NOT NULL,
	"page_name" text DEFAULT '' NOT NULL,
	"encrypted_page_access_token" text DEFAULT '' NOT NULL,
	"instagram_business_account_id" text DEFAULT '' NOT NULL,
	"encrypted_instagram_access_token" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'partial' NOT NULL,
	"connection_type" text DEFAULT 'oauth' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"conversation_id" uuid,
	"customer_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"street_and_number" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"postal_code" text DEFAULT '' NOT NULL,
	"place" text DEFAULT '' NOT NULL,
	"order_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"google_sheet_synced" boolean DEFAULT false NOT NULL,
	"sheet_sync_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"page_id" text DEFAULT '' NOT NULL,
	"sender_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"billing_mode" text DEFAULT 'contact_us' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'client' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_settings" ADD CONSTRAINT "bot_settings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_source_id_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_unique" ON "analytics_daily" USING btree ("business_id","date");--> statement-breakpoint
CREATE INDEX "businesses_owner_idx" ON "businesses" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "conversations_business_idx" ON "conversations" USING btree ("business_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_sender_idx" ON "conversations" USING btree ("business_id","channel","sender_id");--> statement-breakpoint
CREATE INDEX "event_logs_business_idx" ON "event_logs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "event_logs_area_idx" ON "event_logs" USING btree ("area");--> statement-breakpoint
CREATE INDEX "handoffs_business_idx" ON "handoffs" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_business_idx" ON "knowledge_chunks" USING btree ("business_id","source_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_business_idx" ON "knowledge_sources" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "messages_business_idx" ON "messages" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_connections_page_idx" ON "meta_connections" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "meta_connections_business_idx" ON "meta_connections" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "orders_business_idx" ON "orders" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "processed_messages_page_idx" ON "processed_messages" USING btree ("page_id");