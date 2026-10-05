"use client";

import { useEffect } from "react";

/** Navbar, mobile menu and scroll effects for the landing page (same behaviour as the original index.html) */
export default function LandingEffects() {
  useEffect(() => {
    const listeners = new AbortController();
    const { signal } = listeners;
    const observers: IntersectionObserver[] = [];

    const nav = document.getElementById("nav");
    const btn = document.getElementById("menuBtn");
    const panel = document.getElementById("mobilePanel");

    // Nav: deepen glass on scroll
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true, signal });

    // Mobile menu
    const setMenu = (open: boolean) => {
      if (!panel || !btn) return;
      panel.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      btn.querySelector("use")?.setAttribute("href", open ? "#i-x" : "#i-menu");
    };
    btn?.addEventListener("click", () => setMenu(!panel?.classList.contains("open")), { signal });
    panel?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false), { signal }));
    document.addEventListener("keydown", (e) => e.key === "Escape" && setMenu(false), { signal });

    // Reveal on scroll
    const reveals = document.querySelectorAll(".reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add("in");
              io.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      reveals.forEach((el) => io.observe(el));
      observers.push(io);
    } else {
      reveals.forEach((el) => el.classList.add("in"));
    }

    // Stagger service cards + spotlight that follows the pointer
    document.querySelectorAll<HTMLElement>(".svc").forEach((card, i) => {
      card.style.setProperty("--d", `${(i % 5) * 0.06}s`);
      card.addEventListener(
        "pointermove",
        (e) => {
          const r = card.getBoundingClientRect();
          card.style.setProperty("--mx", `${e.clientX - r.left}px`);
          card.style.setProperty("--my", `${e.clientY - r.top}px`);
        },
        { signal },
      );
    });

    // Highlight the nav link of the section in view
    const links = document.querySelectorAll(".nav-links a");
    if ("IntersectionObserver" in window) {
      const so = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${en.target.id}`));
            }
          });
        },
        { rootMargin: "-45% 0px -50% 0px" },
      );
      ["services", "travel", "why", "contact"].forEach((id) => {
        const s = document.getElementById(id);
        if (s) so.observe(s);
      });
      observers.push(so);
    }

    return () => {
      listeners.abort();
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  return null;
}
