"use client";

import { useEffect, useRef, useState } from "react";

// Applies the existing rise-in keyframe (tailwind.config.ts) the first time
// a section scrolls into view, instead of only on initial mount -- reused
// across every page in the funnel so scroll motion isn't homepage-only.
export function RevealOnScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${visible ? "animate-rise-in" : "opacity-0"} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
