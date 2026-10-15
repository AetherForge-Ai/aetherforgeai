/**
 * CR-4: the one canonical disclaimer. Every page, AI output and email template
 * that mentions the Financial Markets Conduct Act renders FMC_STATEMENT from
 * here (through <FmcStatement /> or <DisclaimerNotice />). Nothing else in the
 * codebase may spell out that Act; legal-wording tests enforce it.
 */
import { LEGAL_ENTITY_NAME } from "@/lib/company";

/** Short footer version (also the one-line disclaimer in emails and AI output). */
export const SHORT_DISCLAIMER = `General information only, not financial advice. ${LEGAL_ENTITY_NAME} is not a licensed financial advice provider.`;

/** The only sentence that names the Financial Markets Conduct Act. */
export const FMC_STATEMENT = `AetherForge AI (${LEGAL_ENTITY_NAME}) is not a licensed financial advice provider under the Financial Markets Conduct Act 2013 (New Zealand) and does not hold a financial advice provider licence issued by the Financial Markets Authority (FMA).`;

/** Long version: shown by <DisclaimerNotice variant="full" /> and linked from the footer. */
export const LONG_DISCLAIMER_PARAGRAPHS = [
  "AetherForge AI provides general market information and AI-generated analysis for informational and educational purposes only. We do not trade for you, place orders, or take custody of your assets. You buy and sell on your own broker or exchange. Nothing here takes into account your personal financial situation, goals or needs, and nothing here is a recommendation, opinion or offer to buy, sell or hold any share, digital asset or other financial product.",
  "Investing involves risk, including the loss of some or all of your capital; digital assets are especially volatile. Past performance is not a reliable indicator of future results, and AI output can be inaccurate. Always do your own research and seek advice from a licensed financial adviser before making any financial decision.",
] as const;

/** Where the footer's "Full disclaimer" link points. */
export const LONG_DISCLAIMER_HREF = "/ai-disclaimer#information-only-not-financial-advice";
