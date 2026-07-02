/**
 * Central asset registry for AetherForge AI.
 * All logos / icons / illustrative marks are referenced from here.
 */

// ── Official business logo (Forge Intelligence Limited / AetherForge AI) ──
// The customer's real shield emblem, cleanly cropped onto a transparent
// background and served as an optimized static asset from /public/brand.
// Use LOGO_MARK_IMG anywhere the brand mark is shown.
export const LOGO_MARK_IMG = "/brand/aetherforge-mark.png";
// Full-colour shield on a brand-navy tile (favicon / social / PWA icon).
export const LOGO_ICON_IMG = "/brand/aetherforge-icon-512.png";
export const FAVICON_IMG = "/brand/favicon-32.png";

// Legacy inline SVG fallback mark (kept for reference; superseded by the real
// logo above). A hexagonal "forge" emblem enclosing an ascending candlestick.
export const LOGO_MARK_SVG = `
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="afMarkGrad" x1="8" y1="6" x2="40" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="currentColor" stop-opacity="0.95"/>
      <stop offset="1" stop-color="currentColor" stop-opacity="0.5"/>
    </linearGradient>
  </defs>
  <path d="M24 3.5 40.6 13v22L24 44.5 7.4 35V13L24 3.5Z" fill="currentColor" fill-opacity="0.08"
        stroke="url(#afMarkGrad)" stroke-width="2" stroke-linejoin="round"/>
  <rect x="14.6" y="26" width="3.4" height="9"  rx="1.4" fill="currentColor" fill-opacity="0.5"/>
  <rect x="22.3" y="20" width="3.4" height="15" rx="1.4" fill="currentColor" fill-opacity="0.8"/>
  <rect x="30" y="14" width="3.4" height="21" rx="1.4" fill="currentColor"/>
  <path d="M12.5 24 L24 12 L35.5 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"
        stroke-linejoin="round" fill="none" opacity="0.85"/>
  <path d="M24 7 25.5 10.3 28.8 11.8 25.5 13.3 24 16.6 22.5 13.3 19.2 11.8 22.5 10.3 24 7Z"
        fill="currentColor"/>
</svg>
`;

// AI-generated Apex bot mascots (cartoon geeks deep in thought).
export const BOT_STOCK_MASCOT =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/bot-stock-mascot-1782977793991.png?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2413697794&Signature=0FlB7hip7LmTDUSK3Nhu%2Bdevd6MUTW9TEHdnmFN82sMHHpoxhZ1MV2itaG8LX78hnFkC46BMyFkm7nxEgtGmB9wLiyYBFtCCZukEgIN8Mdtl3wK4QEJF683Ijp%2BVo5Afpy5kybcZlT8dcjZCX1sT9ht2gigk%2BAR3hlLoDZxwq4L1FEJfpzvCQRmT17Mv5gxUtb0rZ6s8LwzgN18QvnkfiOLkS6AXY%2BqlRMvN5DikCA1p9xyO%2FBBnvw5t1Gc6ajrhhqrwQUhMhK53gdpNuY3QsMwOjGkAjTRJd3fzbpAnowJ70AgN3fP2VgOW6O0BNGV5x265oOLEmnN9JhzpywMAcg%3D%3D";

export const BOT_CRYPTO_MASCOT =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/bot-crypto-mascot-1782977811833.png?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2413697812&Signature=NQbejmQ0gQ3b0nj%2F%2B0XVT5eBAyd%2BhLW21yy%2FnW1%2BrvMuWW1fZdk%2FheETvto52URvIiz97vCmMCsNojcVbYVCOhsajhpkSg%2FkOFSjVS8HWWVyqzlGzA5JShFTUbD1ZcYqAQUfyqNG8HnhOzniPXfIF%2B%2FkR6KI7BHhSVZ2VthslZyV0QL01bJYZUcUBwoPfg3k6ZUrxyHqSWPVEx%2F%2BZgPAXS1DwjjNzFeGjEcTfddOgg43QMiDhruRLMsAYl12zaCPEGzw8VHGW5W3ZFFBzl%2BIinb0oRAFRMw%2BTd7w5%2F68vNBLhvpSazOgp%2BBYFgnYqk6Ovd7kOj6SzBG2037bunRiXg%3D%3D";

export const files = {
  logoMarkImg: LOGO_MARK_IMG,
  logoIconImg: LOGO_ICON_IMG,
  faviconImg: FAVICON_IMG,
  logoMarkSvg: LOGO_MARK_SVG,
  botStockMascot: BOT_STOCK_MASCOT,
  botCryptoMascot: BOT_CRYPTO_MASCOT,
} as const;

export default files;
