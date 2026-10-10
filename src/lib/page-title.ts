const BRAND = "AetherForge AI";

/**
 * One document title: the page name, an em dash, then the brand.
 * "Pricing — AetherForge AI | Simple…" and "Example results · AetherForge AI"
 * both become "Pricing — AetherForge AI" / "Example results — AetherForge AI".
 * A home title that already starts with the brand is left as an em-dash tagline.
 */
export function pageTitle(name: string): string {
  let text = name.trim().replace(/\s+/g, " ");
  text = text.replace(/\s+\|.*$/, "");
  const branded = text.match(/^(.*?)\s*[·|—–]\s*AetherForge AI$/);
  if (branded) {
    const page = branded[1].trim();
    if (!page) return BRAND;
    return `${page} — ${BRAND}`;
  }
  if (text.startsWith(BRAND)) return text.replace(/\s*[·|]\s*/g, " — ");
  return `${text} — ${BRAND}`;
}
