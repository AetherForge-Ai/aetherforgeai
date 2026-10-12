/**
 * A slow holdings read copies `shares` before live quotes return. A trade that
 * commits during that window must not be painted with the earlier quantity.
 */

export interface QuantitySnapshot {
  _id?: string;
  shares?: number;
  purchase_price?: number;
}

export function mergeFreshQuantities<T extends QuantitySnapshot>(snapshot: T[], fresh: QuantitySnapshot[]): T[] {
  const byId = new Map<string, QuantitySnapshot>();
  for (const row of fresh) {
    if (row?._id) byId.set(String(row._id), row);
  }
  const merged = snapshot.map((row) => {
    const next = row?._id ? byId.get(String(row._id)) : undefined;
    if (!next) return row;
    return {
      ...row,
      shares: next.shares,
      purchase_price: next.purchase_price,
    };
  });
  const seen = new Set(merged.map((row) => (row?._id ? String(row._id) : "")));
  for (const row of fresh) {
    const id = row?._id ? String(row._id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(row as T);
  }
  return merged;
}
