/**
 * Plain-language money section on /trust.
 * Every sentence is an existing /trust statement, or a file-import fact the
 * render test checks against the import code. No new guarantee.
 */

import { LONG_DISCLAIMER_PARAGRAPHS } from "@/lib/disclaimer";
import { PAPER_BOOK_STATEMENT } from "@/lib/public-copy";

export const TRUST_MONEY_HEADING = "Your money stays with you";

/** Already rendered under "Paper, not a broker" on /trust. */
export const TRUST_MONEY_RECORD_SENTENCE =
  "Recording a buy does not send money to a broker, an exchange, or a bank. A sell does not pay you.";

/**
 * Already rendered on /trust by DisclaimerNotice variant="full"
 * (LONG_DISCLAIMER_PARAGRAPHS). Orders and custody only.
 */
export const TRUST_MONEY_ORDERS_SENTENCE =
  "We do not trade for you, place orders, or take custody of your assets. You buy and sell on your own broker or exchange.";

/** Already rendered under "Security" on /trust. Login and password only. */
export const TRUST_MONEY_LOGIN_SENTENCE =
  "We do not ask for a broker login, and we do not store a password for a bank or an exchange.";

/**
 * File import is one way to add rows. You also record entries, and prices
 * and news are listed elsewhere on /trust.
 * A file is not written until preview is confirmed (runH10Import).
 */
export const TRUST_MONEY_FILE_SENTENCE =
  "You record what you hold on the paper book, and you can upload a CSV or XLSX file you already have. Nothing from that file is saved until you confirm the preview.";

export const TRUST_MONEY_SECTIONS = [
  {
    id: "your-money-record",
    heading: "The book is a record",
    body: `${PAPER_BOOK_STATEMENT} ${TRUST_MONEY_RECORD_SENTENCE}`,
  },
  {
    id: "your-money-orders",
    heading: "Orders and custody",
    body: TRUST_MONEY_ORDERS_SENTENCE,
  },
  {
    id: "your-money-logins",
    heading: "Logins and passwords",
    body: TRUST_MONEY_LOGIN_SENTENCE,
  },
  {
    id: "your-money-files",
    heading: "Files you upload",
    body: TRUST_MONEY_FILE_SENTENCE,
  },
] as const;

export function trustMoneyVisibleText(): string {
  return [TRUST_MONEY_HEADING, ...TRUST_MONEY_SECTIONS.flatMap((section) => [section.heading, section.body])].join(" ");
}

export function trustMoneyWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The orders sentence must stay a substring of the disclaimer already on /trust. */
export function trustMoneyOrdersMatchDisclaimer(): boolean {
  return LONG_DISCLAIMER_PARAGRAPHS.some((paragraph) => paragraph.includes(TRUST_MONEY_ORDERS_SENTENCE));
}
