"use client";

import { useEffect, useRef, useState } from "react";

/** Landing demo agent. 100% static answers — never calls AI (cost: €0). */
const DEMO_QA: Array<{ q: string; a: string }> = [
  { q: "Koliko košta dostava?", a: "Dostava je 350 din, a besplatna za porudžbine preko 5.000 din. 🚚" },
  { q: "What's the delivery time?", a: "Orders ship within 24h and usually arrive in 2–3 working days." },
  { q: "Kako da poručim?", a: "Recite mi šta želite — uzeću Vaše ime, adresu i broj telefona ovde u poruci. 🛒" },
  { q: "Do you reply on Instagram too?", a: "Yes — one agent answers both Instagram DMs and Facebook Messenger, same knowledge and tone." }
];

interface Msg {
  from: "user" | "bot";
  text: string;
}

export function AgentDemo() {
  const [messages, setMessages] = useState<Msg[]>([{ from: "bot", text: "Zdravo! 👋 I'm a NibaChat demo agent — tap a question below." }]);
  const [typing, setTyping] = useState(false);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function ask(qa: { q: string; a: string }) {
    if (typing || asked.has(qa.q)) return;
    setAsked((s) => new Set(s).add(qa.q));
    setMessages((m) => [...m, { from: "user", text: qa.q }]);
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [...m, { from: "bot", text: qa.a }]);
      setTyping(false);
    }, 850);
  }

  return (
    <div className="mx-auto flex h-[30rem] w-full max-w-sm flex-col overflow-hidden rounded-[1.75rem] border border-[color:var(--line)] bg-white shadow-[0_30px_70px_-40px_rgba(13,26,38,0.55)]">
      {/* header */}
      <div className="flex items-center gap-2.5 border-b border-[color:var(--line)] px-4 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--night)] text-xs font-semibold text-white">N</span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-[color:var(--ink-warm)]">NibaChat Agent</div>
          <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--muted-2)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Active now
          </div>
        </div>
      </div>

      {/* transcript */}
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-[color:var(--paper)] p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`bubble-in max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-snug ${
              m.from === "bot"
                ? "rounded-bl-md border border-[color:var(--line)] bg-white text-[color:var(--ink-warm)]"
                : "ml-auto rounded-br-md bg-[color:var(--ember-strong)] text-white"
            }`}
          >
            {m.text}
          </div>
        ))}
        {typing && (
          <div className="flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md border border-[color:var(--line)] bg-white px-3 py-3">
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[color:var(--muted-2)]" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[color:var(--muted-2)]" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[color:var(--muted-2)]" />
          </div>
        )}
      </div>

      {/* quick questions */}
      <div className="flex flex-wrap gap-1.5 border-t border-[color:var(--line)] bg-white p-3">
        {DEMO_QA.map((qa) => (
          <button
            key={qa.q}
            onClick={() => ask(qa)}
            disabled={asked.has(qa.q)}
            className="rounded-full border border-[color:var(--line)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-warm)] transition hover:border-[color:var(--ember)] hover:text-[color:var(--ember-strong)] disabled:opacity-40"
          >
            {qa.q}
          </button>
        ))}
      </div>
    </div>
  );
}
