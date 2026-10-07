/**
 * One projected 7-day figure for the table, the analysis panel and the chart point.
 * Ranking already uses projected7dPct. The outlook and the +7d price are pulled to it.
 */

export interface ProjectionPoint {
  label: string;
  price: number;
  projected?: boolean;
}

export interface AlignableProjection {
  price: number;
  projected7dPct: number;
  outlook?: { expectedPct: number } | null;
  projection?: ProjectionPoint[] | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function impliedMovePct(price: number, end: number): number | null {
  if (!(price > 0) || !Number.isFinite(end)) return null;
  return round2(((end - price) / price) * 100);
}

/** A rounded end price whose implied percent matches `pct` at two decimals. */
export function endPriceForPct(price: number, pct: number): number {
  const exact = price * (1 + pct / 100);
  const startDp = price < 5 ? 4 : 2;
  for (let dp = startDp; dp <= 8; dp++) {
    const factor = 10 ** dp;
    const step = 1 / factor;
    const rounded = (value: number) => Math.round(value * factor) / factor;
    for (let i = 0; i <= 20; i++) {
      for (const sign of i === 0 ? [0] : [1, -1]) {
        const candidate = rounded(exact + sign * i * step);
        if (candidate > 0 && impliedMovePct(price, candidate) === pct) return candidate;
      }
    }
  }
  return exact > 0 ? exact : price;
}

export function projectionPointPct(
  price: number,
  projection: Array<{ label?: string; price: number }> | null | undefined
): number | null {
  if (!projection?.length) return null;
  const point = [...projection].reverse().find((row) => row.label === "+7d") ?? projection[projection.length - 1];
  return impliedMovePct(price, point.price);
}

export function alignProjectedFigures<T extends AlignableProjection>(row: T): T {
  const pct = round2(row.projected7dPct);
  const end = endPriceForPct(row.price, pct);
  const projection = row.projection?.map((point, index, all) => {
    const isEnd = point.label === "+7d" || index === all.length - 1;
    return isEnd ? { ...point, price: end } : point;
  });
  return {
    ...row,
    projected7dPct: pct,
    outlook: row.outlook ? { ...row.outlook, expectedPct: pct } : row.outlook,
    projection,
  };
}
