import Link from "next/link";

const LINKS = [
  { href: "/tax", label: "Tax" },
  { href: "/tax/dividends", label: "Dividends" },
  { href: "/tax/income", label: "Income summary" },
  { href: "/tax/fif", label: "FIF" },
  { href: "/tax/realised", label: "Realised" },
] as const;

/** Cross-links between the tax papers. Sub-pages stay reachable, and each one can return here. */
export function TaxSectionNav({ current }: { current: (typeof LINKS)[number]["href"] }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm print:hidden" aria-label="Tax papers">
      {LINKS.map((item) =>
        item.href === current ? (
          <span key={item.href} className="font-semibold text-foreground">
            {item.label}
          </span>
        ) : (
          <Link key={item.href} href={item.href} className="text-primary underline-offset-4 hover:underline">
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}
