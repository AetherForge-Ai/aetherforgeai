"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function OverviewHubCard({
  href,
  title,
  subtitle,
  value,
  meta,
  icon: Icon,
  avatarSrc,
  accent = "primary",
}: {
  href: string;
  title: string;
  subtitle: string;
  value: string;
  meta: string;
  icon: LucideIcon;
  avatarSrc?: string;
  accent?: "primary" | "amber" | "violet";
}) {
  const ring =
    accent === "amber"
      ? "border-amber-400/25 hover:border-amber-400/55 hover:bg-amber-400/[0.06]"
      : accent === "violet"
        ? "border-violet-400/25 hover:border-violet-400/55 hover:bg-violet-400/[0.06]"
        : "border-primary/20 hover:border-primary/50 hover:bg-primary/[0.06]";

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-card/70 p-5 shadow-sm transition duration-200",
        "ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-md",
        ring,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400/80 via-amber-300/40 to-transparent opacity-80" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-grift-black text-lg leading-snug tracking-tight text-amber-400 sm:text-xl">
            {title}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt="" className="h-16 w-auto shrink-0 object-contain drop-shadow-sm" />
        ) : (
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Icon className="size-5" />
          </span>
        )}
      </div>
      <div className="mt-auto pt-6">
        <p className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
          Open full overview
          <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
