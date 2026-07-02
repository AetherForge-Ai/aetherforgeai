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

export const files = {
  logoMarkSvg: LOGO_MARK_SVG,
} as const;

export default files;
