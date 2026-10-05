"use client";

import { useLinkStatus } from "next/link";

/**
 * Small spinner shown inside a <Link> while its page data is loading.
 * With children, they are shown normally and replaced by the spinner while loading.
 */
export default function LinkPending({ children }: { children?: React.ReactNode }) {
  const { pending } = useLinkStatus();
  if (pending) return <span className="ad-link-spinner" aria-hidden="true" />;
  return children ?? null;
}
