"use client";

import { useRef, useState } from "react";
import type { DailyPoint } from "./daily-series";

export type { DailyPoint };

// Validated pair (node scripts/validate_palette.js — all checks pass, light mode):
// sky-600 for AI replies, violet-600 for all messages. Fixed, categorical — never cycled.
const AI_COLOR = "#0284c7";
const TOTAL_COLOR = "#7c3aed";

const W = 720;
const H = 220;
const PAD_L = 34;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 26;

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function MessagesChart({ daily }: { daily: DailyPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (daily.length === 0) return null;

  const max = Math.max(1, ...daily.map((d) => d.total));
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = daily.length;
  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  const pathFor = (key: "total" | "ai") => daily.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(" ");

  const gridSteps = [0, 0.5, 1];
  const last = daily[daily.length - 1];

  const handleMove: React.MouseEventHandler<SVGSVGElement> = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    // Nearest data index to the pointer's plot-space X.
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(x(i) - px);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  };

  const hovered = hoverIdx != null ? daily[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Recessive gridlines + value ticks */}
        {gridSteps.map((s) => {
          const gy = PAD_T + plotH - s * plotH;
          return (
            <g key={s}>
              <line x1={PAD_L} y1={gy} x2={W - PAD_R} y2={gy} stroke="var(--card-border)" strokeWidth={1} />
              <text x={PAD_L - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--ink-soft)">
                {Math.round(max * s)}
              </text>
            </g>
          );
        })}

        {/* X-axis: first day, a midpoint, and the last day labeled "Today" */}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i, k) => (
          <text key={k} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={9} fill="var(--ink-soft)">
            {i === n - 1 ? "Today" : fmtDay(daily[i].day)}
          </text>
        ))}

        {/* Lines — 2px, round join/cap */}
        <path d={pathFor("total")} fill="none" stroke={TOTAL_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <path d={pathFor("ai")} fill="none" stroke={AI_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* End markers (>=8px) with a surface ring, + end value labels */}
        <circle cx={x(n - 1)} cy={y(last.total)} r={4.5} fill={TOTAL_COLOR} stroke="var(--surface, #fff)" strokeWidth={2} />
        <circle cx={x(n - 1)} cy={y(last.ai)} r={4.5} fill={AI_COLOR} stroke="var(--surface, #fff)" strokeWidth={2} />
        <text x={x(n - 1) + 7} y={y(last.total) + 3} fontSize={10} fill="var(--ink)" fontWeight={600}>
          {last.total}
        </text>
        <text x={x(n - 1) + 7} y={y(last.ai) + 3} fontSize={10} fill="var(--ink)" fontWeight={600}>
          {last.ai}
        </text>

        {/* Crosshair + hover points */}
        {hovered && (
          <>
            <line x1={x(hoverIdx!)} y1={PAD_T} x2={x(hoverIdx!)} y2={PAD_T + plotH} stroke="var(--ink-soft)" strokeWidth={1} strokeDasharray="2 2" />
            <circle cx={x(hoverIdx!)} cy={y(hovered.total)} r={4} fill={TOTAL_COLOR} stroke="var(--surface, #fff)" strokeWidth={2} />
            <circle cx={x(hoverIdx!)} cy={y(hovered.ai)} r={4} fill={AI_COLOR} stroke="var(--surface, #fff)" strokeWidth={2} />
          </>
        )}

        {/* Invisible hit layer covering the whole plot — bigger than the marks themselves */}
        <rect x={PAD_L} y={0} width={plotW} height={H} fill="transparent" />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border border-[var(--card-border)] bg-white px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `${(x(hoverIdx!) / W) * 100}%`, transform: hoverIdx! > n / 2 ? "translateX(-100%)" : undefined }}
        >
          <div className="font-medium text-[var(--ink)]">{fmtDay(hovered.day)}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: TOTAL_COLOR }} />
            <span className="text-[var(--ink-soft)]">All messages</span>
            <strong>{hovered.total}</strong>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: AI_COLOR }} />
            <span className="text-[var(--ink-soft)]">AI replies</span>
            <strong>{hovered.ai}</strong>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-xs text-[var(--ink-soft)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: TOTAL_COLOR }} /> All messages
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: AI_COLOR }} /> AI replies
        </span>
      </div>
    </div>
  );
}
