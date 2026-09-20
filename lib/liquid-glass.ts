"use client";

// Singleton loader for /liquid-glass.js. Extracted from auth-card.tsx so the
// landing-page CTAs and the auth cards share one script tag and one promise —
// two module-level promises would each append their own <script>.

export type LiquidGlassOptions = Partial<{
  scale: number;
  chroma: number;
  border: number;
  mapBlur: number;
  blur: number;
  saturate: number;
  radius: number;
  fallbackBlur: number;
}>;

export type LiquidGlassController = {
  supported: boolean;
  refresh: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    liquidGlass?: (el: HTMLElement, opts?: LiquidGlassOptions) => LiquidGlassController;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadLiquidGlassScript(): Promise<void> {
  if (window.liquidGlass) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="/liquid-glass.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load /liquid-glass.js")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "/liquid-glass.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load /liquid-glass.js"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}
