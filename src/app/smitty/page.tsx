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
      lede="Smitty tracks gold and silver spot prices and holdings. Smitty is not a fourth AI bot and does not run a report."
      body={BOT_GUIDES.smitty}
      images={[
        { src: "/brand/bot-smitty.png", alt: "Illustration of the Smitty character" },
        { src: "/brand/bot-smitty-fullbody.png", alt: "Full-length illustration of the Smitty character" },
      ]}
    />
  );
}
