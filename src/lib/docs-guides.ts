/**
 * M-2: step-by-step guides for /docs. Each step describes a control that
 * exists in the product today (checked against the code on 16 Oct 2026).
 * No sample figures, results or screenshots of invented data.
 * Goal b12 M-2: each guide has one real UI screenshot, captured from a local
 * build with a synthetic example book (no personal data), labelled "Example".
 */
export const DOCS_SHOT_WIDTH = 1280;
export const DOCS_SHOT_HEIGHT = 800;

const SHOT_ALT: Record<string, string> = {
  "record-a-trade": "Example: the Record a transaction review screen for a buy, showing quantity, price, fee and cash before and after.",
  "import-a-csv": "Example: the Import CSV panel where a broker file is chosen and previewed before anything is saved.",
  "run-a-report": "Example: the dashboard action row with the Run Stox report and Run Koins report buttons.",
  "edit-or-delete-a-row": "Example: the Transactions ledger with an Edit and a Delete control on each row.",
  "income-and-tax-view": "Example: the Dividend ledger page under Tax, listing each dividend with gross, tax withheld and net.",
  "read-price-freshness": "Example: the holdings table showing each price with its as-of time and the folded quantity × price line.",
  "export-your-ledger": "Example: the dashboard Export control used to download the ledger as CSV.",
};

export function docsShot(slug: string): { src: string; alt: string; width: number; height: number } | null {
  const alt = SHOT_ALT[slug];
  return alt ? { src: `/docs/${slug}.png`, alt, width: DOCS_SHOT_WIDTH, height: DOCS_SHOT_HEIGHT } : null;
}
export interface DocsGuide {
  slug: string;
  title: string;
  summary: string;
  steps: string[];
}

export const DOCS_GUIDES: DocsGuide[] = [
  {
    slug: "record-a-trade",
    title: "Record a trade",
    summary: "Add a buy or sell you made through your own broker so the dashboard can value it.",
    steps: [
      "Open the dashboard and choose Add your first holding, or + Add trade once you have one.",
      "Search the ticker (NZX, ASX, US shares, crypto or metals) and pick it from the list.",
      "Enter the quantity, the price you paid and any broker fee. Fees default to NZ$0.00 until you type one.",
      "Check the review screen: it shows the cash before and after the trade. Confirm to save it.",
    ],
  },
  {
    slug: "edit-or-delete-a-row",
    title: "Edit or delete one ledger row",
    summary: "Fix a typo in a buy or sell, or remove a row you entered by mistake.",
    steps: [
      "Open the Transactions tab on the dashboard.",
      "Choose Edit on a buy or sell to change its quantity, price or fees, or Delete to remove it.",
      "Read the confirmation. Cash, the holding and FIFO gains are worked out again from the changed ledger.",
      "If a later sell would need more units than you would hold, the change is refused and nothing is written.",
    ],
  },
  {
    slug: "import-a-csv",
    title: "Import holdings from a CSV",
    summary: "Bring an export from your broker in one go.",
    steps: [
      "Export a CSV from your broker. Files must be CSV or plain text and under 5 MB.",
      "On the dashboard, open the import option and choose the file.",
      "Check the preview. Rows that cannot be read are listed with the reason and are not imported.",
      "Confirm to add the rows. Split very large files and import each one.",
    ],
  },
  {
    slug: "read-price-freshness",
    title: "Read price times and delays",
    summary: "Know how old a price is before you rely on it.",
    steps: [
      "While a market is open, share prices are labelled Delayed with the venue. NZX quotes are about 20 minutes behind.",
      "When a market is shut, prices read Close with the date of that session, for example on a Saturday.",
      "Crypto shows the age of the quote. A feed that fails shows the last price with its age, not a blank.",
      "The Trust page lists each market, its source and its delay.",
    ],
  },
  {
    slug: "run-a-report",
    title: "Run a Stox or Koins report",
    summary: "Get a written read of your shares (Stox) or crypto (Koins).",
    steps: [
      "Add at least one holding of the matching type.",
      "Open the Reports section and choose Stox or Koins. Your plan's report allowance is shown before you run it.",
      "Every report applies the same cash rule: a 10% reserve is kept, and only the rest is illustrated.",
      "Reports are general information only, not financial advice.",
    ],
  },
  {
    slug: "export-your-ledger",
    title: "Export your ledger",
    summary: "Download every row as a CSV for your records or your accountant.",
    steps: [
      "Open the dashboard.",
      "Choose Export in the dashboard actions. CSV export is included on Starter and above.",
      "The file lists every ledger row.",
    ],
  },
  {
    slug: "income-and-tax-view",
    title: "Use the Income & Tax tab",
    summary: "See dividends, withholding and realised gains for the year.",
    steps: [
      "Record dividends from the dashboard as well as buys and sells.",
      "Open the Income & Tax tab to see gross income, withholding and realised gains using FIFO.",
      "The FIF working paper explains which method applies. Check your own position with a tax adviser.",
    ],
  },
];

export function docsGuide(slug: string): DocsGuide | undefined {
  return DOCS_GUIDES.find((g) => g.slug === slug);
}

/** /status incident history. Only incidents that were actually recorded are listed. */
export interface StatusIncident {
  startedAt: string;
  resolvedAt: string | null;
  title: string;
  detail: string;
}
export const STATUS_INCIDENTS: StatusIncident[] = [];
export const NO_INCIDENTS_LINE = "No incidents have been recorded on this page yet. When one happens it is listed here with its start and end times in NZ time.";
