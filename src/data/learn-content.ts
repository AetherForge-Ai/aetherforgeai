import { formatNzd } from "@/lib/currency";

/**
 * Goal b20 G-23: NZ learn hub and comparison pages. Every fact carries the page
 * it came from and the date it was checked. Where a fact could not be sourced,
 * the value is "—" with the reason. No testimonials.
 * pull-check:learn-sourced-2026-10-18
 */
export const CHECKED_ON = "2026-10-18";

export interface Source {
  title: string;
  url: string;
  /** Publisher's own date on the page, when it shows one. */
  published?: string;
}
export interface Fact {
  text: string;
  source: Source | null;
  /** Required when source is null: why the fact shows "—". */
  missingReason?: string;
}
export interface Guide {
  slug: string;
  title: string;
  description: string;
  intro: string;
  facts: Fact[];
}

const IRD_FIF_EXEMPT: Source = {
  title: "Inland Revenue: Foreign investment fund rules exemptions",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs/foreign-investment-fund-rules-exemptions",
};
const IR461: Source = {
  title: "Inland Revenue: Guide to foreign investment funds (IR461)",
  url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf",
};

/**
 * One switching rule, used on both FIF guides (fair dividend rate vs comparative
 * value, and the six methods). Do not paraphrase it differently on each page.
 *
 * Inland Revenue, Guide to foreign investment funds (IR461):
 * https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir400---ir499/ir461/ir461.pdf
 * "Continued use of the FDR method": an individual or a trustee of an eligible
 * trust (type B) is generally able to switch freely between the FDR and CV
 * methods in different income years, but not within an income year. Any other
 * person is generally required to keep using FDR. Where both methods can be
 * chosen, the same method is used for all of those investments and a total CV
 * loss is reduced to zero. The deemed rate of return "can only be used in the
 * case of a non-ordinary share if the CV method is not practical." The same
 * guide's general line is that a person uses the same method each year for an
 * attributing interest unless a change of method is permitted.
 *
 * QB 23/10 (14 December 2023), paragraph 10, states the same FDR/CV exception
 * for natural persons and eligible trustees:
 * https://www.taxtechnical.ird.govt.nz/questions-we-ve-been-asked/2023/qb-23-10
 * IS 24/10's fact sheet says an individual may choose a different applicable
 * method each year. That line is wider than IR461 and section EX 62 of the
 * Income Tax Act 2007, so these pages follow IR461 and tell the reader to
 * check the guide before changing method.
 */
export const FIF_METHOD_SWITCH_RULE =
  "An individual, or a trustee of an eligible trust (type B) as described in Inland Revenue's Guide to foreign investment funds (IR461), can generally switch between the fair dividend rate (FDR) and comparative value (CV) methods in different income years, but not within the same income year. Where both methods can be used, the same method must be used for all of those investments that year, and a comparative-value loss on the total of those investments is reduced to zero. Any other person who uses FDR is generally required to keep using it in later years. The deemed rate of return method can be used only for a non-ordinary share when the comparative value method is not practical. Any other change of method is allowed only where Inland Revenue's rules permit the change. Check IR461, or a tax adviser, before changing method.";

const IS2410: Source = {
  title: "Inland Revenue: IS 24/10 Income tax – Share investments",
  url: "https://www.taxtechnical.ird.govt.nz/-/media/project/ir/tt/pdfs/interpretation-statements/2024/is-24-10.pdf",
};
const IRD_FIF_CALC: Source = {
  title: "Inland Revenue: Calculate my foreign investment fund income",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/types-of-business-income/foreign-investment-funds-fifs/calculate-my-foreign-investment-fund-income",
};
const IRD_RWT: Source = {
  title: "Inland Revenue: Using the right resident withholding tax (RWT) rate",
  url: "https://www.ird.govt.nz/income-tax/withholding-taxes/resident-withholding-tax-rwt/using-the-right-rwt-tax-rate",
};
const IR284: Source = {
  title: "Inland Revenue: Resident withholding tax on dividends (IR284)",
  url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir284/ir284.pdf",
};
const IR274: Source = {
  title: "Inland Revenue: Imputation (IR274)",
  url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir274/ir274-2024.pdf",
};
const IRD_IMPUTATION: Source = {
  title: "Inland Revenue: Imputation for companies",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-businesses-and-organisations/income-tax-for-companies/imputation-for-companies",
};
const IR861: Source = {
  title: "Inland Revenue: Prescribed investor rate (IR861)",
  url: "https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir800---ir899/ir861/ir861.pdf",
};
const IRD_PIR: Source = {
  title: "Inland Revenue: Find your prescribed investor rate (PIR)",
  url: "https://www.ird.govt.nz/roles/portfolio-investment-entities/using-prescribed-investor-rates",
};
const IRD_KS_GOV: Source = {
  title: "Inland Revenue: Getting the KiwiSaver government contribution",
  url: "https://www.ird.govt.nz/kiwisaver/kiwisaver-individuals/growing-my-kiwisaver-account/getting-the-kiwisaver-government-contribution",
};
const IRD_KS_CHANGES: Source = { title: "Inland Revenue: KiwiSaver changes", url: "https://www.ird.govt.nz/kiwisaver-changes" };
const FMA_KS_2026: Source = {
  title: "Financial Markets Authority: KiwiSaver Annual Report 2026",
  url: "https://www.fma.govt.nz/assets/Reports/KiwiSaver-Annual-Report-2026.pdf",
};
const SHARESIES_PLANS: Source = {
  title: "Sharesies Help Centre: Pricing plans",
  url: "https://intercom.help/sharesies/en/articles/6948026-pricing-plans",
  published: "2026-02-03",
};

