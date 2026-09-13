"use client";

import { Bot3DAvatar } from "@/components/bots/Bot3DAvatar";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Which trolley / forge prop plate to keep behind 3D Smitty */
  sceneSrc?: string;
  alt?: string;
};

/**
 * Homepage Precious Metals hero: keep the gold/silver trolley (or forge) scene,
 * overlay the 3D Smitty avatar so only the character is swapped.
 */
export function SmittyForgeScene({
  className,
  sceneSrc = "/brand/precious-metals-trolley.png",
  alt = "Smitty, AetherForge Precious Metals Manager, with gold and silver at the forge",
}: Props) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-3xl border border-border/70 bg-card shadow-xl",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sceneSrc}
        alt=""
        aria-hidden
        className="block h-auto w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
      <div className="absolute bottom-0 left-1/2 flex h-[78%] w-[52%] max-w-md -translate-x-1/2 items-end justify-center sm:w-[46%]">
        <Bot3DAvatar
          bot="smitty"
          alt={alt}
          className="h-full w-full"
          mediaClassName="drop-shadow-[0_18px_28px_rgba(0,0,0,0.55)]"
          autoRotate
        />
      </div>
    </div>
  );
}

export default SmittyForgeScene;
