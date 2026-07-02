import { LOGO_MARK_SVG } from "../../assets/files";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
  wordmarkClassName?: string;
}

/**
 * Aurum Capital brand lockup — candlestick "A" mark + wordmark.
 */
export function BrandLogo({
  className,
  markClassName,
  showWordmark = true,
  wordmarkClassName,
}: BrandLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "grid place-items-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/25 shadow-glow",
          "size-9 p-1.5",
          markClassName
        )}
        dangerouslySetInnerHTML={{ __html: LOGO_MARK_SVG }}
      />
      {showWordmark && (
        <span className={cn("font-display text-[1.05rem] font-bold tracking-tight leading-none", wordmarkClassName)}>
          Aurum<span className="text-primary">.</span>
        </span>
      )}
    </span>
  );
}
