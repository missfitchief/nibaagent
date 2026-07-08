"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NibaLogo } from "@/components/logo";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" }
];

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="lp-header" data-scrolled={scrolled} data-open={open}>
      <nav
        className={`mx-auto flex max-w-6xl items-center justify-between px-5 py-4 transition-colors ${
          scrolled ? "text-[color:var(--ink-warm)]" : "text-white"
        }`}
        aria-label="Primary"
      >
        <Link href="/" className="shrink-0" aria-label="NibaChat Agent home">
          <NibaLogo markColor="#dd8a57" plain />
        </Link>

        <div className="hidden items-center gap-8 text-sm md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="opacity-80 transition hover:opacity-100">
              {n.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className={`pill ${scrolled ? "pill-ghost" : "pill-glass"} !px-4 !py-2 !text-sm`}
          >
            Log in
          </Link>
          <Link href="/signup" className="pill pill-solid !px-5 !py-2 !text-sm">
            Start free
          </Link>
        </div>

        {/* mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-current/25 md:hidden"
        >
          <span className="relative block h-3.5 w-4">
            <span className={`absolute left-0 block h-0.5 w-4 bg-current transition ${open ? "top-1.5 rotate-45" : "top-0"}`} />
            <span className={`absolute left-0 top-1.5 block h-0.5 w-4 bg-current transition ${open ? "opacity-0" : "opacity-100"}`} />
            <span className={`absolute left-0 block h-0.5 w-4 bg-current transition ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
          </span>
        </button>
      </nav>

      {/* mobile panel */}
      {open && (
        <div className="border-t border-[color:var(--line)] bg-[color:var(--paper)]/95 backdrop-blur-md md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4 text-[color:var(--ink-warm)]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-xl px-2 py-3 text-base hover:bg-black/5">
                {n.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2">
              <Link href="/login" onClick={() => setOpen(false)} className="pill pill-ghost flex-1">
                Log in
              </Link>
              <Link href="/signup" onClick={() => setOpen(false)} className="pill pill-solid flex-1">
                Start free
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
