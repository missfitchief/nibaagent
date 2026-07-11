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

/**
 * Multi-member access. A business is owned by businesses.owner_user_id (always
 * treated as role "owner"); additional members are rows here. Roles:
 *  owner/admin — full access incl. secrets; agent — conversations/handoffs but
 *  NOT secrets; viewer — read-only. Enforced in lib/auth/guards.ts.
 */
export const MEMBER_ROLES = ["owner", "admin", "agent", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const businessMembers = pgTable(
  "business_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role", { enum: MEMBER_ROLES }).notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("business_members_unique").on(t.businessId, t.userId), index("business_members_user_idx").on(t.userId)]
);

/** Pending invitations. Token-based join; expires; revocable. */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    email: text("email").notNull(),
    role: text("role", { enum: ["admin", "agent", "viewer"] }).notNull().default("agent"),
    token: text("token").notNull().unique(),
    status: text("status", { enum: ["pending", "accepted", "revoked", "expired"] }).notNull().default("pending"),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("invites_business_idx").on(t.businessId), index("invites_email_idx").on(t.email)]
);

/**
 * Global platform settings (Meta app creds, default keys/models, etc.).
 * Resolution is DB row → env var → missing (see lib/platform.ts). Secret
 * values are AES-GCM encrypted; non-secrets stored plaintext. One row per key.
 */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  isSecret: boolean("is_secret").notNull().default(false),
  lastFour: text("last_four").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const STOCK_STATUSES = ["available", "unavailable", "unknown"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    price: numeric("price", { precision: 12, scale: 2 }), // null = price unknown
    currency: text("currency").notNull().default("BAM"),
    stockStatus: text("stock_status", { enum: STOCK_STATUSES }).notNull().default("unknown"),
    stockQuantity: integer("stock_quantity"), // nullable — usually unknown
    sku: text("sku").notNull().default(""),
    category: text("category").notNull().default(""),
    tags: jsonb("tags").notNull().default([]),
    colors: jsonb("colors").notNull().default([]),
    sizes: jsonb("sizes").notNull().default([]),
    url: text("url").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("products_business_idx").on(t.businessId, t.enabled)]
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    url: text("url").notNull(),
    alt: text("alt").notNull().default(""),
    visualDescriptor: text("visual_descriptor").notNull().default(""),
    ocrText: text("ocr_text").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("product_images_product_idx").on(t.productId)]
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull().default(""),
    price: numeric("price", { precision: 12, scale: 2 }),
    sku: text("sku").notNull().default(""),
    color: text("color").notNull().default(""),
    size: text("size").notNull().default(""),
    stockStatus: text("stock_status", { enum: STOCK_STATUSES }).notNull().default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("product_variants_product_idx").on(t.productId)]
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
    /**
     * n8n-runtime compatibility columns. The shared n8n workflow reads the page
     * token in PLAINTEXT and treats status='active' as "connected". These mirror
     * the encrypted columns above so the app keeps tokens encrypted at rest while
     * still handing n8n what it needs. Never surfaced in the UI or any API.
     */
    pageAccessToken: text("page_access_token").notNull().default(""),
    instagramAccessToken: text("instagram_access_token").notNull().default(""),
    businessName: text("business_name").notNull().default(""),
    plan: text("plan").notNull().default("free"),
    status: text("status", { enum: ["active", "connected", "partial", "error", "disconnected"] })
      .notNull()
      .default("partial"),
    connectionType: text("connection_type", { enum: ["oauth", "manual"] }).notNull().default("oauth"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("meta_connections_page_idx").on(t.pageId), index("meta_connections_business_idx").on(t.businessId)]
);

/**
 * ── n8n RUNTIME COMPATIBILITY TABLES ────────────────────────────────────────
 * The shared n8n workflow reads a tenant's runtime config, product catalog and
 * knowledge from these three flat, snake_case tables (NOT from the app's normal
 * tables). The app OWNS the data in its own tables and SYNCS a denormalized
 * projection here on every relevant change (see src/lib/n8n-sync.ts). IDs are
 * stored as text so n8n can match by client_id / page_id without uuid casts.
 * Never contains secrets/tokens.
 */
