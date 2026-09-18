"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Fired when the dust pile has formed the FAB / chat silhouette. */
  onBuilt: () => void;
  /** When true, build the open chat window; otherwise the minimized FAB pill. */
  buildOpenChat?: boolean;
};

type Particle = {
  x: number,
  y: number;
  vx: number,
  vy: number;
  r: number;
  life: number;
  settled: boolean;
  hue: number;
};

/**
 * Opposite of Help Assistant PourAnimation: gold dust suddenly flies UP from
 * the bottom-right floor into a pile that becomes the Assistant Guide FAB
 * (or open chat). Canvas is a right-side strip; pointer-events-none.
 */
export function RiseAnimation({ onBuilt, buildOpenChat = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const builtRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Target geometry — matches PortfolioCoach FAB / PortfolioCoachChat
    // FAB: bottom-4 right-3/5, pill ~210×56; chat: bottom-4 right-3/5, ~384×min(70vh,34rem)
    const rightPad = window.innerWidth >= 640 ? 20 : 12; // sm:right-5 vs right-3
    let targetW: number;
    let targetH: number;
    let targetR: number;
    if (buildOpenChat) {
      targetW = Math.min(window.innerWidth - 24, 384);
      targetH = Math.min(window.innerHeight * 0.7, 544);
      targetR = 16;
    } else {
      targetW = 210;
      targetH = 56;
      targetR = 28;
    }
    const targetX = window.innerWidth - rightPad - targetW;
    const targetY = window.innerHeight - targetH - 16; // bottom-4

    const COUNT = 1800;
    const particles: Particle[] = [];
    const spawnX0 = window.innerWidth - 150;
    const spawnX1 = window.innerWidth - 28;
    const floorY = window.innerHeight - 6;

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: spawnX0 + Math.random() * (spawnX1 - spawnX0),
        y: floorY + Math.random() * 18,
        vx: (Math.random() - 0.5) * 0.7,
        // Negative gravity / upward burst from the floor
        vy: -(2.2 + Math.random() * 3.4),
        r: 0.8 + Math.random() * 2.2,
        life: Math.random(),
        settled: false,
        hue: 38 + Math.random() * 18,
      });
    }

    let released = 0;
    const releasePerFrame = 36;
    let frame = 0;
    let pileFill = 0;
    let fadeOut = 0;

    const pointInRoundedRect = (px: number, py: number) => {
      const x = Math.max(targetX + targetR, Math.min(px, targetX + targetW - targetR));
      const y = Math.max(targetY + targetR, Math.min(py, targetY + targetH - targetR));
      if (
        px >= targetX + targetR &&
        px <= targetX + targetW - targetR &&
        py >= targetY &&
        py <= targetY + targetH
      ) {
        return true;
      }
      if (
        py >= targetY + targetR &&
        py <= targetY + targetH - targetR &&
        px >= targetX &&
        px <= targetX + targetW
      ) {
        return true;
      }
      const corners = [
        [targetX + targetR, targetY + targetR],
        [targetX + targetW - targetR, targetY + targetR],
        [targetX + targetR, targetY + targetH - targetR],
        [targetX + targetW - targetR, targetY + targetH - targetR],
      ] as const;
      for (const [cx, cy] of corners) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= targetR * targetR) return true;
      }
      return false;
    };

    const draw = () => {
      if (!running) return;
      frame += 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Ember / vent glow on the bottom-right floor (opposite of pour sieve)
      const ventX = w - 144;
      const ventY = h - 18;
      const ventGrad = ctx.createLinearGradient(ventX, ventY, ventX, ventY + 12);
      ventGrad.addColorStop(0, "rgba(180, 83, 9, 0.75)");
      ventGrad.addColorStop(1, "rgba(253, 230, 138, 0.85)");
      ctx.fillStyle = ventGrad;
      ctx.strokeStyle = "rgba(252, 211, 77, 0.7)";
      ctx.lineWidth = 1;
      roundRect(ctx, ventX, ventY, 120, 10, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(69, 26, 3, 0.85)";
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.arc(ventX + 10 + i * 11, ventY + 5, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (released < COUNT) {
        released = Math.min(COUNT, released + releasePerFrame);
      }

      let settledCount = 0;
      const ceiling = Math.max(48, targetY - 8);

      for (let i = 0; i < released; i++) {
        const p = particles[i];
        if (!p.settled) {
          p.vy -= 0.045; // negative gravity (accelerate upward)
          p.x += p.vx + Math.sin(frame * 0.04 + i) * 0.15;
          p.y += p.vy;

          // Soft funnel toward right-side target as they rise
          if (p.y < h * 0.72) {
            const targetPX = targetX + targetW * (0.2 + (i % 70) / 100);
            p.vx += (targetPX - p.x) * 0.01;
            p.vx *= 0.98;
            // Ease vertical toward target band
            const midY = targetY + targetH * 0.55;
            p.vy += (midY - p.y) * 0.0025;
          }

          // Cap at a soft ceiling then settle into silhouette
          if (p.y - p.r <= ceiling && pileFill < 0.12) {
            p.y = ceiling + p.r;
            p.vy *= -0.15;
            p.vx *= 0.4;
          }

          if (pileFill > 0.15 && pointInRoundedRect(p.x, p.y - 12)) {
            const tx = targetX + targetR + Math.random() * (targetW - targetR * 2);
            const ty = targetY + targetR + Math.random() * (targetH - targetR * 2);
            p.x += (tx - p.x) * 0.12;
            p.y += (ty - p.y) * 0.12;
            if (Math.abs(tx - p.x) < 3 && Math.abs(ty - p.y) < 3) {
              p.settled = true;
              p.vx = 0;
              p.vy = 0;
            }
          }

          // Eventually settle when upward energy fades near target
          if (
            !p.settled &&
            pileFill > 0.05 &&
            p.y < targetY + targetH + 40 &&
            Math.abs(p.vy) < 0.35
          ) {
            p.settled = true;
            p.vx = 0;
            p.vy = 0;
          }
        } else {
          settledCount += 1;
          if (pileFill > 0.05) {
            const tx = targetX + 4 + ((i * 47) % Math.max(1, targetW - 8));
            const fillH = targetH * Math.min(1, pileFill);
            // Fill from bottom of silhouette upward (rising pile)
            const ty = targetY + targetH - 4 - ((i * 31) % Math.max(1, fillH));
            p.x += (tx - p.x) * 0.08;
            p.y += (ty - p.y) * 0.08;
          }
        }

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
        g.addColorStop(0, `hsla(${p.hue}, 95%, 72%, 0.95)`);
        g.addColorStop(0.55, `hsla(${p.hue}, 90%, 55%, 0.75)`);
        g.addColorStop(1, `hsla(${p.hue}, 85%, 40%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      const settleRatio = settledCount / COUNT;
      // Also advance fill once enough particles have risen into the column
      let inColumn = 0;
      for (let i = 0; i < released; i++) {
        const p = particles[i];
        if (p.y < h * 0.85 && p.x > targetX - 40) inColumn += 1;
      }
      if (settleRatio > 0.18 || inColumn / COUNT > 0.35) {
        pileFill = Math.min(1, pileFill + 0.014);
      }

      if (pileFill > 0.08) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, pileFill * 1.2) * (1 - fadeOut);
        const glow = ctx.createLinearGradient(
          targetX,
          targetY,
          targetX,
          targetY + targetH
        );
        glow.addColorStop(0, "rgba(15, 79, 53, 0.55)");
        glow.addColorStop(1, "rgba(6, 38, 26, 0.85)");
        ctx.fillStyle = glow;
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.25 + pileFill * 0.55})`;
        ctx.lineWidth = 1.5;
        const drawH = targetH * Math.max(0.12, pileFill);
        roundRect(
          ctx,
          targetX,
          targetY + targetH - drawH,
          targetW,
          drawH,
          targetR
        );
        ctx.fill();
        ctx.stroke();

        if (pileFill > 0.35 && buildOpenChat) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
          roundRect(ctx, targetX + 1, targetY + 1, targetW - 2, 44, [
            targetR,
            targetR,
            0,
            0,
          ]);
          ctx.fill();
        }
        ctx.restore();
      }

      if (pileFill >= 1 && !builtRef.current) {
        builtRef.current = true;
        fadeOut = 0.001;
        onBuilt();
      }

      if (builtRef.current) {
        fadeOut = Math.min(1, fadeOut + 0.035);
        canvas.style.opacity = String(1 - fadeOut);
        if (fadeOut >= 1) {
          running = false;
          return;
        }
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [onBuilt, buildOpenChat]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-y-0 right-0 z-[45] w-[min(100%,22rem)] overflow-hidden"
      aria-hidden
    />
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[]
) {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  const [tl, tr, br, bl] = radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
