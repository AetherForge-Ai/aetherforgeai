/**
 * M-7 allow-list. The b99 guard treats a line as a text-green only when it
 * paints type. Everything here is a reviewed exception, with a reason.
 * Backgrounds, borders, rings, shadows, chart fills and the logo are not
 * text-greens; the representative lines below are locked so they stay that way.
 */

export type TextGreenRule = {
  file: string;
  lineIncludes: string;
  reason: string;
};

/** Text-coloured greens that are not the text-gain utility. Each must match a real hit. */
export const TEXT_GREEN_ALLOWANCE: TextGreenRule[] = [
  {
    file: "src/app/globals.css",
    lineIncludes: "--primary: #047857",
    reason: "Same hex as the light text-green token. text-primary is this variable, and bg-primary paints CTA fills. Replacing the class would not change the colour and would drop the underline on main p > a.text-primary.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--primary: #34d399",
    reason: "Dark-chrome primary is the token's dark pair (#34d399), shared with CTA fills on the navy frame. It is not a second text green.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--accent-foreground: #065f46",
    reason: "Foreground for the accent surface (menu, selected row, button hover), not a gain. #065f46 on accent #ecfdf5 is 7.3:1. Left on the accent pair so hover text stays with that surface.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--accent-foreground: #99f6e4",
    reason: "Dark-chrome accent foreground on accent #134e4a (7.5:1). It is the hover/selected label on that surface, not the gain token.",
  },
  {
    file: "src/components/about/AboutContent.tsx",
    lineIncludes: 'style={{ color: "#34D399" }}',
    reason: "Pillar icon glyph. The icon uses currentColor; it is not copy. The value is the token dark pair, so the mark on the dark band is unchanged.",
  },
  {
    file: "src/components/totalum/TotalumConsole.tsx",
    lineIncludes: 'color: "#10b981"',
    reason: "Scenario bar fill. The Bull label uses text-gain; this hex paints the bar only.",
  },
  {
    file: "src/lib/totalum-engine.ts",
    lineIncludes: 'color: "#10b981"',
    reason: "Equities allocation swatch (the dot background). Not text.",
  },
  {
    file: "src/lib/report-html.ts",
    lineIncludes: 'const CHART_GREEN = "#059669"',
    reason: "Sparkline stroke and area fill only. Not painted as text. Left on the previous chart green so the chart mark does not change.",
  },
  {
    file: "src/lib/totalum-report-html.ts",
    lineIncludes: "#047857",
    reason: "Headmaster report HTML is a light page and cannot read --text-green. Positive figures use the token's light value #047857 (5.2:1 on #f8fafc).",
  },
  {
    file: "src/lib/trial-report-html.ts",
    lineIncludes: 'const GREEN = "#34d399"',
    reason: "Trial report email and PDF use a fixed dark theme and cannot read --text-green. This constant is the token's dark pair and is the only green used for text in that file.",
  },
];

/**
 * Greens that are not text. The guard must keep classifying these lines as
 * non-text, and the lines must stay in the source.
 */
export const NON_TEXT_GREENS: TextGreenRule[] = [
  {
    file: "src/app/globals.css",
    lineIncludes: "--accent: #ecfdf5",
    reason: "Accent background tint, not text.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--ring: #10b981",
    reason: "Focus ring, not text.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--chart-1: #10b981",
    reason: "Chart series colour, not text.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--chart-2: #0d9488",
    reason: "Chart series colour, not text.",
  },
  {
    file: "src/app/globals.css",
    lineIncludes: "--sidebar-primary: #047857",
    reason: "Sidebar CTA fill. Same hex as the token, not a text colour.",
  },
  {
    file: "src/components/dashboard/rail/RailCard.tsx",
    lineIncludes: 'bg-[#047857] text-white',
    reason: "Button fill. The label is white.",
  },
  {
    file: "src/components/about/AboutContent.tsx",
    lineIncludes: "border-[#059669]",
    reason: "Border and shadow tint on the about page, not text.",
  },
  {
    file: "src/components/about/AboutContent.tsx",
    lineIncludes: 'borderColor: "#059669"',
    reason: "Border colour on the about page, not text.",
  },
  {
    file: "src/lib/report-html.ts",
    lineIncludes: "const stroke = positive ? CHART_GREEN : RED;",
    reason: "Report sparkline stroke and area fill.",
  },
  {
    file: "src/components/bots/ApexReport.tsx",
    lineIncludes: 'const stroke = positive ? "#34d399" : "#fb7185"',
    reason: "Chart stroke, not text.",
  },
  {
    file: "src/components/dashboard/crypto/Sparkline.tsx",
    lineIncludes: 'const stroke = up ? "#34d399" : "#fb7185"',
    reason: "Chart stroke, not text.",
  },
  {
    file: "src/components/dashboard/crypto/CoinDetailView.tsx",
    lineIncludes: 'const stroke = up ? "#34d399" : "#fb7185"',
    reason: "Chart stroke, not text.",
  },
  {
    file: "src/components/trial/TrialReportView.tsx",
    lineIncludes: 'const color = positive ? "#34d399" : "#fb7185"',
    reason: "Momentum chart stroke and area fill, not text.",
  },
];
