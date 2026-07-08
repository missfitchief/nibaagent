/** NibaChat Agent logo — pure SVG, no external assets. */
export function NibaLogo({
  size = 32,
  withText = true,
  markColor,
  plain = false
}: {
  size?: number;
  withText?: boolean;
  /** Solid color for the bubble mark (landing site). Omit for the app's brand gradient. */
  markColor?: string;
  /** Render the wordmark in currentColor instead of the brand gradient on "Agent". */
  plain?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
        <defs>
          <linearGradient id="nibaGrad" x1="4" y1="6" x2="44" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3b82f6" />
            <stop offset="0.55" stopColor="#06b6d4" />
            <stop offset="1" stopColor="#10b981" />
          </linearGradient>
        </defs>
        {/* chat bubble */}
        <path
          d="M24 5C13 5 5 12.4 5 21.5c0 5.2 2.7 9.8 7 12.8V42a1.5 1.5 0 0 0 2.4 1.2l6.4-4.6c1 .13 2.1.2 3.2.2 11 0 19-7.4 19-16.5S35 5 24 5Z"
          fill={markColor ?? "url(#nibaGrad)"}
        />
        {/* spark = AI */}
        <path
          d="M24 13.5l1.9 4.6 4.6 1.9-4.6 1.9-1.9 4.6-1.9-4.6-4.6-1.9 4.6-1.9 1.9-4.6Z"
          fill="#fff"
          opacity="0.95"
        />
        <circle cx="33.5" cy="15" r="1.8" fill="#fff" opacity="0.8" />
      </svg>
      {withText && (
        <span className="font-semibold tracking-tight text-lg leading-none">
          NibaChat {plain ? <span>Agent</span> : <span className="grad-text">Agent</span>}
        </span>
      )}
    </span>
  );
}
