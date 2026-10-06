"use client";

import Icon from "./Icon";

export default function PrintPosterButton() {
  return (
    <button type="button" className="ap-btn ap-btn-gold" onClick={() => window.print()}>
      <Icon name="printer" size={16} /> Print poster
    </button>
  );
}
