"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEdit, requireBusiness } from "../auth/guards";
import { STOCK_STATUSES } from "../db/schema";
import { addProductImage, addVariant, createProduct, deleteProduct, deleteProductImage, deleteVariant, updateProduct } from "../products";
import { safeSyncCatalog } from "../n8n-sync";
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
  await safeSyncCatalog(business.id);
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
  await safeSyncCatalog(business.id);
  revalidatePath("/app/products");
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const parsed = z.object({ businessId: z.string().uuid(), productId: z.string().uuid(), enabled: z.coerce.boolean() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  await updateProduct(business.id, parsed.data.productId, { enabled: parsed.data.enabled });
  await safeSyncCatalog(business.id);
  revalidatePath("/app/products");
}

export async function addProductImageAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      businessId: z.string().uuid(),
      productId: z.string().uuid(),
      url: z.string().url().max(500),
      alt: z.string().max(200).default(""),
      descriptor: z.string().max(400).default("")
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid image URL." };
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "No permission." };
  await addProductImage(business.id, parsed.data.productId, parsed.data.url, parsed.data.alt, parsed.data.descriptor);
  revalidatePath(`/app/products/${parsed.data.productId}`);
  return { ok: true };
}

export async function deleteProductImageAction(formData: FormData): Promise<void> {
  const parsed = z.object({ businessId: z.string().uuid(), productId: z.string().uuid(), imageId: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  await deleteProductImage(business.id, parsed.data.imageId);
  revalidatePath(`/app/products/${parsed.data.productId}`);
}

export async function addVariantAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      businessId: z.string().uuid(),
      productId: z.string().uuid(),
      name: z.string().max(120).default(""),
      price: z.string().max(20).default(""),
      sku: z.string().max(80).default(""),
      color: z.string().max(60).default(""),
      size: z.string().max(60).default(""),
      stockStatus: z.enum(STOCK_STATUSES).default("unknown")
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid variant." };
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "No permission." };
  if (!parsed.data.name && !parsed.data.color && !parsed.data.size) return { error: "Give the variant a name, color, or size." };
  const priceNum = parsed.data.price.trim() ? Number(parsed.data.price.replace(",", ".")) : null;
  if (priceNum != null && !Number.isFinite(priceNum)) return { error: "Variant price must be a number." };
  await addVariant(business.id, parsed.data.productId, {
    name: parsed.data.name,
    price: priceNum,
    sku: parsed.data.sku,
    color: parsed.data.color,
    size: parsed.data.size,
    stockStatus: parsed.data.stockStatus
  });
  await safeSyncCatalog(business.id);
  revalidatePath(`/app/products/${parsed.data.productId}`);
  return { ok: true };
}

export async function deleteVariantAction(formData: FormData): Promise<void> {
  const parsed = z.object({ businessId: z.string().uuid(), productId: z.string().uuid(), variantId: z.string().uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business, role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return;
  await deleteVariant(business.id, parsed.data.variantId);
  await safeSyncCatalog(business.id);
  revalidatePath(`/app/products/${parsed.data.productId}`);
}
