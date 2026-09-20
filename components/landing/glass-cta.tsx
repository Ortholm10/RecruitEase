"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { loadLiquidGlassScript, type LiquidGlassController } from "@/lib/liquid-glass";

// Apple-style liquid-glass pill. The refraction (SVG displacement backdrop)
// comes from /liquid-glass.js; the tint, inner highlight and sheen live in
// landing.css — that is what makes it read as glass rather than a blur.
export function GlassCta({
  href,
  children,
  className = "",
  size = "lg",
}: {
  href: string;
  children: ReactNode;
  className?: string;
  size?: "lg" | "sm";
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller: LiquidGlassController | null = null;

    loadLiquidGlassScript()
      .then(() => {
        if (cancelled || !ref.current || !window.liquidGlass) return;
        controller = window.liquidGlass(ref.current, {
          scale: size === "lg" ? -140 : -100,
          chroma: 6,
          blur: 3,
          saturate: 1.4,
          fallbackBlur: 14,
        });
        setSupported(controller.supported);
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
      controller?.destroy();
    };
  }, [size]);

  return (
    <Link
      ref={ref}
      href={href}
      data-glass={supported}
      className={`sp-glass sp-glass-${size} ${className}`}
    >
      <span className="sp-glass-sheen" aria-hidden="true" />
      <span className="sp-glass-label">{children}</span>
      <svg className="sp-disc" viewBox="0 0 65 65" fill="none" aria-hidden="true">
        <circle cx="32.5" cy="32.5" r="32.5" fill="white" />
        <path
          d="M24 32C23.4477 32 23 32.4477 23 33C23 33.5523 23.4477 34 24 34V33V32ZM42.7071 33.7071C43.0976 33.3166 43.0976 32.6834 42.7071 32.2929L36.3431 25.9289C35.9526 25.5384 35.3195 25.5384 34.9289 25.9289C34.5384 26.3195 34.5384 26.9526 34.9289 27.3431L40.5858 33L34.9289 38.6569C34.5384 39.0474 34.5384 39.6805 34.9289 40.0711C35.3195 40.4616 35.9526 40.4616 36.3431 40.0711L42.7071 33.7071ZM24 33V34H42V33V32H24V33Z"
          fill="black"
        />
      </svg>
    </Link>
  );
}
