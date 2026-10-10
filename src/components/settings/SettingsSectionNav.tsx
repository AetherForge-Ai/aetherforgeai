import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings", label: "Profile & security", id: "profile" },
  { href: "/settings/billing", label: "Plan & billing", id: "billing" },
  { href: "/settings/notifications", label: "Notifications", id: "notifications" },
] as const;

export function SettingsSectionNav({ current }: { current: (typeof ITEMS)[number]["id"] }) {
  return (
    <nav aria-label="Settings" className="mt-6 flex flex-wrap gap-2">
      {ITEMS.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-semibold",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/70 text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
