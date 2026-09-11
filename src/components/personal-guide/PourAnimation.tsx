"use client";

import { useEffect } from "react";

/**
 * Gold + diamond particles pour from under the header (far left) through a
 * sieve, then assemble into the Personal Guide character ~halfway down.
 * Uses CSS keyframes registered in personal-guide.css.
 */
export function PourAnimation({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="pointer-events-none fixed left-0 top-14 z-[60] h-[70vh] w-28 sm:w-36"
      aria-hidden
    >
      <div className="absolute left-3 top-0 h-3 w-20 rounded-full border border-amber-300/70 bg-gradient-to-b from-amber-200/40 to-amber-700/30 shadow-[0_0_12px_rgba(245,158,11,0.45)] sm:left-5 sm:w-24">
        <div className="absolute inset-x-1 top-1 flex justify-between">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="size-1 rounded-full bg-amber-950/80" />
          ))}
        </div>
      </div>

      {Array.from({ length: 18 }).map((_, i) => {
        const isDiamond = i % 3 === 0;
        const left = 8 + ((i * 7) % 56);
        const delay = (i % 9) * 0.12;
        const dur = 1.6 + (i % 5) * 0.15;
        return (
          <span
            key={i}
            className={
              isDiamond
                ? "pg-particle absolute top-3 size-2 rotate-45 bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
                : "pg-particle absolute top-3 size-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.9)]"
            }
            style={{
              left,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })}

      <img
        src="/brand/bot-personal-guide.svg"
        alt=""
        className="pg-assemble absolute left-1 top-[42%] h-40 w-auto drop-shadow-[0_12px_20px_rgba(0,0,0,0.55)] sm:left-3 sm:h-44"
      />
    </div>
  );
}