export const tenantConfigs = pgTable(
  "tenant_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    businessId: text("business_id").notNull(),
    businessName: text("business_name").notNull().default(""),
    plan: text("plan").notNull().default("free"),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    /** launch / bot mode: draft | live | paused */
    botMode: text("bot_mode").notNull().default("draft"),
    defaultLanguage: text("default_language").notNull().default("sr"),
    tone: text("tone").notNull().default("friendly"),
    persiranje: boolean("persiranje").notNull().default(true),
    /** AI strategy: rules_first | balanced | ai_heavy */
    aiStrategy: text("ai_strategy").notNull().default("rules_first"),
    aiProvider: text("ai_provider").notNull().default("openai"),
    selectedModel: text("selected_model").notNull().default(""),
    imageRecognitionEnabled: boolean("image_recognition_enabled").notNull().default(false),
    handoffEnabled: boolean("handoff_enabled").notNull().default(true),
    handoffThreshold: integer("handoff_threshold").notNull().default(40),
    unknownBehavior: text("unknown_behavior").notNull().default("offer_handoff"),
    businessHours: jsonb("business_hours").$type<Record<string, unknown>>().notNull().default({}),
    telegramConnected: boolean("telegram_connected").notNull().default(false),
    metaConnected: boolean("meta_connected").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("tenant_configs_business_idx").on(t.businessId), index("tenant_configs_client_idx").on(t.clientId)]
);

export const catalogSnapshots = pgTable(
  "catalog_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    businessId: text("business_id").notNull(),
    productId: text("product_id").notNull(),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    price: numeric("price"),
    currency: text("currency").notNull().default(""),
    stockStatus: text("stock_status").notNull().default("unknown"),
    stockQuantity: integer("stock_quantity"),
    sku: text("sku").notNull().default(""),
    category: text("category").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    colors: jsonb("colors").$type<string[]>().notNull().default([]),
    sizes: jsonb("sizes").$type<string[]>().notNull().default([]),
    url: text("url").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("catalog_snapshots_product_idx").on(t.businessId, t.productId), index("catalog_snapshots_business_idx").on(t.businessId)]
);

export const learningMemories = pgTable(
  "learning_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull(),
    businessId: text("business_id").notNull(),
    /** stable per-source key: a knowledge_sources uuid, or synthetic (faq/instructions/old_chats) */
    sourceId: text("source_id").notNull(),
    /** faq | website | old_chats | policy | instructions | tone | knowledge */
    sourceType: text("source_type").notNull().default("knowledge"),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("learning_memories_source_idx").on(t.businessId, t.sourceId), index("learning_memories_business_idx").on(t.businessId)]
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
    internalNote: text("internal_note").notNull().default(""),
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
    type: text("type", {
      enum: ["faq", "manual", "url", "pdf", "doc", "sheet", "old_chats", "products", "website", "about", "policy", "delivery", "payment", "returns", "contact"]
    }).notNull(),
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
  /** AI provider + strategy (launch mode lives on businesses.ai_mode). All USED by the engine. */
  aiProvider: text("ai_provider", { enum: ["openai", "anthropic"] }).notNull().default("openai"),
  aiStrategy: text("ai_strategy", { enum: ["rules_first", "balanced", "ai_heavy"] }).notNull().default("rules_first"),
  persiranje: boolean("persiranje").notNull().default(true),
  imageRecognitionEnabled: boolean("image_recognition_enabled").notNull().default(true),
  replyDelaySeconds: integer("reply_delay_seconds").notNull().default(0),
  /** What the bot does when it has no grounded answer. All USED by the engine. */
  unknownBehavior: text("unknown_behavior", { enum: ["offer_handoff", "ask_rephrase", "generic_help"] }).notNull().default("offer_handoff"),
  /** Match confidence (0-100) below which the bot treats a product query as "unknown". */
  handoffThreshold: integer("handoff_threshold").notNull().default(40),
  /** { enabled, openHour, closeHour, days:[0-6], offHoursMessage }. Engine checks before replying live. */
  businessHours: jsonb("business_hours").notNull().default({ enabled: false }),
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

/**
 * Per-business encrypted secrets vault. One row per (business, kind). Values
 * are AES-256-GCM encrypted at rest (see lib/crypto.ts) and NEVER returned to
 * the client — only a masked preview + "hasValue" is ever exposed. Meta page
 * tokens stay in meta_connections; this holds provider/notification keys a
 * business supplies itself. Kinds are an enum so a typo can't create a
 * silently-unreadable secret.
 */
export const SECRET_KINDS = ["openai_api_key", "telegram_bot_token", "telegram_chat_id"] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];

export const businessSecrets = pgTable(
  "business_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    kind: text("kind", { enum: SECRET_KINDS }).notNull(),
    /** AES-256-GCM ciphertext (v1:iv:data:tag). Empty string never stored. */
    encryptedValue: text("encrypted_value").notNull(),
    /** Last 4 chars, plaintext, for a "…ab12" UI hint only. */
    lastFour: text("last_four").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("business_secrets_unique").on(t.businessId, t.kind)]
);

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
