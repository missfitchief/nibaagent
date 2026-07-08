"use client";

import { useActionState } from "react";
import { addProductImageAction, addVariantAction } from "@/lib/actions/products";
import type { ActionState } from "@/lib/actions/business";
import { Button, ErrorNote, Input } from "@/components/ui";

export function AddImageForm({ businessId, productId }: { businessId: string; productId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addProductImageAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input name="url" type="url" required placeholder="https://…/image.jpg" className="sm:col-span-1" />
        <Input name="alt" placeholder="Alt text" />
        <Input name="descriptor" placeholder="Visual descriptor (optional)" />
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "…" : "Add image"}
      </Button>
    </form>
  );
}

export function AddVariantForm({ businessId, productId }: { businessId: string; productId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(addVariantAction, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input name="name" placeholder="Name (e.g. Gold / M)" />
        <Input name="color" placeholder="Color" />
        <Input name="size" placeholder="Size" />
        <Input name="price" placeholder="Price (optional)" />
        <Input name="sku" placeholder="SKU (optional)" />
        <select
          name="stockStatus"
          defaultValue="unknown"
          className="rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
        >
          <option value="available">available</option>
          <option value="unavailable">unavailable</option>
          <option value="unknown">unknown</option>
        </select>
      </div>
      <ErrorNote>{state.error}</ErrorNote>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "…" : "Add variant"}
      </Button>
    </form>
  );
}
