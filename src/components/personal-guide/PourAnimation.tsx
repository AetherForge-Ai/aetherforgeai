"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** Fired when the dust pile has formed the chat-window silhouette. */
  onBuilt: () => void;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  settled: boolean;
  hue: number;
};

/**
 * Dense gold dust pours from under the header (far left), falls to the bottom
 * of the viewport, piles up, and builds into the open chat-window silhouette.
 * Canvas-backed for ~20× denser particle count without DOM thrash.
 */
export function PourAnimation({ onBuilt }: Props) {
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

    // Target chat window geometry (matches PersonalGuideChat layout)
    const chatW = Math.min(window.innerWidth - 24, 352);
    const chatH = Math.min(window.innerHeight * 0.5, 448);
    const chatX = 12; // left-3
    const chatY = window.innerHeight - chatH - 16; // bottom-4
    const chatR = 16;

    // ~20× denser than the prior 90-particle DOM pour
    const COUNT = 1800;
    const particles: Particle[] = [];
    const spawnX0 = 28;
    const spawnX1 = 140;
    const spawnY = 56; // under sticky header

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: spawnX0 + Math.random() * (spawnX1 - spawnX0),
        y: spawnY - Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.55,
        vy: 1.6 + Math.random() * 2.8,
        r: 0.8 + Math.random() * 2.2,
        life: Math.random(),
        settled: false,
        hue: 38 + Math.random() * 18, // gold/amber range
      });
    }

    // Stagger release so it reads as a continuous pour
    let released = 0;
    const releasePerFrame = 28;
    let frame = 0;
    let pileFill = 0; // 0..1 how filled the chat silhouette is
    let fadeOut = 0;

    const pointInRoundedRect = (px: number, py: number) => {
      const x = Math.max(chatX + chatR, Math.min(px, chatX + chatW - chatR));
      const y = Math.max(chatY + chatR, Math.min(py, chatY + chatH - chatR));
      // inside core rect
      if (
        px >= chatX + chatR &&
        px <= chatX + chatW - chatR &&
        py >= chatY &&
        py <= chatY + chatH
      ) {
        return true;
      }
      if (
        py >= chatY + chatR &&
        py <= chatY + chatH - chatR &&
        px >= chatX &&
        px <= chatX + chatW
      ) {
        return true;
      }
      // corners
      const corners = [
        [chatX + chatR, chatY + chatR],
        [chatX + chatW - chatR, chatY + chatR],
        [chatX + chatR, chatY + chatH - chatR],
        [chatX + chatW - chatR, chatY + chatH - chatR],
      ] as const;
      for (const [cx, cy] of corners) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= chatR * chatR) return true;
      }
      return false;
    };

    const draw = () => {
      if (!running) return;
      frame += 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Sieve under header
      const sieveGrad = ctx.createLinearGradient(24, 48, 24, 62);
      sieveGrad.addColorStop(0, "rgba(253, 230, 138, 0.85)");
      sieveGrad.addColorStop(1, "rgba(180, 83, 9, 0.75)");
      ctx.fillStyle = sieveGrad;
      ctx.strokeStyle = "rgba(252, 211, 77, 0.7)";
      ctx.lineWidth = 1;
      roundRect(ctx, 24, 52, 120, 10, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(69, 26, 3, 0.85)";
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.arc(34 + i * 11, 57, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }

      if (released < COUNT) {
        released = Math.min(COUNT, released + releasePerFrame);
      }

      let settledCount = 0;
      const floor = h - 8;

      for (let i = 0; i < released; i++) {
        const p = particles[i];
        if (!p.settled) {
          p.vy += 0.045; // gravity
          p.x += p.vx + Math.sin(frame * 0.04 + i) * 0.15;
          p.y += p.vy;

          // Soft funnel toward chat column as they near bottom
          if (p.y > h * 0.55) {
            const targetX = chatX + chatW * (0.15 + (i % 70) / 100);
            p.vx += (targetX - p.x) * 0.008;
            p.vx *= 0.98;
          }

          if (p.y + p.r >= floor) {
            p.y = floor - p.r;
            p.settled = true;
            p.vy = 0;
            p.vx *= 0.2;
          }

          // Once enough dust is down, snap into the chat silhouette
          if (pileFill > 0.15 && pointInRoundedRect(p.x, p.y + 20)) {
            // attract into window volume
            const tx = chatX + chatR + Math.random() * (chatW - chatR * 2);
            const ty = chatY + chatR + Math.random() * (chatH - chatR * 2);
            p.x += (tx - p.x) * 0.12;
            p.y += (ty - p.y) * 0.12;
            if (Math.abs(tx - p.x) < 3 && Math.abs(ty - p.y) < 3) {
              p.settled = true;
              p.vx = 0;
              p.vy = 0;
            }
          }
        } else {
          settledCount += 1;
          // Keep settled particles inside growing fill of chat rect
          if (pileFill > 0.05) {
            const tx = chatX + 4 + ((i * 47) % Math.max(1, chatW - 8));
            const fillH = chatH * Math.min(1, pileFill);
            const ty = chatY + chatH - 4 - ((i * 31) % Math.max(1, fillH));
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

      // Begin building the window once a critical mass has landed
      const settleRatio = settledCount / COUNT;
      if (settleRatio > 0.22) {
        pileFill = Math.min(1, pileFill + 0.012);
      }

      // Chat silhouette outline as dust builds it
      if (pileFill > 0.08) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, pileFill * 1.2) * (1 - fadeOut);
        const glow = ctx.createLinearGradient(chatX, chatY, chatX, chatY + chatH);
        glow.addColorStop(0, "rgba(15, 79, 53, 0.55)");
        glow.addColorStop(1, "rgba(6, 38, 26, 0.85)");
        ctx.fillStyle = glow;
        ctx.strokeStyle = `rgba(251, 191, 36, ${0.25 + pileFill * 0.55})`;
        ctx.lineWidth = 1.5;
        roundRect(ctx, chatX, chatY, chatW, chatH * Math.max(0.12, pileFill), chatR);
        ctx.fill();
        ctx.stroke();

        // Title bar shimmer
        if (pileFill > 0.35) {
          ctx.fillStyle = "rgba(245, 158, 11, 0.28)";
          roundRect(ctx, chatX + 1, chatY + 1, chatW - 2, 44, [chatR, chatR, 0, 0]);
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
  }, [onBuilt]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-y-0 left-0 z-[45] w-[min(100%,18rem)] overflow-hidden"
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
