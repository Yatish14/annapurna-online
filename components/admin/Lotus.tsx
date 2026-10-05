"use client";

import { useId } from "react";

export default function Lotus({ size = 34 }: { size?: number }) {
  // Each logo needs its own gradient id: with a shared one, a logo inside a hidden
  // element (e.g. the mobile header on desktop) makes the visible logos render blank
  const gradient = `lotus-${useId().replace(/:/g, "")}`;
  const fill = `url(#${gradient})`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6e3ad" />
          <stop offset=".55" stopColor="#e2bd67" />
          <stop offset="1" stopColor="#b08834" />
        </linearGradient>
      </defs>
      <path fill={fill} d="M24 8c4 4.5 6 9 6 13.5 0 4-2.2 7.6-6 10.5-3.8-2.9-6-6.5-6-10.5C18 17 20 12.5 24 8z" />
      <path
        fill={fill}
        opacity=".85"
        d="M10 17c5 .3 9 2.2 11.5 5.6 2 2.8 2.6 6 2.5 9.4-3.6.3-7-.5-9.6-2.8C11.7 26.6 10.4 22.4 10 17zM38 17c-5 .3-9 2.2-11.5 5.6-2 2.8-2.6 6-2.5 9.4 3.6.3 7-.5 9.6-2.8 2.7-2.6 4-6.8 4.4-12.2z"
      />
      <path
        fill={fill}
        opacity=".6"
        d="M4 27c4.5-.8 9 0 13 2.6 2.6 1.7 4.8 3.8 7 6.4-4.6 1.4-9.3 1.2-13.2-.8C7.6 33.6 5.4 30.8 4 27zM44 27c-4.5-.8-9 0-13 2.6-2.6 1.7-4.8 3.8-7 6.4 4.6 1.4 9.3 1.2 13.2-.8 3.2-1.6 5.4-4.4 6.8-8.2z"
      />
      <path fill="none" stroke={fill} strokeWidth="1.6" strokeLinecap="round" d="M10 41h28" />
    </svg>
  );
}
