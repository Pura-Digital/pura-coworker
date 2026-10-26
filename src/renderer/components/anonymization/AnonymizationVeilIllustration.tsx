/** Decorative scene: sensitive text is veiled before it leaves the device. */
export function AnonymizationVeilIllustration({
  active = true,
  className = '',
}: {
  active?: boolean;
  className?: string;
}) {
  const strength = active ? 1 : 0.45;
  const uid = 'veil-art-v4';

  /** Diagonal veil edge: (140,32) → (80,120) in card space */
  const veilEdgeX = (y: number) => 140 - ((y - 32) * 60) / 88;

  return (
    <svg
      viewBox="0 0 320 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop stopColor="var(--color-accent)" stopOpacity="0.14" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={`${uid}-veil-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--color-surface-hover)" stopOpacity="0.98" />
          <stop offset="1" stopColor="var(--color-surface)" stopOpacity="0.88" />
        </linearGradient>

        <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000" floodOpacity="0.35" />
        </filter>

        <filter id={`${uid}-glow-filter`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5" />
        </filter>

        <clipPath id={`${uid}-card`}>
          <rect x="0" y="32" width="240" height="88" rx="0" />
        </clipPath>

        <clipPath id={`${uid}-clear`}>
          <polygon points="0,32 140,32 80,120 0,120" />
        </clipPath>

        <clipPath id={`${uid}-veil`}>
          <polygon points="140,32 240,32 240,120 80,120" />
        </clipPath>
      </defs>

      <rect width="320" height="180" fill={`url(#${uid}-glow)`} opacity={strength} />

      <g transform="translate(40, 30)">
        <rect
          width="240"
          height="120"
          rx="12"
          fill="var(--color-surface)"
          stroke="currentColor"
          strokeOpacity="0.12"
          filter={`url(#${uid}-shadow)`}
        />

        <path d="M0 32 H240" stroke="currentColor" strokeOpacity="0.08" />
        <circle cx="20" cy="16" r="4" fill="currentColor" fillOpacity="0.15" />
        <circle cx="34" cy="16" r="4" fill="currentColor" fillOpacity="0.15" />
        <circle cx="48" cy="16" r="4" fill="currentColor" fillOpacity="0.15" />

        <g clipPath={`url(#${uid}-card)`} stroke="currentColor" strokeOpacity="0.05">
          <path d="M0 61 H240" />
          <path d="M0 90 H240" />
        </g>

        {/* Clear zone — clipped so values never bleed under the veil */}
        <g clipPath={`url(#${uid}-clear)`}>
          <g
            fill="currentColor"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="9.5"
          >
            <text x="16" y="52" opacity="0.38">Name</text>
            <text x="16" y="81" opacity="0.38">Email</text>
            <text x="16" y="110" opacity="0.38">Phone</text>

            <text x="58" y="52" opacity="0.85">Mario Rossi</text>
            <text x="58" y="81" opacity="0.85">mario@ex…</text>
            <text x="58" y="110" opacity="0.85">+39 333…</text>
          </g>
        </g>

        <g opacity={strength} clipPath={`url(#${uid}-veil)`}>
          <rect width="240" height="120" fill={`url(#${uid}-veil-bg)`} />
        </g>

        <path
          d="M140 32 L80 120"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          opacity={0.95 * strength}
        />
        <path
          d="M140 32 L80 120"
          stroke="var(--color-accent)"
          strokeWidth="8"
          opacity={0.22 * strength}
          filter={`url(#${uid}-glow-filter)`}
        />

        {/* Tokens — only in veil, right-aligned with margin from diagonal */}
        <g clipPath={`url(#${uid}-veil)`} opacity={strength}>
          <g
            fill="var(--color-accent)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="9"
            fontWeight="600"
            textAnchor="start"
          >
            <text x={veilEdgeX(52) + 8} y={52}>{'{{PERSON_1}}'}</text>
            <text x={veilEdgeX(81) + 8} y={81}>{'{{EMAIL_1}}'}</text>
            <text x={veilEdgeX(110) + 8} y={110}>{'{{PHONE_1}}'}</text>
          </g>

          {active && (
            <line x1="80" x2="240" stroke="var(--color-accent)" strokeWidth="1.25" opacity="0.35">
              <animate attributeName="y1" values="32;119;32" dur="3s" repeatCount="indefinite" />
              <animate attributeName="y2" values="32;119;32" dur="3s" repeatCount="indefinite" />
            </line>
          )}
        </g>
      </g>
    </svg>
  );
}
