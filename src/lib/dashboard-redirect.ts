/**
 * Old dashboard addresses open the one dashboard.
 * Incoming query params stay. view or tab from this page replaces the same key.
 */
export function dashboardRedirectHref(
  searchParams: Record<string, string | string[] | undefined>,
  set: { view?: "shares" | "crypto" | "metals" | "cash"; tab?: "transactions" | "income" | "insights" | "holdings" }
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value == null) continue;
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) params.append(key, item);
  }
  if (set.view) params.set("view", set.view);
  if (set.tab) params.set("tab", set.tab);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}
