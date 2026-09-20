"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { loadLiquidGlassScript, type LiquidGlassController } from "@/lib/liquid-glass";

// Shared glass/glow/hover chrome for the login and sign-up cards. Extracted
// so both forms get the same tilt + border-glow + traveling light-beam
// effect without duplicating the animation markup.
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [10, -10]);
  const rotateY = useTransform(mouseX, [-300, 300], [-10, 10]);

  const glassRef = useRef<HTMLDivElement>(null);
  const [glassApplied, setGlassApplied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller: LiquidGlassController | null = null;

    loadLiquidGlassScript()
      .then(() => {
        if (cancelled || !glassRef.current || !window.liquidGlass) return;
        controller = window.liquidGlass(glassRef.current, {
          scale: -70,
          chroma: 4,
          blur: 6,
          saturate: 1.1,
          fallbackBlur: 20,
        });
        setGlassApplied(controller.supported);
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
      controller?.destroy();
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="relative z-10 w-full max-w-lg lg:h-full lg:max-w-none"
      style={{ perspective: 1500 }}
    >
      <motion.div
        className="relative lg:h-full"
        style={{ rotateX, rotateY }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        whileHover={{ z: 10 }}
      >
        <div className="group relative lg:h-full">
          <motion.div
            className="absolute -inset-px rounded-2xl opacity-0 transition-opacity duration-700 group-hover:opacity-70"
            animate={{
              boxShadow: [
                "0 0 10px 2px rgba(255,255,255,0.03)",
                "0 0 15px 5px rgba(255,255,255,0.05)",
                "0 0 10px 2px rgba(255,255,255,0.03)",
              ],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", repeatType: "mirror" }}
          />

          <div className="absolute -inset-px overflow-hidden rounded-2xl">
            <motion.div
              className="absolute top-0 left-0 h-[3px] w-1/2 bg-gradient-to-r from-transparent via-white to-transparent opacity-70"
              animate={{ left: ["-50%", "100%"], opacity: [0.3, 0.7, 0.3] }}
              transition={{
                left: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 },
                opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror" },
              }}
            />
            <motion.div
              className="absolute top-0 right-0 h-1/2 w-[3px] bg-gradient-to-b from-transparent via-white to-transparent opacity-70"
              animate={{ top: ["-50%", "100%"], opacity: [0.3, 0.7, 0.3] }}
              transition={{
                top: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 0.6 },
                opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: 0.6 },
              }}
            />
            <motion.div
              className="absolute right-0 bottom-0 h-[3px] w-1/2 bg-gradient-to-r from-transparent via-white to-transparent opacity-70"
              animate={{ right: ["-50%", "100%"], opacity: [0.3, 0.7, 0.3] }}
              transition={{
                right: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 1.2 },
                opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: 1.2 },
              }}
            />
            <motion.div
              className="absolute bottom-0 left-0 h-1/2 w-[3px] bg-gradient-to-b from-transparent via-white to-transparent opacity-70"
              animate={{ bottom: ["-50%", "100%"], opacity: [0.3, 0.7, 0.3] }}
              transition={{
                bottom: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 1.8 },
                opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: 1.8 },
              }}
            />
          </div>

          <div className="absolute -inset-[0.5px] rounded-2xl bg-gradient-to-r from-white/3 via-white/7 to-white/3 opacity-0 transition-opacity duration-500 group-hover:opacity-70" />

          <div
            ref={glassRef}
            data-glass-applied={glassApplied}
            className="relative overflow-hidden rounded-2xl border border-white/15 bg-black/45 p-8 shadow-2xl backdrop-blur-2xl lg:flex lg:h-full lg:flex-col lg:justify-center [box-shadow:0_25px_60px_-15px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)]"
          >
            <div className="mb-6 space-y-1.5 text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", duration: 0.8 }}
                className="relative mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/10"
              >
                <span className="bg-gradient-to-b from-white to-white/70 bg-clip-text text-xl font-bold text-transparent">
                  R
                </span>
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50" />
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-2xl font-bold text-transparent"
              >
                {title}
              </motion.h1>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-sm text-white/60"
              >
                {subtitle}
              </motion.p>
            </div>

            {children}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
