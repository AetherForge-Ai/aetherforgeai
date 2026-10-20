import { BotGuide } from "@/components/public/BotGuide";
import { BOT_GUIDES } from "@/lib/bot-guides";
import { publicPageMetadata } from "@/lib/reviewed-book";

export const metadata = publicPageMetadata("/smitty", {
  title: "Smitty — AetherForge AI",
  description: "Smitty tracks gold and silver spot prices and holdings. Smitty does not run a report.",
});

export default function SmittyPage() {
  return (
    <BotGuide
      title="Smitty"
      lede="Smitty shows gold and silver spot prices next to the ounces you record."
      body={BOT_GUIDES.smitty}
      kind="smitty"
        screenshots={[{ src: "/screens/demo-book.png", alt: "Screenshot of the read-only example book including a synthetic one-ounce gold row", caption: "Example book. Synthetic rows only.", width: 1200, height: 910 }, { src: "/screens/smitty-example.png", alt: "Screenshot of the Smitty example section showing a synthetic one-ounce gold row and the example Smitty view", caption: "Example Smitty view. Not a member result.", width: 752, height: 289 }]}
      images={[
        { src: "/brand/bot-smitty-fullbody.webp", alt: "Full-length illustration of the Smitty character" },
      ]}
    />
  );
}
