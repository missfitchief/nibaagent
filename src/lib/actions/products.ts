"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEdit, requireBusiness } from "../auth/guards";
import { STOCK_STATUSES } from "../db/schema";
import { addProductImage, createProduct, deleteProduct, updateProduct } from "../products";
import type { ActionState } from "./business";

const csv = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const ProductInput = z.object({
  businessId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(""),
  price: z.string().max(20).default(""),
  currency: z.string().max(8).default("BAM"),
  stockStatus: z.enum(STOCK_STATUSES).default("unknown"),
  sku: z.string().max(80).default(""),
  category: z.string().max(80).default(""),
  url: z.string().max(500).default("")
});

export async function saveProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ProductInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "A product needs at least a title." };
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "You don't have permission to edit products." };

  const priceNum = parsed.data.price.trim() ? Number(parsed.data.price.replace(",", ".")) : null;
  if (priceNum != null && !Number.isFinite(priceNum)) return { error: "Price must be a number (or empty for unknown)." };

  const input = {
    title: parsed.data.title,
    description: parsed.data.description,
    price: priceNum,
    currency: parsed.data.currency,
    stockStatus: parsed.data.stockStatus,
    sku: parsed.data.sku,
    category: parsed.data.category,
    url: parsed.data.url,
    tags: csv(formData.get("tags")),
    colors: csv(formData.get("colors")),
    sizes: csv(formData.get("sizes"))
  };

  if (parsed.data.productId) await updateProduct(business.id, parsed.data.productId, input);
  else await createProduct(business.id, input);
  revalidatePath("/app/products");
  revalidatePath(`/admin/businesses/${business.id}`);
  return { ok: true };
}

const ProductId = z.object({ businessId: z.string().uuid(), productId: z.string().uuid() });

export async function deleteProductAction(formData: FormData): Promise<void> {
  const parsed = ProductId.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  await deleteProduct(business.id, parsed.data.productId);
  revalidatePath("/app/products");
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const parsed = z.object({ businessId: z.string().uuid(), productId: z.string().uuid(), enabled: z.coerce.boolean() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  await updateProduct(business.id, parsed.data.productId, { enabled: parsed.data.enabled });
  revalidatePath("/app/products");
}

export async function addProductImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({ businessId: z.string().uuid(), productId: z.string().uuid(), url: z.string().url().max(500), alt: z.string().max(200).default("") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid image URL." };
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "No permission." };
  await addProductImage(business.id, parsed.data.productId, parsed.data.url, parsed.data.alt);
  revalidatePath("/app/products");
  return { ok: true };
}
