"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEdit, requireBusiness } from "../auth/guards";
import { db } from "../db/client";
import { eventLogs } from "../db/schema";
import { scanShopUrl, importScanned, type ScanResult, type ScannedProduct } from "../importer";
import { ingestWebsite, type WebsiteIngestOutcome } from "../website";
import { STOCK_STATUSES } from "../db/schema";
import type { ImportOutcome } from "../importer";

export interface ScanState {
  ok?: boolean;
  error?: string;
  scan?: ScanResult;
}

const ScanInput = z.object({ businessId: z.string().uuid(), url: z.string().min(4).max(500) });

/** Preview: scan a shop URL and return the found products (no writes). */
export async function scanProductsAction(_prev: ScanState, formData: FormData): Promise<ScanState> {
  const parsed = ScanInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a shop URL." };
  const { role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "You don't have permission to import products." };

  const scan = await scanShopUrl(parsed.data.url.trim());
  return { ok: scan.ok, error: scan.ok ? undefined : scan.error, scan };
}

// A scanned product coming back from the preview form (client-serialized JSON).
const ScannedSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional(),
  price: z.number().nullable().optional(),
  currency: z.string().max(8).optional(),
  stockStatus: z.enum(STOCK_STATUSES),
  stockQuantity: z.number().nullable().optional(),
  sku: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  tags: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  url: z.string().max(600).optional(),
  handle: z.string().max(200).optional(),
  imageUrls: z.array(z.string()).default([])
});

export interface ImportState {
  ok?: boolean;
  error?: string;
  outcome?: ImportOutcome;
  website?: WebsiteIngestOutcome;
}

/** Import selected products, then (optionally) ingest website knowledge. */
export async function importProductsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const businessId = String(formData.get("businessId") ?? "");
  if (!z.string().uuid().safeParse(businessId).success) return { error: "Missing business." };
  const { role } = await requireBusiness(businessId, "admin");
  if (!canEdit(role)) return { error: "You don't have permission to import products." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("products") ?? "[]"));
  } catch {
    return { error: "Could not read the selected products." };
  }
  const arr = z.array(ScannedSchema).max(1000).safeParse(raw);
  if (!arr.success) return { error: "The selected products were malformed." };
  if (!arr.data.length) return { error: "Select at least one product to import." };

  const scanned: ScannedProduct[] = arr.data.map((p) => ({
    ...p,
    imageUrls: p.imageUrls ?? []
  }));
  const outcome = await importScanned(businessId, scanned);

  // Optional website knowledge ingestion from the same shop URL.
  let website: WebsiteIngestOutcome | undefined;
  const websiteUrl = String(formData.get("websiteUrl") ?? "").trim();
  if (websiteUrl && String(formData.get("ingestWebsite") ?? "") === "true") {
    website = await ingestWebsite(businessId, websiteUrl);
  }

  await db().insert(eventLogs).values({
    businessId,
    level: "info",
    area: "product_import",
    message: `Uvoz proizvoda: ${outcome.created} novih, ${outcome.updated} ažurirano${website ? `; sajt: ${website.created + website.updated} strana` : ""}`,
    metadata: { created: outcome.created, updated: outcome.updated }
  });
  revalidatePath(`/app/products`);
  revalidatePath(`/admin/businesses/${businessId}`);
  return { ok: true, outcome, website };
}

const WebsiteInput = z.object({ businessId: z.string().uuid(), url: z.string().min(4).max(500) });

/** Standalone: ingest website knowledge (homepage + about/FAQ/delivery/…). */
export async function ingestWebsiteAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const parsed = WebsiteInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a website URL." };
  const { role } = await requireBusiness(parsed.data.businessId, "admin");
  if (!canEdit(role)) return { error: "You don't have permission to add knowledge." };
  const website = await ingestWebsite(parsed.data.businessId, parsed.data.url.trim());
  if (!website.created && !website.updated) return { error: "Couldn't read any pages from that website." };
  revalidatePath(`/app/knowledge`);
  revalidatePath(`/admin/businesses/${parsed.data.businessId}`);
  return { ok: true, website };
}
