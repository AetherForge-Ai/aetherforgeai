import { BotGuide } from "@/components/public/BotGuide";
import { KoinsSnapshotPrices } from "@/components/public/KoinsSnapshotPrices";
import { BOT_GUIDES } from "@/lib/bot-guides";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const dynamic = "force-dynamic";

export const metadata = publicPageMetadata("/koins", {
  title: "Koins — AetherForge AI",
  description: "Koins is the crypto bot. It writes informational notes about the coins on your paper book. Crypto projections stay paused.",
});

export default function KoinsPage() {
  return (
    <BotGuide
      title="Koins"
      lede="Koins is the crypto bot. It writes plain-English notes about the coins on your paper book. Koins does not place a trade."
      body={BOT_GUIDES.koins}
      kind="koins"
        screenshots={[{ src: "/screens/demo-book.png", alt: "Screenshot of the read-only example book with synthetic share, crypto, metal and cash rows, and dashes where no price is shown", caption: "Example book. Synthetic rows only.", width: 1200, height: 910 }, { src: "/screens/koins-example.png", alt: "Screenshot of the Koins example book section showing one synthetic EXAMPLE-COIN row and the example Koins note", caption: "Example Koins note. Not a member result.", width: 752, height: 289 }]}
      images={[
        { src: "/brand/bot-koins-fullbody.webp", alt: "Full-length illustration of the Koins character" },
      ]}
      extra={<KoinsSnapshotPrices />}
    />
  );
}
