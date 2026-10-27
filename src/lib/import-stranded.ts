/** b85 H-10: an import funding deposit whose batch has no buy or sell left. */
export function strandedImportDeposit(
  target: { _id?: string; type?: string | null; notes?: string | null },
  rows: readonly { _id?: string; type?: string | null; notes?: string | null }[]
): boolean {
  if (String(target.type || "") !== "deposit") return false;
  const notes = String(target.notes || "");
  if (!notes.includes("is recorded because this buy would otherwise make paper cash negative")) return false;
  const batch = notes.match(/batch=(imp[0-9a-f]+)/)?.[1];
  if (!batch) return false;
  return !rows.some(
    (row) => row._id !== target._id && (row.type === "buy" || row.type === "sell") && String(row.notes || "").includes(`batch=${batch}`)
  );
}
