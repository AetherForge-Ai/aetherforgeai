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
      ? "hover:border-amber-400/50 hover:bg-amber-400/5"
      : accent === "violet"
        ? "hover:border-violet-400/50 hover:bg-violet-400/5"
        : "hover:border-primary/50 hover:bg-primary/5";

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-5 shadow-sm transition",
        ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-grift-black text-lg tracking-tight text-amber-400 sm:text-xl">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt="" className="h-14 w-auto shrink-0 object-contain" />
        ) : (
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Icon className="size-5" />
          </span>
        )}
      </div>
      <p className="mt-5 font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary">
        Open full overview
        <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
