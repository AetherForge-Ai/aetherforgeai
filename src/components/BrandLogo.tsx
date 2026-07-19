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
 * (blue + gold) paired with the gradient wordmark. The colourful shield sits in
 * a subtle navy tile so it reads clearly on any dark surface. Pass `animated`
 * for a pulsing glow on prominent placements (hero, headers).
 */
export function BrandLogo({
  className,
  markClassName,
  showWordmark = true,
  wordmarkClassName,
  animated = false,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "relative grid place-items-center rounded-xl ring-1 ring-white/10 shadow-brand",
          "bg-gradient-to-br from-white/[0.07] via-white/[0.02] to-transparent",
          "size-9 p-1",
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
            "font-display text-[1.05rem] font-bold tracking-tight leading-none",
            wordmarkClassName
          )}
        >
          AetherForge<span className="text-primary"> AI</span>
        </span>
      )}
    </span>
  );
}
