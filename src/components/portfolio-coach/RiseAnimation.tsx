"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Fired when the dust pile has formed the FAB / chat silhouette. */
  onBuilt: () => void;
  /** When true, build the open chat window; otherwise the minimized FAB pill. */
  buildOpenChat?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  settled: boolean;
  hue: number;
};

/**
 * Opposite of Help Assistant PourAnimation: gold dust bursts UP from the
 * bottom-right floor, arcs (fountain), and piles into the Assistant Guide FAB
 * (or open chat). Always calls onBuilt within a failsafe timeout.
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
    const onBuiltRef = { current: onBuilt };
    onBuiltRef.current = onBuilt;

    const finish = () => {
      if (builtRef.current) return;
      builtRef.current = true;
      onBuiltRef.current();
    };

    // Hard failsafe — never leave the user stuck without the chatbot.
    const failsafe = window.setTimeout(() => {
      finish();
      running = false;
      if (canvas) canvas.style.opacity = "0";
    }, 4500);

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

    const rightPad = window.innerWidth >= 640 ? 20 : 12;
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
    const targetY = window.innerHeight - targetH - 16;

    const COUNT = 1400;
    const particles: Particle[] = [];
    const spawnX0 = window.innerWidth - 160;
    const spawnX1 = window.innerWidth - 24;
    const floorY = window.innerHeight - 8;

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: spawnX0 + Math.random() * (spawnX1 - spawnX0),
        y: floorY - Math.random() * 10,
        vx: (Math.random() - 0.5) * 1.2,
        // Strong upward burst, then normal gravity pulls them into an arc.
        vy: -(4.5 + Math.random() * 5.5),
        r: 0.8 + Math.random() * 2.1,
        settled: false,
        hue: 38 + Math.random() * 18,
      });
    }

    let released = 0;
    const releasePerFrame = 48;
    let frame = 0;
    let pileFill = 0;
    let fadeOut = 0;

    const draw = () => {
      if (!running) return;
      frame += 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Floor vent glow (bottom-right)
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
      const midTargetX = targetX + targetW * 0.5;
      const midTargetY = targetY + targetH * 0.55;

      for (let i = 0; i < released; i++) {
        const p = particles[i];
        if (!p.settled) {
          // Normal gravity after the upward burst (fountain arc).
          p.vy += 0.14;
          p.x += p.vx + Math.sin(frame * 0.05 + i) * 0.12;
          p.y += p.vy;

          // Funnel toward FAB / chat as they peak and fall.
          if (p.vy > -1.5 || p.y < h * 0.75) {
            p.vx += (midTargetX - p.x) * 0.012;
            p.vx *= 0.97;
            p.vy += (midTargetY - p.y) * 0.004;
          }

          // Snap / settle into the silhouette once near it.
          const nearX = p.x > targetX - 30 && p.x < targetX + targetW + 30;
          const nearY = p.y > targetY - 40 && p.y < targetY + targetH + 50;
          if (nearX && nearY && (p.vy > 0 || pileFill > 0.1)) {
            const tx = targetX + 6 + ((i * 47) % Math.max(1, targetW - 12));
            const ty = targetY + 6 + ((i * 31) % Math.max(1, targetH - 12));
            p.x += (tx - p.x) * 0.18;
            p.y += (ty - p.y) * 0.18;
            if (Math.hypot(tx - p.x, ty - p.y) < 5 || pileFill > 0.45) {
              p.settled = true;
              p.vx = 0;
              p.vy = 0;
              p.x = tx;
              p.y = ty;
            }
          }

          // Floor catch — if they fall past the vent, kick them back up once.
          if (!p.settled && p.y > floorY + 4) {
            p.y = floorY;
            p.vy = -(2.2 + Math.random() * 2.5);
            p.vx += (midTargetX - p.x) * 0.02;
          }

          // Off-screen safety: settle into target
          if (!p.settled && (p.y < -40 || p.x < 0 || p.x > w + 40)) {
            p.settled = true;
            p.x = targetX + 6 + ((i * 47) % Math.max(1, targetW - 12));
            p.y = targetY + 6 + ((i * 31) % Math.max(1, targetH - 12));
            p.vx = 0;
            p.vy = 0;
          }
        } else {
          settledCount += 1;
          const tx = targetX + 4 + ((i * 47) % Math.max(1, targetW - 8));
          const fillH = Math.max(8, targetH * Math.min(1, Math.max(0.15, pileFill)));
          const ty = targetY + targetH - 4 - ((i * 31) % Math.max(1, fillH));
          p.x += (tx - p.x) * 0.1;
          p.y += (ty - p.y) * 0.1;
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

      const settleRatio = settledCount / Math.max(1, released);
      // Advance fill once a meaningful share has settled, or after enough frames.
      if (settleRatio > 0.12 || frame > 90) {
        pileFill = Math.min(1, pileFill + 0.018);
      }
      if (frame > 160) {
        pileFill = Math.min(1, pileFill + 0.03);
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
        roundRect(ctx, targetX, targetY + targetH - drawH, targetW, drawH, targetR);
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
        finish();
        fadeOut = 0.001;
      }

      if (builtRef.current) {
        fadeOut = Math.min(1, fadeOut + 0.04);
        canvas.style.opacity = String(1 - fadeOut);
        if (fadeOut >= 1) {
          running = false;
          window.clearTimeout(failsafe);
          return;
        }
      }

      raf = window.requestAnimationFrame(draw);
    };

    raf = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      window.clearTimeout(failsafe);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [onBuilt, buildOpenChat]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[45]"
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
