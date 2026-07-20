import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { deleteOrderAction, setOrderStatusAction } from "@/lib/actions/inbox";
import { Badge, Card, EmptyState } from "@/components/ui";

const STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"] as const;

export default async function OrdersPage() {
  const user = await requireUser();
  const business = await ownBusiness(user);
  if (!business) redirect("/app/onboarding");

  const rows = await db().select().from(orders).where(eq(orders.businessId, business.id)).orderBy(desc(orders.createdAt)).limit(200);

  return (
    <main className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Orders</h1>
        <p className="text-sm text-[var(--ink-soft)]">
          Orders your AI agent collected in chat.{" "}
          {business.googleSheetUrl ? "Also appended to your Google Sheet." : "Add a Google Sheet in Settings to sync them."}
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No orders yet"
          body="When a customer orders in Messenger or Instagram DM, your agent collects name, address and phone — the order lands here."
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Address</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Sheet</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-t border-[var(--card-border)] align-top">
                    <td className="whitespace-nowrap py-2 pr-4">{o.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="py-2 pr-4">{o.customerName || "—"}</td>
                    <td className="py-2 pr-4">{o.phone || "—"}</td>
                    <td className="py-2 pr-4">
                      {[o.streetAndNumber || o.address, o.city, o.postalCode].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="max-w-[18rem] py-2 pr-4">
                      <span className="line-clamp-2">{o.orderText || "—"}</span>
                    </td>
                    <td className="py-2 pr-4">
                      {o.googleSheetSynced ? <Badge tone="ok">synced</Badge> : o.sheetSyncError ? <Badge tone="error">failed</Badge> : <Badge>db only</Badge>}
                    </td>
                    <td className="py-2 pr-4">
                      <form action={setOrderStatusAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="id" value={o.id} />
                        <select
                          name="status"
                          defaultValue={o.status}
                          className="rounded-lg border border-[var(--card-border)] bg-white/80 px-2 py-1 text-xs"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button className="rounded-lg border border-[var(--card-border)] bg-white/60 px-2 py-1 text-xs hover:bg-white">
                          Set
                        </button>
                      </form>
                    </td>
                    <td className="py-2 pr-4">
                      <form action={deleteOrderAction}>
                        <input type="hidden" name="businessId" value={business.id} />
                        <input type="hidden" name="id" value={o.id} />
                        <button className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