const IRD_SHARES: Source = {
  title: "Inland Revenue: Share investments",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/share-investments",
};
const IRD_ORDINARY: Source = {
  title: "Inland Revenue: Income under ordinary tax rules",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/income-under-ordinary-tax-rules",
};
const IRD_CRYPTO: Source = { title: "Inland Revenue: Cryptoassets", url: "https://www.ird.govt.nz/cryptoassets" };
const IRD_CRYPTO_BUYSELL: Source = { title: "Inland Revenue: Buying and selling cryptoassets", url: "https://www.ird.govt.nz/cryptoassets/individual/buying-selling" };
const IRD_CRYPTO_PURPOSE: Source = {
  title: "Inland Revenue: Acquiring cryptoassets to sell or exchange",
  url: "https://www.ird.govt.nz/cryptoassets/individual/buying-selling/acquiring-sell-exchange",
};
const IRD_CRYPTO_RECORDS: Source = { title: "Inland Revenue: Record keeping for cryptoassets", url: "https://www.ird.govt.nz/cryptoassets/taxing/record-keeping" };
const IRD_CRYPTO_CALC: Source = {
  title: "Inland Revenue: Calculating cryptoasset income",
  url: "https://www.ird.govt.nz/cryptoassets/taxing/income-expenses/calculating-cryptoasset-income",
};
const IRD_TAX_RATES: Source = {
  title: "Inland Revenue: Tax rates for individuals",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/tax-codes-and-tax-rates-for-individuals/tax-rates-for-individuals",
};
const IRD_KS_EMPLOYEE: Source = {
  title: "Inland Revenue: Employee contributions to KiwiSaver accounts",
  url: "https://www.ird.govt.nz/kiwisaver/kiwisaver-individuals/growing-my-kiwisaver-account/employee-contributions-to-kiwisaver",
};
const IRD_KS_RATE_CHANGE: Source = {
  title: "Inland Revenue: Employee contributions",
  url: "https://www.ird.govt.nz/kiwisaver/kiwisaver-individuals/employee-contributions",
};
const IRD_KS_CHANGES_2026: Source = { title: "Inland Revenue: KiwiSaver changes", url: "https://www.ird.govt.nz/kiwisaver-changes", published: "2026-03-19" };

const IRD_RWT_PAGE: Source = { title: "Inland Revenue: Using the right resident withholding tax (RWT) rate", url: "https://www.ird.govt.nz/rwt-rate" };
const IRD_OVERSEAS_REPORT: Source = {
  title: "Inland Revenue: Reporting your overseas income",
  url: "https://www.ird.govt.nz/income-tax/income-tax-for-individuals/types-of-individual-income/overseas-income/reporting-your-overseas-income",
};
const IRD_DTA_RESIDENTS: Source = {
  title: "Inland Revenue: New Zealand tax residents and DTAs",
  url: "https://www.ird.govt.nz/international-tax/double-tax-agreements/new-zealand-tax-residents",
};
const IRD_WORLDWIDE: Source = {
  title: "Inland Revenue: Tax for New Zealand tax residents",
  url: "https://www.ird.govt.nz/international-tax/individuals/tax-for-new-zealand-tax-residents",
};
const IS2410_FS2: Source = {
  title: "Inland Revenue: IS 24/10 FS 2 Share investments (dividends and taxable share sales) fact sheet",
  url: "https://www.taxtechnical.ird.govt.nz/-/media/project/ir/tt/pdfs/fact-sheets/2024/is-24-10-fs-2.pdf",
};
const FMA_HOW_TO_INVEST: Source = { title: "Financial Markets Authority: Deciding how to invest", url: "https://www.fma.govt.nz/consumer/investing/deciding-how-to-invest/" };
const FMA_VFM: Source = {
  title: "Financial Markets Authority: Managed fund fees and value for money (guidance)",
  url: "https://www.fma.govt.nz/assets/Guidance/Managed-fund-fees-and-value-for-money-guidance.pdf",
};
const FMA_KS_2025: Source = { title: "Financial Markets Authority: KiwiSaver Annual Report 2025", url: "https://www.fma.govt.nz/assets/Reports/KiwiSaver-Annual-Report-2025.pdf" };

