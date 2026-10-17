import { BotGuide } from "@/components/public/BotGuide";
import { StoxReviewNotice } from "@/components/public/StoxReviewNotice";
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
      kind="stox"
        screenshots={[{ src: "/screens/demo-book.png", alt: "Screenshot of the read-only example book with synthetic NZX, ASX, crypto, metal and cash rows, and dashes where no price is shown", caption: "Example book. Synthetic rows only.", width: 1200, height: 910 }, { src: "/screens/stox-example.png", alt: "Screenshot of the Stox example book section showing one synthetic EXAMPLE.NZ row and the example Stox note", caption: "Example Stox note. Not a member result.", width: 752, height: 289 }]}
      images={[
        { src: "/brand/bot-stox-fullbody.webp", alt: "Full-length illustration of the Stox character" },
      ]}
      extra={<StoxReviewNotice />}
    />
  );
}
