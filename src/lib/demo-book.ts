/** Goal b10 G-06: synthetic read-only demo book. No member data, no prices, no profit. */
export const DEMO_BOOK = {
  notice: "Example. Not a member book. Every row here is synthetic and read-only; nothing can be saved.",
  noPriceReason: "Example rows have no market price, so no value or profit is shown.",
  holdings: [
    { name: "EXAMPLE.NZ", type: "Share (NZX)", quantity: "10 shares" },
    { name: "EXAMPLE.AX", type: "Share (ASX)", quantity: "5 shares" },
    { name: "EXAMPLE-COIN", type: "Crypto", quantity: "1 coin" },
    { name: "Gold (example)", type: "Metal", quantity: "1 oz" },
    { name: "Cash", type: "Cash", quantity: "NZ$1,000.00" },
  ],
  entries: [
    "1 Oct 2026 · Deposit · NZ$1,000.00 (example)",
    "2 Oct 2026 · Buy · 10 EXAMPLE.NZ (example)",
    "3 Oct 2026 · Opening balance · 1 oz Gold (example)",
  ],
  report:
    "Example. This is not a member result. A report on this book would describe the split between shares, crypto, metal and cash, using the quantities above and the delayed prices at the time it is written. It would not tell you to buy or sell.",
} as const;