export const GUIDES: readonly Guide[] = [
  {
    slug: "fif-50000-threshold",
    title: "The NZ$50,000 FIF threshold",
    description: "When the foreign investment fund rules start to apply to an individual investor in New Zealand, with Inland Revenue sources.",
    intro: "Overseas shares can fall under the foreign investment fund (FIF) rules. For individuals, the starting point is a cost threshold.",
    facts: [
      { text: "An individual whose FIF interests cost less than NZ$50,000 in total does not need to calculate income under the FIF rules.", source: IRD_FIF_EXEMPT },
      { text: "Under the threshold, tax is paid on dividends received (and on disposal gains if the shares are held on revenue account) instead of FIF income.", source: IR461 },
      { text: "If the total cost exceeds NZ$50,000 on any day in the year, all attributing interests are subject to the FIF rules; the first NZ$50,000 is not exempt.", source: IR461 },
      { text: "The NZ$50,000 threshold applies per person, based on total cost at any time in the year; joint holdings are split between the owners, so 2 equal owners can together hold up to NZ$100,000 in cost; it's not a doubled threshold for the portfolio. Trusts and companies don't get the exemption. Indicative, not tax advice.", source: IR461 },
    ],
  },
  {
    slug: "fif-fdr-vs-cv",
    title: "FIF: fair dividend rate vs comparative value",
    description: "How the FDR and CV methods work for overseas shares under New Zealand's FIF rules, sourced to Inland Revenue.",
    intro: "Once the FIF rules apply, individual investors often compare the fair dividend rate and comparative value methods. Who may switch, including the deemed rate of return limit, is in the note below.",
    facts: [
      { text: "Fair dividend rate (FDR) income is 0.05 multiplied by the opening market value, plus a quick sale adjustment.", source: IR461 },
      { text: "Under the first four FIF methods, dividends and other gains are not usually taxed separately.", source: IR461 },
      { text: FIF_METHOD_SWITCH_RULE, source: IR461 },
      { text: "Inland Revenue's online calculator covers the main methods: FDR, or CV when you are not FDR eligible.", source: IRD_FIF_CALC },
    ],
  },
  {
    slug: "fif-six-methods",
    title: "The six FIF calculation methods",
    description: "The list of FIF income methods Inland Revenue names, and when the cost method is used.",
    intro: "Inland Revenue lists six methods for calculating FIF income. Restrictions apply to which can be chosen.",
    facts: [
      { text: "The methods are fair dividend rate, comparative value, cost method, deemed rate of return, revenue account method and the attributable FIF income method.", source: IR461 },
      { text: FIF_METHOD_SWITCH_RULE, source: IR461 },
      { text: "The cost method may be used if you cannot determine a market value for the investment; an independent valuation may be needed.", source: IRD_FIF_CALC },
    ],
  },
  {
    slug: "dividends-rwt",
    title: "Resident withholding tax on NZ dividends",
    description: "How the 33% RWT on dividends works with imputation credits, with Inland Revenue's own worked example.",
    intro: "NZ companies usually deduct resident withholding tax (RWT) before paying a dividend, after allowing for imputation credits.",
    facts: [
      { text: "The RWT rate for dividend payments is 33%.", source: IRD_RWT },
      { text: "RWT is calculated on the gross dividend (the dividend plus attached credits), then reduced by the imputation credits attached: (0.33 × (dividend + credit)) − credit.", source: IR284 },
      { text: "Inland Revenue's example: a NZ$2,000 cash dividend with a NZ$200 imputation credit has NZ$526 RWT deducted, so the shareholder receives NZ$1,474.", source: IR284 },
    ],
  },
  {
    slug: "imputation-credits",
    title: "Imputation credits explained",
    description: "What imputation credits are and the maximum ratio a company can attach, sourced to Inland Revenue.",
    intro: "Imputation passes company tax already paid through to shareholders so profits are not taxed twice.",
    facts: [
      { text: "Imputation credits let a company pass on credit for income tax it has already paid; the credit reduces the income tax the shareholder pays personally.", source: IRD_IMPUTATION },
      { text: "Each NZ$1 of gross dividend can carry up to 28 cents of imputation credit, written as the ratio 28:72.", source: IR274 },
      { text: "A company may choose whether or not to attach imputation credits to dividends it pays.", source: IR274 },
    ],
  },
  {
    slug: "pir-rates",
    title: "Prescribed investor rates (PIR) for PIE funds",
    description: "The 10.5%, 17.5% and 28% PIR bands for NZ resident individuals and the income tests behind them.",
    intro: "Portfolio investment entities (PIEs), including most KiwiSaver funds, tax your share of income at your PIR.",
    facts: [
      { text: "10.5% applies if, in either of the last two tax years, taxable income excluding PIE income was NZ$15,600 or less and total income including PIE income was NZ$53,500 or less.", source: IR861 },
      { text: "17.5% applies if, in either of the last two tax years, income excluding PIE income was NZ$53,500 or less and total income including PIE income was NZ$78,100 or less.", source: IR861 },
      { text: "Otherwise the PIR is 28%.", source: IR861 },
      { text: "For the tax year ending 31 March 2027, the PIR is based on income for the years ended 31 March 2025 and 31 March 2026.", source: IRD_PIR },
    ],
  },
  {
    slug: "kiwisaver-government-contribution",
    title: "The KiwiSaver government contribution",
    description: "How much the government adds to KiwiSaver from 1 July 2025, who qualifies and how to get the maximum.",
    intro: "The government contribution was changed from 1 July 2025.",
    facts: [
      { text: "From 1 July 2025 the government contributes 25 cents for each dollar you contribute, up to NZ$260.72 a year.", source: IRD_KS_CHANGES },
      { text: "To get the maximum you must contribute at least NZ$1,042.86 of your own money between 1 July and 30 June; employer contributions do not count.", source: IRD_KS_GOV },
      { text: "It is available to members aged 16–65 with annual taxable income of NZ$180,000 or less who are contributing, subject to conditions.", source: IRD_KS_GOV },
      { text: "Your provider applies after 30 June; it may take until the end of August to appear.", source: IRD_KS_GOV },
    ],
  },
  {
    slug: "kiwisaver-2026-in-numbers",
    title: "KiwiSaver in numbers: year to 31 March 2026",
    description: "Contribution totals from the FMA's KiwiSaver Annual Report 2026.",
    intro: "The FMA publishes an annual report on the KiwiSaver scheme.",
    facts: [
      { text: "Total contributions reached NZ$13.2 billion in the year ending 31 March 2026, up 8.2%.", source: FMA_KS_2026 },
      { text: "Member contributions rose from NZ$7.8 billion to NZ$8.7 billion; employer contributions grew 4.1% to NZ$3.5 billion.", source: FMA_KS_2026 },
      { text: "Government contributions stayed over NZ$1 billion; the July 2025 change will show from the 2026/27 reporting year.", source: FMA_KS_2026 },
    ],
  },
  {
    slug: "nz-tax-year",
    title: "The NZ tax year and investment dates",
    description: "Which dates the NZ income tax year and KiwiSaver government contribution year run on.",
    intro: "Two different years matter for NZ investors.",
    facts: [
      { text: "The current income tax year ends 31 March 2027 (tax years run 1 April to 31 March).", source: IRD_PIR },
      { text: "The KiwiSaver government contribution year runs 1 July to 30 June.", source: IRD_KS_GOV },
      { text: "Under the FDR method, FIF income uses the opening market value for the tax year.", source: IR461 },
    ],
  },
  {
    slug: "sharesies-fees",
    title: "Sharesies plans and transaction fees",
    description: "Sharesies plan prices and capped transaction fees as published on its help centre.",
    intro: "Sharesies is a popular NZ broker. Its fees are set out on its help centre.",
    facts: [
      { text: "There are NZ$3, NZ$7 and NZ$15 plans, paid monthly or annually, plus a NZ$1 kids plan paid monthly.", source: SHARESIES_PLANS },
      { text: "Orders over plan coverage pay 1.9% of the amount, capped at US$5 for US shares, A$15 for Australian shares and NZ$25 for NZ shares.", source: SHARESIES_PLANS },
      { text: "There is no transaction fee on orders for managed funds (funds not listed on an exchange).", source: SHARESIES_PLANS },
    ],
  },
  {
    slug: "share-sale-tax",
    title: "When NZ share sales are taxed",
    description: "The three situations where Inland Revenue treats amounts from selling shares as income, and what is taxed.",
    intro: "New Zealand has no general capital gains tax, but some share sales are still taxable. Inland Revenue sets out when.",
    facts: [
      { text: "Amounts from selling shares are taxable if you bought them for the dominant or main purpose of selling them, have a share dealing business, or hold them as part of a profit-making scheme.", source: IRD_SHARES },
      { text: "The amount that is taxable is the sale price less the cost of the shares, and it is only taxed once.", source: IRD_SHARES },
      { text: "You do not have to be in business or intend to make a profit: a one-off sale is still taxable if you bought the shares mainly to sell.", source: IRD_SHARES },
      { text: "There is no bright-line test for share sales, so no set holding period or number of trades decides it.", source: IS2410 },
    ],
  },
  {
    slug: "share-purchase-records",
    title: "Records that show why you bought shares",
    description: "The records Inland Revenue says can support your stated purpose when you bought and sold shares.",
    intro: "Your purpose when you bought a share can decide whether a sale is taxed, so records made at the time matter.",
    facts: [
      { text: "Useful records include notes on why you bought (such as emails), the research you relied on, any investment plan or adviser notes, and lending records if you borrowed to invest.", source: IRD_SHARES },
      { text: "Your stated purpose is tested against the nature of the share, how long you held it, the circumstances of purchase and sale, and the number of similar transactions.", source: IRD_SHARES },
      { text: "Recording reasons for sales, such as rebalancing or a change in circumstances, can help show they fit your stated purpose.", source: IS2410 },
    ],
  },
  {
    slug: "personal-property-for-disposal",
    title: "Shares, gold and crypto bought to sell",
    description: "How Inland Revenue treats profits on personal property, including shares, gold and cryptoassets, bought mainly to sell.",
    intro: "The same purpose test covers more than shares.",
    facts: [
      { text: "Selling personal property such as shares, gold and cryptoassets is income if it was bought with the main or dominant purpose of selling it.", source: IRD_ORDINARY },
      { text: "Inland Revenue looks at the type of asset, your reasons for buying and selling, the number of similar transactions, the holding period and how the asset was used and sold.", source: IRD_ORDINARY },
    ],
  },
  {
    slug: "crypto-tax-basics",
    title: "Cryptoassets and NZ tax: the basics",
    description: "How Inland Revenue treats cryptoassets: property for tax, when buying and selling is taxable, and what counts as a disposal.",
    intro: "Inland Revenue has a dedicated section on cryptoassets.",
    facts: [
      { text: "Cryptoassets are treated as a form of property for tax purposes; the treatment depends on their characteristics and use, not what they are called.", source: IRD_CRYPTO },
      { text: "In most cases amounts from selling, trading or exchanging cryptoassets are taxable, including exchanging one cryptoasset for another.", source: IRD_CRYPTO_BUYSELL },
      { text: "Moving cryptoassets between wallets, addresses or accounts that all belong to you is not a disposal.", source: IRD_CRYPTO_BUYSELL },
      { text: "Reasons like long-term investment, an inflation hedge or diversification usually still involve a purpose of eventually selling or exchanging.", source: IRD_CRYPTO_PURPOSE },
    ],
  },
  {
    slug: "crypto-income-calculation",
    title: "Working out crypto income: FIFO or weighted average",
    description: "Inland Revenue's formula for cryptoasset income and the two cost methods it allows.",
    intro: "Once a disposal is taxable, the income has to be calculated in New Zealand dollars.",
    facts: [
      { text: "Income = sale price – purchase cost – transaction fees.", source: IRD_CRYPTO_CALC },
      { text: "Cost can be worked out with first-in first-out (FIFO) or weighted average cost (WAC).", source: IRD_CRYPTO_CALC },
      { text: "Losses on disposals can offset other cryptoasset profits and then other income; unrealised gains and losses are not taxable or deductible.", source: IRD_CRYPTO_CALC },
      { text: "Reconcile holdings as of 31 March each year and record a crypto-to-crypto trade as both a disposal and an acquisition.", source: IRD_CRYPTO_CALC },
    ],
  },
  {
    slug: "crypto-records",
    title: "Crypto records to keep for seven years",
    description: "The cryptoasset transaction records Inland Revenue asks you to keep, and for how long.",
    intro: "Exchanges may not keep your history, so Inland Revenue suggests downloading it regularly.",
    facts: [
      { text: "Keep the type of cryptoasset, transaction date and type, number of units, NZD value, units held at the start and end of the year, exchange records and bank statements, and wallet addresses.", source: IRD_CRYPTO_RECORDS },
      { text: "Keep these records for at least 7 years, even if you no longer hold any cryptoassets.", source: IRD_CRYPTO_RECORDS },
    ],
  },
  {
    slug: "nz-income-tax-rates",
    title: "NZ income tax rates from 1 April 2025",
    description: "Individual income tax brackets from 1 April 2025, as published by Inland Revenue. Investment income is part of total income.",
    intro: "Taxable investment income, such as interest and some overseas income, is added to your other income and taxed at these rates.",
    facts: [
      { text: `From 1 April 2025: 10.5% on income up to ${formatNzd(15600)}; 17.5% from ${formatNzd(15601)} to ${formatNzd(53500)}; 30% from ${formatNzd(53501)} to ${formatNzd(78100)}; 33% from ${formatNzd(78101)} to ${formatNzd(180000)}; 39% over ${formatNzd(180000)}.`, source: IRD_TAX_RATES },
      { text: "Income such as interest from a bank account or investment and overseas income counts towards total income for the year.", source: IRD_TAX_RATES },
    ],
  },
  {
    slug: "kiwisaver-contribution-rates",
    title: "KiwiSaver employee contribution rates",
    description: "The KiwiSaver employee contribution rates you can choose, the default, and how often you can change.",
    intro: "If you are an employee, KiwiSaver contributions usually come from your pay.",
    facts: [
      { text: "You can choose to contribute 3.5%, 4%, 6%, 8% or 10% of your pay; the default rate is 3.5%.", source: IRD_KS_RATE_CHANGE },
      { text: "You can change your rate once every 3 months unless your employer agrees to a shorter timeframe.", source: IRD_KS_RATE_CHANGE },
      { text: "Before-tax pay for KiwiSaver includes allowances, bonuses, commission, overtime and gratuities.", source: IRD_KS_EMPLOYEE },
    ],
  },
  {
    slug: "kiwisaver-default-rate-rise",
    title: "The KiwiSaver default rate rise (2026 and 2028)",
    description: "The Budget 2025 changes that lift the default KiwiSaver rate from 3% to 3.5% in April 2026 and 4% in April 2028.",
    intro: "Inland Revenue published the timetable for the default rate change.",
    facts: [
      { text: "From 1 April 2026 the default employee and matching employer rate rose from 3% to 3.5%.", source: IRD_KS_CHANGES_2026 },
      { text: "A temporary rate reduction lets you keep contributing 3% for between 3 and 12 months, and you can apply more than once.", source: IRD_KS_CHANGES_2026 },
      { text: "From 1 April 2026, 16- and 17-year-olds qualify for employer contributions of 3.5% if they meet the other requirements.", source: IRD_KS_CHANGES_2026 },
      { text: "From 1 April 2028 the default rate rises again, to 4%, for both employee and employer.", source: IRD_KS_CHANGES_2026 },
    ],
  },
  {
    slug: "rwt-on-interest",
    title: "RWT on interest: choosing your rate",
    description: "Resident withholding tax rates on NZ interest, the default when you do not choose, and the 45% non-declaration rate.",
    intro: "Banks and fund managers deduct resident withholding tax before they pay interest to NZ tax residents.",
    facts: [
      { text: "If you have given your IRD number, you can choose 10.5%, 17.5%, 30%, 33% or 39%; it should match your income tax rate.", source: IRD_RWT_PAGE },
      { text: "If you do not choose a rate, interest is taxed at 33%.", source: IRD_RWT_PAGE },
      { text: "If you have not given your IRD number, tax is deducted at 45%.", source: IRD_RWT_PAGE },
      { text: "If the rate you choose does not match your income tax rate you may get an end-of-year tax bill.", source: IRD_RWT_PAGE },
    ],
  },
  {
    slug: "overseas-income-ir1261",
    title: "Reporting overseas income (IR1261)",
    description: "What NZ tax residents must report about overseas income on the Overseas income summary (IR1261).",
    intro: "Overseas dividends and other foreign income are reported with your IR3 return.",
    facts: [
      { text: "From the 2023 tax year you must file an Overseas income summary (IR1261).", source: IRD_OVERSEAS_REPORT },
      { text: "It asks for the type of income, the amount of each type, the jurisdiction it was earned in, and the foreign tax credit claimed.", source: IRD_OVERSEAS_REPORT },
      { text: "If a FIF exemption applies, foreign dividends go in overseas income; if none applies, you include the FIF income instead.", source: IRD_OVERSEAS_REPORT },
    ],
  },
  {
    slug: "foreign-tax-credits",
    title: "Foreign tax credits on overseas dividends",
    description: "How NZ tax residents claim a credit for tax withheld overseas, and the limits Inland Revenue applies.",
    intro: "Tax withheld overseas on a dividend can usually be credited so the same income is not taxed twice.",
    facts: [
      { text: "The credit is limited to the lowest of the tax paid overseas, the NZ tax on the same income, and the amount allowed by the double tax agreement.", source: IRD_DTA_RESIDENTS },
      { text: "You need proof of the tax paid to the other country.", source: IRD_DTA_RESIDENTS },
      { text: "Where a DTA applies, the credit is limited to the foreign withholding tax payable under that DTA.", source: IS2410_FS2 },
    ],
  },
  {
    slug: "foreign-dividends-200-threshold",
    title: `Foreign dividends and the ${formatNzd(200)} threshold`,
    description: "When foreign dividends must go in an IR3 return, and how they are converted to NZ dollars.",
    intro: "Small amounts of income with no tax withheld have a filing threshold.",
    facts: [
      { text: `Foreign dividends only need to be included if all your income that is not reportable income totals ${formatNzd(200)} or more for the year.`, source: IS2410_FS2 },
      { text: `The ${formatNzd(200)} threshold covers all non-reportable amounts together, such as foreign dividends and taxable share sales.`, source: IS2410_FS2 },
      { text: "The dividend is included at its New Zealand dollar amount, calculated when it is paid to you.", source: IS2410_FS2 },
    ],
  },
  {
    slug: "worldwide-income",
    title: "NZ tax residents and worldwide income",
    description: "Why NZ tax residents generally pay tax on overseas income, even if it stays overseas or was taxed there.",
    intro: "Tax residence, not where the money sits, decides what is taxed in New Zealand.",
    facts: [
      { text: "NZ tax residents generally pay tax on their worldwide income.", source: IRD_WORLDWIDE },
      { text: "Overseas income is taxable even if you do not bring it into New Zealand, and even if the other country has deducted tax.", source: IRD_WORLDWIDE },
    ],
  },
  {
    slug: "investment-fees",
    title: "How fees reduce your investment return",
    description: "The Financial Markets Authority's guidance on investment fees and comparing returns after fees.",
    intro: "Every investment has costs, even when you invest directly.",
    facts: [
      { text: "Any fees you pay reduce the return you make; small percentage differences can hide the dollar impact.", source: FMA_HOW_TO_INVEST },
      { text: "Only pay higher fees if you are confident of persistently higher returns after fees.", source: FMA_HOW_TO_INVEST },
      { text: "The FMA found no systematic relationship between fees charged and returns received.", source: FMA_VFM },
      { text: "Active funds typically do not outperform their market index after fees over their minimum suggested timeframe or longer.", source: FMA_VFM },
    ],
  },
  {
    slug: "kiwisaver-fees",
    title: "KiwiSaver fees: what the FMA reports",
    description: "KiwiSaver fee totals and the rule that fees must not be unreasonable, from FMA reports and guidance.",
    intro: "KiwiSaver fees come out of your balance, so the FMA tracks them every year.",
    facts: [
      { text: "In the year to 31 March 2025, total fees deducted from all KiwiSaver schemes reached $868.5 million, up 10% on the year before.", source: FMA_KS_2025 },
      { text: "Fees as a percentage of funds under management stayed stable at 0.7% in 2025.", source: FMA_KS_2025 },
      { text: "A KiwiSaver manager must not charge a fee that is unreasonable, and this is an ongoing obligation.", source: FMA_VFM },
    ],
  },
];

