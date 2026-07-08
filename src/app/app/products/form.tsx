"use client";

import { useActionState } from "react";
import { saveProductAction } from "@/lib/actions/products";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label } from "@/components/ui";

export function ProductForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveProductAction, {});
  return (
    <Card className="glass-strong">
      <h2 className="font-semibold">Add a product</h2>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" name="title" required placeholder="Magnetne Narukvice - Spoj Srca" />
          </div>
          <div>
            <Label htmlFor="price">Price (empty = unknown)</Label>
            <Input id="price" name="price" placeholder="35.90" />
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" name="currency" defaultValue="BAM" />
          </div>
          <div>
            <Label htmlFor="stockStatus">Stock</Label>
            <select
              id="stockStatus"
              name="stockStatus"
              defaultValue="unknown"
              className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            >
              <option value="available">available (orderable)</option>
              <option value="unavailable">unavailable</option>
              <option value="unknown">unknown</option>
            </select>
          </div>
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" name="sku" />
          </div>
          <div>
            <Label htmlFor="colors">Colors (comma-separated)</Label>
            <Input id="colors" name="colors" placeholder="zlatna, srebrna" />
          </div>
          <div>
            <Label htmlFor="sizes">Sizes (comma-separated)</Label>
            <Input id="sizes" name="sizes" placeholder="S, M, L" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" name="tags" placeholder="narukvica, parovi, magnetna" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Product saved ✓</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add product"}
        </Button>
      </form>
    </Card>
  );
}
