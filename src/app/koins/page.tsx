import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/koins", {
  title: "Koins — AetherForge AI",
  description: "Koins is the crypto bot. It writes informational notes about the coins on your paper book.",
});

export default function KoinsPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Bots"
      title="Koins"
      lede="Koins is one of the three AI bots. It reads crypto prices and writes plain-English notes about the coins on your paper book. Crypto projections on the projections page are paused. Koins does not place a trade."
      links={[
        {
          href: "/track-record",
          title: "Track record",
          body: "Forecasts Koins shows, once they are on the public log. Crypto projections on the projections page stay paused. The page starts empty.",
        },
        {
          href: "/markets",
          title: "Markets",
          body: "Crypto prices, when that feed answers.",
        },
        {
          href: "/how-it-works",
          title: "How it works",
          body: "How a report is put together, and what you still decide yourself.",
        },
        {
          href: "/pricing",
          title: "Pricing",
          body: "3 reports a month free, no card.",
        },
      ]}
    />
  );
}