export interface CompareRow {
  label: string;
  them: Fact;
  us: Fact;
}
export interface Comparison {
  slug: string;
  name: string;
  description: string;
  summary: string;
  rows: CompareRow[];
}

const SHARESIGHT_PRICING: Source = { title: "Sharesight NZ: Pricing", url: "https://www.sharesight.com/nz/pricing/" };
const QUBITS_HOME: Source = { title: "Qubits Finance: home page", url: "https://finance.qubits.co.nz/" };
const QUBITS_SOLUTIONS: Source = { title: "Qubits Solutions: Qubits Finance", url: "https://qubits.co.nz/finance/" };
const QUBITS_TERMS: Source = { title: "Qubits Finance: Assistant terms", url: "https://finance.qubits.co.nz/assistant-terms", published: "2026-08-10" };
const GECKO_HOME: Source = { title: "GeckoPro: home page", url: "https://geckopro.app/" };
const GECKO_VS: Source = { title: "GeckoPro: GeckoPro vs Sharesight", url: "https://geckopro.app/vs/sharesight" };
const US_PRICING: Source = { title: "AetherForge AI: Pricing", url: "/pricing" };
const US_TAX: Source = { title: "AetherForge AI: Tax pages", url: "/tax" };
const US_IMPORT: Source = { title: "AetherForge AI: Import trades", url: "/import" };
const US_NOT_BROKER: Source = { title: "AetherForge AI: How it works", url: "/how-it-works" };

