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
      lede="Koins is the crypto bot. It writes plain-English notes about the coins on your paper book. Crypto projections stay paused. Koins does not place a trade."
      body={BOT_GUIDES.koins}
      kind="koins"
      images={[
        { src: "/brand/bot-koins.png", alt: "Illustration of the Koins character" },
        { src: "/brand/bot-koins-fullbody.webp", alt: "Full-length illustration of the Koins character" },
      ]}
      extra={<KoinsSnapshotPrices />}
    />
  );
}
