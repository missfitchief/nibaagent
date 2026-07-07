import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid
} from "drizzle-orm/pg-core";

/**
 * Single source of truth for the Neon schema. Column names are snake_case on
 * purpose: the external n8n workflow ("Meta Messenger Multi-Tenant SaaS")
 * queries `meta_connections` and `processed_messages` directly, so those two
 * tables follow the shared contract exactly. Every tenant-owned table carries
 * business_id — ALL queries must be scoped by it (see lib/auth/guards.ts).
 */

export const PLANS = ["free", "basic", "standard", "pro", "business", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "client"] }).notNull().default("client"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    plan: text("plan", { enum: PLANS }).notNull().default("free"),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    handoffEnabled: boolean("handoff_enabled").notNull().default(true),
    /** "draft" = AI suggests but never sends; "live" = sends; "paused" = does nothing. */
    aiMode: text("ai_mode", { enum: ["draft", "live", "paused"] }).notNull().default("draft"),
    dailyMessageLimit: integer("daily_message_limit").notNull().default(200),
    monthlyMessageLimit: integer("monthly_message_limit").notNull().default(3000),
    selectedModel: text("selected_model").notNull().default("gpt-4o-mini"),
    tone: text("tone").notNull().default("friendly"),
    defaultLanguage: text("default_language").notNull().default("sr"),
    googleSheetUrl: text("google_sheet_url").notNull().default(""),
    telegramChannelId: text("telegram_channel_id").notNull().default(""),
    whatsappNotificationTarget: text("whatsapp_notification_target").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("businesses_owner_idx").on(t.ownerUserId)]
);

/** Shared contract with n8n — do not rename columns without updating the workflow. */
export const metaConnections = pgTable(
  "meta_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    /** legacy n8n field: mirrors business id/slug used by the workflow lookup */
    clientId: text("client_id").notNull().default(""),
    pageId: text("page_id").notNull(),
    pageName: text("page_name").notNull().default(""),
    encryptedPageAccessToken: text("encrypted_page_access_token").notNull().default(""),
    instagramBusinessAccountId: text("instagram_business_account_id").notNull().default(""),
    encryptedInstagramAccessToken: text("encrypted_instagram_access_token").notNull().default(""),
    status: text("status", { enum: ["connected", "partial", "error", "disconnected"] })
      .notNull()
      .default("partial"),
    connectionType: text("connection_type", { enum: ["oauth", "manual"] }).notNull().default("oauth"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("meta_connections_page_idx").on(t.pageId), index("meta_connections_business_idx").on(t.businessId)]
);

/** Shared contract with n8n — anti-duplicate table keyed by Meta message id. */
export const processedMessages = pgTable(
  "processed_messages",
  {
    messageId: text("message_id").primaryKey(),
    pageId: text("page_id").notNull().default(""),
    senderId: text("sender_id").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("processed_messages_page_idx").on(t.pageId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    channel: text("channel", { enum: ["facebook", "instagram"] }).notNull(),
    externalConversationId: text("external_conversation_id").notNull().default(""),
    senderId: text("sender_id").notNull(),
    customerName: text("customer_name").notNull().default(""),
    status: text("status", { enum: ["open", "ai", "handoff", "closed"] }).notNull().default("ai"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    /** Bot stays silent until this time after human takeover (24h rule). */
    humanTakeoverUntil: timestamp("human_takeover_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("conversations_business_idx").on(t.businessId, t.lastMessageAt),
    uniqueIndex("conversations_sender_idx").on(t.businessId, t.channel, t.senderId)
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    externalMessageId: text("external_message_id").notNull().default(""),
    channel: text("channel", { enum: ["facebook", "instagram"] }).notNull(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    senderId: text("sender_id").notNull().default(""),
    text: text("text").notNull().default(""),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    modelUsed: text("model_used").notNull().default(""),
    tokenUsageEstimate: integer("token_usage_estimate").notNull().default(0),
    costEstimate: numeric("cost_estimate", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("messages_business_idx").on(t.businessId, t.createdAt),
    index("messages_conversation_idx").on(t.conversationId, t.createdAt)
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    customerName: text("customer_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    address: text("address").notNull().default(""),
    streetAndNumber: text("street_and_number").notNull().default(""),
    city: text("city").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    place: text("place").notNull().default(""),
    orderText: text("order_text").notNull().default(""),
    status: text("status", { enum: ["new", "confirmed", "shipped", "done", "cancelled"] }).notNull().default("new"),
    googleSheetSynced: boolean("google_sheet_synced").notNull().default(false),
    sheetSyncError: text("sheet_sync_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("orders_business_idx").on(t.businessId, t.createdAt)]
);

export const handoffs = pgTable(
  "handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    triggerWord: text("trigger_word").notNull().default(""),
    reason: text("reason").notNull().default(""),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (t) => [index("handoffs_business_idx").on(t.businessId, t.status)]
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    type: text("type", { enum: ["faq", "manual", "url", "pdf", "doc", "sheet", "old_chats", "products"] }).notNull(),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    status: text("status", { enum: ["active", "processing", "error", "archived"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("knowledge_sources_business_idx").on(t.businessId)]
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id),
    content: text("content").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("knowledge_chunks_business_idx").on(t.businessId, t.sourceId)]
);

export const botSettings = pgTable("bot_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id)
    .unique(),
  tone: text("tone").notNull().default("friendly"),
  greetingBehavior: text("greeting_behavior").notNull().default("greet_once"),
  orderCollectionEnabled: boolean("order_collection_enabled").notNull().default(true),
  orderPrompt: text("order_prompt").notNull().default(""),
  handoffWords: jsonb("handoff_words")
    .notNull()
    .default(["reklamacija", "kasni", "problem", "ljut", "agent", "čovek", "covek", "podrška", "podrska", "hitno"]),
  faq: jsonb("faq").notNull().default([]),
  customInstructions: text("custom_instructions").notNull().default(""),
  /** Cached style/knowledge summary produced by "Analyze old chats". */
  oldChatsSummary: text("old_chats_summary").notNull().default(""),
  oldChatsAnalyzedAt: timestamp("old_chats_analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const analyticsDaily = pgTable(
  "analytics_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    date: date("date").notNull(),
    messagesCount: integer("messages_count").notNull().default(0),
    aiRepliesCount: integer("ai_replies_count").notNull().default(0),
    conversationsCount: integer("conversations_count").notNull().default(0),
    ordersCount: integer("orders_count").notNull().default(0),
    handoffCount: integer("handoff_count").notNull().default(0),
    estimatedCost: numeric("estimated_cost", { precision: 10, scale: 4 }).notNull().default("0"),
    estimatedSavedMoney: numeric("estimated_saved_money", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("analytics_daily_unique").on(t.businessId, t.date)]
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("admin_audit_created_idx").on(t.createdAt)]
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessId: uuid("business_id")
    .notNull()
    .references(() => businesses.id)
    .unique(),
  plan: text("plan", { enum: PLANS }).notNull().default("free"),
  status: text("status", { enum: ["active", "trial", "cancelled", "past_due"] }).notNull().default("active"),
  billingMode: text("billing_mode", { enum: ["manual", "contact_us"] }).notNull().default("contact_us"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

/** Observability: connection attempts, OAuth/webhook/AI/sheet/notification errors. */
export const eventLogs = pgTable(
  "event_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").references(() => businesses.id),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull().default("info"),
    area: text("area").notNull(), // meta_oauth | webhook_subscribe | ai_reply | token | sheet_sync | notification | admin
    message: text("message").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("event_logs_business_idx").on(t.businessId, t.createdAt), index("event_logs_area_idx").on(t.area)]
);
