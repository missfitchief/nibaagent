import { Card } from "@/components/ui";

type IdeaGroup = {
  title: string;
  type: string;
  items: string[];
};

const GROUPS: IdeaGroup[] = [
  {
    title: "Products & prices",
    type: "Products & prices",
    items: [
      "Exact price per item/variant, and the currency — the bot is told never to invent a price, so if it's not here it won't answer",
      "Colors, sizes and materials, with which ones are actually in stock right now",
      "SKU or product code, if customers reference it",
      "What's NOT available anymore (discontinued items) — otherwise the bot may still \"remember\" it from old chat imports"
    ]
  },
  {
    title: "Delivery & payment",
    type: "Business info / rules",
    items: [
      "Delivery price, and whether it changes by city/region",
      "How long delivery takes (e.g. \"1–3 business days\")",
      "Free-delivery threshold, if you have one (\"free over 50 KM\")",
      "Accepted payment methods (cash on delivery, card, bank transfer)"
    ]
  },
  {
    title: "Returns, exchanges & warranty",
    type: "Business info / rules",
    items: [
      "Return/exchange window (how many days) and condition requirements",
      "Who pays return shipping",
      "Warranty terms, if any"
    ]
  },
  {
    title: "Real customer questions (FAQ)",
    type: "FAQ (question & answer)",
    items: [
      "Add each FAQ the way a customer actually TYPES it, not a formal title — \"Kolika je poštarina?\" and \"Koliko košta dostava?\" can both be worth adding separately if customers phrase it both ways",
      "Sizing/fit questions (\"koji je moj broj\", ring/bracelet sizing)",
      "\"Da li imate na stanju...\" for anything that sells out often",
      "Anything customers keep asking that isn't answered anywhere yet — check the \"unanswered questions\" list if your plan has it"
    ]
  },
  {
    title: "Hours, contact & handoff",
    type: "Business info / rules",
    items: [
      "Working hours and days closed (holidays)",
      "Physical store address, if you have one customers can visit or pick up from",
      "When the bot should hand off to a human (already configurable under Bot settings — handoff words)"
    ]
  },
  {
    title: "Promotions & rules",
    type: "Business info / rules",
    items: [
      "Active discount codes and what they apply to",
      "Minimum order for a promo/bundle deal",
      "End date of a promotion — remove it from here once it's over, an expired promo the bot still quotes is worse than none"
    ]
  }
];

export function KnowledgeIdeas() {
  return (
    <Card className="border-sky-200 bg-sky-50/40">
      <details open className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className="inline-flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>💡</span> Ideas: what's worth adding to your agent's knowledge
          </span>
          <span aria-hidden className="text-[var(--ink-soft)] transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="mt-4 space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="text-sm font-semibold">{g.title}</h3>
              <p className="text-xs text-[var(--ink-soft)]">Add as: {g.type}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-[var(--ink-soft)]">
                {g.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 text-xs text-[var(--ink-soft)]">
            <strong className="text-[var(--ink)]">How the bot actually searches this:</strong> it matches on shared
            WORDS between the customer's message and what you've written here — not general topic similarity. Two
            short, differently-phrased entries about the same thing beat one long formal one. Use the same words your
            customers actually use (including common misspellings), and keep each entry focused on one topic so the
            right one gets picked.
          </div>
        </div>
      </details>
    </Card>
  );
}
