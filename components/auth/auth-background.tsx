import type { ReactNode } from "react";

// Login/signup backdrop: full-bleed moon-walk video loop, with the glass
// card floating on the right (unchanged layout/effects) over it.
export function AuthBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-svh w-full overflow-hidden bg-black">
      <video
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
        src="/media/moon-walk.mp4"
        poster="/media/moon-walk-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
      />
      {/* Tames the video's bright/dark swings so the translucent card stays
          legible through the whole loop, without needing to opaque it up. */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-black/35" />

      <div className="relative z-10 flex min-h-svh w-full items-center justify-center p-6 md:p-10 lg:absolute lg:inset-y-0 lg:right-0 lg:block lg:w-[38%] lg:min-w-[420px] lg:p-8">
        {children}
      </div>
    </div>
  );
}
