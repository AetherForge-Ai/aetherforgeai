import { BotGuide } from "@/components/public/BotGuide";
import { BOT_GUIDES } from "@/lib/bot-guides";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/stox", {
  title: "Stox — AetherForge AI",
  description: "Stox is the share-market bot. It writes informational notes about the shares on your paper book.",
});

export default function StoxPage() {
  return (
    <BotGuide
      title="Stox"
      lede="Stox is the share-market bot. It writes plain-English notes about the shares on your paper book. It does not place a trade."
      body={BOT_GUIDES.stox}
      images={[
        { src: "/brand/bot-stox.png", alt: "Illustration of the Stox character" },
        { src: "/brand/bot-stox-fullbody.png", alt: "Full-length illustration of the Stox character" },
      ]}
    />
  );
}
