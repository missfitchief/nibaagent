import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";
import { ownBusiness, requireUser } from "@/lib/auth/guards";
import { Card, EmptyState } from "@/components/ui";
import { OrdersTable } from "./orders-table";

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
          <OrdersTable businessId={business.id} rows={rows} />
        </Card>
      )}
    </main>
  );
}
