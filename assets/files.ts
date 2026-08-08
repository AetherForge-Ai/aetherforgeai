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

// ── About page imagery ──
// Serene New Zealand rural landscape at golden hour (rolling hills / farmland)
// — used as the cinematic hero backdrop on the About page.
export const ABOUT_HERO_IMG =
  "https://images.unsplash.com/photo-1444080748397-f442aa95c3e5?auto=format&fit=crop&w=2000&q=80";
// The founder's real portrait — shown in the "Our Story" section of the About page.
// The original passport-blue background was AI-retouched into a soft navy→emerald
// studio backdrop (with a gentle vignette) so it blends with the site palette;
// the face, glasses and shirt are preserved exactly.
export const FOUNDER_PORTRAIT_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/founder-portrait-navy-1783445071851.jpeg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2414165072&Signature=dH%2FOwDzGSS%2F7k3YWzhUA4kV2Sy6FdzWuSYsvkhsmubPuTQn2iPdL5uHkUdCK3%2B999xbFxtFKKCDFsOKKuxk5KcVjZMpVEK36aHK%2FdsL%2BNXJbP2VrqYIvsQ5C0gzOhYxhaCke3qcnx3y1ErY7xnnXSclO6hCJKG4u4fLw%2BRhaCGMp8RrGj9u3D%2Bwf8hVUMCOG6Otv5BcIuaGAqpLEA9PcRL67gyFYxsYGiBNwRP6Ta1%2FEDnsuDz5Do%2B4mdbod6o13nCmMmxtrTYYCxhovXUmGQISIXvTWpCFWBQv4oZCLnyLajqAfFbK96lT%2B5nqKOv0csveFXEA1VyOmz4bEox0KVg%3D%3D";

// AI-generated Apex bot mascots (cartoon geeks deep in thought).
export const BOT_STOCK_MASCOT =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/bot-stock-mascot-1782977793991.png?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2413697794&Signature=0FlB7hip7LmTDUSK3Nhu%2Bdevd6MUTW9TEHdnmFN82sMHHpoxhZ1MV2itaG8LX78hnFkC46BMyFkm7nxEgtGmB9wLiyYBFtCCZukEgIN8Mdtl3wK4QEJF683Ijp%2BVo5Afpy5kybcZlT8dcjZCX1sT9ht2gigk%2BAR3hlLoDZxwq4L1FEJfpzvCQRmT17Mv5gxUtb0rZ6s8LwzgN18QvnkfiOLkS6AXY%2BqlRMvN5DikCA1p9xyO%2FBBnvw5t1Gc6ajrhhqrwQUhMhK53gdpNuY3QsMwOjGkAjTRJd3fzbpAnowJ70AgN3fP2VgOW6O0BNGV5x265oOLEmnN9JhzpywMAcg%3D%3D";

export const BOT_CRYPTO_MASCOT =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/bot-crypto-mascot-1782977811833.png?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2413697812&Signature=NQbejmQ0gQ3b0nj%2F%2B0XVT5eBAyd%2BhLW21yy%2FnW1%2BrvMuWW1fZdk%2FheETvto52URvIiz97vCmMCsNojcVbYVCOhsajhpkSg%2FkOFSjVS8HWWVyqzlGzA5JShFTUbD1ZcYqAQUfyqNG8HnhOzniPXfIF%2B%2FkR6KI7BHhSVZ2VthslZyV0QL01bJYZUcUBwoPfg3k6ZUrxyHqSWPVEx%2F%2BZgPAXS1DwjjNzFeGjEcTfddOgg43QMiDhruRLMsAYl12zaCPEGzw8VHGW5W3ZFFBzl%2BIinb0oRAFRMw%2BTd7w5%2F68vNBLhvpSazOgp%2BBYFgnYqk6Ovd7kOj6SzBG2037bunRiXg%3D%3D";

// ── Bot avatars (cartoon characters that represent each agent) ──
// Cartoon-styled, in-character avatars served as optimized static assets from
// /public/brand. Stox & Koins are geeks in gangster garb (fedora, pinstripes,
// gold chain); Totalum the Architect is a business-man in a sharp tailored
// suit. These are the "little avatars" shown on the dashboard, report center
// and showcases — and the ones that dance while a report generates.
export const BOT_STOX_AVATAR = "/brand/bot-stox.png";
export const BOT_KOINS_AVATAR = "/brand/bot-koins.png";
export const BOT_TOTALUM_AVATAR = "/brand/bot-totalum.png";

