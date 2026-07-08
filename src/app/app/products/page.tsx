import Link from "next/link";
import { redirect } from "next/navigation";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { listProducts } from "@/lib/products";
import { Badge, Card, EmptyState } from "@/components/ui";
import { deleteProductAction, toggleProductAction } from "@/lib/actions/products";
import { ProductForm } from "./form";

export default async function ProductsPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").toLowerCase();
  const all = await listProducts(business.id);
  const rows = q ? all.filter((p) => `${p.title} ${p.sku} ${p.category}`.toLowerCase().includes(q)) : all;

  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Products</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Your catalog. The bot answers price / stock / colors / sizes from here — never invented. {all.length} products.
        </p>
      </header>

      <ProductForm businessId={business.id} />

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search products…"
          className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        />
        <button className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Search</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No products yet" body="Add your first product above. Each one becomes an authoritative fact source for the bot." />
      ) : (
        <div className="space-y-2">
          {rows.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/products/${p.id}`} className="font-medium hover:text-sky-600 hover:underline">
                    {p.title}
                  </Link>
                  <Badge tone={p.stockStatus === "available" ? "ok" : p.stockStatus === "unavailable" ? "error" : "warn"}>
                    {p.stockStatus}
                  </Badge>
                  {!p.enabled && <Badge>disabled</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
                  {p.price != null ? `${p.price} ${p.currency}` : "price not set"}
                  {p.sku ? ` · ${p.sku}` : ""}
                  {(p.colors as string[])?.length ? ` · ${(p.colors as string[]).join("/")}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <form action={toggleProductAction}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="productId" value={p.id} />
                  <input type="hidden" name="enabled" value={p.enabled ? "false" : "true"} />
                  <button className="rounded-lg border border-[var(--card-border)] bg-white/60 px-2.5 py-1 text-xs hover:bg-white">
                    {p.enabled ? "Disable" : "Enable"}
                  </button>
                </form>
                <form action={deleteProductAction}>
                  <input type="hidden" name="businessId" value={business.id} />
                  <input type="hidden" name="productId" value={p.id} />
                  <button className="rounded-lg px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50">Delete</button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
