"use client";

import { useId } from "react";
import { LOTUS_GRADIENT, LOTUS_SHAPES } from "./lotusShapes";

export default function Lotus({ size = 34 }: { size?: number }) {
  // Each logo needs its own gradient id: with a shared one, a logo inside a hidden
  // element (e.g. the mobile header on desktop) makes the visible logos render blank
  const gradient = `lotus-${useId().replace(/:/g, "")}`;
  const fill = `url(#${gradient})`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          {LOTUS_GRADIENT.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      {LOTUS_SHAPES.map((s) =>
        s.line ? (
          <path key={s.d} fill="none" stroke={fill} strokeWidth="1.6" strokeLinecap="round" d={s.d} />
        ) : (
          <path key={s.d} fill={fill} opacity={s.opacity} d={s.d} />
        ),
      )}
    </svg>
  );
}
