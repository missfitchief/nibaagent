/** Blog seed content — stored in code for the MVP, editable later via CMS/DB. */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  body: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-facebook-instagram-businesses-need-ai-chat-automation",
    title: "Why Facebook and Instagram businesses need AI chat automation",
    description:
      "Social-commerce customers expect answers in minutes. Here is why AI agents became essential for pages that sell in DMs.",
    date: "2026-07-01",
    body: [
      "If your business sells through Instagram DMs or Facebook Messenger, your inbox is your storefront. Every unanswered “cena?” or “koliko je poštarina?” is a customer walking out of the shop.",
      "Studies of social commerce consistently show that reply time is the strongest predictor of conversion: answers within 5 minutes convert several times better than answers within 5 hours. No small team can hold that bar manually, at night, on weekends, during holidays.",
      "An AI agent answers the repetitive 80% instantly — price, delivery, ordering, availability — and hands the complex 20% to a human. The math is simple: faster answers, more orders, less time glued to the phone.",
      "NibaChat Agent connects to your Facebook Page and Instagram in one login, learns your products and FAQs, and starts answering in your tone — with a human takeover switch always one tap away."
    ]
  },
  {
    slug: "how-ai-agents-save-time-in-customer-support",
    title: "How AI agents save time in customer support",
    description: "A realistic breakdown of the hours an AI agent gives back to a small business every week.",
    date: "2026-07-02",
    body: [
      "A typical small social-commerce shop answers 30–100 messages per day. At 2–3 minutes per message, that is 1–5 hours of typing — every day.",
      "Most of those messages are the same ten questions: delivery price, delivery time, how to order, sizes, availability, payment methods. An AI agent answers those instantly and consistently, without copy-paste fatigue and without mistakes at 23:47.",
      "Our estimate model is conservative: a support worker costs about €600/month, and each AI-handled reply saves about two minutes. At 50 messages a day, that is roughly €80–100 of working time per month — from the cheapest plan.",
      "Time saved is not just money: it is evenings back, faster shipping (because you are packing instead of typing), and customers who never wait."
    ]
  },
  {
    slug: "collect-orders-automatically-from-instagram-dm",
    title: "How to collect orders automatically from Instagram DMs",
    description: "From “želim da naručim” to a structured order in your Google Sheet — without lifting a finger.",
    date: "2026-07-03",
    body: [
      "The moment a customer says they want to order, the clock starts. Ask for details too slowly and enthusiasm cools; ask in a messy thread and you ship to the wrong address.",
      "NibaChat Agent detects order intent and switches to collection mode: full name, street and number, city, postal code, phone, and what they are ordering. Politely, one message, in your language.",
      "The completed order is saved to your dashboard and appended to your own Google Sheet — the same sheet your packing table already uses. If the sheet is unreachable, the order is safely stored in the app and flagged for retry.",
      "For order-status questions, the agent answers honestly: “We will check and let you know soon” — and pings a human, instead of inventing tracking numbers."
    ]
  },
  {
    slug: "why-fast-replies-increase-sales",
    title: "Why fast replies increase sales",
    description: "Reply speed is the highest-leverage conversion factor in DM commerce. The data and the mechanism.",
    date: "2026-07-04",
    body: [
      "DM shoppers are impulse shoppers. They saw the reel, they want the necklace, they ask the price. If the answer arrives while the desire is hot, they buy; if it arrives tomorrow, they scrolled on long ago.",
      "Meta’s own guidance pushes pages toward fast response badges for a reason: response time is trust. A page that answers in seconds feels staffed, professional, real. A page that answers in a day feels like a risk.",
      "There is also a ranking effect: pages with consistently fast responses get better placement in inbox and discovery surfaces.",
      "An AI agent is the only way to answer in seconds, 24/7, without hiring a night shift. Even in cautious draft mode, prepared answers cut your response time in half."
    ]
  },
  {
    slug: "human-handoff-best-practices",
    title: "Human handoff best practices",
    description: "The AI answers the routine; humans handle the delicate. How to draw that line safely.",
    date: "2026-07-05",
    body: [
      "The fastest way to ruin a customer relationship is a bot that pretends to be human while mishandling a complaint. The handoff line must be sharp.",
      "Trigger words are the foundation: reklamacija, problem, kasni, agent, čovek, hitno — when the customer says them, the bot goes silent and a human is notified. NibaChat lets every business tune its own list.",
      "Silence after handoff matters as much as the handoff itself. Our agent stays quiet for 24 hours after a human takes over — no awkward bot interruptions mid-apology.",
      "Review your handoff list weekly at the start: every conversation there is either a missing FAQ (teach the bot) or a genuinely human case (keep it human). That loop is how the agent gets smarter without ever guessing."
    ]
  },
  {
    slug: "ai-chatbot-for-small-balkan-businesses",
    title: "AI chatbot for small Balkan businesses",
    description: "Serbian, Bosnian, Croatian — DM commerce in the Balkans has its own rules. NibaChat was built for them.",
    date: "2026-07-06",
    body: [
      "Balkan social commerce runs on Instagram DMs, cash on delivery, and trust. Customers write “jel ima?”, “može pouzećem?”, “šaljete za Banja Luku?” — short, informal, and expecting a human-fast answer.",
      "Generic chatbots trained for English e-commerce stumble here. NibaChat Agent speaks Serbian, Bosnian and Croatian natively, understands pouzeće and poštarina, and answers with the polite forms local customers expect.",
      "It also respects how these shops actually operate: orders in a Google Sheet, notifications in a Telegram group, one owner doing everything from a phone.",
      "Start free, connect your page in one login, add your ten most common questions — and let the agent take the night shift."
    ]
  }
];

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
