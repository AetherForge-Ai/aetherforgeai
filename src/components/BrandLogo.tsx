import { LOGO_MARK_SVG } from "../../assets/files";
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
 * AetherForge AI brand lockup — hexagonal forge mark + gradient wordmark.
 * Pass `animated` for a pulsing glow on prominent placements (hero, headers).
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
          "relative grid place-items-center rounded-xl text-primary ring-1 ring-primary/30 shadow-glow",
          "bg-gradient-to-br from-primary/18 via-primary/8 to-transparent",
          "size-9 p-1.5",
          animated && "animate-logo-pulse",
          markClassName
        )}
        dangerouslySetInnerHTML={{ __html: LOGO_MARK_SVG }}
      />
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
