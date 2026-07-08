import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ownBusiness, requireBusiness, requireUser } from "@/lib/auth/guards";
import { productWithChildren } from "@/lib/products";
import { Badge, Card } from "@/components/ui";
import { deleteProductImageAction, deleteVariantAction } from "@/lib/actions/products";
import { AddImageForm, AddVariantForm } from "./forms";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  await requireBusiness(business.id, "admin"); // owner/admin only for edits
  const { id } = await params;
  const data = await productWithChildren(business.id, id);
  if (!data) notFound();
  const { product, images, variants } = data;

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <Link href="/app/products" className="text-sm text-sky-600 hover:underline">
        ← All products
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">{product.title}</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          {product.price != null ? `${product.price} ${product.currency}` : "no price"} ·{" "}
          <Badge tone={product.stockStatus === "available" ? "ok" : product.stockStatus === "unavailable" ? "error" : "warn"}>{product.stockStatus}</Badge>
        </p>
      </header>

      <Card>
        <h2 className="font-semibold">Images</h2>
        {images.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No images yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {images.map((img) => (
              <li key={img.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] bg-white/60 p-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {img.url} {img.alt ? `— ${img.alt}` : ""} {img.visualDescriptor ? `(${img.visualDescriptor})` : ""}
                </span>
                <form action={deleteProductImageAction}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="imageId" value={img.id} />
                  <button className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <AddImageForm businessId={business.id} productId={product.id} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Variants</h2>
        {variants.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--ink-soft)]">No variants. Add sizes/colors so the bot can answer variant questions.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--card-border)] bg-white/60 p-2 text-sm">
                <span className="min-w-0 flex-1">
                  {[v.name, v.color, v.size].filter(Boolean).join(" · ")} {v.price != null ? `— ${v.price}` : ""}{" "}
                  <Badge tone={v.stockStatus === "available" ? "ok" : v.stockStatus === "unavailable" ? "error" : "warn"}>{v.stockStatus}</Badge>
                </span>
                <form action={deleteVariantAction}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="variantId" value={v.id} />
                  <button className="rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <AddVariantForm businessId={business.id} productId={product.id} />
        </div>
      </Card>
    </main>
  );
}
