/**
 * Public description of the working tax pages. The example is a labelled
 * fixture. It is not a member's book and it is not a return.
 * pull-check:batch1-2026-10-11 B1-11
 */

export const TAX_PAGE_SUMMARIES = [
  {
    title: "Dividend ledger",
    body: "The dividend ledger is the page where a signed-in member records a cash dividend against a holding already on the paper book. The form takes the payment date, the gross amount in the currency of the dividend, any New Zealand imputation credits, any tax withheld, and any amount that was reinvested instead of paid as cash. A foreign dividend needs the New Zealand dollar exchange rate for that payment date. The page looks that rate up and does not guess one. Each saved row shows the gross, the credits, the withholding, the reinvested amount, the rate, and the net cash in New Zealand dollars. A combined total sits under the table. The figures are the member's own entries. They are not a dividend statement from a broker and they are not a tax return.",
  },
  {
    title: "Income summary",
    body: "The income summary adds the dividend rows and the realised result of sells for one New Zealand tax year, which runs from 1 April to 31 March. It is labelled indicative. It shows one set of totals for that year and links to the dividend ledger and the realised page so the member can see the rows behind the total. It does not calculate tax, a tax credit, or an amount to pay. Inland Revenue decides what is income. The summary is a reading of the paper book only.",
  },
  {
    title: "FIF working paper",
    body: "The foreign investment fund working paper lists the cost of overseas shares on the book and compares that cost with NZ$50,000. Cost is the quantity times the price times the exchange rate stored on the buy, rounded half-up to the cent. New Zealand listings, crypto and metals are left out. Australian listings are included in the cost total. A member who holds an Australian company that meets the exemption Inland Revenue describes can leave that cost out. This book cannot check that exemption. Where the member has typed an opening and a closing market value, the page also shows a fair dividend rate line at five percent of the opening value and a comparative value line. A live price is not used as those values. The page does not choose a method and it does not decide whether the rules apply.",
  },
  {
    title: "Realised profit and loss",
    body: "The realised page walks the buys and sells on the book and shows the New Zealand dollar result of each sell in the selected tax year. It separates the part that came from the price and the part that came from the exchange rate, and it subtracts the fee stored on the sell. The income summary uses the amount stored on the sell. If an older sell was stored on a different path, the realised page can show that difference in words. New sells are stored on the same path the realised page uses. None of these pages file a return.",
  },
] as const;

export const TAX_PAGE_EXAMPLE = [
  "Example. This fixture is not a customer's book.",
  "Suppose a paper book bought 10 shares at NZ$10.00 on 1 June and sold those 10 shares at NZ$12.00 on 1 December of the same tax year, with no fee and an exchange rate of 1 because the price was already in New Zealand dollars.",
  "The dividend ledger would show a separate row only if a dividend had been entered. In this fixture no dividend was entered, so the dividend total is NZ$0.00.",
  "The realised page would show a gain of NZ$20.00, which is 10 times NZ$2.00.",
  "The income summary would show that same NZ$20.00 as the realised line and NZ$0.00 as dividends.",
  "The FIF working paper would leave the holding out if the ticker ended in .NZ, because a New Zealand listing is not in the NZ$50,000 cost test.",
  "Nothing in this example is a filing figure.",
].join(" ");

export function taxPublicWordCount(extra = ""): number {
  const text = [
    ...TAX_PAGE_SUMMARIES.map((section) => `${section.title} ${section.body}`),
    TAX_PAGE_EXAMPLE,
    extra,
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}
