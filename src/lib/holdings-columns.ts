/** Column weights normalised to 100% so a wide column set never pushes the table past its card (M8). */
export function holdingsColumnWidth(column: string, columns: readonly string[]): number {
  const weight = (c: string) => (c === "asset" ? 22 : c === "actions" ? 14 : c === "qty" || c === "weight" ? 10 : 15);
  const total = columns.reduce((sum, c) => sum + weight(c), 0) || 1;
  return Math.round((weight(column) / total) * 1000) / 10;
}
