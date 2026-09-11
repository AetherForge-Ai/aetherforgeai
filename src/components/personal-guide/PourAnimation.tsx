"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Props = {
  /** Called once the avatar has fully risen from the powder pile. */
  onAssembled: () => void;
  /** Mid-page avatar leaps away (toward the chat window). */
  jumping?: boolean;
  /** Hide particles/sieve/pool — only show the avatar for the jump beat. */
  avatarOnly?: boolean;
};

/**
 * Dense gold + silver pour from under the header (far left) through a sieve.
 * Dust pools mid-page, then a Help Assistant avatar rises from the pile.
 */
export function PourAnimation({
  onAssembled,
  jumping = false,
  avatarOnly = false,
}: Props) {
  const [showPool, setShowPool] = useState(avatarOnly || jumping);
  const [showAvatar, setShowAvatar] = useState(avatarOnly || jumping);

  const particles = useMemo(() => {
    return Array.from({ length: 90 }, (_, i) => {
      const kind = i % 5 === 0 ? "diamond" : i % 2 === 0 ? "gold" : "silver";
      const left = 4 + ((i * 11) % 72);
      const delay = (i % 18) * 0.055;
      const dur = 1.35 + (i % 7) * 0.12;
      const size = kind === "diamond" ? 5 + (i % 3) : 4 + (i % 4);
      const drift = ((i % 9) - 4) * 6;
      return { i, kind, left, delay, dur, size, drift };
    });
  }, []);

  useEffect(() => {
    if (avatarOnly || jumping) return;
    const poolT = window.setTimeout(() => setShowPool(true), 1100);
    const riseT = window.setTimeout(() => setShowAvatar(true), 2100);
    const doneT = window.setTimeout(onAssembled, 3400);
    return () => {
      window.clearTimeout(poolT);
      window.clearTimeout(riseT);
      window.clearTimeout(doneT);
    };
  }, [onAssembled, avatarOnly, jumping]);

  return (
    <div
      className="pointer-events-none fixed left-0 top-14 z-[60] h-[75vh] w-36 sm:w-44"
      aria-hidden
    >
      {!avatarOnly && !jumping && (
        <>
          <div className="absolute left-2 top-0 h-3.5 w-28 rounded-full border border-amber-300/80 bg-gradient-to-b from-amber-100/50 via-amber-400/40 to-amber-800/40 shadow-[0_0_18px_rgba(245,158,11,0.55)] sm:left-4 sm:w-32">
            <div className="absolute inset-x-1.5 top-1.5 flex justify-between">
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="size-1 rounded-full bg-amber-950/85" />
              ))}
            </div>
          </div>

          {particles.map((p) => {
            const cls =
              p.kind === "diamond"
                ? "pg-particle absolute top-3 rotate-45 bg-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.95)]"
                : p.kind === "silver"
                  ? "pg-particle absolute top-3 rounded-full bg-slate-200 shadow-[0_0_8px_rgba(226,232,240,0.95)]"
                  : "pg-particle absolute top-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.95)]";
            return (
              <span
                key={p.i}
                className={cls}
                style={
                  {
                    left: p.left,
                    width: p.size,
                    height: p.size,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.dur}s`,
                    ["--pg-drift" as string]: `${p.drift}px`,
                  } as CSSProperties
                }
              />
            );
          })}

          <div
            className={`pg-pool absolute left-1/2 top-[48%] h-10 w-28 -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(253,230,138,0.95)_0%,rgba(245,158,11,0.75)_35%,rgba(226,232,240,0.55)_62%,transparent_78%)] blur-[1px] shadow-[0_0_28px_rgba(245,158,11,0.55)] ${showPool ? "is-visible" : ""}`}
          />
          <div
            className={`pg-pool absolute left-1/2 top-[50%] h-6 w-20 -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(236,254,255,0.8)_0%,rgba(148,163,184,0.55)_50%,transparent_75%)] ${showPool ? "is-visible" : ""}`}
            style={{ animationDelay: "1.25s" }}
          />
        </>
      )}

      {showAvatar && (
        <img
          src="/brand/bot-personal-guide.svg"
          alt=""
          className={`absolute left-2 top-[34%] h-44 w-auto drop-shadow-[0_14px_24px_rgba(0,0,0,0.55)] sm:left-4 sm:h-48 ${
            jumping ? "pg-jump" : "pg-rise"
          }`}
        />
      )}
    </div>
  );
}
