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
    ],
  },
  {
    slug: "fif-fdr-vs-cv",
    title: "FIF: fair dividend rate vs comparative value",
    description: "How the FDR and CV methods work for overseas shares under New Zealand's FIF rules, sourced to Inland Revenue.",
    intro: "Once the FIF rules apply, most share investors compare two methods each year.",
    facts: [
      { text: "Fair dividend rate (FDR) income is 0.05 multiplied by the opening market value, plus a quick sale adjustment.", source: IR461 },
      { text: "Under the first four FIF methods, dividends and other gains are not usually taxed separately.", source: IR461 },
      { text: "An investor may choose a different applicable method each year, but must use the same method across all attributing interests for that year.", source: IS2410 },
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
      { text: "A person is generally required to use the same method each year for an attributing interest unless a change of method is permitted.", source: IR461 },
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
      { text: "From 1 April 2025: 10.5% on income up to $15,600; 17.5% from $15,601 to $53,500; 30% from $53,501 to $78,100; 33% from $78,101 to $180,000; 39% over $180,000.", source: IRD_TAX_RATES },
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
      { label: "Paid plans", them: { text: "Starter NZ$12/month and Standard NZ$29/month billed annually; Premium NZ$65.33 billed monthly. Prices include GST.", source: SHARESIGHT_PRICING }, us: { text: "See current plans and prices.", source: US_PRICING } },
      { label: "Tax reports", them: { text: "Paid plans include tax reports, including Foreign Investment Fund (FIF); the Free plan has no tax reports.", source: SHARESIGHT_PRICING }, us: usFif },
      { label: "Xero", them: { text: "Xero integration on Standard and Premium only.", source: SHARESIGHT_PRICING }, us: { text: "Xero bank-statement CSV export on paid plans (a file, not a live integration).", source: null, missingReason: "Shown in the signed-in dashboard; no public page describes it yet." } },
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
      { label: "Price", them: { text: "—", source: null, missingReason: "No public price was listed on its pages when checked." }, us: { text: "See current plans and prices.", source: US_PRICING } },
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
