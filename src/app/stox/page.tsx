import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/stox", {
  title: "Stox — AetherForge AI",
  description: "Stox is the share-market bot. It writes informational notes about the shares on your paper book.",
});

export default function StoxPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Bots"
      title="Stox"
      lede="Stox is one of the three AI bots. It reads NZX, ASX and US share prices and writes plain-English notes about the shares on your paper book. It does not place a trade."
      links={[
        {
          href: "/track-record",
          title: "Track record",
          body: "Forecasts Stox shows, and the later price, once they are on the public log. The page starts empty.",
        },
        {
          href: "/markets",
          title: "Markets",
          body: "Share prices for NZX, ASX and US lists, when the feed answers.",
        },
        {
          href: "/how-it-works",
          title: "How it works",
          body: "How a report is put together, and what you still decide yourself.",
        },
        {
          href: "/pricing",
          title: "Pricing",
          body: "3 reports a month free, no card. Paid plans add Stox with Koins.",
        },
      ]}
    />
  );
}
