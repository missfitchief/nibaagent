"use client";

import { useEffect, useRef, useState } from "react";

/** Landing-page demo bot. 100% static answers — never calls AI (cost: €0). */
const DEMO_QA: Array<{ q: string; a: string }> = [
  { q: "What is the delivery price?", a: "Delivery is €3.50, and free for orders over €50. 🚚" },
  { q: "What is the delivery time?", a: "Orders ship within 24h and usually arrive in 2–3 working days." },
  { q: "How can I order?", a: "Just tell me what you'd like! I'll take your name, address and phone number right here in chat. 🛒" },
  { q: "Do you work on Instagram and Facebook?", a: "Yes! One NibaChat agent answers both your Instagram DMs and Facebook Messenger — same knowledge, same tone." }
];

interface Msg {
  from: "user" | "bot";
  text: string;
}

export function DemoBot() {
  const [messages, setMessages] = useState<Msg[]>([
    { from: "bot", text: "Hi! I'm a NibaChat demo agent. Tap a question below 👇" }
  ]);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function ask(qa: { q: string; a: string }) {
    if (typing) return;
    setMessages((m) => [...m, { from: "user", text: qa.q }]);
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [...m, { from: "bot", text: qa.a }]);
      setTyping(false);
    }, 900);
  }

  return (
    <div className="glass glass-strong flex h-[26rem] w-full max-w-md flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-4 py-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <span className="text-sm font-medium">NibaChat Agent — live demo</span>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`bubble-in max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
              m.from === "bot"
                ? "rounded-bl-sm border border-[var(--card-border)] bg-white/90"
                : "ml-auto rounded-br-sm bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
            }`}
          >
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-sm border border-[var(--card-border)] bg-white/90 px-3 py-2.5">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t border-[var(--card-border)] p-3">
        {DEMO_QA.map((qa) => (
          <button
            key={qa.q}
            onClick={() => ask(qa)}
            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100"
          >
            {qa.q}
          </button>
        ))}
      </div>
    </div>
  );
}