// ── Live Results & Performance Proof page ──
// Real, unedited dashboard screenshots captured on 2026-07-08 by the owner and
// stored as static Totalum assets. They document a single multi-asset portfolio
// (NZX · ASX · US equities · crypto · gold) being tracked live through the day.
// Sequence 1→4 tells the timestamped story used on the /performance page.
export const PROOF_TRANSACTIONS_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/1.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098838530&Signature=jxUM%2Fc9%2FiqIUmuNfCWcmsNrMXXd%2FIW6INW3QxRMX%2BqbO%2FgqagMbB%2FqPUjjYNS21Yr%2Fz%2Fjf4b3MHxDpa9LuuNa9i%2BajVBvsXNdjiU4ggKBOeyxkW90pTJ0fSUcEmYI2UxwaMAEuLGMMm2NvZAECh5EWWWaTnxW4A3AeVwynufxKqbVdgcEOS79drWgtGqOE%2BFimjrgTp91VhgW07lB6X91ibUiHj14owb9zB2CMHMXAhJE2UirT%2BAPtYhywnd6HMouYJ3Hym9uk7zqNemppNTcPYcJc8CGtKzljg62X51BJ9KmWdHwjYGNgCq2L4hhYdliFAAtPFU4BYweoqBW9JP7w%3D%3D";
export const PROOF_NETWORTH_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/2.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098838537&Signature=ahL%2BFd%2Bq8ojV0MtDcI9A7sk2R5HRDwkd1uLQDigRwujJk%2F%2ByA6FD2EGax2vQXp0RBboCpOM%2FBJQc4UfhvNjF6ZHQMnf%2BuMAD0ApU3UwpHLEXo6WmJ9PXlIgBftRzZDISEmH4CVG9UVdrUmB7F3T%2B542D7Cj8D0PYbXGe5DF8t%2Fpzrh5Rqk%2FrMai581rN2GBnWJwRmI%2F7qgYCj9SZFQCe1GZXlwN6ZpaJFrpVey0JjD76sKK10tSnT5xR7sjyZkHurpaOygibTEPbpHVq%2FXrsaGt3ql7zXa8EQ3u0ikWB%2FxjlBbTJOersgH23zg4fWeyqLsMcttcNSsSEQ98nKDiE8g%3D%3D";
export const PROOF_CRYPTO_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/3.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098838545&Signature=EuNVt%2F2C2Mxw%2Fwm1E77K7P1E5QKfP3%2FMs%2BJWzx3GOmJaFadc%2Bz5ptwPVduKHCtXc5V1KdMQ6Ha2p4kZH5VtAiEi53pf4NeF4nC3cpK4gVW0qvv%2F6Nz7fGWLqGUElebhhtmfMNcpW%2FqRySfX1ca%2Fixp2S8eEZexyria%2FEnI1DNHPb%2BjRpwI0a1xifhNv40QJaja2EC9B6a1elBM0bGV4Za81%2BRYiK2uQ4O04OolLdsu4vG%2FcqpujuH4nYzUYw19nonXtwUZ8EAI1blTQFAFQXde5i3w3J22t2%2F9lLc0dxtUCdNXtPnaElrrjZ%2Fq7bGMZr13DyPigNzCh%2F20a6coWmgg%3D%3D";
export const PROOF_STOCK_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/4.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098838551&Signature=4oycUu6BnKIFaNpiHJrX3ywWX0WaWs6qTy2KfydqgCKJkCnZm7CQ9o6JwVoXBCgWDwdFPOWDt8qX9MJ%2FBKg2WqlLKqyflsv9nspLruij048JOfupQkMmdaHnnJCwt1j4HoYeYj0HSnyHypp%2F42qnubOzs%2BpcswNa%2BIa1BiQtPmDX4f9a6g04eNYcw3%2FZj11qyytkAu4ATzQQPy0XaWKD9EC8ShYhNEWSzYiDRfLb%2Fy83Yav8%2B6F47pYSspv2YPFvPHIsS9X1FST%2F92vM3hys4CNHtc0eNBo%2FzqNh5DCNN%2BCH5baC79Y3RltUn1IWUZT1d3nxH%2BKIpxblNrxcWHHcGw%3D%3D";
// Final shot of the day — 3:47pm, 8 Jul 2026. Stock book at NZ$56,871.96 with
// unrealised P&L NZ$1,836.51; total net worth NZ$101,931.77, the day's high.
export const PROOF_CLOSE_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/3.47.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098842603&Signature=rFWpkQYWNRDvIqspS%2B0s%2B8J1DrK4CO3Kilq46IFFTWjbFfMMmCuCVGufiq7PLIkdWBElCL02xD2LxW%2FR7otjwQLaLMBwrdJ3R4M9ik7M2cK27%2FLrz71N%2FOyBYGDgN1uoNAaf7wC9f4ujfbWS6meU%2B81ZLxRMQ%2FITuBDv1deh6CBE2i4ZQ0spBCm2wuZmgJAtmMTDPctBjr3QQt519VBhItRMaZd%2BAc%2BNGKpavjmxENHh%2FTkbDaTZoieIojX8PSUCLJndLpJVOFOk2d%2BO6xKa7vOWxU9HY6uj2RGvVDl6DoZstDQlh3kRlGmJhA41%2B3AP6F2PrSeVEfKMr8fKVpsvhw%3D%3D";
// Later-in-day shots — total net worth ticked up again to NZ$102,421.30 with the
// stock book at NZ$57,331.02. The holdings-table view shows the full equities book.
export const PROOF_OVERVIEW_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/5.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098850771&Signature=EdEEqctyfKf6tKovgkjegxDT79i2QWT6pwR7rCYwkW6b0pSzI76%2FHE6E2A3iXRjOMZmWmEqrFL9D0QEuvP92BEGy47b8%2FCMD92Uxfi%2F3cSWebUmeCQ%2BhL8yLQkbhdRAAb1AopD0iSr6RJpBzWnq6q9at1lEXuQtUSa0EVL0svZILQVWs8xziLOIDZ8itDGg%2B6UbsusyuhFdtDjlSwNOYTxPaBmKWg6k0O8nOjvtqOTBxKSZvkj6009v7O97HUIZtCPNEoWpwonCd4Oi7%2Ff%2Fr9OdyVfayU2xM8JCfilWmsE59B50Ya6dkba3w2VDraTtviktM2t1nnda9AHQL1uirRg%3D%3D";
export const PROOF_HOLDINGS_IMG =
  "https://storage.googleapis.com/totalum-live-bucket/aetherforgeai/files/6.jpg?GoogleAccessId=totalum-live%40totalum-live.iam.gserviceaccount.com&Expires=2098850779&Signature=4%2FpBPwiUgkQrD7Eovp%2B4X%2B44lsVVK5iOfx65CeUcCuKc2yIQjJEHcnEX5pLmXaRsQlMjPwlOUlEFpHXmfbFW30Nrr%2FPwJgXqmdP6tfRWmdy2WxwCC0b2XdwNOiL9hE74wiK0YJ6Ibma8na4bid%2BXPxovMxvMGKAscNNkUeoOGCVJLG0UQd4RO9WFVky%2FgJ6tInm7FL0XpdgY26ZJJn4mzRQKpcNnNpgbHJkI%2BHVO1o5hAgNIjWzVCsqtr9LbPnU4QHea6zhu0DMnwkHzDf%2BJLKYkUDM%2FOG6kVKlGvWgEuqtT9rhJuzrRIL0i4y4qFL2sXTobC0UN3bRit8LcrffBLg%3D%3D";

export const files = {
  logoMarkImg: LOGO_MARK_IMG,
  logoIconImg: LOGO_ICON_IMG,
  faviconImg: FAVICON_IMG,
  logoMarkSvg: LOGO_MARK_SVG,
  aboutHeroImg: ABOUT_HERO_IMG,
  founderPortraitImg: FOUNDER_PORTRAIT_IMG,
  botStockMascot: BOT_STOCK_MASCOT,
  botCryptoMascot: BOT_CRYPTO_MASCOT,
  botStoxAvatar: BOT_STOX_AVATAR,
  botKoinsAvatar: BOT_KOINS_AVATAR,
  botTotalumAvatar: BOT_TOTALUM_AVATAR,
  proofTransactionsImg: PROOF_TRANSACTIONS_IMG,
  proofNetworthImg: PROOF_NETWORTH_IMG,
  proofCryptoImg: PROOF_CRYPTO_IMG,
  proofStockImg: PROOF_STOCK_IMG,
  proofCloseImg: PROOF_CLOSE_IMG,
  proofOverviewImg: PROOF_OVERVIEW_IMG,
  proofHoldingsImg: PROOF_HOLDINGS_IMG,
} as const;

export default files;
