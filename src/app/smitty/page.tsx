import { PublicGuide } from "@/components/public/PublicGuide";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/smitty", {
  title: "Smitty — AetherForge AI",
  description: "Smitty is the metals tracker. Gold and silver spot prices come from gold-api.com.",
});

export default function SmittyPage() {
  return (
    <PublicGuide
      kicker="AetherForge AI · Metals"
      title="Smitty"
      lede="Smitty is the metals tracker, alongside the three AI bots. Gold and silver spot prices come from gold-api.com and are shown in NZD when the foreign-exchange rate is available. Smitty does not place a trade."
      links={[
        {
          href: "/how-it-works",
          title: "How it works",
          body: "Where Smitty sits next to Stox, Koins and The Headmaster.",
        },
        {
          href: "/pricing",
          title: "Pricing",
          body: "Free includes read-only Smitty spot prices.",
        },
      ]}
    />
  );
}
