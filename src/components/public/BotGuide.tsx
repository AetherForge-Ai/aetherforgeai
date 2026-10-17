import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/SiteHeader";
import { DisclaimerNotice } from "@/components/legal/DisclaimerNotice";
import { BOT_EXAMPLES, BOT_GUIDE_PARAGRAPHS, BOT_PAGE_NOTES, BOT_PAGE_POSITIONING, type BotGuideKind } from "@/lib/bot-guides";

export function ExampleBook({ kind = "headmaster" }: { kind?: BotGuideKind }) {
  const example = BOT_EXAMPLES[kind];
  return (
    <section className="mt-10" aria-label="Example book">
      <h2 className="font-display text-2xl font-bold">Example book</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Example. Not a member book. These rows are synthetic, so no market value and no profit are shown.
      </p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 font-medium">Name</th>
            <th scope="col" className="py-2 font-medium">Quantity</th>
            <th scope="col" className="py-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {example.rows.map((row) => (
            <tr key={row.name} className="border-b border-border/40 last:border-0">
              <td className="py-2">{row.name}</td>
              <td className="py-2">{row.quantity}</td>
              <td className="py-2">{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 className="mt-6 font-display text-lg font-semibold">Example report</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{example.report}</p>
    </section>
  );
}

export function BotGuide({
  title,
  lede,
  body,
  images,
  extra,
  kind,
}: {
  title: string;
  lede: string;
  body: string;
  images: { src: string; alt: string }[];
  extra?: ReactNode;
  kind?: BotGuideKind;
}) {
  const paragraphs: readonly string[] = kind ? BOT_GUIDE_PARAGRAPHS[kind] : body.split(/(?<=\.)\s+/);
  return (
    <div className="relative min-h-screen bg-grid">
      <div className="pointer-events-none absolute inset-0 bg-aurora" />
      <div className="relative">
        <SiteHeader />
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">AetherForge AI</p>
          <h1 className="mt-3 font-display text-4xl font-bold">{title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{lede}</p>
          {/* b6 M-3: transparent cut-outs only. No mask, opacity or blend mode, so faces and hands render solid. */}
          <div className={cn("mt-8 grid gap-4", images.length > 1 ? "sm:grid-cols-2" : "mx-auto max-w-sm")}>
            {images.map((image) => (
              <Image key={image.src} src={image.src} alt={image.alt} width={512} height={512} className="h-auto w-full object-contain" />
            ))}
          </div>
          <div className="mt-8 space-y-4 text-sm leading-relaxed text-muted-foreground">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </div>
          {extra}
          <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
            {kind ? `${BOT_PAGE_NOTES[kind]} ` : null}
            {BOT_PAGE_POSITIONING}{" "}
            <Link href="/how-it-works" className="font-medium text-primary underline-offset-2 hover:underline">
              How the paper book works
            </Link>
            .
          </p>
          <ExampleBook kind={kind} />
          <p className="mt-8 text-sm">
            <Link href="/how-it-works" className="font-semibold text-primary underline-offset-2 hover:underline">
              How it works
            </Link>
          </p>
          <DisclaimerNotice variant="full" className="mt-10" />
        </article>
      </div>
    </div>
  );
}
