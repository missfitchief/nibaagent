"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated hero product vignette — a short looping "NibaChat handling a DM"
 * demo, rendered as real HTML text (no baked-in image text). Progressive
 * enhancement: it renders the COMPLETE conversation by default (SSR / no-JS /
 * reduced-motion all show the finished state); once mounted with motion
 * allowed, it resets and plays the loop. Everything animates opacity/transform
 * only, so there is no layout shift.
 *
 * Phase gate:
 *  1 customer bubble · 2 typing · 3 reply · 4 order card · 5-7 status chips · 8 hold → reset
 */
const DONE = 8;

export function HeroDemo() {
  const [phase, setPhase] = useState<number>(DONE); // SSR + no-JS = finished state
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // stay static
    // Per-step dwell (ms). Longer hold at the end, brief blank on reset.
    const steps = [420, 900, 1100, 950, 700, 620, 620, 2600, 360];
    // Start from the finished state (matches SSR); the first tick resets to 0
    // and the loop plays. setState only ever runs inside the timeout (async),
    // never synchronously in the effect body.
    let p = DONE;
    const tick = () => {
      p = p >= DONE ? 0 : p + 1;
      setPhase(p);
      timer.current = setTimeout(tick, steps[p] ?? 800);
    };
    timer.current = setTimeout(tick, 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const show = (n: number) => (phase >= n ? "hd-in" : "");
  const typing = phase === 2;

  return (
    <div className="hd-card" aria-hidden="true">
      {/* top bar */}
      <div className="hd-top">
        <span className="hd-avatar">N</span>
        <div className="hd-id">
          <span className="hd-name">NibaChat</span>
          <span className="hd-sub">
            <span className="hd-dot" /> Automatski odgovor
          </span>
        </div>
        <span className="hd-channel">Instagram DM</span>
      </div>

      {/* transcript */}
      <div className="hd-body">
        <div className={`hd-msg hd-cust ${show(1)}`}>
          Zdravo 👋 Imate li ovu haljinu u broju <strong>M</strong>? Može li dostava danas?
        </div>

        {/* typing shows only during phase 2; reply takes its place from phase 3 */}
        {typing ? (
          <div className="hd-msg hd-bot hd-typing hd-in">
            <span className="hd-tdot" />
            <span className="hd-tdot" />
            <span className="hd-tdot" />
          </div>
        ) : (
          <div className={`hd-msg hd-bot ${show(3)}`}>
            Imamo broj <strong>M</strong> ✓ Dostava danas je moguća za porudžbine do 15h. Da rezervišem za Vas?
          </div>
        )}

        {/* order card */}
        <div className={`hd-order ${show(4)}`}>
          <div className="hd-order-head">
            <span>Porudžbina</span>
            <span className="hd-order-tag">Spremno za potvrdu</span>
          </div>
          <div className="hd-order-row">
            <span>Lanena haljina — bež</span>
            <span className="hd-order-price">5.900 RSD</span>
          </div>
          <div className="hd-order-meta">
            <span>Broj: M</span>
            <span>Dostava: danas</span>
          </div>
        </div>

        {/* status chips */}
        <div className="hd-chips">
          <span className={`hd-chip ${show(5)}`}>✓ Kupac odgovoren</span>
          <span className={`hd-chip ${show(6)}`}>✓ Porudžbina uhvaćena</span>
          <span className={`hd-chip ${show(7)}`}>✓ Tim obavešten</span>
        </div>
      </div>
    </div>
  );
}
