"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  /** Optional mascot standing beside / leaning on the title */
  avatarSrc?: string;
  avatarAlt?: string;
  /** lean = back against title; flip = slight bounce/offset for “flipping coins” feel */
  avatarPose?: "lean" | "flip" | "push";
  /** md = default; lg = ~2× for metals / hero section titles */
  avatarSize?: "md" | "lg";
  className?: string;
};

/**
 * Shared dashboard section heading: centered, bold, underlined, uppercase.
 * Optional brand avatar sized for an even, professional page rhythm.
 */
export function DashboardSectionTitle({
  title,
  avatarSrc,
  avatarAlt = "",
  avatarPose = "lean",
  avatarSize = "md",
  className,
}: Props) {
  const poseClass =
    avatarPose === "flip"
      ? "-rotate-6 translate-y-1"
      : avatarPose === "push"
        ? "translate-x-1"
        : "rotate-[-4deg] -translate-x-1 translate-y-0.5";

  const sizeClass =
    avatarSize === "lg"
      ? "relative h-32 w-32 shrink-0 sm:h-40 sm:w-40"
      : "relative h-16 w-16 shrink-0 sm:h-20 sm:w-20";

  return (
    <div className={cn("mb-5 flex items-end justify-center gap-3 sm:gap-4", className)}>
      {avatarSrc ? (
        <div className={cn(sizeClass, poseClass)}>
          <Image
            src={avatarSrc}
            alt={avatarAlt}
            fill
            className="object-contain object-bottom drop-shadow-md"
            sizes={avatarSize === "lg" ? "160px" : "80px"}
            priority={false}
          />
        </div>
      ) : null}
      <h2 className="font-display text-center text-xl font-bold uppercase tracking-wide text-foreground underline decoration-2 underline-offset-8 sm:text-2xl">
        {title}
      </h2>
    </div>
  );
}
