import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import { products, productImages, productVariants, type StockStatus } from "./db/schema";

export type ProductRow = typeof products.$inferSelect;

/** Diacritic-insensitive token set. */
function tokens(s: string): Set<string> {
  return new Set(
    String(s ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1)
  );
}

export interface ProductMatch {
  product: ProductRow;
  score: number;
}

/**
 * Match a customer message against ONE business's enabled products. Returns
 * scored candidates, best first. Business-scoped by construction — the query
 * filters on businessId, so it can never surface another tenant's products.
 */
export async function matchProducts(businessId: string, message: string): Promise<ProductMatch[]> {
  const msg = tokens(message);
  if (!msg.size) return [];
  const rows = await db()
    .select()
    .from(products)
    .where(and(eq(products.businessId, businessId), eq(products.enabled, true)));
  const scored: ProductMatch[] = [];
  for (const p of rows) {
    const nameTokens = [...tokens(p.title)];
    if (!nameTokens.length) continue;
    const nameHits = nameTokens.filter((t) => msg.has(t)).length;
    let score = nameHits * 2;
    if (p.sku && msg.has(p.sku.toLowerCase())) score += 4;
    for (const tag of (p.tags as string[]) ?? []) if (msg.has(String(tag).toLowerCase())) score += 0.5;
    if (score > 0) scored.push({ product: p, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/** Compact, grounded product facts for the AI prompt / fact composer. */
export function productFacts(p: ProductRow): string {
  const price = p.price != null ? `${p.price} ${p.currency}` : "price not listed";
  const stock =
    p.stockStatus === "available"
      ? "available to order"
      : p.stockStatus === "unavailable"
        ? "not available"
        : "stock unknown (must verify)";
  const colors = (p.colors as string[])?.length ? ` | colors: ${(p.colors as string[]).join("/")}` : "";
  const sizes = (p.sizes as string[])?.length ? ` | sizes: ${(p.sizes as string[]).join("/")}` : "";
  return `${p.title} — ${price} | ${stock}${colors}${sizes}${p.sku ? ` | sku ${p.sku}` : ""}`;
}

export async function listProducts(businessId: string): Promise<ProductRow[]> {
  return db().select().from(products).where(eq(products.businessId, businessId)).orderBy(desc(products.createdAt));
}

export async function productWithChildren(businessId: string, productId: string) {
  const [product] = await db()
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
    .limit(1);
  if (!product) return null;
  const images = await db().select().from(productImages).where(eq(productImages.productId, productId));
  const variants = await db().select().from(productVariants).where(eq(productVariants.productId, productId));
  return { product, images, variants };
}

export interface ProductInput {
  title: string;
  description?: string;
  price?: number | null;
  currency?: string;
  stockStatus?: StockStatus;
  stockQuantity?: number | null;
  sku?: string;
  category?: string;
  tags?: string[];
  colors?: string[];
  sizes?: string[];
  url?: string;
  enabled?: boolean;
}

export async function createProduct(businessId: string, input: ProductInput): Promise<ProductRow> {
  const [row] = await db()
    .insert(products)
    .values({
      businessId,
      title: input.title.trim(),
      description: input.description ?? "",
      price: input.price == null ? null : String(input.price),
      currency: input.currency ?? "BAM",
      stockStatus: input.stockStatus ?? "unknown",
      stockQuantity: input.stockQuantity ?? null,
      sku: input.sku ?? "",
      category: input.category ?? "",
      tags: input.tags ?? [],
      colors: input.colors ?? [],
      sizes: input.sizes ?? [],
      url: input.url ?? "",
      enabled: input.enabled ?? true
    })
    .returning();
  return row;
}

/** All mutations require the caller to have proven business access first. */
export async function updateProduct(businessId: string, productId: string, input: Partial<ProductInput>): Promise<void> {
  await db()
    .update(products)
    .set({
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.price !== undefined ? { price: input.price == null ? null : String(input.price) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.stockStatus !== undefined ? { stockStatus: input.stockStatus } : {}),
      ...(input.stockQuantity !== undefined ? { stockQuantity: input.stockQuantity } : {}),
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.colors !== undefined ? { colors: input.colors } : {}),
      ...(input.sizes !== undefined ? { sizes: input.sizes } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      updatedAt: new Date()
    })
    .where(and(eq(products.id, productId), eq(products.businessId, businessId)));
}

export async function deleteProduct(businessId: string, productId: string): Promise<void> {
  await db().delete(productImages).where(and(eq(productImages.productId, productId), eq(productImages.businessId, businessId)));
  await db().delete(productVariants).where(and(eq(productVariants.productId, productId), eq(productVariants.businessId, businessId)));
  await db().delete(products).where(and(eq(products.id, productId), eq(products.businessId, businessId)));
}

async function productBelongs(businessId: string, productId: string): Promise<boolean> {
  const owns = await db()
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, businessId)))
    .limit(1);
  return Boolean(owns[0]);
}

export async function addProductImage(businessId: string, productId: string, url: string, alt: string, descriptor = ""): Promise<void> {
  if (!(await productBelongs(businessId, productId))) return;
  await db().insert(productImages).values({ businessId, productId, url: url.trim(), alt: alt.trim(), visualDescriptor: descriptor.trim() });
}

export async function deleteProductImage(businessId: string, imageId: string): Promise<void> {
  await db().delete(productImages).where(and(eq(productImages.id, imageId), eq(productImages.businessId, businessId)));
}

export interface VariantInput {
  name: string;
  price?: number | null;
  sku?: string;
  color?: string;
  size?: string;
  stockStatus?: StockStatus;
}

export async function addVariant(businessId: string, productId: string, input: VariantInput): Promise<void> {
  if (!(await productBelongs(businessId, productId))) return;
  await db().insert(productVariants).values({
    businessId,
    productId,
    name: input.name.trim(),
    price: input.price == null ? null : String(input.price),
    sku: input.sku ?? "",
    color: input.color ?? "",
    size: input.size ?? "",
    stockStatus: input.stockStatus ?? "unknown"
  });
}

export async function deleteVariant(businessId: string, variantId: string): Promise<void> {
  await db().delete(productVariants).where(and(eq(productVariants.id, variantId), eq(productVariants.businessId, businessId)));
}

/** Variants for a set of products, business-scoped, keyed by productId. */
export async function variantsFor(businessId: string, productIds: string[]): Promise<Map<string, (typeof productVariants.$inferSelect)[]>> {
  const map = new Map<string, (typeof productVariants.$inferSelect)[]>();
  if (!productIds.length) return map;
  const rows = await db()
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.businessId, businessId), inArray(productVariants.productId, productIds)));
  for (const v of rows) {
    const list = map.get(v.productId) ?? [];
    list.push(v);
    map.set(v.productId, list);
  }
  return map;
}

/** Product facts including variant color/size lines (used when asked). */
export function variantFacts(vs: (typeof productVariants.$inferSelect)[]): string {
  if (!vs.length) return "";
  return (
    " | variants: " +
    vs
      .slice(0, 12)
      .map((v) => [v.name || v.color || v.size, v.price != null ? `${v.price}` : null, v.color, v.size].filter(Boolean).join(" "))
      .join("; ")
  );
}
