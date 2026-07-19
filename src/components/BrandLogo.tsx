import { LOGO_MARK_IMG } from "../../assets/files";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  /** Adds an animated glow pulse to the mark for hero / standout placements. */
  animated?: boolean;
}

/**
 * AetherForge AI brand lockup — the official Forge Intelligence shield mark
 * (blue + gold) paired with the geometric wordmark. Styled to match the
 * official FORGE INTELLIGENCE logo typography (bold geometric sans, tight
 * tracking on the primary name). Pass `animated` for a pulsing glow on
 * prominent placements (hero, headers).
 */
export function BrandLogo({
  className,
  markClassName,
  showWordmark = true,
  wordmarkClassName,
  animated = false,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        className={cn(
          "relative grid place-items-center rounded-xl ring-1 ring-white/10 shadow-brand",
          "bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent",
          // Slightly larger default mark so the shield reads clearly in the top nav
          "size-11 p-1.5",
          animated && "animate-logo-pulse",
          markClassName
        )}
      >
        <img
          src={LOGO_MARK_IMG}
          alt="AetherForge AI"
          className="h-full w-full object-contain drop-shadow-[0_1px_4px_rgba(40,110,220,0.35)]"
          draggable={false}
        />
      </span>
      {showWordmark && (
        <span
          className={cn(
            // Match the official FORGE INTELLIGENCE lockup: geometric display
            // sans, heavy weight, tight tracking on the primary name.
            "font-display text-[1.2rem] font-extrabold tracking-[-0.02em] leading-none",
            wordmarkClassName
          )}
        >
          AetherForge<span className="text-primary"> AI</span>
        </span>
      )}
    </span>
  );
}