const usFree: Fact = { text: "Free plan: up to 10 holdings.", source: US_PRICING };
const usNotBroker: Fact = { text: "A paper book for tracking and research; not a broker and does not place trades.", source: US_NOT_BROKER };
const usFif: Fact = { text: "FIF working paper (FDR and CV) on the Tax pages, for your accountant; not a tax return.", source: US_TAX };
const usImport: Fact = { text: "Broker CSV import with a review screen before anything is saved.", source: US_IMPORT };

export const COMPARISONS: readonly Comparison[] = [
  {
    slug: "sharesight",
    name: "Sharesight",
    description: "AetherForge AI and Sharesight compared on plans, holdings limits and tax reports, with each fact sourced and dated.",
    summary: "Sharesight is an established portfolio tracking and reporting service. Facts below are from its NZ pricing page.",
    rows: [
      { label: "Free plan", them: { text: "Free: 1 portfolio, 10 holdings (including closed).", source: SHARESIGHT_PRICING }, us: usFree },
      { label: "Paid plans", them: { text: "Starter NZ$12/month and Standard NZ$29/month billed annually; Premium NZ$65.33 billed monthly.", source: SHARESIGHT_PRICING }, us: { text: "See current plans and prices.", source: US_PRICING } },
      { label: "Tax reports", them: { text: "Paid plans include tax reports, including Foreign Investment Fund (FIF); the Free plan has no tax reports.", source: SHARESIGHT_PRICING }, us: usFif },
      { label: "Xero", them: { text: "Xero integration on Standard and Premium only.", source: SHARESIGHT_PRICING }, us: { text: "Xero bank-statement CSV export on paid plans (a file, not a live integration).", source: US_TAX } },
      { label: "Trading", them: { text: "Not a bank, broker or trading platform.", source: SHARESIGHT_PRICING }, us: usNotBroker },
    ],
  },
  {
    slug: "qubits",
    name: "Qubits Finance",
    description: "AetherForge AI and Qubits Finance compared on access, pricing, tax papers and the AI assistant, with each fact sourced and dated.",
    summary: "Qubits Finance is a NZ research and portfolio tool in private beta. Facts below are from its own pages.",
    rows: [
      { label: "Access", them: { text: "Accounts are private and approval-gated during the private beta.", source: QUBITS_SOLUTIONS }, us: { text: "Open sign-up with a Free plan.", source: US_PRICING } },
      { label: "Tax papers", them: { text: "Dividend records and an indicative FIF working paper from your transaction history.", source: QUBITS_HOME }, us: usFif },
      { label: "AI assistant", them: { text: "Optional, read-only assistant in limited preview; questions may be processed by OpenAI.", source: QUBITS_TERMS }, us: { text: "Research reports are general information, not personalised advice.", source: US_NOT_BROKER } },
      { label: "Trading", them: { text: "Does not place trades.", source: QUBITS_SOLUTIONS }, us: usNotBroker },
    ],
  },
  {
    slug: "geckopro",
    name: "GeckoPro",
    description: "AetherForge AI and GeckoPro compared on free plan, price, markets and tax reporting, with each fact sourced and dated.",
    summary: "GeckoPro is a NZ portfolio alert app. Facts below are from its own pages; where its pages disagree, both figures are shown.",
    rows: [
      { label: "Free plan", them: { text: "Up to 5 holdings, no credit card, no time limit.", source: GECKO_HOME }, us: usFree },
      { label: "Paid plan", them: { text: "Essential NZ$7.99/month on its home page; its Sharesight comparison page shows NZ$14/month.", source: GECKO_HOME }, us: { text: "See current plans and prices.", source: US_PRICING } },
      { label: "Markets", them: { text: "NZX and US markets (NYSE, NASDAQ, AMEX).", source: GECKO_HOME }, us: { text: "NZX, ASX, US shares, crypto and metals on one paper book.", source: US_NOT_BROKER } },
      { label: "Tax reporting", them: { text: "Lists tax reporting and FIF tax calculations as not offered.", source: GECKO_VS }, us: usFif },
      { label: "Import", them: { text: "Sharesies CSV import; IBKR via Flex Web Service.", source: GECKO_HOME }, us: usImport },
    ],
  },
];
