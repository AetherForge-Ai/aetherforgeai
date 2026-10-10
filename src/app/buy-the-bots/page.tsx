import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/buy-the-bots", {
  title: "The bots — AetherForge AI",
  description: "Stox, Koins and The Headmaster are included with a plan. There is no separate bot purchase.",
});

export default function BuyTheBotsPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Bots"
      title="The bots"
      lede="Stox, Koins and The Headmaster are part of a plan. There is no separate checkout to buy a bot. Smitty, the metals tracker, is included as read-only spot prices on Free."
      links={[
        {
          href: "/pricing",
          title: "Pricing",
          body: "Free, Starter, Pro and Ultimate. 3 reports a month free, no card.",
        },
        {
          href: "/stox",
          title: "Stox",
          body: "The share-market bot.",
        },
        {
          href: "/koins",
          title: "Koins",
          body: "The crypto bot.",
        },
        {
          href: "/smitty",
          title: "Smitty",
          body: "The metals tracker.",
        },
      ]}
    />
  );
}
