"use client";

/**
 * Ultra-light inline sparkline (pure SVG, no chart lib) for the 500-row table —
 * cheap enough to render hundreds of times without jank. Colour reflects the
 * net direction of the series (last vs first point).
 */

import { useId } from "react";

export function Sparkline({
  data,
  width = 96,
  height = 32,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const gradId = useId();
  if (!data || data.length < 2) {
    return <div style={{ width, height }} className={className} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 2;
  const usableH = height - pad * 2;

  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((v - min) / span) * usableH;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  const up = data[data.length - 1] >= data[0];
  const stroke = up ? "#34d399" : "#fb7185"; // emerald-400 / rose-400

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
