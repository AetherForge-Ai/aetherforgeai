/**
 * Central asset registry for AetherForge AI.
 * All logos / icons / illustrative marks are referenced from here.
 */

// Inline SVG brand mark (an "A" formed by an ascending candlestick chart).
export const LOGO_MARK_SVG = `
<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="6"  y="22" width="4" height="12" rx="1.5" fill="currentColor" opacity="0.55"/>
  <rect x="14" y="15" width="4" height="19" rx="1.5" fill="currentColor" opacity="0.75"/>
  <rect x="22" y="9"  width="4" height="25" rx="1.5" fill="currentColor"/>
  <rect x="30" y="4"  width="4" height="30" rx="1.5" fill="currentColor" opacity="0.9"/>
  <path d="M4 34h32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.35"/>
</svg>
`;

// AI-generated Zenith bot mascots (cartoon geeks deep in thought).
export const BOT_STOCK_MASCOT =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/bot-stock-mascot-1782977793991.png?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2413697794&Signature=0FlB7hip7LmTDUSK3Nhu%2Bdevd6MUTW9TEHdnmFN82sMHHpoxhZ1MV2itaG8LX78hnFkC46BMyFkm7nxEgtGmB9wLiyYBFtCCZukEgIN8Mdtl3wK4QEJF683Ijp%2BVo5Afpy5kybcZlT8dcjZCX1sT9ht2gigk%2BAR3hlLoDZxwq4L1FEJfpzvCQRmT17Mv5gxUtb0rZ6s8LwzgN18QvnkfiOLkS6AXY%2BqlRMvN5DikCA1p9xyO%2FBBnvw5t1Gc6ajrhhqrwQUhMhK53gdpNuY3QsMwOjGkAjTRJd3fzbpAnowJ70AgN3fP2VgOW6O0BNGV5x265oOLEmnN9JhzpywMAcg%3D%3D";

export const BOT_CRYPTO_MASCOT =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/bot-crypto-mascot-1782977811833.png?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2413697812&Signature=NQbejmQ0gQ3b0nj%2F%2B0XVT5eBAyd%2BhLW21yy%2FnW1%2BrvMuWW1fZdk%2FheETvto52URvIiz97vCmMCsNojcVbYVCOhsajhpkSg%2FkOFSjVS8HWWVyqzlGzA5JShFTUbD1ZcYqAQUfyqNG8HnhOzniPXfIF%2B%2FkR6KI7BHhSVZ2VthslZyV0QL01bJYZUcUBwoPfg3k6ZUrxyHqSWPVEx%2F%2BZgPAXS1DwjjNzFeGjEcTfddOgg43QMiDhruRLMsAYl12zaCPEGzw8VHGW5W3ZFFBzl%2BIinb0oRAFRMw%2BTd7w5%2F68vNBLhvpSazOgp%2BBYFgnYqk6Ovd7kOj6SzBG2037bunRiXg%3D%3D";

export const files = {
  logoMarkSvg: LOGO_MARK_SVG,
  botStockMascot: BOT_STOCK_MASCOT,
  botCryptoMascot: BOT_CRYPTO_MASCOT,
} as const;

export default files;
