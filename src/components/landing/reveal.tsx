"use client";

import { useEffect } from "react";

/**
 * Progressive-enhancement scroll reveal. Content is visible by default (see
 * globals.css). On mount we only *arm* (hide) `.reveal` elements that are below
 * the fold, then reveal them with `.in` as they scroll into view. Elements
 * already in the viewport are revealed immediately with no flash. If JS is
 * disabled, IntersectionObserver is missing, or the user prefers reduced
 * motion, nothing is ever hidden.
 */
export function Reveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".lp .reveal"));
    if (!els.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );

    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
        el.classList.add("in"); // already visible — show now, no flash
      } else {
        el.classList.add("reveal-armed");
        io.observe(el);
      }
    }
    return () => io.disconnect();
  }, []);

  return null;
}
