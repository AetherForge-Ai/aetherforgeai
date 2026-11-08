/**
 * b89 START-3: placeholder for the small first-step offer. Every field is empty on purpose:
 * no Stripe product, price or coupon has been created. See
 * aetherforge-qa/goal-loop/b89/dip-proposal.md for the options. Fill these in only after Lukas picks one.
 */
export interface DipCtaConfig {
  /** Button words, e.g. "Try Starter for NZ$5". */
  label: string | null;
  /** What the person pays, in NZ$ to 2dp. */
  amountNzd: number | null;
  /** One plain sentence on what they get. */
  whatYouGet: string | null;
  /** Checkout route or Stripe payment link. */
  href: string | null;
}

export const DIP_CTA_CONFIG: DipCtaConfig = { label: null, amountNzd: null, whatYouGet: null, href: null };

/** The slot renders only when the flag is on and the config is complete. */
export function dipCtaReady(flagOn: boolean, cfg: DipCtaConfig = DIP_CTA_CONFIG): cfg is DipCtaConfig & { label: string; amountNzd: number; whatYouGet: string; href: string } {
  return (
    flagOn &&
    !!cfg.label &&
    !!cfg.whatYouGet &&
    !!cfg.href &&
    typeof cfg.amountNzd === "number" &&
    Number.isFinite(cfg.amountNzd) &&
    cfg.amountNzd > 0
  );
}
