import { LOTUS_GRADIENT, LOTUS_LINE_COLOR, LOTUS_SHAPES } from "./lotusShapes";

const PETALS = LOTUS_SHAPES.filter((s) => !s.line);
const BASE = LOTUS_SHAPES.find((s) => s.line)!;

/**
 * The installed app's loading screen: the lotus fills up with liquid gold while the dashboard loads.
 * app/launch shows it (the app's start_url), then opens the dashboard; it stays until the dashboard is ready.
 */
export default function LaunchSplash() {
  return (
    <div className="sp-splash" role="status" aria-label="Opening Annapurna">
      <svg className="sp-lotus" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="sp-gold" x1="0" y1="0" x2="1" y2="1">
            {LOTUS_GRADIENT.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
          {/* The "liquid": a wavy surface that slides sideways while it rises from the base to the top.
              A mask, not a clipPath: a clipPath can't hold a group (<g>), and the rise and the wave need one each.
              White shows the gold under it; everywhere else stays empty. */}
          <mask id="sp-liquid" maskUnits="userSpaceOnUse" x="-4" y="-4" width="56" height="56">
            <g className="sp-rise">
              <path className="sp-wave" fill="#fff" d="M0 4q6-3 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0V60H0z" />
            </g>
          </mask>
        </defs>
        {/* The empty lotus: thin gold outlines */}
        {PETALS.map((s) => (
          <path key={`o${s.d}`} className="sp-outline" d={s.d} />
        ))}
        {/* The same petals in gold, shown only below the liquid's surface */}
        <g className="sp-fill" mask="url(#sp-liquid)">
          {PETALS.map((s) => (
            <path key={`f${s.d}`} d={s.d} fill="url(#sp-gold)" opacity={s.opacity} />
          ))}
        </g>
        <path className="sp-base" d={BASE.d} stroke={LOTUS_LINE_COLOR} />
      </svg>
      <strong className="sp-name">Annapurna</strong>
      <span className="sp-tag">Admin console</span>
    </div>
  );
}
