import Link from "next/link";
import { InvestorToolShell } from "@/components/tools/InvestorToolShell";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/tools", {
  title: "NZ investor calculators — AetherForge AI",
  description:
    "Free FIF threshold and dividend imputation illustrations for New Zealand investors. No account, and nothing is stored. General information, not tax or financial advice.",
});

const TOOLS = [
  {
    href: "/tools/fif-threshold",
    title: "FIF threshold check",
    body: "Enter the total cost of your offshore shares and read whether that cost is over the individual FIF de minimis, including the Australian listed-share exemption.",
  },
  {
    href: "/tools/dividend-imputation",
    title: "Dividend and imputation illustration",
    body: "Add the maximum imputation credit to a cash dividend, then see the top-up or unused credit at an individual marginal rate.",
  },
] as const;

export default function ToolsPage() {
  return (
    <InvestorToolShell
      kicker="Calculators"
      title="NZ investor calculators"
      lede="Two short illustrations for New Zealand investors. No account is needed, and nothing you type is stored."
    >
      <ul className="mt-8 space-y-3">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <Link
              href={tool.href}
              className="block rounded-2xl border border-border/70 bg-card/70 px-5 py-4 transition-colors hover:border-primary/40"
            >
              <span className="block font-display text-lg font-bold">{tool.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{tool.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </InvestorToolShell>
  );
}
